const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { validateContentRegistry } = require('./validate-registry.cjs');
const { encryptPack } = require('./content-pack-main.cjs');

const DATA_FILES = [
  'npcs.json',
  'companies.json',
  'government.json',
  'pages-pipeline.json',
  'pages.json',
  'ads.json',
  'shops.json'
];

function defaultDataDir() {
  return path.join(__dirname, '..', 'data');
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'studio-settings.json');
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      dataDir: defaultDataDir(),
      contentPackKey: 'dev-change-me'
    };
  }
}

function saveSettings(s) {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf8');
}

function safeReadJson(full) {
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'));
  } catch {
    return null;
  }
}

function sanitizeAdFolderId(id) {
  const s = String(id || 'ad').replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);
  return s || 'ad';
}

function resolveAssetPath(dataDir, relativeUnix) {
  const root = path.resolve(dataDir);
  const rel = String(relativeUnix || '').replace(/\\/g, '/');
  if (!rel || rel.includes('..') || !rel.startsWith('ad-assets/')) throw new Error('Invalid asset path');
  const full = path.normalize(path.join(root, ...rel.split('/')));
  if (!full.startsWith(root + path.sep)) throw new Error('Invalid asset path');
  return full;
}

function loadRegistrySnapshot(dir) {
  const base = dir || defaultDataDir();
  const npcs = safeReadJson(path.join(base, 'npcs.json'));
  const companies = safeReadJson(path.join(base, 'companies.json'));
  const government = safeReadJson(path.join(base, 'government.json'));
  const pages = safeReadJson(path.join(base, 'pages-pipeline.json'));
  const ads = safeReadJson(path.join(base, 'ads.json'));
  let shops = safeReadJson(path.join(base, 'shops.json'));
  if (!Array.isArray(shops) && shops) shops = [shops];
  return {
    npcs: Array.isArray(npcs) ? npcs : [],
    companies: Array.isArray(companies) ? companies : [],
    government: government && typeof government === 'object' ? government : {},
    pages: Array.isArray(pages) ? pages : [],
    ads: ads || null,
    shops: Array.isArray(shops) ? shops : []
  };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#d4d0c8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    title: 'CorpOS 2000 Content Studio'
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('studio-get-settings', () => loadSettings());

ipcMain.handle('studio-set-settings', (_, partial) => {
  const cur = loadSettings();
  const next = { ...cur, ...partial };
  saveSettings(next);
  return next;
});

ipcMain.handle('studio-read-registry', () => {
  const st = loadSettings();
  return loadRegistrySnapshot(st.dataDir);
});

ipcMain.handle('studio-read-file', (_, name) => {
  const st = loadSettings();
  const base = path.basename(name);
  if (!/^[\w.-]+\.json$/.test(base)) throw new Error('Invalid file');
  const full = path.join(st.dataDir, base);
  return fs.readFileSync(full, 'utf8');
});

ipcMain.handle('studio-write-file', (_, name, content) => {
  const st = loadSettings();
  const base = path.basename(name);
  if (!/^[\w.-]+\.json$/.test(base)) throw new Error('Invalid file');
  const full = path.join(st.dataDir, base);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, String(content), 'utf8');
  return { ok: true };
});

ipcMain.handle('studio-validate', () => {
  const st = loadSettings();
  const snap = loadRegistrySnapshot(st.dataDir);
  return validateContentRegistry(snap, st.dataDir);
});

ipcMain.handle('studio-backup-zip', async () => {
  const st = loadSettings();
  const dir = st.dataDir;
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const { filePath } = await dialog.showSaveDialog({
    title: 'Save backup',
    defaultPath: `corpos-content-backup-${ts}.zip`,
    filters: [{ name: 'ZIP', extensions: ['zip'] }]
  });
  if (!filePath) return { cancelled: true };
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', () => resolve({ ok: true, bytes: archive.pointer() }));
    archive.on('error', reject);
    archive.pipe(out);
    for (const f of DATA_FILES) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) archive.file(p, { name: f });
    }
    archive.finalize();
  });
});

ipcMain.handle('studio-build-pack', (_, passphrase) => {
  const st = loadSettings();
  const snap = loadRegistrySnapshot(st.dataDir);
  const payload = {
    npcs: snap.npcs,
    companies: snap.companies,
    government: snap.government,
    pages: snap.pages,
    ads: snap.ads,
    shops: snap.shops
  };
  const buf = encryptPack(payload, passphrase || st.contentPackKey || 'dev-change-me');
  const out = path.join(st.dataDir, 'content.pack');
  fs.writeFileSync(out, buf);
  return { ok: true, path: out };
});

ipcMain.handle('studio-open-data-folder', () => {
  const st = loadSettings();
  shell.openPath(st.dataDir);
  return { ok: true };
});

ipcMain.handle('studio-pick-ad-asset', async (_, adId) => {
  const st = loadSettings();
  const safeId = sanitizeAdFolderId(adId);
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Select ad asset',
    properties: ['openFile'],
    filters: [
      { name: 'Media', extensions: ['gif', 'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'] }
    ]
  });
  if (canceled || !filePaths?.[0]) return { cancelled: true };
  const src = filePaths[0];
  const base = path.basename(src);
  const destDir = path.join(st.dataDir, 'ad-assets', safeId);
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, base);
  fs.copyFileSync(src, dest);
  const rel = path.join('ad-assets', safeId, base).split(path.sep).join('/');
  return { ok: true, relativePath: rel };
});

ipcMain.handle('studio-delete-ad-asset-folder', (_, adId) => {
  const st = loadSettings();
  const safeId = sanitizeAdFolderId(adId);
  const dir = path.join(st.dataDir, 'ad-assets', safeId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  return { ok: true };
});

ipcMain.handle('studio-asset-to-data-url', (_, relativePath) => {
  const st = loadSettings();
  const full = resolveAssetPath(st.dataDir, relativePath);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  const ext = path.extname(full).toLowerCase();
  const mime =
    {
      '.gif': 'image/gif',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm'
    }[ext] || 'application/octet-stream';
  return `data:${mime};base64,${buf.toString('base64')}`;
});
