import { ensureContentRegistry } from '../content-registry-defaults.js';

function newId() {
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function judicialRecordDcModifier(entryCount) {
  const n = Number(entryCount) || 0;
  if (n <= 0) return 0;
  if (n === 1) return 2;
  if (n === 2) return 4;
  if (n === 3) return 7;
  if (n === 4) return 11;
  return 16;
}

export function reputationBonusFromPerception(perceptionStats) {
  const p = perceptionStats || { public: 50, corporate: 50, government: 50 };
  return Math.round(((Number(p.public) || 0) + (Number(p.corporate) || 0) + (Number(p.government) || 0)) / 3) * 100;
}

export function computeAdjustedValuation(c) {
  const rev = Number(c.weeklyRevenue) || 0;
  const assets = Number(c.totalAssets) || 0;
  const debt = Number(c.totalDebt) || 0;
  const liab = Number(c.totalLiabilities) || 0;
  const rep = reputationBonusFromPerception(c.perceptionStats);
  return rev * 4 + assets + rep - debt - liab;
}

function contractTierForRank(rank, total) {
  const r = Number(rank) || 999;
  const t = Math.max(1, Number(total) || 1);
  if (r <= 5 && t >= 5) return 4;
  if (r <= Math.max(8, Math.ceil(t * 0.25))) return 3;
  if (r <= Math.ceil(t * 0.6)) return 2;
  return 1;
}

export function defaultCompany(overrides = {}) {
  return {
    id: newId(),
    type: 'company',
    legalName: '',
    tradingName: '',
    entityType: 'LLC',
    industry: '',
    registrationNumber: '',
    registrationDate: '',
    tier: 1,
    hqLocation: '',
    employeeCount: 0,
    weeklyRevenue: 0,
    weeklyExpenses: 0,
    totalAssets: 0,
    totalDebt: 0,
    totalLiabilities: 0,
    adjustedValuation: 0,
    perceptionStats: { public: 50, corporate: 50, government: 50 },
    notoriety: 0,
    corporateExposure: 0,
    judicialRecord: [],
    activeLawyer: 'none',
    activeInvestigator: null,
    activeLoans: [],
    bankAccounts: [],
    ownedAssets: [],
    ownerType: 'npc',
    ownerId: null,
    isPlayerCompany: false,
    companySlot: null,
    parentHolding: null,
    subsidiaries: [],
    combatCapabilities: {
      social: false,
      espionage: false,
      sabotage: false,
      cyber: false,
      legal: false
    },
    personalityType: 'balanced',
    rivalBehavior: {
      awarenessThreshold: 0,
      decisionStyle: 'reactive',
      memoryDuration: 0,
      allianceCapable: false,
      scalingType: 'player-tied'
    },
    ledgerRanking: 0,
    contractTier: 1,
    loreNotes: '',
    isKeyCompany: false,
    ...overrides
  };
}

/**
 * @param {{ getState: () => object, patchState: (fn: Function) => void, persistCompanies?: (companies: object[]) => Promise<void> }} ctx
 */
export function createCompanyCreatorApi(ctx) {
  function list() {
    const st = ctx.getState();
    ensureContentRegistry(st);
    return st.contentRegistry.companies;
  }

  function writeCompanies(companies) {
    ctx.patchState((st) => {
      ensureContentRegistry(st);
      st.contentRegistry.companies = companies;
      return st;
    });
    if (ctx.persistCompanies) return ctx.persistCompanies(companies);
    return Promise.resolve();
  }

  const api = {
    create(companyData) {
      const co = defaultCompany(companyData);
      if (companyData?.id) co.id = companyData.id;
      co.adjustedValuation = computeAdjustedValuation(co);
      const companies = [...list(), co];
      writeCompanies(companies);
      api.updateLedgerRankings();
      return api.get(co.id);
    },

    update(companyId, changes) {
      const companies = list().map((c) =>
        c.id === companyId ? { ...c, ...changes, id: companyId } : c
      );
      if (!companies.some((c) => c.id === companyId)) return null;
      writeCompanies(companies);
      const cur = api.get(companyId);
      if (cur) {
        const v = computeAdjustedValuation(cur);
        if (v !== cur.adjustedValuation) {
          ctx.patchState((st) => {
            ensureContentRegistry(st);
            const i = st.contentRegistry.companies.findIndex((x) => x.id === companyId);
            if (i >= 0) st.contentRegistry.companies[i].adjustedValuation = v;
            return st;
          });
        }
      }
      api.updateLedgerRankings();
      return api.get(companyId);
    },

    delete(companyId) {
      const prev = list();
      const npcs = prev.filter((c) => c.id !== companyId);
      if (npcs.length === prev.length) return false;
      writeCompanies(
        npcs.map((c) => ({
          ...c,
          subsidiaries: (c.subsidiaries || []).filter((s) => s !== companyId),
          parentHolding: c.parentHolding === companyId ? null : c.parentHolding
        }))
      );
      api.updateLedgerRankings();
      return true;
    },

    get(companyId) {
      return list().find((c) => c.id === companyId) || null;
    },

    getAll() {
      return [...list()];
    },

    getByIndustry(industry) {
      return list().filter((c) => c.industry === industry);
    },

    getByOwnerType(ownerType) {
      return list().filter((c) => c.ownerType === ownerType);
    },

    getRivals() {
      return list().filter((c) => c.ownerType === 'rival');
    },

    getPlayerCompanies() {
      return list().filter((c) => c.isPlayerCompany || c.ownerType === 'player');
    },

    recalculateValuation(companyId) {
      const c = api.get(companyId);
      if (!c) return null;
      const v = computeAdjustedValuation(c);
      return api.update(companyId, { adjustedValuation: v });
    },

    updateLedgerRankings() {
      const companies = [...list()];
      companies.sort((a, b) => (b.adjustedValuation || 0) - (a.adjustedValuation || 0));
      const total = companies.length;
      let rank = 1;
      const updated = companies.map((c, i) => {
        const adj = computeAdjustedValuation(c);
        const ct = contractTierForRank(rank, total);
        const row = { ...c, ledgerRanking: rank, contractTier: ct, adjustedValuation: adj };
        rank += 1;
        return row;
      });
      writeCompanies(updated);
      return updated;
    },

    addJudicialEntry(companyId, entry) {
      const c = api.get(companyId);
      if (!c) return null;
      const jr = [...(c.judicialRecord || []), { ...entry }];
      return api.update(companyId, { judicialRecord: jr });
    },

    assignInvestigator(companyId, tier) {
      return api.update(companyId, { activeInvestigator: tier });
    },

    judicialDcModifier(companyId) {
      const c = api.get(companyId);
      if (!c) return 0;
      return judicialRecordDcModifier((c.judicialRecord || []).length);
    }
  };

  return api;
}
