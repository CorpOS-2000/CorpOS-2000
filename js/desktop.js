import { getSessionState, patchSession } from './sessionState.js';
import { getState, isAppInstalled } from './gameState.js';
import { isInstallableApp } from './installable-apps.js';

const WALLPAPER_COLORS = ['#008080', '#004c8c', '#1f3f1f', '#3b2f5c', '#6b3a1e', '#202020'];

/** Grid cell for overlap / auto-layout (icons are ~80px + label). */
const ICON_SLOT_W = 100;
const ICON_SLOT_H = 92;

let drag = null;

function desktopEl() {
  return document.getElementById('desktop');
}

function clampToDesktop(x, y, icon) {
  const d = desktopEl();
  if (!d || !icon) return { x, y };
  const rect = d.getBoundingClientRect();
  const maxX = Math.max(0, rect.width - icon.offsetWidth - 8);
  const maxY = Math.max(0, rect.height - icon.offsetHeight - 8);
  return {
    x: Math.min(Math.max(8, x), maxX),
    y: Math.min(Math.max(8, y), maxY)
  };
}

function applyIconPosition(icon, x, y) {
  icon.style.left = `${Math.round(x)}px`;
  icon.style.top = `${Math.round(y)}px`;
}

function iconIdFor(el, idx) {
  const appId = el.getAttribute('data-app-id');
  if (appId) {
    el.dataset.iconId = `app-${appId}`;
    return el.dataset.iconId;
  }
  if (!el.dataset.iconId) {
    el.dataset.iconId = `desktop-${idx + 1}`;
  }
  return el.dataset.iconId;
}

function persistPosition(icon) {
  const id = icon.dataset.iconId;
  if (!id) return;
  const x = parseInt(icon.style.left, 10) || 8;
  const y = parseInt(icon.style.top, 10) || 8;
  patchSession((s) => {
    s.desktop.positions[id] = { x, y };
  });
}

function iconEligible(el) {
  if (!el?.classList?.contains('di')) return false;
  if (el.style.display === 'none') return false;
  return true;
}

function iconBox(el) {
  const left = parseInt(el.style.left, 10) || 8;
  const top = parseInt(el.style.top, 10) || 8;
  return { left, top, right: left + ICON_SLOT_W, bottom: top + ICON_SLOT_H };
}

function boxesOverlap(a, b, pad = 4) {
  return !(
    a.right + pad <= b.left ||
    a.left - pad >= b.right ||
    a.bottom + pad <= b.top ||
    a.top - pad >= b.bottom
  );
}

function resolveDraggedIconOverlap(moved) {
  const d = desktopEl();
  if (!d || !moved) return;
  const all = [...d.querySelectorAll('#desktop .di')].filter(iconEligible);
  const others = all.filter((o) => o !== moved);
  let self = iconBox(moved);
  if (!others.some((o) => boxesOverlap(self, iconBox(o)))) return;

  const rect = d.getBoundingClientRect();
  const startX = 16;
  const startY = 16;
  const cols = Math.max(1, Math.floor((rect.width - startX - 12) / ICON_SLOT_W));
  const rows = Math.max(1, Math.floor((rect.height - startY - 40) / ICON_SLOT_H));
  const taken = new Set();
  for (const o of others) {
    const b = iconBox(o);
    const c = Math.round(Math.max(0, b.left - startX) / ICON_SLOT_W);
    const r = Math.round(Math.max(0, b.top - startY) / ICON_SLOT_H);
    taken.add(`${c},${r}`);
  }
  let bc = Math.max(0, Math.min(cols - 1, Math.round((self.left - startX) / ICON_SLOT_W)));
  let br = Math.max(0, Math.min(rows - 1, Math.round((self.top - startY) / ICON_SLOT_H)));

  const tryPlace = (c, r) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows) return false;
    if (taken.has(`${c},${r}`)) return false;
    const p = clampToDesktop(startX + c * ICON_SLOT_W, startY + r * ICON_SLOT_H, moved);
    applyIconPosition(moved, p.x, p.y);
    return true;
  };

  if (tryPlace(bc, br)) return;
  for (let dist = 1; dist <= Math.max(cols, rows); dist++) {
    for (let dc = -dist; dc <= dist; dc++) {
      for (let dr = -dist; dr <= dist; dr++) {
        if (Math.abs(dc) !== dist && Math.abs(dr) !== dist) continue;
        if (tryPlace(bc + dc, br + dr)) return;
      }
    }
  }
}

export function organizeDesktopIcons() {
  const d = desktopEl();
  if (!d) return;
  const icons = [...d.querySelectorAll('#desktop .di')].filter(iconEligible);
  if (!icons.length) return;
  const rect = d.getBoundingClientRect();
  const startX = 16;
  const startY = 16;
  const cols = Math.max(1, Math.floor((rect.width - startX - 12) / ICON_SLOT_W));
  icons.sort((a, b) => {
    const ta = parseInt(a.style.top, 10) || 0;
    const tb = parseInt(b.style.top, 10) || 0;
    if (ta !== tb) return ta - tb;
    return (parseInt(a.style.left, 10) || 0) - (parseInt(b.style.left, 10) || 0);
  });
  icons.forEach((icon, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const p = clampToDesktop(startX + col * ICON_SLOT_W, startY + row * ICON_SLOT_H, icon);
    applyIconPosition(icon, p.x, p.y);
    persistPosition(icon);
  });
}

/**
 * Place newly shown installable-app icons into the first free grid slots without moving
 * existing icons. Scan is column-major (down column 0, then column 1, …) to match a
 * left-aligned stacking layout and natural “fill the gap” behavior.
 * @param {HTMLElement[]} newIcons Elements that just became visible
 */
function placeNewInstallableIconsAtFirstGap(newIcons) {
  const d = desktopEl();
  if (!d || !newIcons.length) return;
  const rect = d.getBoundingClientRect();
  const startX = 16;
  const startY = 16;
  const cols = Math.max(1, Math.floor((rect.width - startX - 12) / ICON_SLOT_W));
  const rows = Math.max(1, Math.floor((rect.height - startY - 40) / ICON_SLOT_H));
  const newSet = new Set(newIcons);
  const occupied = new Set();
  const all = [...d.querySelectorAll('#desktop .di')].filter(iconEligible);
  for (const el of all) {
    if (newSet.has(el)) continue;
    const b = iconBox(el);
    let c = Math.round((b.left - startX) / ICON_SLOT_W);
    let r = Math.round((b.top - startY) / ICON_SLOT_H);
    c = Math.max(0, Math.min(cols - 1, c));
    r = Math.max(0, Math.min(rows - 1, r));
    occupied.add(`${c},${r}`);
  }
  newIcons.forEach((icon, i) => {
    iconIdFor(icon, 1000 + i);
    const st = getSessionState();
    const id = icon.dataset.iconId;
    const saved = id && st.desktop.positions[id];
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const p = clampToDesktop(saved.x, saved.y, icon);
      applyIconPosition(icon, p.x, p.y);
      let c = Math.round((p.x - startX) / ICON_SLOT_W);
      let r = Math.round((p.y - startY) / ICON_SLOT_H);
      c = Math.max(0, Math.min(cols - 1, c));
      r = Math.max(0, Math.min(rows - 1, r));
      occupied.add(`${c},${r}`);
      return;
    }
    let placed = false;
    for (let c = 0; c < cols && !placed; c++) {
      for (let r = 0; r < rows && !placed; r++) {
        const key = `${c},${r}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        const p = clampToDesktop(startX + c * ICON_SLOT_W, startY + r * ICON_SLOT_H, icon);
        applyIconPosition(icon, p.x, p.y);
        persistPosition(icon);
        placed = true;
      }
    }
  });
}

function hydrateExistingIcons() {
  const icons = [...document.querySelectorAll('#desktop .di')];
  const st = getSessionState();
  icons.forEach((el, i) => {
    const id = iconIdFor(el, i);
    const saved = st.desktop.positions[id];
    if (saved) applyIconPosition(el, saved.x, saved.y);
  });
}

export function refreshInstallableAppVisibility() {
  const stateObj = getState();
  /** @type {HTMLElement[]} */
  const newlyVisible = [];
  document.querySelectorAll('[data-app-id]').forEach((el) => {
    const appId = el.getAttribute('data-app-id') || '';
    if (!isInstallableApp(appId)) return;
    const show = isAppInstalled(appId, stateObj);
    const next = show ? '' : 'none';
    const wasHidden = el.style.display === 'none';
    el.style.display = next;
    if (next === '' && wasHidden) newlyVisible.push(el);
  });
  if (newlyVisible.length) {
    requestAnimationFrame(() => placeNewInstallableIconsAtFirstGap(newlyVisible));
  }
}

function beginDrag(e) {
  const icon = e.target.closest('#desktop .di');
  if (!icon || e.button !== 0) return;
  const left = parseInt(icon.style.left, 10) || icon.offsetLeft || 8;
  const top = parseInt(icon.style.top, 10) || icon.offsetTop || 8;
  drag = {
    icon,
    sx: e.clientX,
    sy: e.clientY,
    left,
    top,
    moved: false
  };
}

function onMove(e) {
  if (!drag) return;
  const dx = e.clientX - drag.sx;
  const dy = e.clientY - drag.sy;
  if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
  const p = clampToDesktop(drag.left + dx, drag.top + dy, drag.icon);
  applyIconPosition(drag.icon, p.x, p.y);
}

function endDrag() {
  if (!drag) return;
  resolveDraggedIconOverlap(drag.icon);
  persistPosition(drag.icon);
  drag = null;
}

function makeCustomIcon(kind, x, y) {
  const id = `custom-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const icon = kind === 'folder' ? '📁' : '📄';
  const label = kind === 'folder' ? 'New Folder' : 'New Text Document';
  return { id, kind, icon, label, x, y };
}

function renderCustomIcons() {
  document.querySelectorAll('#desktop .di.custom-di').forEach((el) => el.remove());
  const d = desktopEl();
  if (!d) return;
  const st = getSessionState();
  for (const ci of st.desktop.customIcons) {
    const el = document.createElement('div');
    el.className = 'di custom-di';
    el.dataset.iconId = ci.id;
    el.style.left = `${ci.x}px`;
    el.style.top = `${ci.y}px`;
    el.innerHTML = `<div class="ico">${ci.icon}</div><div class="lbl">${ci.label}</div>`;
    d.appendChild(el);
  }
}

function openWallpaperDialog() {
  let overlay = document.getElementById('wallpaper-dialog');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wallpaper-dialog';
    overlay.className = 'wallpaper-dialog is-hidden';
    overlay.innerHTML = `
      <div class="wallpaper-panel">
        <div class="wallpaper-title">Desktop Wallpaper</div>
        <div class="wallpaper-grid"></div>
        <div class="wallpaper-actions">
          <button type="button" data-wallpaper-close>Close</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.hasAttribute('data-wallpaper-close')) {
        overlay.classList.add('is-hidden');
      }
    });
    const grid = overlay.querySelector('.wallpaper-grid');
    for (const color of WALLPAPER_COLORS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wall-swatch';
      btn.style.background = color;
      btn.title = color;
      btn.addEventListener('click', () => {
        patchSession((s) => {
          s.desktop.wallpaper = color;
        });
        applyWallpaper();
      });
      grid?.appendChild(btn);
    }
  }
  overlay.classList.remove('is-hidden');
}

function applyWallpaper() {
  const d = desktopEl();
  if (!d) return;
  const color = getSessionState().desktop.wallpaper || '#008080';
  d.style.backgroundColor = color;
}

function createDesktopItem(kind, x, y) {
  const d = desktopEl();
  if (!d) return;
  const proto = document.createElement('div');
  proto.className = 'di';
  proto.style.left = `${x}px`;
  proto.style.top = `${y}px`;
  d.appendChild(proto);
  const p = clampToDesktop(x, y, proto);
  proto.remove();
  const entry = makeCustomIcon(kind, p.x, p.y);
  patchSession((s) => {
    s.desktop.customIcons.push(entry);
    s.desktop.positions[entry.id] = { x: entry.x, y: entry.y };
  });
  renderCustomIcons();
}

export function desktopContextActions(x, y) {
  return {
    openWallpaperDialog,
    createFolder: () => createDesktopItem('folder', x, y),
    createTextDocument: () => createDesktopItem('text', x, y)
  };
}

export function initDesktopSystem() {
  const d = desktopEl();
  if (!d) return;
  hydrateExistingIcons();
  renderCustomIcons();
  applyWallpaper();
  refreshInstallableAppVisibility();

  d.addEventListener('mousedown', beginDrag);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', endDrag);
}
