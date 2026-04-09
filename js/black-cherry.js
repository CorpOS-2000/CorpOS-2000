/**
 * Black Cherry™ — in-world smartphone UI with hardware keys, icon grid, calling,
 * conversations, CashUp, threaded SMS, and contacts.
 */
import { getSessionState, patchSession } from './sessionState.js';
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { toast } from './toast.js';
import { SMS, GOVERNMENT_SENDERS } from './bc-sms.js';
import { startConversation, selectConversationOption, endConversation, getConversationState } from './bc-conversation.js';

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
/** When true and phone is open, dock sits top-right and handset is scaled up (“bring to face”). */
let nearFaceActive = false;

const GRID_COLS = 3;
const GRID_ITEMS = [
  { id: 'sms',      label: 'SMS',         icon: '✉',  view: 'messaging' },
  { id: 'contacts', label: 'Contacts',    icon: '👤', view: 'contacts' },
  { id: 'cashup',   label: 'CashUp',      icon: '💰', view: 'cashup' },
  { id: 'calllog',  label: 'Call Log',    icon: '📞', view: 'dial' },
  { id: 'maps',     label: 'Maps',        icon: '🗺', action: 'open-maps' },
  { id: 'settings', label: 'Settings',    icon: '⚙',  view: 'settings' },
  { id: 'browser',  label: 'Browser',     icon: '🌐', action: 'open-browser' },
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
  if (a.closest('#wnet-content')) return true;
  return false;
}

function desktopIsVisible() { return $('desktop')?.classList.contains('show') ?? false; }

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, ' '); }

function updatePhoneLine() {
  const el = $('bc-phone-line');
  if (!el) return;
  try { el.textContent = getState().player?.phone || '—'; } catch { el.textContent = '—'; }
}

function setScreenHeading(text) { const h = $('bc-screen-heading'); if (h) h.textContent = text; }

/* ── View navigation ── */
function showView(view) {
  const allViews = ['home','messaging','thread','contacts','dial','calling','incoming','conversation','cashup','settings','calendar'];
  const activeId = `bc-view-${view}`;
  for (const v of allViews) {
    $(`bc-view-${v}`)?.classList.toggle('bc-view--active', `bc-view-${v}` === activeId);
  }
  currentView = view;
  if (view === 'home') { setScreenHeading('Home'); renderIconGrid(); }
  else if (view === 'messaging') { setScreenHeading('Messages'); renderThreadList(); }
  else if (view === 'thread') { setScreenHeading('Thread'); renderThreadDetail(); }
  else if (view === 'contacts') { setScreenHeading('Contacts'); renderContacts(); }
  else if (view === 'dial') { setScreenHeading('Contacts & Dial'); renderDialList(); }
  else if (view === 'calling') { setScreenHeading(''); }
  else if (view === 'incoming') { setScreenHeading(''); }
  else if (view === 'conversation') { setScreenHeading(''); }
  else if (view === 'cashup') { setScreenHeading('CashUp'); renderCashUp(); }
  else if (view === 'settings') { setScreenHeading('Settings'); }
  else if (view === 'calendar') { setScreenHeading('Calendar'); }
}

function pushView(view) {
  if (currentView !== view) viewHistory.push(currentView);
  showView(view);
}

function popView() {
  const prev = viewHistory.pop() || 'home';
  showView(prev);
}

function goHome() { viewHistory = []; showView('home'); }

/* ── Icon grid ── */
function renderIconGrid() {
  const grid = $('bc-icon-grid');
  if (!grid) return;
  const unread = SMS.getUnreadCount();
  const cash = getState().player?.hardCash || 0;
  grid.innerHTML = GRID_ITEMS.map((item, i) => {
    const r = Math.floor(i / GRID_COLS);
    const c = i % GRID_COLS;
    const sel = (r === gridRow && c === gridCol) ? ' bc-grid-cell--sel' : '';
    let badge = '';
    if (item.id === 'sms' && unread > 0) badge = `<span class="bc-unread-badge">${unread}</span>`;
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
  if (item.action === 'open-maps') {
    closeBlackCherryDock();
    window.WorldNet?.navigateTo?.('moogle_maps');
    return;
  }
  if (item.action === 'open-browser') {
    closeBlackCherryDock();
    window.WorldNet?.navigateTo?.('wahoo');
    return;
  }
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
    const badge = isOfficial ? '<span class="bc-official-badge">⛨</span>' : '';
    const avatarBg = t.avatarColor || (isOfficial ? '#0a246a' : '#5a8a5a');
    const initials = esc(t.avatarLabel || (t.senderName || '?')[0]);
    const unread = t.unreadCount > 0 ? `<span class="bc-thread-unread">${t.unreadCount}</span>` : '';
    const snippet = esc((t.lastMessage || '').slice(0, 40));
    const time = t.lastTime ? formatSimTime(t.lastTime) : '';
    return `<div class="bc-thread-row" data-thread-id="${esc(t.senderId)}">
      <div class="bc-thread-avatar" style="background:${avatarBg}">${initials}</div>
      <div class="bc-thread-info">
        <div class="bc-thread-name">${badge}${esc(t.senderName || t.senderId)}</div>
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
    header.innerHTML = `${badge}${esc(thread.senderName || thread.senderId)}`;
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
function renderContacts() {
  const box = $('bc-contacts');
  if (!box) return;
  const contacts = getPlayerContacts();
  if (!contacts.length) {
    box.innerHTML = '<div class="bc-msg--empty">No contacts.</div>';
    return;
  }
  box.innerHTML = contacts.map(c => {
    return `<div class="bc-contact-row" data-bc-actor-id="${esc(c.actorId)}">
      <div class="bc-contact-name">${esc(c.name)}</div>
      <div class="bc-contact-num">${esc(c.phone)}</div>
    </div>`;
  }).join('');
}

function getPlayerContacts() {
  const contacts = [];
  const state = getState();
  const bcContacts = state.player?.blackCherryContacts || [];
  for (const c of bcContacts) {
    contacts.push({ actorId: c.actorId, name: c.displayName || c.actorId, phone: c.phone || '—' });
  }
  if (!contacts.length && window.ActorDB?.query) {
    const rows = window.ActorDB.query('email', { limit: 20 });
    for (const a of rows) {
      contacts.push({
        actorId: a.actor_id || '',
        name: a.public_profile?.display_name || a.full_legal_name || 'Unknown',
        phone: a.phone_numbers?.[0] || '—'
      });
    }
  }
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
    const init = (c.name || '?')[0].toUpperCase();
    html += `<div class="bc-dial-row" data-call-actor="${esc(c.actorId)}">
      <div class="bc-dial-avatar">${init}</div>
      <div class="bc-dial-info"><div class="bc-dial-name">${esc(c.name)}</div><div class="bc-dial-num">${esc(c.phone)}</div></div>
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
export function triggerIncomingCall(actorId) {
  if (currentView === 'conversation' || currentView === 'calling') return;
  currentCallActorId = actorId;
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
    const peekEl = $('bc-peek-msg');
    if (peekEl) peekEl.textContent = `Incoming: ${name}`;
    viewState = 'peek';
    peekTrigger = 'sms';
    syncTransform();
    dockRoot()?.removeAttribute('aria-hidden');
  }

  pushView('incoming');
}

function answerIncomingCall() {
  if (currentView !== 'incoming' || !currentCallActorId) return;
  startLiveConversation(currentCallActorId);
}

function declineIncomingCall() {
  if (currentView !== 'incoming' || !currentCallActorId) return;
  const actorId = currentCallActorId;
  const actor = window.ActorDB?.getRaw?.(actorId);
  const name = actor?.public_profile?.display_name || actor?.full_legal_name || 'Unknown';
  SMS.receive(actorId, `${name} declined your call.`, getState().sim?.elapsedMs || 0);
  currentCallActorId = null;
  goHome();
}

/* ── Key handlers ── */
function onKeyCall() {
  if (currentView === 'incoming') { answerIncomingCall(); return; }
  if (currentView === 'conversation' || currentView === 'calling') return;
  pushView('dial');
}

function onKeyEnd() {
  if (currentView === 'incoming') { declineIncomingCall(); return; }
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
  endCurrentCall(true);
  syncTransform();
  dockRoot()?.setAttribute('aria-hidden', 'true');
}

export function smsToPlayer(text, actorId = '') {
  const simMs = getState().sim?.elapsedMs || 0;
  if (actorId) {
    SMS.receive(actorId, text, simMs);
  } else {
    SMS.send({ from: 'CORPOS_SYSTEM', message: text, gameTime: simMs });
  }
  triggerSmsPeek(text);
}

function triggerSmsPeek(text) {
  const raw = String(text);
  const short = raw.length > 60 ? `New: ${raw.slice(0, 55)}…` : `New: ${raw}`;
  const peekEl = $('bc-peek-msg');
  if (peekEl) peekEl.textContent = short;

  if (viewState === 'open') {
    if (currentView === 'messaging') renderThreadList();
    renderIconGrid();
    return;
  }

  viewState = 'peek';
  peekTrigger = 'sms';
  syncTransform();
  dockRoot()?.removeAttribute('aria-hidden');
  schedulePeekHide(PEEK_SMS_HIDE_MS, 'sms');
}

export function tickBlackCherryRudeness() {
  const simMs = getState().sim?.elapsedMs || 0;
  const session = getSessionState();
  const pending = session.blackCherry?.pendingRudenessEvents || [];
  const due = pending.filter(e => simMs >= e.dueSimMs);
  if (!due.length) return;

  for (const ev of due) {
    SMS.receive(ev.actorId, `You just hung up on me without saying goodbye. That was really rude.`, simMs);
    triggerSmsPeek(`${ev.name}: You hung up on me!`);
  }

  patchSession(s => {
    if (!s.blackCherry?.pendingRudenessEvents) return;
    s.blackCherry.pendingRudenessEvents = s.blackCherry.pendingRudenessEvents.filter(e => simMs < e.dueSimMs);
  });
}

/* ── Init ── */
export function initBlackCherry() {
  if (!dockRoot()) return;

  patchSession(s => {
    if (!s.blackCherry) s.blackCherry = { inbox: [], recentCalls: [], pendingRudenessEvents: [] };
    if (!s.blackCherry.recentCalls) s.blackCherry.recentCalls = [];
    if (!s.blackCherry.pendingRudenessEvents) s.blackCherry.pendingRudenessEvents = [];
  });

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

  // Conversation option clicks
  $('bc-convo-options')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-opt-idx]');
    if (!btn) return;
    handleConvoOptionSelect(Number(btn.dataset.optIdx));
  });

  // Contact row clicks
  $('bc-contacts')?.addEventListener('click', e => {
    const row = e.target.closest('[data-bc-actor-id]');
    if (!row) return;
    const actorId = row.dataset.bcActorId;
    if (actorId) {
      window.WorldNet?.axis?.discover?.(actorId, { source: 'black_cherry', note: 'Viewed in contacts.' });
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
      if (!typingOrBrowserFocus() && (e.key === 'Enter' || e.key === ' ')) {
        if (currentView === 'home' || currentView === 'conversation') {
          e.preventDefault();
          onKeyOk();
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
}
