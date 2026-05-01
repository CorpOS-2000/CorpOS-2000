/**
 * news-sentiment.js — Score Herald articles for NPC comment tone (great → terrible).
 * Uses headline/summary text, EventSystem registry fields, CCR kind, syndicated
 * comment ratios, linked product popularity, and macro economy mood.
 */

import { getState } from './gameState.js';
import { getProductEntry, normalizeProductKey } from './product-pulse.js';

const BAD_HINTS = [
  'crisis', 'jammed', 'delay', 'audit', 'knockoff', 'scandal', 'busy signal',
  'chargeback', 'blood', 'demand', 'back-order', 'terminated', 'cancelled',
  'hack', 'spam', 'warning', 'fine', 'investigation', 'outrage', 'shortage',
  'failure', 'breach', 'sued', 'hostile', 'panic', 'jam', 'queued', 'storm'
];

const GOOD_HINTS = [
  'signs', 'milestone', 'opens', 'surge', 'live', 'upgrade', 'deal', 'split',
  'flies off', 'boom', 'tips up', 'rumors swirl', 'annex', 'pilots', 'growth',
  'hit', 'record', 'celebrate', 'launch', 'bonus', 'completed', 'signed'
];

/**
 * @param {object} item  Herald feed row (kind, headline, summary, severity?, reactions?, syndicatedComments?, productKey?)
 * @returns {{ score: number, tier: 'great'|'good'|'average'|'bad'|'terrible' }}
 */
export function computeNewsSentiment(item) {
  let score = 50;
  const tagBits = Array.isArray(item.tags) ? item.tags.join(' ') : '';
  const text = `${item.headline || ''} ${item.summary || ''} ${tagBits}`.toLowerCase();

  for (const w of BAD_HINTS) {
    if (text.includes(w)) score -= 3;
  }
  for (const w of GOOD_HINTS) {
    if (text.includes(w)) score += 2;
  }

  const kind = item.kind || '';

  if (kind === 'news_event') {
    const sev = Math.max(1, Math.min(5, Number(item.severity) || 1));
    score -= (sev - 1) * 7;
    const r = item.reactions || {};
    score += Math.min(12, Number(r.sympathy) || 0) * 1.5;
    score -= Math.min(12, Number(r.outrage) || 0) * 1.8;
    score -= Math.min(8, Number(r.indifferent) || 0) * 0.25;
  }

  if (kind === 'contract_completed') score += 14;
  if (kind === 'contract_cancelled') score -= 16;
  if (kind === 'negotiation') score += 5;
  if (kind === 'contract_created') score += 4;

  if (kind === 'syndicated' && Array.isArray(item.syndicatedComments)) {
    let net = 0;
    for (const c of item.syndicatedComments) {
      const likes = Number(c.likes) || 0;
      const dislikes = Number(c.dislikes) || 0;
      const ratio = (likes + 1) / (dislikes + 1);
      if (ratio > 1.35) net += 4;
      else if (ratio < 0.75) net -= 4;
    }
    score += Math.max(-18, Math.min(18, net));
  }

  if (kind === 'lore') {
    score += 3;
    if (text.includes('mandate') || text.includes('cage')) score -= 4;
    if (text.includes('dot-com') || text.includes('leases')) score += 3;
  }

  if (item.productKey) {
    try {
      const e = getProductEntry(normalizeProductKey(item.productKey));
      const pop = typeof e.popularity === 'number' ? e.popularity : 50;
      score += (pop - 50) * 0.22;
    } catch {
      /* ignore */
    }
  }

  const st = getState();
  const conf = Number(st.economy?.consumerConfidence);
  if (!Number.isNaN(conf)) score += (conf - 72) * 0.12;
  const unemp = Number(st.economy?.unemploymentRate);
  if (!Number.isNaN(unemp)) score -= unemp * 40;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let tier = 'average';
  if (score >= 80) tier = 'great';
  else if (score >= 62) tier = 'good';
  else if (score >= 40) tier = 'average';
  else if (score >= 22) tier = 'bad';
  else tier = 'terrible';

  return { score, tier };
}

/** Mutates feed row with newsScore + newsTier (safe on plain objects). */
export function attachNewsSentiment(item) {
  if (!item || typeof item !== 'object') return item;
  const { score, tier } = computeNewsSentiment(item);
  item.newsScore = score;
  item.newsTier = tier;
  return item;
}
