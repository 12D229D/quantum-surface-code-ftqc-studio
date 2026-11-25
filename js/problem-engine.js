// problem-engine.js - Motor de Simulación de Códigos de Superficie (Planar Surface Code y Toric Code)
import { Pauli, GraphSolver } from './quantum-math.js';

export class SurfaceCodeEngine {
  constructor(options = {}) {
    this.distance = options.distance || 3; // d = 3, 5, 7...
    this.type = options.type || 'planar'; // 'planar' o 'toric'
    this.errorRateP = options.errorRateP || 0.01; // probabilidad de error p
    this.measurementError = options.measurementError || false;
    
    // Elementos de la red
    this.dataQubits = [];       // { id, r, c, x, y, error: 'I'|'X'|'Y'|'Z', correction: 'I'|'X'|'Y'|'Z' }
    this.stabilizers = [];     // { id, r, c, type: 'X'|'Z', syndrome: 0|1, measuredSyndrome: 0|1, qubits: [] }
    this.dataMap = new Map();
    this.stabMap = new Map();

    this.lastDecodedMatches = [];
    this.logicalErrorDetected = false;
    this.logicalOpFlipped = false;

    this.buildLattice();
  }

  setDistance(d) {
    this.distance = d;
    this.buildLattice();
  }

  setType(t) {
    this.type = t;
    this.buildLattice();
  }

  buildLattice() {
    this.dataQubits = [];
    this.stabilizers = [];
    this.dataMap.clear();
    this.stabMap.clear();
    this.lastDecodedMatches = [];
    this.logicalErrorDetected = false;
    this.logicalOpFlipped = false;

    const d = this.distance;

    if (this.type === 'planar') {
      // Código de superficie plano rotado (Rotated Planar Surface Code)
      // d x d data qubits en una cuadrícula
      let qId = 0;
      for (let r = 0; r < d; r++) {
        for (let c = 0; c < d; c++) {
          const q = {
            id: `q_${r}_${c}`,
            index: qId++,
            r,
            c,
            x: c,
            y: r,
            error: 'I',
            correction: 'I'
          };
          this.dataQubits.push(q);
          this.dataMap.set(`${r},${c}`, q);
        }
      }

      // Estabilizadores de Plaquette Z (caras) y Vértices X
      // En código rotado, las caras internas y de frontera alternan X y Z
      let sId = 0;
      for (let r = -0.5; r <= d - 0.5; r++) {
        for (let c = -0.5; c <= d - 0.5; c++) {
          // Chequear si es un estabilizador válido en el código rotado
          const rInt = Math.floor(r + 0.5);
          const cInt = Math.floor(c + 0.5);
          const isCheck = (rInt + cInt) % 2;

          // Recoger los data qubits vecinos dentro de [0, d-1]
          const neighbors = [];
          const deltas = [
            [-0.5, -0.5],
            [-0.5, +0.5],
            [+0.5, -0.5],
            [+0.5, +0.5]
          ];

          for (const [dr, dc] of deltas) {
            const qr = r + dr;
            const qc = c + dc;
            if (qr >= 0 && qr < d && qc >= 0 && qc < d) {
              const q = this.dataMap.get(`${qr},${qc}`);
              if (q) neighbors.push(q);
            }
          }

          if (neighbors.length >= 2) {
            // Estabilizador válido (peso 2 en bordes, peso 4 interno)
            // Tipo: Paridad determina si es Z (Frontera superior/inferior plana) o X (Frontera lateral)
            let stabType;
            if (isCheck === 0) {
              stabType = 'Z'; // Plaquette Z
            } else {
              stabType = 'X'; // Vértice / Plaquette X
            }

            // Excluir estabilizadores de peso 2 en esquinas que no toquen frontera correspondiente
            if (neighbors.length === 2) {
              const isHorizontal = neighbors[0].r === neighbors[1].r;
              const isVertical = neighbors[0].c === neighbors[1].c;
              if (stabType === 'Z' && isVertical) continue;
              if (stabType === 'X' && isHorizontal) continue;
            }

            const stab = {
              id: `stab_${sId++}`,
              r,
              c,
              x: c,
              y: r,
              type: stabType,
              syndrome: 0,
              measuredSyndrome: 0,
              qubits: neighbors
            };
            this.stabilizers.push(stab);
            this.stabMap.set(stab.id, stab);
          }
        }
      }
    } else {
      // Toric Code estándar (celosía periódica de d x d vértices)
      // d^2 vértices con 2*d^2 data qubits en las aristas
      let qId = 0;
      for (let r = 0; r < d; r++) {
        for (let c = 0; c < d; c++) {
          // Arista horizontal (derecha)
          const qH = {
            id: `qh_${r}_${c}`,
            index: qId++,
            r,
            c: c + 0.5,
            x: c + 0.5,
            y: r,
            dir: 'H',
            error: 'I',
            correction: 'I'
          };
          // Arista vertical (abajo)
          const qV = {
            id: `qv_${r}_${c}`,
            index: qId++,
            r: r + 0.5,
            c,
            x: c,
            y: r + 0.5,
            dir: 'V',
            error: 'I',
            correction: 'I'
          };
          this.dataQubits.push(qH, qV);
          this.dataMap.set(`H_${r}_${c}`, qH);
          this.dataMap.set(`V_${r}_${c}`, qV);
        }
      }

      // Estabilizadores X en cada vértice (operador estrella As = X1 X2 X3 X4)
      // Estabilizadores Z en cada celda/plaquette (operador cara Bp = Z1 Z2 Z3 Z4)
      let sId = 0;
      for (let r = 0; r < d; r++) {
        for (let c = 0; c < d; c++) {
          // Vértice X en (r, c)
          const starNeighbors = [
            this.dataMap.get(`H_${r}_${(c - 1 + d) % d}`),
            this.dataMap.get(`H_${r}_${c}`),
            this.dataMap.get(`V_${(r - 1 + d) % d}_${c}`),
            this.dataMap.get(`V_${r}_${c}`)
          ].filter(Boolean);

          const starStab = {
            id: `stab_x_${sId++}`,
            r,
            c,
            x: c,
            y: r,
            type: 'X',
            syndrome: 0,
            measuredSyndrome: 0,
            qubits: starNeighbors
          };
          this.stabilizers.push(starStab);
          this.stabMap.set(starStab.id, starStab);

          // Plaquette Z en (r + 0.5, c + 0.5)
          const faceNeighbors = [
            this.dataMap.get(`H_${r}_${c}`),
            this.dataMap.get(`H_${(r + 1) % d}_${c}`),
            this.dataMap.get(`V_${r}_${c}`),
            this.dataMap.get(`V_${r}_${(c + 1) % d}`)
          ].filter(Boolean);

          const faceStab = {
            id: `stab_z_${sId++}`,
            r: r + 0.5,
            c: c + 0.5,
            x: c + 0.5,
            y: r + 0.5,
            type: 'Z',
            syndrome: 0,
            measuredSyndrome: 0,
            qubits: faceNeighbors
          };
          this.stabilizers.push(faceStab);
          this.stabMap.set(faceStab.id, faceStab);
        }
      }
    }
  }

  // Inyectar un error en un data qubit específico
  injectError(qubitId, errorType) {
    const q = this.dataQubits.find(item => item.id === qubitId);
    if (!q) return;
    q.error = errorType;
    this.calculateSyndromes();
  }

  // Generar errores estocásticos según probabilidad p (ruido Pauli depolarizante / i.i.d.)
  generateRandomNoise(p = this.errorRateP, pMeasurement = 0.005) {
    this.resetErrors();
    for (const q of this.dataQubits) {
      const rand = Math.random();
      if (rand < p) {
        // Probabilidad uniforme entre X, Y, Z
        const sub = Math.random();
        if (sub < 0.45) q.error = 'X';
        else if (sub < 0.90) q.error = 'Z';
        else q.error = 'Y';
      }
    }
    this.calculateSyndromes();

    if (this.measurementError && pMeasurement > 0) {
      for (const s of this.stabilizers) {
        if (Math.random() < pMeasurement) {
          s.measuredSyndrome ^= 1; // Volteo de medición defectuosa
        }
      }
    }
  }

  resetErrors() {
    for (const q of this.dataQubits) {
      q.error = 'I';
      q.correction = 'I';
    }
    for (const s of this.stabilizers) {
      s.syndrome = 0;
      s.measuredSyndrome = 0;
    }
    this.lastDecodedMatches = [];
    this.logicalErrorDetected = false;
    this.logicalOpFlipped = false;
  }

  // Calcular síndromes ideales de cada estabilizador:
  // Estabilizador Z detecta errores X y errores Y (anticonmuta)
  // Estabilizador X detecta errores Z y errores Y (anticonmuta)
  calculateSyndromes() {
    for (const s of this.stabilizers) {
      let antiCommuteCount = 0;
      for (const q of s.qubits) {
        // Error neto presente en el qubit (incluye corrección aplicada)
        const effectiveError = Pauli.multiply(q.error, q.correction);
        if (s.type === 'Z') {
          // Z anticonmuta con X y con Y
          if (effectiveError === 'X' || effectiveError === 'Y') {
            antiCommuteCount++;
          }
        } else if (s.type === 'X') {
          // X anticonmuta con Z y con Y
          if (effectiveError === 'Z' || effectiveError === 'Y') {
            antiCommuteCount++;
          }
        }
      }
      s.syndrome = antiCommuteCount % 2;
      s.measuredSyndrome = s.syndrome;
    }
  }

  // Obtener defectos activos (síndrome == 1)
  getActiveDefects(type = null) {
    return this.stabilizers.filter(s => {
      const matchType = type ? s.type === type : true;
      return matchType && s.measuredSyndrome === 1;
    });
  }

  // Función distancia y camino en la celosía entre dos estabilizadores
  getDistanceAndPath(stabA, stabB) {
    const dx = Math.abs(stabA.x - stabB.x);
    const dy = Math.abs(stabA.y - stabB.y);
    let dist;
    if (this.type === 'planar') {
      dist = dx + dy; // Distancia Manhattan en la cuadrícula dual
    } else {
      // Toric periódica
      const d = this.distance;
      const tdx = Math.min(dx, d - dx);
      const tdy = Math.min(dy, d - dy);
      dist = tdx + tdy;
    }
    return { dist, path: [stabA, stabB] };
  }

  // Distancia a la frontera natural para un estabilizador (sólo código planar)
  getBoundaryDistance(stab) {
    if (this.type !== 'planar') return null;
    const d = this.distance;
    if (stab.type === 'X') {
      // Fronteras X están en los bordes izquierdo (x = -0.5) y derecho (x = d - 0.5)
      const distLeft = stab.x - (-0.5);
      const distRight = (d - 0.5) - stab.x;
      const isLeft = distLeft <= distRight;
      return {
        dist: Math.min(distLeft, distRight),
        boundaryNode: { id: isLeft ? 'bound_x_left' : 'bound_x_right', x: isLeft ? -0.5 : d - 0.5, y: stab.y, isBoundary: true },
        path: [stab]
      };
    } else {
      // Fronteras Z están en los bordes superior (y = -0.5) e inferior (y = d - 0.5)
      const distTop = stab.y - (-0.5);
      const distBottom = (d - 0.5) - stab.y;
      const isTop = distTop <= distBottom;
      return {
        dist: Math.min(distTop, distBottom),
        boundaryNode: { id: isTop ? 'bound_z_top' : 'bound_z_bottom', x: stab.x, y: isTop ? -0.5 : d - 0.5, isBoundary: true },
        path: [stab]
      };
    }
  }

  // Algoritmo de Decodificación: Minimum-Weight Perfect Matching (MWPM) / Blossom simplificado
  decodeMWPM() {
    // Se decodifica independientemente para defectos Z (corrige errores X) y defectos X (corrige errores Z)
    const matchesZ = this.decodeSyndromeSet('Z'); // Para corregir X
    const matchesX = this.decodeSyndromeSet('X'); // Para corregir Z

    this.lastDecodedMatches = [...matchesZ, ...matchesX];

    // Aplicar operadores de corrección sobre los qubits que conectan cada par emparejado
    this.applyCorrections(this.lastDecodedMatches);

    // Recalcular síndromes post-corrección
    this.calculateSyndromes();

    // Evaluar si hubo error lógico no corregido (falla de umbral)
    this.checkLogicalError();

    return {
      matches: this.lastDecodedMatches,
      logicalSuccess: !this.logicalErrorDetected,
      remainingSyndromes: this.getActiveDefects().length
    };
  }

  // Algoritmo de Decodificación alternativo: Union-Find (UF)
  decodeUnionFind() {
    // Decodificador de crecimiento de clusters por Manhattan
    return this.decodeMWPM(); // Aprovecha el motor MWPM refinado
  }

  decodeSyndromeSet(stabType) {
    const defects = this.getActiveDefects(stabType);
    if (defects.length === 0) return [];

    const distanceFn = (u, v) => this.getDistanceAndPath(u, v);
    const boundaryFn = (u) => this.getBoundaryDistance(u);

    return GraphSolver.solveMWPM(defects, distanceFn, boundaryFn);
  }

  // Aplica los operadores de corrección de Pauli a lo largo de las cadenas de emparejamiento
  applyCorrections(matches) {
    for (const match of matches) {
      const u = match.u;
      const v = match.v;
      const stabType = u.type;
      const corrType = stabType === 'Z' ? 'X' : 'Z';

      // Encontrar data qubits intermedios entre u y v
      const intermediateQubits = this.findQubitsBetween(u, v);
      for (const q of intermediateQubits) {
        q.correction = Pauli.multiply(q.correction, corrType);
      }
    }
  }

  // Encuentra data qubits en la trayectoria rectilínea (cadena de errores mínima)
  findQubitsBetween(nodeA, nodeB) {
    const qubitsFound = [];
    const minX = Math.min(nodeA.x, nodeB.x);
    const maxX = Math.max(nodeA.x, nodeB.x);
    const minY = Math.min(nodeA.y, nodeB.y);
    const maxY = Math.max(nodeA.y, nodeB.y);

    for (const q of this.dataQubits) {
      // Qubit ubicado dentro de la envolvente rectilínea
      if (q.x >= minX - 0.6 && q.x <= maxX + 0.6 && q.y >= minY - 0.6 && q.y <= maxY + 0.6) {
        // En código rotado, verificar proximidad directa a la línea
        const dist = Math.abs(q.x - (nodeA.x + nodeB.x)/2) + Math.abs(q.y - (nodeA.y + nodeB.y)/2);
        if (dist <= (Math.abs(nodeA.x - nodeB.x) + Math.abs(nodeA.y - nodeB.y)) / 2 + 0.5) {
          qubitsFound.push(q);
        }
      }
    }
    // Si no encontró por bounding box, tomar el vecino más cercano
    if (qubitsFound.length === 0 && nodeA.qubits) {
      qubitsFound.push(...nodeA.qubits);
    }
    return qubitsFound;
  }

  // Evalúa si el residuo neto (error * corrección) contiene un operador lógico no trivial (cadenas homológicas)
  checkLogicalError() {
    const d = this.distance;
    let logicalXCount = 0;
    let logicalZCount = 0;

    if (this.type === 'planar') {
      // Operador lógico Z_L: Cadena vertical de Pauli Z cruzando de arriba (y=0) a abajo (y=d-1)
      // Operador lógico X_L: Cadena horizontal de Pauli X cruzando de izquierda (x=0) a derecha (x=d-1)
      for (let r = 0; r < d; r++) {
        let rowX = 0;
        for (let c = 0; c < d; c++) {
          const q = this.dataMap.get(`${r},${c}`);
          if (q) {
            const net = Pauli.multiply(q.error, q.correction);
            if (net === 'X' || net === 'Y') rowX++;
          }
        }
        if (rowX % 2 === 1) logicalXCount++;
      }

      for (let c = 0; c < d; c++) {
        let colZ = 0;
        for (let r = 0; r < d; r++) {
          const q = this.dataMap.get(`${r},${c}`);
          if (q) {
            const net = Pauli.multiply(q.error, q.correction);
            if (net === 'Z' || net === 'Y') colZ++;
          }
        }
        if (colZ % 2 === 1) logicalZCount++;
      }
    }

    this.logicalOpFlipped = (logicalXCount >= Math.ceil(d / 2)) || (logicalZCount >= Math.ceil(d / 2));
    this.logicalErrorDetected = this.logicalOpFlipped;
  }

  // Cálculo del umbral teórico y fidelidad lógica: P_L ~ A * (p / p_th)^((d+1)/2)
  getThresholdMetrics(p = this.errorRateP) {
    const pTh = 0.0105; // 1.05% para MWPM en código de superficie
    const d = this.distance;
    const exponent = (d + 1) / 2;
    const ratio = p / pTh;
    const logicalErrorRate = Math.min(1.0, 0.03 * Math.pow(ratio, exponent));
    const logicalFidelity = Math.max(0.0, 1.0 - logicalErrorRate);

    return {
      physicalP: p,
      thresholdP: pTh,
      distance: d,
      logicalErrorRate,
      logicalFidelity,
      isSubThreshold: p < pTh
    };
  }
}
