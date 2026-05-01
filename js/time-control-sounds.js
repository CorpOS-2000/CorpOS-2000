/**
 * Time control bar — SFX from `assets/time control/` and looped× audio for 2×/4×/8×.
 * Speed is applied on pointer/keyboard *up* (depress SFX), not on down.
 * Loop audio is cut immediately on the next control press (down).
 *
 * × loops use Web Audio buffer sources (sample-accurate loop) instead of <audio loop>,
 * which avoids the usual MP3 gap between iterations. Falls back to HTMLAudioElement if decode fails.
 */

import { getState } from './gameState.js';

const TC_BASE = 'assets/time control/';
const FILE = {
  press: 'button press.mp3',
  depress: 'button depress.mp3',
  x2: 'x2.mp3',
  x4: 'x4.mp3',
  x8: 'x8.mp3'
};

const SFX_VOLUME = 0.85;

let pressEl = null;
let depressEl = null;
let loopEl = null;

/** @type {AudioContext | null} */
let loopCtx = null;
/** @type {GainNode | null} */
let loopGain = null;
/** @type {AudioBuffer | null} */
let loopBuf2 = null;
/** @type {AudioBuffer | null} */
let loopBuf4 = null;
/** @type {AudioBuffer | null} */
let loopBuf8 = null;
/** @type {AudioBufferSourceNode | null} */
let loopSource = null;
let loopBuffersReady = false;

/** @type {number | null} */
let activePointerId = null;
/** @type {HTMLButtonElement | null} */
let kbActiveBtn = null;
/** Button whose synthetic `click` should be swallowed after pointer/key completion */
let swallowClickForBtn = null;

function hrefFor(file) {
  try {
    return new URL(TC_BASE + file, window.location.href).href;
  } catch {
    return TC_BASE + encodeURIComponent(file);
  }
}

function ensureAudio() {
  if (typeof document === 'undefined') return;
  if (!pressEl) {
    pressEl = new Audio(hrefFor(FILE.press));
    pressEl.preload = 'auto';
    pressEl.volume = SFX_VOLUME;
  }
  if (!depressEl) {
    depressEl = new Audio(hrefFor(FILE.depress));
    depressEl.preload = 'auto';
    depressEl.volume = SFX_VOLUME;
  }
  if (!loopEl) {
    loopEl = new Audio();
    loopEl.preload = 'auto';
    loopEl.volume = SFX_VOLUME;
  }
}

function safePlay(el) {
  if (!el) return;
  const p = el.play();
  if (p && typeof p.catch === 'function') p.catch(() => {});
}

function resumeLoopCtx() {
  if (loopCtx?.state === 'suspended') {
    void loopCtx.resume().catch(() => {});
  }
}

async function preloadLoopBuffers() {
  if (loopBuffersReady || typeof fetch === 'undefined') return;
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return;
  try {
    loopCtx = new AC();
    loopGain = loopCtx.createGain();
    loopGain.gain.value = SFX_VOLUME;
    loopGain.connect(loopCtx.destination);

    const decode = async (name) => {
      const res = await fetch(hrefFor(name));
      if (!res.ok) throw new Error(String(res.status));
      const ab = await res.arrayBuffer();
      return loopCtx.decodeAudioData(ab.slice(0));
    };

    const [b2, b4, b8] = await Promise.all([decode(FILE.x2), decode(FILE.x4), decode(FILE.x8)]);
    loopBuf2 = b2;
    loopBuf4 = b4;
    loopBuf8 = b8;
    loopBuffersReady = true;
  } catch (e) {
    console.warn('[TimeControl] Web Audio loop preload failed:', e?.message || e);
    loopCtx = null;
    loopGain = null;
    loopBuf2 = loopBuf4 = loopBuf8 = null;
  }
}

function stopWebLoop() {
  if (loopSource) {
    try {
      loopSource.stop(0);
    } catch {
      /* already stopped */
    }
    try {
      loopSource.disconnect();
    } catch {
      /* ignore */
    }
    loopSource = null;
  }
}

function startWebLoop(v) {
  if (!loopBuffersReady || !loopCtx || !loopGain) return false;
  const buf = v === 2 ? loopBuf2 : v === 4 ? loopBuf4 : v === 8 ? loopBuf8 : null;
  if (!buf) return false;

  resumeLoopCtx();

  const src = loopCtx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.connect(loopGain);
  src.start(0);
  loopSource = src;
  return true;
}

function stopHtmlLoop() {
  if (!loopEl) return;
  try {
    loopEl.pause();
    loopEl.currentTime = 0;
    loopEl.loop = false;
    loopEl.removeAttribute('src');
    loopEl.load();
  } catch {
    /* ignore */
  }
}

function cutLoop() {
  stopWebLoop();
  stopHtmlLoop();
}

function startHtmlLoop(v) {
  ensureAudio();
  const file = v === 2 ? FILE.x2 : v === 4 ? FILE.x4 : FILE.x8;
  loopEl.pause();
  loopEl.src = hrefFor(file);
  loopEl.loop = true;
  loopEl.currentTime = 0;
  safePlay(loopEl);
}

function startLoopForSpeed(speed) {
  ensureAudio();
  const v = Number(speed) || 0;
  if (v !== 2 && v !== 4 && v !== 8) {
    cutLoop();
    return;
  }
  stopWebLoop();
  stopHtmlLoop();
  if (startWebLoop(v)) return;
  startHtmlLoop(v);
}

function playPress() {
  ensureAudio();
  resumeLoopCtx();
  depressEl.pause();
  depressEl.currentTime = 0;
  pressEl.currentTime = 0;
  safePlay(pressEl);
}

function playDepress() {
  ensureAudio();
  pressEl.pause();
  pressEl.currentTime = 0;
  depressEl.currentTime = 0;
  safePlay(depressEl);
}

/**
 * @param {number} speed
 * @param {() => void} setSpeed
 * @param {() => void} syncSpeedButtons
 */
function applySpeedAndLoop(speed, setSpeed, syncSpeedButtons) {
  setSpeed(speed);
  syncSpeedButtons();
  startLoopForSpeed(speed);
}

function restartLoopIfMultiplierAfterPreload() {
  const spd = Number(getState().sim?.speed) || 1;
  if (spd === 2 || spd === 4 || spd === 8) startLoopForSpeed(spd);
}

/**
 * @param {{ setSpeed: (n: number) => void, syncSpeedButtons: () => void }} deps
 */
export function wireTimeControlSounds({ setSpeed, syncSpeedButtons }) {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('speed-controls');
  if (!root || root.dataset.timeControlSoundsWired === '1') return;
  root.dataset.timeControlSoundsWired = '1';
  ensureAudio();
  void preloadLoopBuffers().then(() => restartLoopIfMultiplierAfterPreload());

  const btnList = () => [...root.querySelectorAll('button[data-speed]')];

  startLoopForSpeed(getState().sim?.speed ?? 1);

  for (const raw of btnList()) {
    const btn = /** @type {HTMLButtonElement} */ (raw);

    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (activePointerId != null) return;
      activePointerId = e.pointerId;
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      cutLoop();
      playPress();
    });

    btn.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      if (e.pointerId !== activePointerId) return;
      activePointerId = null;
      try {
        if (btn.hasPointerCapture(e.pointerId)) btn.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      playDepress();
      const v = Number(btn.getAttribute('data-speed'));
      if (!Number.isFinite(v)) return;
      swallowClickForBtn = btn;
      applySpeedAndLoop(v, setSpeed, syncSpeedButtons);
    });

    btn.addEventListener('lostpointercapture', () => {
      activePointerId = null;
      if (pressEl) {
        pressEl.pause();
        pressEl.currentTime = 0;
      }
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.repeat) return;
      e.preventDefault();
      if (kbActiveBtn) return;
      kbActiveBtn = btn;
      cutLoop();
      playPress();
    });

    btn.addEventListener('keyup', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (kbActiveBtn !== btn) return;
      e.preventDefault();
      kbActiveBtn = null;
      playDepress();
      const v = Number(btn.getAttribute('data-speed'));
      if (!Number.isFinite(v)) return;
      swallowClickForBtn = btn;
      applySpeedAndLoop(v, setSpeed, syncSpeedButtons);
    });

    btn.addEventListener('click', (e) => {
      if (swallowClickForBtn === btn) {
        swallowClickForBtn = null;
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }
}

/** Sync loop SFX to saved speed (e.g. after load); does not play UI clicks. */
export function syncTimeControlLoopToState() {
  ensureAudio();
  void preloadLoopBuffers().then(() => restartLoopIfMultiplierAfterPreload());
  startLoopForSpeed(getState().sim?.speed ?? 1);
}
