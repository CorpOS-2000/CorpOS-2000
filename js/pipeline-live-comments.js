/**
 * Live comment threads on pipeline-authored WorldNet pages (sim-time 1d20 / 1d4).
 */
import { escapeHtml } from './identity.js';
import { getState, SIM_HOUR_MS } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { getGameDayIndex } from './clock.js';
import { generateSocialComment, SOCIAL_COMMENT_VOICE_KEYS } from './social-comments.js';
import { rollD4, rollD20 } from './d20.js';
import { generatePlayerReplies, schedulePlayerReplies } from './player-interaction-replies.js';
import { scanHashtags } from './market-dynamics.js';

/** Pipeline NPC drip — same cadence concern as Herald (tick fires every animation frame). */
const PIPELINE_NPC_MIN_REAL_MS = 320;
let _pipelineNpcLastRealMs = 0;

let plGen = 0;
/** @type {HTMLElement | null} */
let mountHost = null;
function ensurePipelineLive(s) {
  if (!s.pipelineLive) s.pipelineLive = { byPage: {}, threads: {} };
  if (!s.pipelineLive.byPage) s.pipelineLive.byPage = {};
  if (!s.pipelineLive.threads) s.pipelineLive.threads = {};
}

export function liveCommentSections(pageDef) {
  return (pageDef?.sections || []).filter((sec) => {
    const t = sec.type || sec.sectionType;
    if (t === 'live_thread') return true;
    if (t === 'forum_thread' && sec.live) return true;
    return false;
  });
}

function scopeId(pageId, sectionId) {
  return `${pageId}:${sectionId}`;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Renders one live thread block (used from worldnet-page-renderer). */
export function renderLiveThreadHtml(sec, pageDef) {
  const pid = String(pageDef?.pageId || '');
  const sid = String(sec.sectionId || sec.section_id || 'main');
  const scope = scopeId(pid, sid);
  ensurePipelineLive(getSessionState());
  const comments = getSessionState().pipelineLive.threads[scope]?.comments || [];
  const lis = comments
    .map(
      (c) =>
        `<li class="wn-pl-comment"><b>${escapeHtml(c.author || '')}</b> — ${escapeHtml(c.text || '')}</li>`
    )
    .join('');
  const ctx = escapeHtml(sec.commentContext || 'generic');
  const fl = escapeHtml(sec.commentFlavor === 'snack' || sec.commentFlavor === 'generic' ? sec.commentFlavor : 'auto');
  return `<div class="wn-live-thread" data-pl-scope="${escapeHtml(scope)}" data-pl-page="${escapeHtml(
    pid
  )}" data-pl-section="${escapeHtml(sid)}" data-pl-flavor="${fl}" data-pl-context="${ctx}" style="border:1px solid #999;background:#fff;margin-bottom:10px;font-family:Tahoma,Arial,sans-serif;font-size:11px;">
  <div style="background:#eee;padding:6px;"><b>${escapeHtml(sec.title || 'Discussion')}</b></div>
  <ul class="wn-pl-list" data-pl-list="${escapeHtml(scope)}" style="margin:6px 0;padding-left:20px;min-height:1em;">${
    lis || '<li class="wn-pl-empty" style="list-style:none;color:#888;">No comments yet.</li>'
  }</ul>
  <div style="padding:6px;border-top:1px solid #ddd;background:#fafafa;">
    <label style="display:block;margin-bottom:4px;">Voice</label>
    <select class="wn-pl-voice" data-pl-voice="${escapeHtml(scope)}" style="width:100%;max-width:220px;margin-bottom:6px;">
      <option value="">Choose…</option>
      <option value="casual">Casual</option>
      <option value="ranter">Ranter</option>
      <option value="expert">Expert</option>
      <option value="troll">Troll</option>
      <option value="supporter">Supporter</option>
      <option value="worried">Worried</option>
      <option value="skeptic">Skeptic</option>
      <option value="corporate">Corporate</option>
      <option value="deadpan">Deadpan</option>
      <option value="hype">Hype</option>
    </select>
    <textarea class="wn-pl-ta" data-pl-ta="${escapeHtml(scope)}" rows="2" disabled placeholder="Pick a voice first…" style="width:100%;box-sizing:border-box;"></textarea>
    <div style="margin-top:6px;">
      <label style="font-size:10px;"><input type="checkbox" class="wn-pl-ready" data-pl-ready="${escapeHtml(scope)}" disabled> Ready to post</label>
      <button type="button" class="wn-pl-post" data-pl-post="${escapeHtml(scope)}" disabled style="margin-left:8px;">Post</button>
    </div>
  </div>
</div>`;
}

function syncAllPipelineLists() {
  document.querySelectorAll('.wn-live-thread[data-pl-scope]').forEach((host) => {
    const scope = host.getAttribute('data-pl-scope');
    if (!scope) return;
    const ul = host.querySelector('.wn-pl-list');
    if (!ul) return;
    const comments = getSessionState().pipelineLive?.threads?.[scope]?.comments || [];
    if (!comments.length) {
      ul.innerHTML = '<li class="wn-pl-empty" style="list-style:none;color:#888;">No comments yet.</li>';
      return;
    }
    ul.innerHTML = comments
      .map(
        (c) =>
          `<li class="wn-pl-comment"><b>${escapeHtml(c.author || '')}</b> — ${escapeHtml(c.text || '')}</li>`
      )
      .join('');
  });
}

/**
 * @param {HTMLElement} container #wnet-content
 * @param {object} pageDef
 */
export function mountPipelineLiveComments(container, pageDef) {
  teardownPipelineLiveComments();
  const pid = pageDef?.pageId;
  if (!pid || !container) return;
  const secs = liveCommentSections(pageDef);
  if (!secs.length) return;

  const myGen = ++plGen;
  mountHost = container;

  const onInteract = (e) => {
    if (myGen !== plGen || !mountHost?.contains(e.target)) return;
    const t = e.target;
    if (!(t instanceof Element)) return;

    const postBtn = t.closest('.wn-pl-post');
    if (postBtn && e.type === 'click') {
      e.preventDefault();
      const scope = postBtn.getAttribute('data-pl-post');
      if (!scope) return;
      const block = postBtn.closest('.wn-live-thread');
      const voice = block?.querySelector('.wn-pl-voice');
      const ta = block?.querySelector('.wn-pl-ta');
      const ready = block?.querySelector('.wn-pl-ready');
      const personality = voice?.value || '';
      const text = ta?.value?.trim() || '';
      if (!personality || !text || !ready?.checked) return;
      const u = getSessionState().wahoo?.currentUser;
      const author = u && String(u).trim() ? String(u).trim() : 'Guest';
      const day = getGameDayIndex();
      const cid = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      patchSession((s) => {
        ensurePipelineLive(s);
        if (!s.pipelineLive.threads[scope]) s.pipelineLive.threads[scope] = { comments: [] };
        if (!Array.isArray(s.pipelineLive.threads[scope].comments)) s.pipelineLive.threads[scope].comments = [];
        s.pipelineLive.threads[scope].comments.push({
          id: cid,
          author,
          text,
          source: 'player',
          personality,
          postedGameDay: day
        });
      });
      const simMs = getState().sim?.elapsedMs || 0;
      const replies = generatePlayerReplies({ channel: 'pipeline_live', postId: scope, playerText: text, simMs });
      if (replies.length) schedulePlayerReplies({ channel: 'pipeline_live', targetId: scope, replies, simMs });
      scanHashtags(text);
      if (block) {
        const taEl = block.querySelector('.wn-pl-ta');
        const vEl = block.querySelector('.wn-pl-voice');
        const rEl = block.querySelector('.wn-pl-ready');
        if (taEl) {
          taEl.value = '';
          taEl.disabled = true;
          taEl.placeholder = 'Pick a voice first…';
        }
        if (vEl) vEl.value = '';
        if (rEl) {
          rEl.checked = false;
          rEl.disabled = true;
        }
        postBtn.disabled = true;
      }
      syncAllPipelineLists();
      return;
    }

    const voiceEl = t.closest('.wn-pl-voice');
    if (voiceEl && e.type === 'change') {
      const block = voiceEl.closest('.wn-live-thread');
      if (!block) return;
      const ta = block.querySelector('.wn-pl-ta');
      const ready = block.querySelector('.wn-pl-ready');
      const btn = block.querySelector('.wn-pl-post');
      const personality = voiceEl.value || '';
      if (!personality) {
        if (ta) {
          ta.value = '';
          ta.disabled = true;
          ta.placeholder = 'Pick a voice first…';
        }
        if (ready) {
          ready.checked = false;
          ready.disabled = true;
        }
        if (btn) btn.disabled = true;
      } else if (ta) {
        ta.disabled = false;
        ta.placeholder = 'Type comment…';
        if (ready) ready.disabled = false;
      }
    }
  };

  container.addEventListener('click', onInteract);
  container.addEventListener('change', onInteract);

  mountHost._plCleanup = () => {
    container.removeEventListener('click', onInteract);
    container.removeEventListener('change', onInteract);
  };
}

export function teardownPipelineLiveComments() {
  plGen++;
  if (mountHost?._plCleanup) {
    mountHost._plCleanup();
    delete mountHost._plCleanup;
  }
  mountHost = null;
}

/**
 * @param {number} simElapsedMs
 */
export function tickPipelineLiveComments(simElapsedMs) {
  if (typeof performance !== 'undefined') {
    const now = performance.now();
    if (now - _pipelineNpcLastRealMs < PIPELINE_NPC_MIN_REAL_MS) return;
    _pipelineNpcLastRealMs = now;
  }

  const t = Number(simElapsedMs) || 0;
  const pages = getState().contentRegistry?.pages || [];

  for (const page of pages) {
    const secs = liveCommentSections(page);
    if (!secs.length) continue;
    const pid = page.pageId;
    if (!pid) continue;

    const pl = getSessionState().pipelineLive;
    let due = Number(pl?.byPage?.[pid]?.nextDueSimMs) || 0;
    if (!due) {
      patchSession((s) => {
        ensurePipelineLive(s);
        if (!s.pipelineLive.byPage[pid]) s.pipelineLive.byPage[pid] = { nextDueSimMs: 0 };
        s.pipelineLive.byPage[pid].nextDueSimMs = t + rollD4() * SIM_HOUR_MS;
      });
      continue;
    }
    if (t < due) continue;

    const rng = mulberry32((t ^ due ^ pid.length * 13) >>> 0);
    const nRoll = rollD20();
    const day = getGameDayIndex();

    patchSession((s) => {
      ensurePipelineLive(s);
      if (!s.pipelineLive.byPage[pid]) s.pipelineLive.byPage[pid] = { nextDueSimMs: 0 };
      s.pipelineLive.byPage[pid].nextDueSimMs = t + rollD4() * SIM_HOUR_MS;

      for (let i = 0; i < nRoll; i++) {
        const sec = secs[Math.floor(rng() * secs.length)] || secs[0];
        const sid = String(sec.sectionId || sec.section_id || 'main');
        const scope = scopeId(String(pid), sid);
        if (!s.pipelineLive.threads[scope]) s.pipelineLive.threads[scope] = { comments: [] };
        if (!Array.isArray(s.pipelineLive.threads[scope].comments)) s.pipelineLive.threads[scope].comments = [];

        const post = sec.commentFlavor === 'snack' || sec.commentFlavor === 'generic' ? sec.commentFlavor : 'auto';
        const seed = ((t ^ due) >>> 0) + i * 131071 + sid.length * 17;
        const gen = generateSocialComment({
          seed,
          flavor: post,
          context: String(sec.commentContext || 'generic'),
          forcedPersonality:
            rng() < 0.36
              ? SOCIAL_COMMENT_VOICE_KEYS[Math.floor(rng() * SOCIAL_COMMENT_VOICE_KEYS.length)]
              : undefined
        });
        s.pipelineLive.threads[scope].comments.push({
          id: `pl-npc-${t}-${i}-${scope.replace(/\W/g, '')}`.slice(0, 96),
          author: gen.author,
          text: gen.text,
          source: 'npc',
          personality: gen.tone,
          postedGameDay: day
        });
      }
    });
  }

  if (typeof document !== 'undefined' && document.querySelector('.wn-live-thread[data-pl-scope]')) {
    syncAllPipelineLists();
  }
}
