import { emit } from './events.js';
import { getGameEpochMs, getState, patchState } from './gameState.js';

const pauseReasons = new Set();
let rafId = null;
let lastTs = 0;
const GAME_MS_PER_REAL_MS = 60;

export function pause(reason) {
  pauseReasons.add(reason);
}

export function unpause(reason) {
  pauseReasons.delete(reason);
}

export function isPaused() {
  return pauseReasons.size > 0 || getState().sim.speed === 0;
}

function tickSim(realDt) {
  const s = getState();
  if (pauseReasons.size > 0 || s.sim.speed === 0) return;
  const prevElapsed = s.sim.elapsedMs;
  const delta = realDt * s.sim.speed * GAME_MS_PER_REAL_MS;
  const nextElapsed = prevElapsed + delta;
  patchState((st) => {
    st.sim.elapsedMs = nextElapsed;
    return st;
  });
  const prevDate = new Date(getGameEpochMs() + prevElapsed);
  const nextDate = new Date(getGameEpochMs() + nextElapsed);
  emit('tick', { elapsedMs: nextElapsed, gameDate: nextDate });
  if (prevDate.getUTCHours() !== nextDate.getUTCHours()) {
    emit('hour', { gameDate: nextDate, hour: nextDate.getUTCHours() });
  }
  if (
    prevDate.getUTCDate() !== nextDate.getUTCDate() ||
    prevDate.getUTCMonth() !== nextDate.getUTCMonth() ||
    prevDate.getUTCFullYear() !== nextDate.getUTCFullYear()
  ) {
    emit('dayChanged', { gameDate: nextDate });
  }
}

function frame(ts) {
  if (lastTs === 0) lastTs = ts;
  const dt = Math.min(250, ts - lastTs);
  lastTs = ts;
  tickSim(dt);
  rafId = requestAnimationFrame(frame);
}

export function startClock() {
  if (rafId != null) return;
  lastTs = 0;
  rafId = requestAnimationFrame(frame);
}

export function stopClock() {
  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = null;
  lastTs = 0;
}

export function setSpeed(speed) {
  patchState((st) => {
    st.sim.speed = speed;
    return st;
  });
}

export function formatGameDateTime(date) {
  const w = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
  const mon = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
  ][date.getUTCMonth()];
  const d = date.getUTCDate();
  const y = date.getUTCFullYear();
  let h = date.getUTCHours();
  const m = date.getUTCMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mm = String(m).padStart(2, '0');
  return `${w} ${mon} ${d}, ${y}  ${h}:${mm} ${ap}`;
}

export function getCurrentGameDate() {
  return new Date(getGameEpochMs() + getState().sim.elapsedMs);
}

/** Whole sim days since epoch (for lightweight timestamps, e.g. comment threads). */
export function getGameDayIndex() {
  return Math.floor(Number(getState().sim?.elapsedMs || 0) / 86400000);
}

export const SIM_DAY_MS = 86400000;

/**
 * Advance a UTC Date by `n` business days (Mon–Fri only), returning
 * the start-of-day (00:00 UTC) Date of the resulting day.
 */
export function addBusinessDaysUtc(startDate, n) {
  const d = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  let remaining = n;
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return d;
}

/** Convert a target UTC Date into a sim elapsedMs value. */
export function simMsForDate(date) {
  return date.getTime() - getGameEpochMs();
}
