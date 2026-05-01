import {
  getState, getGameEpochMs, formatMoney,
  ccrListContracts, ccrContractTotal
} from './gameState.js';
import { escapeHtml } from './identity.js';
import { getRequirement, getModuleById } from './ccr-catalog.js';
import { on } from './events.js';
import { makeArticleId, getArticleEngagement, recordHeraldVote } from './product-pulse.js';
import { computePlayerAffinity, heraldAngleCopy } from './taglet-affinity.js';
import { ensureProductTaglets } from './product-taglets.js';
import { buildMergedHeraldFeed } from './herald-feed.js';
import { renderHeraldCommentBlockHtml, bindHeraldCommentsRoot, syncHeraldCommentLists } from './herald-comments.js';

function headlineIcon(kind) {
  if (kind === 'lore') return '🗞️';
  if (kind === 'syndicated') return '💬';
  if (kind === 'news_event') return '📣';
  if (kind === 'contract_created') return '📋';
  if (kind === 'contract_completed') return '✅';
  if (kind === 'negotiation') return '🤝';
  if (kind === 'contract_cancelled') return '❌';
  return '📰';
}

const mounts = new WeakMap();

function ms(root) {
  let s = mounts.get(root);
  if (!s) { s = { section: 'front', pendingRaf: 0 }; mounts.set(root, s); }
  return s;
}

/** Schedule one rAF render, dropping extra state-change events in the same frame. */
function scheduleRender(root) {
  const s = ms(root);
  if (s.pendingRaf) return;
  s.pendingRaf = requestAnimationFrame(() => {
    s.pendingRaf = 0;
    if (root.offsetParent !== null) renderInto(root);
  });
}

function heraldDate() {
  const epoch = getGameEpochMs();
  const sim = getState().sim?.elapsedMs || 0;
  const d = new Date(epoch + sim);
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function heraldTime() {
  const epoch = getGameEpochMs();
  const sim = getState().sim?.elapsedMs || 0;
  const d = new Date(epoch + sim);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderFrontPage() {
  const nowSimMs = getState().sim?.elapsedMs || 0;
  const feed = buildMergedHeraldFeed(nowSimMs);
  const breaking = feed[0];

  return `
  <!-- BREAKING BANNER -->
  <div class="dh-breaking">
    <span class="dh-breaking-tag">BREAKING</span>
    <span class="dh-breaking-text">${breaking ? escapeHtml(breaking.headline) : 'Welcome to The Daily Herald. No stories in the current archive window.'}</span>
  </div>

  <div class="dh-front-wrap">
    <div class="dh-archive-blurb">Rolling archive: the last <strong>60 in-game days</strong> — Hargrove, the CorpOS mandate, RapidGate fallout, and headlines from your business feed.</div>
    <div class="dh-sect-title">Headlines</div>
    ${
      feed.length
        ? feed
            .map((item) => {
              const d = new Date(getGameEpochMs() + (item.atSimMs || 0));
              const ts = d.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
              const icon = headlineIcon(item.kind);
              const deck = item.summary ? `<div class="dh-hl-deck">${escapeHtml(item.summary)}</div>` : '';
              const articleId = makeArticleId(item.kind, item.atSimMs, item.headline);
              const eng = getArticleEngagement(articleId);
              const likeActive = eng.playerVote === 'like' ? ' active-like' : '';
              const dislikeActive = eng.playerVote === 'dislike' ? ' active-dislike' : '';
              const engRow = `<div class="dh-engage">
                <button class="dh-engage-btn${likeActive}" data-dh-vote="like" data-article-id="${escapeHtml(articleId)}" title="This is good reporting">👍 ${eng.likes}</button>
                <button class="dh-engage-btn${dislikeActive}" data-dh-vote="dislike" data-article-id="${escapeHtml(articleId)}" title="Questionable reporting">👎 ${eng.dislikes}</button>
              </div>`;

              let angleRow = '';
              if (item.productKey) {
                try {
                  const taglets = ensureProductTaglets({ id: item.productKey, category: '' });
                  const aff = computePlayerAffinity(taglets);
                  if (aff.band !== 'neutral') {
                    const seed = articleId.split('').reduce((h, c) => h ^ c.charCodeAt(0), 0);
                    angleRow = `<div class="dh-angle">Your angle: ${escapeHtml(heraldAngleCopy(aff.band, seed))}</div>`;
                  }
                } catch (_) { /* optional */ }
              }

              const commentsBlock = renderHeraldCommentBlockHtml(articleId);

              return `<div class="dh-headline" data-article-id="${escapeHtml(articleId)}">
            <div class="dh-hl-row">
              <span class="dh-hl-icon">${icon}</span>
              <span class="dh-hl-text">${escapeHtml(item.headline)}</span>
              <span class="dh-hl-time">${escapeHtml(ts)}</span>
            </div>${deck}${engRow}${angleRow}${commentsBlock}
          </div>`;
            })
            .join('')
        : '<div class="dh-empty">No headlines in this archive window.</div>'
    }
  </div>`;
}

function renderClassifieds() {
  const active = ccrListContracts((c) => c.status === 'active');
  return `
    <div class="dh-sect-title">Classifieds — Open Contract Postings</div>
    ${active.length ? `<table class="dh-cl-tbl" cellpadding="0" cellspacing="0">
      <tr class="dh-cl-hdr"><td>ID</td><td>Client</td><td>Service</td><td>Modules</td><td>Price</td></tr>
      ${active.map((c) => {
        const issuer = window.AXIS?.resolveContact?.(c.issuerActorId)?.name || c.issuerActorId;
        const req = getRequirement(c.mainRequirement);
        const mods = c.moduleIds.map((m) => getModuleById(m)?.label || m).join(', ');
        return `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(issuer)}</td><td>${escapeHtml(req?.label || c.mainRequirement)}</td><td>${escapeHtml(mods)}</td><td>${escapeHtml(formatMoney(ccrContractTotal(c)))}</td></tr>`;
      }).join('')}
    </table>` : '<div class="dh-empty">No active listings. Check back later.</div>'}`;
}

function renderInto(root) {
  const s = ms(root);
  const SECTIONS = [
    { id: 'front', label: 'Front Page' },
    { id: 'classifieds', label: 'Classifieds' }
  ];

  const body = s.section === 'classifieds' ? renderClassifieds() : renderFrontPage();

  root.innerHTML = `<div class="dh-shell">
    <table class="dh-header" cellpadding="0" cellspacing="0">
      <tr>
        <td class="dh-logo-cell"><div class="dh-logo">The Daily Herald</div><div class="dh-tagline">Hargrove's Business News Source — Est. 1997</div></td>
        <td class="dh-date-cell">${escapeHtml(heraldDate())}<br>${escapeHtml(heraldTime())}</td>
      </tr>
    </table>
    <div class="dh-nav">${SECTIONS.map((sec) =>
      `<span class="${sec.id === s.section ? 'dh-nav-active' : 'dh-nav-link'}" data-dh-nav="${sec.id}">${escapeHtml(sec.label)}</span>`
    ).join('')}</div>
    <div class="dh-body">${body}</div>
    <div class="dh-footer">Copyright 2000 Daily Herald Media Group. All Rights Reserved. | ${escapeHtml(heraldDate())} ${escapeHtml(heraldTime())}</div>
  </div>`;
  syncHeraldCommentLists(root);
}

function bind(root) {
  if (root.dataset.dhBound) return;
  root.dataset.dhBound = '1';
  bindHeraldCommentsRoot(root);
  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-dh-nav]');
    if (nav) {
      ms(root).section = nav.dataset.dhNav || 'front';
      renderInto(root);
      return;
    }
    const voteBtn = e.target.closest('[data-dh-vote]');
    if (voteBtn) {
      const articleId = voteBtn.dataset.articleId;
      const vote = voteBtn.dataset.dhVote;
      if (articleId && (vote === 'like' || vote === 'dislike')) {
        recordHeraldVote(articleId, vote);
        renderInto(root);
      }
    }
  });
}

/** Lore + CCR + event headlines for desktop ticker / news hooks. */
export function getDailyHeraldTickerArticles(nowSimMs) {
  return buildMergedHeraldFeed(Number(nowSimMs) || 0);
}

export function initDailyHerald({ mount }) {
  if (!mount) return;
  bind(mount);
  renderInto(mount);
  if (!mount._dhUnsub) {
    mount._dhUnsub = on('stateChanged', () => scheduleRender(mount));
  }
  if (!mount._dhSessionUnsub) {
    mount._dhSessionUnsub = on('sessionChanged', () => {
      if (mount.offsetParent !== null) syncHeraldCommentLists(mount);
    });
  }
}
