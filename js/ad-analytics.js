/**
 * ad-analytics.js — Global Ad performance tracker.
 *
 * Tracks impressions, clicks, conversions, irritation scores and engagement
 * time per ad ID. Data persists in state.adAnalytics via patchState.
 *
 * Consumers:
 *   - worldnet-ads.js  → calls recordImpression on each paint, recordClick on creative click
 *   - worldnet-shop.js → calls recordConversion after a completed checkout
 *   - warehouse-tick.js / market-dynamics.js → read getAdToneForPage() for NPC behaviour
 */
import { getState, patchState } from './gameState.js';

/**
 * @typedef {{
 *   impressions: number,
 *   clicks: number,
 *   conversions: number,
 *   irritationScore: number,
 *   engagedMs: number,
 *   lastImpressionSimMs: number
 * }} AdRecord
 */

const DEBOUNCE_MS = 30_000; // min sim-ms between impression counts per ad

function ensureAnalytics(st) {
  if (!st.adAnalytics || typeof st.adAnalytics !== 'object') {
    st.adAnalytics = { byAdId: {} };
  }
  if (!st.adAnalytics.byAdId || typeof st.adAnalytics.byAdId !== 'object') {
    st.adAnalytics.byAdId = {};
  }
}

function getOrCreate(byAdId, adId) {
  if (!byAdId[adId]) {
    byAdId[adId] = {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      irritationScore: 0,
      engagedMs: 0,
      lastImpressionSimMs: 0
    };
  }
  return byAdId[adId];
}

/**
 * Record an impression for an ad. Debounced per sim-time so rapid re-renders
 * don't inflate counts.
 * @param {string} adId
 */
export function recordImpression(adId) {
  if (!adId) return;
  const id = String(adId);
  const now = getState().sim?.elapsedMs ?? 0;
  patchState((s) => {
    ensureAnalytics(s);
    const r = getOrCreate(s.adAnalytics.byAdId, id);
    if (now - r.lastImpressionSimMs >= DEBOUNCE_MS) {
      r.impressions += 1;
      r.lastImpressionSimMs = now;
    }
    return s;
  });
}

/**
 * Record a click (player or NPC) on an ad creative.
 * @param {string} adId
 */
export function recordClick(adId) {
  if (!adId) return;
  patchState((s) => {
    ensureAnalytics(s);
    getOrCreate(s.adAnalytics.byAdId, String(adId)).clicks += 1;
    return s;
  });
}

/**
 * Record a conversion (purchase completed while this ad was the last clicked).
 * @param {string} adId
 */
export function recordConversion(adId) {
  if (!adId) return;
  patchState((s) => {
    ensureAnalytics(s);
    getOrCreate(s.adAnalytics.byAdId, String(adId)).conversions += 1;
    return s;
  });
}

/**
 * Record an irritation event. Increments irritationScore by 1 per call.
 * NPC ad-reaction logic uses irritationScore / impressions as irritation rate.
 * @param {string} adId
 */
export function recordIrritation(adId) {
  if (!adId) return;
  patchState((s) => {
    ensureAnalytics(s);
    getOrCreate(s.adAnalytics.byAdId, String(adId)).irritationScore += 1;
    return s;
  });
}

/**
 * Record engagement time (ms a user/NPC spent interacting with content near this ad).
 * @param {string} adId
 * @param {number} ms
 */
export function recordEngagement(adId, ms) {
  if (!adId || !(ms > 0)) return;
  patchState((s) => {
    ensureAnalytics(s);
    getOrCreate(s.adAnalytics.byAdId, String(adId)).engagedMs += ms;
    return s;
  });
}

/**
 * Read-only snapshot of analytics for one ad.
 * @param {string} adId
 * @returns {AdRecord | null}
 */
export function getAdRecord(adId) {
  const st = getState();
  return st.adAnalytics?.byAdId?.[String(adId || '')] ?? null;
}

/**
 * Compute CTR (click-through rate) for an ad.
 * @param {string} adId
 * @returns {number} 0–1
 */
export function getAdCtr(adId) {
  const r = getAdRecord(adId);
  if (!r || r.impressions === 0) return 0;
  return r.clicks / r.impressions;
}

/**
 * Compute irritation rate (irritation per impression).
 * @param {string} adId
 * @returns {number} 0–1
 */
export function getAdIrritationRate(adId) {
  const r = getAdRecord(adId);
  if (!r || r.impressions === 0) return 0;
  return r.irritationScore / r.impressions;
}

/**
 * Aggregate tone for a page based on all ads that ran on it.
 * Returns a weighted composite: { bounce: number, engagement: number, conversion: number }
 * — values are multipliers (1.0 = neutral, >1 = boosted, <1 = reduced).
 *
 * @param {string[]} adIds ads that appeared on this page
 * @returns {{ bounce: number, engagement: number, conversion: number }}
 */
export function getPageAdOutcomeWeights(adIds) {
  if (!adIds?.length) return { bounce: 1, engagement: 1, conversion: 1 };

  let totalIrritWeight = 0;
  let totalEngageBoost = 0;
  let totalConvBoost = 0;
  let count = 0;

  for (const id of adIds) {
    const r = getAdRecord(id);
    if (!r) continue;
    const irrit = getAdIrritationRate(id);
    const ctr = getAdCtr(id);
    totalIrritWeight += irrit;
    totalEngageBoost += r.engagedMs > 0 ? Math.min(1, r.engagedMs / 60_000) : 0;
    totalConvBoost += ctr;
    count++;
  }

  if (count === 0) return { bounce: 1, engagement: 1, conversion: 1 };

  const avgIrrit = totalIrritWeight / count;
  const avgEngageBoost = totalEngageBoost / count;
  const avgConvBoost = totalConvBoost / count;

  return {
    bounce: 1 + avgIrrit * 0.5,         // irritating ads increase bounce probability
    engagement: 1 + avgEngageBoost * 0.3, // engaging ads extend time on page
    conversion: 1 + avgConvBoost * 0.2   // high-CTR ads nudge conversion odds
  };
}

/**
 * Return all ad analytics keyed by adId.
 * @returns {Record<string, AdRecord>}
 */
export function getAllAdAnalytics() {
  return getState().adAnalytics?.byAdId ?? {};
}
