// quantum-math.js - Módulo de álgebra cuántica, operadores de Pauli y grafos para Códigos de Superficie FTQC
export class Pauli {
  static I = { name: 'I', char: 'I', phase: 0 };
  static X = { name: 'X', char: 'X', phase: 0 };
  static Y = { name: 'Y', char: 'Y', phase: 1 }; // iXZ
  static Z = { name: 'Z', char: 'Z', phase: 0 };

  static multiply(p1, p2) {
    if (p1 === 'I') return p2;
    if (p2 === 'I') return p1;
    if (p1 === p2) return 'I';
    if (p1 === 'X' && p2 === 'Z') return 'Y';
    if (p1 === 'Z' && p2 === 'X') return 'Y';
    if (p1 === 'X' && p2 === 'Y') return 'Z';
    if (p1 === 'Y' && p2 === 'X') return 'Z';
    if (p1 === 'Y' && p2 === 'Z') return 'X';
    if (p1 === 'Z' && p2 === 'Y') return 'X';
    return 'I';
  }

  static commutes(p1, p2) {
    if (p1 === 'I' || p2 === 'I') return true;
    return p1 === p2;
  }
}

// Estructura de Disjoint Set Union (DSU / Union-Find) para decodificador Union-Find
export class DisjointSetUnion {
  constructor(size) {
    this.parent = new Int32Array(size);
    this.rank = new Int32Array(size);
    this.parity = new Uint8Array(size); // 1 si el cluster tiene número impar de defectos
    this.boundaryDist = new Float32Array(size); // distancia al borde más cercano
    this.boundaryNode = new Int32Array(size); // id del nodo de borde asociado
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
      this.rank[i] = 0;
      this.parity[i] = 0;
      this.boundaryDist[i] = Infinity;
      this.boundaryNode[i] = -1;
    }
  }

  find(i) {
    let root = i;
    while (root !== this.parent[root]) {
      root = this.parent[root];
    }
    let curr = i;
    while (curr !== root) {
      let nxt = this.parent[curr];
      this.parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  union(i, j) {
    let rootI = this.find(i);
    let rootJ = this.find(j);
    if (rootI === rootJ) return rootI;

    if (this.rank[rootI] < this.rank[rootJ]) {
      [rootI, rootJ] = [rootJ, rootI];
    }
    this.parent[rootJ] = rootI;
    if (this.rank[rootI] === this.rank[rootJ]) {
      this.rank[rootI]++;
    }
    // Combinar paridad de defectos (XOR)
    this.parity[rootI] ^= this.parity[rootJ];
    if (this.boundaryDist[rootJ] < this.boundaryDist[rootI]) {
      this.boundaryDist[rootI] = this.boundaryDist[rootJ];
      this.boundaryNode[rootI] = this.boundaryNode[rootJ];
    }
    return rootI;
  }
}

// Algoritmo Dijkstra / BFS en grafo de decodificación
export class GraphSolver {
  static shortestPath(graph, startId, targetId) {
    const distances = new Map();
    const previous = new Map();
    const queue = [{ id: startId, dist: 0 }];
    distances.set(startId, 0);

    while (queue.length > 0) {
      queue.sort((a, b) => a.dist - b.dist);
      const { id: u, dist } = queue.shift();

      if (u === targetId) break;
      if (dist > distances.get(u)) continue;

      const neighbors = graph.getNeighbors(u);
      for (const edge of neighbors) {
        const v = edge.to;
        const weight = edge.weight || 1;
        const alt = dist + weight;
        if (!distances.has(v) || alt < distances.get(v)) {
          distances.set(v, alt);
          previous.set(v, { from: u, edge });
          queue.push({ id: v, dist: alt });
        }
      }
    }

    // Reconstruir camino
    const path = [];
    let curr = targetId;
    while (previous.has(curr)) {
      const step = previous.get(curr);
      path.unshift(step.edge);
      curr = step.from;
    }
    return { path, distance: distances.get(targetId) ?? Infinity };
  }

  // Minimum Weight Perfect Matching voraz / Blossom simplificado para sindromes de códigos de superficie
  static solveMWPM(syndromeNodes, distanceMatrixFn, boundaryFn = null) {
    // syndromeNodes: array de IDs de estabilizadores defectuosos
    // distanceMatrixFn(u, v): devuelve { dist, path }
    // boundaryFn(u): devuelve { dist, boundaryNode, path }
    if (syndromeNodes.length === 0) return [];

    let unmatched = [...syndromeNodes];
    const matchings = [];

    // Calcular todas las distancias entre pares de defectos y con límites
    const pairs = [];
    for (let i = 0; i < unmatched.length; i++) {
      for (let j = i + 1; j < unmatched.length; j++) {
        const u = unmatched[i];
        const v = unmatched[j];
        const res = distanceMatrixFn(u, v);
        pairs.push({ u, v, dist: res.dist, path: res.path, type: 'pair' });
      }
      if (boundaryFn) {
        const u = unmatched[i];
        const bRes = boundaryFn(u);
        if (bRes) {
          pairs.push({ u, v: bRes.boundaryNode, dist: bRes.dist, path: bRes.path, type: 'boundary' });
        }
      }
    }

    // Ordenar por distancia mínima (algoritmo Blossom Voraz optimizado para celosía 2D)
    pairs.sort((a, b) => a.dist - b.dist);

    const matchedSet = new Set();
    for (const p of pairs) {
      if (p.type === 'pair') {
        if (!matchedSet.has(p.u) && !matchedSet.has(p.v)) {
          matchedSet.add(p.u);
          matchedSet.add(p.v);
          matchings.push(p);
        }
      } else if (p.type === 'boundary') {
        if (!matchedSet.has(p.u)) {
          matchedSet.add(p.u);
          matchings.push(p);
        }
      }
    }

    return matchings;
  }
}
