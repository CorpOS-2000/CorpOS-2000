/**
 * taglet-affinity.js — Pure affinity scoring between an NPC (or player) and a product.
 *
 * Inputs:  actorTaglets[]  (from actor.taglets or TagletEngine)
 *          productTaglets[] (5 taglet_id strings from product-taglets.js)
 *
 * Output:  { score: number[-100,100], band: 'love'|'like'|'neutral'|'dislike'|'hate' }
 *
 * Also exports helper functions for generating affinity-biased comment copy
 * and vote propensity, used by Review Bomber and RTC post generators.
 */

import PRODUCT_TAGLET_DEFS from '../data/generation/product_taglets.json' assert { type: 'json' };
import { getState } from './gameState.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const RESONANCE_BONUS = 18;   // per resonance hit
const CLASH_PENALTY   = 22;   // per clash hit
const SCORE_CLAMP     = 100;

// ─── Band thresholds ──────────────────────────────────────────────────────────

const BANDS = [
  { threshold: 55,  band: 'love'    },
  { threshold: 20,  band: 'like'    },
  { threshold: -20, band: 'neutral' },
  { threshold: -55, band: 'dislike' },
  { threshold: -Infinity, band: 'hate' }
];

function scoreToBand(score) {
  for (const { threshold, band } of BANDS) {
    if (score >= threshold) return band;
  }
  return 'hate';
}

// ─── Core scorer ──────────────────────────────────────────────────────────────

/**
 * Compute affinity score and band.
 * @param {string[]} actorTaglets  Actor (NPC or player) taglet IDs.
 * @param {string[]} productTaglets  5 product taglet IDs.
 * @returns {{ score: number, band: string }}
 */
export function computeAffinity(actorTaglets, productTaglets) {
  if (!Array.isArray(actorTaglets) || !actorTaglets.length) {
    return { score: 0, band: 'neutral' };
  }
  if (!Array.isArray(productTaglets) || !productTaglets.length) {
    return { score: 0, band: 'neutral' };
  }

  const actorSet = new Set(actorTaglets.map((t) => String(t)));
  let score = 0;

  for (const pid of productTaglets) {
    const def = PRODUCT_TAGLET_DEFS.find((d) => d.taglet_id === pid);
    if (!def) continue;

    for (const r of def.resonates_with_actor_taglets || []) {
      if (actorSet.has(r)) score += RESONANCE_BONUS;
    }
    for (const c of def.clashes_with_actor_taglets || []) {
      if (actorSet.has(c)) score -= CLASH_PENALTY;
    }
  }

  score = Math.max(-SCORE_CLAMP, Math.min(SCORE_CLAMP, score));
  return { score, band: scoreToBand(score) };
}

// ─── Player affinity helper ───────────────────────────────────────────────────

/**
 * Compute affinity for the current logged-in player.
 * Falls back to neutral if no taglets are set.
 * @param {string[]} productTaglets
 */
export function computePlayerAffinity(productTaglets) {
  const st = getState();
  const taglets = st.player?.taglets || ['casual_speaker', 'civic_minded'];
  return computeAffinity(taglets, productTaglets);
}

// ─── Vote propensity ──────────────────────────────────────────────────────────

/**
 * Given an affinity band, return the probability that an NPC posts a "like" vote.
 * (Used by RTC / Review Bomber vote generators.)
 */
const VOTE_LIKE_PROB = {
  love: 0.88,
  like: 0.65,
  neutral: 0.45,
  dislike: 0.22,
  hate: 0.07
};

export function likeProbability(band) {
  return VOTE_LIKE_PROB[band] ?? 0.45;
}

/**
 * Roll a Herald article 👍/👎 for an NPC crowd reaction using taglet resonance/clash
 * vs story topic taglets (same model as RTC / Review Bomber vote propensity).
 * @param {string[]} actorTaglets
 * @param {string[]} storyTopicTaglets
 * @param {() => number} rng  Returns [0,1)
 * @returns {'like'|'dislike'}
 */
export function rollHeraldCrowdVote(actorTaglets, storyTopicTaglets, rng) {
  const roll = typeof rng === 'function' ? rng : () => Math.random();
  const aff = computeAffinity(actorTaglets || [], storyTopicTaglets || []);
  return roll() < likeProbability(aff.band) ? 'like' : 'dislike';
}

// ─── Comment tone generation ──────────────────────────────────────────────────

const COMMENT_TEMPLATES = {
  love: [
    'Absolutely obsessed with this — best money I\'ve spent all year.',
    'Cannot recommend this enough. Five stars, would buy again.',
    'This is exactly what I needed. Spectacular quality.',
    'Tell everyone you know. Seriously impressive.',
    'Exceeds every expectation. A total game-changer.'
  ],
  like: [
    'Pretty solid pick overall. Happy with the purchase.',
    'Does what it says, no complaints here.',
    'Good value for the price — I\'d recommend it.',
    'Not perfect but definitely worth having.',
    'Solid product. Would consider buying again.'
  ],
  neutral: [
    'It\'s fine, I guess. Nothing to write home about.',
    'Average all around. Not bad, not great.',
    'Mediocre but functional. Does the job.',
    'I\'ve seen better but I\'ve definitely seen worse.',
    'Take it or leave it kind of product.'
  ],
  dislike: [
    'Disappointed. Expected more for what I paid.',
    'Lots of hype, not much substance. Skip it.',
    'Wouldn\'t buy again. There are better options.',
    'Falls apart faster than it should.',
    'Overhyped and underwhelming in practice.'
  ],
  hate: [
    'Absolute garbage. Complete waste of money.',
    'Returned immediately. Borderline scam.',
    'I want my money back. This is awful.',
    'Worst purchase I\'ve made this decade.',
    'Whoever approved this product should be embarrassed.'
  ]
};

/**
 * Pick a deterministic comment template for a given band and seed.
 * @param {string} band
 * @param {number} seed  Numeric seed (e.g. hash of actor+product).
 * @returns {string}
 */
export function pickAffinityComment(band, seed = 0) {
  const pool = COMMENT_TEMPLATES[band] || COMMENT_TEMPLATES.neutral;
  return pool[Math.abs(seed | 0) % pool.length];
}

// ─── Affinity "your angle" copy for Herald ────────────────────────────────────

const ANGLE_TEMPLATES = {
  love: [
    'Based on your interests, this is right up your alley.',
    'This product hits several of your top interest areas.'
  ],
  like: [
    'This aligns with a few things you follow closely.',
    'You might find this one worth a look.'
  ],
  neutral: [
    'No strong match with your current interests.',
    'A mixed fit given what you tend to follow.'
  ],
  dislike: [
    'This one is a bit outside your usual preferences.',
    'Your interest profile doesn\'t align well here.'
  ],
  hate: [
    'Based on your interests, this product is probably not for you.',
    'This goes against several things you care about.'
  ]
};

/**
 * Return 1–2 sentences for the Herald "Your angle" feature.
 * @param {string} band
 * @param {number} seed
 */
export function heraldAngleCopy(band, seed = 0) {
  const pool = ANGLE_TEMPLATES[band] || ANGLE_TEMPLATES.neutral;
  return pool[Math.abs(seed | 0) % pool.length];
}
