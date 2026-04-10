/**
 * notification-sound.js — Web Audio two-tone notification and ring pattern.
 * No audio files needed; everything is synthesised via OscillatorNode.
 */

export const NotificationSound = {

  /** @type {AudioContext | null} */
  ctx: null,

  getContext() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.ctx;
  },

  /** Two-tone peek notification: high (1400 Hz) then low (900 Hz). */
  play() {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this._playTones(ctx));
    } else {
      this._playTones(ctx);
    }
  },

  _playTones(ctx) {
    const now = ctx.currentTime;
    this._tone(ctx, 1400, now, 0.06, 0.04);
    this._tone(ctx, 900, now + 0.09, 0.06, 0.04);
  },

  /** Three-tone ring burst: high-low-high. Loop externally with setInterval. */
  playRing() {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this._playRingPattern(ctx));
    } else {
      this._playRingPattern(ctx);
    }
  },

  _playRingPattern(ctx) {
    const now = ctx.currentTime;
    this._tone(ctx, 1200, now, 0.12, 0.03);
    this._tone(ctx, 850, now + 0.15, 0.12, 0.03);
    this._tone(ctx, 1200, now + 0.30, 0.12, 0.03);
  },

  /**
   * @param {AudioContext} ctx
   * @param {number} frequency  Hz
   * @param {number} startTime  ctx.currentTime offset
   * @param {number} duration   seconds
   * @param {number} fadeOut    seconds of linear fade at tail
   */
  _tone(ctx, frequency, startTime, duration, fadeOut) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.3, startTime + 0.005);
    gain.gain.linearRampToValueAtTime(0.3, startTime + duration - fadeOut);
    gain.gain.linearRampToValueAtTime(0, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  },
};
