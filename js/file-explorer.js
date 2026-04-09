import { MediaPlayer } from '../engine/MediaPlayer.js';
import { getState, patchState, isAppInstalled } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { on } from './events.js';

/** @type {string} */
let currentNodeId = 'my-computer';
/** @type {any[]} */
let lastItems = [];
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
  'folder-pictures': { label: 'My Pictures', parent: 'disk-c' }
};

const CHILDREN = {
  'my-computer': ['floppy-a', 'disk-c'],
  'disk-c': ['folder-desktop', 'folder-documents', 'folder-downloads', 'folder-videos', 'folder-pictures'],
  'folder-documents': ['folder-doc-music']
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
      items.push({
        id: e.id,
        name: e.name,
        kind: 'file',
        typeLabel: 'Text Document',
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

function openRow(item) {
  if (item.kind === 'folder') {
    currentNodeId = item.id;
    renderAll();
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
          size: src.size,
          description: src.description || ''
        });
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

function copyName(entries, parentId, base) {
  const names = new Set(entries.filter((e) => e.parentId === parentId).map((e) => e.name));
  if (!names.has(base)) return base;
  let i = 2;
  while (names.has(`${base} (${i})`)) i += 1;
  return `${base} (${i})`;
}

function showRowContext(e, item) {
  hideCtx();
  const menu = document.createElement('div');
  menu.className = 'fx-ctx';
  const isVfs = !!item.vfs;
  menu.innerHTML = `
    <button type="button" data-a="open">${item.kind === 'folder' ? 'Open' : 'Open'}</button>
    <hr />
    <button type="button" data-a="cut" ${!isVfs ? 'disabled' : ''}>Cut</button>
    <button type="button" data-a="copy" ${!isVfs ? 'disabled' : ''}>Copy</button>
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
    if (a === 'cut') cutSelection(item);
    if (a === 'copy') copySelection(item);
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
  menu.innerHTML = `
    <button type="button" data-a="paste" ${!en ? 'disabled' : ''}>Paste</button>
  `;
  menu.style.left = `${Math.min(e.clientX, window.innerWidth - 100)}px`;
  menu.style.top = `${Math.min(e.clientY, window.innerHeight - 80)}px`;
  document.body.appendChild(menu);
  ctxEl = menu;
  menu.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-a]');
    if (b?.getAttribute('data-a') === 'paste') pasteIntoTarget();
    hideCtx();
  });
  setTimeout(() => document.addEventListener('click', () => hideCtx(), { once: true }), 0);
}

function setStatus(t) {
  const el = document.getElementById('fx-sb-msg');
  if (el) el.textContent = t;
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
  if (addr) addr.textContent = breadcrumb(currentNodeId);
  if (title) title.textContent = `Exploring — ${NODES[currentNodeId]?.label || 'My Computer'}`;

  host.innerHTML = '';
  for (const item of lastItems) {
    const row = document.createElement('div');
    row.className = 'fx-row';
    if (item.gray) row.style.color = '#888';
    row.innerHTML = `<span>${escapeHtml(item.name)}</span><span>${escapeHtml(item.typeLabel)}</span><span>${escapeHtml(formatSize(item.size))}</span>`;
    row.addEventListener('dblclick', () => openRow(item));
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
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

  document.getElementById('fx-list')?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.fx-row')) return;
    e.preventDefault();
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
