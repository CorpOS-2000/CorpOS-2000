/**
 * combat-audio.js
 * All combat sound effects via Web Audio API.
 * No audio files — everything synthesized.
 * Designed to feel like a Y2K terminal confirming operations.
 */

let _ctx = null;

function ctx() {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') {
    _ctx.resume().catch(() => {});
  }
  return _ctx;
}

// ── PRIMITIVE WAVEFORM BUILDERS ────────────────────────────────────────────────

function tone(freq, duration, type = 'sine', vol = 0.18, startDelay = 0) {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  const t0 = c.currentTime + startDelay;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  const end = t0 + duration;
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  osc.start(t0);
  osc.stop(end + 0.05);
}

function noise(duration, vol = 0.06, startDelay = 0) {
  const c = ctx();
  if (!c) return;
  const bufSize = Math.max(256, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  const gain = c.createGain();
  const filter = c.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  src.buffer = buffer;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(c.destination);
  const t0 = c.currentTime + startDelay;
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.start(t0);
  src.stop(t0 + duration + 0.05);
}

// ── COMPOSITE SOUNDS ──────────────────────────────────────────────────────────

export function playOperationStart() {
  tone(440, 0.08, 'square', 0.12, 0);
  tone(660, 0.08, 'square', 0.12, 0.12);
  tone(880, 0.08, 'square', 0.12, 0.24);
}

export function playRollTick() {
  for (let i = 0; i < 8; i++) {
    tone(200 + Math.random() * 400, 0.04, 'square', 0.06, i * 0.06);
  }
}

export function playHit() {
  tone(523, 0.1, 'sine', 0.2, 0);
  tone(659, 0.1, 'sine', 0.2, 0.08);
  tone(784, 0.2, 'sine', 0.22, 0.16);
  tone(1047, 0.25, 'sine', 0.18, 0.26);
}

export function playCriticalHit() {
  tone(523, 0.08, 'sine', 0.22, 0);
  tone(659, 0.08, 'sine', 0.22, 0.07);
  tone(784, 0.08, 'sine', 0.22, 0.14);
  tone(1047, 0.08, 'sine', 0.22, 0.21);
  tone(1319, 0.3, 'sine', 0.25, 0.28);
}

export function playMiss() {
  tone(400, 0.12, 'sawtooth', 0.1, 0);
  tone(280, 0.15, 'sawtooth', 0.08, 0.1);
  noise(0.12, 0.04, 0.22);
}

export function playDiscovered() {
  for (let i = 0; i < 4; i++) {
    tone(880, 0.08, 'square', 0.18, i * 0.16);
    tone(440, 0.08, 'square', 0.14, i * 0.16 + 0.08);
  }
  noise(0.3, 0.1, 0.64);
}

export function playDefenseBlocked() {
  tone(220, 0.05, 'square', 0.22, 0);
  tone(180, 0.1, 'square', 0.16, 0.04);
  noise(0.08, 0.08, 0.06);
}

export function playCooldownTick() {
  tone(300, 0.03, 'square', 0.04, 0);
}

export function playReadyAgain() {
  tone(660, 0.08, 'sine', 0.12, 0);
  tone(880, 0.12, 'sine', 0.14, 0.06);
}

export function playFederalAlert() {
  tone(1000, 0.5, 'square', 0.2, 0);
  tone(800, 0.5, 'square', 0.15, 0.25);
  noise(0.5, 0.12, 0);
}

export function playDataTransfer() {
  for (let i = 0; i < 6; i++) {
    const f = 300 + (i % 3) * 400;
    tone(f, 0.06, 'sine', 0.08, i * 0.08);
  }
}

export function playLegalProcessing() {
  const dtmf = [697, 770, 852, 941];
  for (let i = 0; i < 4; i++) {
    tone(dtmf[i], 0.08, 'sine', 0.12, i * 0.12);
    tone(dtmf[3 - i] * 1.5, 0.08, 'sine', 0.08, i * 0.12);
  }
}

export function playSignalSweep() {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = 'sine';
  const t0 = c.currentTime;
  osc.frequency.setValueAtTime(100, t0);
  osc.frequency.exponentialRampToValueAtTime(4000, t0 + 0.5);
  osc.frequency.exponentialRampToValueAtTime(100, t0 + 1.0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.15, t0 + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
  osc.start(t0);
  osc.stop(t0 + 1.1);
}

export const CombatAudio = {
  operationStart: playOperationStart,
  rollTick: playRollTick,
  hit: playHit,
  critHit: playCriticalHit,
  miss: playMiss,
  discovered: playDiscovered,
  defense: playDefenseBlocked,
  cooldownTick: playCooldownTick,
  readyAgain: playReadyAgain,
  federalAlert: playFederalAlert,
  dataTransfer: playDataTransfer,
  legalProcess: playLegalProcessing,
  signalSweep: playSignalSweep
};
