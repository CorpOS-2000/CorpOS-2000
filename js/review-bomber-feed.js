/**
 * Review Bomber (reviewbomber.net) — feed, votes, wall-clock live comments,
 * personality composer (session-only persistence; see sessionState.reviewBomber).
 */
import { escapeHtml } from './identity.js';
import { getState, SIM_HOUR_MS } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { getGameDayIndex } from './clock.js';
import { generateSocialComment, SOCIAL_COMMENT_VOICE_KEYS } from './social-comments.js';
import { rollD4, rollD20 } from './d20.js';
import { generatePlayerReplies, schedulePlayerReplies } from './player-interaction-replies.js';
import { scanHashtags } from './market-dynamics.js';
import { recordProductSignal, recordSyndicatedComment, normalizeProductKey } from './product-pulse.js';

let rbGen = 0;
let rootEl = null;
/** @type {((e: MouseEvent) => void) | null} */
let dripHandler = null;
/** @type {((e: Event) => void) | null} */
let composeHandler = null;
/** @type {{ posts: object[] } | null} */
let postsCache = null;

/** @type {Map<string, { targetText: string; revealIndex: number; started: boolean }>} */
const composeByPost = new Map();

/**
 * Fame stub: wire to `gameState.player.fame` when the sim tracks it; else 0.
 */
function playerFameStub() {
  const f = getState().player?.fame;
  return Math.max(0, Math.min(99, Number(f) || 0));
}

function activeWindowDays() {
  return playerFameStub() >= 2 ? 4 : 3;
}

function playerDisplayName() {
  const u = getSessionState().wahoo?.currentUser;
  if (u && String(u).trim()) return String(u).trim();
  return 'Guest';
}

/**
 * @param {string} postId
 */
function maxThreadActivityDay(postId) {
  const rb = getSessionState().reviewBomber;
  const base = rb.postBaseDay[postId];
  const baseNum = base != null ? Number(base) : null;
  let maxD = Number.isFinite(baseNum) ? baseNum : getGameDayIndex();
  const live = rb.liveComments[postId];
  if (Array.isArray(live)) {
    for (const c of live) {
      const d = c?.postedGameDay;
      if (d != null && Number.isFinite(Number(d))) maxD = Math.max(maxD, Number(d));
    }
  }
  return maxD;
}

/**
 * @param {string} postId
 */
function isPostDripEligible(postId) {
  const now = getGameDayIndex();
  const last = maxThreadActivityDay(postId);
  return now - last < activeWindowDays();
}

/**
 * @param {string} postId
 */
function hasRecentPlayerActivity(postId) {
  const rb = getSessionState().reviewBomber;
  const live = rb.liveComments[postId];
  if (!Array.isArray(live)) return false;
  const now = getGameDayIndex();
  const win = activeWindowDays();
  return live.some((c) => c?.source === 'player' && now - Number(c.postedGameDay || 0) < win);
}

/**
 * @param {object[]} posts
 * @param {string} viralId
 * @param {{ (): number }} rng
 */
function pickTargetPost(posts, viralId, rng) {
  const elig = posts.filter((p) => isPostDripEligible(p.id));
  if (!elig.length) return null;

  if (viralId && elig.some((p) => p.id === viralId) && rng() < 0.55) {
    return posts.find((p) => p.id === viralId) || null;
  }

  const weights = elig.map((p) => {
    let w = 1;
    if (p.viral) w += 1.5;
    if (hasRecentPlayerActivity(p.id)) w += 2.5;
    return w;
  });
  let sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < elig.length; i++) {
    r -= weights[i];
    if (r <= 0) return elig[i];
  }
  return elig[elig.length - 1];
}

/**
 * @param {string} base filename without extension under assets/
 * @returns {Promise<{ src: string, video: boolean } | null>}
 */
function probeAssetMedia(base) {
  const exts = ['gif', 'webp', 'png', 'mp4', 'webm'];
  const tryOne = (src, video) =>
    new Promise((resolve) => {
      if (video) {
        const v = document.createElement('video');
        v.muted = true;
        v.preload = 'metadata';
        const done = (ok) => {
          v.removeAttribute('src');
          resolve(ok ? { src, video: true } : null);
        };
        v.onloadeddata = () => done(true);
        v.onerror = () => done(false);
        v.src = src;
      } else {
        const im = new Image();
        const done = (ok) => {
          resolve(ok ? { src, video: false } : null);
        };
        im.onload = () => done(true);
        im.onerror = () => done(false);
        im.src = src;
      }
    });

  return (async () => {
    for (const ext of exts) {
      const video = ext === 'mp4' || ext === 'webm';
      const src = `assets/${base}.${ext}`;
      const hit = await tryOne(src, video);
      if (hit) return hit;
    }
    return null;
  })();
}

async function loadPostsJson() {
  if (postsCache) return postsCache;
  const res = await fetch('data/reviewbomber-posts.json');
  if (!res.ok) throw new Error(String(res.status));
  postsCache = await res.json();
  return postsCache;
}

function ensureCounts(posts) {
  patchSession((s) => {
    if (!s.reviewBomber.postBaseDay) s.reviewBomber.postBaseDay = {};
    if (s.reviewBomber.nextNpcDueSimMs == null) s.reviewBomber.nextNpcDueSimMs = 0;
    const day = getGameDayIndex();
    for (const p of posts) {
      if (!s.reviewBomber.counts[p.id]) {
        s.reviewBomber.counts[p.id] = {
          up: Number(p.stats?.up) || 0,
          down: Number(p.stats?.down) || 0
        };
      }
      if (s.reviewBomber.postBaseDay[p.id] == null) {
        s.reviewBomber.postBaseDay[p.id] = day;
      }
    }
  });
}

function commentLiHtml(row, currentDay, win) {
  const d = row.postedGameDay != null ? Number(row.postedGameDay) : null;
  const expired = d != null && Number.isFinite(d) && currentDay - d >= win;
  const cls = expired ? 'rb-comment rb-comment-expired' : 'rb-comment';
  return `<li class="${cls}"><b>${escapeHtml(row.author)}</b> — ${escapeHtml(row.text)}</li>`;
}

/**
 * @param {object} post
 * @param {string} resolvedMedia html or ''
 */
function postCardHtml(post, resolvedMedia) {
  const viral = !!post.viral;
  const rb = getSessionState().reviewBomber;
  const c = rb.counts[post.id] || { up: 0, down: 0 };
  const seeds = Array.isArray(post.seedComments) ? post.seedComments : [];
  const baseDay = rb.postBaseDay[post.id] ?? getGameDayIndex();
  const live = Array.isArray(rb.liveComments[post.id]) ? rb.liveComments[post.id] : [];
  const currentDay = getGameDayIndex();
  const win = activeWindowDays();

  const seedRows = seeds.map((x) => ({
    author: x.author,
    text: x.text,
    postedGameDay: baseDay,
    seed: true
  }));
  const comments = [...seedRows, ...live.map((x) => ({ ...x, seed: false }))];

  const views = post.stats?.views != null ? String(post.stats.views) : '—';
  const heat = post.heat ? String(post.heat) : '';

  const mediaBlock = resolvedMedia
    ? `<div class="rb-media-wrap">${resolvedMedia}</div>`
    : post.media?.base
      ? `<div class="rb-media-placeholder">Loading media…</div>`
      : '';

  const cls = viral ? 'rb-post rb-post--viral' : 'rb-post';
  const commentsLis = comments.map((row) => commentLiHtml(row, currentDay, win)).join('');

  return `<article class="${cls}" data-rb-post-id="${escapeHtml(post.id)}">
  <header class="rb-post-hd">
    <span class="rb-post-author">${escapeHtml(post.author || 'anonymous')}</span>
    ${viral ? '<span class="rb-viral-badge">VIRAL</span>' : ''}
    ${heat ? `<span class="rb-heat">${escapeHtml(heat)}</span>` : ''}
    <span class="rb-views">${escapeHtml(views)} views</span>
  </header>
  <h2 class="rb-post-title">${escapeHtml(post.title || '')}</h2>
  <div class="rb-post-body">${escapeHtml(post.body || '')}</div>
  ${mediaBlock}
  <div class="rb-votes">
    <button type="button" class="rb-vbtn rb-vbtn-up" data-rb-post="${escapeHtml(post.id)}" data-rb-vote="up">Helpful <span class="rb-cnt-up">${c.up}</span></button>
    <button type="button" class="rb-vbtn rb-vbtn-down" data-rb-post="${escapeHtml(post.id)}" data-rb-vote="down">Bogus <span class="rb-cnt-down">${c.down}</span></button>
  </div>
  <ul class="rb-comments" data-rb-comments="${escapeHtml(post.id)}">${commentsLis || '<li class="rb-comment rb-comment-empty">No comments yet.</li>'}</ul>
  <div class="rb-compose-status" data-rb-status="${escapeHtml(post.id)}" aria-live="polite"></div>
  <div class="rb-composer" data-rb-composer="${escapeHtml(post.id)}">
    <div class="rb-compose-row">
      <label class="rb-compose-label" for="rb-personality-${escapeHtml(post.id)}">Voice</label>
      <select id="rb-personality-${escapeHtml(post.id)}" class="rb-personality" data-rb-personality="${escapeHtml(post.id)}">
        <option value="">Choose personality…</option>
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
    </div>
    <textarea class="rb-compose-input" data-rb-text="${escapeHtml(post.id)}" rows="3" disabled placeholder="Select a personality first…"></textarea>
    <div class="rb-compose-actions">
      <label class="rb-ready-label"><input type="checkbox" class="rb-ready" data-rb-ready="${escapeHtml(post.id)}" disabled> Ready</label>
      <button type="button" class="rb-post-btn" data-rb-post-comment="${escapeHtml(post.id)}" disabled>Post</button>
    </div>
  </div>
</article>`;
}

function updateCountSpans(postId) {
  if (!rootEl) return;
  const art = rootEl.querySelector(`[data-rb-post-id="${postId}"]`);
  if (!art) return;
  const rb = getSessionState().reviewBomber;
  const c = rb.counts[postId];
  if (!c) return;
  const up = art.querySelector('.rb-cnt-up');
  const down = art.querySelector('.rb-cnt-down');
  if (up) up.textContent = String(c.up);
  if (down) down.textContent = String(c.down);
}

function applyVote(postId, vote) {
  patchSession((s) => {
    const rb = s.reviewBomber;
    if (!rb.counts[postId]) {
      rb.counts[postId] = { up: 0, down: 0 };
    }
    const prev = rb.userVote[postId];
    if (prev === vote) {
      if (vote === 'up') rb.counts[postId].up = Math.max(0, rb.counts[postId].up - 1);
      else rb.counts[postId].down = Math.max(0, rb.counts[postId].down - 1);
      delete rb.userVote[postId];
      return;
    }
    if (prev === 'up') rb.counts[postId].up = Math.max(0, rb.counts[postId].up - 1);
    if (prev === 'down') rb.counts[postId].down = Math.max(0, rb.counts[postId].down - 1);
    if (vote === 'up') rb.counts[postId].up++;
    else rb.counts[postId].down++;
    rb.userVote[postId] = vote;
  });
  updateCountSpans(postId);
  // Feed into publicPulse
  const post = postsCache?.posts?.find((p) => p.id === postId);
  if (post) {
    const productKey = normalizeProductKey(post.commentContext || post.id);
    recordProductSignal(productKey, vote === 'up' ? 'like' : 'dislike');
  }
}

function pickDistinctActors(n, rng) {
  try {
    const raw = window.ActorDB?.getAllRaw?.();
    const list = Array.isArray(raw) ? raw.filter((a) => a?.active !== false && a?.actor_id) : [];
    if (!list.length) return [];
    const shuffled = [...list].sort(() => rng() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length)).map((a) => a.actor_id);
  } catch {
    return [];
  }
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function appendLiveCommentToDom(postId, author, text) {
  if (!rootEl) return;
  const ul = rootEl.querySelector(`[data-rb-comments="${postId}"]`);
  if (!ul) return;
  const empty = ul.querySelector('.rb-comment-empty');
  if (empty) empty.remove();
  const li = document.createElement('li');
  li.className = 'rb-comment rb-comment-live';
  li.innerHTML = `<b>${escapeHtml(author)}</b> — ${escapeHtml(text)}`;
  ul.appendChild(li);
}

/**
 * Sim-time NPC comment batches: 1d20 comments per tick, next tick in 1d4 sim hours.
 * @param {number} simElapsedMs
 */
const REVIEW_BOMBER_MIN_REAL_MS = 500;
let _reviewBomberLastRealMs = 0;

export function tickReviewBomberNpc(simElapsedMs) {
  if (typeof performance !== 'undefined') {
    const now = performance.now();
    if (now - _reviewBomberLastRealMs < REVIEW_BOMBER_MIN_REAL_MS) return;
    _reviewBomberLastRealMs = now;
  }
  const t = Number(simElapsedMs) || 0;
  const posts = postsCache?.posts;
  if (!Array.isArray(posts) || !posts.length) return;

  const viralPost = posts.find((p) => p.viral);
  const viralId = viralPost?.id || '';
  const postById = Object.fromEntries(posts.map((p) => [p.id, p]));

  let safety = 0;
  while (safety < 64) {
    const rb = getSessionState().reviewBomber;
    let due = Number(rb.nextNpcDueSimMs) || 0;
    if (!due) {
      patchSession((p) => {
        p.reviewBomber.nextNpcDueSimMs = t + rollD4() * SIM_HOUR_MS;
      });
      break;
    }
    if (t < due) break;
    safety += 1;

    const rng = mulberry32((t ^ due ^ safety) >>> 0);
    const nRoll = rollD20();
    const actors = pickDistinctActors(nRoll, rng);
    const newRows = [];

    for (let i = 0; i < nRoll; i++) {
      const picked = pickTargetPost(posts, viralId, rng);
      if (!picked || !isPostDripEligible(picked.id)) continue;
      const post = postById[picked.id];
      if (!post) continue;
      const seed = ((t ^ due) >>> 0) + i * 9973;
      const gen = generateSocialComment({
        seed,
        flavor: post.commentFlavor === 'snack' || post.commentFlavor === 'generic' ? post.commentFlavor : 'auto',
        context: post.commentContext || 'generic',
        actor_id: actors[i] || undefined,
        aboutPlayer: !!actors[i],
        forcedPersonality:
          rng() < 0.38
            ? SOCIAL_COMMENT_VOICE_KEYS[Math.floor(rng() * SOCIAL_COMMENT_VOICE_KEYS.length)]
            : undefined
      });
      const day = getGameDayIndex();
      newRows.push({
        postId: picked.id,
        payload: {
          author: gen.author,
          text: gen.text,
          ts: Date.now(),
          postedGameDay: day,
          source: 'npc',
          personality: gen.tone
        }
      });
    }

    patchSession((p) => {
      p.reviewBomber.nextNpcDueSimMs = t + rollD4() * SIM_HOUR_MS;
      for (const row of newRows) {
        if (!p.reviewBomber.liveComments[row.postId]) p.reviewBomber.liveComments[row.postId] = [];
        p.reviewBomber.liveComments[row.postId].push(row.payload);
      }
    });

    for (const row of newRows) {
      appendLiveCommentToDom(row.postId, row.payload.author, row.payload.text);
    }
  }
}

/** Preload posts so sim ticks can run before the first visit. */
export function warmReviewBomberPosts() {
  return loadPostsJson().catch(() => null);
}

function resetComposerUi(article, postId) {
  const wrap = article.querySelector(`[data-rb-composer="${postId}"]`);
  if (!wrap) return;
  const sel = wrap.querySelector(`[data-rb-personality="${postId}"]`);
  const ta = wrap.querySelector(`[data-rb-text="${postId}"]`);
  const ready = wrap.querySelector(`[data-rb-ready="${postId}"]`);
  const btn = wrap.querySelector(`[data-rb-post-comment="${postId}"]`);
  if (sel) sel.value = '';
  if (ta) {
    ta.value = '';
    ta.disabled = true;
    ta.readOnly = false;
    ta.placeholder = 'Select a personality first…';
    ta.classList.remove('rb-compose-input--locked');
  }
  if (ready) {
    ready.checked = false;
    ready.disabled = true;
  }
  if (btn) btn.disabled = true;
  wrap.classList.remove('rb-composer--ready');
  composeByPost.delete(postId);
}

function ensureComposeTarget(post, postId, personality) {
  let st = composeByPost.get(postId);
  if (!st) {
    st = { targetText: '', revealIndex: 0, started: false };
    composeByPost.set(postId, st);
  }
  if (!st.started) {
    const seed = (Date.now() ^ (postId.length * 131)) >>> 0;
    const gen = generateSocialComment({
      seed,
      flavor: post.commentFlavor === 'snack' || post.commentFlavor === 'generic' ? post.commentFlavor : 'auto',
      context: post.commentContext || 'generic',
      forcedPersonality: personality
    });
    st.targetText = gen.text;
    st.revealIndex = 0;
    st.started = true;
  }
  return st;
}

/**
 * @param {MouseEvent} e
 * @param {object[]} posts
 */
function onComposeInteraction(e, posts) {
  const t = e.target;
  if (!(t instanceof Element)) return;
  const article = t.closest('[data-rb-post-id]');
  if (!article || !rootEl?.contains(article)) return;
  const postId = article.getAttribute('data-rb-post-id');
  if (!postId) return;
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  const persSel = t.closest('[data-rb-personality]');
  if (persSel && e.type === 'change') {
    const v = persSel.value;
    const ta = article.querySelector(`[data-rb-text="${postId}"]`);
    const ready = article.querySelector(`[data-rb-ready="${postId}"]`);
    const btn = article.querySelector(`[data-rb-post-comment="${postId}"]`);
    composeByPost.delete(postId);
    if (!v) {
      if (ta) {
        ta.value = '';
        ta.disabled = true;
        ta.readOnly = false;
        ta.placeholder = 'Select a personality first…';
        ta.classList.remove('rb-compose-input--locked');
      }
      if (ready) {
        ready.checked = false;
        ready.disabled = true;
      }
      if (btn) btn.disabled = true;
      article.querySelector(`[data-rb-composer="${postId}"]`)?.classList.remove('rb-composer--ready');
      return;
    }
    if (ta) {
      ta.disabled = false;
      ta.readOnly = false;
      ta.value = '';
      ta.placeholder = 'Type comment…';
      ta.classList.remove('rb-compose-input--locked');
    }
    if (ready) {
      ready.checked = false;
      ready.disabled = true;
    }
    if (btn) btn.disabled = true;
    article.querySelector(`[data-rb-composer="${postId}"]`)?.classList.remove('rb-composer--ready');
    return;
  }

  const ta = t.closest('[data-rb-text]');
  if (ta && (e.type === 'keydown' || e.type === 'focusin')) {
    const personality = article.querySelector(`[data-rb-personality="${postId}"]`)?.value;
    if (!personality) return;
    const st = ensureComposeTarget(post, postId, personality);
    if (e.type === 'focusin') return;

    const ke = e;
    if (ke.type !== 'keydown') return;
    if (ta.readOnly) {
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
        ta.classList.add('rb-compose-input--locked');
        const ready = article.querySelector(`[data-rb-ready="${postId}"]`);
        const btn = article.querySelector(`[data-rb-post-comment="${postId}"]`);
        if (ready) {
          ready.disabled = false;
          ready.checked = true;
        }
        if (btn) btn.disabled = false;
        article.querySelector(`[data-rb-composer="${postId}"]`)?.classList.add('rb-composer--ready');
      }
      return;
    }
    if (k.length === 1) ke.preventDefault();
    return;
  }

  const postBtn = t.closest('[data-rb-post-comment]');
  if (postBtn && e.type === 'click') {
    const personality = article.querySelector(`[data-rb-personality="${postId}"]`)?.value;
    const ta2 = article.querySelector(`[data-rb-text="${postId}"]`);
    const ready = article.querySelector(`[data-rb-ready="${postId}"]`);
    if (!personality || !ta2 || !ready?.checked) return;
    const text = ta2.value.trim();
    if (!text) return;

    const statusEl = article.querySelector(`[data-rb-status="${postId}"]`);
    const name = playerDisplayName();
    if (statusEl) statusEl.textContent = `${name} is posting…`;

    const delayPost = 300 + Math.random() * 500;
    window.setTimeout(() => {
      if (!rootEl?.contains(article)) return;
      const day = getGameDayIndex();
      patchSession((s) => {
        if (!s.reviewBomber.liveComments[postId]) s.reviewBomber.liveComments[postId] = [];
        s.reviewBomber.liveComments[postId].push({
          author: name,
          text,
          ts: Date.now(),
          postedGameDay: day,
          source: 'player',
          personality
        });
      });

      if (statusEl) statusEl.textContent = '';

      const simMs = getState().sim?.elapsedMs || 0;
      const replies = generatePlayerReplies({ channel: 'review_bomber', postId, playerText: text, simMs });
      if (replies.length) schedulePlayerReplies({ channel: 'review_bomber', targetId: postId, replies, simMs });
      scanHashtags(text);
      // Feed player comment into syndicated pool
      const _rbPost = posts?.find?.((p) => p.id === postId);
      if (_rbPost) {
        const _rbKey = normalizeProductKey(_rbPost.commentContext || _rbPost.id);
        recordSyndicatedComment({ text, likes: 0, dislikes: 0, source: 'reviewbomber', productKey: _rbKey });
        recordProductSignal(_rbKey, 'mention');
      }

      const ul = article.querySelector(`[data-rb-comments="${postId}"]`);
      if (ul) {
        const empty = ul.querySelector('.rb-comment-empty');
        if (empty) empty.remove();
        const li = document.createElement('li');
        li.className = 'rb-comment rb-comment-live';
        li.innerHTML = `<b>${escapeHtml(name)}</b> — ${escapeHtml(text)}`;
        ul.appendChild(li);
      }
      resetComposerUi(article, postId);
    }, delayPost);
  }
}

/**
 * @param {HTMLElement} container WorldNet content root
 */
export async function mountReviewBomberFeed(container) {
  const root = container.querySelector('#rb-root');
  if (!root) return;

  teardownReviewBomberFeed();
  const myGen = ++rbGen;
  rootEl = root;
  root.innerHTML = '<p class="rb-loading">Loading listings…</p>';

  let data;
  try {
    data = await loadPostsJson();
  } catch {
    if (myGen !== rbGen) return;
    root.innerHTML = '<p class="rb-loading">Could not load Review Bomber data.</p>';
    return;
  }

  if (myGen !== rbGen) return;

  const posts = data.posts || [];
  const viralPost = posts.find((p) => p.viral);
  const viralId = viralPost?.id || '';

  ensureCounts(posts);

  const htmlParts = [];
  for (const post of posts) {
    let mediaHtml = '';
    if (post.media?.base) {
      const hit = await probeAssetMedia(post.media.base);
      if (myGen !== rbGen) return;
      if (hit) {
        if (hit.video) {
          mediaHtml = `<video class="rb-media" src="${escapeHtml(hit.src)}" muted loop controls playsinline autoplay></video>`;
        } else {
          mediaHtml = `<img class="rb-media" src="${escapeHtml(hit.src)}" alt="${escapeHtml(post.media.alt || '')}">`;
        }
      } else {
        mediaHtml = `<div class="rb-media-placeholder">GIF/video not found — add <code class="rb-code">assets/${escapeHtml(
          post.media.base
        )}.gif</code> (or .webp / .png / .mp4).</div>`;
      }
    }
    htmlParts.push(postCardHtml(post, mediaHtml));
  }

  if (myGen !== rbGen) return;
  root.innerHTML = htmlParts.join('');
  composeByPost.clear();

  dripHandler = (e) => {
    const btn = e.target.closest('[data-rb-vote]');
    if (!btn || !root.contains(btn)) return;
    const postId = btn.getAttribute('data-rb-post');
    const vote = btn.getAttribute('data-rb-vote');
    if (!postId || (vote !== 'up' && vote !== 'down')) return;
    e.preventDefault();
    applyVote(postId, vote);
  };
  root.addEventListener('mousedown', dripHandler);

  composeHandler = (e) => onComposeInteraction(e, posts);
  root.addEventListener('change', composeHandler);
  root.addEventListener('keydown', composeHandler);
  root.addEventListener('focusin', composeHandler);
  root.addEventListener('click', composeHandler);
}

export function teardownReviewBomberFeed() {
  rbGen++;
  if (rootEl && dripHandler) {
    rootEl.removeEventListener('mousedown', dripHandler);
  }
  if (rootEl && composeHandler) {
    rootEl.removeEventListener('change', composeHandler);
    rootEl.removeEventListener('keydown', composeHandler);
    rootEl.removeEventListener('focusin', composeHandler);
    rootEl.removeEventListener('click', composeHandler);
  }
  dripHandler = null;
  composeHandler = null;
  rootEl = null;
  composeByPost.clear();
}
