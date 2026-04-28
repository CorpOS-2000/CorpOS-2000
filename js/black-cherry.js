/**
 * Black Cherry™ — in-world smartphone UI with hardware keys, icon grid, calling,
 * conversations, CashUp, threaded SMS, and contacts.
 */
import { getSessionState, patchSession } from './sessionState.js';
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { on } from './events.js';
import { toast } from './toast.js';
import { PeekManager } from './peek-manager.js';
import { SMS, GOVERNMENT_SENDERS } from './bc-sms.js';
import {
  getNotifications,
  markRead,
  markAllRead,
  clearAll,
  getUnreadCount,
} from './bc-notifications.js';
import { startConversation, selectConversationOption, endConversation, getConversationState } from './bc-conversation.js';
import { initBcBrowser, bcbNavigateTo } from './bc-browser.js';

const PEEK_PX = 56;
const CORNER_HOTSPOT_W = 220;
const CORNER_HOTSPOT_H = 64;
const CORNER_HOTSPOT_Y_TRIM = 12;
const BC_DOCK_SPEED_GAP_PX = 1;
const PEEK_SMS_HIDE_MS = 4000;
const PEEK_CORNER_LEAVE_HIDE_MS = 2000;

/** @type {'hidden' | 'peek' | 'open'} */
let viewState = 'hidden';
let peekHideTimer = null;
let peekTrigger = /** @type {'none' | 'sms' | 'corner'} */ ('none');
let cornerHoverLatched = false;
let cornerSuppressUntilLeave = false;
let lastCornerPointerCheck = 0;

let currentView = 'home';
let viewHistory = [];
let gridRow = 0;
let gridCol = 0;
let convoOptIndex = 0;
let callTimer = null;
let convoTimerInterval = null;
let convoSeconds = 0;
let currentCallActorId = null;
let activeThreadSenderId = null;
let _dialBuffer = '';
let _outgoingCallTimer = null;
let _transcriptCompleteCallback = null;
/** Bumped when a transcript session ends or a new one starts; async steps must bail if mismatched. */
let _transcriptSessionId = 0;
let _transcriptTypingInterval = null;
let _transcriptLineTimeout = null;
let transcriptTimerInterval = null;
let transcriptSeconds = 0;

/** When true, new transcript content scrolls the panel to keep the latest line in view. */
let _transcriptFollowBottom = true;
/** Batched rAF for typewriter ticks so we do not queue many scroll animations. */
let _transcriptScrollRaf = null;
/** Debounce reading scroll position after programmatic smooth scroll settles. */
let _transcriptScrollSettleTimer = null;

/** Pixels from the bottom to still count as "at bottom" (resume auto-follow). */
const TRANSCRIPT_BOTTOM_SLACK_PX = 6;

function isTranscriptAtBottom(el) {
  if (!el) return true;
  const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
  return gap <= TRANSCRIPT_BOTTOM_SLACK_PX;
}

function onTranscriptBodyScroll() {
  if (currentView !== 'transcript') return;
  if (_transcriptScrollSettleTimer) clearTimeout(_transcriptScrollSettleTimer);
  _transcriptScrollSettleTimer = setTimeout(() => {
    _transcriptScrollSettleTimer = null;
    if (currentView !== 'transcript') return;
    const el = $('bc-transcript-body');
    if (!el) return;
    _transcriptFollowBottom = isTranscriptAtBottom(el);
  }, 120);
}

function bindTranscriptScrollFollow() {
  const el = $('bc-transcript-body');
  if (!el || el.dataset.bcTranscriptScrollBound === '1') return;
  el.dataset.bcTranscriptScrollBound = '1';
  el.addEventListener('scroll', onTranscriptBodyScroll, { passive: true });
}

function cancelTranscriptScrollRaf() {
  if (_transcriptScrollRaf != null) {
    cancelAnimationFrame(_transcriptScrollRaf);
    _transcriptScrollRaf = null;
  }
}

/**
 * @param {'smooth' | 'instant'} mode smooth for new bubbles; instant (or rAF) while typing
 */
function scrollTranscriptToBottomIfFollowing(container, mode) {
  if (!container || !_transcriptFollowBottom) return;
  const top = container.scrollHeight;
  if (mode === 'smooth' && typeof container.scrollTo === 'function') {
    try {
      container.scrollTo({ top, behavior: 'smooth' });
    } catch {
      container.scrollTop = top;
    }
  } else {
    container.scrollTop = top;
  }
}

/** Coalesce per-frame scrolls during typewriter effect. */
function scheduleTranscriptScrollToBottomIfFollowing() {
  if (!_transcriptFollowBottom) return;
  if (_transcriptScrollRaf != null) return;
  _transcriptScrollRaf = requestAnimationFrame(() => {
    _transcriptScrollRaf = null;
    if (!_transcriptFollowBottom) return;
    const c = $('bc-transcript-body');
    if (c && currentView === 'transcript') c.scrollTop = c.scrollHeight;
  });
}

function abortTranscriptAsyncWork() {
  _transcriptSessionId++;
  if (transcriptTimerInterval) {
    clearInterval(transcriptTimerInterval);
    transcriptTimerInterval = null;
  }
  if (_transcriptTypingInterval) {
    clearInterval(_transcriptTypingInterval);
    _transcriptTypingInterval = null;
  }
  if (_transcriptLineTimeout) {
    clearTimeout(_transcriptLineTimeout);
    _transcriptLineTimeout = null;
  }
  cancelTranscriptScrollRaf();
  if (_transcriptScrollSettleTimer) {
    clearTimeout(_transcriptScrollSettleTimer);
    _transcriptScrollSettleTimer = null;
  }
}
/** When true and phone is open, dock sits top-right and handset is scaled up (“bring to face”). */
let nearFaceActive = false;

const GRID_COLS = 3;
const GRID_ITEMS = [
  { id: 'sms',      label: 'SMS',         icon: '✉',  view: 'messaging' },
  { id: 'contacts', label: 'Contacts',    icon: '👤', view: 'contacts' },
  { id: 'cashup',   label: 'CashUp',      icon: '💰', view: 'cashup' },
  { id: 'calllog',  label: 'Call Log',    icon: '📞', view: 'dial' },
  { id: 'notifications', label: 'Notifications', icon: '🔔', view: 'notifications' },
  { id: 'settings', label: 'Settings',    icon: '⚙',  view: 'settings' },
  { id: 'browser',  label: 'Browser',     icon: '🌐', view: 'browser' },
  { id: 'calendar', label: 'Calendar',    icon: '📅', view: 'calendar' },
  { id: 'mail',     label: 'Mail',        icon: '📬', action: 'open-mail' },
];

function $(id) { return document.getElementById(id); }
function dockRoot() { return $('black-cherry-dock'); }
function deviceEl() { return $('black-cherry-device'); }

export function syncBlackCherryDockToSpeedControls() {
  const dock = dockRoot();
  if (dock?.classList.contains('bc-dock--near')) return;
  const btn4 = document.querySelector('#speed-controls [data-speed="8"]') || document.querySelector('#speed-controls [data-speed="4"]');
  if (!dock || !btn4) return;
  const br = btn4.getBoundingClientRect();
  if (br.width === 0 && br.height === 0) return;
  const dockW = dock.getBoundingClientRect().width;
  if (dockW <= 0) return;
  const vw = window.innerWidth;
  const targetLeft = br.right + BC_DOCK_SPEED_GAP_PX;
  const rightPx = vw - targetLeft - dockW;
  dock.style.right = `${Math.max(0, rightPx)}px`;
}

function syncDockAttrs() { const d = dockRoot(); if (d) d.dataset.bcDock = viewState; }
function syncNearFaceDock() {
  const dock = dockRoot();
  const nearBtn = $('bc-key-near');
  const on = !!(nearFaceActive && viewState === 'open');
  if (dock) {
    dock.classList.toggle('bc-dock--near', on);
    if (on) dock.style.removeProperty('right');
  }
  if (nearBtn) nearBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  syncBlackCherryDockToSpeedControls();
}

function syncTransform() {
  const d = deviceEl();
  if (d) d.dataset.bcState = viewState;
  syncDockAttrs();
  syncNearFaceDock();
}

function toggleNearFace() {
  if (viewState !== 'open') return;
  nearFaceActive = !nearFaceActive;
  syncNearFaceDock();
}
function clearPeekTimer() { if (peekHideTimer) { clearTimeout(peekHideTimer); peekHideTimer = null; } }
function clearPeekText() { const el = $('bc-peek-msg'); if (el) el.textContent = ''; }

function hidePeekToHidden() {
  viewState = 'hidden'; peekTrigger = 'none';
  clearPeekText(); syncTransform();
  dockRoot()?.setAttribute('aria-hidden', 'true');
}

function schedulePeekHide(ms, mode) {
  clearPeekTimer();
  if (viewState !== 'peek') return;
  peekHideTimer = setTimeout(() => {
    peekHideTimer = null;
    if (viewState !== 'peek' || peekTrigger !== mode) return;
    hidePeekToHidden();
  }, ms);
}

function typingOrBrowserFocus() {
  const a = document.activeElement;
  if (!a) return false;
  const tag = a.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (a.isContentEditable) return true;
  if (a.closest('#bc-view-browser')) return true;
  if (a.closest('#wnet-content')) return true;
  return false;
}

function desktopIsVisible() { return $('desktop')?.classList.contains('show') ?? false; }

/** When true, digit row / numpad keys feed the manual dial buffer (not during calls / SMS reply, etc.). */
function dialHardwareInputActive() {
  if (typingOrBrowserFocus()) return false;
  return ['home', 'contacts', 'dial', 'dialpad', 'settings', 'calendar', 'cashup', 'messaging'].includes(currentView);
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' '); }

function updatePhoneLine() {
  const el = $('bc-phone-line');
  if (!el) return;
  try { el.textContent = getState().player?.phone || '—'; } catch { el.textContent = '—'; }
}

function setScreenHeading(text) { const h = $('bc-screen-heading'); if (h) h.textContent = text; }

/* ── View navigation ── */
/** @param {string} view @param {{ preserveDialBuffer?: boolean }} [opts] */
function showView(view, opts = {}) {
  const allViews = [
    'home',
    'messaging',
    'thread',
    'contacts',
    'dialpad',
    'dial',
    'calling',
    'incoming',
    'conversation',
    'transcript',
    'cashup',
    'settings',
    'notifications',
    'browser',
    'calendar',
  ];
  const activeId = `bc-view-${view}`;
  for (const v of allViews) {
    $(`bc-view-${v}`)?.classList.toggle('bc-view--active', `bc-view-${v}` === activeId);
  }
  currentView = view;
  if (view === 'home') { setScreenHeading('Home'); renderIconGrid(); }
  else if (view === 'messaging') { setScreenHeading(''); renderThreadList(); }
  else if (view === 'thread') { setScreenHeading('Thread'); renderThreadDetail(); }
  else if (view === 'contacts') { setScreenHeading('Contacts'); renderContacts(); }
  else if (view === 'dialpad') {
    setScreenHeading('Dial');
    renderDialPadScreen({ resetBuffer: opts.preserveDialBuffer !== true });
  }
  else if (view === 'dial') { setScreenHeading('Contacts & Dial'); renderDialList(); }
  else if (view === 'calling') { setScreenHeading(''); }
  else if (view === 'incoming') { setScreenHeading(''); }
  else if (view === 'conversation') { setScreenHeading(''); }
  else if (view === 'transcript') { setScreenHeading(''); }
  else if (view === 'cashup') { setScreenHeading('CashUp'); renderCashUp(); }
  else if (view === 'settings') { setScreenHeading('Settings'); }
  else if (view === 'notifications') {
    setScreenHeading('Notifications');
    markAllRead();
    renderNotificationList();
    updateBellBadge();
  }
  else if (view === 'browser') {
    setScreenHeading('Browser');
    const bcbRoot = $('bc-view-browser');
    if (bcbRoot && !bcbRoot.dataset.init) {
      bcbRoot.dataset.init = '1';
      initBcBrowser(bcbRoot);
    }
  }
  else if (view === 'calendar') { setScreenHeading('Calendar'); }
  syncBcKeyboardDialpadMode();
  updateDialHud();
}

function syncBcKeyboardDialpadMode() {
  const numpad = $('bc-keyboard-numpad');
  if (!numpad) return;
  const show = viewState === 'open';
  numpad.hidden = !show;
  if (show) renderDialHardwareKeys();
}

/** Keycap rows above QWERTY whenever the handset is open (not only on Dial screen). */
function renderDialHardwareKeys() {
  const hw = $('bc-keyboard-numpad');
  if (!hw) return;
  if (hw.querySelector('.bc-kb-row--dialaux')) return;
  hw.innerHTML = buildDialPadKeyRowsHtml();
}

/** @param {string} view @param {{ preserveDialBuffer?: boolean }} [opts] */
function pushView(view, opts = {}) {
  if (currentView !== view) viewHistory.push(currentView);
  showView(view, opts);
}

function popView() {
  const prev = viewHistory.pop() || 'home';
  showView(prev);
}

function goHome() { viewHistory = []; showView('home'); }

export function resetBlackCherryView() { goHome(); }

/* ── Icon grid ── */
function renderIconGrid() {
  const grid = $('bc-icon-grid');
  if (!grid) return;
  const unread = SMS.getUnreadCount();
  const notifUnread = getUnreadCount();
  const cash = getState().player?.hardCash || 0;
  grid.innerHTML = GRID_ITEMS.map((item, i) => {
    const r = Math.floor(i / GRID_COLS);
    const c = i % GRID_COLS;
    const sel = (r === gridRow && c === gridCol) ? ' bc-grid-cell--sel' : '';
    let badge = '';
    if (item.id === 'sms' && unread > 0) badge = `<span class="bc-unread-badge">${unread}</span>`;
    if (item.id === 'notifications' && notifUnread > 0) {
      badge = `<span class="bc-notif-badge">${notifUnread > 99 ? '99+' : notifUnread}</span>`;
    }
    let sub = '';
    if (item.id === 'cashup' && cash > 0) sub = `<span class="bc-grid-sub">$${cash.toLocaleString()}</span>`;
    return `<div class="bc-grid-cell${sel}" data-grid-r="${r}" data-grid-c="${c}" data-grid-idx="${i}">
      <div class="bc-grid-icon">${item.icon}${badge}</div>
      <span class="bc-grid-label">${item.label}</span>${sub}
    </div>`;
  }).join('');
}

function activateGridItem() {
  const idx = gridRow * GRID_COLS + gridCol;
  const item = GRID_ITEMS[idx];
  if (!item) return;
  if (item.action === 'open-mail') {
    closeBlackCherryDock();
    window.WorldNet?.navigateTo?.('jeemail');
    return;
  }
  if (item.view) pushView(item.view);
}

/* ── SMS thread list ── */
function renderThreadList() {
  const box = $('bc-messages');
  if (!box) return;
  const inbox = SMS.getInbox();
  if (!inbox.length) {
    box.innerHTML = '<div class="bc-msg--empty">No messages.</div>';
    return;
  }
  box.innerHTML = inbox.map(t => {
    const isOfficial = t.official;
    const isGov = SMS.isGovernmentSender?.(t.senderId) || false;
    const displayName = SMS.getDisplayName?.(t.senderId) || t.senderName || t.senderId;
    const badge = isOfficial ? '<span class="bc-official-badge">⛨</span>' : '';
    const avatarBg = t.avatarColor || (isOfficial ? '#0a246a' : '#5a8a5a');
    const initials = esc(t.avatarLabel || (displayName || '?')[0]);
    const unread = t.unreadCount > 0 ? `<span class="bc-thread-unread">${t.unreadCount}</span>` : '';
    const snippet = esc((t.lastMessage || '').slice(0, 40));
    const time = t.lastTime ? formatSimTime(t.lastTime) : '';
    const rowGov = isGov ? ' bc-thread-row--gov' : '';
    return `<div class="bc-thread-row${rowGov}" data-thread-id="${esc(t.senderId)}">
      <div class="bc-thread-avatar" style="background:${avatarBg}">${initials}</div>
      <div class="bc-thread-info">
        <div class="bc-thread-name">${badge}${esc(displayName)}</div>
        <div class="bc-thread-snippet">${snippet}</div>
      </div>
      <div class="bc-thread-meta">
        <div class="bc-thread-time">${time}</div>
        ${unread}
      </div>
    </div>`;
  }).join('');
}

function formatSimTime(simMs) {
  try {
    const h = Math.floor((simMs / 3600000) % 24);
    const m = Math.floor((simMs / 60000) % 60);
    const h12 = h % 12 || 12;
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  } catch { return ''; }
}

function updateBellBadge() {
  const unread = getUnreadCount();
  const badge = document.querySelector('.bc-notif-badge');
  if (badge) {
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread > 0 ? '' : 'none';
  }
  if (currentView !== 'notifications') {
    renderIconGrid();
  }
}

function renderNotificationList() {
  const list = document.getElementById('bc-notif-list');
  if (!list) return;

  const items = getNotifications();

  if (!items.length) {
    list.innerHTML = `
<div class="bc-notif-empty">
  <div class="bc-notif-empty-icon">🔔</div>
  <div class="bc-notif-empty-text">No notifications</div>
</div>`;
    return;
  }

  list.innerHTML = items
    .map((n) => {
      const timeLabel = formatSimTime(n.simMs);
      const unreadDot = !n.read ? '<span class="bc-notif-unread-dot"></span>' : '';
      const notLinkedNote = !n.linked
        ? '<div class="bc-notif-not-linked">not linked to any action</div>'
        : '';
      const tappable = n.action ? 'bc-notif-item--tappable' : '';
      const at = esc(n.action?.type || '');
      const ap = esc(n.action?.payload ?? '');
      return `
<div class="bc-notif-item ${!n.read ? 'bc-notif-item--unread' : ''} ${tappable}"
     data-notif-id="${esc(n.id)}"
     data-action-type="${at}"
     data-action-payload="${ap}">
  <div class="bc-notif-icon-wrap">
    <span class="bc-notif-type-icon">${n.icon}</span>
    ${unreadDot}
  </div>
  <div class="bc-notif-content">
    <div class="bc-notif-row-top">
      <span class="bc-notif-item-title">${esc(n.title)}</span>
      <span class="bc-notif-time">${esc(timeLabel)}</span>
    </div>
    <div class="bc-notif-body">${esc(n.body)}</div>
    ${notLinkedNote}
  </div>
  ${n.action ? '<div class="bc-notif-arrow">›</div>' : ''}
</div>`;
    })
    .join('');
}

/* ── SMS thread detail ── */
function renderThreadDetail() {
  if (!activeThreadSenderId) return;
  const thread = SMS.getThread(activeThreadSenderId);
  if (!thread) return;
  SMS.markRead(activeThreadSenderId);

  const header = $('bc-thread-header');
  if (header) {
    const isOfficial = thread.official;
    const badge = isOfficial ? '<span class="bc-official-badge">⛨</span>' : '';
    const displayName = SMS.getDisplayName?.(activeThreadSenderId) || thread.senderName || thread.senderId;
    header.innerHTML = `${badge}${esc(displayName)}`;
  }

  const msgBox = $('bc-thread-messages');
  if (!msgBox) return;
  let html = '';
  if (thread.official) {
    html += `<div class="bc-thread-official-banner">Official Government Communication — Federal Mandate 2000-CR7</div>`;
  }
  html += (thread.messages || []).map(m => {
    const cls = m.direction === 'out' ? 'bc-sms-bubble--out' : 'bc-sms-bubble--in';
    const time = m.simMs ? formatSimTime(m.simMs) : '';
    return `<div class="bc-sms-bubble ${cls}">${esc(m.text)}<div class="bc-sms-bubble-time">${time}</div></div>`;
  }).join('');
  msgBox.innerHTML = html;
  msgBox.scrollTop = msgBox.scrollHeight;
}

function openThread(senderId) {
  activeThreadSenderId = senderId;
  pushView('thread');
}

/* ── Contacts ── */

const CONTACT_AVATAR_COLORS = {
  Self: '#0a246a',
  Mother: '#006600', Family: '#006600',
  Friend: '#555555', 'Former Coworker': '#555555', 'Old Classmate': '#555555', Neighbor: '#555555',
  Contact: '#330066', 'Business Contact': '#330066', 'Online Contact': '#330066',
  Investigator: '#cc6600', 'Intel Source': '#cc6600',
  'Public Figure': '#003366', Introduction: '#555555',
};

function contactAvatarColor(relation) {
  return CONTACT_AVATAR_COLORS[relation] || '#888888';
}

function contactInitials(name) {
  const parts = String(name || '?').split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0] || '?')[0].toUpperCase();
}

let _contactSearchQuery = '';

function renderContacts() {
  const box = $('bc-contacts');
  if (!box) return;
  const contacts = getPlayerContacts();
  const toolbar = `<div class="bc-contact-toolbar">
    <div class="bc-contact-search-wrap"><input class="bc-contact-search" type="text" placeholder="Search contacts..." value="${esc(_contactSearchQuery)}" /></div>
  </div>`;
  if (!contacts.length) {
    box.innerHTML = `${toolbar}<div class="bc-msg--empty">No contacts.</div>`;
    const searchInput = box.querySelector('.bc-contact-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        _contactSearchQuery = e.target.value || '';
        renderContacts();
      });
    }
    return;
  }

  const q = _contactSearchQuery.toLowerCase().trim();
  const pinned = contacts.filter((c) => c.isPlayer || c.relationToPlayer === 'Mother');
  const rest = contacts.filter((c) => !c.isPlayer && c.relationToPlayer !== 'Mother');
  const filtered = q
    ? rest.filter((c) =>
        [c.displayName, c.officialName, c.jobTitle].some((f) => String(f || '').toLowerCase().includes(q))
      )
    : rest;
  const ordered = [...pinned, ...filtered];

  let html = toolbar;
  html += ordered.map((c) => {
    const bgColor = contactAvatarColor(c.relationToPlayer || 'Contact');
    const initials = contactInitials(c.displayName);
    const metaLine = c.isPlayer
      ? 'Self'
      : [c.relationToPlayer, c.jobTitle, c.company].filter(Boolean).join(' \u00B7 ');

    return `<div class="bc-contact-row bc-contact-row--rich" data-bc-actor-id="${esc(c.actorId)}" data-bc-phone="${esc(c.phone)}">
      <div class="bc-contact-avatar" style="background:${bgColor};">${initials}</div>
      <div class="bc-contact-body">
        <div class="bc-contact-display">${esc(c.displayName)}</div>
        <div class="bc-contact-official">${esc(c.officialName || '')}</div>
        <div class="bc-contact-meta">${esc(metaLine)}</div>
      </div>
    </div>`;
  }).join('');

  box.innerHTML = html;

  const searchInput = box.querySelector('.bc-contact-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      _contactSearchQuery = e.target.value || '';
      renderContacts();
    });
  }
}

function getPlayerContacts() {
  const contacts = [];
  const state = getState();
  const bcContacts = state.player?.blackCherryContacts || [];
  for (const c of bcContacts) {
    contacts.push({
      actorId: c.actorId,
      displayName: c.displayName || c.actorId,
      officialName: c.officialName || '',
      relationToPlayer: c.relationToPlayer || 'Contact',
      jobTitle: c.jobTitle || '',
      company: c.company || null,
      phone: c.phone || '—',
      isPlayer: !!c.isPlayer,
      sortOrder: c.sortOrder ?? 999,
    });
  }
  if (!contacts.length && window.ActorDB?.query) {
    const rows = window.ActorDB.query('email', { limit: 20 });
    for (const a of rows) {
      contacts.push({
        actorId: a.actor_id || '',
        displayName: a.public_profile?.display_name || a.full_legal_name || 'Unknown',
        officialName: a.full_legal_name || '',
        relationToPlayer: 'Contact',
        jobTitle: a.profession || '',
        company: null,
        phone: a.phone_numbers?.[0] || '—',
        isPlayer: false,
        sortOrder: 999,
      });
    }
  }
  contacts.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
  return contacts;
}

/* ── Dial / Call ── */
function renderDialList() {
  const list = $('bc-dial-list');
  if (!list) return;
  const contacts = getPlayerContacts();
  const recentCalls = getSessionState().blackCherry?.recentCalls || [];
  let html = '<div style="font-size:8px;color:#2a5a2a;font-weight:bold;padding:2px 0;">Saved Contacts:</div>';
  for (const c of contacts) {
    if (c.isPlayer) continue;
    const init = contactInitials(c.displayName || c.name || '?');
    html += `<div class="bc-dial-row" data-call-actor="${esc(c.actorId)}">
      <div class="bc-dial-avatar">${init}</div>
      <div class="bc-dial-info"><div class="bc-dial-name">${esc(c.displayName || c.name)}</div><div class="bc-dial-num">${esc(c.phone)}</div></div>
    </div>`;
  }
  if (recentCalls.length) {
    html += '<div style="font-size:8px;color:#2a5a2a;font-weight:bold;padding:4px 0 2px;">Recent:</div>';
    for (const rc of recentCalls.slice(0, 5)) {
      html += `<div class="bc-dial-row" data-call-actor="${esc(rc.actorId || '')}">
        <div class="bc-dial-avatar">?</div>
        <div class="bc-dial-info"><div class="bc-dial-name">${esc(rc.name || rc.phone)}</div><div class="bc-dial-num">${esc(rc.phone)}</div></div>
      </div>`;
    }
  }
  list.innerHTML = html;
}

/* ── Manual dial pad (secret dev number) ── */
function formatPhoneInput(digits) {
  const d = String(digits || '').replace(/\D/g, '').slice(0, 10);
  if (!d.length) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`;
}

/** Dial rows above QWERTY — * # ⌫ CLR on top, then 1–0; hardware 📞 places the call. */
function buildDialPadKeyRowsHtml() {
  const nums = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const numRow = nums.map((k) => `<button type="button" class="bc-kb-key" data-dial-key="${esc(k)}">${esc(k)}</button>`).join('');
  return `
<div class="bc-kb-row bc-kb-row--dialaux">
  <button type="button" class="bc-kb-key" data-dial-key="*">*</button>
  <button type="button" class="bc-kb-key" data-dial-key="#">#</button>
  <button type="button" class="bc-kb-key bc-kb-key--aux" id="bc-dial-backspace">⌫</button>
  <button type="button" class="bc-kb-key bc-kb-key--aux" id="bc-dial-clear">CLR</button>
</div>
<div class="bc-kb-row bc-kb-row--dialnums">${numRow}</div>`;
}

/** @param {{ resetBuffer?: boolean }} [options] resetBuffer default true (fresh dial); false when switching from another screen while typing */
function renderDialPadScreen(options = {}) {
  const resetBuffer = options.resetBuffer !== false;
  const dialpad = $('bc-dialpad');
  if (!dialpad) return;
  if (resetBuffer) _dialBuffer = '';
  dialpad.innerHTML = `
<div class="bc-dialpad-display">
  <div id="bc-dial-number" class="bc-dial-number">_</div>
  <div class="bc-dialpad-hint">Type on the keypad — press 📞 to call</div>
</div>`;
  const hw = $('bc-keyboard-numpad');
  if (hw) {
    hw.innerHTML = '';
    renderDialHardwareKeys();
  }
  const numEl = $('bc-dial-number');
  if (numEl) numEl.textContent = _dialBuffer || '_';
  updateDialHud();
}

function updateDialHud() {
  const hud = $('bc-dial-hud');
  const numEl = $('bc-dial-hud-number');
  if (!hud || !numEl) return;
  if (viewState !== 'open' || currentView === 'dialpad') {
    hud.hidden = true;
    numEl.textContent = '';
    return;
  }
  const digits = _dialBuffer.replace(/\D/g, '');
  if (!digits.length) {
    hud.hidden = true;
    numEl.textContent = '';
    return;
  }
  hud.hidden = false;
  numEl.textContent = formatPhoneInput(digits);
}

function dialKeyPressInternal(key) {
  if (viewState === 'open' && currentView !== 'dialpad') {
    pushView('dialpad', { preserveDialBuffer: true });
  }
  if (_dialBuffer.replace(/\D/g, '').length >= 10 && /^\d$/.test(key)) return;
  const raw = _dialBuffer.replace(/\D/g, '') + (key === '*' || key === '#' ? '' : key);
  const digitsOnly = raw.replace(/\D/g, '').slice(0, 10);
  _dialBuffer = formatPhoneInput(digitsOnly);
  const display = $('bc-dial-number');
  if (display) {
    display.textContent = _dialBuffer || '_';
    display.classList.add('bc-dial-pulse');
    setTimeout(() => display.classList.remove('bc-dial-pulse'), 80);
  }
  updateDialHud();
}

function dialBackspaceInternal() {
  const digits = _dialBuffer.replace(/\D/g, '').slice(0, -1);
  _dialBuffer = formatPhoneInput(digits);
  const display = $('bc-dial-number');
  if (display) display.textContent = _dialBuffer || '_';
  updateDialHud();
}

function dialClearInternal() {
  _dialBuffer = '';
  const display = $('bc-dial-number');
  if (display) display.textContent = '_';
  updateDialHud();
}

function showCallFailedDial(formatted) {
  toast(`Number not in service — ${formatted || 'unknown'}`);
}

function dialCallInternal() {
  const digits = _dialBuffer.replace(/\D/g, '');
  if (digits.length < 10) {
    const display = $('bc-dial-number');
    if (display) {
      display.style.color = '#cc0000';
      setTimeout(() => { display.style.color = ''; }, 600);
    }
    return;
  }
  const formatted = formatPhoneInput(digits);
  dialClearInternal();
  const SECRET_DEV_NUMBER = '3204600561';
  if (digits === SECRET_DEV_NUMBER) {
    window.DevConsole?.triggerCall?.();
    return;
  }
  const actor = window.ActorDB?.getByPhone?.(formatted);
  if (actor?.actor_id) {
    initiateCall(actor.actor_id);
  } else {
    showCallFailedDial(formatted);
  }
}

export function showDialPad() {
  if (viewState !== 'open') openBlackCherryDock();
  pushView('dialpad');
}

/**
 * Outgoing call animation then invoke onConnect (e.g. live transcript).
 */
export function showOutgoingCall({ actorId, displayName, subLabel, onConnect }) {
  if (viewState !== 'open') openBlackCherryDock();
  currentCallActorId = actorId || null;
  const avatarEl = $('bc-call-avatar');
  if (avatarEl) avatarEl.textContent = (displayName || '?')[0].toUpperCase();
  const labelEl = document.querySelector('#bc-view-calling .bc-call-label');
  if (labelEl) labelEl.textContent = 'CALLING…';
  const nameEl = $('bc-call-name');
  if (nameEl) nameEl.textContent = displayName || '—';
  const numEl = $('bc-call-number');
  if (numEl) numEl.textContent = subLabel || '';
  pushView('calling');
  if (_outgoingCallTimer) clearTimeout(_outgoingCallTimer);
  _outgoingCallTimer = setTimeout(() => {
    _outgoingCallTimer = null;
    if (onConnect) onConnect();
  }, 1500);
}

export function onOutgoingCallConnected(actorId) {
  /* Reserved for flows that need explicit connect; transcript UIs replace the calling screen. */
  if (actorId) currentCallActorId = actorId;
}

function typeTextLine(element, text, speed, onDone, sessionId) {
  if (_transcriptTypingInterval) {
    clearInterval(_transcriptTypingInterval);
    _transcriptTypingInterval = null;
  }
  let i = 0;
  _transcriptTypingInterval = setInterval(() => {
    if (sessionId !== _transcriptSessionId) {
      clearInterval(_transcriptTypingInterval);
      _transcriptTypingInterval = null;
      return;
    }
    element.textContent = text.substring(0, i + 1);
    scheduleTranscriptScrollToBottomIfFollowing();
    i++;
    if (i >= text.length) {
      clearInterval(_transcriptTypingInterval);
      _transcriptTypingInterval = null;
      if (onDone) onDone();
    }
  }, speed);
}

/**
 * Append scripted lines to the current transcript view (after showLiveTranscript started it).
 */
export function appendToTranscript(actorId, lines) {
  const container = $('bc-transcript-body');
  if (!container) return;
  const sessionId = _transcriptSessionId;
  let idx = 0;
  function next() {
    if (sessionId !== _transcriptSessionId) return;
    if (idx >= lines.length) return;
    const line = lines[idx++];
    const bubble = document.createElement('div');
    bubble.className = line.speaker === 'player'
      ? 'transcript-bubble transcript-outgoing'
      : 'transcript-bubble transcript-incoming';
    container.appendChild(bubble);
    scrollTranscriptToBottomIfFollowing(container, 'smooth');
    if (line.speaker !== 'player' && !line.isEnd) {
      typeTextLine(bubble, line.text, 28, () => {
        if (sessionId !== _transcriptSessionId) return;
        if (_transcriptLineTimeout) clearTimeout(_transcriptLineTimeout);
        _transcriptLineTimeout = setTimeout(() => {
          _transcriptLineTimeout = null;
          next();
        }, line.delay || 400);
      }, sessionId);
    } else {
      bubble.textContent = line.text;
      if (line.speaker === 'player') bubble.style.opacity = '0.85';
      scrollTranscriptToBottomIfFollowing(container, 'smooth');
      if (_transcriptLineTimeout) clearTimeout(_transcriptLineTimeout);
      _transcriptLineTimeout = setTimeout(() => {
        _transcriptLineTimeout = null;
        next();
      }, line.delay || 400);
    }
  }
  next();
}

export function clearTranscriptOptions() {
  const el = $('bc-transcript-options');
  if (el) el.innerHTML = '';
}

/**
 * @param {Array<{label:string, action: () => void}>} opts
 */
export function showTranscriptOptions(opts) {
  const el = $('bc-transcript-options');
  if (!el) return;
  el.innerHTML = (opts || []).map((o, i) =>
    `<button type="button" class="bc-transcript-opt-btn" data-topt-idx="${i}">${esc(o.label)}</button>`
  ).join('');
  el.querySelectorAll('[data-topt-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.toptIdx);
      if (opts[i]?.action) opts[i].action();
    });
  });
}

export function endTranscriptSession() {
  abortTranscriptAsyncWork();
  clearTranscriptOptions();
  currentCallActorId = null;
  goHome();
}

function initiateCall(actorId) {
  if (!actorId) return;
  currentCallActorId = actorId;
  const actor = window.ActorDB?.getRaw?.(actorId);
  const name = actor?.public_profile?.display_name || actor?.full_legal_name || actorId;
  const phone = actor?.phone_numbers?.[0] || '—';
  const init = name[0]?.toUpperCase() || '?';

  const avatarEl = $('bc-call-avatar');
  if (avatarEl) avatarEl.textContent = init;
  const nameEl = $('bc-call-name');
  if (nameEl) nameEl.textContent = name;
  const numEl = $('bc-call-number');
  if (numEl) numEl.textContent = phone;

  pushView('calling');

  patchSession(s => {
    if (!s.blackCherry) s.blackCherry = { inbox: [], recentCalls: [] };
    if (!s.blackCherry.recentCalls) s.blackCherry.recentCalls = [];
    s.blackCherry.recentCalls.unshift({ actorId, name, phone, simMs: getState().sim?.elapsedMs || 0 });
    s.blackCherry.recentCalls = s.blackCherry.recentCalls.slice(0, 20);
  });

  try {
    window.ActivityLog?.log?.('CALL_OUTBOUND', `Outbound call to ${name} (${phone})`);
  } catch {
    /* ignore */
  }

  callTimer = setTimeout(() => {
    callTimer = null;
    startLiveConversation(actorId);
  }, 2500);
}

function startLiveConversation(actorId) {
  currentCallActorId = actorId;
  const cs = startConversation(actorId);
  if (!cs) { goHome(); return; }

  const avatarEl = $('bc-convo-avatar');
  if (avatarEl) avatarEl.textContent = cs.actorInitial;
  const nameEl = $('bc-convo-name');
  if (nameEl) nameEl.textContent = cs.actorName;

  convoSeconds = 0;
  updateConvoTimer();
  convoTimerInterval = setInterval(() => { convoSeconds++; updateConvoTimer(); }, 1000);
  convoOptIndex = 0;
  pushView('conversation');
  renderConversation();
}

function updateConvoTimer() {
  const el = $('bc-convo-timer');
  if (!el) return;
  const m = Math.floor(convoSeconds / 60);
  const s = convoSeconds % 60;
  el.textContent = `${m}:${String(s).padStart(2, '0')}`;
}

function renderConversation() {
  const cs = getConversationState();
  if (!cs) return;

  const transcript = $('bc-convo-transcript');
  if (transcript) {
    transcript.innerHTML = cs.transcript.map(line => {
      const cls = line.speaker === 'player' ? 'bc-convo-bubble--player' : 'bc-convo-bubble--npc';
      return `<div class="bc-convo-bubble ${cls}">${esc(line.text)}</div>`;
    }).join('');
    transcript.scrollTop = transcript.scrollHeight;
  }

  const optionsEl = $('bc-convo-options');
  if (optionsEl) {
    optionsEl.innerHTML = cs.options.map((opt, i) => {
      const sel = i === convoOptIndex ? ' bc-convo-opt--sel' : '';
      const cd = opt.onCooldown ? ' bc-convo-opt--cooldown' : '';
      const letter = String.fromCharCode(65 + i);
      return `<button class="bc-convo-opt${sel}${cd}" data-opt-idx="${i}" ${opt.onCooldown ? 'disabled' : ''}>${letter}) ${esc(opt.label)}</button>`;
    }).join('');
  }
}

async function handleConvoOptionSelect(idx) {
  const cs = getConversationState();
  if (!cs || cs.waitingForResponse) return;
  const opt = cs.options[idx];
  if (!opt || opt.onCooldown) return;

  const result = selectConversationOption(idx);
  if (!result) return;
  renderConversation();

  if (result.endsCall) {
    endCurrentCall(true);
    return;
  }

  setTimeout(() => {
    renderConversation();
  }, 1200);
}

function endCurrentCall(graceful = false) {
  if (callTimer) { clearTimeout(callTimer); callTimer = null; }
  if (_outgoingCallTimer) { clearTimeout(_outgoingCallTimer); _outgoingCallTimer = null; }
  if (convoTimerInterval) { clearInterval(convoTimerInterval); convoTimerInterval = null; }

  const actorId = currentCallActorId;
  if (actorId && !graceful) {
    const cs = getConversationState();
    if (cs && cs.inCall) {
      handleRudeHangup(actorId);
    }
  }

  endConversation();
  currentCallActorId = null;
  convoSeconds = 0;
  goHome();
}

function handleRudeHangup(actorId) {
  if (!actorId || !window.ActorDB) return;
  const actor = window.ActorDB.getRaw?.(actorId);
  if (!actor) return;

  const mem = (actor.memory || []).find(m => m.event === 'rude_hangup');
  let count = mem ? (mem.count || 0) : 0;
  let smsSent = mem ? (mem.sms_sent_count || 0) : 0;
  count++;

  if (mem) { mem.count = count; mem.sms_sent_count = smsSent; }
  else { window.ActorDB.addMemory?.(actorId, { event: 'rude_hangup', count, sms_sent_count: smsSent }); }

  window.AXIS?.updateScore?.(actorId, -3, 'Hung up without saying goodbye');

  if (smsSent < 2) {
    const name = actor.public_profile?.display_name || actor.full_legal_name || 'Someone';
    const delay = 30 * 60000;
    patchSession(s => {
      if (!s.blackCherry) s.blackCherry = { inbox: [], recentCalls: [], pendingRudenessEvents: [] };
      if (!s.blackCherry.pendingRudenessEvents) s.blackCherry.pendingRudenessEvents = [];
      s.blackCherry.pendingRudenessEvents.push({
        actorId,
        name,
        dueSimMs: (getState().sim?.elapsedMs || 0) + delay
      });
    });
    if (mem) mem.sms_sent_count = smsSent + 1;
  }
}

/* ── CashUp ── */
function renderCashUp() {
  const el = $('bc-cashup');
  if (!el) return;
  const state = getState();
  const cash = state.player?.hardCash || 0;
  const txns = state.player?.cashUpTransactions || [];
  const pct = Math.min(100, (cash / 9999) * 100);

  let recentHtml = '';
  if (txns.length) {
    recentHtml = '<div class="bc-cashup-recent"><div class="bc-cashup-recent-title">RECENT:</div>' +
      txns.slice(0, 8).map(tx => {
        const cls = tx.amount >= 0 ? 'bc-cashup-tx-amt--pos' : 'bc-cashup-tx-amt--neg';
        const sign = tx.amount >= 0 ? '+' : '';
        return `<div class="bc-cashup-tx"><span class="${cls}">${sign}$${Math.abs(tx.amount).toLocaleString()}</span><span class="bc-cashup-tx-desc">${esc(tx.description)}</span></div>`;
      }).join('') + '</div>';
  }

  el.innerHTML = `
    <div class="bc-cashup-title">CashUp</div>
    <div class="bc-cashup-sub">Your Pocket Cash</div>
    <div class="bc-cashup-balance">$${cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
    <div class="bc-cashup-bar"><div class="bc-cashup-bar-fill" style="width:${pct}%"></div></div>
    <div class="bc-cashup-cap">$${cash.toLocaleString()} of $9,999 max</div>
    <div class="bc-cashup-actions">
      <button class="bc-cashup-btn" id="bc-cashup-receive">Receive via CashPass</button>
      <button class="bc-cashup-btn" id="bc-cashup-send">Send to CashPass</button>
      <button class="bc-cashup-btn" id="bc-cashup-deposit">Deposit via Courier</button>
    </div>
    ${recentHtml}
    <div class="bc-cashup-warning">⚠ This balance is not reported to any authority. Max: $9,999</div>
  `;
}

/* ── Incoming call ── */
let _incomingOnAnswer = null;
let _incomingOnDecline = null;

/**
 * @param {string} actorId
 * @param {{ onAnswer?: () => void, onDecline?: () => void }} [callbacks]
 */
export function triggerIncomingCall(actorId, callbacks) {
  if (currentView === 'conversation' || currentView === 'calling') return;
  currentCallActorId = actorId;
  _incomingOnAnswer = callbacks?.onAnswer || null;
  _incomingOnDecline = callbacks?.onDecline || null;

  const actor = window.ActorDB?.getRaw?.(actorId);
  const name = actor?.public_profile?.display_name || actor?.full_legal_name || 'Unknown';
  const phone = actor?.phone_numbers?.[0] || '—';
  const init = name[0]?.toUpperCase() || '?';

  const avatarEl = $('bc-incoming-avatar');
  if (avatarEl) avatarEl.textContent = init;
  const nameEl = $('bc-incoming-name');
  if (nameEl) nameEl.textContent = name;
  const numEl = $('bc-incoming-number');
  if (numEl) numEl.textContent = phone;

  if (viewState !== 'open') {
    openBlackCherryDock();
  }

  pushView('incoming');

  try {
    window.ActivityLog?.log?.(
      'CALL_RECEIVE',
      `Incoming call from ${name} — ${phone}`
    );
  } catch {
    /* ignore */
  }
}

function answerIncomingCall() {
  if (currentView !== 'incoming' || !currentCallActorId) return;
  if (_incomingOnAnswer) {
    const cb = _incomingOnAnswer;
    _incomingOnAnswer = null;
    _incomingOnDecline = null;
    cb();
  } else {
    startLiveConversation(currentCallActorId);
  }
}

function declineIncomingCall() {
  if (currentView !== 'incoming' || !currentCallActorId) return;
  if (_incomingOnDecline) {
    const cb = _incomingOnDecline;
    _incomingOnAnswer = null;
    _incomingOnDecline = null;
    currentCallActorId = null;
    goHome();
    cb();
  } else {
    const actorId = currentCallActorId;
    const actor = window.ActorDB?.getRaw?.(actorId);
    const name = actor?.public_profile?.display_name || actor?.full_legal_name || 'Unknown';
    SMS.receive(actorId, `${name} declined your call.`, getState().sim?.elapsedMs || 0);
    currentCallActorId = null;
    goHome();
  }
}

/* ── Key handlers ── */
function onKeyCall() {
  if (currentView === 'incoming') { answerIncomingCall(); return; }
  if (currentView === 'conversation' || currentView === 'calling') return;
  if (currentView === 'dialpad') { dialCallInternal(); return; }
  pushView('dial');
}

function onKeyEnd() {
  if (currentView === 'incoming') { declineIncomingCall(); return; }
  if (currentView === 'transcript') { endTranscriptSession(); return; }
  if (currentView === 'conversation' || currentView === 'calling') { endCurrentCall(false); return; }
  goHome();
}

function onDpad(dir) {
  if (currentView === 'home') {
    const rows = Math.ceil(GRID_ITEMS.length / GRID_COLS);
    if (dir === 'up') gridRow = Math.max(0, gridRow - 1);
    if (dir === 'down') gridRow = Math.min(rows - 1, gridRow + 1);
    if (dir === 'left') gridCol = Math.max(0, gridCol - 1);
    if (dir === 'right') gridCol = Math.min(GRID_COLS - 1, gridCol + 1);
    renderIconGrid();
    return;
  }
  if (currentView === 'conversation') {
    const cs = getConversationState();
    if (!cs) return;
    if (dir === 'up') convoOptIndex = Math.max(0, convoOptIndex - 1);
    if (dir === 'down') convoOptIndex = Math.min(cs.options.length - 1, convoOptIndex + 1);
    renderConversation();
    return;
  }
}

function onKeyOk() {
  if (currentView === 'home') { activateGridItem(); return; }
  if (currentView === 'conversation') { handleConvoOptionSelect(convoOptIndex); return; }
}

function onKeyBack() { popView(); }
function onKeyMenu() { goHome(); }

/* ── Open / close / peek ── */
export function openBlackCherryDock() {
  cornerHoverLatched = false;
  clearPeekTimer();
  peekTrigger = 'none';
  viewState = 'open';
  syncTransform();
  clearPeekText();
  updatePhoneLine();
  goHome();
  dockRoot()?.removeAttribute('aria-hidden');
}

/** Open the handset to SMS thread with a contact (from CCR, etc.). */
export function openBlackCherrySmsTo(actorId) {
  if (!actorId || actorId === 'PLAYER_PRIMARY') return;
  openBlackCherryDock();
  viewHistory = [];
  pushView('messaging');
  setTimeout(() => openThread(actorId), 100);
}

/** Open dial pad with digits prefilled (formatted like live typing). */
export function openBlackCherryDialPreset(rawPhone) {
  openBlackCherryDock();
  viewHistory = [];
  const digits = String(rawPhone || '').replace(/\D/g, '').slice(0, 10);
  _dialBuffer = formatPhoneInput(digits);
  pushView('dialpad', { preserveDialBuffer: true });
}

export function peekBlackCherryFromCorner() {
  if (!desktopIsVisible()) return;
  if (viewState === 'open') return;
  clearPeekTimer();
  viewState = 'peek';
  peekTrigger = 'corner';
  syncTransform();
  dockRoot()?.removeAttribute('aria-hidden');
}

export function closeBlackCherryDock() {
  cornerSuppressUntilLeave = true;
  cornerHoverLatched = false;
  clearPeekTimer();
  peekTrigger = 'none';
  viewState = 'hidden';
  nearFaceActive = false;
  clearPeekText();
  abortTranscriptAsyncWork();
  endCurrentCall(true);
  _dialBuffer = '';
  syncTransform();
  dockRoot()?.setAttribute('aria-hidden', 'true');
  syncBcKeyboardDialpadMode();
  updateDialHud();
}

export function smsToPlayer(text, actorId = '') {
  const simMs = getState().sim?.elapsedMs || 0;
  const senderId = actorId || 'CORPOS_SYSTEM';
  if (actorId) {
    SMS.receive(actorId, text, simMs);
  } else {
    SMS.send({ from: 'CORPOS_SYSTEM', message: text, gameTime: simMs });
  }

  if (viewState === 'open') {
    if (currentView === 'messaging') renderThreadList();
    renderIconGrid();
  }

  const actor = actorId ? window.ActorDB?.getRaw?.(actorId) : null;
  const senderName = actor?.contactDisplayName || actor?.first_name || 'CorpOS System';
  PeekManager.show({
    sender: senderName,
    preview: String(text).slice(0, 55),
    type: 'sms',
    targetId: senderId,
    icon: '💬',
  });
}

export function tickBlackCherryRudeness() {
  const simMs = getState().sim?.elapsedMs || 0;
  const session = getSessionState();
  const pending = session.blackCherry?.pendingRudenessEvents || [];
  const due = pending.filter(e => simMs >= e.dueSimMs);
  if (!due.length) return;

  for (const ev of due) {
    SMS.receive(ev.actorId, `You just hung up on me without saying goodbye. That was really rude.`, simMs);
    PeekManager.show({
      sender: ev.name,
      preview: 'You hung up on me!',
      type: 'sms',
      targetId: ev.actorId,
      icon: '💬',
    });
  }

  patchSession(s => {
    if (!s.blackCherry?.pendingRudenessEvents) return;
    s.blackCherry.pendingRudenessEvents = s.blackCherry.pendingRudenessEvents.filter(e => simMs < e.dueSimMs);
  });
}

/* ── Live transcript (scripted calls like Kyle) ── */

function typeText(element, text, speed, onDone, sessionId) {
  if (_transcriptTypingInterval) {
    clearInterval(_transcriptTypingInterval);
    _transcriptTypingInterval = null;
  }
  let i = 0;
  _transcriptTypingInterval = setInterval(() => {
    if (sessionId !== _transcriptSessionId) {
      clearInterval(_transcriptTypingInterval);
      _transcriptTypingInterval = null;
      return;
    }
    element.textContent = text.substring(0, i + 1);
    scheduleTranscriptScrollToBottomIfFollowing();
    i++;
    if (i >= text.length) {
      clearInterval(_transcriptTypingInterval);
      _transcriptTypingInterval = null;
      if (onDone) onDone();
    }
  }, speed);
}

/**
 * Show a scripted live-transcript call on the Black Cherry.
 * @param {{actorId:string, displayName:string, transcript:Array<{speaker:string,text:string,delay:number,isEnd?:boolean}>, onComplete:()=>void}} opts
 */
export function showLiveTranscript({ actorId, displayName, transcript, onComplete }) {
  if (viewState !== 'open') openBlackCherryDock();
  abortTranscriptAsyncWork();
  const sessionId = _transcriptSessionId;
  pushView('transcript');
  clearTranscriptOptions();
  _transcriptFollowBottom = true;
  bindTranscriptScrollFollow();

  const avatarEl = $('bc-transcript-avatar');
  const nameEl = $('bc-transcript-name');
  const timerEl = $('bc-transcript-timer');
  const container = $('bc-transcript-body');
  if (avatarEl) avatarEl.textContent = (displayName || '?')[0].toUpperCase();
  if (nameEl) nameEl.textContent = displayName;
  if (container) container.innerHTML = '';

  transcriptSeconds = 0;
  if (timerEl) timerEl.textContent = '0:00';
  transcriptTimerInterval = setInterval(() => {
    if (sessionId !== _transcriptSessionId) return;
    transcriptSeconds++;
    const m = Math.floor(transcriptSeconds / 60);
    const s = transcriptSeconds % 60;
    if (timerEl) timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }, 1000);

  let lineIndex = 0;

  function renderNextLine() {
    if (sessionId !== _transcriptSessionId) return;
    if (lineIndex >= transcript.length) {
      clearInterval(transcriptTimerInterval);
      transcriptTimerInterval = null;
      if (sessionId === _transcriptSessionId && onComplete) onComplete();
      return;
    }

    const line = transcript[lineIndex++];
    const bubble = document.createElement('div');
    bubble.className = line.speaker === 'player'
      ? 'transcript-bubble transcript-outgoing'
      : 'transcript-bubble transcript-incoming';

    if (container) {
      container.appendChild(bubble);
      scrollTranscriptToBottomIfFollowing(container, 'smooth');
    }

    if (line.speaker !== 'player' && !line.isEnd) {
      typeText(bubble, line.text, 28, () => {
        if (sessionId !== _transcriptSessionId) return;
        if (_transcriptLineTimeout) clearTimeout(_transcriptLineTimeout);
        _transcriptLineTimeout = setTimeout(() => {
          _transcriptLineTimeout = null;
          renderNextLine();
        }, line.delay);
      }, sessionId);
    } else {
      bubble.textContent = line.text;
      if (line.speaker === 'player') bubble.style.opacity = '0.5';
      if (container) scrollTranscriptToBottomIfFollowing(container, 'smooth');
      if (_transcriptLineTimeout) clearTimeout(_transcriptLineTimeout);
      _transcriptLineTimeout = setTimeout(() => {
        _transcriptLineTimeout = null;
        renderNextLine();
      }, line.delay);
    }
  }

  if (_transcriptLineTimeout) clearTimeout(_transcriptLineTimeout);
  _transcriptLineTimeout = setTimeout(() => {
    _transcriptLineTimeout = null;
    renderNextLine();
  }, 600);
}

/* ── Init ── */
export function initBlackCherry() {
  if (!dockRoot()) return;

  patchSession(s => {
    if (!s.blackCherry) s.blackCherry = { inbox: [], recentCalls: [], pendingRudenessEvents: [] };
    if (!s.blackCherry.recentCalls) s.blackCherry.recentCalls = [];
    if (!s.blackCherry.pendingRudenessEvents) s.blackCherry.pendingRudenessEvents = [];
  });

  bindTranscriptScrollFollow();

  function isPointerInCornerHotspot(clientX, clientY) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const y0 = vh - CORNER_HOTSPOT_H + CORNER_HOTSPOT_Y_TRIM;
    return clientX >= vw - CORNER_HOTSPOT_W && clientY >= y0;
  }

  document.addEventListener('mousemove', e => {
    if (!desktopIsVisible()) return;
    const now = performance.now();
    if (now - lastCornerPointerCheck < 45) return;
    lastCornerPointerCheck = now;
    const inCorner = isPointerInCornerHotspot(e.clientX, e.clientY);
    if (!inCorner) { cornerHoverLatched = false; cornerSuppressUntilLeave = false; return; }
    if (cornerSuppressUntilLeave) return;
    if (!cornerHoverLatched) { cornerHoverLatched = true; peekBlackCherryFromCorner(); }
  });

  deviceEl()?.addEventListener('click', e => {
    if (viewState !== 'peek') return;
    const t = e.target;
    const host = t instanceof Element ? t : t instanceof Text ? t.parentElement : null;
    if (host?.closest('#bc-btn-close')) return;
    openBlackCherryDock();
  }, true);

  $('bc-btn-close')?.addEventListener('click', e => {
    e.stopPropagation();
    if (viewState !== 'open') return;
    closeBlackCherryDock();
  });

  const dockEl = dockRoot();
  dockEl?.addEventListener('mouseenter', () => {
    if (viewState !== 'peek' || peekTrigger !== 'corner') return;
    clearPeekTimer();
  });
  dockEl?.addEventListener('mouseleave', () => {
    if (viewState !== 'peek' || peekTrigger !== 'corner') return;
    schedulePeekHide(PEEK_CORNER_LEAVE_HIDE_MS, 'corner');
  });
  dockEl?.addEventListener('click', e => e.stopPropagation());

  // Hardware key wiring
  $('bc-key-call')?.addEventListener('click', onKeyCall);
  $('bc-key-end')?.addEventListener('click', onKeyEnd);
  $('bc-key-ok')?.addEventListener('click', onKeyOk);
  $('bc-key-menu')?.addEventListener('click', onKeyMenu);
  $('bc-key-back')?.addEventListener('click', onKeyBack);
  $('bc-key-near')?.addEventListener('click', () => toggleNearFace());

  // Icon grid clicks
  $('bc-icon-grid')?.addEventListener('click', e => {
    const cell = e.target.closest('[data-grid-idx]');
    if (!cell) return;
    const idx = Number(cell.dataset.gridIdx);
    gridRow = Math.floor(idx / GRID_COLS);
    gridCol = idx % GRID_COLS;
    renderIconGrid();
    activateGridItem();
  });

  // SMS thread list clicks
  $('bc-messages')?.addEventListener('click', e => {
    const row = e.target.closest('[data-thread-id]');
    if (!row) return;
    openThread(row.dataset.threadId);
  });

  // SMS compose
  const smsInput = $('bc-sms-input');
  const smsSend = $('bc-sms-send');
  smsSend?.addEventListener('click', () => {
    if (!smsInput || !activeThreadSenderId) return;
    const text = smsInput.value.trim();
    if (!text) return;
    SMS.sendPlayerReply(activeThreadSenderId, text, getState().sim?.elapsedMs || 0);
    smsInput.value = '';
    renderThreadDetail();
  });
  smsInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); smsSend?.click(); }
  });

  // Dial list clicks
  $('bc-dial-list')?.addEventListener('click', e => {
    const row = e.target.closest('[data-call-actor]');
    if (!row) return;
    const actorId = row.dataset.callActor;
    if (actorId) initiateCall(actorId);
  });

  deviceEl()?.addEventListener('click', (e) => {
    if (viewState !== 'open') return;
    const keyBtn = e.target.closest('[data-dial-key]');
    const dk = keyBtn?.getAttribute('data-dial-key');
    if (dk) {
      e.preventDefault();
      dialKeyPressInternal(dk);
      return;
    }
    if (e.target.closest('#bc-dial-backspace')) { e.preventDefault(); dialBackspaceInternal(); return; }
    if (e.target.closest('#bc-dial-clear')) { e.preventDefault(); dialClearInternal(); return; }
  });

  // Conversation option clicks
  $('bc-convo-options')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-opt-idx]');
    if (!btn) return;
    handleConvoOptionSelect(Number(btn.dataset.optIdx));
  });

  // Contact row clicks — expand to show phone + actions
  $('bc-contacts')?.addEventListener('click', e => {
    if (e.target.closest('.bc-contact-search')) return;
    if (e.target.closest('.bc-contact-action-call')) {
      const actorId = e.target.closest('[data-bc-actor-id]')?.dataset.bcActorId;
      if (actorId && actorId !== 'PLAYER_PRIMARY') initiateCall(actorId);
      return;
    }
    if (e.target.closest('.bc-contact-action-sms')) {
      const actorId = e.target.closest('[data-bc-actor-id]')?.dataset.bcActorId;
      if (actorId && actorId !== 'PLAYER_PRIMARY') openThread(actorId);
      return;
    }
    const row = e.target.closest('[data-bc-actor-id]');
    if (!row) return;
    const actorId = row.dataset.bcActorId;
    const phone = row.dataset.bcPhone || '—';
    const isPlayer = actorId === 'PLAYER_PRIMARY';
    const existing = row.querySelector('.bc-contact-expand');
    if (existing) { existing.remove(); return; }

    $('bc-contacts')?.querySelectorAll('.bc-contact-expand').forEach((el) => el.remove());

    const expand = document.createElement('div');
    expand.className = 'bc-contact-expand';
    if (isPlayer) {
      expand.innerHTML = `<div class="bc-contact-expand-phone">${esc(phone)}</div><div class="bc-contact-expand-label">This is you</div>`;
    } else {
      expand.innerHTML = `<div class="bc-contact-expand-phone">${esc(phone)}</div>
        <button class="bc-contact-action-call">Call</button>
        <button class="bc-contact-action-sms">SMS</button>`;
    }
    row.appendChild(expand);

    if (actorId && !isPlayer) {
      window.AXIS?.discover?.(actorId, { source: 'black_cherry', note: 'Viewed in contacts.' });
    }
  });

  // Keyboard shortcut
  document.addEventListener('keydown', e => {
    if (!desktopIsVisible()) return;
    if (viewState === 'open') {
      if (e.key === 'Escape') { e.preventDefault(); onKeyBack(); return; }
      if (!typingOrBrowserFocus() && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (currentView === 'home' || currentView === 'conversation') {
          e.preventDefault();
          const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
          onDpad(map[e.key]);
        }
      }
      if (!typingOrBrowserFocus() && e.key === 'Enter') {
        const digits = _dialBuffer.replace(/\D/g, '');
        if (digits.length >= 10 && dialHardwareInputActive()) {
          e.preventDefault();
          dialCallInternal();
          return;
        }
        if (currentView === 'home' || currentView === 'conversation') {
          e.preventDefault();
          onKeyOk();
          return;
        }
      }
      if (!typingOrBrowserFocus() && e.key === ' ') {
        if (currentView === 'home' || currentView === 'conversation') {
          e.preventDefault();
          onKeyOk();
          return;
        }
      }
      if (dialHardwareInputActive()) {
        const np = /^Numpad(\d)$/.exec(e.code || '');
        if (np) {
          e.preventDefault();
          dialKeyPressInternal(np[1]);
          return;
        }
        const k = e.key;
        if (k.length === 1 && k >= '0' && k <= '9') {
          e.preventDefault();
          dialKeyPressInternal(k);
          return;
        }
        if (k === '*' || k === '#') {
          e.preventDefault();
          dialKeyPressInternal(k);
          return;
        }
        if (k === 'Backspace') {
          e.preventDefault();
          dialBackspaceInternal();
          return;
        }
      }
      return;
    }
    if (viewState === 'hidden' && e.key === 'ArrowUp' && !typingOrBrowserFocus()) {
      e.preventDefault();
      openBlackCherryDock();
    }
  });

  viewState = 'hidden';
  peekTrigger = 'none';
  clearPeekText();
  syncTransform();
  updatePhoneLine();
  goHome();
  dockRoot()?.setAttribute('aria-hidden', 'true');

  let alignDockRaf = 0;
  function scheduleDockAlign() {
    if (alignDockRaf) cancelAnimationFrame(alignDockRaf);
    alignDockRaf = requestAnimationFrame(() => { alignDockRaf = 0; syncBlackCherryDockToSpeedControls(); });
  }
  window.addEventListener('resize', scheduleDockAlign);
  scheduleDockAlign();
  requestAnimationFrame(scheduleDockAlign);

  on('bc:notification_pushed', () => {
    updateBellBadge();
    if (currentView === 'notifications') {
      renderNotificationList();
    }
  });

  document.getElementById('bc-notif-list')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-notif-id]');
    if (!row) return;

    const id = row.getAttribute('data-notif-id');
    const actionType = row.getAttribute('data-action-type') || '';
    const actionPayload = row.getAttribute('data-action-payload') || '';

    if (id) markRead(id);
    renderNotificationList();
    updateBellBadge();

    if (!actionType) return;

    switch (actionType) {
      case 'open_sms_thread':
        pushView('messaging');
        if (actionPayload) {
          setTimeout(() => openThread(actionPayload), 80);
        }
        break;
      case 'open_view':
        if (actionPayload) pushView(actionPayload);
        break;
      case 'open_window':
        if (actionPayload) {
          closeBlackCherryDock();
          window.openW?.(actionPayload);
        }
        break;
      case 'open_worldnet':
        closeBlackCherryDock();
        window.openW?.('worldnet');
        if (actionPayload) {
          setTimeout(() => window.wnetGo?.(actionPayload), 120);
        }
        break;
      case 'open_jeemail':
        closeBlackCherryDock();
        window.openW?.('worldnet');
        setTimeout(() => window.wnetGo?.('jeemail'), 120);
        break;
      case 'open_jeemail_message':
        closeBlackCherryDock();
        window.openW?.('worldnet');
        setTimeout(() => {
          window.wnetGo?.('jeemail');
          setTimeout(() => {
            window.dispatchEvent(
              new CustomEvent('jeemail:open-message', { detail: { messageId: actionPayload } })
            );
          }, 300);
        }, 120);
        break;
      case 'open_bc_dial':
        pushView('dial');
        break;
      default:
        break;
    }
  });

  document.getElementById('bc-notif-clear-btn')?.addEventListener('click', () => {
    clearAll();
    renderNotificationList();
    updateBellBadge();
  });

  window.bcbNavigateTo = bcbNavigateTo;
  window.bcPushView = pushView;
  window.bcOpenThread = openThread;

  window.BlackCherry = {
    openToThread(senderId) {
      openBlackCherryDock();
      activeThreadSenderId = senderId;
      pushView('thread');
    },
    openToDialer() {
      openBlackCherryDock();
      pushView('dial');
    },
    openToCashUp() {
      openBlackCherryDock();
      pushView('cashup');
    },
    showDialPad,
    dialKeyPress: dialKeyPressInternal,
    dialBackspace: dialBackspaceInternal,
    dialClear: dialClearInternal,
    dialCall: dialCallInternal,
    formatPhoneInput
  };
}
