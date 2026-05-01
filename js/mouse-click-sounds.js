/**
 * Global primary-button click sounds — `assets/mouse press.mp3` / `assets/mouse depress.mp3`.
 *
 * Pointer **down**: play **only** mouse press (stops any still-playing depress from earlier).
 * Pointer **up**: play mouse depress **only** if that pointer had a press here.
 * **pointercancel**: disarm and silence (no depress — only real release plays depress).
 * Skips `#speed-controls` (those use `assets/time control/` SFX).
 */

const BASE = 'assets/';
const FILE_PRESS = 'mouse press.mp3';
const FILE_DEPRESS = 'mouse depress.mp3';

const VOLUME = 0.72;

/** @type {HTMLAudioElement | null} */
let pressEl = null;
/** @type {HTMLAudioElement | null} */
let depressEl = null;
/** Pointers whose down was skipped (e.g. speed bar) — matching up/cancel is ignored */
const skippedPointerIds = new Set();
/** Pointers that played mouse press and are waiting for **pointerup** before depress */
const armedPointerIds = new Set();

function href(file) {
  try {
    return new URL(BASE + file, window.location.href).href;
  } catch {
    return BASE + encodeURIComponent(file);
  }
}

function ensure() {
  if (typeof document === 'undefined') return;
  if (!pressEl) {
    pressEl = new Audio(href(FILE_PRESS));
    pressEl.preload = 'auto';
    pressEl.volume = VOLUME;
  }
  if (!depressEl) {
    depressEl = new Audio(href(FILE_DEPRESS));
    depressEl.preload = 'auto';
    depressEl.volume = VOLUME;
  }
}

function cut(el) {
  if (!el) return;
  try {
    el.pause();
    el.currentTime = 0;
  } catch {
    /* ignore */
  }
}

function safePlay(el) {
  if (!el) return;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function skipGlobalMouseSound(target) {
  const el = target && typeof target.closest === 'function' ? target : null;
  if (!el) return false;
  if (el.closest('#speed-controls')) return true;
  return false;
}

function playPress() {
  ensure();
  cut(depressEl);
  cut(pressEl);
  safePlay(pressEl);
}

function playDepress() {
  ensure();
  cut(pressEl);
  cut(depressEl);
  safePlay(depressEl);
}

/**
 * Clears skip/armed state for this pointer; returns true if we should play mouse depress (armed press existed).
 * @param {PointerEvent} e
 */
function takeArmedPointer(e) {
  if (skippedPointerIds.has(e.pointerId)) {
    skippedPointerIds.delete(e.pointerId);
    return false;
  }
  return armedPointerIds.delete(e.pointerId);
}

export function initMouseClickSounds() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.documentElement.dataset.mouseClickSoundsWired === '1') return;
  document.documentElement.dataset.mouseClickSoundsWired = '1';

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      if (skipGlobalMouseSound(e.target)) {
        skippedPointerIds.add(e.pointerId);
        return;
      }
      skippedPointerIds.delete(e.pointerId);
      armedPointerIds.add(e.pointerId);
      playPress();
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    'pointerup',
    (e) => {
      if (e.button !== 0) return;
      if (!takeArmedPointer(e)) return;
      playDepress();
    },
    { capture: true, passive: true }
  );

  window.addEventListener(
    'pointercancel',
    (e) => {
      if (skippedPointerIds.has(e.pointerId)) {
        skippedPointerIds.delete(e.pointerId);
        return;
      }
      if (!armedPointerIds.delete(e.pointerId)) return;
      cut(pressEl);
      cut(depressEl);
    },
    { capture: true, passive: true }
  );
}
