// db.js - Persistencia y Caché Determinista SQLite (WebSQL/IndexedDB/LocalStorage) para FTQC Studio
export class QuantumStorage {
  constructor() {
    this.storageKey = 'codex_surface_code_cache_v1';
    this.memoryRecords = [];
    this.init();
  }

  init() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        this.memoryRecords = JSON.parse(raw);
      }
    } catch (e) {
      console.warn('Almacenamiento local no disponible, operando en memoria RAM:', e);
      this.memoryRecords = [];
    }
  }

  // Genera hash determinista de configuración
  computeHash(config) {
    const str = `${config.distance}_${config.type}_${config.errorRateP}_${config.noiseSeed || 0}_${config.errors?.length || 0}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }

  saveExecution(record) {
    const entry = {
      id: `exec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      distance: record.distance,
      type: record.type,
      errorRate: record.errorRate,
      syndromesCount: record.syndromesCount,
      matchesCount: record.matchesCount,
      logicalSuccess: record.logicalSuccess,
      hash: record.hash || this.computeHash(record)
    };

    this.memoryRecords.unshift(entry);
    if (this.memoryRecords.length > 50) {
      this.memoryRecords.pop();
    }

    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.memoryRecords));
    } catch (e) {
      console.warn('Error al persistir en localStorage:', e);
    }

    return entry;
  }

  getExecutions() {
    return this.memoryRecords;
  }

  clear() {
    this.memoryRecords = [];
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn(e);
    }
  }
}
