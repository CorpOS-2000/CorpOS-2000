/**
 * Writepad — CorpOS notepad for opening virtual text files from Explorer.
 */
import { patchState } from './gameState.js';
import { ActivityLog, LOG_PATH_NODE_ID } from '../engine/ActivityLog.js';
let inited = false;

function closeWpFileMenu() {
  const m = document.getElementById('wp-file-menu');
  if (m) {
    m.style.display = 'none';
    m.setAttribute('aria-hidden', 'true');
  }
}

export async function openWritepadBrowseForTextFile() {
  closeWpFileMenu();
  try {
    const { navigateExplorerTo } = await import('./file-explorer.js');
    navigateExplorerTo('folder-desktop');
  } catch {
    /* ignore */
  }
  window.openW?.('explorer');
  try {
    window.toast?.({
      title: 'Writepad — Open',
      message: 'Browse in My Computer. Double-click a text file or right-click → Open to load it in Writepad.',
      icon: '📝',
      autoDismiss: 7000
    });
  } catch {
    /* ignore */
  }
}

function saveWritepad() {
  const win = document.getElementById('win-writepad');
  const id = win?.dataset?.vfsFileId;
  const ta = document.getElementById('wp-body');
  const pathHint = document.getElementById('wp-path-hint');
  if (!ta) return;
  if (!id) {
    try {
      window.toast?.({
        title: 'Writepad',
        message: 'Open a text file from My Computer to save.',
        icon: '📝',
        autoDismiss: 4000
      });
    } catch {
      /* ignore */
    }
    return;
  }
  const text = ta.value;
  const fileName = pathHint?.dataset?.fileName || document.getElementById('wp-title')?.textContent || 'file';
  const folderPath = pathHint?.dataset?.pathLabel || '';

  if (id === LOG_PATH_NODE_ID) {
    ActivityLog.applyUserSavedAuditContent(text);
  } else {
    patchState((st) => {
      const row = st.virtualFs?.entries?.find((x) => x.id === id);
      if (row) {
        row.content = text;
        row.size = text.length;
        row.modified = new Date().toISOString();
      }
      return st;
    });
    const notable = folderPath.includes('SYSTEM') || /\.txt$/i.test(fileName);
    ActivityLog.log(
      'FILE_EDIT',
      `Edited: ${fileName} in ${folderPath || 'Explorer'}`,
      { notable }
    );
  }

  try {
    window.toast?.({ title: 'Writepad', message: 'File saved.', icon: '📝', autoDismiss: 3000 });
  } catch {
    /* ignore */
  }
}

export function openBlankWritepad() {
  const win = document.getElementById('win-writepad');
  const ta = document.getElementById('wp-body');
  const titleEl = document.getElementById('wp-title');
  const pathHint = document.getElementById('wp-path-hint');
  if (win) delete win.dataset.vfsFileId;
  if (ta) ta.value = '';
  if (titleEl) titleEl.textContent = 'Writepad';
  if (pathHint) {
    pathHint.textContent = '';
    delete pathHint.dataset.fileName;
    delete pathHint.dataset.pathLabel;
  }
  window.openW?.('writepad');
}

export function initWritepad() {
  if (inited) return;
  inited = true;

  if (typeof window !== 'undefined') {
    window.openBlankWritepad = openBlankWritepad;
    window.openWritepadBrowseForTextFile = openWritepadBrowseForTextFile;
  }

  const fileMi = document.getElementById('wp-mi-file');
  const fileMenu = document.getElementById('wp-file-menu');
  if (fileMi && fileMenu) {
    fileMi.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = fileMenu.style.display === 'none' || fileMenu.style.display === '';
      fileMenu.style.display = open ? 'block' : 'none';
      fileMenu.setAttribute('aria-hidden', open ? 'false' : 'true');
    });
  }
  document.getElementById('wp-menu-open')?.addEventListener('click', (e) => {
    e.stopPropagation();
    void openWritepadBrowseForTextFile();
  });
  document.addEventListener('click', () => closeWpFileMenu());

  document.getElementById('wp-save')?.addEventListener('click', () => saveWritepad());
  document.getElementById('wp-close')?.addEventListener('click', () => window.closeW?.('writepad'));
}

/**
 * @param {{ name: string, entry: object }} item — Explorer list item
 * @param {string} pathLabel — e.g. C:\CORPOS\SYSTEM
 */
export function openExplorerFileInWritepad(item, pathLabel = '') {
  const ent = item.entry;
  if (!ent || ent.kind === 'folder') return;
  const win = document.getElementById('win-writepad');
  const ta = document.getElementById('wp-body');
  const pathHint = document.getElementById('wp-path-hint');
  const titleEl = document.getElementById('wp-title');
  if (!win || !ta || !titleEl) return;

  win.dataset.vfsFileId = ent.id;
  titleEl.textContent = ent.name || 'Untitled';
  if (pathHint) {
    pathHint.textContent = pathLabel ? `${pathLabel}\\${ent.name}` : ent.name;
    pathHint.dataset.fileName = ent.name || '';
    pathHint.dataset.pathLabel = pathLabel;
  }
  ta.value = String(ent.content ?? '');
  window.openW?.('writepad');
}
