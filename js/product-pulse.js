/**
 * product-pulse.js — Canonical product key resolution, publicPulse product
 * entry management, and popularity / rating helpers.
 *
 * Works alongside marketBuzz (market-dynamics.js) — that module handles
 * raw hashtag mention/like/dislike counts; this module layers structured
 * ratings, explicit product taglets, and a popularity EMA on top.
 */

import { getState, patchState } from './gameState.js';

// ─── Key resolution ──────────────────────────────────────────────────────────

/**
 * Derive a stable, normalized product key from any item-like object.
 * Preference order: sourceSku → id → hashed (title|category).
 * @param {object} item
 * @returns {string}
 */
export function resolveProductKey(item) {
  if (!item || typeof item !== 'object') return 'unknown';
  const raw =
    item.sourceSku ||
    item.productKey ||
    item.id ||
    item.sku ||
    `${String(item.title || item.name || '').toLowerCase().trim()}|${String(item.category || item.categoryId || '').toLowerCase().trim()}`;
  return normalizeProductKey(raw);
}

export function normalizeProductKey(raw) {
  return String(raw || 'unknown')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_\-|.]/g, '')
    .slice(0, 64) || 'unknown';
}

// ─── Entry management ─────────────────────────────────────────────────────────

function defaultProductEntry() {
  return {
    taglets: [],
    ratingSum: 0,
    ratingCount: 0,
    popularity: 50,
    likes: 0,
    dislikes: 0,
    mentions: 0,
    salesVelocity: 0,
    lastBuzzSimMs: 0,
    lastPopularityTickSimMs: 0
  };
}

export function ensurePublicPulse(st) {
  if (!st.publicPulse || typeof st.publicPulse !== 'object') {
    st.publicPulse = { products: {}, herald: { articles: {}, playerVote: {} }, syndicatedComments: [] };
  }
  if (!st.publicPulse.products) st.publicPulse.products = {};
  if (!st.publicPulse.herald) st.publicPulse.herald = { articles: {}, playerVote: {} };
  if (!st.publicPulse.herald.articles) st.publicPulse.herald.articles = {};
  if (!st.publicPulse.herald.playerVote) st.publicPulse.herald.playerVote = {};
  if (!Array.isArray(st.publicPulse.syndicatedComments)) st.publicPulse.syndicatedComments = [];
}

/**
 * Get the publicPulse entry for a product key, creating defaults if absent.
 */
export function getProductEntry(productKey) {
  const st = getState();
  return st.publicPulse?.products?.[productKey] || defaultProductEntry();
}

/**
 * Patch a product entry's fields.
 * @param {string} productKey
 * @param {(entry: object) => void} mutate
 */
export function patchProductEntry(productKey, mutate) {
  patchState((st) => {
    ensurePublicPulse(st);
    if (!st.publicPulse.products[productKey]) {
      st.publicPulse.products[productKey] = defaultProductEntry();
    }
    mutate(st.publicPulse.products[productKey]);
    return st;
  });
}

// ─── Rating ───────────────────────────────────────────────────────────────────

/**
 * Record a 1–5 star rating for a product.
 */
export function recordProductRating(productKey, stars) {
  const s = Math.max(1, Math.min(5, Number(stars) || 3));
  patchProductEntry(productKey, (e) => {
    e.ratingSum += s;
    e.ratingCount += 1;
  });
}

/**
 * Average star rating (returns null if no ratings yet).
 */
export function getAverageRating(productKey) {
  const e = getProductEntry(productKey);
  if (!e.ratingCount) return null;
  return e.ratingSum / e.ratingCount;
}

// ─── Sentiment signals ────────────────────────────────────────────────────────

/**
 * Record a like or dislike for a product (e.g. from RTC, Review Bomber).
 * @param {string} productKey
 * @param {'like'|'dislike'|'mention'} type
 */
export function recordProductSignal(productKey, type) {
  const simMs = getState().sim?.elapsedMs ?? 0;
  patchProductEntry(productKey, (e) => {
    if (type === 'like') { e.likes = (e.likes || 0) + 1; e.mentions = (e.mentions || 0) + 1; }
    else if (type === 'dislike') { e.dislikes = (e.dislikes || 0) + 1; e.mentions = (e.mentions || 0) + 1; }
    else { e.mentions = (e.mentions || 0) + 1; }
    e.lastBuzzSimMs = simMs;
  });
}

/**
 * Record a sale for sales velocity tracking.
 */
export function recordProductSale(productKey) {
  const simMs = getState().sim?.elapsedMs ?? 0;
  patchProductEntry(productKey, (e) => {
    e.salesVelocity = (e.salesVelocity || 0) + 1;
    e.lastBuzzSimMs = simMs;
  });
}

// ─── Popularity formula ───────────────────────────────────────────────────────

const W_RATING = 30;
const W_SENTIMENT = 25;
const W_MENTIONS = 25;
const W_SALES = 20;

/**
 * Compute raw popularity [0–100] from a product entry.
 * Does NOT write back — call tickProductPopularity for EMA update.
 */
export function computeProductPopularity(entry) {
  if (!entry) return 50;
  const { likes = 0, dislikes = 0, mentions = 0, salesVelocity = 0, ratingSum = 0, ratingCount = 0 } = entry;

  const avgRating = ratingCount > 0 ? ratingSum / ratingCount : 3;
  const ratingScore = ((avgRating - 1) / 4) * 100; // 1–5 → 0–100

  const total = likes + dislikes;
  const sentimentScore = total > 0
    ? ((likes - dislikes) / total) * 100 * Math.min(1, total / 10) + 50
    : 50;

  const mentionScore = Math.min(100, Math.log1p(mentions) * 18);
  const salesScore = Math.min(100, Math.log1p(salesVelocity) * 22);

  const raw = (W_RATING * ratingScore + W_SENTIMENT * sentimentScore + W_MENTIONS * mentionScore + W_SALES * salesScore) / 100;
  return Math.max(0, Math.min(100, raw));
}

const POPULARITY_EMA_ALPHA = 0.25; // weight of new observation vs old (0=never updates, 1=instant)

/**
 * Tick EMA popularity for one product (call on day tick).
 */
export function tickProductPopularity(productKey, simMs) {
  patchProductEntry(productKey, (e) => {
    const fresh = computeProductPopularity(e);
    const old = typeof e.popularity === 'number' ? e.popularity : 50;
    e.popularity = old + POPULARITY_EMA_ALPHA * (fresh - old);
    e.lastPopularityTickSimMs = simMs;
    // Decay sales velocity slowly (rolling window approximation)
    if (typeof e.salesVelocity === 'number') e.salesVelocity *= 0.85;
  });
}

/**
 * Tick all known products on a day boundary.
 */
export function tickAllProductPopularity(simMs) {
  const keys = Object.keys(getState().publicPulse?.products || {});
  for (const key of keys) tickProductPopularity(key, simMs);
}

// ─── Price band ───────────────────────────────────────────────────────────────

/**
 * Suggested retail price band based on popularity (percentage multipliers on base price).
 * @param {string} productKey
 * @returns {{ min: number, median: number, max: number }} multipliers (1.0 = neutral)
 */
export function getPopularityPriceMultipliers(productKey) {
  const e = getProductEntry(productKey);
  const pop = typeof e.popularity === 'number' ? e.popularity : 50;

  // 0–100 popularity maps to roughly 0.6×–1.8× price range
  const base = 0.6 + (pop / 100) * 1.2;
  return {
    min: Math.max(0.5, base * 0.85),
    median: base,
    max: Math.min(2.5, base * 1.18)
  };
}

/**
 * Return suggested retail band in dollars given a base price.
 * @param {string} productKey
 * @param {number} basePrice
 */
export function getSuggestedRetailBand(productKey, basePrice) {
  const m = getPopularityPriceMultipliers(productKey);
  const b = Number(basePrice) || 0;
  return {
    min: Math.round(b * m.min * 100) / 100,
    median: Math.round(b * m.median * 100) / 100,
    max: Math.round(b * m.max * 100) / 100
  };
}

// ─── Herald article helpers ───────────────────────────────────────────────────

/**
 * Derive a stable article ID from kind + atSimMs + headline.
 */
export function makeArticleId(kind, atSimMs, headline) {
  const raw = `${kind}|${Math.round(atSimMs || 0)}|${String(headline || '').slice(0, 80)}`;
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `art_${(h >>> 0).toString(16)}`;
}

/**
 * Record a player like or dislike on a herald article.
 * @param {string} articleId
 * @param {'like'|'dislike'|null} vote
 */
export function recordHeraldVote(articleId, vote) {
  patchState((st) => {
    ensurePublicPulse(st);
    const prev = st.publicPulse.herald.playerVote[articleId];
    if (prev === vote) {
      // Toggle off
      delete st.publicPulse.herald.playerVote[articleId];
      if (st.publicPulse.herald.articles[articleId]) {
        if (prev === 'like') st.publicPulse.herald.articles[articleId].likes = Math.max(0, (st.publicPulse.herald.articles[articleId].likes || 1) - 1);
        else st.publicPulse.herald.articles[articleId].dislikes = Math.max(0, (st.publicPulse.herald.articles[articleId].dislikes || 1) - 1);
      }
    } else {
      // Reverse previous vote
      if (prev && st.publicPulse.herald.articles[articleId]) {
        if (prev === 'like') st.publicPulse.herald.articles[articleId].likes = Math.max(0, (st.publicPulse.herald.articles[articleId].likes || 1) - 1);
        else st.publicPulse.herald.articles[articleId].dislikes = Math.max(0, (st.publicPulse.herald.articles[articleId].dislikes || 1) - 1);
      }
      st.publicPulse.herald.playerVote[articleId] = vote;
      if (!st.publicPulse.herald.articles[articleId]) st.publicPulse.herald.articles[articleId] = { likes: 0, dislikes: 0 };
      if (vote === 'like') st.publicPulse.herald.articles[articleId].likes = (st.publicPulse.herald.articles[articleId].likes || 0) + 1;
      else st.publicPulse.herald.articles[articleId].dislikes = (st.publicPulse.herald.articles[articleId].dislikes || 0) + 1;
    }
    return st;
  });
}

/**
 * Get current like/dislike counts and player vote for an article.
 */
export function getArticleEngagement(articleId) {
  const pp = getState().publicPulse;
  return {
    likes: pp?.herald?.articles?.[articleId]?.likes || 0,
    dislikes: pp?.herald?.articles?.[articleId]?.dislikes || 0,
    playerVote: pp?.herald?.playerVote?.[articleId] || null
  };
}

/**
 * Apply NPC-driven Herald engagement in one state patch (does not touch playerVote).
 * When productKey is set, mirrors sentiment into publicPulse.products via the same
 * fields as recordProductSignal (taglet / pulse ecosystem).
 * @param {Array<{ articleId: string, vote: 'like'|'dislike', productKey?: string|null }>} entries
 */
export function batchApplyHeraldCrowdVotes(entries) {
  if (!Array.isArray(entries) || !entries.length) return;
  patchState((st) => {
    ensurePublicPulse(st);
    const simMs = st.sim?.elapsedMs ?? 0;
    for (const row of entries) {
      const articleId = row?.articleId;
      const vote = row?.vote;
      if (!articleId || (vote !== 'like' && vote !== 'dislike')) continue;
      if (!st.publicPulse.herald.articles[articleId]) {
        st.publicPulse.herald.articles[articleId] = { likes: 0, dislikes: 0 };
      }
      const art = st.publicPulse.herald.articles[articleId];
      if (vote === 'like') art.likes = (art.likes || 0) + 1;
      else art.dislikes = (art.dislikes || 0) + 1;

      const pk = row.productKey != null && String(row.productKey).trim()
        ? normalizeProductKey(row.productKey)
        : '';
      if (!pk || pk === 'unknown') continue;
      if (!st.publicPulse.products[pk]) st.publicPulse.products[pk] = defaultProductEntry();
      const e = st.publicPulse.products[pk];
      if (vote === 'like') {
        e.likes = (e.likes || 0) + 1;
        e.mentions = (e.mentions || 0) + 1;
      } else {
        e.dislikes = (e.dislikes || 0) + 1;
        e.mentions = (e.mentions || 0) + 1;
      }
      e.lastBuzzSimMs = simMs;

      const buzzKey = String(pk || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
      if (buzzKey) {
        if (!st.marketBuzz || typeof st.marketBuzz !== 'object') st.marketBuzz = {};
        if (!st.marketBuzz[buzzKey]) {
          st.marketBuzz[buzzKey] = {
            mentions: 0,
            likes: 0,
            dislikes: 0,
            purchaseCountWindow: 0,
            lastPurchaseSimMs: 0
          };
        }
        const b = st.marketBuzz[buzzKey];
        if (vote === 'like') {
          b.likes = (b.likes || 0) + 1;
          b.mentions = (b.mentions || 0) + 1;
        } else {
          b.dislikes = (b.dislikes || 0) + 1;
          b.mentions = (b.mentions || 0) + 1;
        }
      }
    }
    return st;
  });
}

// ─── Syndicated comment registry ──────────────────────────────────────────────

const MAX_SYNDICATED = 200;

/**
 * Add a comment to the syndicated pool (called from RB, RTC, blogs).
 * @param {{ text: string, likes?: number, dislikes?: number, source: string, productKey?: string, articleId?: string }} comment
 */
export function recordSyndicatedComment(comment) {
  patchState((st) => {
    ensurePublicPulse(st);
    const arr = st.publicPulse.syndicatedComments;
    arr.push({
      text: String(comment.text || '').slice(0, 280),
      likes: Number(comment.likes) || 0,
      dislikes: Number(comment.dislikes) || 0,
      source: String(comment.source || 'web'),
      productKey: comment.productKey || null,
      articleId: comment.articleId || null,
      addedSimMs: st.sim?.elapsedMs || 0
    });
    if (arr.length > MAX_SYNDICATED) arr.splice(0, arr.length - MAX_SYNDICATED);
    return st;
  });
}

/**
 * Get top N comments by Wilson-score-like ratio (likes+1)/(dislikes+1),
 * optionally filtered by productKey.
 */
export function getTopSyndicatedComments(n = 5, productKey = null) {
  const arr = getState().publicPulse?.syndicatedComments || [];
  const pool = productKey ? arr.filter((c) => c.productKey === productKey) : arr;
  return pool
    .filter((c) => (c.likes + c.dislikes) >= 2)
    .sort((a, b) => ((b.likes + 1) / (b.dislikes + 1)) - ((a.likes + 1) / (a.dislikes + 1)))
    .slice(0, n);
}
