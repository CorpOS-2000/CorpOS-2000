/**
 * Combat operation cooldowns — keyed by arbitrary string, expires at sim elapsedMs.
 */
import { getState, patchState } from './gameState.js';

/** @returns {number} ms remaining until cooldown ends (0 = ready) */
export function combatCooldownRemaining(key) {
  const st = getState();
  const ends = st.combatCooldowns?.[key] || 0;
  const now = st.sim?.elapsedMs || 0;
  return Math.max(0, ends - now);
}

/** @param {string} key
 * @param {number} durationMs */
export function combatCooldownSet(key, durationMs) {
  patchState((s) => {
    s.combatCooldowns = s.combatCooldowns || {};
    const now = s.sim?.elapsedMs || 0;
    s.combatCooldowns[key] = now + Math.max(0, Number(durationMs) || 0);
    return s;
  });
}
