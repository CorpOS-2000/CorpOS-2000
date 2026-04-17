/**
 * peek-manager.js — Independent stacked peek notifications above the taskbar.
 * Each event gets its own slide-up; click deep-links to the source screen.
 */
import { NotificationSound } from './notification-sound.js';
import { getSessionState, patchSession } from './sessionState.js';
import { getState } from './gameState.js';
import {
  pushNotification,
  resolvePeekAction,
  mapPeekTypeToNotifCategory,
} from './bc-notifications.js';

const MAX_SIMULTANEOUS = 3;
const AUTO_DISMISS_MS = 5000;

/** @type {HTMLElement[]} */
const active = [];
/** @type {Array<{sender:string, preview:string, type:string, targetId:string|null, icon:string}>} */
const queue = [];

function stackEl() { return document.getElementById('peek-stack'); }

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function drainQueue() {
  while (queue.length && active.length < MAX_SIMULTANEOUS) {
    _render(queue.shift());
  }
}

function _render(opts) {
  const container = stackEl();
  if (!container) return;

  const { sender, preview, type, targetId, icon } = opts;
  const peek = document.createElement('div');
  peek.className = 'peek-notification';
  peek.dataset.type = type;
  if (targetId) peek.dataset.targetId = targetId;

  peek.innerHTML =
    `<div class="peek-icon">${esc(icon)}</div>` +
    `<div class="peek-body">` +
      `<div class="peek-sender">${esc(sender)}</div>` +
      `<div class="peek-preview">${esc(preview)}</div>` +
    `</div>`;

  peek.addEventListener('click', () => {
    deepLink(type, targetId);
    dismiss(peek);
  });

  if (type === 'call_incoming') {
    NotificationSound.playRing();
  } else {
    NotificationSound.play();
  }

  container.appendChild(peek);
  active.push(peek);

  requestAnimationFrame(() => peek.classList.add('peek-visible'));
  setTimeout(() => dismiss(peek), AUTO_DISMISS_MS);
}

function dismiss(peek) {
  if (!peek || !peek.parentNode) {
    const idx = active.indexOf(peek);
    if (idx !== -1) active.splice(idx, 1);
    drainQueue();
    return;
  }
  peek.classList.remove('peek-visible');
  peek.classList.add('peek-exiting');
  setTimeout(() => {
    peek.remove();
    const idx = active.indexOf(peek);
    if (idx !== -1) active.splice(idx, 1);
    drainQueue();
  }, 300);
}

function deepLink(type, targetId) {
  switch (type) {
    case 'sms':
    case 'order_delivered':
    case 'compliance':
      if (window.BlackCherry?.openToThread) {
        window.BlackCherry.openToThread(targetId);
      }
      break;
    case 'call_incoming':
      break;
    case 'call_missed':
      if (window.BlackCherry?.openToDialer) {
        window.BlackCherry.openToDialer();
      }
      break;
    case 'email': {
      let opened = false;
      if (targetId) {
        const s = getSessionState();
        const user = s.jeemail?.currentUser;
        const acc = user && s.jeemail?.accounts?.[user];
        if (acc) {
          const idx = (acc.inbox || []).findIndex(m => m.id === targetId);
          if (idx >= 0) {
            patchSession(ss => {
              ss.jeemail.openMessage = { box: 'inbox', index: idx };
              const a = ss.jeemail.accounts[ss.jeemail.currentUser];
              if (a?.inbox?.[idx]) a.inbox[idx].isRead = true;
            });
            window.WorldNet?.navigateTo?.('jeemail_read');
            opened = true;
          }
        }
      }
      if (!opened) window.WorldNet?.navigateTo?.('jeemail_inbox');
      break;
    }
    case 'cashpass':
      if (window.BlackCherry?.openToCashUp) {
        window.BlackCherry.openToCashUp();
      }
      break;
    case 'toast_only':
      break;
  }
}

/**
 * Show a peek notification. If MAX_SIMULTANEOUS are already visible, the
 * notification is queued and will appear when a slot frees.
 */
export function peekShow({ sender, preview, type, targetId = null, icon = '💬' }) {
  const simMs = getState()?.sim?.elapsedMs ?? 0;
  pushNotification({
    id: `peek_${type}_${targetId || ''}_${Date.now()}`,
    type: mapPeekTypeToNotifCategory(type),
    title: sender || 'Notification',
    body: String(preview || '').slice(0, 200),
    icon: icon || '💬',
    simMs,
    action: resolvePeekAction(type, targetId),
  });

  const opts = { sender, preview, type, targetId, icon };
  if (active.length >= MAX_SIMULTANEOUS) {
    queue.push(opts);
  } else {
    _render(opts);
  }
}

export function peekDismissAll() {
  for (const p of [...active]) dismiss(p);
  queue.length = 0;
}

export const PeekManager = { show: peekShow, dismissAll: peekDismissAll };
