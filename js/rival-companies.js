/**
 * Rival company behavioral engine — sim-day actions, Herald items, market buzz, combat API.
 */
import { getState, patchState } from './gameState.js';
import { ActorDB } from '../engine/ActorDB.js';
import { emit } from './events.js';
import { recordHashtagEvent } from './market-dynamics.js';
import { getEconomy } from './economy.js';

let _companies = [];
let _products = [];
let _initialized = false;

function enrichFromTemplate(c) {
  return {
    ...c,
    publicSentiment: c.publicSentiment ?? 60,
    marketCap: c.marketCap ?? 1_000_000,
    annualRevenue: c.annualRevenue ?? 500_000,
    employeeIds: [],
    supplyDisrupted: false,
    supplyDisruptedUntil: 0,
    underInvestigation: false,
    complianceFlags: 0,
    smearActive: false,
    lastActionSimMs: 0,
    acquisitionPct: 0,
    partiallyAcquiredByShell: null
  };
}

/**
 * @param {(name: string) => Promise<unknown>} loadJson
 */
export async function initRivalCompanies(loadJson) {
  try {
    const data = await loadJson('rival-companies.json');
    _companies = data.companies || [];
  } catch {
    _companies = [];
  }
  try {
    const data = await loadJson('rival-products.json');
    _products = data.products || [];
  } catch {
    _products = [];
  }

  patchState((st) => {
    st.rivalCompanies = Array.isArray(st.rivalCompanies) ? st.rivalCompanies : [];
    st.rivalProducts = Array.isArray(st.rivalProducts) ? st.rivalProducts : [];
    if (!st.rivalCompanies.length && _companies.length) {
      st.rivalCompanies = _companies.map((c) => enrichFromTemplate(c));
    } else {
      for (const src of _companies) {
        if (!st.rivalCompanies.some((r) => r.id === src.id)) {
          st.rivalCompanies.push(enrichFromTemplate(src));
        }
      }
    }
    if (!st.rivalProducts.length && _products.length) {
      st.rivalProducts = _products;
    } else if (_products.length) {
      const have = new Set((st.rivalProducts || []).map((p) => p.id));
      for (const p of _products) {
        if (!have.has(p.id)) {
          st.rivalProducts.push(p);
          have.add(p.id);
        }
      }
    }
    return st;
  });

  _assignEmployees();
  _assignCEOs();

  _initialized = true;
  window.RivalCompanies = {
    getAll,
    getById,
    getProducts,
    tickRivals,
    applyEffect,
    resolveRivalId
  };
  console.log(
    `[RivalCompanies] ${_companies.length} companies, ${_products.length} products, init=${_initialized}`
  );
}

function _assignEmployees() {
  for (const company of getState().rivalCompanies || []) {
    if ((company.employeeIds || []).length) continue;

    const unassigned = ActorDB.getAllRaw().filter(
      (a) => a && a.active !== false && a.role === 'civilian' && !a.employer_id
    );
    const d = Number(company.districtId);
    const local = unassigned.filter((a) => a.districtId === d);
    const pool = local.length >= 5 ? [...local] : [...unassigned];
    const n = Math.min(
      Math.floor((Number(company.employeeCount) || 100) * 0.06),
      pool.length,
      30
    );
    const assigned = [];
    for (let i = 0; i < n && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      const [a] = pool.splice(j, 1);
      if (!a?.actor_id) break;
      try {
        ActorDB.update(a.actor_id, { employer_id: company.id, employer_name: company.tradingName });
      } catch (e) {
        console.warn('[RivalCompanies] assign employee failed', a.actor_id, e?.message || e);
        continue;
      }
      assigned.push(a.actor_id);
    }
    patchState((s) => {
      const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
      if (c) c.employeeIds = assigned;
      return s;
    });
  }
}

function _assignCEOs() {
  for (const company of getState().rivalCompanies || []) {
    if (company.currentCEO) continue;
    const eids = company.employeeIds || [];
    if (!eids.length) continue;
    const first = eids[0];
    patchState((s) => {
      const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
      if (c) c.currentCEO = first;
      return s;
    });
    try {
      const prev = ActorDB.getRaw(first);
      if (prev && prev.role === 'civilian') {
        ActorDB.update(first, { role: 'contact' });
      }
    } catch {
      /* ok */
    }
  }
}

export function resolveRivalId(q) {
  const query = String(q || '').trim().toLowerCase();
  if (!query) return null;
  const all = getState().rivalCompanies || [];
  for (const c of all) {
    if (c.id === query) return c.id;
  }
  for (const c of all) {
    if (String(c.ticker || '').toLowerCase() === query) return c.id;
  }
  for (const c of all) {
    if (String(c.tradingName || '').toLowerCase() === query) return c.id;
  }
  for (const c of all) {
    if (String(c.legalName || '').toLowerCase() === query) return c.id;
  }
  return all.find((c) => String(c.id || '').includes(query))?.id || null;
}

/* ── Daily tick (invoked on dayChanged) ───────────────── */

export function tickRivals(simMs) {
  const t = Number(simMs) || 0;
  patchState((s) => {
    for (const c of s.rivalCompanies || []) {
      if (c.supplyDisrupted && c.supplyDisruptedUntil > 0 && t >= c.supplyDisruptedUntil) {
        c.supplyDisrupted = false;
      }
    }
    return s;
  });
  const st = getState();
  for (const company of st.rivalCompanies || []) {
    if (t - (company.lastActionSimMs || 0) < 18 * 3_600_000) continue;
    if (Math.random() > (company.aggressiveness ?? 0.5)) continue;
    const action = _selectAction(company, st, t);
    if (!action) continue;
    _executeAction(company, action, t);
    patchState((s) => {
      const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
      if (c) c.lastActionSimMs = t;
      return s;
    });
  }
}

const ACTIONS = [
  'product_launch',
  'price_cut',
  'expansion',
  'acquisition',
  'controversy',
  'settlement',
  'earnings_report',
  'layoffs',
  'hiring_surge',
  'partnership',
  'regulatory_investigation',
  'competitor_attack'
];

function _selectAction(company, _st, _simMs) {
  const econ = getEconomy();
  const confidence = econ.consumerConfidence || 72;
  const gdp = econ.gdpIndex || 100;
  const dotCom = econ.dotComBubble || 'peak';
  const sentiment = company.publicSentiment || 60;
  const flags = company.complianceFlags || 0;
  const disrupted = company.supplyDisrupted;
  const investigated = company.underInvestigation;

  if (investigated && Math.random() < 0.6) return 'settlement';
  if (disrupted) return Math.random() < 0.5 ? 'settlement' : 'earnings_report';

  if (sentiment < 25) {
    const distressActions = ['settlement', 'layoffs', 'settlement', 'regulatory_investigation'];
    return distressActions[Math.floor(Math.random() * distressActions.length)];
  }

  if (gdp < 90 || confidence < 40) {
    const recessionActions = ['price_cut', 'layoffs', 'earnings_report', 'settlement'];
    return recessionActions[Math.floor(Math.random() * recessionActions.length)];
  }

  if (dotCom === 'burst' && ['Technology', 'Finance'].includes(company.sector)) {
    if (Math.random() < 0.5) return 'layoffs';
    return 'earnings_report';
  }

  if (gdp > 110 && confidence > 70) {
    if (company.aggressiveness > 0.7 && Math.random() < 0.4) return 'competitor_attack';
    if (Math.random() < 0.35) return 'expansion';
    if (Math.random() < 0.25) return 'acquisition';
  }

  if (dotCom === 'peak' && ['Technology'].includes(company.sector)) {
    if (Math.random() < 0.4) return 'product_launch';
    if (Math.random() < 0.2) return 'partnership';
  }

  if (sentiment > 75) {
    if (Math.random() < 0.3) return 'product_launch';
    if (Math.random() < 0.2) return 'hiring_surge';
    if (Math.random() < 0.15) return 'expansion';
  }

  if (company.aggressiveness > 0.75 && Math.random() < company.aggressiveness * 0.3) {
    return 'competitor_attack';
  }

  if (flags >= 2 && Math.random() < 0.4) return 'controversy';

  const all = [
    'product_launch',
    'product_launch',
    'price_cut',
    'expansion',
    'earnings_report',
    'earnings_report',
    'partnership',
    'hiring_surge',
    'controversy'
  ];
  return all[Math.floor(Math.random() * all.length)];
}

function _executeAction(company, action, simMs) {
  const fns = {
    product_launch: _actionProductLaunch,
    price_cut: _actionPriceCut,
    expansion: _actionExpansion,
    acquisition: _actionAcquisition,
    controversy: _actionControversy,
    settlement: _actionSettlement,
    earnings_report: _actionEarnings,
    layoffs: _actionLayoffs,
    hiring_surge: _actionHiring,
    partnership: _actionPartnership,
    regulatory_investigation: _actionRegulatory,
    competitor_attack: _actionCompetitorAttack
  };
  const fn = fns[action];
  if (fn) fn(company, simMs);
}

function _makeNewsItem(company, headline, summary, severity, taglist, simMs) {
  const sev = Number(severity) || 2;
  const item = {
    id: `rival_${company.id}_${simMs}_${Math.random().toString(36).slice(2, 9)}`,
    simMs,
    headline,
    summary,
    category: 'business',
    severity: sev,
    districtId: company.districtId,
    namedActors: company.currentCEO ? [company.currentCEO] : [],
    tags: [company.id, (company.sector || '').toLowerCase(), ...taglist],
    channels: sev >= 3 ? ['herald', 'yourspace', 'rtc'] : ['herald'],
    reachRadius: sev >= 3 ? 'city' : 'district',
    decaySimMs: 86_400_000 * (sev + 1),
    reactions: { sympathy: 0, outrage: 0, indifferent: 0 },
    comments: []
  };
  patchState((st) => {
    st.newsRegistry = st.newsRegistry || [];
    st.newsRegistry.push(item);
    if (st.newsRegistry.length > 200) st.newsRegistry.shift();
    return st;
  });
  if (sev >= 2) emit('news:breaking', { headline, severity: sev });
  return item;
}

function _actionProductLaunch(company, simMs) {
  const products = (getState().rivalProducts || []).filter((p) => p.companyId === company.id);
  if (!products.length) return;
  const product = products[Math.floor(Math.random() * products.length)];
  _makeNewsItem(
    company,
    `${company.tradingName} launches ${product.name} — available now on WorldNet`,
    `${company.tradingName} today announced the release of ${product.name}, priced at $${product.priceUsd}. The product targets the ${product.category} market.`,
    2,
    ['product', 'launch', product.category],
    simMs
  );
  for (let i = 0; i < 15; i++) recordHashtagEvent(product.category, 'mention');
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.min(100, (c.publicSentiment || 60) + 5);
      c.marketCap = Math.round((c.marketCap || 1_000_000) * 1.04);
    }
    s.marketBuzz = s.marketBuzz || {};
    if (!s.marketBuzz[product.category] || typeof s.marketBuzz[product.category] !== 'object') {
      s.marketBuzz[product.category] = { mentions: 0, likes: 0, dislikes: 0, purchaseCountWindow: 0, lastPurchaseSimMs: 0 };
    }
    s.marketBuzz[product.category].mentions = (s.marketBuzz[product.category].mentions || 0) + 15;
    return s;
  });
}

function _actionPriceCut(company, simMs) {
  const pct = 10 + Math.floor(Math.random() * 25);
  _makeNewsItem(
    company,
    `${company.tradingName} cuts prices by ${pct}% — analysts divided`,
    `${company.tradingName} announced a ${pct}% price reduction across its product line. Competitors have not yet responded.`,
    2,
    ['price', 'discount', (company.sector || '').toLowerCase()],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.min(100, (c.publicSentiment || 60) + 8);
      c.annualRevenue = Math.round((c.annualRevenue || 500_000) * 0.93);
    }
    return s;
  });
}

function _actionExpansion(company, simMs) {
  const districts = [
    'Downtown Core',
    'Midtown',
    'Northside',
    'Eastside',
    'Westside',
    'Harbor District',
    'University Area',
    'Medical District',
    'Financial District',
    'Arts District'
  ];
  const district = districts[Math.floor(Math.random() * districts.length)];
  _makeNewsItem(
    company,
    `${company.tradingName} opens new ${district} location — 40 jobs created`,
    `${company.tradingName} is expanding into the ${district} with a new facility. The company expects to hire 40 local employees in Q1 2000.`,
    3,
    ['expansion', 'jobs', district.toLowerCase().replace(/ /g, '-')],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.min(100, (c.publicSentiment || 60) + 10);
      c.marketCap = Math.round((c.marketCap || 1_000_000) * 1.06);
    }
    return s;
  });
}

function _actionAcquisition(company, simMs) {
  const targets = [
    'Hargrove Logistics Inc.',
    'Valley Data Services',
    'Coastal Media Group',
    'Midtown Tech Partners',
    'Harbor Distribution LLC'
  ];
  const target = targets[Math.floor(Math.random() * targets.length)];
  const price = (1 + Math.floor(Math.random() * 8)) * 100_000;
  _makeNewsItem(
    company,
    `${company.tradingName} acquires ${target} for $${(price / 1000).toFixed(0)}K`,
    `In a deal valued at $${price.toLocaleString()}, ${company.tradingName} has acquired ${target}. The acquisition expands their reach into new Hargrove markets.`,
    3,
    ['acquisition', 'merger', 'business'],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) c.marketCap = Math.round((c.marketCap || 1_000_000) * 1.08);
    return s;
  });
}

function _actionControversy(company, simMs) {
  const list = [
    [
      `${company.tradingName} faces backlash over data practices — customers demand answers`,
      `Multiple Hargrove residents have raised concerns about ${company.tradingName}'s data collection practices following a YourSpace thread that went viral.`,
      3
    ],
    [
      `${company.tradingName} executive resigns amid financial irregularities`,
      `A senior executive at ${company.tradingName} has stepped down. The company cited personal reasons. A Herald investigation is ongoing.`,
      4
    ],
    [
      `${company.tradingName} faces price-fixing allegations from rival firms`,
      `Three Hargrove companies have filed a joint complaint alleging ${company.tradingName} coordinated pricing to eliminate competition.`,
      3
    ],
    [
      `${company.tradingName} workers plan strike — union demands met with silence`,
      `${company.tradingName} employees are organizing. Union representatives say management has refused to negotiate.`,
      3
    ],
    [
      `${company.tradingName} sued over misleading advertising — case filed in Hargrove District Court`,
      `A class-action suit has been filed against ${company.tradingName} over advertising claims regulators say cannot be substantiated.`,
      3
    ]
  ];
  const [headline, summary, sev] = list[Math.floor(Math.random() * list.length)];
  _makeNewsItem(company, headline, summary, sev, ['controversy', 'scandal'], simMs);
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.max(0, (c.publicSentiment || 60) - 18);
      c.marketCap = Math.round((c.marketCap || 1_000_000) * 0.92);
    }
    return s;
  });
}

function _actionSettlement(company, simMs) {
  const amount = (1 + Math.floor(Math.random() * 5)) * 50_000;
  _makeNewsItem(
    company,
    `${company.tradingName} settles regulatory dispute — pays $${(amount / 1000).toFixed(0)}K, admits no wrongdoing`,
    `${company.tradingName} has agreed to pay $${amount.toLocaleString()} to resolve a regulatory dispute. The company admits no wrongdoing.`,
    2,
    ['settlement', 'regulatory', 'legal'],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.min(100, (c.publicSentiment || 60) + 4);
      c.complianceFlags = Math.max(0, (c.complianceFlags || 0) - 1);
      c.annualRevenue = Math.max(0, (c.annualRevenue || 500_000) - amount);
    }
    return s;
  });
}

function _actionEarnings(company, simMs) {
  const beat = Math.random() < 0.6;
  const pct = 3 + Math.floor(Math.random() * 15);
  _makeNewsItem(
    company,
    `${company.tradingName} Q4 earnings ${beat ? 'beat' : 'miss'} expectations — revenue ${beat ? 'up' : 'down'} ${pct}%`,
    `${company.tradingName} reported quarterly earnings showing revenue ${beat ? 'growth' : 'decline'} of ${pct}%. ${beat ? 'Shares rose on the news.' : 'Management cited market headwinds.'}`,
    2,
    ['earnings', 'financial', 'quarterly'],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      const m = beat ? 1 + pct / 100 : 1 - pct / 100;
      c.annualRevenue = Math.round((c.annualRevenue || 500_000) * m);
      c.marketCap = Math.round((c.marketCap || 1_000_000) * (beat ? 1.05 : 0.95));
      c.publicSentiment = Math.min(100, Math.max(0, (c.publicSentiment || 60) + (beat ? 5 : -5)));
    }
    return s;
  });
}

function _actionLayoffs(company, simMs) {
  const count = 20 + Math.floor(Math.random() * 80);
  _makeNewsItem(
    company,
    `${company.tradingName} lays off ${count} Hargrove employees — "restructuring" cited`,
    `${company.tradingName} announced ${count} layoffs today. The company says the cuts are part of a broader restructuring effort. No severance details were disclosed.`,
    3,
    ['layoffs', 'jobs', 'restructuring'],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.max(0, (c.publicSentiment || 60) - 12);
      c.employeeCount = Math.max(0, (c.employeeCount || 100) - count);
      const toRelease = (c.employeeIds || []).slice(0, Math.min(3, count));
      for (const id of toRelease) {
        try {
          ActorDB.update(id, { employer_id: null, employer_name: null, profession: 'Unemployed' });
        } catch {
          /* */
        }
      }
      c.employeeIds = (c.employeeIds || []).filter((id) => !toRelease.includes(id));
    }
    return s;
  });
}

function _actionHiring(company, simMs) {
  const n = 10 + Math.floor(Math.random() * 40);
  _makeNewsItem(
    company,
    `${company.tradingName} hiring ${n} in Hargrove — applications open on WorldNet`,
    `${company.tradingName} announced a hiring push of ${n} positions across multiple departments. Job postings are live on Hargrove Careers.`,
    2,
    ['hiring', 'jobs', 'growth'],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.min(100, (c.publicSentiment || 60) + 7);
      c.employeeCount = (c.employeeCount || 100) + n;
    }
    return s;
  });
}

function _actionPartnership(company, simMs) {
  const others = (getState().rivalCompanies || []).filter((c) => c.id !== company.id);
  if (!others.length) return;
  const partner = others[Math.floor(Math.random() * others.length)];
  _makeNewsItem(
    company,
    `${company.tradingName} and ${partner.tradingName} announce strategic partnership`,
    'The two companies will collaborate on shared infrastructure and cross-platform services. Terms were not disclosed.',
    3,
    ['partnership', 'collaboration', 'business'],
    simMs
  );
  patchState((s) => {
    for (const id of [company.id, partner.id]) {
      const c = (s.rivalCompanies || []).find((r) => r.id === id);
      if (c) c.marketCap = Math.round((c.marketCap || 1_000_000) * 1.03);
    }
    return s;
  });
}

function _actionRegulatory(company, simMs) {
  _makeNewsItem(
    company,
    `Federal regulators open inquiry into ${company.tradingName} — CorpOS compliance cited`,
    `The Federal Office of Commercial Systems has opened an inquiry into ${company.tradingName}'s compliance with Mandate 2000-CR7. No charges have been filed.`,
    4,
    ['regulatory', 'federal', 'compliance', 'mandate'],
    simMs
  );
  patchState((s) => {
    const c = (s.rivalCompanies || []).find((r) => r.id === company.id);
    if (c) {
      c.publicSentiment = Math.max(0, (c.publicSentiment || 60) - 20);
      c.underInvestigation = true;
      c.complianceFlags = (c.complianceFlags || 0) + 2;
    }
    return s;
  });
}

function _actionCompetitorAttack(company, simMs) {
  const same = (getState().rivalCompanies || []).filter(
    (c) => c.id !== company.id && c.sector === company.sector
  );
  if (!same.length) return;
  const target = same[Math.floor(Math.random() * same.length)];
  _makeNewsItem(
    company,
    `${company.tradingName} files suit against ${target.tradingName} over patent violations`,
    `${company.tradingName} has initiated legal proceedings against ${target.tradingName}, alleging infringement of three core patents. The case will be heard in Hargrove District Court.`,
    3,
    ['lawsuit', 'patent', 'legal', 'competitor'],
    simMs
  );
  patchState((s) => {
    const t = (s.rivalCompanies || []).find((r) => r.id === target.id);
    if (t) {
      t.publicSentiment = Math.max(0, (t.publicSentiment || 60) - 10);
      t.complianceFlags = (t.complianceFlags || 0) + 1;
    }
    return s;
  });
}

/* ── API ─────────────────────────────────────── */

export function getAll() {
  return getState().rivalCompanies || [];
}
export function getById(id) {
  return getAll().find((c) => c.id === id);
}
export function getProducts(companyId) {
  return (getState().rivalProducts || []).filter((p) => p.companyId === companyId);
}

export function applyEffect(effectType, targetId, params = {}) {
  const rid = resolveRivalId(String(targetId || ''));
  const company = rid ? getById(rid) : null;
  if (!company) return { ok: false, reason: 'Company not found.' };
  const simMs = getState().sim?.elapsedMs || 0;
  const key = company.id;

  switch (effectType) {
    case 'reputation_damage': {
      const dmg = Number(params.amount || 15);
      patchState((s) => {
        const c = (s.rivalCompanies || []).find((r) => r.id === key);
        if (c) c.publicSentiment = Math.max(0, (c.publicSentiment || 60) - dmg);
        return s;
      });
      if (params.silent) return { ok: true, sentimentDelta: -dmg };
      _makeNewsItem(
        company,
        `Questions emerge about ${company.tradingName}'s business practices`,
        `Anonymous sources have raised concerns about ${company.tradingName}'s recent conduct. The company has not commented.`,
        params.severity != null ? Number(params.severity) : 2,
        ['reputation', 'scandal'],
        simMs
      );
      return { ok: true, sentimentDelta: -dmg };
    }
    case 'supply_disruption': {
      const drop = params.sentimentDamage != null ? Number(params.sentimentDamage) : 8;
      patchState((s) => {
        const c = (s.rivalCompanies || []).find((r) => r.id === key);
        if (c) {
          c.supplyDisrupted = true;
          c.supplyDisruptedUntil = simMs + (params.durationMs || 48 * 3_600_000);
          c.publicSentiment = Math.max(0, (c.publicSentiment || 60) - drop);
        }
        return s;
      });
      _makeNewsItem(
        company,
        `${company.tradingName} reports supply chain disruption — product availability limited`,
        'Customers are reporting shortages across Hargrove. The company cited logistics issues.',
        2,
        ['supply', 'shortage', 'logistics'],
        simMs
      );
      return { ok: true };
    }
    case 'compliance_flag': {
      const flags = Number(params.flags || 1);
      const sentDrop = params.sentimentDamage != null ? Number(params.sentimentDamage) : flags * 5;
      patchState((s) => {
        const c = (s.rivalCompanies || []).find((r) => r.id === key);
        if (c) {
          c.complianceFlags = (c.complianceFlags || 0) + flags;
          c.publicSentiment = Math.max(0, (c.publicSentiment || 60) - sentDrop);
          if (params.underInvestigation) c.underInvestigation = true;
          if (c.complianceFlags >= 3) c.underInvestigation = true;
        }
        return s;
      });
      if ((getById(key)?.complianceFlags || 0) >= 3) {
        _makeNewsItem(
          company,
          `${company.tradingName} under federal investigation — Mandate 2000-CR7 cited`,
          `Federal regulators have formally opened an investigation into ${company.tradingName}. Multiple compliance complaints were filed.`,
          4,
          ['federal', 'investigation', 'compliance'],
          simMs
        );
      }
      return { ok: true };
    }
    case 'intel_gather': {
      const c = getById(key);
      return {
        ok: true,
        payload: {
          name: c.tradingName,
          sector: c.sector,
          sentiment: c.publicSentiment,
          marketCap: c.marketCap,
          revenue: c.annualRevenue,
          employees: c.employeeCount,
          flags: c.complianceFlags,
          disrupted: c.supplyDisrupted,
          investigated: c.underInvestigation,
          products: getProducts(key).map((p) => p.name)
        }
      };
    }
    case 'proxy_acquire': {
      const shellId = params.shellId;
      if (!shellId) return { ok: false, reason: 'No shell company specified.' };
      patchState((s) => {
        const c = (s.rivalCompanies || []).find((r) => r.id === key);
        if (c) {
          c.partiallyAcquiredByShell = shellId;
          c.acquisitionPct = (c.acquisitionPct || 0) + (params.pct || 10);
        }
        return s;
      });
      return { ok: true, pctAcquired: params.pct || 10 };
    }
    case 'regulator_whisper': {
      patchState((s) => {
        const c = (s.rivalCompanies || []).find((r) => r.id === key);
        if (c && (c.complianceFlags || 0) > 0) c.complianceFlags = (c.complianceFlags || 0) - 1;
        return s;
      });
      return { ok: true };
    }
    default:
      return { ok: false, reason: `Unknown effect: ${effectType}` };
  }
}
