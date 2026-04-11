const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { encryptPack, decryptPack } = require('./js/content-pack-main.cjs');

if (process.env.CORPOS_NO_GPU === '1') {
  app.disableHardwareAcceleration();
}

function getDataDir() {
  return path.join(__dirname, 'data');
}

function showError(title, message) {
  const text = String(message);
  console.error(`[CorpOS] ${title}:`, text);
  try {
    if (app.isReady()) {
      dialog.showErrorBox(title, text.slice(0, 2000));
    }
  } catch (_) {
    /* dialog not available yet */
  }
}

process.on('uncaughtException', (err) => {
  showError('Main process error', err?.stack || String(err));
});

process.on('unhandledRejection', (reason) => {
  showError('Unhandled rejection', String(reason));
});

const WATCH_FILES = new Set([
  'npcs.json',
  'companies.json',
  'government.json',
  'pages-pipeline.json',
  'ads.json',
  'shops.json',
  'pages.json',
  'actors/actors.json',
  'actors/households.json',
  'actors/relationships.json',
  'generation/first_names.json',
  'generation/last_names.json',
  'generation/address_pools.json',
  'generation/phone_rules.json',
  'generation/email_domains.json',
  'generation/ssn_rules.json',
  'generation/taglet_definitions.json',
  'generation/profession_tiers.json',
  'generation/first_names_1940s_female.json',
  'lenses/lens_definitions.json',
  'events/events.json'
]);

let watchTimer = null;
let mainWindow = null;
let dataWatcher = null;

function broadcastContentChange(filename) {
  const win = mainWindow;
  if (!win) return;
  if (typeof win.isDestroyed === 'function' && win.isDestroyed()) return;
  let wc;
  try {
    wc = win.webContents;
  } catch {
    return;
  }
  if (!wc || (typeof wc.isDestroyed === 'function' && wc.isDestroyed())) return;
  const normalized = String(filename || '').replace(/\\/g, '/');
  const base = path.basename(normalized);
  if (!WATCH_FILES.has(normalized) && !WATCH_FILES.has(base)) return;
  let category = 'unknown';
  if (base === 'npcs.json') category = 'npcs';
  else if (base === 'companies.json') category = 'companies';
  else if (base === 'government.json') category = 'government';
  else if (base === 'pages-pipeline.json' || base === 'pages.json') category = 'pages';
  else if (base === 'ads.json') category = 'ads';
  else if (base === 'shops.json') category = 'shops';
  else if (normalized.startsWith('actors/') || normalized.startsWith('generation/') || normalized.startsWith('lenses/')) category = 'actors';
  else if (base === 'events.json' || normalized.startsWith('events/')) category = 'events';
  try {
    wc.send('content-file-changed', { file: normalized, category });
  } catch {
    // Window may be tearing down; ignore send failures.
  }
}

function stopDataWatch() {
  if (watchTimer) {
    clearTimeout(watchTimer);
    watchTimer = null;
  }
  if (dataWatcher) {
    try {
      dataWatcher.close();
    } catch {
      /* ignore */
    }
    dataWatcher = null;
  }
}

function startDataWatch() {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) return;
  if (dataWatcher) return;
  try {
    dataWatcher = fs.watch(dir, { persistent: true, recursive: true }, (_event, fname) => {
      if (!fname) return;
      const normalized = String(fname).replace(/\\/g, '/');
      const base = path.basename(normalized);
      if (!WATCH_FILES.has(normalized) && !WATCH_FILES.has(base)) return;
      if (watchTimer) clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        watchTimer = null;
        broadcastContentChange(normalized);
      }, 120);
    });
  } catch (e) {
    console.warn('[CorpOS] data watch failed:', e.message);
  }
}

function safeReadJson(full) {
  try {
    const t = fs.readFileSync(full, 'utf8');
    return JSON.parse(t);
  } catch {
    return null;
  }
}

function loadRegistryFromDisk(dataDir) {
  const base = dataDir || getDataDir();
  const packPath = path.join(base, 'content.pack');
  const key = process.env.CORPOS_CONTENT_KEY || '';
  if (fs.existsSync(packPath) && key) {
    try {
      const buf = fs.readFileSync(packPath);
      return decryptPack(buf, key);
    } catch (e) {
      console.warn('[CorpOS] content.pack decrypt failed:', e.message);
    }
  }
  const readArr = (name) => {
    const p = path.join(base, name);
    const j = safeReadJson(p);
    return Array.isArray(j) ? j : [];
  };
  const governmentPath = path.join(base, 'government.json');
  let government = safeReadJson(governmentPath);
  if (!government || typeof government !== 'object' || Array.isArray(government)) government = null;

  let pages = [];
  const pipelinePath = path.join(base, 'pages-pipeline.json');
  if (fs.existsSync(pipelinePath)) {
    const pp = safeReadJson(pipelinePath);
    if (Array.isArray(pp)) pages = pp;
  }

  let shops = safeReadJson(path.join(base, 'shops.json'));
  if (!Array.isArray(shops)) shops = shops ? [shops] : null;

  return {
    npcs: readArr('npcs.json'),
    companies: readArr('companies.json'),
    government,
    pages,
    ads: safeReadJson(path.join(base, 'ads.json')),
    shops
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false
    }
  });

  mainWindow = win;

  win.on('close', () => {
    if (watchTimer) {
      clearTimeout(watchTimer);
      watchTimer = null;
    }
  });

  win.once('closed', () => {
    stopDataWatch();
    if (mainWindow === win) mainWindow = null;
  });

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    if (errorCode === -3) return;
    showError(
      'Page failed to load',
      `${errorDescription} (${errorCode})\n${validatedURL}`
    );
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit') return;
    showError(
      'Renderer process exited',
      `${details.reason}${details.exitCode != null ? ` (code ${details.exitCode})` : ''}`
    );
  });

  const htmlPath = path.join(__dirname, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    showError('Missing index.html', `Expected at:\n${htmlPath}`);
    win.show();
    return;
  }

  win
    .loadFile(htmlPath)
    .catch((err) => {
      showError('loadFile failed', err?.message || String(err));
      win.show();
    });

  win.once('ready-to-show', () => {
    win.show();
  });

  if (process.env.CORPOS_DEVTOOLS === '1') {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  startDataWatch();
}

function validateDataRelativePath(rel) {
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!/^[a-zA-Z0-9_./-]+\.json$/.test(normalized)) return null;
  if (normalized.includes('..')) return null;
  return normalized;
}

ipcMain.on('app-quit', () => {
  try {
    app.quit();
  } catch {
    /* ignore */
  }
});

ipcMain.handle('load-data-file', (_, filename) => {
  const rel = validateDataRelativePath(filename);
  if (!rel) {
    throw new Error('Invalid data file name');
  }
  const full = path.join(getDataDir(), rel);
  try {
    return fs.readFileSync(full, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read ${rel}: ${e.message}`);
  }
});

ipcMain.handle('save-data-file', (_, filename, jsonString) => {
  const rel = validateDataRelativePath(filename);
  if (!rel) {
    throw new Error('Invalid data file name');
  }
  const full = path.join(getDataDir(), rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, String(jsonString), 'utf8');
  return { ok: true };
});

ipcMain.handle('get-data-dir-path', () => getDataDir());

ipcMain.handle('load-content-registry-disk', () => {
  return loadRegistryFromDisk(getDataDir());
});

ipcMain.handle('write-content-pack', (_, payload, passphrase) => {
  const dir = getDataDir();
  const buf = encryptPack(payload, passphrase || 'dev-change-me');
  const full = path.join(dir, 'content.pack');
  fs.writeFileSync(full, buf);
  return { ok: true, path: full };
});

/** Audio files in packaged assets/music (renderer merges with tracks.json). */
ipcMain.handle('list-assets-music-files', () => {
  const dir = path.join(__dirname, 'assets', 'music');
  if (!fs.existsSync(dir)) return [];
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => {
        const low = String(f).toLowerCase();
        if (low === 'tracks.json') return false;
        return /\.(mp3|ogg|opus|wav|m4a|flac)$/i.test(f);
      })
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  } catch (e) {
    console.warn('[CorpOS] list-assets-music-files:', e.message);
    return [];
  }
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
