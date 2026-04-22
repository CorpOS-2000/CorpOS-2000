import { MediaPlayer } from '../engine/MediaPlayer.js';
import { ActivityLog, LOG_PATH_NODE_ID } from '../engine/ActivityLog.js';
import { openExplorerFileInWritepad } from './writepad.js';
import { getState, patchState, isAppInstalled } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { on } from './events.js';
import { showCorpOsPrompt } from './corpos-prompt.js';

/** @type {string} */
export let currentNodeId = 'my-computer';

export function navigateExplorerTo(nodeId) {
  currentNodeId = nodeId;
  renderAll();
}
/** @type {any[]} */
let lastItems = [];
/** Hold ~½s before a list item drag starts so double-click / Open still work reliably. */
const VFS_DRAG_HOLD_MS = 500;

/** @type {{ item: object, row: HTMLElement, pointerId: number, ghost: HTMLElement | null, lastX: number, lastY: number, raf: number | null } | null} */
let vfsDrag = null;
let ctxEl = null;
const NODES = {
  'my-computer': { label: 'My Computer', parent: null },
  'floppy-a': { label: '3½ Floppy (A:)', parent: 'my-computer' },
  'disk-c': { label: 'Local Disk (C:)', parent: 'my-computer' },
  'folder-desktop': { label: 'Desktop', parent: 'disk-c' },
  'folder-documents': { label: 'My Documents', parent: 'disk-c' },
  'folder-doc-music': { label: 'Music', parent: 'folder-documents' },
  'folder-downloads': { label: 'My Downloads', parent: 'disk-c' },
  'folder-videos': { label: 'My Videos', parent: 'disk-c' },
  'folder-pictures': { label: 'My Pictures', parent: 'disk-c' },
  'folder-progfiles': { label: 'Program Files', parent: 'disk-c' },
  'folder-corpos': { label: 'CORPOS', parent: 'disk-c' },
  'folder-system': { label: 'SYSTEM', parent: 'folder-corpos' }
};

const CHILDREN = {
  'my-computer': ['floppy-a', 'disk-c'],
  'disk-c': [
    'folder-desktop',
    'folder-documents',
    'folder-downloads',
    'folder-videos',
    'folder-pictures',
    'folder-progfiles',
    'folder-corpos'
  ],
  'folder-documents': ['folder-doc-music'],
  'folder-corpos': ['folder-system']
};

const DESKTOP_SHORTCUTS = [
  { id: 'sc-herald', name: 'Daily Herald.lnk', kind: 'shortcut', open: 'herald' },
  { id: 'sc-worldnet', name: 'WorldNet Explorer.lnk', kind: 'shortcut', open: 'worldnet' },
  { id: 'sc-media', name: 'Media Player.lnk', kind: 'shortcut', open: 'media-player' },
  { id: 'sc-tasks', name: 'Task Handler.lnk', kind: 'shortcut', open: 'tasks' }
];

function formatSize(n) {
  if (n == null || n === '') return '—';
  if (typeof n === 'number') {
    if (n < 1024) return `${n} B`;
    return `${Math.round(n / 1024)} KB`;
  }
  return String(n);
}

function breadcrumb(id) {
  const parts = [];
  let p = id;
  while (p) {
    parts.unshift(NODES[p]?.label || p);
    p = NODES[p]?.parent;
  }
  return parts.join(' \\ ');
}

/** Display path like C:\\CORPOS\\SYSTEM for the address bar when under Local Disk. */
function vfsFolderPathFromId(nodeId) {
  if (NODES[nodeId]) return null;
  const entries = vfsEntries();
  let cur = nodeId;
  const names = [];
  for (let i = 0; i < 40 && cur; i++) {
    const e = entries.find((x) => x.id === cur);
    if (!e || e.kind !== 'folder') return null;
    names.unshift(e.name);
    const parent = e.parentId;
    if (NODES[parent]) return { root: parent, names };
    cur = parent;
  }
  return null;
}

function addressPathForNode(nodeId) {
  if (nodeId === 'my-computer') return 'My Computer';
  if (nodeId === 'floppy-a') return '3½ Floppy (A:)';
  const vfsPath = vfsFolderPathFromId(nodeId);
  if (vfsPath) {
    const base = addressPathForNode(vfsPath.root);
    return vfsPath.names.length ? `${base}\\${vfsPath.names.join('\\')}` : base;
  }
  const chain = [];
  let p = nodeId;
  while (p) {
    chain.unshift(p);
    p = NODES[p]?.parent;
  }
  if (!chain.includes('disk-c')) return breadcrumb(nodeId);
  const tail = chain
    .filter((id) => id !== 'my-computer' && id !== 'disk-c')
    .map((id) => NODES[id]?.label || id);
  return `C:\\${tail.join('\\')}`;
}

export function explorerAddressPathForNode(nodeId) {
  return addressPathForNode(nodeId);
}

function vfsEntries() {
  return getState().virtualFs?.entries || [];
}

function getItems(nodeId) {
  const items = [];

  if (nodeId === 'my-computer') {
    items.push({ id: 'floppy-a', name: NODES['floppy-a'].label, kind: 'folder', typeLabel: '3½ Floppy', size: '' });
    items.push({ id: 'disk-c', name: NODES['disk-c'].label, kind: 'folder', typeLabel: 'Local Disk', size: '' });
    return items;
  }

  if (nodeId === 'floppy-a') {
    items.push({
      id: 'empty-a',
      name: '(Empty)',
      kind: 'static',
      typeLabel: '—',
      size: '',
      gray: true
    });
    return items;
  }

  if (nodeId === 'disk-c') {
    for (const fid of CHILDREN['disk-c']) {
      items.push({
        id: fid,
        name: NODES[fid].label,
        kind: 'folder',
        typeLabel: 'File Folder',
        size: ''
      });
    }
    return items;
  }

  if (nodeId === 'folder-corpos') {
    items.push({
      id: 'folder-system',
      name: NODES['folder-system'].label,
      kind: 'folder',
      typeLabel: 'File Folder',
      size: ''
    });
    return items;
  }

  if (nodeId === 'folder-desktop') {
    const st = getState();
    for (const sc of DESKTOP_SHORTCUTS) {
      if (sc.open === 'media-player' && !isAppInstalled('media-player', st)) continue;
      items.push({
        id: sc.id,
        name: sc.name,
        kind: 'shortcut',
        typeLabel: 'Shortcut',
        size: '1 KB',
        open: sc.open
      });
    }
  }

  if (nodeId === 'folder-documents') {
    items.push({
      id: 'folder-doc-music',
      name: NODES['folder-doc-music'].label,
      kind: 'folder',
      typeLabel: 'File Folder',
      size: ''
    });
  }

  if (nodeId === 'folder-doc-music') {
    let trackCount = 0;
    const tracks =
      typeof MediaPlayer.getLibraryTracks === 'function' ? MediaPlayer.getLibraryTracks() : [];
    for (const t of tracks) {
      trackCount += 1;
      const fn = (t.filename || '').trim();
      const ext = fn.includes('.') ? fn.match(/\.[^.]+$/)?.[0] || '.mp3' : '.mp3';
      items.push({
        id: `music-${t.id}`,
        trackId: t.id,
        name: `${t.type === 'imported' ? '[IMP] ' : ''}${fn || `${t.title}${ext}`}`,
        kind: 'track',
        typeLabel: 'Audio file',
        size: '—'
      });
    }
    if (!trackCount) {
      items.push({
        id: 'folder-doc-music-empty',
        name: 'No tracks — add assets/music/tracks.json or unlock tracks in Media Player',
        kind: 'static',
        typeLabel: 'Information',
        size: '',
        gray: true
      });
    }
  }

  for (const e of vfsEntries()) {
    if (e.parentId === nodeId) {
      const k = e.kind === 'folder' ? 'folder' : 'file';
      items.push({
        id: e.id,
        name: e.name,
        kind: k,
        typeLabel: e.typeLabel || (k === 'folder' ? 'File Folder' : 'Text Document'),
        size: e.size,
        vfs: true,
        entry: e
      });
    }
  }

  if (['folder-downloads', 'folder-videos', 'folder-pictures'].includes(nodeId)) {
    const hasListed =
      items.filter((x) => x.kind === 'file' || x.kind === 'folder' || x.kind === 'track').length > 0;
    if (!hasListed) {
      items.push({
        id: `${nodeId}-placeholder`,
        name: 'No files yet — reserved for CorpOS projects',
        kind: 'static',
        typeLabel: 'Information',
        size: '0 B',
        gray: true
      });
    }
  }

  return items;
}

function hideCtx() {
  ctxEl?.remove();
  ctxEl = null;
}

function ensureClipboardShape(s) {
  if (!s.explorerClipboard) s.explorerClipboard = { mode: null, items: [] };
  if (!Array.isArray(s.explorerClipboard.items)) s.explorerClipboard.items = [];
}

function vfsFileLooksLikeAudio(item) {
  const n = (item.name || '').toLowerCase();
  return /\.(mp3|wav|ogg|m4a|flac)$/i.test(n);
}

function vfsFileLooksBinary(item) {
  const n = (item.name || '').toLowerCase();
  return /\.(exe|dll|dat|sys|com|bin|ocx|drv)$/i.test(n);
}

function openRow(item) {
  if (item.kind === 'folder') {
    currentNodeId = item.id;
    renderAll();
    return;
  }
  if (item.kind === 'file' && item.vfs && item.entry) {
    if (vfsFileLooksLikeAudio(item)) {
      window.openW?.('media-player');
      try {
        window.toast?.({
          title: 'Media Player',
          message: 'Use the library in My Documents → Music to play tracks.',
          icon: '🎵',
          autoDismiss: 5000
        });
      } catch {
        /* ignore */
      }
      return;
    }
    if (vfsFileLooksBinary(item)) {
      try {
        window.toast?.({
          title: 'My Computer',
          message: `'${item.name}' is not a recognized file type or the program needed to open it is not available.`,
          icon: '⚠',
          autoDismiss: 5000
        });
      } catch { /* ignore */ }
      return;
    }
    openExplorerFileInWritepad(item, addressPathForNode(currentNodeId));
    return;
  }
  if (item.kind === 'shortcut' && item.open) {
    window.openW?.(item.open);
    return;
  }
  if (item.kind === 'track' && item.trackId) {
    window.GameSystems?.mediaPlayer?.play?.(item.trackId);
    window.openW?.('media-player');
    return;
  }
}

function isSystemEntry(entry) {
  return !!(entry?.system || entry?.readonly);
}

function deleteVfsEntry(item) {
  if (!item?.vfs || !item.entry) return;
  if (isSystemEntry(item.entry)) {
    try { window.toast?.({ title: 'Access Denied', message: 'This is a protected system file and cannot be deleted.', icon: '🛑', autoDismiss: 5000 }); } catch { /* ignore */ }
    return;
  }
  const eid = item.entry.id;
  const name = item.entry.name || item.name;
  if (eid === LOG_PATH_NODE_ID) {
    ActivityLog.recordAuditFileDeletionEvent();
  } else {
    ActivityLog.log('FILE_DELETE', `Deleted: ${name}`, {
      suspicious: /AUDITLOG/i.test(name) || item.entry?.system === true
    });
  }
  patchState((st) => {
    if (!st.virtualFs?.entries) return st;
    const remove = new Set([eid]);
    if (item.kind === 'folder') {
      let added = true;
      while (added) {
        added = false;
        for (const e of st.virtualFs.entries) {
          if (!remove.has(e.id) && remove.has(e.parentId)) {
            remove.add(e.id);
            added = true;
          }
        }
      }
    }
    st.virtualFs.entries = st.virtualFs.entries.filter((x) => !remove.has(x.id));
    return st;
  });
  renderAll();
}

function isFolderTarget(nodeId) {
  return (
    nodeId.startsWith('folder-') ||
    nodeId === 'disk-c' ||
    nodeId === 'floppy-a' ||
    nodeId === 'my-computer'
  );
}

function canPasteInto(nodeId) {
  return nodeId.startsWith('folder-') || nodeId === 'folder-desktop';
}

function cutSelection(vfsItem) {
  if (!vfsItem?.vfs) return;
  patchSession((s) => {
    ensureClipboardShape(s);
    s.explorerClipboard.mode = 'cut';
    s.explorerClipboard.items = [{ id: vfsItem.id, parentId: vfsItem.entry.parentId }];
  });
  setStatus('Cut: ' + vfsItem.name);
}

function copySelection(vfsItem) {
  if (!vfsItem?.vfs) return;
  patchSession((s) => {
    ensureClipboardShape(s);
    s.explorerClipboard.mode = 'copy';
    s.explorerClipboard.items = [{ id: vfsItem.id, parentId: vfsItem.entry.parentId }];
  });
  setStatus('Copied: ' + vfsItem.name);
}

function pasteIntoTarget() {
  const cb = getSessionState().explorerClipboard;
  if (!cb?.items?.length || !canPasteInto(currentNodeId)) return;

  const target = currentNodeId;
  const mode = cb.mode;
  if (mode !== 'cut' && mode !== 'copy') return;

  patchState((st) => {
    const entries = st.virtualFs.entries;
    if (mode === 'cut') {
      for (const ref of cb.items) {
        const e = entries.find((x) => x.id === ref.id);
        if (e) e.parentId = target;
      }
    } else {
      for (const ref of cb.items) {
        const src = entries.find((x) => x.id === ref.id);
        if (!src) continue;
        const nid = `vf-${st.virtualFs.nextSeq++}`;
        entries.push({
          id: nid,
          parentId: target,
          name: copyName(entries, target, src.name),
          kind: src.kind || 'file',
          typeLabel: src.typeLabel,
          size: src.size,
          content: src.content,
          description: src.description || '',
          system: src.system,
          readonly: src.readonly,
          created: src.created,
          modified: new Date().toISOString()
        });
        const destPath = addressPathForNode(target);
        ActivityLog.log('FILE_COPY', `Copied: ${src.name} to ${destPath}`);
      }
    }
    return st;
  });

  if (mode === 'cut') {
    patchSession((s) => {
      ensureClipboardShape(s);
      s.explorerClipboard.mode = null;
      s.explorerClipboard.items = [];
    });
  }
  setStatus('Pasted');
  renderAll();
}

export function uniqueVfsChildName(entries, parentId, base) {
  const names = new Set(entries.filter((e) => e.parentId === parentId).map((e) => e.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

function copyName(entries, parentId, base) {
  return uniqueVfsChildName(entries, parentId, base);
}

function vfsEntryRenamable(ent) {
  if (!ent) return false;
  if (ent.system) return false;
  if (ent.kind === 'folder') return true;
  const n = (ent.name || '').toLowerCase();
  return /\.(txt|log|md)$/i.test(n) || String(ent.typeLabel || '').toLowerCase().includes('text');
}

async function promptRenameVfsEntry(ent) {
  if (!vfsEntryRenamable(ent)) return;
  const next = await showCorpOsPrompt({
    title: 'Rename',
    label: 'New name:',
    defaultValue: ent.name || ''
  });
  if (next == null) return;
  const trimmed = String(next).trim();
  if (!trimmed || trimmed === ent.name) return;
  patchState((st) => {
    const row = st.virtualFs?.entries?.find((x) => x.id === ent.id);
    if (row) row.name = trimmed;
    return st;
  });
  renderAll();
}

function createVfsItemInNode(nodeId, kind) {
  if (!canPasteInto(nodeId)) return;
  const isFolder = kind === 'folder';
  const baseName = isFolder ? 'New Folder' : 'New Text Document.txt';
  patchState((st) => {
    const entries = st.virtualFs.entries;
    const name = uniqueVfsChildName(entries, nodeId, baseName);
    const nid = `vf-${st.virtualFs.nextSeq++}`;
    const row = {
      id: nid,
      parentId: nodeId,
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
    return st;
  });
  setStatus(isFolder ? 'Created folder' : 'Created text document');
  renderAll();
}

function moveVfsEntryToParent(entryId, newParentId) {
  if (!canPasteInto(newParentId)) return;
  const st = getState();
  const ent = st.virtualFs?.entries?.find((x) => x.id === entryId);
  if (!ent) return;
  if (ent.parentId === newParentId) return;
  if (ent.id === newParentId) return;
  let p = newParentId;
  const entries = st.virtualFs.entries;
  for (let i = 0; i < 50 && p; i++) {
    if (p === entryId) return;
    const row = entries.find((x) => x.id === p);
    p = row?.parentId;
  }
  patchState((draft) => {
    const row = draft.virtualFs.entries.find((x) => x.id === entryId);
    if (!row) return draft;
    row.parentId = newParentId;
    row.name = uniqueVfsChildName(draft.virtualFs.entries, newParentId, row.name);
    row.modified = new Date().toISOString();
    return draft;
  });
  setStatus('Moved');
  renderAll();
}

function showRowContext(e, item) {
  hideCtx();
  const menu = document.createElement('div');
  menu.className = 'fx-ctx';
  const isVfs = !!item.vfs;
  const isSys = isVfs && isSystemEntry(item.entry);
  const showRename = isVfs && !isSys && vfsEntryRenamable(item.entry);
  menu.innerHTML = `
    <button type="button" data-a="open">${item.kind === 'folder' ? 'Open' : 'Open'}</button>
    <button type="button" data-a="rename" ${!showRename ? 'disabled' : ''}>Rename</button>
    <hr />
    <button type="button" data-a="cut" ${!isVfs || isSys ? 'disabled' : ''}>Cut</button>
    <button type="button" data-a="copy" ${!isVfs ? 'disabled' : ''}>Copy</button>
    <button type="button" data-a="delete" ${!isVfs || isSys ? 'disabled' : ''}>Delete</button>
    <button type="button" data-a="paste" ${!canPasteInto(currentNodeId) ? 'disabled' : ''}>Paste</button>
    <hr />
    <button type="button" data-a="prop">Properties</button>
  `;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 170)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 200)}px`;
  document.body.appendChild(menu);
  ctxEl = menu;
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-a]');
    if (!b || b.disabled) return;
    const a = b.getAttribute('data-a');
    if (a === 'open') openRow(item);
    if (a === 'rename') void promptRenameVfsEntry(item.entry);
    if (a === 'cut') cutSelection(item);
    if (a === 'copy') copySelection(item);
    if (a === 'delete') deleteVfsEntry(item);
    if (a === 'paste') pasteIntoTarget();
    if (a === 'prop') {
      let msg;
      if (item.kind === 'track' && item.trackId) {
        const t = MediaPlayer.getTrackById?.(item.trackId);
        msg = t
          ? `Title: ${t.title}\nArtist: ${t.artist}\nAlbum: ${t.album || '—'}\nDuration: ${t.duration || '—'}\nType: ${t.type}`
          : item.name;
      } else if (item.vfs) {
        msg = `${item.name}\n${item.entry?.description || ''}\nSize: ${formatSize(item.size)}`;
      } else {
        msg = `${item.name}\nType: ${item.typeLabel}`;
      }
      window.alert?.(msg);
    }
    hideCtx();
  });
  setTimeout(() => document.addEventListener('click', () => hideCtx(), { once: true }), 0);
}

function showBlankContext(e) {
  hideCtx();
  const menu = document.createElement('div');
  menu.className = 'fx-ctx';
  const en = canPasteInto(currentNodeId) && (getSessionState().explorerClipboard?.items?.length || 0) > 0;
  const mk = canPasteInto(currentNodeId);
  menu.innerHTML = `
    <button type="button" data-a="new-folder" ${!mk ? 'disabled' : ''}>New Folder</button>
    <button type="button" data-a="new-text" ${!mk ? 'disabled' : ''}>New Text Document</button>
    <hr />
    <button type="button" data-a="paste" ${!en ? 'disabled' : ''}>Paste</button>
  `;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 100)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 80)}px`;
  document.body.appendChild(menu);
  ctxEl = menu;
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-a]');
    const a = b?.getAttribute('data-a');
    if (a === 'paste') pasteIntoTarget();
    if (a === 'new-folder') createVfsItemInNode(currentNodeId, 'folder');
    if (a === 'new-text') createVfsItemInNode(currentNodeId, 'text');
    hideCtx();
  });
  setTimeout(() => document.addEventListener('click', () => hideCtx(), { once: true }), 0);
}

function setStatus(t) {
  const el = document.getElementById('fx-sb-msg');
  if (el) el.textContent = t;
}

function endVfsDrag() {
  const d = vfsDrag;
  if (!d) return;
  if (d.raf) {
    cancelAnimationFrame(d.raf);
    d.raf = null;
  }
  document.querySelectorAll('.fx-row.fx-row--drop-target').forEach((r) => r.classList.remove('fx-row--drop-target'));
  try {
    if (d.row && d.pointerId != null) d.row.releasePointerCapture(d.pointerId);
  } catch {
    /* ignore */
  }
  d.row?.classList.remove('fx-row--drag-source');
  d.ghost?.remove();
  vfsDrag = null;
}

function highlightFolderDropTarget(x, y) {
  const host = document.getElementById('fx-list');
  document.querySelectorAll('.fx-row.fx-row--drop-target').forEach((r) => r.classList.remove('fx-row--drop-target'));
  if (!host) return;
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    const row = el.closest?.('.fx-row');
    if (!row || !host.contains(row)) continue;
    const idx = row.dataset.fxItemIndex;
    if (idx == null) continue;
    const it = lastItems[Number(idx)];
    if (it && it.kind === 'folder' && canPasteInto(it.id)) {
      row.classList.add('fx-row--drop-target');
      break;
    }
  }
}

function attemptVfsDrop(drag, x, y) {
  const dragId = drag.item.id;
  const host = document.getElementById('fx-list');
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    const row = el.closest?.('.fx-row');
    if (!row || !host?.contains(row)) continue;
    const idx = row.dataset.fxItemIndex;
    if (idx == null) continue;
    const it = lastItems[Number(idx)];
    if (!it || it.kind !== 'folder' || !canPasteInto(it.id)) continue;
    moveVfsEntryToParent(dragId, it.id);
    return;
  }
}

function bindVfsRowPointerDrag(row, item) {
  row.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    let timer = null;
    let cancelled = false;
    const startX = e.clientX;
    const startY = e.clientY;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const cleanup = () => {
      clearTimer();
      row.removeEventListener('pointermove', onMove);
      row.removeEventListener('pointerup', onUp);
      row.removeEventListener('pointercancel', onUp);
    };

    const onMove = (ev) => {
      if (vfsDrag?.row === row) {
        vfsDrag.lastX = ev.clientX;
        vfsDrag.lastY = ev.clientY;
        if (!vfsDrag.raf) {
          vfsDrag.raf = requestAnimationFrame(() => {
            vfsDrag.raf = null;
            if (!vfsDrag?.ghost) return;
            vfsDrag.ghost.style.left = `${vfsDrag.lastX + 12}px`;
            vfsDrag.ghost.style.top = `${vfsDrag.lastY + 8}px`;
            highlightFolderDropTarget(vfsDrag.lastX, vfsDrag.lastY);
          });
        }
        return;
      }
      if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) > 10) {
        cancelled = true;
        clearTimer();
      }
    };

    const onUp = () => {
      if (vfsDrag?.row === row) {
        attemptVfsDrop(vfsDrag, vfsDrag.lastX, vfsDrag.lastY);
        endVfsDrag();
      }
      cleanup();
    };

    timer = setTimeout(() => {
      if (cancelled || vfsDrag) return;
      hideCtx();
      vfsDrag = {
        item,
        row,
        pointerId: e.pointerId,
        ghost: null,
        lastX: e.clientX,
        lastY: e.clientY,
        raf: null
      };
      try {
        row.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      row.classList.add('fx-row--drag-source');
      const ghost = document.createElement('div');
      ghost.className = 'fx-drag-ghost';
      ghost.textContent = item.name || 'File';
      document.body.appendChild(ghost);
      vfsDrag.ghost = ghost;
      ghost.style.left = `${e.clientX + 12}px`;
      ghost.style.top = `${e.clientY + 8}px`;
    }, VFS_DRAG_HOLD_MS);

    row.addEventListener('pointermove', onMove);
    row.addEventListener('pointerup', onUp);
    row.addEventListener('pointercancel', onUp);
  });
}

let winRef = null;
let treeDelegationBound = false;

function updateTreeRowSelection() {
  const host = document.getElementById('fx-tree');
  if (!host) return;
  host.querySelectorAll('.fx-tree-row').forEach((row) => {
    row.classList.toggle('is-sel', row.dataset.nodeId === currentNodeId);
  });
}

function bindTreeDelegationOnce() {
  const host = document.getElementById('fx-tree');
  if (!host || treeDelegationBound) return;
  treeDelegationBound = true;
  const pick = (e) => {
    if (e.button != null && e.button !== 0) return;
    const row = e.target.closest('.fx-tree-row');
    if (!row || !host.contains(row)) return;
    const id = row.dataset.nodeId;
    if (!id) return;
    e.preventDefault();
    e.stopPropagation();
    currentNodeId = id;
    updateTreeRowSelection();
    renderList();
  };
  host.addEventListener('mousedown', pick, true);
}

function renderTree() {
  const host = document.getElementById('fx-tree');
  if (!host) return;
  host.innerHTML = '';

  function build(id, depth) {
    const wrap = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'fx-tree-row';
    row.dataset.nodeId = id;
    row.style.paddingLeft = `${4 + depth * 10}px`;
    row.textContent = id === 'my-computer' ? 'My Computer' : NODES[id]?.label || id;
    wrap.appendChild(row);
    const kids = CHILDREN[id];
    if (kids) {
      const sub = document.createElement('div');
      sub.className = 'fx-tree-sub';
      for (const k of kids) sub.appendChild(build(k, depth + 1));
      wrap.appendChild(sub);
    }
    return wrap;
  }

  host.appendChild(build('my-computer', 0));
  bindTreeDelegationOnce();
  updateTreeRowSelection();
}

function renderList() {
  const host = document.getElementById('fx-list');
  const addr = document.getElementById('fx-addr');
  const title = document.getElementById('fx-win-title');
  if (!host) return;

  lastItems = getItems(currentNodeId);
  if (addr) addr.textContent = addressPathForNode(currentNodeId);
  const vfsFolderEnt = vfsEntries().find((e) => e.id === currentNodeId && e.kind === 'folder');
  const placeLabel = NODES[currentNodeId]?.label || vfsFolderEnt?.name;
  if (title) title.textContent = `Exploring — ${placeLabel || 'My Computer'}`;

  host.innerHTML = '';
  for (let i = 0; i < lastItems.length; i++) {
    const item = lastItems[i];
    const row = document.createElement('div');
    row.className = 'fx-row';
    if (item.gray) row.style.color = '#888';
    row.dataset.fxItemIndex = String(i);
    row.innerHTML = `<span>${escapeHtml(item.name)}</span><span>${escapeHtml(item.typeLabel)}</span><span>${escapeHtml(formatSize(item.size))}</span>`;
    row.addEventListener('click', (ev) => {
      host.querySelectorAll('.fx-row.is-sel').forEach((r) => r.classList.remove('is-sel'));
      row.classList.add('is-sel');
      if (ev.detail === 2) {
        ev.preventDefault();
        openRow(item);
      }
    });
    const canDragVfs = item.vfs && item.entry && !item.entry.system;
    if (canDragVfs) {
      bindVfsRowPointerDrag(row, item);
    }
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showRowContext(e, item);
    });
    host.appendChild(row);
  }

  setStatus(`${lastItems.length} object(s)`);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderAll() {
  renderTree();
  renderList();
}

export async function initFileExplorer(loadJsonFile) {
  winRef = document.getElementById('win-explorer');
  await ensureVirtualFsSeeded(loadJsonFile);
  ActivityLog.init();

  document.getElementById('fx-list')?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.fx-row')) return;
    e.preventDefault();
    e.stopPropagation();
    showBlankContext(e);
  });

  on('stateChanged', () => {
    if (winRef?.style.display !== 'none') renderAll();
  });

  MediaPlayer.subscribe(() => {
    if (winRef && winRef.style.display !== 'none') renderList();
  });

  renderAll();
}

async function ensureVirtualFsSeeded(loadJsonFile) {
  const st = getState();
  if ((st.virtualFs?.entries || []).length > 0) return;
  try {
    const data = await loadJsonFile('virtual-folders.json');
    const rows = data?.userFiles || [];
    if (!rows.length) return;
    patchState((s) => {
      for (const r of rows) {
        s.virtualFs.entries.push({
          id: r.id,
          parentId: r.parentId,
          name: r.name,
          kind: 'file',
          size: r.size || 0,
          description: r.description || ''
        });
      }
      return s;
    });
  } catch (err) {
    console.warn('[Explorer] virtual-folders.json', err);
  }
}
