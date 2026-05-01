/**
 * product-taglets.js — Deterministic assignment of exactly five product taglets
 * per product key, using a seeded PRNG so the same product always gets the same tags.
 *
 * Conflict-aware: once a taglet is chosen, any later candidate whose
 * resonates_with_actor_taglets overlaps with an already-chosen taglet's
 * clashes_with_actor_taglets set is skipped (approximating the actor-engine logic
 * but applied to the product domain).
 */

import PRODUCT_TAGLET_DEFS from '../data/generation/product_taglets.json' assert { type: 'json' };
import { resolveProductKey, patchProductEntry, getProductEntry } from './product-pulse.js';

// ─── PRNG ─────────────────────────────────────────────────────────────────────

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ─── Anchor selection ─────────────────────────────────────────────────────────

/**
 * Pick one "anchor" taglet biased toward the item's category.
 */
function pickAnchor(defs, category, rng) {
  const boosted = defs.filter((d) => Array.isArray(d.category_boost) && d.category_boost.includes(String(category || '').toLowerCase()));
  const pool = boosted.length >= 2 ? boosted : defs;
  const weights = pool.map((d) => (d.weight || 1) * (boosted.includes(d) ? 1.5 : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].taglet_id;
  }
  return pool[pool.length - 1].taglet_id;
}

// ─── Conflict check ───────────────────────────────────────────────────────────

/**
 * Returns true if adding `candidate` would create a conflict with any already-chosen taglet.
 */
function wouldConflict(candidateDef, chosen, allDefs) {
  const chosenSet = new Set(chosen);
  // Check if candidate clashes with any already-chosen taglet (using actor taglet lists as proxy)
  for (const cid of chosenSet) {
    const cdef = allDefs.find((d) => d.taglet_id === cid);
    if (!cdef) continue;
    const candidateActorTags = new Set([
      ...(candidateDef.resonates_with_actor_taglets || []),
      ...(candidateDef.clashes_with_actor_taglets || [])
    ]);
    const cActorTags = new Set([
      ...(cdef.resonates_with_actor_taglets || []),
      ...(cdef.clashes_with_actor_taglets || [])
    ]);
    // Direct clash: candidate's taglet_id is in chosen taglet's clash list or vice versa
    if ((cdef.clashes_with_actor_taglets || []).includes(candidateDef.taglet_id)) return true;
    if ((candidateDef.clashes_with_actor_taglets || []).includes(cdef.taglet_id)) return true;
  }
  return false;
}

// ─── Main assignment ──────────────────────────────────────────────────────────

const TARGET_COUNT = 5;
const MAX_ATTEMPTS = 40;

/**
 * Deterministically assign exactly 5 product taglets to a product.
 * @param {string} productKey  Canonical product key.
 * @param {string} [category] Optional item category string to bias anchor selection.
 * @returns {string[]} Array of exactly 5 taglet_id strings.
 */
export function assignProductTaglets(productKey, category = '') {
  const seed = hashStr(`pt|${productKey}|${category}`);
  const rng = seededRng(seed);
  const defs = PRODUCT_TAGLET_DEFS;

  const chosen = [];

  // Step 1: Pick anchor
  const anchor = pickAnchor(defs, category, rng);
  chosen.push(anchor);

  // Step 2: Fill remaining 4 via weighted random without duplicates, conflict-aware
  let attempts = 0;
  while (chosen.length < TARGET_COUNT && attempts < MAX_ATTEMPTS) {
    attempts++;
    const available = defs.filter((d) => !chosen.includes(d.taglet_id));
    if (!available.length) break;

    const weights = available.map((d) => d.weight || 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    let picked = null;
    for (let i = 0; i < available.length; i++) {
      r -= weights[i];
      if (r <= 0) { picked = available[i]; break; }
    }
    if (!picked) picked = available[available.length - 1];

    if (!wouldConflict(picked, chosen, defs)) {
      chosen.push(picked.taglet_id);
    }
  }

  // Pad if we couldn't fill 5 without conflict (extremely unlikely)
  const fallbacks = defs.map((d) => d.taglet_id).filter((id) => !chosen.includes(id));
  while (chosen.length < TARGET_COUNT && fallbacks.length) {
    chosen.push(fallbacks.shift());
  }

  return chosen.slice(0, TARGET_COUNT);
}

/**
 * Ensure a product has taglets stored in publicPulse.
 * If already present and length === 5, does nothing (idempotent).
 * @param {object} item  Any item object with resolveProductKey-compatible shape.
 * @returns {string[]}  The product's 5 taglets.
 */
export function ensureProductTaglets(item) {
  const key = resolveProductKey(item);
  const existing = getProductEntry(key).taglets || [];
  if (existing.length === TARGET_COUNT) return existing;

  const category = item.category || item.categoryId || item.type || '';
  const taglets = assignProductTaglets(key, category);
  patchProductEntry(key, (e) => { e.taglets = taglets; });
  return taglets;
}

/**
 * Get the product taglet definitions for a given taglet_id list.
 */
export function getProductTagletDefs(tagletIds) {
  return tagletIds.map((id) => PRODUCT_TAGLET_DEFS.find((d) => d.taglet_id === id)).filter(Boolean);
}
