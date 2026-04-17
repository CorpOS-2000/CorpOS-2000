/**
 * bc-browser.js — Black Cherry mobile browser
 * Wraps the existing WorldNet page renderer with mobile constraints.
 * Uses window.renderWorldNetPage (set in worldnet exposeGlobals) — no circular imports.
 */

import { getState } from './gameState.js';
import {
  resolveLocationFromAddress,
  urlForPage,
  titleForWorldNetPage,
} from './worldnet-routes.js';
import { escapeHtml } from './identity.js';
import { toast } from './toast.js';
import { initDailyHerald } from './daily-herald.js';
import { CORPOS_GATED_PAGE_KEYS, renderGateInterstitial } from './corpos-enrollment.js';

const BC_MAX_HISTORY = 8;
const BC_MAX_BOOKMARKS = 10;
const LOAD_DELAY_MS = 1200;

let _history = [];
let _histIdx = -1;
let _loading = false;
/** @type {HTMLElement | null} */
let _rootEl = null;
let _currentPageKey = '';
let _currentSub = '';

const HARD_BLOCKED_KEYS = new Set([
  'mytube',
  'webex-publisher',
  'webexploiter',
  'admin-web',
  'admin-axis',
  'admin-npc',
  'admin-company',
  'admin-gov',
  'intek_download',
  'microcorp_office',
  'darkweb_entry',
  'darkweb',
  'devtools',
  'bank_darkweb',
]);

const HARD_BLOCKED_CATEGORIES = new Set(['downloads', 'dark']);

const GOV_READONLY_KEYS = new Set([
  'fra',
  'bizreg',
  'ssa',
  'focs_mandate',
  'corpos_portal',
]);

const VIDEO_MODULE_TYPES = new Set(['video_embed', 'media_player_embed']);

const BLOCK_MESSAGES = {
  video: {
    icon: '📵',
    title: 'Video Unavailable',
    body: 'Video playback is not supported on Black Cherry.\n\nVisit this page on your CorpOS desktop to watch.',
  },
  webex: {
    icon: '🖥',
    title: 'Desktop Required',
    body: 'WebEx-Publisher requires a CorpOS desktop connection.\n\nOpen it from your desktop to continue.',
  },
  admin: {
    icon: '🔒',
    title: 'Desktop Required',
    body: 'This tool requires CorpOS desktop access.\n\nAdmin tools are not available on this device.',
  },
  download: {
    icon: '⚠',
    title: 'Downloads Unavailable',
    body: 'File downloads are not available on this device.\n\nVisit this page on your CorpOS desktop to download.',
  },
  darkweb: {
    icon: '⛔',
    title: 'Connection Failed',
    body: 'This connection type is not supported on Black Cherry.\n\nBlack Cherry does not support anonymous network protocols.',
  },
  exploiter: {
    icon: '🔒',
    title: 'Desktop Required',
    body: 'WebExploiter requires a CorpOS desktop connection.',
  },
  gov: {
    icon: '⚖',
    title: 'Read Only',
    body: 'Government portals are view-only on mobile.\n\nFiling and form submission requires desktop verification.',
  },
  checkout: {
    icon: '🛒',
    title: 'Checkout Unavailable',
    body: 'Complete your purchase on a CorpOS desktop connection.\n\nYour cart will be saved.',
  },
  openwindow: {
    icon: '🖥',
    title: 'Desktop Required',
    body: 'This action requires a desktop connection.',
  },
};

function callRenderPage(key, sub) {
  const fn = typeof window !== 'undefined' ? window.renderWorldNetPage : null;
  if (typeof fn !== 'function') {
    return '<div class="iebody"><p>WorldNet is not ready.</p></div>';
  }
  try {
    return fn(key, sub ?? '');
  } catch {
    return '<div class="iebody"><p>Page could not be loaded.</p></div>';
  }
}

function pageDefFor(key, sub) {
  if (key === 'pipeline_page') {
    return getState().contentRegistry?.pages?.find((p) => p.pageId === sub);
  }
  return getState().contentRegistry?.pages?.find((p) => p.pageId === key);
}

function getBlockType(key, sub) {
  if (key === 'wn_shop' && sub && /(^|\/)checkout(\/|$)/i.test(String(sub))) {
    return 'checkout';
  }

  if (key === 'pipeline_page' && sub && HARD_BLOCKED_KEYS.has(sub)) {
    if (sub === 'mytube') return 'video';
    if (sub === 'webex-publisher') return 'webex';
    if (sub === 'webexploiter') return 'exploiter';
    if (String(sub).startsWith('admin-')) return 'admin';
    return 'admin';
  }

  if (HARD_BLOCKED_KEYS.has(key)) {
    if (key === 'mytube') return 'video';
    if (key === 'webex-publisher') return 'webex';
    if (key === 'webexploiter') return 'exploiter';
    if (key.startsWith('admin-')) return 'admin';
    if (key === 'intek_download' || key === 'microcorp_office') return 'download';
    if (key === 'darkweb_entry' || key === 'darkweb' || key === 'bank_darkweb') return 'darkweb';
    return 'admin';
  }

  const page = pageDefFor(key, sub);
  if (page) {
    if (page.category && HARD_BLOCKED_CATEGORIES.has(page.category)) return 'download';
    if (page.layoutTemplate === 'webex_mirror' || page.systemType === 'webex') return 'webex';
    const sections = page.sections || [];
    if (sections.some((s) => VIDEO_MODULE_TYPES.has(s.type || s.sectionType))) return 'video';
    const cells = page.webExLayout?.cells || [];
    if (
      cells.some((c) =>
        (c.sections || []).some((s) => VIDEO_MODULE_TYPES.has(s.type || s.sectionType))
      )
    ) {
      return 'video';
    }
  }

  return null;
}

function urlForKey(key, sub) {
  if (key === 'pipeline_page' && sub) {
    const page = getState().contentRegistry?.pages?.find((p) => p.pageId === sub);
    if (page?.url) {
      try {
        const raw = String(page.url).trim();
        const u = raw.includes('://') ? raw : `http://${raw}`;
        return new URL(u).href;
      } catch {
        /* fall through */
      }
    }
  }
  const u = urlForPage(key, sub || '');
  if (u) return u;
  return `http://worldnet.local/${key}${sub ? `/${sub}` : ''}`;
}

function applyMobileTransforms(html, pageKey) {
  const div = document.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll('img').forEach((el) => {
    const w = parseInt(el.getAttribute('width') || '', 10) || parseInt(String(el.style.width || '').replace(/\D/g, ''), 10) || 0;
    const inAd =
      el.closest('[class*="ad"], .ad, [data-wnet-ad-slot], [data-wn-ad-page]') ||
      /banner|ad/i.test(el.getAttribute('alt') || '') ||
      /banner|ad/i.test(el.getAttribute('src') || '');
    if (inAd && w > 120) el.remove();
  });

  div.querySelectorAll('table').forEach((el) => {
    const w = parseInt(el.getAttribute('width') || '', 10) || 0;
    if (w >= 234 && el.closest('[class*="ad"], .ad')) el.remove();
  });

  div.querySelectorAll('video, iframe, embed, object').forEach((el) => {
    const notice = document.createElement('div');
    notice.className = 'bcb-video-strip-notice';
    notice.textContent = '📵 Video not available on mobile.';
    el.replaceWith(notice);
  });

  div
    .querySelectorAll('[onclick*="checkout" i], [data-action*="checkout" i], input[value="Checkout" i]')
    .forEach((el) => {
      el.setAttribute('disabled', 'true');
      el.setAttribute('title', 'Complete purchases on desktop');
      el.style.opacity = '0.4';
      el.style.cursor = 'not-allowed';
      const note = document.createElement('div');
      note.className = 'bcb-checkout-note';
      note.textContent = 'Complete your purchase on a desktop connection.';
      el.parentNode?.insertBefore(note, el.nextSibling);
    });

  div.querySelectorAll('[onclick*="openW("]').forEach((el) => {
    el.setAttribute('onclick', 'window.bcbDesktopOnlyNotice(event)');
  });

  div.querySelectorAll('a[href*=".exe"], a[href*=".zip"], a[href*=".msi"]').forEach((el) => {
    el.setAttribute('onclick', 'window.bcbDesktopOnlyNotice(event); return false;');
    el.style.color = '#888';
  });

  div.querySelectorAll('a[href="#"]').forEach((el) => {
    const oc = el.getAttribute('onclick') || '';
    const m = oc.match(/wnetGo\(\s*['"]([^'"]+)['"]/);
    if (m) {
      el.setAttribute('data-bcb-key', m[1]);
      const sm = oc.match(/wnetGo\([^,]+,\s*['"]([^'"]*)['"]/);
      if (sm) el.setAttribute('data-bcb-sub', sm[1]);
      el.removeAttribute('onclick');
    }
  });

  return div.innerHTML;
}

function renderInlineMessage(nearEl, text, type = 'warn') {
  const parent = nearEl.parentElement;
  if (parent?.querySelector('.bcb-inline-msg')) return;
  const div = document.createElement('div');
  div.className = `bcb-inline-msg bcb-inline-msg--${type}`;
  div.textContent = text;
  nearEl.after(div);
  setTimeout(() => div.remove(), 5000);
}

export function initBcBrowser(rootEl) {
  _rootEl = rootEl;
  renderBrowserShell();
  bindBrowserChromeEvents();
  bindRootDelegation();
  if (_history.length === 0) {
    navigateTo('moogle_home', '');
  } else {
    const cur = _history[_histIdx];
    if (cur) renderCurrentPage(cur.key, cur.sub);
  }
}

function renderBrowserShell() {
  if (!_rootEl) return;
  _rootEl.innerHTML = `
<div class="bcb-app">
  <div class="bcb-bar">
    <button type="button" class="bcb-nav-btn" id="bcb-back" title="Back">◀</button>
    <button type="button" class="bcb-nav-btn" id="bcb-fwd" title="Forward">▶</button>
    <div class="bcb-addr-wrap">
      <input type="text" id="bcb-addr" class="bcb-addr" placeholder="http://" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" />
    </div>
    <button type="button" class="bcb-nav-btn" id="bcb-go" title="Go">▶▶</button>
    <button type="button" class="bcb-nav-btn" id="bcb-bmark" title="Bookmark">★</button>
  </div>
  <div class="bcb-loading-wrap" id="bcb-loading-wrap" style="display:none">
    <div class="bcb-loading-bar" id="bcb-loading-bar"></div>
    <div class="bcb-loading-label" id="bcb-loading-label">Connecting...</div>
  </div>
  <div class="bcb-content" id="bcb-content">
    <div class="bcb-home" id="bcb-home-screen">${renderMobileHome()}</div>
  </div>
  <div class="bcb-status" id="bcb-status">
    <span id="bcb-status-text">Black Cherry Browser 1.0</span>
    <span class="bcb-modem-icon" title="Dial-up connection">📶</span>
  </div>
</div>`;
}

function renderMobileHome() {
  const quickLinks = [
    { label: 'Wahoo!', key: 'home', icon: '🌐' },
    { label: 'JeeMail', key: 'jeemail_login', icon: '✉' },
    { label: 'Daily Herald', key: 'herald', icon: '📰' },
    { label: 'Market Pulse', key: 'market_pulse', icon: '📊' },
    { label: 'RapidMart', key: 'wn_shop', sub: 'rapidmart/home', icon: '📦' },
    { label: 'Stock Market', key: 'stocks', icon: '📈' },
    { label: 'FRA', key: 'fra', icon: '⚖' },
    { label: 'Jobs', key: 'hiring', icon: '💼' },
    { label: 'Review Bomber', key: 'reviewbomber', icon: '⚙' },
    { label: 'Classifieds', key: 'warehouse', icon: '📢' },
  ];

  const linkHtml = quickLinks
    .map((l) => {
      const sub = l.sub != null ? ` data-bcb-sub="${escapeHtml(l.sub)}"` : '';
      return `<div class="bcb-quick-link" data-bcb-key="${escapeHtml(l.key)}"${sub}>
      <span class="bcb-ql-icon">${l.icon}</span>
      <span class="bcb-ql-label">${escapeHtml(l.label)}</span>
    </div>`;
    })
    .join('');

  const bookmarks = getBcBookmarks();
  const bmarkHtml = bookmarks.length
    ? `<div class="bcb-section-title">★ Bookmarks</div>
       ${bookmarks
         .map(
           (b) =>
             `<div class="bcb-bmark-row" data-bcb-key="${escapeHtml(b.key)}" data-bcb-sub="${escapeHtml(b.sub || '')}">
         <span class="bcb-bmark-title">${escapeHtml(b.title || b.url || b.key)}</span>
         <button type="button" class="bcb-bmark-rm" data-bcb-rm-key="${escapeHtml(b.key)}">✕</button>
       </div>`
         )
         .join('')}`
    : '';

  return `
<div class="bcb-home-inner">
  <div class="bcb-home-header">
    <div class="bcb-home-logo">🌐</div>
    <div class="bcb-home-tagline">Black Cherry Browser</div>
    <div class="bcb-home-sub">Dial-up optimized · CorpOS Net</div>
  </div>
  <div class="bcb-section-title">Quick Links</div>
  <div class="bcb-quick-links">${linkHtml}</div>
  ${bmarkHtml}
  <div class="bcb-mobile-notice">
    ⚠ Some features are limited on mobile.<br>
    Video, downloads, and desktop tools require CorpOS desktop.
  </div>
</div>`;
}

export function bcbNavigateTo(key, sub = '') {
  if (_loading) return;

  const p = getState().player;
  if (
    CORPOS_GATED_PAGE_KEYS.has(key) &&
    (!p?.corposEnrollmentComplete || p?.licenseTerminated)
  ) {
    const content = document.getElementById('bcb-content');
    if (content) {
      content.innerHTML = `<div class="bcb-page-wrap"><div class="bcb-page-content" id="bcb-page-inner">${renderGateInterstitial()}</div></div>`;
      _currentPageKey = key;
      _currentSub = sub || '';
      updateAddressBar(key, sub);
      setStatus('Restricted');
    }
    return;
  }

  const blockType = getBlockType(key, sub);
  if (blockType) {
    renderBlockPage(blockType, key);
    return;
  }

  showLoadingBar(key);

  setTimeout(() => {
    hideLoadingBar();
    renderCurrentPage(key, sub);
    pushToHistory(key, sub);
    updateAddressBar(key, sub);
    updateNavButtons();
  }, LOAD_DELAY_MS);
}

function navigateTo(key, sub = '') {
  bcbNavigateTo(key, sub);
}

function renderBlockPage(blockType, attemptedKey) {
  const content = document.getElementById('bcb-content');
  if (!content) return;
  const msg = BLOCK_MESSAGES[blockType] || BLOCK_MESSAGES.openwindow;

  content.innerHTML = `
<div class="bcb-block-page">
  <div class="bcb-block-icon">${msg.icon}</div>
  <div class="bcb-block-title">${escapeHtml(msg.title)}</div>
  <div class="bcb-block-body">${escapeHtml(msg.body)}</div>
  <div class="bcb-block-url">${escapeHtml(urlForKey(attemptedKey, ''))}</div>
  <button type="button" class="bcb-block-home" data-bcb-home>← Home</button>
</div>`;

  content.querySelector('[data-bcb-home]')?.addEventListener('click', () => {
    showHome();
  });

  setStatus('Cannot display page');
  updateAddressBar(attemptedKey, '');
}

function renderCurrentPage(key, sub) {
  const content = document.getElementById('bcb-content');
  if (!content) return;

  _currentPageKey = key;
  _currentSub = sub || '';

  let rawHtml = callRenderPage(key, sub);
  rawHtml = applyMobileTransforms(rawHtml);

  const isGovReadOnly = GOV_READONLY_KEYS.has(key);

  content.innerHTML = `
<div class="bcb-page-wrap ${isGovReadOnly ? 'bcb-gov-readonly' : ''}">
  ${
    isGovReadOnly
      ? `<div class="bcb-gov-banner">
    ⚖ Read only — Government filings require desktop verification
  </div>`
      : ''
  }
  <div class="bcb-page-content" id="bcb-page-inner" style="max-width:240px;margin:0 auto;">
    ${rawHtml}
  </div>
</div>`;

  const inner = content.querySelector('#bcb-page-inner');
  if (inner) {
    if (isGovReadOnly) {
      inner.querySelectorAll('input[type="submit"], button[type="submit"], button[data-action]').forEach((el) => {
        el.setAttribute('disabled', 'true');
        el.style.opacity = '0.4';
        el.title = 'Requires desktop verification';
      });
    }
    void Promise.all([import('./worldnet-shop.js'), import('./worldnet-ads.js')]).then(
      ([{ bindShopRoot }, { mountPage }]) => {
        bindShopRoot(inner, (k, s) => {
          bcbNavigateTo(k, s || '');
        });
        mountPage(inner, key);
      }
    );
    if (key === 'herald') {
      const wm = inner.querySelector('#dh-wnet-root');
      if (wm) initDailyHerald({ mount: wm });
    }
  }

  setStatus(`${urlForKey(key, sub)} — Done`);
}

function showLoadingBar(key) {
  _loading = true;
  const wrap = document.getElementById('bcb-loading-wrap');
  const bar = document.getElementById('bcb-loading-bar');
  const lbl = document.getElementById('bcb-loading-label');
  if (!wrap || !bar) return;
  wrap.style.display = 'block';
  bar.style.width = '0%';
  if (lbl) lbl.textContent = `Connecting to ${urlForKey(key)}...`;
  setStatus(`Loading ${urlForKey(key)}...`);

  let pct = 0;
  const step = () => {
    if (!_loading) return;
    pct = Math.min(90, pct + (Math.random() * 15 + 5));
    bar.style.width = `${pct}%`;
    if (pct < 90) setTimeout(step, LOAD_DELAY_MS / 8);
  };
  setTimeout(step, 80);
}

function hideLoadingBar() {
  _loading = false;
  const wrap = document.getElementById('bcb-loading-wrap');
  const bar = document.getElementById('bcb-loading-bar');
  if (!wrap || !bar) return;
  bar.style.width = '100%';
  setTimeout(() => {
    wrap.style.display = 'none';
    bar.style.width = '0%';
  }, 200);
}

function pushToHistory(key, sub) {
  _history = _history.slice(0, _histIdx + 1);
  _history.push({ key, sub, url: urlForKey(key, sub) });
  if (_history.length > BC_MAX_HISTORY) _history.shift();
  _histIdx = _history.length - 1;
}

function bcbBack() {
  if (_histIdx <= 0) return;
  _histIdx--;
  const e = _history[_histIdx];
  showLoadingBar(e.key);
  setTimeout(() => {
    hideLoadingBar();
    renderCurrentPage(e.key, e.sub);
    updateAddressBar(e.key, e.sub);
    updateNavButtons();
  }, LOAD_DELAY_MS);
}

function bcbForward() {
  if (_histIdx >= _history.length - 1) return;
  _histIdx++;
  const e = _history[_histIdx];
  showLoadingBar(e.key);
  setTimeout(() => {
    hideLoadingBar();
    renderCurrentPage(e.key, e.sub);
    updateAddressBar(e.key, e.sub);
    updateNavButtons();
  }, LOAD_DELAY_MS);
}

function updateNavButtons() {
  const back = document.getElementById('bcb-back');
  const fwd = document.getElementById('bcb-fwd');
  if (back) back.disabled = _histIdx <= 0;
  if (fwd) fwd.disabled = _histIdx >= _history.length - 1;
}

function getBcBookmarks() {
  try {
    return JSON.parse(localStorage.getItem('bc_bookmarks') || '[]');
  } catch {
    return [];
  }
}

function saveBcBookmarks(bmarks) {
  try {
    localStorage.setItem('bc_bookmarks', JSON.stringify(bmarks));
  } catch {
    /* ignore */
  }
}

function getTitleForKey(key, sub) {
  if (key === 'pipeline_page' && sub) {
    const page = getState().contentRegistry?.pages?.find((p) => p.pageId === sub);
    if (page?.title || page?.siteName) return page.title || page.siteName;
  }
  return titleForWorldNetPage(key) || key;
}

function addBookmark(key, sub) {
  const bmarks = getBcBookmarks();
  if (bmarks.some((b) => b.key === key && (b.sub || '') === (sub || ''))) {
    showBcToast('Already bookmarked.');
    return;
  }
  if (bmarks.length >= BC_MAX_BOOKMARKS) {
    showBcToast(`Bookmark limit reached (${BC_MAX_BOOKMARKS}).`);
    return;
  }
  bmarks.push({
    key,
    sub: sub || '',
    url: urlForKey(key, sub),
    title: getTitleForKey(key, sub),
  });
  saveBcBookmarks(bmarks);
  showBcToast('★ Bookmarked.');
}

function removeBookmark(key) {
  const bmarks = getBcBookmarks().filter((b) => b.key !== key);
  saveBcBookmarks(bmarks);
}

function updateAddressBar(key, sub) {
  const addr = document.getElementById('bcb-addr');
  if (addr) addr.value = urlForKey(key, sub);
}

function resolveInput(raw) {
  const v = String(raw || '').trim();
  if (!v) return { key: 'moogle_home', sub: '' };
  try {
    const loc = resolveLocationFromAddress(v);
    if (loc?.pageKey) return { key: loc.pageKey, sub: loc.subPath || '' };
  } catch {
    /* ignore */
  }
  return { key: 'wahoo_results', sub: encodeURIComponent(v) };
}

function showHome() {
  const content = document.getElementById('bcb-content');
  if (content) {
    content.innerHTML = `<div class="bcb-home" id="bcb-home-screen">${renderMobileHome()}</div>`;
  }
  updateAddressBar('moogle_home', '');
  setStatus('Black Cherry Browser 1.0');
}

function setStatus(msg) {
  const el = document.getElementById('bcb-status-text');
  if (el) el.textContent = String(msg).slice(0, 80);
}

function showBcToast(msg) {
  const status = document.getElementById('bcb-status-text');
  if (!status) return;
  const prev = status.textContent;
  status.textContent = msg;
  setTimeout(() => {
    status.textContent = prev;
  }, 2500);
}

if (typeof window !== 'undefined') {
  window.bcbDesktopOnlyNotice = function (e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    toast({
      title: 'Black Cherry',
      message: 'This action requires a desktop connection.',
    });
  };
}

function bindBrowserChromeEvents() {
  document.getElementById('bcb-back')?.addEventListener('click', bcbBack);
  document.getElementById('bcb-fwd')?.addEventListener('click', bcbForward);

  document.getElementById('bcb-go')?.addEventListener('click', () => {
    const val = document.getElementById('bcb-addr')?.value?.trim();
    if (val) {
      const r = resolveInput(val);
      bcbNavigateTo(r.key, r.sub);
    }
  });

  document.getElementById('bcb-addr')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = /** @type {HTMLInputElement} */ (e.target).value.trim();
      if (val) {
        const r = resolveInput(val);
        bcbNavigateTo(r.key, r.sub);
      }
    }
  });

  document.getElementById('bcb-bmark')?.addEventListener('click', () => {
    const cur = _history[_histIdx];
    if (cur) addBookmark(cur.key, cur.sub);
  });
}

function bindRootDelegation() {
  if (!_rootEl) return;
  _rootEl.addEventListener(
    'submit',
    (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (!form.closest('#bcb-page-inner')) return;
      if (form.hasAttribute('data-wn-shop-checkout')) {
        e.preventDefault();
        toast({
          title: 'Checkout',
          message: BLOCK_MESSAGES.checkout.body.split('\n')[0],
        });
      }
    },
    true
  );

  _rootEl.addEventListener('click', onRootClick, true);
}

function onRootClick(e) {
  const t = /** @type {HTMLElement} */ (e.target);
  if (t.closest('#bcb-back, #bcb-fwd, #bcb-go, #bcb-bmark, #bcb-addr')) return;

  const homeBtn = t.closest('[data-bcb-home]');
  if (homeBtn) {
    e.preventDefault();
    showHome();
    return;
  }

  const rmBtn = t.closest('[data-bcb-rm-key]');
  if (rmBtn && _rootEl?.contains(rmBtn)) {
    e.preventDefault();
    removeBookmark(rmBtn.getAttribute('data-bcb-rm-key') || '');
    showHome();
    return;
  }

  const ql = t.closest('.bcb-quick-link[data-bcb-key]');
  if (ql && _rootEl?.contains(ql)) {
    e.preventDefault();
    bcbNavigateTo(
      ql.getAttribute('data-bcb-key') || 'moogle_home',
      ql.getAttribute('data-bcb-sub') || ''
    );
    return;
  }

  const bmarkRow = t.closest('.bcb-bmark-row[data-bcb-key]');
  if (bmarkRow && !t.closest('.bcb-bmark-rm') && _rootEl?.contains(bmarkRow)) {
    e.preventDefault();
    bcbNavigateTo(
      bmarkRow.getAttribute('data-bcb-key') || 'moogle_home',
      bmarkRow.getAttribute('data-bcb-sub') || ''
    );
    return;
  }

  const inner = document.getElementById('bcb-page-inner');
  if (!inner || !inner.contains(t)) return;

  if (GOV_READONLY_KEYS.has(_currentPageKey)) {
    const govBtn = t.closest('button[data-action], input[type="submit"], button[type="submit"]');
    if (govBtn && inner.contains(govBtn)) {
      e.preventDefault();
      e.stopPropagation();
      renderInlineMessage(
        govBtn,
        'Government filings require desktop verification.',
        'warn'
      );
      return;
    }
  }

  if (t.closest('[onclick*="openW"]')) {
    e.preventDefault();
    e.stopPropagation();
    toast({
      title: 'Black Cherry',
      message: 'This action requires a desktop connection.',
    });
    return;
  }

  const bcbLink = t.closest('[data-bcb-key]');
  if (bcbLink && inner.contains(bcbLink) && bcbLink.hasAttribute('data-bcb-key')) {
    const k = bcbLink.getAttribute('data-bcb-key');
    if (k && !bcbLink.classList.contains('bcb-quick-link')) {
      e.preventDefault();
      e.stopPropagation();
      bcbNavigateTo(k, bcbLink.getAttribute('data-bcb-sub') || '');
      return;
    }
  }

  const navLink = t.closest('a[data-nav], a[href][data-wnet-nav]');
  if (navLink && inner.contains(navLink)) {
    const wn = navLink.getAttribute('data-wnet-nav');
    if (wn) {
      e.preventDefault();
      e.stopPropagation();
      const loc = resolveLocationFromAddress(wn);
      bcbNavigateTo(loc.pageKey, loc.subPath || '');
      return;
    }
    const nav = navLink.getAttribute('data-nav');
    if (nav === 'lucky') {
      e.preventDefault();
      return;
    }
    if (nav) {
      e.preventDefault();
      e.stopPropagation();
      bcbNavigateTo(nav, navLink.getAttribute('data-wnet-subpath') || '');
    }
  }
}

export { bcbNavigateTo as navigate };
