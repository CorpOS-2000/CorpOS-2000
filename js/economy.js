/**
 * economy.js — CorpOS 2000 Economic Engine
 *
 * Models the Hargrove, CA local economy as of January 1, 2000.
 * Buy/sell price formulas, NPC purchasing decisions, inflation tracking,
 * GDP, employer income tiers. Other systems read from here.
 */
import { getState, patchState, SIM_DAY_MS as GS_SIM_DAY_MS } from './gameState.js';
import { emit } from './events.js';

export const SIM_DAY_MS = GS_SIM_DAY_MS;

// ── ECONOMIC CONSTANTS (Year 2000, Hargrove CA) ───────────────────────────────

export const ECON_CONSTANTS = {
  BASE_INFLATION_RATE: 0.031,
  BASE_UNEMPLOYMENT_RATE: 0.04,
  DOT_COM_MULTIPLIER: 1.18,
  BASE_DAILY_EXPENSES: 68.57,
  INCOME_TAX_RATE: 0.28,
  SALES_TAX_RATE: 0.0875,
  SELLER_MARGIN: 0.6,
  LIQUIDATION_MARGIN: 0.4
};

export const PROFESSION_INCOME = {
  Attorney: 95000,
  Doctor: 140000,
  'Financial Advisor': 82000,
  Engineer: 78000,
  Architect: 72000,
  Accountant: 64000,
  Pharmacist: 74000,
  Banker: 68000,
  'Government Worker': 52000,
  Teacher: 44000,
  Developer: 88000,
  Consultant: 95000,
  Journalist: 38000,
  Freelancer: 41000,
  Artist: 28000,
  Musician: 24000,
  Photographer: 32000,
  'Retail Worker': 22000,
  Server: 21000,
  Cook: 23000,
  Bartender: 24000,
  'Customer Service': 28000,
  'Security Guard': 30000,
  'Personal Trainer': 31000,
  Nurse: 52000,
  'Police Officer': 48000,
  'Truck Driver': 38000,
  'Factory Worker': 34000,
  Janitor: 22000,
  'Warehouse Worker': 28000,
  Retired: 24000,
  Unemployed: 0
};

export const TAGLET_ECON_PROFILE = {
  transactional: {
    spendRate: 1.4,
    priceSensitivity: 0.5,
    savingsRate: 0.05,
    preferCategories: ['hardware', 'consumer', 'food']
  },
  cautious: { spendRate: 0.6, priceSensitivity: 1.8, savingsRate: 0.25, preferCategories: ['food', 'consumer'] },
  generous: { spendRate: 1.3, priceSensitivity: 0.6, savingsRate: 0.08, preferCategories: ['consumer', 'hardware'] },
  ambitious: { spendRate: 1.2, priceSensitivity: 0.7, savingsRate: 0.18, preferCategories: ['hardware', 'equipment', 'software'] },
  vocal: { spendRate: 1.1, priceSensitivity: 0.9, savingsRate: 0.1, preferCategories: ['consumer', 'food'] },
  loyal: { spendRate: 0.95, priceSensitivity: 0.8, savingsRate: 0.14, preferCategories: ['consumer'] },
  reclusive: { spendRate: 0.7, priceSensitivity: 1.2, savingsRate: 0.2, preferCategories: ['food', 'hardware'] },
  information_broker: { spendRate: 1.05, priceSensitivity: 1.0, savingsRate: 0.15, preferCategories: ['data', 'software'] },
  community_hub: { spendRate: 1.15, priceSensitivity: 0.85, savingsRate: 0.1, preferCategories: ['food', 'consumer'] }
};

const DEFAULT_ECON_PROFILE = { spendRate: 1, priceSensitivity: 1, savingsRate: 0.12, preferCategories: ['consumer', 'food'] };

export const CATEGORY_BASE_PRICES = {
  consumer: { min: 5, max: 500, avg: 35 },
  hardware: { min: 50, max: 5000, avg: 350 },
  software: { min: 0, max: 2000, avg: 120 },
  food: { min: 1, max: 80, avg: 12 },
  equipment: { min: 100, max: 10000, avg: 800 },
  vehicle: { min: 2000, max: 50000, avg: 12000 },
  raw_material: { min: 5, max: 500, avg: 45 },
  deed: { min: 1000, max: 500000, avg: 80000 },
  data: { min: 50, max: 5000, avg: 500 },
  document: { min: 5, max: 200, avg: 25 },
  advertising: { min: 50, max: 5000, avg: 400 },
  subscription: { min: 5, max: 500, avg: 60 },
  fintech: { min: 0, max: 1000, avg: 150 },
  telecom: { min: 10, max: 200, avg: 40 },
  automotive: { min: 20, max: 2000, avg: 120 },
  health: { min: 5, max: 500, avg: 60 },
  education: { min: 20, max: 500, avg: 150 },
  service: { min: 20, max: 2000, avg: 200 },
  fashion: { min: 10, max: 300, avg: 45 },
  home: { min: 20, max: 2000, avg: 150 }
};

export function getDefaultEconomyState() {
  return {
    inflationRate: ECON_CONSTANTS.BASE_INFLATION_RATE,
    unemploymentRate: ECON_CONSTANTS.BASE_UNEMPLOYMENT_RATE,
    gdpIndex: 100,
    consumerConfidence: 72,
    dotComBubble: 'peak',
    hargroveGdp: 2_400_000_000,
    totalTransactionVolume: 0,
    transactionLog: [],
    lastInflationAdjustMs: 0,
    npcPurchaseLog: [],
    priceIndex: {}
  };
}

export function ensureEconomy(st) {
  if (!st.economy) st.economy = getDefaultEconomyState();
  if (!st.economy.priceIndex) st.economy.priceIndex = {};
}

export function computeBuyPrice(basePrice, category, tags = []) {
  const st = getState();
  ensureEconomy(st);
  const base = Number(basePrice) || 0;
  if (base <= 0) return 0;
  const cat = String(category || 'consumer');
  const catIndex = st.economy.priceIndex?.[cat] ?? 1.0;
  const buzzMulti = computeBuzzMultiplier(tags, st);
  const supplyMod = computeSupplyModifier(tags, st);
  const tagStrs = (tags || []).map((t) => String(t).toLowerCase());
  const techTags = ['software', 'hardware', 'api', 'developer', 'enterprise', 'data', 'tech'];
  const isTech =
    tagStrs.some((t) => techTags.includes(t)) || ['hardware', 'software', 'data'].includes(cat);
  const dotComMod = isTech && st.economy.dotComBubble === 'peak' ? 1.08 : 1.0;
  const confidenceMod = 0.85 + (st.economy.consumerConfidence / 100) * 0.3;
  const raw = base * catIndex * buzzMulti * supplyMod * dotComMod * confidenceMod;
  return Math.round(Math.max(base * 0.5, Math.min(base * 3, raw)) * 100) / 100;
}

function computeBuzzMultiplier(tags, st) {
  if (!tags?.length) return 1.0;
  const buzzValues = tags.map((raw) => {
    const tag = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 30);
    if (!tag) return 1.0;
    const b = st.marketBuzz?.[tag];
    if (!b) return 1.0;
    const sentimentRatio = b.likes + b.dislikes > 0 ? (b.likes - b.dislikes) / (b.likes + b.dislikes) : 0;
    const purchaseHeat = Math.min(b.purchaseCountWindow / 20, 1);
    return 1 + sentimentRatio * 0.15 + purchaseHeat * 0.1;
  });
  const avg = buzzValues.reduce((s, v) => s + v, 0) / buzzValues.length;
  return Math.max(0.7, Math.min(1.5, avg));
}

function computeSupplyModifier(tags, st) {
  const hasShortage = (tags || []).some((raw) => {
    const t = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    return st.marketBuzz?.[t]?.shortage?.active;
  });
  const hasGlut = (tags || []).some((raw) => {
    const t = String(raw || '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');
    const b = t ? st.marketBuzz?.[t] : null;
    return b && b.purchaseCountWindow === 0 && b.mentions > 20;
  });
  if (hasShortage) return 1.2 + Math.random() * 0.3;
  if (hasGlut) return 0.75 + Math.random() * 0.1;
  return 1.0;
}

export function computeSellPrice(buyPrice, condition = 100, channel = 'marketplace') {
  const CHANNEL_MARGINS = {
    private: 0.82,
    marketplace: 0.72,
    wholesale: 0.57,
    liquidation: 0.42
  };
  const margin = CHANNEL_MARGINS[channel] ?? CHANNEL_MARGINS.marketplace;
  const conditionMod = 0.4 + (condition / 100) * 0.6;
  return Math.max(0, Math.round(buyPrice * margin * conditionMod * 100) / 100);
}

export function npcPurchaseDecision(actor, item, price) {
  const st = getState();
  ensureEconomy(st);
  const taglets = actor.taglets || [];
  const profile = getActorEconProfile(taglets);
  const profKey = String(actor.profession || 'Freelancer');
  const annualIncome = PROFESSION_INCOME[profKey] ?? 28000;
  const dailyNet = (annualIncome * (1 - ECON_CONSTANTS.INCOME_TAX_RATE)) / 365;
  const dailyDisposable = dailyNet * (1 - profile.savingsRate) - ECON_CONSTANTS.BASE_DAILY_EXPENSES * 0.3;
  if (dailyDisposable <= 0) {
    return { willBuy: false, probability: 0, reason: 'Insufficient income' };
  }
  const priceRatio = price / dailyDisposable;
  const baseSpendProbability = 0.8 / Math.max(1, priceRatio * profile.priceSensitivity);
  const cat = String(item.category || 'consumer');
  const catBonus = profile.preferCategories?.includes(cat) ? 1.3 : 1.0;
  const econMood = 0.7 + (st.economy.consumerConfidence / 100) * 0.6;
  const unemploymentMod = 1 - st.economy.unemploymentRate * 2;
  const buzzBonus = computeBuzzMultiplier(item.tags || [], st);
  const probability = Math.max(
    0,
    Math.min(0.98, baseSpendProbability * profile.spendRate * catBonus * econMood * unemploymentMod * buzzBonus)
  );
  const willBuy = Math.random() < probability;
  const reason = willBuy
    ? `${profKey} (income $${annualIncome.toLocaleString()}) found ${item.name} affordable`
    : priceRatio > 2
    ? 'Price too high relative to income'
    : econMood < 0.8
    ? 'Low consumer confidence'
    : 'Chose not to purchase';
  return { willBuy, probability, reason };
}

export function getActorEconProfile(taglets) {
  for (const tag of taglets || []) {
    if (TAGLET_ECON_PROFILE[tag]) return TAGLET_ECON_PROFILE[tag];
  }
  return DEFAULT_ECON_PROFILE;
}

/**
 * @param {number} simMs — current sim elapsed (used for dot-com calendar)
 */
export function tickEconomy(simMs) {
  const t = Number(simMs) || getState().sim?.elapsedMs || 0;
  const daysSinceLaunch = t / SIM_DAY_MS;

  patchState((s) => {
    ensureEconomy(s);
    const dailyInflation = s.economy.inflationRate / 365;
    for (const cat of Object.keys(CATEGORY_BASE_PRICES)) {
      s.economy.priceIndex[cat] = s.economy.priceIndex[cat] ?? 1.0;
      s.economy.priceIndex[cat] *= 1 + dailyInflation;
      if (['hardware', 'software', 'data'].includes(cat) && s.economy.dotComBubble === 'peak') {
        s.economy.priceIndex[cat] *= 1 + dailyInflation * 0.5;
      }
      s.economy.priceIndex[cat] = Math.min(2, s.economy.priceIndex[cat]);
    }

    const rivals = s.rivalCompanies || [];
    const avgSentiment = rivals.length
      ? rivals.reduce((sum, c) => sum + (c.publicSentiment || 60), 0) / rivals.length
      : 60;
    const gdpDrift = (avgSentiment - 60) * 0.01;
    s.economy.gdpIndex = Math.max(60, Math.min(140, s.economy.gdpIndex + gdpDrift + (Math.random() - 0.5) * 0.5));

    const playerNotoriety = s.corporateProfile?.notoriety || 0;
    const notorietyDrag = playerNotoriety > 50 ? -2 : 0;
    s.economy.consumerConfidence = Math.max(
      20,
      Math.min(
        95,
        s.economy.consumerConfidence +
          (s.economy.gdpIndex - 100) * 0.05 +
          notorietyDrag +
          (Math.random() - 0.5) * 1.5
      )
    );

    const layoffCompanies = rivals.filter((c) => c.publicSentiment < 35).length;
    const hiringCompanies = rivals.filter((c) => c.publicSentiment > 70).length;
    s.economy.unemploymentRate = Math.max(0.02, Math.min(0.15,
      s.economy.unemploymentRate + layoffCompanies * 0.001 - hiringCompanies * 0.001
    ));

    if (daysSinceLaunch > 400 && s.economy.dotComBubble === 'peak') {
      s.economy.dotComBubble = 'bubble';
      s.economy.priceIndex.hardware = (s.economy.priceIndex.hardware || 1) * 1.15;
      s.economy.priceIndex.software = (s.economy.priceIndex.software || 1) * 1.15;
    }
    if (daysSinceLaunch > 450 && s.economy.dotComBubble === 'bubble') {
      s.economy.dotComBubble = 'burst';
      s.economy.priceIndex.hardware = (s.economy.priceIndex.hardware || 1) * 0.6;
      s.economy.priceIndex.software = (s.economy.priceIndex.software || 1) * 0.55;
      s.economy.gdpIndex *= 0.85;
      s.economy.consumerConfidence = Math.max(20, s.economy.consumerConfidence - 25);
      s.economy._justBurst = true;
    }

    const dailyVolume = s.economy.totalTransactionVolume;
    if (dailyVolume > 0) {
      s.economy.transactionLog.push({ simMs: t, volume: dailyVolume, gdpIndex: s.economy.gdpIndex });
      if (s.economy.transactionLog.length > 30) s.economy.transactionLog.shift();
      s.economy.totalTransactionVolume = 0;
    }
    return s;
  });

  emit('economy:daily', {
    gdpIndex: getState().economy?.gdpIndex,
    consumerConfidence: getState().economy?.consumerConfidence,
    inflationRate: getState().economy?.inflationRate,
    unemploymentRate: getState().economy?.unemploymentRate,
    dotComBubble: getState().economy?.dotComBubble
  });

  if (getState().economy?._justBurst) {
    patchState((s) => {
      if (s.economy) delete s.economy._justBurst;
      return s;
    });
    emit('news:breaking', {
      headline: 'DOT-COM COLLAPSE: Tech stocks crash — Hargrove tech sector loses 40% in 48 hours',
      severity: 5
    });
  }
}

export function recordTransaction(amount, _category, _type = 'purchase') {
  patchState((s) => {
    ensureEconomy(s);
    s.economy.totalTransactionVolume = (s.economy.totalTransactionVolume || 0) + Math.abs(amount);
    return s;
  });
}

export function getEconomy() {
  return getState().economy || getDefaultEconomyState();
}
export function getGdpIndex() {
  return getEconomy().gdpIndex;
}
export function getConsumerConf() {
  return getEconomy().consumerConfidence;
}
export function getInflationRate() {
  return getEconomy().inflationRate;
}
export function getUnemploymentRate() {
  return getEconomy().unemploymentRate;
}
export function getDotComPhase() {
  return getEconomy().dotComBubble;
}
export function getCategoryPriceIndex(cat) {
  return getEconomy().priceIndex?.[cat] ?? 1.0;
}

export function getEconomySummary() {
  const ec = getEconomy();
  return {
    gdpIndex: ec.gdpIndex,
    gdpTrend: ec.gdpIndex > 102 ? '▲' : ec.gdpIndex < 98 ? '▼' : '─',
    confidence: ec.consumerConfidence,
    inflation: `${(ec.inflationRate * 100).toFixed(1)}%`,
    unemployment: `${(ec.unemploymentRate * 100).toFixed(1)}%`,
    dotComPhase: ec.dotComBubble,
    hargroveGdp: `$${(ec.hargroveGdp / 1e9).toFixed(1)}B`,
    bubbleWarning: ec.dotComBubble === 'bubble' || ec.dotComBubble === 'burst'
  };
}
