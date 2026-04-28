/**
 * Visit counters + first-seen tracking for WorldNet 100 pages.
 */
import { getState, patchState } from './gameState.js';

/**
 * @param {string} pageKey
 */
export function bumpWorldNetVisit(pageKey) {
  const k = String(pageKey || '');
  if (!k) return;
  patchState((st) => {
    st.worldnet = st.worldnet || {};
    st.worldnet.counters = st.worldnet.counters || {};
    st.worldnet.counters[k] = (st.worldnet.counters[k] || 0) + 1;
    st.worldnet.knownSites = st.worldnet.knownSites || {};
    if (st.worldnet.knownSites[k] == null) {
      st.worldnet.knownSites[k] = { firstSeenSimMs: st.sim?.elapsedMs || 0, listed99669: true };
    }
    return st;
  });
}

/**
 * @param {string} pageKey
 * @returns {number}
 */
export function getWorldNetVisitCount(pageKey) {
  return Number(getState().worldnet?.counters?.[pageKey]) || 0;
}
