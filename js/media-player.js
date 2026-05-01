import { MediaPlayer, formatTime, parseDurationToSec } from '../engine/MediaPlayer.js';
import { getState, patchState } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { on } from './events.js';
import { toast, TOAST_KEYS } from './toast.js';

let vizCanvas = null;
let vizCtx = null;
let vizRaf = null;
let vizCaps = [];
let vizHeights = [];
let vizBarCount = 20;
const VIZ_GAP = 1;
let pauseDropStart = null;
let lastUnlockSet = new Set();
let radarSweep = 0;
let matrixColState = [];
const MATRIX_CHARS = 'ｱｲｳｴｵｶｷｸｹｺサシスセソタチツテトニヌネノハヒ010101';
const VIZ_MODE_OPTIONS = [
  { id: 'bars', label: 'Classic bars (pixel EQ)' },
  { id: 'waveform', label: 'Waveform' },
  { id: 'scope', label: 'Oscilloscope' },
  { id: 'matrix', label: 'Matrix rain' },
  { id: 'radar', label: 'Radar sweep' }
];
let vizModeMenuEl = null;

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hideVizModeMenu() {
  if (vizModeMenuEl) {
    vizModeMenuEl.remove();
    vizModeMenuEl = null;
  }
}

function ensureBarArrays(n) {
  if (vizBarCount === n && vizHeights.length === n) return;
  vizBarCount = n;
  vizCaps = Array(n).fill(0);
  vizHeights = Array(n).fill(0);
}

function initVisualizer(canvas) {
  vizCanvas = canvas;
  vizCtx = canvas.getContext('2d');
  vizBarCount = 20;
  vizCaps = Array(vizBarCount).fill(0);
  vizHeights = Array(vizBarCount).fill(0);
}

function drawVisualizerBars(w, h, playing, override, rand, t) {
  /** Fill ~94% of canvas width (classic EQ reads wider than other modes’ self-scaling). */
  const sidePad = Math.max(3, Math.floor(w * 0.03));
  const usableW = Math.max(40, w - 2 * sidePad);
  let VIZ_CELL = Math.max(3, Math.min(6, Math.floor(usableW / 70)));
  let nBars = Math.floor((usableW + VIZ_GAP) / (VIZ_CELL + VIZ_GAP));
  nBars = Math.min(72, Math.max(28, nBars));
  ensureBarArrays(nBars);
  const barSlot = VIZ_CELL + VIZ_GAP;
  const totalBarW = nBars * barSlot - VIZ_GAP;
  const startX = Math.max(0, (w - totalBarW) / 2);
  const maxRows = Math.floor((h - 4) / barSlot);

  if (!playing && !override) {
    if (pauseDropStart == null) pauseDropStart = performance.now();
    const elapsed = (performance.now() - pauseDropStart) / 1000;
    const k = Math.min(1, elapsed / 2);
    for (let i = 0; i < nBars; i++) {
      vizHeights[i] *= 1 - k * 0.08;
      if (k >= 1) vizHeights[i] = 0;
      vizCaps[i] *= 1 - k * 0.05;
    }
  } else {
    pauseDropStart = null;
    for (let i = 0; i < nBars; i++) {
      const n = rand() * 0.7 + rand() * 0.3;
      const target = playing ? Math.floor(n * maxRows * 0.95) : 0;
      vizHeights[i] += (target - vizHeights[i]) * (override ? 0.12 : 0.28);
      if (vizHeights[i] > vizCaps[i]) vizCaps[i] = vizHeights[i];
      else vizCaps[i] = Math.max(vizHeights[i], vizCaps[i] - (override ? 0.08 : 0.15));
    }
  }

  for (let i = 0; i < nBars; i++) {
    const colH = Math.round(vizHeights[i]);
    const capRow = Math.round(vizCaps[i]);
    const x0 = startX + i * barSlot;

    for (let r = 0; r < colH; r++) {
      const y = h - 2 - (r + 1) * barSlot;
      const ratio = colH <= 1 ? 1 : r / (colH - 1);
      const c0 = override ? '#3a0000' : '#1a3a8f';
      const c1 = override ? '#cc0000' : '#a6b5e7';
      const rr = ratio;
      const R = Math.round(parseInt(c0.slice(1, 3), 16) * (1 - rr) + parseInt(c1.slice(1, 3), 16) * rr);
      const G = Math.round(parseInt(c0.slice(3, 5), 16) * (1 - rr) + parseInt(c1.slice(3, 5), 16) * rr);
      const B = Math.round(parseInt(c0.slice(5, 7), 16) * (1 - rr) + parseInt(c1.slice(5, 7), 16) * rr);
      vizCtx.fillStyle = `rgb(${R},${G},${B})`;
      vizCtx.fillRect(x0, y, VIZ_CELL, VIZ_CELL);
    }

    if (capRow > colH) {
      const y = h - 2 - (capRow + 1) * barSlot + VIZ_GAP;
      vizCtx.fillStyle = '#fff';
      vizCtx.fillRect(x0, y, VIZ_CELL, VIZ_CELL);
    }
  }
}

function drawVisualizerWaveform(w, h, playing, override, rand, t) {
  const slow = override ? 0.35 : 1;
  const tt = t * slow;
  const base = override ? '#ff6666' : '#a6b5e7';
  const fill = override ? 'rgba(120,0,0,0.35)' : 'rgba(26,58,143,0.35)';
  vizCtx.lineWidth = 2;
  vizCtx.strokeStyle = base;
  const amp = (playing ? h * 0.38 : h * 0.06) * (override ? 1 : 1);
  const waveY = (x) => {
    const p = x / w;
    return (
      h * 0.52 +
      amp *
        (0.55 * Math.sin(p * Math.PI * 10 + tt * 7) +
          0.25 * Math.sin(p * Math.PI * 22 + tt * 13 + 1.2) +
          0.15 * Math.sin(p * Math.PI * 5 - tt * 4) +
          (playing ? (rand() - 0.5) * 0.08 : 0))
    );
  };
  vizCtx.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = waveY(x);
    if (x === 0) vizCtx.moveTo(x, y);
    else vizCtx.lineTo(x, y);
  }
  vizCtx.stroke();
  vizCtx.beginPath();
  vizCtx.moveTo(0, h);
  for (let x = 0; x <= w; x += 2) {
    vizCtx.lineTo(x, waveY(x));
  }
  vizCtx.lineTo(w, h);
  vizCtx.closePath();
  vizCtx.fillStyle = fill;
  vizCtx.fill();
}

function drawVisualizerScope(w, h, playing, override, rand, t) {
  const slow = override ? 0.35 : 1;
  const tt = t * slow;
  const traces = 3;
  vizCtx.lineWidth = 1.5;
  for (let tr = 0; tr < traces; tr++) {
    const hue = override ? 0 + tr * 18 : 215 + tr * 12;
    vizCtx.strokeStyle = override ? `hsla(${hue},85%,${55 + tr * 8}%,0.85)` : `hsla(${hue},65%,${72 - tr * 6}%,0.9)`;
    vizCtx.beginPath();
    for (let x = 0; x <= w; x += 2) {
      const ph = tr * 1.7 + tt * (3 + tr);
      const yy =
        h * 0.5 +
        (playing ? h * 0.35 : h * 0.05) *
          Math.sin(x * 0.04 + ph) *
          Math.cos(x * 0.017 + ph * 0.6 + tr) *
          (0.75 + 0.25 * rand());
      if (x === 0) vizCtx.moveTo(x, yy);
      else vizCtx.lineTo(x, yy);
    }
    vizCtx.stroke();
  }
}

function drawVisualizerMatrix(w, h, playing, override, t) {
  const colW = 10;
  const cols = Math.max(8, Math.ceil(w / colW));
  if (matrixColState.length !== cols) {
    matrixColState = Array.from({ length: cols }, () => ({
      y: Math.random() * h,
      speed: 1.5 + Math.random() * 4
    }));
  }
  const head = override ? '#cfc' : '#e8ffe8';
  const mid = override ? '#3a3' : '#7fdb98';
  const tail = override ? '#050' : '#1a5a30';
  vizCtx.font = `${Math.max(8, Math.min(11, Math.floor(colW * 0.95)))}px Consolas, monospace`;
  vizCtx.textBaseline = 'top';
  const speedMul = playing ? 1.35 : 0.4;
  for (let i = 0; i < cols; i++) {
    const col = matrixColState[i];
    const x = i * colW;
    for (let k = 0; k < 14; k++) {
      const yy = (col.y - k * colW * 0.85) % (h + 40);
      const py = yy < 0 ? yy + h + 40 : yy;
      if (py < -5 || py > h + 5) continue;
      const ch = MATRIX_CHARS[(i * 13 + k * 3 + Math.floor(t * 12 * speedMul)) % MATRIX_CHARS.length];
      vizCtx.fillStyle = k === 0 ? head : k < 4 ? mid : tail;
      vizCtx.globalAlpha = k === 0 ? 1 : 0.35 + (0.5 * (14 - k)) / 14;
      vizCtx.fillText(ch, x + 1, py);
    }
    col.y += col.speed * speedMul;
    vizCtx.globalAlpha = 1;
  }
}

function drawVisualizerRadar(w, h, playing, override, t) {
  const cx = w * 0.5;
  const cy = h * 0.52;
  const maxR = Math.min(w, h) * 0.48;
  radarSweep += playing ? 0.055 : 0.018;
  const grid = override ? 'rgba(255,80,80,0.2)' : 'rgba(120,160,255,0.22)';
  vizCtx.strokeStyle = grid;
  vizCtx.lineWidth = 1;
  for (let r = 16; r < maxR; r += 20) {
    vizCtx.beginPath();
    vizCtx.arc(cx, cy, r, 0, Math.PI * 2);
    vizCtx.stroke();
  }
  const beam = override ? 'rgba(255,150,120,0.92)' : 'rgba(200,220,255,0.92)';
  vizCtx.strokeStyle = beam;
  vizCtx.lineWidth = 2;
  vizCtx.beginPath();
  vizCtx.moveTo(cx, cy);
  vizCtx.lineTo(cx + Math.cos(radarSweep) * maxR, cy + Math.sin(radarSweep) * maxR);
  vizCtx.stroke();
  const wipe = override ? 'rgba(80,0,0,0.12)' : 'rgba(30,50,100,0.14)';
  vizCtx.fillStyle = wipe;
  vizCtx.beginPath();
  vizCtx.moveTo(cx, cy);
  vizCtx.arc(cx, cy, maxR, radarSweep - 0.85, radarSweep + 0.05);
  vizCtx.closePath();
  vizCtx.fill();
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + t * 0.12 + i * 0.7;
    const dist = 28 + ((Math.sin(i * 2.3 + t * 3) + 1) * 0.5) * (maxR - 36);
    const bx = cx + Math.cos(ang) * dist;
    const by = cy + Math.sin(ang) * dist;
    let da = radarSweep - ang;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    if (Math.abs(da) > 0.55) continue;
    vizCtx.fillStyle = override ? 'rgba(255,200,200,0.95)' : 'rgba(255,255,255,0.9)';
    vizCtx.beginPath();
    vizCtx.arc(bx, by, playing ? 4 : 2.5, 0, Math.PI * 2);
    vizCtx.fill();
  }
}

function drawVisualizer() {
  if (!vizCtx || !vizCanvas) return;
  const w = vizCanvas.width;
  const h = vizCanvas.height;
  const override = MediaPlayer.isOverride;
  const bg = override ? '#3a0000' : '#0d1a3a';
  vizCtx.fillStyle = bg;
  vizCtx.fillRect(0, 0, w, h);

  const playing = !MediaPlayer.audio?.paused || (MediaPlayer.isOverride && !MediaPlayer.overrideAudio?.paused);
  const slow = override ? 0.35 : 1;
  const t = performance.now() * 0.001 * slow;
  const rand = mulberry32(Math.floor(t * 12) + 1337);
  const mode = getState().mediaPlayer?.vizMode || 'bars';

  switch (mode) {
    case 'waveform':
      drawVisualizerWaveform(w, h, playing, override, rand, t);
      break;
    case 'scope':
      drawVisualizerScope(w, h, playing, override, rand, t);
      break;
    case 'matrix':
      drawVisualizerMatrix(w, h, playing, override, t);
      break;
    case 'radar':
      drawVisualizerRadar(w, h, playing, override, t);
      break;
    case 'bars':
    default:
      drawVisualizerBars(w, h, playing, override, rand, t);
  }

  vizRaf = requestAnimationFrame(drawVisualizer);
}

function startVisualizer() {
  if (vizRaf) return;
  drawVisualizer();
}

function stopVisualizer() {
  if (vizRaf) cancelAnimationFrame(vizRaf);
  vizRaf = null;
}

let sortKey = 'idx';
let sortDir = 1;
let filterFav = false;
let ctxMenuEl = null;
let ctxTrackId = null;
let shellCtxEl = null;

function hideShellCtx() {
  if (shellCtxEl) {
    shellCtxEl.remove();
    shellCtxEl = null;
  }
  hideVizModeMenu();
}

function getSortedLibrary() {
  let list = MediaPlayer.getLibraryTracks();
  if (filterFav) list = list.filter((t) => MediaPlayer.isFavorite(t.id));
  const mul = sortDir;
  list = [...list].sort((a, b) => {
    let va;
    let vb;
    if (sortKey === 'time') {
      va = parseDurationToSec(a.duration);
      vb = parseDurationToSec(b.duration);
    } else if (sortKey === 'idx') {
      va = a._libraryOrder ?? 0;
      vb = b._libraryOrder ?? 0;
    } else if (sortKey === 'fav') {
      va = MediaPlayer.isFavorite(a.id) ? 1 : 0;
      vb = MediaPlayer.isFavorite(b.id) ? 1 : 0;
    } else {
      va = String(a[sortKey] ?? '').toLowerCase();
      vb = String(b[sortKey] ?? '').toLowerCase();
    }
    if (va < vb) return -1 * mul;
    if (va > vb) return 1 * mul;
    return 0;
  });
  return list;
}

function hideCtx() {
  if (ctxMenuEl) {
    ctxMenuEl.remove();
    ctxMenuEl = null;
  }
  ctxTrackId = null;
  hideVizModeMenu();
}

function showProperties(track) {
  const back = document.createElement('div');
  back.className = 'mp-modal-back';
  const m = document.createElement('div');
  m.className = 'mp-modal';
  m.innerHTML = `
    <div class="mp-modal-h">Properties</div>
    <div class="mp-modal-b">
      <div class="prow"><span>Title</span><b>${escapeHtml(track.title)}</b></div>
      <div class="prow"><span>Artist</span><b>${escapeHtml(track.artist)}</b></div>
      <div class="prow"><span>Album</span><b>${escapeHtml(track.album || '—')}</b></div>
      <div class="prow"><span>Duration</span><b>${escapeHtml(track.duration || '')}</b></div>
      <div class="prow"><span>Type</span><b>${escapeHtml(track.type || '')}</b></div>
      <div class="prow"><span>File</span><b>${escapeHtml(track.objectUrl ? '(imported)' : track.filename || '—')}</b></div>
    </div>
    <div class="mp-modal-f"><button type="button" class="mp-ok">OK</button></div>
  `;
  back.appendChild(m);
  document.body.appendChild(back);
  const close = () => back.remove();
  m.querySelector('.mp-ok')?.addEventListener('click', close);
  back.addEventListener('mousedown', (e) => {
    if (e.target === back) close();
  });
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wireDom(win) {
  const vizWrap = win.querySelector('.mp-viz-wrap');
  const viz = win.querySelector('.mp-viz');
  if (viz) {
    viz.width = 360;
    viz.height = 200;
    initVisualizer(viz);
    startVisualizer();
  }

  const $ = (sel) => win.querySelector(sel);

  const elTitle = $('#mp-title');
  const elArtist = $('#mp-artist');
  const elAlbum = $('#mp-album');
  const elSeek = $('#mp-seek');
  const elSeekFill = $('#mp-seek-fill');
  const elTimeL = $('#mp-time-l');
  const elTimeR = $('#mp-time-r');
  const elRepeatHint = $('#mp-repeat-hint');
  const elLib = $('#mp-lib-body');
  const elSbCount = $('#mp-sb-count');
  const elSbFav = $('#mp-sb-fav');
  const fileInput = $('#mp-file-input');
  const volSlider = $('#mp-vol');

  $('#mp-mi-file')?.addEventListener('click', () => {
    if (typeof window.closeW === 'function') window.closeW('media-player');
  });
  $('#mp-mi-view')?.addEventListener('click', () => {
    toast({
      key: TOAST_KEYS.GENERIC,
      title: 'View',
      message: 'Playlist and visualizer only — no extra view modes yet.',
      icon: '\u2295',
      autoDismiss: 3200
    });
  });
  $('#mp-mi-help')?.addEventListener('click', () => {
    window.alert(
      'CorpOS Media Player\n\nBuild 0.1.0 — in-universe music library and transport. Import tracks from File tab or unlock via narrative.\n\nCtrl+Shift+O: QA override stinger (dev).'
    );
  });

  function updateNowPlaying() {
    const tr = MediaPlayer.isOverride ? MediaPlayer.overrideTrack : MediaPlayer.currentTrack;
    if (tr) {
      elTitle.textContent = tr.title || '';
      elArtist.textContent = tr.artist || '';
      elAlbum.textContent = tr.album || '';
    } else {
      elTitle.textContent = '—';
      elArtist.textContent = '';
      elAlbum.textContent = '';
    }
  }

  function tickUi() {
    const { elapsed, duration, labelTotal } = MediaPlayer.getPlaybackTimes();
    elTimeL.textContent = formatTime(elapsed);
    elTimeR.textContent = labelTotal || '0:00';
    const pct = duration > 0 ? elapsed / duration : 0;
    elSeekFill.style.width = `${Math.round(pct * 10000) / 100}%`;
    updateNowPlaying();

    elRepeatHint.textContent =
      MediaPlayer.repeat === 'off' ? 'Off' : MediaPlayer.repeat === 'all' ? 'All' : 'One';

    const lib = MediaPlayer.getLibraryTracks();
    elSbCount.textContent = `${lib.length} tracks in library`;
    elSbFav.textContent = `${MediaPlayer.getFavorites().length} favorites`;

    win.classList.toggle('mp-override', MediaPlayer.isOverride);

    const btnShuffle = $('#mp-shuffle');
    const btnPlay = $('#mp-play');
    btnShuffle?.classList.toggle('is-pressed', MediaPlayer.shuffle);
    $('#mp-repeat')?.classList.toggle(
      'is-pressed',
      MediaPlayer.repeat === 'all' || MediaPlayer.repeat === 'one'
    );
    const playing = MediaPlayer.isOverride
      ? !MediaPlayer.overrideAudio?.paused
      : !MediaPlayer.audio?.paused;
    btnPlay?.classList.toggle('is-pressed', playing);
    btnPlay.textContent = playing ? '\u258C\u258C' : '\u25B6';

    const curId = MediaPlayer.isOverride
      ? MediaPlayer.overrideTrack?.id
      : MediaPlayer.currentTrack?.id;

    const list = getSortedLibrary();
    elLib.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'mp-lib-empty';
      empty.textContent = filterFav
        ? 'No favorites yet. Click \u2665 on any track to add one.'
        : 'No tracks available.';
      elLib.appendChild(empty);
    } else {
      list.forEach((t, idx) => {
        const row = document.createElement('div');
        row.className = 'mp-row';
        if (String(t.id) === String(curId)) row.classList.add('is-playing');
        row.dataset.trackId = t.id;
        if (t.type === 'imported') row.dataset.imported = '1';

        const fav = MediaPlayer.isFavorite(t.id);
        row.innerHTML =
          `<span class="mp-col-num">${idx + 1}</span>` +
          `<span class="mp-col-title">` +
          (t.type === 'imported' ? '<span class="mp-import-badge">[IMP]</span>' : '') +
          `${escapeHtml(t.title)}</span>` +
          `<span class="mp-col-artist">${escapeHtml(t.artist)}</span>` +
          `<span class="mp-col-time">${escapeHtml(t.duration || '')}</span>` +
          `<span class="mp-col-fav" data-fav="${String(t.id).replace(/"/g, '&quot;')}">${fav ? '\u2665' : '\u2661'}</span>`;
        row.addEventListener('dblclick', (e) => {
          if (e.target.closest('[data-fav]')) return;
          if (!MediaPlayer.isOverride) MediaPlayer.play(t.id);
        });
        row.addEventListener('click', (e) => {
          const heart = e.target.closest('[data-fav]');
          if (heart) {
            MediaPlayer.toggleFavorite(heart.getAttribute('data-fav'));
            tickUi();
          }
        });
        row.addEventListener(
          'contextmenu',
          (e) => {
            e.preventDefault();
            if (MediaPlayer.isOverride) return;
            openRowCtx(e.clientX, e.clientY, t.id);
          },
          true
        );
        elLib.appendChild(row);
      });
    }

    volSlider.value = String(Math.round(MediaPlayer.volume * 100));
  }

  function openRowCtx(x, y, trackId) {
    hideVizModeMenu();
    hideShellCtx();
    hideCtx();
    ctxTrackId = trackId;
    const menu = document.createElement('div');
    menu.className = 'mp-ctx';
    menu.innerHTML = `
      <button type="button" data-a="play">Play Now</button>
      <button type="button" data-a="fav-add">Add to Favorites</button>
      <button type="button" data-a="fav-rem">Remove from Favorites</button>
      <button type="button" data-a="folder" disabled>Show in Folder</button>
      <hr />
      <button type="button" data-a="prop">Properties</button>
    `;
    menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 200)}px`;
    document.body.appendChild(menu);
    ctxMenuEl = menu;
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-a]');
      if (!btn) return;
      const a = btn.getAttribute('data-a');
      const tr = MediaPlayer.getTrackById(ctxTrackId);
      if (a === 'play' && tr) MediaPlayer.play(tr.id);
      if (a === 'fav-add' && tr && !MediaPlayer.isFavorite(tr.id)) MediaPlayer.toggleFavorite(tr.id);
      if (a === 'fav-rem' && tr && MediaPlayer.isFavorite(tr.id)) MediaPlayer.toggleFavorite(tr.id);
      if (a === 'prop' && tr) showProperties(tr);
      hideCtx();
      tickUi();
    });
    setTimeout(() => {
      const once = () => hideCtx();
      document.addEventListener('click', once, { once: true });
    }, 0);
  }

  function onResize() {
    if (!viz) return;
    const el = vizWrap || viz;
    const r = el.getBoundingClientRect();
    viz.width = Math.max(200, Math.floor(r.width));
    viz.height = Math.max(120, Math.floor(r.height));
  }

  if (viz) {
    new ResizeObserver(onResize).observe(vizWrap || viz);
    onResize();
  }

  function showVizModeMenu(x, y) {
    hideVizModeMenu();
    hideShellCtx();
    hideCtx();
    const cur = getState().mediaPlayer?.vizMode || 'bars';
    const menu = document.createElement('div');
    menu.className = 'mp-ctx mp-ctx-viz';
    menu.innerHTML = VIZ_MODE_OPTIONS.map((o) => {
      const sel = o.id === cur ? ' ✓' : '';
      return `<button type="button" data-viz="${o.id}">${escapeHtml(o.label)}${sel}</button>`;
    }).join('');
    menu.style.left = `${Math.min(x, window.innerWidth - 220)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 220)}px`;
    document.body.appendChild(menu);
    vizModeMenuEl = menu;
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-viz]');
      if (!btn) return;
      const id = btn.getAttribute('data-viz');
      hideVizModeMenu();
      patchState((st) => {
        if (!st.mediaPlayer) return st;
        st.mediaPlayer.vizMode = id;
        return st;
      });
      toast({
        key: TOAST_KEYS.GENERIC,
        title: 'Media Player',
        message: `Visualizer: ${VIZ_MODE_OPTIONS.find((v) => v.id === id)?.label || id}`,
        icon: '\u266A',
        autoDismiss: 2200
      });
    });
    setTimeout(() => {
      document.addEventListener('click', () => hideVizModeMenu(), { once: true, capture: true });
    }, 0);
  }

  if (viz) {
    viz.addEventListener(
      'contextmenu',
      (e) => {
        if (MediaPlayer.isOverride) return;
        e.preventDefault();
        e.stopPropagation();
        showVizModeMenu(e.clientX, e.clientY);
      },
      true
    );
  }

  elSeek.addEventListener('click', (e) => {
    if (MediaPlayer.isOverride) return;
    const rect = elSeek.getBoundingClientRect();
    MediaPlayer.seek((e.clientX - rect.left) / rect.width);
    tickUi();
  });

  $('#mp-rwd')?.addEventListener('click', () => MediaPlayer.seekSeconds(-10));
  $('#mp-fwd')?.addEventListener('click', () => MediaPlayer.seekSeconds(10));
  $('#mp-prev')?.addEventListener('click', () => MediaPlayer.prev());
  $('#mp-next')?.addEventListener('click', () => MediaPlayer.next());
  $('#mp-play')?.addEventListener('click', () => MediaPlayer.togglePlayPause());
  $('#mp-shuffle')?.addEventListener('click', () => {
    MediaPlayer.toggleShuffle();
    tickUi();
  });
  $('#mp-repeat')?.addEventListener('click', () => {
    MediaPlayer.cycleRepeat();
    tickUi();
  });
  $('#mp-fav')?.addEventListener('click', () => {
    MediaPlayer.toggleFavorite();
    tickUi();
  });
  $('#mp-vol-minus')?.addEventListener('click', () => {
    MediaPlayer.setVolume(MediaPlayer.volume - 0.1);
    tickUi();
  });
  $('#mp-vol-plus')?.addEventListener('click', () => {
    MediaPlayer.setVolume(MediaPlayer.volume + 0.1);
    tickUi();
  });
  volSlider?.addEventListener('input', () => {
    MediaPlayer.setVolume(Number(volSlider.value) / 100);
    tickUi();
  });

  $('#mp-tab-all')?.addEventListener('click', () => {
    filterFav = false;
    $('#mp-tab-all')?.classList.add('is-active');
    $('#mp-tab-fav')?.classList.remove('is-active');
    tickUi();
  });
  $('#mp-tab-fav')?.addEventListener('click', () => {
    filterFav = true;
    $('#mp-tab-fav')?.classList.add('is-active');
    $('#mp-tab-all')?.classList.remove('is-active');
    tickUi();
  });

  win.querySelectorAll('.mp-lib-head span[data-sort]').forEach((el) => {
    el.addEventListener('click', () => {
      const k = el.getAttribute('data-sort');
      if (sortKey === k) sortDir *= -1;
      else {
        sortKey = k;
        sortDir = 1;
      }
      tickUi();
    });
  });

  $('#mp-import-btn')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', async () => {
    const files = fileInput.files;
    if (!files?.length) return;
    let i = 0;
    for (const file of files) {
      const objectUrl = URL.createObjectURL(file);
      const id = `import_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}`;
      i += 1;
      const title = file.name.replace(/\.[^.]+$/, '');
      const dur = await getAudioDuration(objectUrl);
      const duration = formatTime(dur);
      MediaPlayer.addImportedTrack({
        id,
        title,
        artist: 'Unknown Artist',
        album: '',
        duration,
        objectUrl,
        filename: file.name
      });
      toast({
        key: TOAST_KEYS.TRACK_IMPORTED,
        title: 'Music Imported',
        message: file.name,
        icon: '\u266A',
        autoDismiss: 4500
      });
    }
    fileInput.value = '';
    tickUi();
  });

  function showEqModal() {
    const stEq = getState().mediaPlayer?.eq || { bass: 50, mid: 50, treble: 50 };
    const back = document.createElement('div');
    back.className = 'mp-modal-back';
    const m = document.createElement('div');
    m.className = 'mp-modal';
    const b = Number(stEq.bass) || 50;
    const mi = Number(stEq.mid) || 50;
    const tr = Number(stEq.treble) || 50;
    m.innerHTML = `
    <div class="mp-modal-h">Audio — Equalizer</div>
    <div class="mp-modal-b">
      <p style="font-size:10px;color:#555;margin:0 0 8px;line-height:1.35;">Tone shaping is saved with your session. The player uses standard HTML audio; full equalization DSP may ship in a future build.</p>
      <div class="prow"><span>Bass</span><input type="range" id="mp-eq-bass" min="0" max="100" value="${b}" style="width:140px;"></div>
      <div class="prow"><span>Mid</span><input type="range" id="mp-eq-mid" min="0" max="100" value="${mi}" style="width:140px;"></div>
      <div class="prow"><span>Treble</span><input type="range" id="mp-eq-treble" min="0" max="100" value="${tr}" style="width:140px;"></div>
    </div>
    <div class="mp-modal-f">
      <button type="button" class="mp-ok">OK</button>
      <button type="button" class="mp-eq-cancel" style="margin-left:8px;font-size:11px;padding:2px 12px;">Cancel</button>
    </div>`;
    back.appendChild(m);
    document.body.appendChild(back);
    const close = () => back.remove();
    m.querySelector('.mp-eq-cancel')?.addEventListener('click', close);
    back.addEventListener('mousedown', (e) => {
      if (e.target === back) close();
    });
    m.querySelector('.mp-ok')?.addEventListener('click', () => {
      const bass = Math.min(100, Math.max(0, Number(m.querySelector('#mp-eq-bass')?.value) || 0));
      const mid = Math.min(100, Math.max(0, Number(m.querySelector('#mp-eq-mid')?.value) || 0));
      const treble = Math.min(100, Math.max(0, Number(m.querySelector('#mp-eq-treble')?.value) || 0));
      patchState((st) => {
        if (!st.mediaPlayer) return st;
        st.mediaPlayer.eq = { bass, mid, treble };
        return st;
      });
      close();
      toast({
        key: TOAST_KEYS.GENERIC,
        title: 'Media Player',
        message: 'Audio settings saved.',
        icon: '\u266A',
        autoDismiss: 2800
      });
    });
  }

  function showShellCtx(x, y) {
    hideCtx();
    hideShellCtx();
    const menu = document.createElement('div');
    menu.className = 'mp-ctx mp-ctx-shell';
    menu.innerHTML = `
      <button type="button" data-mp-sh="refresh">Refresh library</button>
      <button type="button" data-mp-sh="import">Import music…</button>
      <hr />
      <button type="button" data-mp-sh="eq">Settings — Audio / Equalizer…</button>
    `;
    menu.style.left = `${Math.min(x, window.innerWidth - 200)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - 160)}px`;
    document.body.appendChild(menu);
    shellCtxEl = menu;
    menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mp-sh]');
      if (!btn) return;
      const sh = btn.getAttribute('data-mp-sh');
      hideShellCtx();
      if (sh === 'refresh') {
        void MediaPlayer.reloadLibrary().then(() => tickUi());
      } else if (sh === 'import') {
        fileInput?.click();
      } else if (sh === 'eq') {
        showEqModal();
      }
    });
    setTimeout(() => {
      document.addEventListener(
        'click',
        () => hideShellCtx(),
        { once: true, capture: true }
      );
    }, 0);
  }

  win.addEventListener(
    'contextmenu',
    (e) => {
      if (!win.contains(e.target)) return;
      if (MediaPlayer.isOverride) return;
      if (e.target.closest('.mp-viz-wrap') || e.target.closest('.mp-viz')) return;
      if (e.target.closest('.mp-row')) return;
      if (e.target.closest('.mp-ctx')) return;
      e.preventDefault();
      e.stopPropagation();
      showShellCtx(e.clientX, e.clientY);
    },
    true
  );

  let tickScheduled = false;
  function scheduleTick() {
    if (tickScheduled) return;
    tickScheduled = true;
    requestAnimationFrame(() => {
      tickScheduled = false;
      tickUi();
    });
  }

  MediaPlayer.subscribe(() => scheduleTick());
  MediaPlayer.audio?.addEventListener('timeupdate', () => scheduleTick());
  MediaPlayer.overrideAudio?.addEventListener('timeupdate', () => scheduleTick());
  setInterval(() => {
    if (!MediaPlayer.audio?.paused || MediaPlayer.isOverride) scheduleTick();
  }, 500);
}

function getAudioDuration(url) {
  return new Promise((resolve) => {
    const a = new Audio();
    a.preload = 'metadata';
    a.src = url;
    const done = () => {
      const d = a.duration;
      resolve(!Number.isNaN(d) && d < 86400 ? d : 0);
      a.removeAttribute('src');
    };
    a.addEventListener('loadedmetadata', done, { once: true });
    a.addEventListener('error', () => resolve(0), { once: true });
  });
}

export function initMediaPlayer() {
  const win = document.getElementById('win-media-player');
  if (!win) return Promise.resolve();

  return MediaPlayer.init({
    getState,
    patchState,
    getSessionState,
    patchSession
  }).then(() => {
    wireDom(win);
    lastUnlockSet = new Set(getState().mediaPlayer.unlockedIds || []);

    let mpWasPlayingBeforeFastSim = false;
    on('simSpeedChanged', ({ speed }) => {
      const sp = Number(speed);
      if (sp > 1) {
        if (!MediaPlayer.audio?.paused && MediaPlayer.currentTrack && !MediaPlayer.isOverride) {
          mpWasPlayingBeforeFastSim = true;
          MediaPlayer.pause();
        }
      } else if (sp === 1) {
        if (mpWasPlayingBeforeFastSim && MediaPlayer.currentTrack && !MediaPlayer.isOverride) {
          mpWasPlayingBeforeFastSim = false;
          MediaPlayer.resume();
        } else {
          mpWasPlayingBeforeFastSim = false;
        }
      }
    });

    on('stateChanged', () => {
      MediaPlayer.syncFavoritesFromState();
      MediaPlayer.refreshMergedTracks();
      const ids = new Set((getState().mediaPlayer.unlockedIds || []).map(String));
      const prev = lastUnlockSet;
      lastUnlockSet = new Set(ids);
      for (const uid of ids) {
        if (!prev.has(uid)) {
          queueMicrotask(() => {
            const row = [...win.querySelectorAll('.mp-row')].find((r) => r.dataset.trackId === uid);
            if (row) {
              row.classList.add('flash-unlock');
              setTimeout(() => row.classList.remove('flash-unlock'), 1100);
            }
          });
        }
      }
    });
  });
}

/** Dev QA: Ctrl+Shift+O toggles system override stinger */
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey || !e.shiftKey || e.key.toLowerCase() !== 'o') return;
  if (MediaPlayer.isOverride) MediaPlayer.exitOverride();
  else MediaPlayer.enterOverride('override_investigation');
});