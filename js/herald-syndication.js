/**
 * herald-syndication.js — Day-tick logic for "Top Internet Comments" Herald blocks.
 *
 * On each day tick:
 *  1. Tick EMA popularity for all known products.
 *  2. Pick up to 5 top-ratio syndicated comments from the pool.
 *  3. Generate a Herald `kind: 'syndicated'` entry from them.
 *  4. Apply ±Δ popularity to linked products based on ratio sentiment.
 */

import { getState, patchState } from './gameState.js';
import { getTopSyndicatedComments, tickAllProductPopularity, patchProductEntry, ensurePublicPulse } from './product-pulse.js';
import { emit } from './events.js';

const MAX_INJECTED = 5;
const MAX_HEADLINE_SYNDICATES = 10; // rolling cap on injected blocks in the feed
const POPULARITY_BUMP_PER_SYNDICATE = 3;

/**
 * Call this once per day tick. Handles popularity EMA and Herald syndication.
 * @param {number} simMs  Current sim elapsed ms.
 */
export function tickHeraldSyndication(simMs) {
  tickAllProductPopularity(simMs);
  injectSyndicatedHeraldBlocks(simMs);
}

function injectSyndicatedHeraldBlocks(simMs) {
  const top = getTopSyndicatedComments(MAX_INJECTED);
  if (!top.length) return;

  // Build a composite headline from the top comment
  const best = top[0];
  const excerpt = best.text.length > 90 ? best.text.slice(0, 90) + '…' : best.text;
  const sourceLabel = SOURCE_LABELS[best.source] || best.source;

  const headline = `Internet Roundup: Top Comments Across ${sourceLabel} and More`;
  const summary = top
    .slice(0, 3)
    .map((c, i) => `"${c.text.slice(0, 60)}${c.text.length > 60 ? '…' : ''}" — ${SOURCE_LABELS[c.source] || c.source}`)
    .join(' | ');

  const syndicatedEntry = {
    kind: 'syndicated',
    atSimMs: simMs,
    headline,
    summary,
    syndicatedComments: top.map((c) => ({
      text: c.text,
      source: c.source,
      productKey: c.productKey,
      likes: Number(c.likes) || 0,
      dislikes: Number(c.dislikes) || 0
    }))
  };

  patchState((st) => {
    ensurePublicPulse(st);
    if (!Array.isArray(st.publicPulse.syndicatedHeraldFeed)) st.publicPulse.syndicatedHeraldFeed = [];
    st.publicPulse.syndicatedHeraldFeed.unshift(syndicatedEntry);
    // Cap rolling buffer
    if (st.publicPulse.syndicatedHeraldFeed.length > MAX_HEADLINE_SYNDICATES) {
      st.publicPulse.syndicatedHeraldFeed.length = MAX_HEADLINE_SYNDICATES;
    }
    return st;
  });

  // Apply popularity delta to linked products
  for (const comment of top) {
    if (!comment.productKey) continue;
    const ratio = (comment.likes + 1) / (comment.dislikes + 1);
    const delta = ratio > 1.5 ? POPULARITY_BUMP_PER_SYNDICATE : ratio < 0.7 ? -POPULARITY_BUMP_PER_SYNDICATE : 0;
    if (delta !== 0) {
      patchProductEntry(comment.productKey, (e) => {
        e.popularity = Math.max(0, Math.min(100, (e.popularity || 50) + delta));
      });
    }
  }

  // Emit a breaking news event if top comment is exceptionally popular
  if (best.likes >= 50 && best.dislikes < best.likes * 0.2) {
    emit('news:breaking', { headline: `"${excerpt}" — Top comment trending on ${sourceLabel}` });
  }
}

const SOURCE_LABELS = {
  reviewbomber: 'Review Bomber',
  yourspace: 'YourSpace',
  webex: 'WebExploiter',
  webexploiter: 'WebExploiter',
  herald: 'Daily Herald',
  web: 'the Web'
};

/**
 * Get syndicated Herald blocks for injection into the merged feed.
 * Called by daily-herald.js's mergedHeraldFeed (imported & used there).
 */
export function getSyndicatedHeraldFeed() {
  return getState().publicPulse?.syndicatedHeraldFeed || [];
}
