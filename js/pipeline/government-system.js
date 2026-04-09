import { ensureContentRegistry, createDefaultGovernment } from '../content-registry-defaults.js';

function setPath(obj, pathStr, value) {
  const parts = pathStr.split(/\.|\[|\]/).filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    if (k === '__proto__' || k === 'constructor') throw new Error('Invalid path');
    cur = cur[k];
  }
  const last = parts[parts.length - 1];
  if (last === '__proto__' || last === 'constructor') throw new Error('Invalid path');
  cur[last] = value;
}

function getPath(obj, pathStr) {
  const parts = pathStr.split(/\.|\[|\]/).filter(Boolean);
  let cur = obj;
  for (const k of parts) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

/**
 * @param {{ getState: () => object, patchState: (fn: Function) => void, persistGovernment?: (g: object) => Promise<void> }} ctx
 */
export function createGovernmentSystemApi(ctx) {
  function gov() {
    const st = ctx.getState();
    ensureContentRegistry(st);
    return st.contentRegistry.government;
  }

  function writeGov(next) {
    ctx.patchState((st) => {
      ensureContentRegistry(st);
      st.contentRegistry.government = next;
      return st;
    });
    if (ctx.persistGovernment) return ctx.persistGovernment(next);
    return Promise.resolve();
  }

  return {
    get() {
      return JSON.parse(JSON.stringify(gov()));
    },

    update(path, value) {
      const g = JSON.parse(JSON.stringify(gov()));
      setPath(g, path, value);
      writeGov(g);
      return getPath(g, path);
    },

    getTaxRate(type) {
      const t = gov().taxSystem || {};
      if (type === 'corporate') return t.corporateTaxRate ?? 0.35;
      if (type === 'personal' || type === 'personalIncome') return t.personalIncomeTaxRate ?? 0.28;
      if (type === 'capitalGains') return t.capitalGainsTaxRate ?? 0.2;
      return null;
    },

    getThreshold(system, tierKey) {
      const g = gov();
      if (system === 'notoriety') {
        return g.notorietyThresholds?.[tierKey];
      }
      if (system === 'exposure') {
        return g.exposureThresholds?.[tierKey];
      }
      return undefined;
    },

    getFineRange(investigatorTier) {
      const f = gov().investigatorFineRanges || {};
      const t = Number(investigatorTier) || 1;
      if (t === 1) return { min: f.tier1Min ?? 15000, max: f.tier1Max ?? 50000 };
      if (t === 2) return { min: f.tier2Min ?? 40000, max: f.tier2Max ?? 150000 };
      if (t === 3) return { min: f.tier3Min ?? 100000, max: f.tier3Max ?? 500000 };
      return { min: 0, max: 0 };
    },

    calculateGovernmentPerception(entityId) {
      const st = ctx.getState();
      ensureContentRegistry(st);
      const cr = st.contentRegistry;
      const ent =
        cr.npcs.find((n) => n.id === entityId) ||
        cr.companies.find((c) => c.id === entityId);
      if (!ent?.perceptionStats) return 50;
      const hg = gov().hiddenGovernmentValues || {};
      const base =
        (Number(ent.perceptionStats.government) || 0) * 0.4 +
        (100 - (Number(ent.perceptionStats.corporate) || 50) * 0.1);
      const w =
        (Number(hg.taxComplianceWeight) || 1) * 0.2 +
        (Number(hg.judicialRecordWeight) || 1) * 0.15 +
        (Number(hg.crimeSeverityWeight) || 1) * 0.15;
      return Math.max(0, Math.min(100, Math.round(base * w)));
    },

    addPersonnel(personnelData) {
      const g = JSON.parse(JSON.stringify(gov()));
      g.governmentPersonnel = [...(g.governmentPersonnel || []), { id: `gp-${Date.now()}`, ...personnelData }];
      writeGov(g);
      return g.governmentPersonnel[g.governmentPersonnel.length - 1];
    },

    removePersonnel(personnelId) {
      const g = JSON.parse(JSON.stringify(gov()));
      g.governmentPersonnel = (g.governmentPersonnel || []).filter((p) => p.id !== personnelId);
      writeGov(g);
    },

    setAgencyActive(agencyName, active) {
      const g = JSON.parse(JSON.stringify(gov()));
      const list = g.activeAgencies || [];
      const i = list.findIndex((a) => a.name === agencyName);
      if (i >= 0) list[i] = { ...list[i], active: !!active };
      else list.push({ name: agencyName, active: !!active });
      g.activeAgencies = list;
      writeGov(g);
    },

    exportConfig() {
      return this.get();
    },

    importConfig(configData) {
      const merged = { ...createDefaultGovernment(), ...configData };
      writeGov(merged);
    },

    reset() {
      writeGov(createDefaultGovernment());
    }
  };
}
