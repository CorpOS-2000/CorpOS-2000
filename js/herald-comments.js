/**
 * Daily Herald — session-scoped comment threads, NPC seed + drip (EventSystem `tick`),
 * and persisted 👍/👎 crowd reactions (taglet affinity vs story topic → product-pulse + marketBuzz).
 */

import { escapeHtml } from './identity.js';
import { getState, SIM_HOUR_MS } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { getGameDayIndex } from './clock.js';
import { generateNewsComment, SOCIAL_COMMENT_VOICE_KEYS } from './social-comments.js';
import { rollD4, rollD20 } from './d20.js';
import { generatePlayerReplies, schedulePlayerReplies } from './player-interaction-replies.js';
import { scanHashtags } from './market-dynamics.js';
import { makeArticleId, batchApplyHeraldCrowdVotes } from './product-pulse.js';
import { rollHeraldCrowdVote } from './taglet-affinity.js';
import { buildMergedHeraldFeed } from './herald-feed.js';
import { assignProductTaglets, ensureProductTaglets } from './product-taglets.js';

const SEED_COMMENTS_PER_ARTICLE = 3;
/** Cap Herald NPC work per tick (seed + thread prep) for FPS. */
const HERALD_TRACKED_ARTICLES = 56;
const SEED_ARTICLES_BUDGET_PER_TICK = 6;
/** Herald NPC logic tied to sim time — avoid heavy merge + patch every animation frame. */
const HERALD_NPC_MIN_REAL_MS = 320;
let _heraldNpcLastRealMs = 0;

function ensureHeraldLive(s) {
  if (!s.heraldLive) {
    s.heraldLive = { nextDueSimMs: 0, threads: {}, seededArticleIds: {} };
  }
  if (!s.heraldLive.threads || typeof s.heraldLive.threads !== 'object') s.heraldLive.threads = {};
  if (!s.heraldLive.seededArticleIds || typeof s.heraldLive.seededArticleIds !== 'object') {
    s.heraldLive.seededArticleIds = {};
  }
  if (s.heraldLive.nextDueSimMs == null) s.heraldLive.nextDueSimMs = 0;
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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

function actorTagletsForId(actorId) {
  if (!actorId || typeof window === 'undefined' || !window.ActorDB?.getRaw) return [];
  try {
    const a = window.ActorDB.getRaw(actorId);
    return Array.isArray(a?.taglets) ? a.taglets : [];
  } catch {
    return [];
  }
}

/** Topic taglets for affinity + modular comments (product-backed or pseudo-topic). */
export function getStoryTopicTagletsForArticle(item, articleId) {
  if (item.productKey) {
    try {
      return ensureProductTaglets({ id: item.productKey, category: '' });
    } catch {
      /* fall through */
    }
  }
  return assignProductTaglets(`herald_topic|${articleId}`, String(item.kind || 'news'));
}

export function renderHeraldCommentBlockHtml(articleId) {
  const sess = getSessionState();
  ensureHeraldLive(sess);
  const comments = sess.heraldLive.threads[articleId]?.comments || [];
  const lis = comments.length
    ? comments
        .map(
          (c) =>
            `<li class="dh-hl-comment"><b>${escapeHtml(c.author || '')}</b> — ${escapeHtml(c.text || '')}</li>`
        )
        .join('')
    : '<li class="dh-hl-comment-empty" style="list-style:none;color:#888;">No comments yet.</li>';

  const pid = escapeHtml(articleId);
  const opts = SOCIAL_COMMENT_VOICE_KEYS.map(
    (k) => `<option value="${escapeHtml(k)}">${escapeHtml(k)}</option>`
  ).join('');

  return `<div class="dh-hl-thread" data-dh-hl-scope="${pid}">
  <div class="dh-hl-thread-hdr">Reader forum</div>
  <ul class="dh-hl-list" data-dh-hl-list="${pid}" style="margin:6px 0;padding-left:20px;min-height:1em;">${lis}</ul>
  <div class="dh-hl-compose">
    <label class="dh-hl-compose-lbl">Voice</label>
    <select class="dh-hl-voice" data-dh-hl-voice="${pid}">
      <option value="">Choose…</option>${opts}
    </select>
    <textarea class="dh-hl-ta" data-dh-hl-ta="${pid}" rows="2" disabled placeholder="Pick a voice first…"></textarea>
    <div class="dh-hl-compose-actions">
      <label class="dh-hl-ready-lbl"><input type="checkbox" class="dh-hl-ready" data-dh-hl-ready="${pid}" disabled> Ready to post</label>
      <button type="button" class="dh-hl-post" data-dh-hl-post="${pid}" disabled>Post</button>
    </div>
  </div>
</div>`;
}

let heraldListSyncRaf = 0;

function syncHeraldCommentListsNow(scope) {
  scope.querySelectorAll('.dh-hl-list[data-dh-hl-list]').forEach((ul) => {
    const id = ul.getAttribute('data-dh-hl-list');
    if (!id) return;
    const comments = getSessionState().heraldLive?.threads?.[id]?.comments || [];
    if (!comments.length) {
      ul.innerHTML =
        '<li class="dh-hl-comment-empty" style="list-style:none;color:#888;">No comments yet.</li>';
      return;
    }
    ul.innerHTML = comments
      .map(
        (c) =>
          `<li class="dh-hl-comment"><b>${escapeHtml(c.author || '')}</b> — ${escapeHtml(c.text || '')}</li>`
      )
      .join('');
  });
}

export function syncHeraldCommentLists(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || typeof scope.querySelector !== 'function') return;
  if (!scope.querySelector('.dh-hl-list')) return;
  if (typeof requestAnimationFrame === 'function') {
    if (heraldListSyncRaf) cancelAnimationFrame(heraldListSyncRaf);
    heraldListSyncRaf = requestAnimationFrame(() => {
      heraldListSyncRaf = 0;
      syncHeraldCommentListsNow(scope);
    });
  } else {
    syncHeraldCommentListsNow(scope);
  }
}

function queryVoiceEl(block, articleId) {
  return block?.querySelector(`[data-dh-hl-voice="${articleId}"]`);
}

function queryTa(block, articleId) {
  return block?.querySelector(`[data-dh-hl-ta="${articleId}"]`);
}

function queryReady(block, articleId) {
  return block?.querySelector(`[data-dh-hl-ready="${articleId}"]`);
}

function queryPostBtn(block, articleId) {
  return block?.querySelector(`[data-dh-hl-post="${articleId}"]`);
}

/**
 * @param {HTMLElement} root Herald mount (#dh-root)
 * @param {() => void} [fullRerender]
 */
export function bindHeraldCommentsRoot(root, fullRerender) {
  if (!root || root.dataset.dhHlCommentsBound) return;
  root.dataset.dhHlCommentsBound = '1';

  const onInteract = (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !root.contains(t)) return;

    const postBtn = t.closest('[data-dh-hl-post]');
    if (postBtn && e.type === 'click') {
      e.preventDefault();
      const articleId = postBtn.getAttribute('data-dh-hl-post');
      if (!articleId) return;
      const block = postBtn.closest('.dh-hl-thread');
      const voice = queryVoiceEl(block, articleId);
      const ta = queryTa(block, articleId);
      const ready = queryReady(block, articleId);
      const personality = voice?.value || '';
      const text = ta?.value?.trim() || '';
      if (!personality || !text || !ready?.checked) return;

      const u = getSessionState().wahoo?.currentUser;
      const author = u && String(u).trim() ? String(u).trim() : 'Guest';
      const day = getGameDayIndex();
      const cid = `dh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      patchSession((s) => {
        ensureHeraldLive(s);
        if (!s.heraldLive.threads[articleId]) s.heraldLive.threads[articleId] = { comments: [] };
        if (!Array.isArray(s.heraldLive.threads[articleId].comments)) {
          s.heraldLive.threads[articleId].comments = [];
        }
        s.heraldLive.threads[articleId].comments.push({
          id: cid,
          author,
          text,
          source: 'player',
          personality,
          postedGameDay: day
        });
      });

      const simMs = getState().sim?.elapsedMs || 0;
      const replies = generatePlayerReplies({
        channel: 'herald_article',
        postId: articleId,
        playerText: text,
        simMs
      });
      if (replies.length) {
        schedulePlayerReplies({ channel: 'herald_article', targetId: articleId, replies, simMs });
      }
      scanHashtags(text);

      if (block) {
        const taEl = queryTa(block, articleId);
        const vEl = queryVoiceEl(block, articleId);
        const rEl = queryReady(block, articleId);
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
      syncHeraldCommentLists(root);
      if (typeof fullRerender === 'function') fullRerender();
      return;
    }

    const voiceEl = t.closest('[data-dh-hl-voice]');
    if (voiceEl && e.type === 'change') {
      const block = voiceEl.closest('.dh-hl-thread');
      if (!block) return;
      const aid = voiceEl.getAttribute('data-dh-hl-voice');
      if (!aid) return;
      const ta = queryTa(block, aid);
      const ready = queryReady(block, aid);
      const btn = queryPostBtn(block, aid);
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

  root.addEventListener('click', onInteract);
  root.addEventListener('change', onInteract);

  root._dhHlCleanup = () => {
    root.removeEventListener('click', onInteract);
    root.removeEventListener('change', onInteract);
    delete root.dataset.dhHlCommentsBound;
    delete root._dhHlCleanup;
  };
}

/** NPC seed + drip — same cadence as pipeline live comments (1d20 batch, 1d4 sim hours). */
export function tickHeraldNpcComments(simElapsedMs) {
  if (typeof performance !== 'undefined') {
    const now = performance.now();
    if (now - _heraldNpcLastRealMs < HERALD_NPC_MIN_REAL_MS) return;
    _heraldNpcLastRealMs = now;
  }

  const t = Number(simElapsedMs) || 0;
  const feed = buildMergedHeraldFeed(t);
  if (!feed.length) return;

  const tracked = feed.slice(0, HERALD_TRACKED_ARTICLES);

  /** NPC 👍/👎 tied to same actors + taglet affinity as comments; persisted in product-pulse (EventSystem tick). */
  const crowdVoteBatch = [];

  patchSession((s) => {
    ensureHeraldLive(s);
    let seedBudget = SEED_ARTICLES_BUDGET_PER_TICK;
    for (const item of tracked) {
      const aid = makeArticleId(item.kind, item.atSimMs, item.headline);
      if (!s.heraldLive.threads[aid]) s.heraldLive.threads[aid] = { comments: [] };
      if (!Array.isArray(s.heraldLive.threads[aid].comments)) s.heraldLive.threads[aid].comments = [];

      if (!s.heraldLive.seededArticleIds[aid] && seedBudget > 0) {
        const topicTaglets = getStoryTopicTagletsForArticle(item, aid);
        const rng = mulberry32(hashStr(`dhseed|${aid}`));
        const actors = pickDistinctActors(SEED_COMMENTS_PER_ARTICLE, rng);
        for (let i = 0; i < SEED_COMMENTS_PER_ARTICLE; i++) {
          const seed = hashStr(`${aid}|npc|${i}`);
          const gen = generateNewsComment({
            seed,
            actor_id: actors[i],
            storyTopicTaglets: topicTaglets,
            storyProductKey: item.productKey || undefined,
            newsTier: item.newsTier,
            newsScore: item.newsScore
          });
          s.heraldLive.threads[aid].comments.push({
            id: `dh-seed-${aid}-${i}`.slice(0, 96),
            author: gen.author,
            text: gen.text,
            source: 'npc',
            personality: gen.tone,
            postedGameDay: getGameDayIndex()
          });
          const vote = rollHeraldCrowdVote(actorTagletsForId(actors[i]), topicTaglets, rng);
          crowdVoteBatch.push({
            articleId: aid,
            vote,
            productKey: item.productKey || null
          });
        }
        s.heraldLive.seededArticleIds[aid] = true;
        seedBudget -= 1;
      }
    }
  });

  const hl = getSessionState().heraldLive;
  let due = Number(hl?.nextDueSimMs) || 0;
  if (!due) {
    patchSession((s) => {
      ensureHeraldLive(s);
      s.heraldLive.nextDueSimMs = t + rollD4() * SIM_HOUR_MS;
    });
  } else if (t >= due) {
    patchSession((s) => {
      ensureHeraldLive(s);
      s.heraldLive.nextDueSimMs = t + rollD4() * SIM_HOUR_MS;
      const rng = mulberry32((t ^ due) >>> 0);
      const nRoll = rollD20();
      const day = getGameDayIndex();
      const actors = pickDistinctActors(nRoll, rng);

      for (let i = 0; i < nRoll; i++) {
        const item = feed[Math.floor(rng() * feed.length)] || feed[0];
        const aid = makeArticleId(item.kind, item.atSimMs, item.headline);
        if (!s.heraldLive.threads[aid]) s.heraldLive.threads[aid] = { comments: [] };
        const topicTaglets = getStoryTopicTagletsForArticle(item, aid);
        const seed = ((t ^ due) >>> 0) + i * 131071 + aid.length * 17;
        const gen = generateNewsComment({
          seed,
          actor_id: actors[i],
          storyTopicTaglets: topicTaglets,
          storyProductKey: item.productKey || undefined,
          newsTier: item.newsTier,
          newsScore: item.newsScore,
          forcedPersonality:
            rng() < 0.28 ? SOCIAL_COMMENT_VOICE_KEYS[Math.floor(rng() * SOCIAL_COMMENT_VOICE_KEYS.length)] : undefined
        });
        s.heraldLive.threads[aid].comments.push({
          id: `dh-npc-${t}-${i}-${hashStr(aid).toString(36)}`.slice(0, 96),
          author: gen.author,
          text: gen.text,
          source: 'npc',
          personality: gen.tone,
          postedGameDay: day
        });
        const vote = rollHeraldCrowdVote(actorTagletsForId(actors[i]), topicTaglets, rng);
        crowdVoteBatch.push({
          articleId: aid,
          vote,
          productKey: item.productKey || null
        });
      }
    });
  }

  if (crowdVoteBatch.length) batchApplyHeraldCrowdVotes(crowdVoteBatch);

  if (typeof document !== 'undefined') syncHeraldCommentLists(document);
}
