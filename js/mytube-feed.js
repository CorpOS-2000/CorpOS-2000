/**
 * mytube.net — Y2K video portal parody (session votes, comments, affinity).
 */
import { escapeHtml } from './identity.js';
import { getSessionState, patchSession } from './sessionState.js';
import { getGameDayIndex } from './clock.js';
import { generateSocialComment, SOCIAL_COMMENT_VOICE_KEYS } from './social-comments.js';
import { rollD4, rollD20 } from './d20.js';
import { SIM_HOUR_MS, getState } from './gameState.js';
import { generatePlayerReplies, schedulePlayerReplies } from './player-interaction-replies.js';
import { scanHashtags } from './market-dynamics.js';
import {
  applyAffinityDelta,
  affinityTargetKey,
  affinityNpcNameKey,
  getAffinityScore,
  affinityLabel
} from './social-affinity.js';

const PAGE_SIZE = 10;

let mtGen = 0;
let rootEl = null;
/** Sub-path for the currently mounted MyTube view (for NPC comment DOM sync). */
let mountedMytubeSubPath = '';
/** @type {{ videos: object[] } | null} */
let catalogCache = null;
/** @type {(() => void)[]} */
let detachListeners = [];

/** @type {Map<string, { targetText: string; revealIndex: number; started: boolean }>} */
const composeByVideo = new Map();

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function wahooViewerKey() {
  const u = getSessionState().wahoo?.currentUser;
  return u && String(u).trim() ? String(u).trim() : 'guest';
}

function playerDisplayName() {
  const u = getSessionState().wahoo?.currentUser;
  if (u && String(u).trim()) return String(u).trim();
  return 'Guest';
}

function ensureMytube(s) {
  if (!s.mytube) {
    s.mytube = {
      videoCounts: {},
      videoVote: {},
      commentVote: {},
      comments: {},
      uploads: [],
      nextNpcDueSimMs: 0
    };
  }
  ['videoCounts', 'videoVote', 'commentVote', 'comments', 'uploads'].forEach((k) => {
    if (!s.mytube[k]) s.mytube[k] = k === 'uploads' ? [] : {};
  });
  if (s.mytube.nextNpcDueSimMs == null) s.mytube.nextNpcDueSimMs = 0;
}

function channelKey(video) {
  return affinityTargetKey({ channel: video?.channel || '' });
}

/** @param {string} personality */
function personalityChannelDelta(personality) {
  switch (personality) {
    case 'supporter':
    case 'hype':
      return 4;
    case 'troll':
      return -5;
    case 'ranter':
      return -2;
    case 'skeptic':
      return -2;
    case 'worried':
      return -1;
    case 'deadpan':
    case 'corporate':
      return 0;
    case 'expert':
    case 'casual':
    default:
      return 1;
  }
}

async function loadCatalog() {
  if (catalogCache) return catalogCache;
  const res = await fetch('data/mytube-videos.json');
  if (!res.ok) throw new Error(String(res.status));
  catalogCache = await res.json();
  return catalogCache;
}

function allVideos() {
  const data = catalogCache || { videos: [] };
  const up = getSessionState().mytube?.uploads || [];
  return [...(data.videos || []), ...up];
}

function findVideo(id) {
  return allVideos().find((v) => v.id === id) || null;
}

/**
 * @param {string} sub
 * @returns {{ kind: string, page?: number, q?: string, id?: string }}
 */
function parseMytubeSub(sub) {
  const s = String(sub || '').replace(/^\/+/, '');
  if (!s) return { kind: 'home' };
  if (s === 'upload') return { kind: 'upload' };
  if (s.startsWith('v/')) {
    const id = s.slice(2).split('/')[0];
    return { kind: 'watch', id };
  }
  if (s.startsWith('browse/')) {
    const page = Math.max(1, parseInt(s.split('/')[1], 10) || 1);
    return { kind: 'browse', page };
  }
  if (s.startsWith('search/')) {
    const rest = s.slice(7);
    const idx = rest.lastIndexOf('/');
    const pagePart = idx >= 0 ? rest.slice(idx + 1) : '1';
    const qPart = idx >= 0 ? rest.slice(0, idx) : rest;
    const page = Math.max(1, parseInt(pagePart, 10) || 1);
    let q = '';
    try {
      q = decodeURIComponent(qPart || '');
    } catch {
      q = qPart || '';
    }
    return { kind: 'search', q, page };
  }
  return { kind: 'home' };
}

function searchVideos(list, q) {
  const t = String(q || '').trim().toLowerCase();
  if (!t) return list;
  return list.filter((v) => {
    const hay = `${v.title || ''} ${v.description || ''} ${v.channel || ''} ${v.category || ''}`.toLowerCase();
    return hay.includes(t);
  });
}

function pageSlice(list, page) {
  const p = Math.max(1, page);
  const start = (p - 1) * PAGE_SIZE;
  return { items: list.slice(start, start + PAGE_SIZE), total: list.length, page: p, pages: Math.max(1, Math.ceil(list.length / PAGE_SIZE)) };
}

function ensureVideoCounts(s, videoId) {
  ensureMytube(s);
  if (!s.mytube.videoCounts[videoId]) {
    s.mytube.videoCounts[videoId] = { up: 0, down: 0 };
  }
}

function applyVideoVote(video, vote) {
  const vid = video?.id;
  if (!vid) return;
  const viewer = wahooViewerKey();
  const prev = getSessionState().mytube?.videoVote?.[vid];
  const ck = channelKey(video);
  patchSession((s) => {
    ensureMytube(s);
    ensureVideoCounts(s, vid);
    const was = s.mytube.videoVote[vid];
    if (was === vote) {
      if (vote === 'up') s.mytube.videoCounts[vid].up = Math.max(0, s.mytube.videoCounts[vid].up - 1);
      else s.mytube.videoCounts[vid].down = Math.max(0, s.mytube.videoCounts[vid].down - 1);
      delete s.mytube.videoVote[vid];
      return;
    }
    if (was === 'up') s.mytube.videoCounts[vid].up = Math.max(0, s.mytube.videoCounts[vid].up - 1);
    if (was === 'down') s.mytube.videoCounts[vid].down = Math.max(0, s.mytube.videoCounts[vid].down - 1);
    if (vote === 'up') s.mytube.videoCounts[vid].up++;
    else s.mytube.videoCounts[vid].down++;
    s.mytube.videoVote[vid] = vote;
  });
  if (ck) {
    let delta = 0;
    if (prev === vote) delta = vote === 'up' ? -3 : 3;
    else if (!prev) delta = vote === 'up' ? 3 : -3;
    else if (prev === 'up' && vote === 'down') delta = -6;
    else if (prev === 'down' && vote === 'up') delta = 6;
    if (delta) applyAffinityDelta(patchSession, viewer, ck, delta);
  }
}

function commentKey(vid, cid) {
  return `${vid}:${cid}`;
}

function applyCommentVote(video, comment, vote) {
  const vid = video?.id;
  const cid = comment?.id;
  if (!vid || !cid) return;
  const viewer = wahooViewerKey();
  const k = commentKey(vid, cid);
  const prev = getSessionState().mytube?.commentVote?.[k];
  const authorKey = affinityNpcNameKey(comment.author || '');
  const ck = channelKey(video);
  patchSession((s) => {
    ensureMytube(s);
    if (!s.mytube.commentVote) s.mytube.commentVote = {};
    const list = s.mytube.comments[vid] || [];
    const row = list.find((c) => c.id === cid);
    if (!row) return;
    if (row.up == null) row.up = 0;
    if (row.down == null) row.down = 0;
    const was = s.mytube.commentVote[k];
    if (was === vote) {
      if (vote === 'up') row.up = Math.max(0, row.up - 1);
      else row.down = Math.max(0, row.down - 1);
      delete s.mytube.commentVote[k];
      return;
    }
    if (was === 'up') row.up = Math.max(0, row.up - 1);
    if (was === 'down') row.down = Math.max(0, row.down - 1);
    if (vote === 'up') row.up++;
    else row.down++;
    s.mytube.commentVote[k] = vote;
  });
  if (authorKey) {
    let aDelta = 0;
    if (prev === vote) aDelta = vote === 'up' ? -2 : 2;
    else if (!prev) aDelta = vote === 'up' ? 2 : -2;
    else if (prev === 'up' && vote === 'down') aDelta = -4;
    else if (prev === 'down' && vote === 'up') aDelta = 4;
    if (aDelta) applyAffinityDelta(patchSession, viewer, authorKey, aDelta);
  }
  if (ck) {
    let cDelta = 0;
    if (prev === vote) cDelta = vote === 'up' ? -1 : 1;
    else if (!prev) cDelta = vote === 'up' ? 1 : -1;
    else if (prev === 'up' && vote === 'down') cDelta = -2;
    else if (prev === 'down' && vote === 'up') cDelta = 2;
    if (cDelta) applyAffinityDelta(patchSession, viewer, ck, cDelta);
  }
}

function thumbHtml(video) {
  const dur = escapeHtml(video.duration || '0:00');
  return `<div class="mt-thumb" data-mt-watch="${escapeHtml(video.id)}"><span class="mt-thumb-dur">${dur}</span></div>`;
}

function videoRowHtml(video) {
  const fake = video.fake !== false;
  const badge = fake ? '<span class="mt-fake-badge">SIMULCAST</span>' : '';
  return `<li class="mt-vrow">
${thumbHtml(video)}
<div class="mt-vmeta">
  <div class="mt-vtitle" data-mt-watch="${escapeHtml(video.id)}">${escapeHtml(video.title || '')}${badge}</div>
  <div class="mt-vchan">${escapeHtml(video.channel || '')} · ${escapeHtml(String(video.views != null ? video.views : '—'))} views</div>
  <div class="mt-vdesc">${escapeHtml((video.description || '').slice(0, 180))}</div>
</div>
</li>`;
}

function pagerHtml(kind, page, pages, extra = '') {
  const prev = page > 1 ? page - 1 : null;
  const next = page < pages ? page + 1 : null;
  const subFor = (p) => {
    if (kind === 'browse') return `browse/${p}`;
    const q = encodeURIComponent(extra);
    return `search/${q}/${p}`;
  };
  const wnetGo = typeof window !== 'undefined' && window.wnetGo;
  const prevBtn =
    prev && wnetGo
      ? `<button type="button" data-mt-go="${escapeHtml(subFor(prev))}">« Prev</button>`
      : '<button type="button" disabled>« Prev</button>';
  const nextBtn =
    next && wnetGo
      ? `<button type="button" data-mt-go="${escapeHtml(subFor(next))}">Next »</button>`
      : '<button type="button" disabled>Next »</button>';
  return `<div class="mt-pager">${prevBtn}<span>Page ${page} / ${pages}</span>${nextBtn}</div>`;
}

function homeHtml(videos) {
  const featured = videos.slice(0, PAGE_SIZE);
  const list = featured.map((v) => videoRowHtml(v)).join('');
  return `
<div class="mt-body">
  <aside class="mt-side">
    <h4>Categories</h4>
    <ul><li>Dot-Com</li><li>CorpOS</li><li>Music</li><li>Weird</li></ul>
    <h4>More</h4>
    <p><a data-nav="yourspace">yourspace.net</a></p>
  </aside>
  <div class="mt-main">
    <h1 class="mt-h1">Featured videos</h1>
    <p class="mt-random"><a data-mt-go="browse/1">Browse all</a> · <a data-mt-random>Random video</a> · <a data-mt-go="upload">Upload</a></p>
    <ul class="mt-vlist">${list || '<li class="mt-loading">No videos.</li>'}</ul>
  </div>
</div>`;
}

function listPageHtml(title, videos, routeKind, page, q = '') {
  const { items, pages, page: p } = pageSlice(videos, page);
  const list = items.map((v) => videoRowHtml(v)).join('');
  const pg = pagerHtml(routeKind, p, pages, q);
  return `
<div class="mt-body">
  <div class="mt-main" style="max-width:100%">
    <h1 class="mt-h1">${escapeHtml(title)}</h1>
    <ul class="mt-vlist">${list || '<li class="mt-loading">No results.</li>'}</ul>
    ${pg}
  </div>
</div>`;
}

function watchHtml(video) {
  const vid = video.id;
  patchSession((s) => {
    ensureMytube(s);
    ensureVideoCounts(s, vid);
    if (!Array.isArray(s.mytube.comments[vid])) s.mytube.comments[vid] = [];
  });
  const fresh = getSessionState();
  const counts = fresh.mytube.videoCounts[vid] || { up: 0, down: 0 };
  const uv = fresh.mytube.videoVote[vid];
  const ck = channelKey(video);
  const score = ck ? getAffinityScore(fresh, wahooViewerKey(), ck) : 0;
  const { label, tone } = affinityLabel(score);
  const fake = video.fake !== false;
  const playerInner = fake
    ? ''
    : video.mediaSrc
      ? video.mediaVideo
        ? `<video src="${escapeHtml(video.mediaSrc)}" controls muted playsinline></video>`
        : `<img src="${escapeHtml(video.mediaSrc)}" alt="">`
      : '';
  const playerClass = fake ? 'mt-watch-player' : `mt-watch-player mt-watch-player--real`;
  const comments = fresh.mytube.comments[vid] || [];
  const cvotes = fresh.mytube.commentVote || {};
  const commentsHtml = comments
    .map((c) => {
      const ck2 = commentKey(vid, c.id);
      const v = cvotes[ck2];
      const upOn = v === 'up' ? ' is-on' : '';
      const dnOn = v === 'down' ? ' is-on' : '';
      return `<div class="mt-comment" data-mt-cid="${escapeHtml(c.id)}">
  <b>${escapeHtml(c.author || '')}</b> — ${escapeHtml(c.text || '')}
  <div class="mt-comment-v">
    <button type="button" class="mt-vbtn mt-vbtn-up${upOn}" data-mt-cvote="up" data-mt-cvid="${escapeHtml(vid)}" data-mt-ccid="${escapeHtml(
        c.id
      )}">+ ${c.up ?? 0}</button>
    <button type="button" class="mt-vbtn mt-vbtn-down${dnOn}" data-mt-cvote="down" data-mt-cvid="${escapeHtml(vid)}" data-mt-ccid="${escapeHtml(
        c.id
      )}">− ${c.down ?? 0}</button>
  </div>
</div>`;
    })
    .join('');

  return `
<div class="mt-body">
  <div class="mt-main">
    <p><button type="button" class="mt-navbtn" data-mt-go="">← Home</button></p>
    <div class="${playerClass}">${playerInner}</div>
    <h1 class="mt-watch-h1">${escapeHtml(video.title || '')}${fake ? '<span class="mt-fake-badge">FAKE / PLACEHOLDER</span>' : ''}</h1>
    <div class="mt-watch-sub">${escapeHtml(video.channel || '')} · ${escapeHtml(video.category || '')} · ${escapeHtml(
    video.duration || ''
  )}</div>
    <div class="mt-watch-sub ys-vibe--${tone}">Your vibe toward channel: <b>${escapeHtml(label)}</b></div>
    <div class="mt-votes">
      <button type="button" class="mt-vbtn mt-vbtn-up${uv === 'up' ? ' is-on' : ''}" data-mt-vvote="up" data-mt-vid="${escapeHtml(vid)}">Like ${counts.up}</button>
      <button type="button" class="mt-vbtn mt-vbtn-down${uv === 'down' ? ' is-on' : ''}" data-mt-vvote="down" data-mt-vid="${escapeHtml(vid)}">Dislike ${counts.down}</button>
    </div>
    <p style="font-size:11px;">${escapeHtml(video.description || '')}</p>
    <div class="mt-comments">
      <h2 class="mt-h1">Comments</h2>
      ${commentsHtml || '<p class="mt-loading">No comments yet.</p>'}
      <div class="mt-compose">
        <label>Voice</label>
        <select id="mt-personality" data-mt-personality>
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
        <textarea id="mt-compose-ta" rows="3" disabled placeholder="Pick a voice first…" data-mt-text></textarea>
        <div>
          <label><input type="checkbox" id="mt-ready" disabled data-mt-ready> Ready</label>
          <button type="button" id="mt-post-btn" disabled data-mt-post>Post</button>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function uploadHtml() {
  return `
<div class="mt-body">
  <div class="mt-main">
    <h1 class="mt-h1">Upload a video</h1>
    <p style="font-size:11px;">Most uploads are <b>simulated</b> placeholders. Pick a format — real media can be wired later per type.</p>
    <form class="mt-upload-form" id="mt-upload-form">
      <label>Title</label>
      <input type="text" name="title" required maxlength="120" placeholder="My CorpOS rant">
      <label>Post type</label>
      <select name="postType">
        <option value="vlog">Vlog (fake placeholder)</option>
        <option value="tutorial">Tutorial (fake)</option>
        <option value="parody_ad">Parody ad (fake)</option>
        <option value="corpos_rant">CorpOS rant (fake)</option>
        <option value="music_rip">Music rip (fake)</option>
        <option value="real_clip">Real clip (use URL below)</option>
      </select>
      <label>Media URL (optional — real_clip only)</label>
      <input type="text" name="mediaUrl" placeholder="https://… or assets/foo.mp4">
      <label>Description</label>
      <input type="text" name="desc" maxlength="300" placeholder="Short description">
      <div style="margin-top:12px;">
        <button type="submit" class="mt-navbtn">Publish</button>
        <button type="button" class="mt-navbtn" data-mt-go="">Cancel</button>
      </div>
    </form>
  </div>
</div>`;
}

function ensureComposeTarget(video, personality) {
  const id = video.id;
  let st = composeByVideo.get(id);
  if (!st) {
    st = { targetText: '', revealIndex: 0, started: false };
    composeByVideo.set(id, st);
  }
  if (!st.started) {
    const seed = (Date.now() ^ id.length * 131) >>> 0;
    const gen = generateSocialComment({
      seed,
      flavor: 'auto',
      context: 'generic',
      forcedPersonality: personality
    });
    st.targetText = gen.text;
    st.revealIndex = 0;
    st.started = true;
  }
  return st;
}

function resetCompose(root, videoId) {
  composeByVideo.delete(videoId);
  const sel = root.querySelector('[data-mt-personality]');
  const ta = root.querySelector('[data-mt-text]');
  const ready = root.querySelector('[data-mt-ready]');
  const btn = root.querySelector('[data-mt-post]');
  if (sel) sel.value = '';
  if (ta) {
    ta.value = '';
    ta.disabled = true;
    ta.readOnly = false;
    ta.placeholder = 'Pick a voice first…';
    ta.classList.remove('mt-compose-input--locked');
  }
  if (ready) {
    ready.checked = false;
    ready.disabled = true;
  }
  if (btn) btn.disabled = true;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function appendMytubeNpcCommentDom(vid, c) {
  if (!rootEl) return;
  const route = parseMytubeSub(mountedMytubeSubPath || '');
  if (route.kind !== 'watch' || route.id !== vid) return;
  const box = rootEl.querySelector('.mt-comments');
  if (!box) return;
  const load = box.querySelector('.mt-loading');
  if (load) load.remove();
  const el = document.createElement('div');
  el.className = 'mt-comment';
  el.setAttribute('data-mt-cid', c.id);
  el.innerHTML = `<b>${escapeHtml(c.author)}</b> — ${escapeHtml(c.text)}
  <div class="mt-comment-v">
    <button type="button" class="mt-vbtn mt-vbtn-up" data-mt-cvote="up" data-mt-cvid="${escapeHtml(vid)}" data-mt-ccid="${escapeHtml(
    c.id
  )}">+ ${c.up ?? 0}</button>
    <button type="button" class="mt-vbtn mt-vbtn-down" data-mt-cvote="down" data-mt-cvid="${escapeHtml(vid)}" data-mt-ccid="${escapeHtml(
    c.id
  )}">− ${c.down ?? 0}</button>
  </div>`;
  const compose = box.querySelector('.mt-compose');
  if (compose) box.insertBefore(el, compose);
  else box.appendChild(el);
}

/**
 * Sim-time NPC comments: 1d20 comments per batch, next batch in 1d4 sim hours.
 * @param {number} simElapsedMs
 */
const MYTUBE_NPC_MIN_REAL_MS = 500;
let _mytubeNpcLastRealMs = 0;

export function tickMytubeNpcComments(simElapsedMs) {
  if (typeof performance !== 'undefined') {
    const now = performance.now();
    if (now - _mytubeNpcLastRealMs < MYTUBE_NPC_MIN_REAL_MS) return;
    _mytubeNpcLastRealMs = now;
  }
  const t = Number(simElapsedMs) || 0;
  if (!catalogCache) return;
  const videos = allVideos();
  if (!videos.length) return;

  let safety = 0;
  while (safety < 64) {
    const mt = getSessionState().mytube;
    let due = Number(mt.nextNpcDueSimMs) || 0;
    if (!due) {
      patchSession((p) => {
        ensureMytube(p);
        p.mytube.nextNpcDueSimMs = t + rollD4() * SIM_HOUR_MS;
      });
      break;
    }
    if (t < due) break;
    safety += 1;

    const rng = mulberry32((t ^ due ^ safety) >>> 0);
    const nRoll = rollD20();
    const shuffled = [...videos].sort(() => rng() - 0.5);
    const picks = shuffled.slice(0, Math.min(nRoll, shuffled.length));
    const day = getGameDayIndex();
    const newRows = [];

    for (let i = 0; i < picks.length; i++) {
      const v = picks[i];
      const vid = v.id;
      if (!vid) continue;
      const seed = ((t ^ due) >>> 0) + i * 524287;
      const gen = generateSocialComment({
        seed,
        flavor: 'auto',
        context: 'generic',
        forcedPersonality:
          rng() < 0.38
            ? SOCIAL_COMMENT_VOICE_KEYS[Math.floor(rng() * SOCIAL_COMMENT_VOICE_KEYS.length)]
            : undefined
      });
      const cid = `c-npc-${t}-${i}-${String(vid).replace(/\W/g, '').slice(0, 24)}`;
      newRows.push({
        vid,
        c: {
          id: cid,
          author: gen.author,
          text: gen.text,
          up: 0,
          down: 0,
          source: 'npc',
          personality: gen.tone,
          postedGameDay: day
        }
      });
    }

    patchSession((p) => {
      ensureMytube(p);
      p.mytube.nextNpcDueSimMs = t + rollD4() * SIM_HOUR_MS;
      for (const row of newRows) {
        if (!Array.isArray(p.mytube.comments[row.vid])) p.mytube.comments[row.vid] = [];
        p.mytube.comments[row.vid].push(row.c);
      }
    });

    for (const row of newRows) appendMytubeNpcCommentDom(row.vid, row.c);
  }
}

export function warmMytubeCatalog() {
  return loadCatalog().catch(() => null);
}

/**
 * @param {HTMLElement} container
 * @param {string} subPath
 */
export async function mountMytube(container, subPath = '') {
  teardownMytube();
  const myGen = ++mtGen;
  const root = container.querySelector('#mt-root');
  if (!root) return;
  rootEl = root;
  mountedMytubeSubPath = String(subPath || '');
  root.innerHTML = '<p class="mt-loading">Loading MyTube…</p>';

  try {
    await loadCatalog();
  } catch {
    if (myGen !== mtGen) return;
    root.innerHTML = '<p class="mt-loading">Could not load video catalog.</p>';
    return;
  }
  if (myGen !== mtGen) return;

  patchSession((s) => ensureMytube(s));

  const videos = allVideos();
  const route = parseMytubeSub(subPath);
  const user = getSessionState().wahoo?.currentUser;
  const loginLine = user
    ? `Signed in as <b>${escapeHtml(user)}</b> (Wahoo)`
    : `<a data-nav="wahoo_login">Sign in on Wahoo</a> for a persistent handle`;

  const chrome = `<div class="mt-chrome"><div class="mt-chrome-inner">
  <span class="mt-logo">MyTube</span>
  <span class="mt-tag">Broadcast Yourself™ — Y2K Edition</span>
  <form class="mt-search" id="mt-search-form">
    <input type="text" name="q" placeholder="Search titles, channels…" value="${route.kind === 'search' ? escapeHtml(route.q || '') : ''}">
    <button type="submit">Search</button>
  </form>
  <button type="button" class="mt-navbtn" data-mt-go="browse/1">Browse</button>
  <button type="button" class="mt-navbtn" data-mt-go="upload">Upload</button>
  <span class="mt-user">${loginLine}</span>
</div></div>`;

  let body = '';
  if (route.kind === 'upload') {
    body = uploadHtml();
  } else if (route.kind === 'watch') {
    const v = findVideo(route.id || '');
    if (!v) body = `<div class="mt-main"><p>Video not found.</p><button type="button" class="mt-navbtn" data-mt-go="">Home</button></div>`;
    else body = watchHtml(v);
  } else if (route.kind === 'browse') {
    body = listPageHtml('Browse videos', videos, 'browse', route.page || 1);
  } else if (route.kind === 'search') {
    const filtered = searchVideos(videos, route.q);
    body = listPageHtml(`Search: ${route.q || '(empty)'}`, filtered, 'search', route.page || 1, route.q || '');
  } else {
    body = homeHtml(videos);
  }

  if (myGen !== mtGen) return;
  root.innerHTML = `${chrome}${body}`;

  const wnetGo = typeof window !== 'undefined' && window.wnetGo;

  const add = (type, fn, opts) => {
    root.addEventListener(type, fn, opts);
    detachListeners.push(() => root.removeEventListener(type, fn, opts));
  };

  const mainClick = (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !root.contains(t)) return;

    const go = t.closest('[data-mt-go]');
    if (go) {
      e.preventDefault();
      const sub = go.getAttribute('data-mt-go') ?? '';
      wnetGo?.('mytube', sub);
      return;
    }

    const rand = t.closest('[data-mt-random]');
    if (rand && videos.length) {
      e.preventDefault();
      const pick = videos[Math.floor(Math.random() * videos.length)];
      wnetGo?.('mytube', `v/${pick.id}`);
      return;
    }

    const w = t.closest('[data-mt-watch]');
    if (w) {
      e.preventDefault();
      const id = w.getAttribute('data-mt-watch');
      if (id) wnetGo?.('mytube', `v/${id}`);
      return;
    }

    const vv = t.closest('[data-mt-vvote]');
    if (vv) {
      e.preventDefault();
      const id = vv.getAttribute('data-mt-vid');
      const vote = vv.getAttribute('data-mt-vvote');
      const v = findVideo(id || '');
      if (v && (vote === 'up' || vote === 'down')) applyVideoVote(v, vote);
      wnetGo?.('mytube', subPath || `v/${id}`);
      return;
    }

    const cv = t.closest('[data-mt-cvote]');
    if (cv) {
      e.preventDefault();
      const vid = cv.getAttribute('data-mt-cvid');
      const cid = cv.getAttribute('data-mt-ccid');
      const vote = cv.getAttribute('data-mt-cvote');
      const v = findVideo(vid || '');
      const list = getSessionState().mytube?.comments?.[vid || ''] || [];
      const c = list.find((x) => x.id === cid);
      if (v && c && (vote === 'up' || vote === 'down')) applyCommentVote(v, c, vote);
      wnetGo?.('mytube', `v/${vid}`);
      return;
    }

    const postEl = t.closest('[data-mt-post]');
    const videoOnPage = route.kind === 'watch' ? findVideo(route.id || '') : null;
    if (postEl && videoOnPage) {
      e.preventDefault();
      const vid = videoOnPage.id;
      const persEl = root.querySelector('[data-mt-personality]');
      const ta = root.querySelector('[data-mt-text]');
      const ready = root.querySelector('[data-mt-ready]');
      const personality = persEl?.value || '';
      const text = ta?.value?.trim() || '';
      if (!personality || !text || !ready?.checked) return;
      const viewer = wahooViewerKey();
      const ck = channelKey(videoOnPage);
      const day = getGameDayIndex();
      const cid = `c-${Date.now()}`;
      patchSession((s) => {
        ensureMytube(s);
        if (!Array.isArray(s.mytube.comments[vid])) s.mytube.comments[vid] = [];
        s.mytube.comments[vid].push({
          id: cid,
          author: playerDisplayName(),
          text,
          up: 0,
          down: 0,
          source: 'player',
          personality,
          postedGameDay: day
        });
      });
      if (ck) {
        const d = personalityChannelDelta(personality);
        applyAffinityDelta(patchSession, viewer, ck, d);
      }
      const simMs = getState().sim?.elapsedMs || 0;
      const replies = generatePlayerReplies({ channel: 'mytube_comment', postId: vid, playerText: text, simMs });
      if (replies.length) schedulePlayerReplies({ channel: 'mytube_comment', targetId: vid, replies, simMs });
      scanHashtags(text);
      resetCompose(root, vid);
      wnetGo?.('mytube', `v/${vid}`);
    }
  };

  add('click', mainClick);

  const form = root.querySelector('#mt-search-form');
  if (form) {
    const onSearch = (ev) => {
      ev.preventDefault();
      const fd = new FormData(form);
      const q = String(fd.get('q') || '').trim();
      wnetGo?.('mytube', `search/${encodeURIComponent(q)}/1`);
    };
    add('submit', onSearch);
  }

  const upForm = root.querySelector('#mt-upload-form');
  if (upForm) {
    const onUp = (ev) => {
      ev.preventDefault();
      const fd = new FormData(upForm);
      const title = String(fd.get('title') || '').trim();
      const postType = String(fd.get('postType') || 'vlog');
      const desc = String(fd.get('desc') || '').trim();
      const mediaUrl = String(fd.get('mediaUrl') || '').trim();
      if (!title) return;
      const id = `mt-up-${Date.now()}`;
      const isReal = postType === 'real_clip' && mediaUrl;
      const row = {
        id,
        title,
        description: desc || `User upload (${postType})`,
        channel: playerDisplayName(),
        category: 'People',
        postType,
        duration: '0:42',
        fake: !isReal,
        views: 1,
        mediaSrc: isReal ? mediaUrl : null,
        mediaVideo: isReal && /\.(mp4|webm)(\?|$)/i.test(mediaUrl)
      };
      patchSession((s) => {
        ensureMytube(s);
        s.mytube.uploads.push(row);
        ensureVideoCounts(s, id);
      });
      wnetGo?.('mytube', `v/${id}`);
    };
    add('submit', onUp);
  }

  const videoOnPage = route.kind === 'watch' ? findVideo(route.id || '') : null;
  if (videoOnPage) {
    const onCompose = (e) => {
      const vid = videoOnPage.id;
      const persEl = root.querySelector('[data-mt-personality]');
      const ta = root.querySelector('[data-mt-text]');
      const ready = root.querySelector('[data-mt-ready]');
      const postBtn = root.querySelector('[data-mt-post]');

      if (e.type === 'change' && e.target === persEl) {
        const personality = persEl?.value || '';
        composeByVideo.delete(vid);
        if (!personality) {
          if (ta) {
            ta.value = '';
            ta.disabled = true;
            ta.readOnly = false;
            ta.placeholder = 'Pick a voice first…';
            ta.classList.remove('mt-compose-input--locked');
          }
          if (ready) {
            ready.checked = false;
            ready.disabled = true;
          }
          if (postBtn) postBtn.disabled = true;
          return;
        }
        if (ta) {
          ta.disabled = false;
          ta.value = '';
          ta.readOnly = false;
          ta.placeholder = 'Type comment…';
          ta.classList.remove('mt-compose-input--locked');
        }
        if (ready) {
          ready.checked = false;
          ready.disabled = true;
        }
        if (postBtn) postBtn.disabled = true;
        return;
      }

      if ((e.type === 'keydown' || e.type === 'focusin') && e.target === ta) {
        const personality = persEl?.value || '';
        if (!personality) return;
        const st = ensureComposeTarget(videoOnPage, personality);
        if (e.type === 'focusin') return;
        const ke = e;
        if (ke.type !== 'keydown') return;
        if (!ta || ta.readOnly) {
          ke.preventDefault();
          return;
        }
        const k = ke.key;
        if (k === 'Backspace') {
          ke.preventDefault();
          if (st.revealIndex > 0) {
            st.revealIndex--;
            ta.value = st.targetText.slice(0, st.revealIndex);
          }
          return;
        }
        if (k.length === 1 && /[a-zA-Z]/.test(k)) {
          ke.preventDefault();
          if (st.revealIndex < st.targetText.length) {
            st.revealIndex++;
            ta.value = st.targetText.slice(0, st.revealIndex);
          }
          if (st.revealIndex >= st.targetText.length) {
            ta.readOnly = true;
            ta.classList.add('mt-compose-input--locked');
            if (ready) {
              ready.disabled = false;
              ready.checked = true;
            }
            if (postBtn) postBtn.disabled = false;
          }
          return;
        }
        if (k.length === 1) ke.preventDefault();
      }
    };
    add('change', onCompose);
    add('keydown', onCompose);
    add('focusin', onCompose);
  }
}

export function teardownMytube() {
  mtGen++;
  if (rootEl) {
    for (const off of detachListeners) off();
  }
  detachListeners = [];
  rootEl = null;
  mountedMytubeSubPath = '';
  composeByVideo.clear();
}
