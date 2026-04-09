/**
 * player-interaction-replies.js — NPC reactions to player posts/comments/messages.
 * Uses player.acumen + AXIS scores + session affinity to pick tone and template.
 */
import { getState } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { getAffinityScore } from './social-affinity.js';
import { SIM_HOUR_MS } from './gameState.js';

/** @type {object|null} */
let templates = null;

const TONE_BUCKETS = ['supportive', 'neutral', 'cold', 'hostile', 'pedantic_low_acumen'];

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  if (!arr?.length) return '';
  return arr[Math.floor(rng() * arr.length)];
}

/**
 * Load reply templates from JSON. Called once during app init.
 * @param {(name: string) => Promise<unknown>} loadJson
 */
export async function initPlayerReplies(loadJson) {
  if (templates) return;
  try {
    if (loadJson) {
      const raw = await loadJson('npc-reply-templates.json');
      templates = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  } catch { /* */ }
  if (!templates || typeof templates !== 'object') {
    templates = { supportive: [], neutral: [], cold: [], hostile: [], pedantic_low_acumen: [], handles: [] };
  }
}

/**
 * Resolve NPC reply tone from game state signals.
 * @param {string|null} actorId responding NPC (null for anonymous)
 * @param {number} seed hash-based seed for variety
 * @returns {'supportive'|'neutral'|'cold'|'hostile'|'pedantic_low_acumen'}
 */
function resolveTone(actorId, seed) {
  const rng = mulberry32(seed >>> 0);
  const state = getState();
  const session = getSessionState();
  const acumen = Number(state.player?.acumen) || 0;
  const viewer = session.wahoo?.currentUser || 'guest';

  let axisScore = 0;
  if (actorId && window.AXIS?.getScore) {
    const raw = window.AXIS.getScore(actorId);
    axisScore = Number(raw) || 0;
  }

  let affinity = 0;
  if (actorId) {
    affinity = getAffinityScore(session, viewer, `actor:${actorId}`);
  }

  // Combined warmth: higher = more favorable toward player
  const warmth = (acumen * 0.4) + (axisScore * 0.3) + (affinity * 0.3);
  const roll = rng() * 30 - 15; // ±15 variance

  const score = warmth + roll;

  if (acumen < 15 && rng() < 0.35) return 'pedantic_low_acumen';
  if (score >= 40) return 'supportive';
  if (score >= 15) return 'neutral';
  if (score >= -10) return 'cold';
  return 'hostile';
}

function randomActorForReply(rng) {
  try {
    const raw = typeof window !== 'undefined' && window.ActorDB?.getAllRaw?.();
    const list = Array.isArray(raw) ? raw.filter(a => a?.active !== false && a?.actor_id && a?.role !== 'investigator') : [];
    if (!list.length) return null;

    // Bias toward AXIS-discovered actors (60% chance to pick from known contacts)
    if (window.AXIS?.getScore && rng() < 0.6) {
      const known = list.filter(a => {
        const s = window.AXIS.getScore(a.actor_id);
        return s != null && s !== 0;
      });
      if (known.length) return known[Math.floor(rng() * known.length)];
    }
    return list[Math.floor(rng() * list.length)];
  } catch { return null; }
}

function displayNameFor(actor) {
  if (!actor) return null;
  const pub = actor.public_profile?.display_name;
  if (pub && String(pub).trim()) return String(pub).trim().slice(0, 24);
  const full = actor.full_legal_name;
  if (full) {
    const parts = String(full).trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0]} ${parts[parts.length - 1][0]}.`;
    return parts[0];
  }
  return null;
}

/**
 * Generate 0–2 NPC reply objects to a player action.
 * @param {{ channel: string, postId?: string, playerText?: string, simMs: number }} opts
 * @returns {{ author: string, text: string, tone: string, actorId?: string, delayMs: number }[]}
 */
export function generatePlayerReplies(opts) {
  if (!templates) return [];
  const simMs = opts.simMs || 0;
  const baseSeed = (simMs ^ (opts.postId || opts.channel || '').length * 31) >>> 0;
  const rng = mulberry32(baseSeed);

  // 0–2 replies: 55% chance of at least 1, 25% chance of 2
  const count = rng() < 0.45 ? 0 : rng() < 0.65 ? 1 : 2;
  const replies = [];

  for (let i = 0; i < count; i++) {
    const actor = randomActorForReply(rng);
    const actorId = actor?.actor_id || null;
    const seed2 = (baseSeed + i * 7919 + (actorId?.charCodeAt(4) || 0)) >>> 0;
    const tone = resolveTone(actorId, seed2);
    const pool = templates[tone] || templates.neutral || [];
    const text = pick(mulberry32(seed2 + 1), pool);
    if (!text) continue;

    const author = displayNameFor(actor)
      || pick(rng, templates.handles || [])
      || 'Anonymous';

    const delayMs = Math.floor((1 + rng() * 3) * SIM_HOUR_MS);

    replies.push({ author, text, tone, actorId: actorId || undefined, delayMs });
  }
  return replies;
}

/**
 * Schedule delayed NPC replies to appear in session state after delayMs.
 * @param {{ channel: string, targetId: string, replies: object[], simMs: number }} opts
 */
export function schedulePlayerReplies(opts) {
  const { channel, targetId, replies, simMs } = opts;
  if (!replies?.length) return;
  patchSession(s => {
    if (!s.pendingPlayerReplies) s.pendingPlayerReplies = [];
    for (const r of replies) {
      s.pendingPlayerReplies.push({
        channel,
        targetId,
        author: r.author,
        text: r.text,
        tone: r.tone,
        actorId: r.actorId,
        dueSimMs: simMs + r.delayMs,
      });
    }
  });
}

/**
 * Called on every sim tick — delivers due replies into the appropriate feed.
 * @param {number} simMs current sim elapsed ms
 */
export function tickPlayerReplies(simMs) {
  const pending = getSessionState().pendingPlayerReplies || [];
  const due = pending.filter(r => simMs >= r.dueSimMs);
  if (!due.length) return;

  patchSession(s => {
    if (!s.pendingPlayerReplies) return;
    s.pendingPlayerReplies = s.pendingPlayerReplies.filter(r => simMs < r.dueSimMs);
  });

  for (const r of due) {
    deliverReply(r, simMs);
  }
}

function deliverReply(reply, simMs) {
  const { channel, targetId, author, text, actorId } = reply;
  const day = typeof window !== 'undefined' && window.getGameDayIndex ? window.getGameDayIndex() : 0;

  if (channel === 'mytube_comment') {
    patchSession(s => {
      if (!s.mytube?.comments) return;
      if (!Array.isArray(s.mytube.comments[targetId])) s.mytube.comments[targetId] = [];
      s.mytube.comments[targetId].push({
        id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        author, text, up: 0, down: 0, source: 'npc_reply', personality: reply.tone, postedGameDay: day
      });
    });
    return;
  }

  if (channel === 'review_bomber') {
    patchSession(s => {
      if (!s.reviewBomber?.liveComments) return;
      if (!s.reviewBomber.liveComments[targetId]) s.reviewBomber.liveComments[targetId] = [];
      s.reviewBomber.liveComments[targetId].push({
        author, text, ts: Date.now(), postedGameDay: day, source: 'npc_reply', personality: reply.tone
      });
    });
    return;
  }

  if (channel === 'pipeline_live') {
    patchSession(s => {
      if (!s.pipelineLive?.threads) return;
      if (!s.pipelineLive.threads[targetId]) s.pipelineLive.threads[targetId] = { comments: [] };
      if (!Array.isArray(s.pipelineLive.threads[targetId].comments)) s.pipelineLive.threads[targetId].comments = [];
      s.pipelineLive.threads[targetId].comments.push({
        id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        author, text, source: 'npc_reply', personality: reply.tone, postedGameDay: day
      });
    });
    return;
  }

  if (channel === 'yourspace_rtc') {
    patchSession(s => {
      if (!s.yourspace?.rtcFeed) return;
      s.yourspace.rtcFeed.push({
        id: `reply-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        actorId: actorId || undefined,
        author, text, simMs, timeLabel: ''
      });
    });
    return;
  }

  // Fallback: deliver as SMS if we have an actorId
  if (actorId && _smsReceive) {
    _smsReceive(actorId, text, simMs);
  }
}

/** @type {Function|null} */
let _smsReceive = null;
/** @type {Function|null} */
let _patchState = null;

/**
 * Wire optional late-bound deps to avoid circular imports.
 */
export function wireReplyDeps({ smsReceive, patchState } = {}) {
  if (smsReceive) _smsReceive = smsReceive;
  if (patchState) _patchState = patchState;
}

/**
 * Bump player acumen by a delta (clamped 0–100).
 */
export function adjustAcumen(delta) {
  if (!_patchState) return;
  _patchState(s => {
    s.player.acumen = Math.max(0, Math.min(100, (s.player.acumen || 0) + delta));
    return s;
  });
}
