// app.js - Controlador Principal e Interfaz de Usuario de Quantum Surface Code & FTQC Studio
import { SurfaceCodeEngine } from './problem-engine.js';
import { QasmBridge } from './qasm-bridge.js';
import { HybridClient } from './hybrid-client.js';
import { QuantumStorage } from './db.js';

class SurfaceCodeApp {
  constructor() {
    this.engine = new SurfaceCodeEngine({ distance: 3, type: 'planar', errorRateP: 0.01 });
    this.hybridClient = new HybridClient();
    this.storage = new QuantumStorage();

    this.canvas = document.getElementById('latticeCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.tooltip = document.getElementById('latticeTooltip');

    this.hoveredObject = null;
    this.activeTab = 'tab-stim';

    this.initEventListeners();
    this.resizeCanvas();
    this.render();
    this.updateExports();
    this.updateMetrics();
    this.renderHistory();
  }

  initEventListeners() {
    // Configuración de arquitectura
    document.getElementById('codeType').addEventListener('change', (e) => {
      this.engine.setType(e.target.value);
      this.render();
      this.updateExports();
      this.updateMetrics();
    });

    document.getElementById('codeDistance').addEventListener('change', (e) => {
      const d = parseInt(e.target.value, 10);
      document.getElementById('distVal').textContent = `d = ${d}`;
      this.engine.setDistance(d);
      this.render();
      this.updateExports();
      this.updateMetrics();
    });

    // Slider de tasa de error
    const errorSlider = document.getElementById('errorRateSlider');
    errorSlider.addEventListener('input', (e) => {
      const pPercent = parseFloat(e.target.value);
      const p = pPercent / 100;
      this.engine.errorRateP = p;
      document.getElementById('errorRateVal').textContent = `${pPercent.toFixed(1)}%`;
      this.updateMetrics();
    });

    document.getElementById('measNoiseCheck').addEventListener('change', (e) => {
      this.engine.measurementError = e.target.checked;
    });

    // Inyector aleatorio y reset
    document.getElementById('btnInjectRandom').addEventListener('click', () => {
      this.engine.generateRandomNoise();
      this.render();
      this.updateMetrics();
      this.updateExports();
    });

    document.getElementById('btnClearErrors').addEventListener('click', () => {
      this.engine.resetErrors();
      this.render();
      this.updateMetrics();
      this.updateExports();
    });

    // Decodificación
    document.getElementById('btnDecode').addEventListener('click', () => {
      const algo = document.getElementById('decoderAlgorithm').value;
      let res;
      if (algo === 'mwpm') {
        res = this.engine.decodeMWPM();
      } else {
        res = this.engine.decodeUnionFind();
      }

      this.render();
      this.updateMetrics();
      this.updateExports();

      // Guardar en persistencia SQLite / LocalStorage
      const record = {
        distance: this.engine.distance,
        type: this.engine.type,
        errorRate: this.engine.errorRateP,
        syndromesCount: res.matches.length,
        matchesCount: res.matches.length,
        logicalSuccess: res.logicalSuccess
      };
      this.storage.saveExecution(record);
      this.renderHistory();
    });

    // Dispatch Cloud / Pre-Simulador FinOps
    document.getElementById('btnDispatchCloud').addEventListener('click', async () => {
      const btn = document.getElementById('btnDispatchCloud');
      const target = document.getElementById('cloudTarget').value;
      this.hybridClient.setProvider(target);

      btn.disabled = true;
      btn.textContent = 'Enviando a Ejecución...';

      try {
        const result = await this.hybridClient.dispatchJob({}, (status) => {
          btn.textContent = `Progreso: ${status.status} (${status.progress}%)`;
        });
        alert(`¡Ejecución Cuántica Exitosa!\n\nBackend: ${result.backend}\nJob ID: ${result.jobId}\nCosto FinOps: ${result.costEstimate}`);
      } catch (err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Enviar a Motor Cuántico';
      }
    });

    // Tabs de exportación
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tabId = btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        this.activeTab = tabId;
      });
    });

    // Botón copiar código
    document.getElementById('btnCopyCode').addEventListener('click', () => {
      let codeToCopy = '';
      if (this.activeTab === 'tab-stim') {
        codeToCopy = document.getElementById('stimCodeArea').textContent;
      } else if (this.activeTab === 'tab-qasm') {
        codeToCopy = document.getElementById('qasmCodeArea').textContent;
      } else {
        codeToCopy = document.getElementById('qiskitCodeArea').textContent;
      }
      navigator.clipboard.writeText(codeToCopy).then(() => {
        const copyBtn = document.getElementById('btnCopyCode');
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '¡Copiado con Éxito!';
        setTimeout(() => { copyBtn.textContent = originalText; }, 1800);
      });
    });

    // Interacción interactiva con el canvas (clic y hover)
    this.canvas.addEventListener('mousemove', (e) => this.handleCanvasHover(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredObject = null;
      this.tooltip.style.display = 'none';
      this.render();
    });
    this.canvas.addEventListener('click', (e) => this.handleCanvasClick(e));

    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.render();
    });
  }

  resizeCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const width = Math.min(800, Math.max(480, rect.width - 20));
    const height = Math.min(650, Math.max(420, rect.height - 20));
    this.canvas.width = width;
    this.canvas.height = height;
  }

  // Mapear coordenadas de la celosía cuántica a píxeles en el canvas
  getLatticeTransform() {
    const d = this.engine.distance;
    const padding = 70;
    const scaleX = (this.canvas.width - padding * 2) / (d - 1 || 1);
    const scaleY = (this.canvas.height - padding * 2) / (d - 1 || 1);
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (this.canvas.width - (d - 1) * scale) / 2;
    const offsetY = (this.canvas.height - (d - 1) * scale) / 2;

    return {
      toScreen: (gx, gy) => ({
        x: offsetX + gx * scale,
        y: offsetY + gy * scale
      }),
      toGrid: (sx, sy) => ({
        gx: (sx - offsetX) / scale,
        gy: (sy - offsetY) / scale
      }),
      scale
    };
  }

  handleCanvasHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { toScreen, scale } = this.getLatticeTransform();

    // Buscar data qubit cercano
    let found = null;
    const hitRadius = Math.max(12, scale * 0.2);

    for (const q of this.engine.dataQubits) {
      const pos = toScreen(q.x, q.y);
      const dist = Math.hypot(pos.x - mx, pos.y - my);
      if (dist <= hitRadius) {
        found = { type: 'data', obj: q, pos };
        break;
      }
    }

    if (!found) {
      for (const s of this.engine.stabilizers) {
        const pos = toScreen(s.x, s.y);
        const dist = Math.hypot(pos.x - mx, pos.y - my);
        if (dist <= hitRadius * 1.3) {
          found = { type: 'stabilizer', obj: s, pos };
          break;
        }
      }
    }

    this.hoveredObject = found;

    if (found) {
      this.canvas.style.cursor = 'pointer';
      this.tooltip.style.display = 'block';
      this.tooltip.style.left = `${found.pos.x + 15}px`;
      this.tooltip.style.top = `${found.pos.y - 15}px`;

      if (found.type === 'data') {
        const q = found.obj;
        this.tooltip.innerHTML = `<strong>Data Qubit [${q.r}, ${q.c}]</strong><br>Error Físico: <span style="color:${q.error !== 'I' ? 'var(--err-red)' : 'var(--success-green)'}">${q.error}</span><br>Corrección: <strong>${q.correction}</strong>`;
      } else {
        const s = found.obj;
        this.tooltip.innerHTML = `<strong>Estabilizador ${s.type} (${s.id})</strong><br>Síndrome: <span style="color:${s.measuredSyndrome === 1 ? 'var(--err-red)' : 'var(--cyan-x)'}">${s.measuredSyndrome === 1 ? '-1 (Defecto Detectado)' : '+1 (En reposo)'}</span><br>Qubits conectados: ${s.qubits.length}`;
      }
    } else {
      this.canvas.style.cursor = 'default';
      this.tooltip.style.display = 'none';
    }

    this.render();
  }

  handleCanvasClick(e) {
    if (!this.hoveredObject) return;

    if (this.hoveredObject.type === 'data') {
      const q = this.hoveredObject.obj;
      // Rotar error: I -> X -> Z -> Y -> I
      const cycle = { 'I': 'X', 'X': 'Z', 'Z': 'Y', 'Y': 'I' };
      q.error = cycle[q.error] || 'I';
      this.engine.calculateSyndromes();
      this.render();
      this.updateMetrics();
      this.updateExports();
    }
  }

  render() {
    const ctx = this.ctx;
    const { toScreen, scale } = this.getLatticeTransform();

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // 1. Dibujar plaquettes de estabilizadores con fondo translúcido HSL
    this.engine.stabilizers.forEach(s => {
      const center = toScreen(s.x, s.y);
      const halfSize = scale * 0.45;

      ctx.save();
      ctx.beginPath();

      if (s.qubits.length === 4) {
        // Rombo / Plaquette cuadrada rotada
        const p0 = toScreen(s.qubits[0].x, s.qubits[0].y);
        const p1 = toScreen(s.qubits[1].x, s.qubits[1].y);
        const p2 = toScreen(s.qubits[3].x, s.qubits[3].y);
        const p3 = toScreen(s.qubits[2].x, s.qubits[2].y);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
      } else {
        // Estabilizadores de frontera (triángulos o semicírculos)
        ctx.arc(center.x, center.y, halfSize * 0.9, 0, Math.PI * 2);
      }

      const isDefect = s.measuredSyndrome === 1;
      if (isDefect) {
        ctx.fillStyle = 'hsla(354, 85%, 60%, 0.35)';
        ctx.strokeStyle = 'hsl(354, 85%, 60%)';
        ctx.shadowColor = 'hsla(354, 85%, 60%, 0.7)';
        ctx.shadowBlur = 15;
      } else if (s.type === 'X') {
        ctx.fillStyle = 'hsla(186, 100%, 50%, 0.12)';
        ctx.strokeStyle = 'hsla(186, 100%, 50%, 0.6)';
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'hsla(272, 85%, 65%, 0.14)';
        ctx.strokeStyle = 'hsla(272, 85%, 65%, 0.6)';
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // Icono / Letra del estabilizador en el centro
      ctx.fillStyle = isDefect ? 'hsl(354, 85%, 60%)' : (s.type === 'X' ? 'hsl(186, 100%, 65%)' : 'hsl(272, 85%, 75%)');
      ctx.font = `600 ${Math.max(11, scale * 0.2)}px JetBrains Mono`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.type, center.x, center.y);
    });

    // 2. Líneas de emparejamiento MWPM / Corrección activa (Visualización de Grafo Dual)
    if (this.engine.lastDecodedMatches && this.engine.lastDecodedMatches.length > 0) {
      ctx.save();
      this.engine.lastDecodedMatches.forEach(match => {
        const uPos = toScreen(match.u.x, match.u.y);
        const vPos = toScreen(match.v.x, match.v.y);

        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'hsl(43, 96%, 56%)';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = 'hsla(43, 96%, 56%, 0.6)';
        ctx.shadowBlur = 10;
        ctx.moveTo(uPos.x, uPos.y);
        ctx.lineTo(vPos.x, vPos.y);
        ctx.stroke();
      });
      ctx.restore();
    }

    // 3. Conexiones entre Data Qubits adyacentes (Celosía)
    ctx.strokeStyle = 'hsla(222, 28%, 28%, 0.6)';
    ctx.lineWidth = 1;
    this.engine.dataQubits.forEach(q => {
      const p = toScreen(q.x, q.y);
      // Conectar con vecinos inmediatos en código rotado
      const d = this.engine.distance;
      if (q.c < d - 1) {
        const rightNeighbor = this.engine.dataMap.get(`${q.r},${q.c + 1}`);
        if (rightNeighbor) {
          const np = toScreen(rightNeighbor.x, rightNeighbor.y);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(np.x, np.y);
          ctx.stroke();
        }
      }
      if (q.r < d - 1) {
        const downNeighbor = this.engine.dataMap.get(`${q.r + 1},${q.c}`);
        if (downNeighbor) {
          const np = toScreen(downNeighbor.x, downNeighbor.y);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(np.x, np.y);
          ctx.stroke();
        }
      }
    });

    // 4. Dibujar Data Qubits
    this.engine.dataQubits.forEach(q => {
      const pos = toScreen(q.x, q.y);
      const radius = Math.max(7, scale * 0.12);
      const isHovered = this.hoveredObject?.type === 'data' && this.hoveredObject.obj === q;

      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

      // Color según estado de error
      if (q.error !== 'I') {
        ctx.fillStyle = 'hsl(354, 85%, 60%)';
        ctx.shadowColor = 'hsla(354, 85%, 60%, 0.8)';
        ctx.shadowBlur = 12;
      } else if (q.correction !== 'I') {
        ctx.fillStyle = 'hsl(43, 96%, 56%)'; // Marcado como corregido
        ctx.shadowColor = 'hsla(43, 96%, 56%, 0.6)';
        ctx.shadowBlur = 8;
      } else {
        ctx.fillStyle = 'hsl(210, 40%, 96%)';
        ctx.shadowBlur = 0;
      }

      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = 'hsl(190, 95%, 55%)';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'hsl(222, 47%, 7%)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();

      // Si tiene error o corrección, etiquetar el operador
      if (q.error !== 'I' || q.correction !== 'I') {
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.max(9, scale * 0.11)}px JetBrains Mono`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = q.error !== 'I' ? q.error : `C:${q.correction}`;
        ctx.fillText(label, pos.x, pos.y);
      }
    });
  }

  updateMetrics() {
    const metrics = this.engine.getThresholdMetrics();
    const activeDefects = this.engine.getActiveDefects().length;
    const matches = this.engine.lastDecodedMatches?.length || 0;

    document.getElementById('fidelityVal').textContent = `${(metrics.logicalFidelity * 100).toFixed(3)}%`;
    document.getElementById('syndromesCountVal').textContent = activeDefects;
    document.getElementById('matchesCountVal').textContent = matches;

    const regimeEl = document.getElementById('regimeDesc');
    if (metrics.isSubThreshold) {
      regimeEl.textContent = `Régimen Sub-umbral (p < p_th ≈ 1.05%). ¡A mayor distancia d, menor error lógico!`;
      regimeEl.style.color = 'var(--success-green)';
    } else {
      regimeEl.textContent = `Régimen Super-umbral (p > p_th). El código acumula más errores de los que corrige.`;
      regimeEl.style.color = 'var(--err-red)';
    }

    const statusText = document.getElementById('logicalStatusText');
    const statusDesc = document.getElementById('logicalStatusDesc');

    if (this.engine.logicalErrorDetected) {
      statusText.className = 'metric-val alert';
      statusText.textContent = 'FALLA LÓGICA DETECTADA';
      statusDesc.textContent = 'Una cadena continua no trivial de errores Pauli X o Z invirtió el qubit lógico.';
    } else if (activeDefects > 0) {
      statusText.className = 'metric-val';
      statusText.style.color = 'var(--accent-gold)';
      statusText.textContent = 'SÍNDROMES PENDIENTES';
      statusDesc.textContent = `Existen ${activeDefects} estabilizadores con valor -1 requiriendo decodificación MWPM.`;
    } else {
      statusText.className = 'metric-val success';
      statusText.textContent = 'SUPERPOSICIÓN PROTEGIDA';
      statusDesc.textContent = 'Espacio de código estabilizado libre de cadenas homológicas defectuosas.';
    }
  }

  updateExports() {
    document.getElementById('stimCodeArea').textContent = QasmBridge.toStim(this.engine);
    document.getElementById('qasmCodeArea').textContent = QasmBridge.toOpenQASM3(this.engine);
    document.getElementById('qiskitCodeArea').textContent = QasmBridge.toQiskitPython(this.engine);
  }

  renderHistory() {
    const container = document.getElementById('historyContainer');
    const records = this.storage.getExecutions();

    if (records.length === 0) {
      container.innerHTML = `<div style="font-size:0.75rem; color:var(--text-dim); text-align:center; padding: 0.5rem;">No hay ejecuciones registradas</div>`;
      return;
    }

    container.innerHTML = records.slice(0, 8).map(r => `
      <div class="history-item ${r.logicalSuccess ? '' : 'fail'}">
        <div>
          <strong>${r.type === 'planar' ? 'Planar' : 'Toric'} d=${r.distance}</strong> &bull; p=${(r.errorRate * 100).toFixed(1)}%<br>
          <span style="font-size:0.68rem; color:var(--text-dim);">${new Date(r.timestamp).toLocaleTimeString()} | Defectos: ${r.syndromesCount}</span>
        </div>
        <div>
          <span style="color:${r.logicalSuccess ? 'var(--success-green)' : 'var(--err-red)'}; font-weight:700;">
            ${r.logicalSuccess ? '✓ ÉXITO' : '✗ FALLA'}
          </span>
        </div>
      </div>
    `).join('');
  }
}

// Inicializar la SPA al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
  window.app = new SurfaceCodeApp();
});
