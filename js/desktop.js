import { getSessionState, patchSession } from './sessionState.js';
import { getState, isAppInstalled, patchState } from './gameState.js';
import { isInstallableApp } from './installable-apps.js';
import { openExplorerFileInWritepad } from './writepad.js';
import {
  navigateExplorerTo,
  uniqueVfsChildName,
  explorerAddressPathForNode
} from './file-explorer.js';
import { on } from './events.js';
import { showCorpOsPrompt } from './corpos-prompt.js';

const WALLPAPER_COLORS = ['#008080', '#004c8c', '#1f3f1f', '#3b2f5c', '#6b3a1e', '#202020'];

const DESKTOP_PARENT_ID = 'folder-desktop';

/** Movement beyond this many pixels from mousedown turns a click into a drag. */
const DRAG_THRESHOLD_PX = 5;
/** Two clicks on the same icon within this window count as a double-click. */
const DBLCLICK_MS = 400;

/** Grid cell for overlap / auto-layout (icons are ~80px + label). */
const ICON_SLOT_W = 100;
const ICON_SLOT_H = 92;

/*
 * Unified desktop icon interaction state machine.
 *
 * States:
 *   IDLE          — nothing happening
 *   PRESSED       — mousedown on an icon; waiting to see drag vs click vs dblclick
 *   DRAGGING      — icon is following the cursor
 *
 * Transitions:
 *   IDLE  →  mousedown on icon          →  PRESSED
 *   PRESSED → mousemove > threshold     →  DRAGGING
 *   PRESSED → mouseup (2nd click <400ms on same icon) → fire open → IDLE
 *   PRESSED → mouseup (otherwise)       → single-click select → IDLE
 *   DRAGGING → mouseup                  → drop icon → IDLE
 */

/** @type {{ icon: HTMLElement, offsetX: number, offsetY: number, startLeft: number, startTop: number, rafId: number | null, pendingX: number, pendingY: number } | null} */
let drag = null;

/** @type {{ icon: HTMLElement, sx: number, sy: number } | null} */
let pressed = null;

/** Last successful single-click: used to detect the second click for double-click. */
let lastClick = { icon: null, time: 0 };
let pendingCustomIconRender = false;
/** Last vfs snapshot used to skip `stateChanged` work on every sim clock tick (~60/s). */
let __desktopVfsRenderSig = '';
/** rAF chain waiting for #desktop.show + non-zero layout (avoid grid math while display:none). */
let __desktopLayoutWaitRaf = null;

function desktopEl() {
  return document.getElementById('desktop');
}

/** True once the desktop surface is visible and measured — grid layout is meaningless before this. */
function isDesktopLaidOut() {
  const d = desktopEl();
  if (!d || !d.classList.contains('show')) return false;
  const r = d.getBoundingClientRect();
  return r.width > 120 && r.height > 120;
}

function queueRefreshDesktopWhenVisible() {
  if (__desktopLayoutWaitRaf != null) return;
  let attempts = 0;
  const step = () => {
    __desktopLayoutWaitRaf = null;
    if (isDesktopLaidOut()) {
      refreshDesktopLayoutFromSession();
      return;
    }
    attempts++;
    if (attempts > 720) return;
    __desktopLayoutWaitRaf = requestAnimationFrame(step);
  };
  __desktopLayoutWaitRaf = requestAnimationFrame(step);
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
  const open = el.getAttribute('data-open');
  if (open) {
    el.dataset.iconId = `open-${open}`;
    return el.dataset.iconId;
  }
  const slot = el.getAttribute('data-icon-slot');
  if (slot) {
    el.dataset.iconId = `slot-${slot}`;
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

/** Same ordering as save sync — must exclude `display:none` icons or indices drift vs stored keys. */
function eligibleDesktopIcons() {
  const d = desktopEl();
  if (!d) return [];
  return [...d.querySelectorAll('#desktop .di')].filter(iconEligible);
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

/**
 * Push icons apart until no pair overlaps (grid-based nudge).
 * @param {{ persist?: boolean }} [opts] persist=false only adjusts DOM (e.g. before save sync).
 */
export function resolveAllDesktopOverlaps(opts = {}) {
  const persist = opts.persist !== false;
  if (!isDesktopLaidOut()) return;
  const icons = eligibleDesktopIcons();
  let anyOverlap = false;
  for (let i = 0; i < icons.length; i++) {
    const bi = iconBox(icons[i]);
    for (let j = i + 1; j < icons.length; j++) {
      if (boxesOverlap(bi, iconBox(icons[j]))) {
        anyOverlap = true;
        break;
      }
    }
    if (anyOverlap) break;
  }
  if (anyOverlap) {
    const maxPasses = Math.max(24, icons.length * 6);
    for (let pass = 0; pass < maxPasses; pass++) {
      let movedAny = false;
      for (const icon of icons) {
        const self = iconBox(icon);
        if (!icons.some((o) => o !== icon && boxesOverlap(self, iconBox(o)))) continue;
        resolveDraggedIconOverlap(icon);
        movedAny = true;
      }
      if (!movedAny) break;
    }
  }
  if (persist) {
    patchSession((s) => {
      s.desktop = s.desktop || { wallpaper: '#008080', customIcons: [], positions: {} };
      if (!s.desktop.positions || typeof s.desktop.positions !== 'object') s.desktop.positions = {};
      for (let i = 0; i < icons.length; i++) {
        const el = icons[i];
        const id = iconIdFor(el, i);
        const x = parseInt(el.style.left, 10) || 8;
        const y = parseInt(el.style.top, 10) || 8;
        s.desktop.positions[id] = { x, y };
      }
    });
  }
}

function resolveDraggedIconOverlap(moved) {
  const d = desktopEl();
  if (!d || !moved) return;
  const all = eligibleDesktopIcons();
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
  if (!d || !isDesktopLaidOut()) return;
  const icons = eligibleDesktopIcons();
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
  if (!d || !newIcons.length || !isDesktopLaidOut()) return;
  const rect = d.getBoundingClientRect();
  const startX = 16;
  const startY = 16;
  const cols = Math.max(1, Math.floor((rect.width - startX - 12) / ICON_SLOT_W));
  const rows = Math.max(1, Math.floor((rect.height - startY - 40) / ICON_SLOT_H));
  const newSet = new Set(newIcons);
  const occupied = new Set();
  const all = eligibleDesktopIcons();
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
  resolveAllDesktopOverlaps({ persist: true });
}

/** Copy `desktop-{n}` entries to stable ids (`open-*`, `slot-*`, `app-*`) after ID scheme change. */
function migrateLegacyDesktopPositionKeys() {
  const icons = eligibleDesktopIcons();
  if (!icons.length) return;
  patchSession((s) => {
    s.desktop = s.desktop || { wallpaper: '#008080', customIcons: [], positions: {} };
    const pos = s.desktop.positions;
    if (!pos || typeof pos !== 'object') return;
    icons.forEach((el, i) => {
      const newId = iconIdFor(el, i);
      const legacy = `desktop-${i + 1}`;
      if (pos[newId] == null && pos[legacy] != null) {
        const t = pos[legacy];
        if (Number.isFinite(t.x) && Number.isFinite(t.y)) pos[newId] = { x: t.x, y: t.y };
      }
      const openId = el.getAttribute('data-open');
      if (openId && newId && !String(newId).startsWith('open-')) {
        const openKey = `open-${openId}`;
        if (pos[newId] == null && pos[openKey] != null) {
          const t = pos[openKey];
          if (Number.isFinite(t.x) && Number.isFinite(t.y)) pos[newId] = { x: t.x, y: t.y };
        }
      }
    });
  });
}

/**
 * Resolve a saved {x,y} for a desktop icon. Supports legacy `desktop-{n}` and older saves
 * that keyed installable apps as `open-*` while the DOM now prefers `app-*` when both
 * `data-app-id` and `data-open` are present.
 */
function lookupSavedIconPosition(pos, el, primaryId, domIndex) {
  if (!pos || typeof pos !== 'object') return null;
  const pick = (key) => {
    if (!key) return null;
    const s = pos[key];
    return s && Number.isFinite(s.x) && Number.isFinite(s.y) ? s : null;
  };

  let saved = pick(primaryId);
  if (saved) return saved;

  if (!String(primaryId).startsWith('desktop-')) {
    saved = pick(`desktop-${domIndex + 1}`);
    if (saved) return saved;
  }

  const openId = el.getAttribute('data-open');
  if (openId) {
    saved = pick(`open-${openId}`);
    if (saved) return saved;
  }
  const appId = el.getAttribute('data-app-id');
  if (appId) {
    saved = pick(`app-${appId}`);
    if (saved) return saved;
  }
  return null;
}

function hydrateExistingIcons() {
  const icons = eligibleDesktopIcons();
  const st = getSessionState();
  const pos = st.desktop?.positions;
  icons.forEach((el, i) => {
    const id = iconIdFor(el, i);
    const saved = lookupSavedIconPosition(pos, el, id, i);
    if (saved) {
      const p = clampToDesktop(saved.x, saved.y, el);
      applyIconPosition(el, p.x, p.y);
    }
  });
}

function hasMeaningfulSavedDesktopLayout() {
  const st = getSessionState();
  const pos = st.desktop?.positions;
  if (!pos || typeof pos !== 'object' || !Object.keys(pos).length) return false;
  const icons = eligibleDesktopIcons();
  for (let i = 0; i < icons.length; i++) {
    const el = icons[i];
    const id = iconIdFor(el, i);
    const saved = lookupSavedIconPosition(pos, el, id, i);
    if (saved) return true;
  }
  return false;
}

/** Writes every visible desktop .di position into session (call before save). */
export function syncDesktopIconPositionsToSession() {
  const d = desktopEl();
  if (!d) return;
  resolveAllDesktopOverlaps({ persist: false });
  const icons = eligibleDesktopIcons();
  patchSession((s) => {
    s.desktop = s.desktop || { wallpaper: '#008080', customIcons: [], positions: {} };
    if (!s.desktop.positions || typeof s.desktop.positions !== 'object') s.desktop.positions = {};
    for (let i = 0; i < icons.length; i++) {
      const el = icons[i];
      const id = iconIdFor(el, i);
      const x = parseInt(el.style.left, 10) || 8;
      const y = parseInt(el.style.top, 10) || 8;
      s.desktop.positions[id] = { x, y };
    }
  });
}

/** Re-apply session desktop layout to the DOM (after SaveManager.hydrate / login). */
export function refreshDesktopLayoutFromSession() {
  migrateLegacyDesktopPositionKeys();
  hydrateExistingIcons();
  if (!isDesktopLaidOut()) {
    queueRefreshDesktopWhenVisible();
    return;
  }
  if (!hasMeaningfulSavedDesktopLayout()) {
    organizeDesktopIcons();
  }
  migrateLegacyCustomIcons();
  renderCustomIcons();
  applyWallpaper();
  refreshInstallableAppVisibility();
  resolveAllDesktopOverlaps({ persist: true });
}

export function refreshInstallableAppVisibility() {
  const stateObj = getState();
  /** @type {HTMLElement[]} */
  const newlyVisible = [];
  document.querySelectorAll('#desktop [data-app-id], #smenu [data-app-id]').forEach((el) => {
    const appId = el.getAttribute('data-app-id') || '';
    if (!isInstallableApp(appId)) return;
    const show = isAppInstalled(appId, stateObj);
    const next = show ? '' : 'none';
    const wasHidden = el.style.display === 'none';
    el.style.display = next;
    if (next === '' && wasHidden && el.classList.contains('di')) newlyVisible.push(el);
  });
  if (newlyVisible.length) {
    requestAnimationFrame(() => placeNewInstallableIconsAtFirstGap(newlyVisible));
  }
}

/* ── Interaction: open an icon (double-click or programmatic) ────────── */

function openIcon(icon) {
  const appId = icon.dataset.open || icon.getAttribute('data-open');
  if (appId) {
    window.openW?.(appId);
    return;
  }
  const vfsId = icon.dataset.vfsId;
  if (vfsId) {
    openDesktopVfsItem(vfsId);
  }
}

/* ── Interaction: select (highlight) ────────────────────────────────── */

function selectIcon(icon) {
  const d = desktopEl();
  if (!d) return;
  d.querySelectorAll('#desktop .di.di-selected').forEach((el) => el.classList.remove('di-selected'));
  icon.classList.add('di-selected');
}

function clearSelection() {
  desktopEl()?.querySelectorAll('#desktop .di.di-selected').forEach((el) => el.classList.remove('di-selected'));
}

function flushDeferredCustomIconRender() {
  if (!pendingCustomIconRender) return;
  if (drag || pressed) return;
  pendingCustomIconRender = false;
  renderCustomIcons();
  resolveAllDesktopOverlaps({ persist: true });
}

/* ── Interaction: state machine handlers ────────────────────────────── */

function onIconMouseDown(e) {
  const icon = e.target.closest('#desktop .di');
  if (!icon || e.button !== 0) return;

  e.preventDefault();
  pressed = { icon, sx: e.clientX, sy: e.clientY };
}

function onDocMouseMove(e) {
  if (drag) {
    drag.pendingX = e.clientX;
    drag.pendingY = e.clientY;
    // Apply on every move event so icon movement stays tightly synced to cursor.
    flushDragFrame();
    return;
  }

  if (!pressed) return;

  const dx = e.clientX - pressed.sx;
  const dy = e.clientY - pressed.sy;
  if (Math.abs(dx) <= DRAG_THRESHOLD_PX && Math.abs(dy) <= DRAG_THRESHOLD_PX) return;

  const icon = pressed.icon;
  const iconLeft = parseInt(icon.style.left, 10) || icon.offsetLeft || 8;
  const iconTop = parseInt(icon.style.top, 10) || icon.offsetTop || 8;

  drag = {
    icon,
    offsetX: pressed.sx - iconLeft,
    offsetY: pressed.sy - iconTop,
    startLeft: iconLeft,
    startTop: iconTop,
    rafId: null,
    pendingX: e.clientX,
    pendingY: e.clientY
  };
  pressed = null;
  lastClick = { icon: null, time: 0 };

  icon.classList.add('di-dragging');
  selectIcon(icon);

  drag.rafId = requestAnimationFrame(flushDragFrame);
}

function flushDragFrame() {
  if (!drag) return;
  drag.rafId = null;
  const x = drag.pendingX - drag.offsetX;
  const y = drag.pendingY - drag.offsetY;
  const p = clampToDesktop(x, y, drag.icon);
  applyIconPosition(drag.icon, p.x, p.y);
}

function onDocMouseUp(e) {
  if (e.button !== 0) return;

  if (drag) {
    if (drag.rafId != null) cancelAnimationFrame(drag.rafId);
    flushDragFrame();
    drag.icon.classList.remove('di-dragging');
    resolveDraggedIconOverlap(drag.icon);
    persistPosition(drag.icon);
    resolveAllDesktopOverlaps({ persist: true });
    drag = null;
    flushDeferredCustomIconRender();
    return;
  }

  if (!pressed) return;

  const icon = pressed.icon;
  pressed = null;

  const now = performance.now();
  if (lastClick.icon === icon && (now - lastClick.time) < DBLCLICK_MS) {
    lastClick = { icon: null, time: 0 };
    clearSelection();
    openIcon(icon);
    flushDeferredCustomIconRender();
    return;
  }

  lastClick = { icon, time: now };
  selectIcon(icon);
  flushDeferredCustomIconRender();
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function vfsDesktopEntries() {
  return (getState().virtualFs?.entries || []).filter((e) => e.parentId === DESKTOP_PARENT_ID);
}

/** Identity + label of desktop vfs rows — changes only when shortcuts are added/removed/renamed. */
function vfsDesktopSignature() {
  const parts = vfsDesktopEntries().map((e) => `${e.id}\x1f${String(e.name || '')}`);
  parts.sort();
  return parts.join('\n');
}

function renderCustomIcons() {
  document.querySelectorAll('#desktop .di.custom-di').forEach((el) => el.remove());
  const d = desktopEl();
  if (!d) {
    __desktopVfsRenderSig = vfsDesktopSignature();
    return;
  }
  const st = getSessionState();
  for (const ent of vfsDesktopEntries()) {
    const el = document.createElement('div');
    el.className = 'di custom-di';
    el.dataset.iconId = ent.id;
    el.dataset.vfsId = ent.id;
    const saved = st.desktop.positions[ent.id];
    const x = Number.isFinite(saved?.x) ? saved.x : 8;
    const y = Number.isFinite(saved?.y) ? saved.y : 8;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    const icon = ent.kind === 'folder' ? '📁' : '📄';
    el.innerHTML = `<div class="ico">${icon}</div><div class="lbl">${escapeHtml(ent.name)}</div>`;
    d.appendChild(el);
  }
  __desktopVfsRenderSig = vfsDesktopSignature();
}

function migrateLegacyCustomIcons() {
  const legacy = getSessionState().desktop?.customIcons;
  if (!Array.isArray(legacy) || !legacy.length) return;
  const toPlace = [...legacy];
  patchSession((s) => {
    s.desktop.customIcons = [];
  });
  const posUpdates = [];
  patchState((s) => {
    for (const ci of toPlace) {
      const isFolder = ci.kind === 'folder';
      const baseName = isFolder ? 'New Folder' : 'New Text Document.txt';
      const name = uniqueVfsChildName(s.virtualFs.entries, DESKTOP_PARENT_ID, baseName);
      const nid = `vf-${s.virtualFs.nextSeq++}`;
      const row = {
        id: nid,
        parentId: DESKTOP_PARENT_ID,
        name,
        kind: isFolder ? 'folder' : 'file',
        typeLabel: isFolder ? 'File Folder' : 'Text Document',
        size: isFolder ? '' : 0,
        description: '',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      };
      if (!isFolder) row.content = '';
      s.virtualFs.entries.push(row);
      posUpdates.push({ nid, x: ci.x, y: ci.y, oldId: ci.id });
    }
    return s;
  });
  patchSession((se) => {
    for (const p of posUpdates) {
      se.desktop.positions[p.nid] = { x: p.x, y: p.y };
      if (p.oldId) delete se.desktop.positions[p.oldId];
    }
  });
}

export function openDesktopVfsItem(vfsId) {
  const ent = getState().virtualFs?.entries?.find((x) => x.id === vfsId);
  if (!ent) return;
  if (ent.kind === 'folder') {
    window.openW?.('explorer');
    navigateExplorerTo(ent.id);
    return;
  }
  const path = explorerAddressPathForNode(ent.parentId);
  openExplorerFileInWritepad({ name: ent.name, entry: ent }, path);
}

export async function renameDesktopVfsPrompt(vfsId) {
  const ent = getState().virtualFs?.entries?.find((x) => x.id === vfsId);
  if (!ent || ent.system) return;
  if (ent.kind !== 'folder' && !/\.(txt|log|md)$/i.test(ent.name || '')) return;
  const next = await showCorpOsPrompt({
    title: 'Rename',
    label: 'New name:',
    defaultValue: ent.name || ''
  });
  if (next == null) return;
  const trimmed = String(next).trim();
  if (!trimmed || trimmed === ent.name) return;
  patchState((st) => {
    const row = st.virtualFs?.entries?.find((x) => x.id === vfsId);
    if (row) row.name = trimmed;
    return st;
  });
  renderCustomIcons();
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
  let newId = '';
  patchState((s) => {
    const entries = s.virtualFs.entries;
    const isFolder = kind === 'folder';
    const baseName = isFolder ? 'New Folder' : 'New Text Document.txt';
    const name = uniqueVfsChildName(entries, DESKTOP_PARENT_ID, baseName);
    const nid = `vf-${s.virtualFs.nextSeq++}`;
    newId = nid;
    const row = {
      id: nid,
      parentId: DESKTOP_PARENT_ID,
      name,
      kind: isFolder ? 'folder' : 'file',
      typeLabel: isFolder ? 'File Folder' : 'Text Document',
      size: isFolder ? '' : 0,
      description: '',
      created: new Date().toISOString(),
      modified: new Date().toISOString()
    };
    if (!isFolder) row.content = '';
    entries.push(row);
    return s;
  });
  patchSession((s) => {
    s.desktop.positions[newId] = { x: p.x, y: p.y };
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
  refreshDesktopLayoutFromSession();

  on('stateChanged', () => {
    if (drag || pressed) {
      pendingCustomIconRender = true;
      return;
    }
    if (!isDesktopLaidOut()) return;
    const sig = vfsDesktopSignature();
    if (sig === __desktopVfsRenderSig) return;
    renderCustomIcons();
    resolveAllDesktopOverlaps({ persist: true });
  });

  d.addEventListener('mousedown', onIconMouseDown);
  d.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#desktop .di')) clearSelection();
  });
  document.addEventListener('mousemove', onDocMouseMove);
  document.addEventListener('mouseup', onDocMouseUp);
}
