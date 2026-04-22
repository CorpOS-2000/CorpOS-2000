/**
 * market-dynamics.js — Hashtag product tracking, price influences, supply shortages,
 * and NPC shop conversion using uxScore.
 */
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { rollD4 } from './d20.js';
import { getPageAdOutcomeWeights, getAllAdAnalytics } from './ad-analytics.js';

const SIM_DAY_MS = SIM_HOUR_MS * 24;

let _excuses = [];

/**
 * Load the excuse pool from JSON.
 */
export async function initMarketDynamics(loadJson) {
  try {
    const raw = await loadJson('market-excuses.json');
    _excuses = Array.isArray(raw) ? raw : [];
  } catch { _excuses = []; }
}

function ensureMarketBuzz(st) {
  if (!st.marketBuzz || typeof st.marketBuzz !== 'object') st.marketBuzz = {};
}

/**
 * Register a hashtag mention from a post/comment.
 * @param {string} tag product slug (e.g. 'coffee', 'laptop')
 * @param {'like'|'dislike'|'mention'} type
 */
export function recordHashtagEvent(tag, type = 'mention') {
  const key = normalizeTag(tag);
  if (!key) return;
  patchState(s => {
    ensureMarketBuzz(s);
    if (!s.marketBuzz[key]) s.marketBuzz[key] = { mentions: 0, likes: 0, dislikes: 0, purchaseCountWindow: 0, lastPurchaseSimMs: 0 };
    const b = s.marketBuzz[key];
    if (type === 'like') { b.likes++; b.mentions++; }
    else if (type === 'dislike') { b.dislikes++; b.mentions++; }
    else { b.mentions++; }
    return s;
  });
}

/**
 * Record a product purchase for market tracking.
 */
export function recordPurchase(tag, simMs) {
  const key = normalizeTag(tag);
  if (!key) return;
  patchState(s => {
    ensureMarketBuzz(s);
    if (!s.marketBuzz[key]) s.marketBuzz[key] = { mentions: 0, likes: 0, dislikes: 0, purchaseCountWindow: 0, lastPurchaseSimMs: 0 };
    s.marketBuzz[key].purchaseCountWindow++;
    s.marketBuzz[key].lastPurchaseSimMs = simMs;
    return s;
  });
}

/**
 * Scan text for #hashtags and record mentions.
 */
export function scanHashtags(text) {
  const matches = String(text || '').match(/#([a-zA-Z0-9_]+)/g);
  if (!matches) return;
  for (const m of matches) {
    recordHashtagEvent(m.slice(1), 'mention');
  }
}

function normalizeTag(raw) {
  return String(raw || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30) || null;
}

/**
 * Compute effective price multiplier for a product tag based on market buzz.
 * >1 = demand premium, <1 = oversupply discount.
 */
export function priceMultiplier(tag) {
  const key = normalizeTag(tag);
  if (!key) return 1;
  const buzz = getState().marketBuzz?.[key];
  if (!buzz) return 1;

  const sentimentRatio = buzz.likes + buzz.dislikes > 0
    ? (buzz.likes - buzz.dislikes) / (buzz.likes + buzz.dislikes)
    : 0;

  const purchaseHeat = Math.min(buzz.purchaseCountWindow / 20, 1); // 0-1 scale
  const mentionHeat = Math.min(buzz.mentions / 50, 1);

  // Positive sentiment + high purchase volume → price premium
  const multiplier = 1 + (sentimentRatio * 0.15) + (purchaseHeat * 0.10) + (mentionHeat * 0.05);
  return Math.max(0.5, Math.min(1.5, multiplier));
}

/**
 * Pick a random excuse from the pool. Deterministic if seed provided.
 */
export function pickExcuse(seed) {
  if (!_excuses.length) return 'Supply chain disruption — details pending.';
  const idx = seed != null ? (Math.abs(seed) % _excuses.length) : Math.floor(Math.random() * _excuses.length);
  return _excuses[idx];
}

/**
 * Get the full excuse pool for UI rendering.
 */
export function getExcusePool() { return _excuses; }

/**
 * Daily tick: decay purchase window counters and possibly trigger shortage events.
 */
export function tickMarketDaily() {
  const st = getState();
  if (!st.marketBuzz) return;

  patchState(s => {
    ensureMarketBuzz(s);
    for (const key of Object.keys(s.marketBuzz)) {
      const b = s.marketBuzz[key];
      b.purchaseCountWindow = Math.max(0, Math.floor(b.purchaseCountWindow * 0.85));
      // Slowly decay mentions over time
      if (b.mentions > 5) b.mentions = Math.floor(b.mentions * 0.95);
    }

    // Chance of random shortage event on one product
    if (Math.random() < 0.15) {
      const keys = Object.keys(s.marketBuzz).filter(k => s.marketBuzz[k].purchaseCountWindow > 0);
      if (keys.length) {
        const target = keys[Math.floor(Math.random() * keys.length)];
        if (!s.marketBuzz[target].shortage) {
          s.marketBuzz[target].shortage = {
            active: true,
            excuse: pickExcuse(Date.now()),
            startSimMs: s.sim?.elapsedMs || 0,
            durationDays: 2 + rollD4(),
          };
        }
      }
    }

    // Expire old shortages
    const simMs = s.sim?.elapsedMs || 0;
    for (const key of Object.keys(s.marketBuzz)) {
      const sh = s.marketBuzz[key].shortage;
      if (sh?.active && simMs > sh.startSimMs + sh.durationDays * SIM_DAY_MS) {
        delete s.marketBuzz[key].shortage;
      }
    }
    return s;
  });
}

/**
 * Compute NPC add-to-cart probability modifier based on a site's uxScore,
 * further adjusted by the page's ad tone (conversion boost from good ad CTR,
 * dampening from high irritation/bounce).
 * Range: 0.1 (terrible site + irritating ads) to 2.0 (great site + effective ads).
 * @param {number} uxScore
 * @param {string[]} [pageAdIds] optional ad IDs for the page to factor in ad tone
 */
export function npcConversionModifier(uxScore, pageAdIds = []) {
  const score = Number(uxScore) || 0;
  let base;
  if (score <= 0) base = 0.3;
  else if (score >= 60) base = 1.5;
  else base = 0.3 + (score / 60) * 1.2;

  if (!pageAdIds.length) return base;
  const adW = getPageAdOutcomeWeights(pageAdIds);
  // Conversion boost amplified, bounce dampens
  const adModifier = adW.conversion * (1 / adW.bounce);
  return Math.max(0.1, Math.min(2.0, base * adModifier));
}

/**
 * Get ad IDs registered for a given page key from analytics store.
 * Used by ticks to pass relevant ad IDs to npcConversionModifier.
 * @param {string} _pageKey
 * @returns {string[]}
 */
export function getAdsForPage(_pageKey) {
  const all = getAllAdAnalytics();
  // Simple heuristic: return all ad IDs that have any impressions
  // (a more precise approach would require page-keyed ad storage)
  return Object.keys(all).filter((id) => (all[id]?.impressions ?? 0) > 0);
}

/**
 * Get market data for a product tag (for analytics UI).
 */
export function getMarketData(tag) {
  const key = normalizeTag(tag);
  if (!key) return null;
  return getState().marketBuzz?.[key] || null;
}

/**
 * Get all tracked product tags with their data.
 */
export function getAllMarketData() {
  const buzz = getState().marketBuzz || {};
  return Object.entries(buzz).map(([tag, data]) => ({ tag, ...data }));
}
