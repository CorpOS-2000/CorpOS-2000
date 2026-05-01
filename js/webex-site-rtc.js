/**
 * Per-pipeline-page WebEx "live chat" using the same text generator as yourspace-rtc
 * and sim-time batching like YourSpace.
 */

import { getSessionState, patchSession } from './sessionState.js';
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { formatGameDateTime, getCurrentGameDate } from './clock.js';
import { rollD4, rollD20 } from './d20.js';
import { applyAffinityDelta } from './social-affinity.js';
import { escapeHtml } from './identity.js';
import { generateYourspaceRtcPost } from './yourspace-rtc.js';
import { recordProductSignal, normalizeProductKey } from './product-pulse.js';

function wahooViewerKey() {
  const u = getSessionState().wahoo?.currentUser;
  return u && String(u).trim() ? String(u).trim() : 'guest';
}

function displayNameFromActor(actor) {
  if (!actor) return '';
  const pub = actor.public_profile?.display_name;
  if (pub && String(pub).trim()) return String(pub).trim().slice(0, 40);
  const full = actor.full_legal_name;
  if (full && String(full).trim()) {
    const parts = String(full).trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    return `${parts[0]} ${last.slice(0, 1)}.`;
  }
  const alias = (actor.aliases || [])[0];
  if (alias) return String(alias).slice(0, 40);
  return actor.actor_id || 'User';
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pageHasWebexLiveChat(page) {
  const cells = page?.webExLayout?.cells;
  return Array.isArray(cells) && cells.some((c) => c?.moduleId === 'live_chat');
}

function ensureWebexRtcRowIds(page) {
  const f = page.webexRtc?.feed;
  if (!Array.isArray(f)) return;
  f.forEach((row, i) => {
    if (row.id) return;
    const aid = String(row.actorId || 'x').replace(/[^a-z0-9_-]/gi, '');
    row.id = `wx-rtc-legacy-${row.simMs || 0}-${i}-${aid}`.slice(0, 80);
  });
}

export function ensureWebexRtcState(page) {
  if (!page) return;
  if (!page.webexRtc) {
    page.webexRtc = { feed: [], rtcNextDueSimMs: 0, rtcCounts: {}, rtcVote: {} };
  }
  if (!page.webexRtc.rtcCounts) page.webexRtc.rtcCounts = {};
  if (!page.webexRtc.rtcVote) page.webexRtc.rtcVote = {};
  if (page.webexRtc.rtcNextDueSimMs == null) page.webexRtc.rtcNextDueSimMs = 0;
  if (!Array.isArray(page.webexRtc.feed)) page.webexRtc.feed = [];
  ensureWebexRtcRowIds(page);
}

function ensureWebexRtcCounts(page, postId) {
  ensureWebexRtcState(page);
  if (!page.webexRtc.rtcCounts[postId]) page.webexRtc.rtcCounts[postId] = { up: 0, down: 0 };
}

const WEBEX_RTC_MIN_REAL_MS = 500;
let _webexRtcLastRealMs = 0;

/**
 * @param {number} simElapsedMs
 */
export function tickWebexSiteRtcPages(simElapsedMs) {
  if (typeof performance !== 'undefined') {
    const now = performance.now();
    if (now - _webexRtcLastRealMs < WEBEX_RTC_MIN_REAL_MS) return;
    _webexRtcLastRealMs = now;
  }
  const t = Number(simElapsedMs) || 0;
  const gd = getCurrentGameDate();
  const raw = window.ActorDB?.getActiveNow?.(gd.getUTCHours(), gd.getUTCDay(), null);
  const actors = Array.isArray(raw)
    ? raw.filter((a) => a?.active !== false && a?.actor_id && a.role !== 'player')
    : [];
  const MAX_BATCHES = 8;

  patchState((st) => {
    const pages = st.contentRegistry?.pages;
    if (!Array.isArray(pages)) return st;
    for (const page of pages) {
      if (!page || !pageHasWebexLiveChat(page)) continue;
      if (page.stats && page.stats.health != null && page.stats.health <= 0) continue;

      ensureWebexRtcState(page);
      const wrtc = page.webexRtc;
      if (wrtc.feed.some((row) => !row.id)) ensureWebexRtcRowIds(page);

      let due = Number(wrtc.rtcNextDueSimMs) || 0;
      if (!due) {
        due = t + rollD4() * SIM_HOUR_MS;
        wrtc.rtcNextDueSimMs = due;
      }
      if (t < due) continue;

      let safety = 0;
      const pageIdStr = String(page.pageId || '');
      while (t >= due && safety < MAX_BATCHES) {
        safety += 1;
        if (actors.length) {
          const roll = rollD20();
          const n = Math.min(roll, actors.length);
          const rng = mulberry32((t ^ due ^ safety ^ pageIdStr.length) >>> 0);
          const pool = actors.slice();
          const picks = [];
          for (let i = 0; i < n && i < pool.length; i++) {
            const j = i + Math.floor(rng() * (pool.length - i));
            [pool[i], pool[j]] = [pool[j], pool[i]];
            picks.push(pool[i]);
          }
          const gameDate = getCurrentGameDate();
          const timeLabel = formatGameDateTime(gameDate);
          const batchTag = (t ^ due) >>> 0;
          for (let i = 0; i < picks.length; i++) {
            const act = picks[i];
            const author = displayNameFromActor(act);
            const seed = (batchTag + i * 1103 + String(page.pageId).length * 97 + String(act.actor_id).length * 3) >>> 0;
            const text = generateYourspaceRtcPost({ seed, authorDisplay: author });
            const postId = `wx-rtc-${pageIdStr.replace(/[^a-z0-9_-]/gi, '_')}-${batchTag}-${safety}-${i}-${String(act.actor_id).replace(
              /[^a-z0-9_-]/gi,
              ''
            )}`.slice(0, 120);
            wrtc.feed.push({
              id: postId,
              actorId: act.actor_id,
              author,
              text,
              simMs: t,
              timeLabel
            });
            ensureWebexRtcCounts(page, postId);
          }
        }
        due = t + rollD4() * SIM_HOUR_MS;
        wrtc.rtcNextDueSimMs = due;
        wrtc.lastRtcBoundarySimMs = t;
      }
      if (t >= (Number(wrtc.rtcNextDueSimMs) || 0)) {
        wrtc.rtcNextDueSimMs = t + rollD4() * SIM_HOUR_MS;
      }
      if (wrtc.feed.length > 200) wrtc.feed = wrtc.feed.slice(-200);
    }
    return st;
  });
}

/**
 * @param {string} pageId
 * @param {string} postId
 * @param {'up' | 'down'} vote
 * @param {string} [actorId]
 */
export function applyWebexRtcVote(pageId, postId, vote, actorId) {
  const prevVote = (() => {
    const p = (getState().contentRegistry?.pages || []).find((x) => x.pageId === pageId);
    return p?.webexRtc?.rtcVote?.[postId];
  })();

  patchState((s) => {
    const page = (s.contentRegistry?.pages || []).find((p) => p.pageId === pageId);
    if (!page) return s;
    ensureWebexRtcState(page);
    const w = page.webexRtc;
    ensureWebexRtcCounts(page, postId);
    const was = w.rtcVote[postId];
    if (was === vote) {
      if (vote === 'up') w.rtcCounts[postId].up = Math.max(0, w.rtcCounts[postId].up - 1);
      else w.rtcCounts[postId].down = Math.max(0, w.rtcCounts[postId].down - 1);
      delete w.rtcVote[postId];
      return s;
    }
    if (was === 'up') w.rtcCounts[postId].up = Math.max(0, w.rtcCounts[postId].up - 1);
    if (was === 'down') w.rtcCounts[postId].down = Math.max(0, w.rtcCounts[postId].down - 1);
    if (vote === 'up') w.rtcCounts[postId].up++;
    else w.rtcCounts[postId].down++;
    w.rtcVote[postId] = vote;
    return s;
  });

  if (actorId) {
    const viewer = wahooViewerKey();
    const prev = prevVote;
    let delta = 0;
    if (prev === vote) delta = vote === 'up' ? -2 : 2;
    else if (!prev) delta = vote === 'up' ? 2 : -2;
    else if (prev === 'up' && vote === 'down') delta = -4;
    else if (prev === 'down' && vote === 'up') delta = 4;
    if (delta) applyAffinityDelta(patchSession, viewer, `actor:${actorId}`, delta);
  }
  // Feed into publicPulse product signals (use pageId as a loose product proxy)
  const productKey = normalizeProductKey(pageId);
  recordProductSignal(productKey, vote === 'up' ? 'like' : 'dislike');
}

function feedRowsHtml(pageId) {
  const page = (getState().contentRegistry?.pages || []).find((p) => p.pageId === pageId);
  if (!page) {
    return '<div class="wx-rtc-empty">—</div>';
  }
  ensureWebexRtcState(page);
  const wrtc = page.webexRtc;
  const feed = wrtc.feed || [];
  const counts = wrtc.rtcCounts || {};
  const votes = wrtc.rtcVote || {};
  if (!feed.length) {
    return '<div class="wx-rtc-empty">No messages yet. NPCs post on sim time.</div>';
  }
  return feed
    .slice(-50)
    .map((row) => {
      const id = String(row.id || '');
      const pid = escapeHtml(id);
      const c = counts[id] || { up: 0, down: 0 };
      const uv = votes[id];
      const upCls = uv === 'up' ? ' is-on' : '';
      const dnCls = uv === 'down' ? ' is-on' : '';
      const aid = row.actorId ? escapeHtml(row.actorId) : '';
      return `<div class="wx-rtc-row" data-rtc-id="${pid}">
  <div class="wx-rtc-line">
    <span class="wx-rtc-author">${escapeHtml(row.author)}</span>
    <span class="wx-rtc-time">${escapeHtml(row.timeLabel || '')}</span>
  </div>
  <div class="wx-rtc-text">${escapeHtml(row.text || '')}</div>
  <div class="wx-rtc-actions" role="group" aria-label="React">
    <button type="button" class="wx-rtc-vbtn wx-rtc-vbtn-up${upCls}" data-wx-rtc-vote="up" data-wx-rtc-pid="${pid}" data-page-id="${escapeHtml(
      pageId
    )}" data-wx-rtc-actor="${aid}" title="Thumbs up">+${c.up}</button>
    <button type="button" class="wx-rtc-vbtn wx-rtc-vbtn-down${dnCls}" data-wx-rtc-vote="down" data-wx-rtc-pid="${pid}" data-page-id="${escapeHtml(
      pageId
    )}" data-wx-rtc-actor="${aid}" title="Thumbs down">−${c.down}</button>
  </div>
</div>`;
    })
    .join('');
}

/**
 * @param {string} pageId
 * @param {{ colorPrimary: string, colorText?: string }} view
 * @param {{ compact?: boolean }} [opts]
 */
export function renderWebexRtcModuleInner(pageId, view, opts = {}) {
  const comp = opts.compact;
  return `<div class="wx-rtc-wrap" data-webex-rtc-root="1" data-page-id="${escapeHtml(pageId)}">
  <div class="wx-rtc-hdr" style="color:${escapeHtml(view.colorText || '#222')};">Live chat</div>
  <p class="wx-rtc-hint" style="color:#555;">Real-time (sim) visitors — same engine as yourspace.net.</p>
  <div class="wx-rtc-feed" data-wx-rtc-feed style="--wx-rtc-accent:${escapeHtml(
    view.colorPrimary || '#0a246a'
  )};${comp ? 'max-height:140px;' : ''}border:1px solid #b8b8b8;">
    ${feedRowsHtml(pageId)}
  </div>
</div>`;
}

/**
 * @param {ParentNode} container
 * @param {string} pageId
 */
export function hydrateWebExRtc(container, pageId) {
  if (!container || !pageId) return;
  const roots = container.querySelectorAll('[data-webex-rtc-root]');
  roots.forEach((root) => {
    if (root.getAttribute('data-page-id') !== pageId) return;
    const feed = root.querySelector('[data-wx-rtc-feed]');
    if (feed) feed.innerHTML = feedRowsHtml(pageId);
  });
}
