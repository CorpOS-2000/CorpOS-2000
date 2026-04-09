/**
 * yourspace.net — Y2K social parody, full ActorDB directory, Real Time Chat (sim-time).
 */
import { escapeHtml } from './identity.js';
import { getSessionState, patchSession } from './sessionState.js';
import { SIM_HOUR_MS } from './gameState.js';
import { formatGameDateTime, getCurrentGameDate } from './clock.js';
import { generateYourspaceRtcPost, initYourspaceRtc } from './yourspace-rtc.js';
import { on } from './events.js';
import { applyAffinityDelta, affinityLabel, getAffinityScore } from './social-affinity.js';
import { rollD4, rollD20 } from './d20.js';

let ysGen = 0;
let rootEl = null;
/** @type {(() => void) | null} */
let sessionOff = null;
/** @type {((e: Event) => void) | null} */
let clickHandler = null;

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

function shuffleWithSeed(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function ensureRtcRowIds(s) {
  const feed = s.yourspace?.rtcFeed;
  if (!Array.isArray(feed)) return;
  feed.forEach((row, i) => {
    if (row.id) return;
    const aid = String(row.actorId || 'x').replace(/[^a-z0-9_-]/gi, '');
    row.id = `rtc-legacy-${row.simMs || 0}-${i}-${aid}`.slice(0, 80);
  });
}

function ensureRtcCounts(s, postId) {
  if (!s.yourspace.rtcCounts[postId]) s.yourspace.rtcCounts[postId] = { up: 0, down: 0 };
}

function applyRtcVote(postId, actorId, vote) {
  const viewer = wahooViewerKey();
  const prev = getSessionState().yourspace?.rtcVote?.[postId];
  patchSession((s) => {
    if (!s.yourspace.rtcCounts) s.yourspace.rtcCounts = {};
    if (!s.yourspace.rtcVote) s.yourspace.rtcVote = {};
    ensureRtcCounts(s, postId);
    const was = s.yourspace.rtcVote[postId];
    if (was === vote) {
      if (vote === 'up') s.yourspace.rtcCounts[postId].up = Math.max(0, s.yourspace.rtcCounts[postId].up - 1);
      else s.yourspace.rtcCounts[postId].down = Math.max(0, s.yourspace.rtcCounts[postId].down - 1);
      delete s.yourspace.rtcVote[postId];
      return;
    }
    if (was === 'up') s.yourspace.rtcCounts[postId].up = Math.max(0, s.yourspace.rtcCounts[postId].up - 1);
    if (was === 'down') s.yourspace.rtcCounts[postId].down = Math.max(0, s.yourspace.rtcCounts[postId].down - 1);
    if (vote === 'up') s.yourspace.rtcCounts[postId].up++;
    else s.yourspace.rtcCounts[postId].down++;
    s.yourspace.rtcVote[postId] = vote;
  });
  if (actorId) {
    let delta = 0;
    if (prev === vote) delta = vote === 'up' ? -2 : 2;
    else if (!prev) delta = vote === 'up' ? 2 : -2;
    else if (prev === 'up' && vote === 'down') delta = -4;
    else if (prev === 'down' && vote === 'up') delta = 4;
    if (delta) applyAffinityDelta(patchSession, viewer, `actor:${actorId}`, delta);
  }
  syncRtcDom();
}

function renderRtcPane() {
  const sess = getSessionState();
  const rtc = sess.yourspace?.rtcFeed || [];
  const counts = sess.yourspace?.rtcCounts || {};
  const votes = sess.yourspace?.rtcVote || {};
  const lines = rtc
    .slice(-80)
    .map((row) => {
      const id = escapeHtml(row.id || '');
      const pid = row.id || '';
      const c = counts[pid] || { up: 0, down: 0 };
      const uv = votes[pid];
      const upCls = uv === 'up' ? ' is-on' : '';
      const dnCls = uv === 'down' ? ' is-on' : '';
      const aid = row.actorId ? escapeHtml(row.actorId) : '';
      return `<div class="ys-rtc-row" data-rtc-id="${id}">
<span class="ys-rtc-author">${escapeHtml(row.author)}</span>
<span class="ys-rtc-time">${escapeHtml(row.timeLabel)}</span>
<div class="ys-rtc-text">${escapeHtml(row.text)}</div>
<div class="ys-rtc-actions">
  <button type="button" class="ys-rtc-vbtn ys-rtc-vbtn-up${upCls}" data-ys-rtc-vote="up" data-ys-rtc-post="${id}" data-ys-rtc-actor="${aid}">👍 <span class="ys-rtc-cnt-up">${c.up}</span></button>
  <button type="button" class="ys-rtc-vbtn ys-rtc-vbtn-down${dnCls}" data-ys-rtc-vote="down" data-ys-rtc-post="${id}" data-ys-rtc-actor="${aid}">👎 <span class="ys-rtc-cnt-down">${c.down}</span></button>
</div>
</div>`;
    })
    .reverse()
    .join('');
  return (
    lines ||
    '<div class="ys-rtc-empty">Real Time Chat is quiet… new posts arrive every few sim-hours (variable).</div>'
  );
}

function renderActorRows(actors, viewer) {
  return actors
    .map((a) => {
      const name = escapeHtml(displayNameFromActor(a));
      const id = escapeHtml(a.actor_id || '');
      const prof = escapeHtml((a.profession || '').slice(0, 48));
      const score = getAffinityScore(getSessionState(), viewer, `actor:${a.actor_id}`);
      const { label } = affinityLabel(score);
      const vibe = escapeHtml(label);
      return `<tr class="ys-tr-profile" data-ys-profile="${id}" title="View profile">
<td class="ys-td-av"><div class="ys-silhouette" aria-hidden="true"></div></td>
<td class="ys-td-name">${name}</td>
<td class="ys-td-id">${id}</td>
<td class="ys-td-prof">${prof}</td>
<td class="ys-td-vibe"><span class="ys-vibe">${vibe}</span></td>
</tr>`;
    })
    .join('');
}

function renderProfile(actor, viewer) {
  if (!actor?.actor_id) {
    return `<div class="ys-profile-miss"><p>Profile not found.</p><button type="button" class="ys-btn" data-ys-back>← Back</button></div>`;
  }
  const name = escapeHtml(displayNameFromActor(actor));
  const id = escapeHtml(actor.actor_id);
  const prof = escapeHtml(actor.profession || '—');
  const legal = escapeHtml(actor.full_legal_name || '—');
  const score = getAffinityScore(getSessionState(), viewer, `actor:${actor.actor_id}`);
  const { label, tone } = affinityLabel(score);
  return `<div class="ys-profile" data-ys-profile-page="${id}">
<button type="button" class="ys-btn ys-profile-back" data-ys-back>← Neighbor table</button>
<div class="ys-profile-head">
  <div class="ys-silhouette ys-silhouette--lg" aria-hidden="true"></div>
  <div>
    <h2 class="ys-profile-name">${name}</h2>
    <div class="ys-profile-id">${id}</div>
    <div class="ys-profile-vibe ys-vibe--${tone}" data-ys-profile-vibe>How you see them: <b>${escapeHtml(label)}</b></div>
  </div>
</div>
<table class="ys-profile-table">
<tr><th>Legal name</th><td>${legal}</td></tr>
<tr><th>Profession</th><td>${prof}</td></tr>
<tr><th>Headline</th><td>${escapeHtml(actor.public_profile?.headline || '—')}</td></tr>
</table>
<p class="ys-muted">Affinity shifts when you like/dislike RTC lines or interact on MyTube.</p>
</div>`;
}

/**
 * @param {(name: string) => Promise<unknown>} loadJson
 */
export async function initYourspaceFeed(loadJson) {
  try {
    await initYourspaceRtc(loadJson);
  } catch (e) {
    console.warn('[YourSpace] could not load RTC data', e?.message || e);
  }
}

/**
 * Advance RTC on 1d4 sim-hour cadence; 1d20 = how many actors post each batch.
 * @param {number} simElapsedMs
 */
export function tickYourspaceRtc(simElapsedMs) {
  const t = Number(simElapsedMs) || 0;
  patchSession((s) => {
    if (!s.yourspace) {
      s.yourspace = {
        rtcFeed: [],
        lastRtcBoundarySimMs: 0,
        rtcNextDueSimMs: 0,
        rtcCounts: {},
        rtcVote: {}
      };
    }
    if (!s.yourspace.rtcCounts) s.yourspace.rtcCounts = {};
    if (!s.yourspace.rtcVote) s.yourspace.rtcVote = {};
    if (s.yourspace.rtcNextDueSimMs == null) s.yourspace.rtcNextDueSimMs = 0;
    ensureRtcRowIds(s);

    let due = Number(s.yourspace.rtcNextDueSimMs) || 0;
    if (!due) {
      due = t + rollD4() * SIM_HOUR_MS;
      s.yourspace.rtcNextDueSimMs = due;
    }

    let safety = 0;
    while (t >= due && safety < 64) {
      safety += 1;
      const raw = window.ActorDB?.getAllRaw?.();
      const actors = Array.isArray(raw) ? raw.filter((a) => a?.active !== false && a?.actor_id) : [];
      if (actors.length) {
        const roll = rollD20();
        const n = Math.min(roll, actors.length);
        const rng = mulberry32((t ^ due ^ safety) >>> 0);
        const picks = shuffleWithSeed(actors, rng).slice(0, n);
        const gameDate = getCurrentGameDate();
        const timeLabel = formatGameDateTime(gameDate);
        const batchTag = (t ^ due) >>> 0;

        for (let i = 0; i < picks.length; i++) {
          const act = picks[i];
          const author = displayNameFromActor(act);
          const seed = (batchTag + i * 1103 + String(act.actor_id).length * 97) >>> 0;
          const text = generateYourspaceRtcPost({ seed, authorDisplay: author });
          const postId = `rtc-${batchTag}-${safety}-${i}-${String(act.actor_id).replace(/[^a-z0-9_-]/gi, '')}`.slice(
            0,
            96
          );
          s.yourspace.rtcFeed.push({
            id: postId,
            actorId: act.actor_id,
            author,
            text,
            simMs: t,
            timeLabel
          });
          ensureRtcCounts(s, postId);
        }
      }

      due = t + rollD4() * SIM_HOUR_MS;
      s.yourspace.rtcNextDueSimMs = due;
      s.yourspace.lastRtcBoundarySimMs = t;
    }

    if (s.yourspace.rtcFeed.length > 500) {
      s.yourspace.rtcFeed = s.yourspace.rtcFeed.slice(-500);
    }
  });
}

function syncRtcDom() {
  const el = rootEl?.querySelector('#ys-rtc-feed');
  if (!el) return;
  el.innerHTML = renderRtcPane();
}

/**
 * @param {HTMLElement} container WorldNet #wnet-descendant
 * @param {string} subPath e.g. profile/ACT-01
 */
export async function mountYourspace(container, subPath = '') {
  teardownYourspace();
  const myGen = ++ysGen;
  const root = container.querySelector('#ys-root');
  if (!root) return;

  rootEl = root;

  const raw = window.ActorDB?.getAllRaw?.();
  const actors = Array.isArray(raw)
    ? [...raw].filter((a) => a?.active !== false && a?.actor_id).sort((a, b) => String(a.actor_id).localeCompare(String(b.actor_id)))
    : [];

  patchSession((s) => {
    if (!s.yourspace)
      s.yourspace = {
        rtcFeed: [],
        lastRtcBoundarySimMs: 0,
        rtcNextDueSimMs: 0,
        rtcCounts: {},
        rtcVote: {}
      };
    if (s.yourspace.rtcNextDueSimMs == null) s.yourspace.rtcNextDueSimMs = 0;
    if (!s.yourspace.rtcCounts) s.yourspace.rtcCounts = {};
    if (!s.yourspace.rtcVote) s.yourspace.rtcVote = {};
    ensureRtcRowIds(s);
  });

  if (myGen !== ysGen) return;

  const viewer = wahooViewerKey();
  const sub = String(subPath || '').replace(/^\/+/, '');
  let profileActor = null;
  if (sub.toLowerCase().startsWith('profile/')) {
    const pid = sub.slice('profile/'.length).trim();
    profileActor = actors.find((a) => a.actor_id === pid) || null;
  }

  if (profileActor) {
    root.innerHTML = `<div class="ys-layout ys-layout--profile">${renderProfile(profileActor, viewer)}</div>`;
  } else {
    root.innerHTML = `
<div class="ys-layout">
  <div class="ys-main">
    <div class="ys-top8">
      <h3 class="ys-h3">★ Top 8 ★ <span class="ys-muted">( CorpOS picks )</span></h3>
      <div id="ys-top8" class="ys-top8-grid"></div>
    </div>
    <div class="ys-about">
      <h3 class="ys-h3">About me</h3>
      <p class="ys-bio">Welcome to <b>YourSpace</b> — where every generated citizen gets a row and the RTC never stops. Friend bulletins are session-only. CorpOS is watching (Mandate 2000-CR7).</p>
    </div>
    <div class="ys-rtc-wrap">
      <h3 class="ys-h3">Real Time Chat</h3>
      <div id="ys-rtc-feed" class="ys-rtc-feed">${renderRtcPane()}</div>
    </div>
  </div>
  <aside class="ys-side">
    <div class="ys-side-box">
      <h4>Neighbor table</h4>
      <p class="ys-muted">${actors.length} profiles — click a row</p>
      <div class="ys-table-scroll">
        <table class="ys-table"><thead><tr><th></th><th>Name</th><th>ID</th><th>Job</th><th>Vibe</th></tr></thead><tbody id="ys-neighbors">${renderActorRows(
          actors,
          viewer
        )}</tbody></table>
      </div>
    </div>
  </aside>
</div>`;

    const top8 = root.querySelector('#ys-top8');
    if (top8) {
      const rng = mulberry32((actors.length + 42) >>> 0);
      const picks = shuffleWithSeed(actors, rng).slice(0, 8);
      top8.innerHTML = picks
        .map((a, i) => {
          const nm = escapeHtml(displayNameFromActor(a));
          const aid = escapeHtml(a.actor_id || '');
          const colors = ['#ff9ec5', '#9ec5ff', '#c5ff9e', '#ffd49e', '#d49eff', '#9effd4', '#ff9e9e', '#e0e0e0'];
          const bg = colors[i % colors.length];
          return `<div class="ys-friend ys-friend--click" data-ys-profile="${aid}" style="background:${bg};"><div class="ys-friend-av"><div class="ys-silhouette ys-silhouette--sm"></div></div><div class="ys-friend-rank">#${i + 1}</div><div class="ys-friend-name">${nm}</div></div>`;
        })
        .join('');
    }
  }

  const wnetGo = typeof window !== 'undefined' && typeof window.wnetGo === 'function' ? window.wnetGo : null;

  clickHandler = (e) => {
    const t = e.target;
    if (!(t instanceof Element) || !root.contains(t)) return;
    const back = t.closest('[data-ys-back]');
    if (back) {
      e.preventDefault();
      wnetGo?.('yourspace', '');
      return;
    }
    const prof = t.closest('[data-ys-profile]');
    if (prof) {
      const id = prof.getAttribute('data-ys-profile');
      if (id) {
        e.preventDefault();
        wnetGo?.('yourspace', `profile/${id}`);
      }
      return;
    }
    const vb = t.closest('[data-ys-rtc-vote]');
    if (vb) {
      e.preventDefault();
      const vote = vb.getAttribute('data-ys-rtc-vote');
      const post = vb.getAttribute('data-ys-rtc-post');
      const actor = vb.getAttribute('data-ys-rtc-actor') || '';
      if (!post || (vote !== 'up' && vote !== 'down')) return;
      applyRtcVote(post, actor || null, vote);
    }
  };
  root.addEventListener('click', clickHandler);

  const onSession = () => {
    if (root.querySelector('#ys-rtc-feed')) syncRtcDom();
    const tbody = root.querySelector('#ys-neighbors');
    if (tbody) {
      const v = wahooViewerKey();
      tbody.innerHTML = renderActorRows(actors, v);
    }
    const profPage = root.querySelector('[data-ys-profile-page]');
    const vibeEl = root.querySelector('[data-ys-profile-vibe]');
    if (profPage && vibeEl) {
      const aid = profPage.getAttribute('data-ys-profile-page') || '';
      const score = getAffinityScore(getSessionState(), wahooViewerKey(), `actor:${aid}`);
      const { label, tone } = affinityLabel(score);
      vibeEl.className = `ys-profile-vibe ys-vibe--${tone}`;
      vibeEl.innerHTML = `How you see them: <b>${escapeHtml(label)}</b>`;
    }
  };
  sessionOff = on('sessionChanged', onSession);
}

export function teardownYourspace() {
  ysGen++;
  if (rootEl && clickHandler) {
    rootEl.removeEventListener('click', clickHandler);
  }
  clickHandler = null;
  if (sessionOff) {
    sessionOff();
    sessionOff = null;
  }
  rootEl = null;
}
