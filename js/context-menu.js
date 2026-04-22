import { getSessionState, setClipboardText } from './sessionState.js';
import {
  desktopContextActions,
  openDesktopVfsItem,
  renameDesktopVfsPrompt
} from './desktop.js';

let menuEl = null;
let lastTarget = null;

function ensureMenu() {
  if (menuEl) return menuEl;
  menuEl = document.createElement('div');
  menuEl.id = 'context-menu';
  menuEl.className = 'context-menu is-hidden';
  document.body.appendChild(menuEl);
  document.addEventListener('click', () => hideMenu(), true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideMenu();
  });
  return menuEl;
}

function hideMenu() {
  if (!menuEl) return;
  menuEl.classList.add('is-hidden');
  menuEl.innerHTML = '';
}

function getSelectedText() {
  const s = window.getSelection?.();
  return s ? String(s).trim() : '';
}

async function copySelectedText() {
  const text = getSelectedText();
  if (!text) return;
  setClipboardText(text);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* fallback already captured in session */
  }
}

function pasteInto(target, text) {
  if (!target || typeof text !== 'string') return;
  const isInput = target.matches('input,textarea');
  if (!isInput) return;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  const v = target.value || '';
  target.value = `${v.slice(0, start)}${text}${v.slice(end)}`;
  const pos = start + text.length;
  target.selectionStart = pos;
  target.selectionEnd = pos;
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
}

async function pasteToTarget() {
  const target = lastTarget;
  if (!target || !target.matches('input,textarea')) return;
  let text = getSessionState().clipboard.text || '';
  try {
    const fromSystem = await navigator.clipboard.readText();
    if (fromSystem) text = fromSystem;
  } catch {
    /* use fallback */
  }
  pasteInto(target, text);
}

function drawMenu(items, x, y) {
  const menu = ensureMenu();
  menu.innerHTML = '';
  for (const item of items) {
    if (item.type === 'sep') {
      const sep = document.createElement('div');
      sep.className = 'cm-sep';
      menu.appendChild(sep);
      continue;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cm-item';
    btn.textContent = item.label;
    if (item.disabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        hideMenu();
        item.onClick?.();
      });
    }
    menu.appendChild(btn);
  }
  menu.classList.remove('is-hidden');
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const maxX = Math.max(0, vw - menu.offsetWidth - 8);
  const maxY = Math.max(0, vh - menu.offsetHeight - 8);
  menu.style.left = `${Math.min(x, maxX)}px`;
  menu.style.top = `${Math.min(y, maxY)}px`;
}

function buildDesktopMenu(e) {
  const actions = desktopContextActions(e.clientX, e.clientY);
  return [
    { label: 'Wallpaper...', onClick: actions.openWallpaperDialog },
    { type: 'sep' },
    { label: 'New Folder', onClick: actions.createFolder },
    { label: 'New Text Document', onClick: actions.createTextDocument }
  ];
}

function buildBrowserMenu() {
  return [
    { label: 'Back', onClick: () => window.wnetBack?.() },
    { label: 'Forward', onClick: () => window.wnetForward?.() },
    { label: 'Reload', onClick: () => window.wnetReload?.() }
  ];
}

export function initContextMenus() {
  document.addEventListener('contextmenu', (e) => {
    const onBrowser = !!e.target.closest('#win-worldnet');
    const onDesktop = !!e.target.closest('#desktop');
    if (!onDesktop && !onBrowser) return;

    if (onBrowser) {
      e.preventDefault();
      lastTarget = e.target;
      let items = buildBrowserMenu();
      const selectedText = getSelectedText();
      if (selectedText) {
        items.push({ type: 'sep' });
        items.push({ label: 'Copy', onClick: copySelectedText });
      }
      if (e.target.matches('input,textarea')) {
        items.push({ label: 'Paste', onClick: pasteToTarget });
      }
      drawMenu(items, e.clientX, e.clientY);
      return;
    }

    // #desktop contains every CorpOS window (.ww). Only the bare desktop / icons use this menu.
    if (e.target.closest('.ww')) return;

    e.preventDefault();
    lastTarget = e.target;

    let items;
    const vfsIcon = e.target.closest('#desktop .di.custom-di');
    const vfsId = vfsIcon?.dataset?.vfsId;
    if (vfsId) {
      items = [
        { label: 'Open', onClick: () => openDesktopVfsItem(vfsId) },
        { label: 'Rename', onClick: () => void renameDesktopVfsPrompt(vfsId) },
        { type: 'sep' },
        ...buildDesktopMenu(e)
      ];
    } else {
      items = buildDesktopMenu(e);
    }
    const selectedText = getSelectedText();
    if (selectedText) {
      items.push({ type: 'sep' });
      items.push({ label: 'Copy', onClick: copySelectedText });
    }
    if (e.target.matches('input,textarea')) {
      items.push({ label: 'Paste', onClick: pasteToTarget });
    }
    drawMenu(items, e.clientX, e.clientY);
  });
}
