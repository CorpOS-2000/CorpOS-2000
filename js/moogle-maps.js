/**
 * Moogle Maps — in-game Google Maps parody for CorpOS 2000.
 * Standalone WorldNet page + embeddable widget with search/autocomplete API.
 */

import { escapeHtml } from './identity.js';

let _districts = [];
let _streets = [];
let _addresses = [];
let _indexByPrefix = new Map();
let _indexById = new Map();
let _loaded = false;

/* ────────── Data loading ────────── */

export async function initMoogleMaps(loadJsonFile) {
  try {
    _districts = await loadJsonFile('maps/hargrove/districts.json');
    _streets = await loadJsonFile('maps/hargrove/streets.json');
    _addresses = await loadJsonFile('maps/hargrove/addresses.json');
  } catch (e) {
    console.warn('[MoogleMaps] data load failed:', e?.message || e);
    _districts = []; _streets = []; _addresses = [];
  }
  buildIndex();
  _loaded = true;
  if (typeof window !== 'undefined') window.MoogleMaps = publicApi;
}

/* ────────── Search index ────────── */

function buildIndex() {
  _indexByPrefix.clear();
  _indexById.clear();
  for (const a of _addresses) {
    _indexById.set(a.id, a);
    const tokens = tokenize(a.label);
    for (const tok of tokens) {
      for (let len = 2; len <= Math.min(tok.length, 12); len++) {
        const pre = tok.slice(0, len);
        let bucket = _indexByPrefix.get(pre);
        if (!bucket) { bucket = []; _indexByPrefix.set(pre, bucket); }
        if (bucket.length < 200) bucket.push(a);
      }
    }
  }
}

function tokenize(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
}

function scoreMatch(addr, queryTokens) {
  const label = addr.label.toLowerCase();
  let score = 0;
  for (const qt of queryTokens) {
    if (label.startsWith(qt)) score += 10;
    else if (label.includes(qt)) score += 5;
  }
  return score;
}

function searchInternal(query, limit = 8, filterTypes = null) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 2) return [];
  const tokens = tokenize(q);
  if (!tokens.length) return [];
  const primary = tokens[0];
  const prefix = primary.slice(0, Math.min(primary.length, 12));
  const candidates = _indexByPrefix.get(prefix) || [];
  const scored = [];
  const seen = new Set();
  for (const a of candidates) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    if (filterTypes && !filterTypes.includes(a.type)) continue;
    const s = scoreMatch(a, tokens);
    if (s > 0) scored.push({ addr: a, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.addr);
}

/* ────────── Public API (window.MoogleMaps) ────────── */

const publicApi = {
  search(query, limit) { return searchInternal(query, limit); },
  autocomplete(query, limit = 6) { return query?.length >= 2 ? searchInternal(query, limit) : []; },
  geocode(addressString) {
    const r = searchInternal(addressString, 1);
    return r.length ? r[0].coords : null;
  },
  reverseGeocode(x, y, radius = 15) {
    let best = null, bestDist = Infinity;
    for (const a of _addresses) {
      const d = Math.hypot(a.coords.x - x, a.coords.y - y);
      if (d < bestDist && d <= radius) { bestDist = d; best = a; }
    }
    return best;
  },
  getAddress(addressId) { return _indexById.get(addressId) || null; },
  getAllByDistrict(id) { return _addresses.filter((a) => a.district === id); },
  getAllByZip(zip) { return _addresses.filter((a) => a.zip === zip); },
  getAllByType(type) { return _addresses.filter((a) => a.type === type); },
  getDistricts() { return _districts; },
  getStreets() { return _streets; },
  getAllAddresses() { return _addresses; },
  isLoaded() { return _loaded; },

  flyTo(addressId, zoom) {
    const a = _indexById.get(addressId);
    if (!a) return;
    if (_activeMap) {
      _activeMap.state.offsetX = -(a.coords.x * (_activeMap.state.zoom) - _activeMap.canvas.width / 2);
      _activeMap.state.offsetY = -(a.coords.y * (_activeMap.state.zoom) - _activeMap.canvas.height / 2);
      if (zoom) _activeMap.state.zoom = Math.max(0.5, Math.min(4.0, zoom));
      _activeMap.selectedAddr = a;
      _activeMap.render();
    }
  },

  embedPicker(opts) { return mountPickerWidget(opts); },
  embedDisplay(opts) { return mountDisplayWidget(opts); }
};

/* ────────── Canvas map renderer ────────── */

let _activeMap = null;

const PARKS = [
  { name: 'Hargrove Central Park', x: 400, y: 180, w: 60, h: 40 },
  { name: 'University Commons', x: 190, y: 110, w: 80, h: 50 },
  { name: 'Valley Heights Nature Reserve', x: 660, y: 90, w: 100, h: 80 },
  { name: 'Riverside Park', x: 140, y: 440, w: 70, h: 40 }
];

const RIVER_POINTS = [
  [70, 50], [60, 150], [55, 250], [65, 350], [80, 450], [90, 550], [85, 650], [80, 750]
];

function createMapInstance(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  const state = {
    offsetX: 0, offsetY: 0,
    zoom: opts.zoom || 1.0,
    minZoom: 0.5, maxZoom: 4.0,
    isDragging: false, lastX: 0, lastY: 0,
    velocityX: 0, velocityY: 0
  };

  let selectedAddr = opts.selectedAddr || null;
  let pinDropAnim = 0;
  let animFrame = null;

  function worldToScreen(wx, wy) {
    return [wx * state.zoom + state.offsetX, wy * state.zoom + state.offsetY];
  }

  function screenToWorld(sx, sy) {
    return [(sx - state.offsetX) / state.zoom, (sy - state.offsetY) / state.zoom];
  }

  function render() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.zoom, state.zoom);

    // Background
    ctx.fillStyle = '#f0ebe0';
    ctx.fillRect(-2000, -2000, 5000, 5000);

    // District fills
    for (const d of _districts) {
      const b = d.bounds;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.strokeStyle = darken(d.color, 20);
      ctx.lineWidth = 1 / state.zoom;
      ctx.stroke();
    }

    // River
    ctx.beginPath();
    ctx.moveTo(RIVER_POINTS[0][0], RIVER_POINTS[0][1]);
    for (let i = 1; i < RIVER_POINTS.length; i++) {
      const prev = RIVER_POINTS[i - 1], cur = RIVER_POINTS[i];
      const mx = (prev[0] + cur[0]) / 2, my = (prev[1] + cur[1]) / 2;
      ctx.quadraticCurveTo(prev[0], prev[1], mx, my);
    }
    const last = RIVER_POINTS[RIVER_POINTS.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.strokeStyle = '#b8d4e8';
    ctx.lineWidth = 24;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Parks
    ctx.fillStyle = '#c8e0b8';
    for (const p of PARKS) {
      ctx.beginPath();
      roundRect(ctx, p.x, p.y, p.w, p.h, 3);
      ctx.fill();
    }

    // Streets — casings then roads
    for (const pass of ['casing', 'road']) {
      for (const st of _streets) {
        const pts = st.points;
        if (!pts || pts.length < 2) continue;
        const isMajor = st.type === 'major';
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        if (pass === 'casing') {
          ctx.strokeStyle = '#f0ebe0';
          ctx.lineWidth = isMajor ? 7 : 4;
        } else {
          ctx.strokeStyle = isMajor ? '#ffe0a0' : '#d8d0c4';
          ctx.lineWidth = isMajor ? 5 : 2;
        }
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }

    // District labels (at default zoom+)
    if (state.zoom >= 0.8) {
      ctx.font = `${Math.round(10 / state.zoom)}px Tahoma, sans-serif`;
      ctx.fillStyle = '#888888';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const d of _districts) {
        const b = d.bounds;
        ctx.fillText(d.label, b.x + b.w / 2, b.y + b.h / 2);
      }
    }

    // Street labels at zoom 1.5+
    if (state.zoom >= 1.5) {
      ctx.font = `${Math.round(9 / state.zoom)}px Tahoma, sans-serif`;
      ctx.fillStyle = '#666666';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const st of _streets) {
        const pts = st.points;
        if (pts.length < 2) continue;
        const mi = Math.floor(pts.length / 2);
        const mx = (pts[mi][0] + pts[Math.max(0, mi - 1)][0]) / 2;
        const my = (pts[mi][1] + pts[Math.max(0, mi - 1)][1]) / 2;
        ctx.fillText(st.name, mx, my - 4);
      }
    }

    // Park labels at zoom 1.2+
    if (state.zoom >= 1.2) {
      ctx.font = `${Math.round(8 / state.zoom)}px Tahoma, sans-serif`;
      ctx.fillStyle = '#4a7a3a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of PARKS) {
        ctx.fillText(p.name, p.x + p.w / 2, p.y + p.h / 2);
      }
    }

    // Selected pin
    if (selectedAddr) {
      const ax = selectedAddr.coords.x, ay = selectedAddr.coords.y;
      const dropOffset = pinDropAnim < 1 ? (1 - pinDropAnim) * 20 : 0;
      drawPin(ctx, ax, ay - dropOffset / state.zoom, state.zoom);
    }

    ctx.restore();

    // Attribution overlay
    ctx.font = '9px Tahoma, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const attrText = 'Moogle Maps | \u00A9 2000 Moogle Corp. | Map data \u00A9 Hargrove City GIS';
    const tw = ctx.measureText(attrText).width;
    ctx.fillRect(w - tw - 16, h - 18, tw + 12, 16);
    ctx.fillStyle = '#555';
    ctx.fillText(attrText, w - tw - 10, h - 7);
  }

  function drawPin(c, x, y, zoom) {
    const s = 1 / zoom;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    c.beginPath();
    c.arc(0, -12, 8, Math.PI, 0);
    c.lineTo(0, 0);
    c.closePath();
    c.fillStyle = '#cc0000';
    c.fill();
    c.strokeStyle = '#880000';
    c.lineWidth = 1;
    c.stroke();
    c.beginPath();
    c.arc(0, -12, 3, 0, Math.PI * 2);
    c.fillStyle = '#fff';
    c.fill();
    c.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
  }

  function darken(hex, amt) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) - amt);
    const g = Math.max(0, ((n >> 8) & 0xff) - amt);
    const b = Math.max(0, (n & 0xff) - amt);
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  // Interaction
  if (!opts.readonly) {
    canvas.addEventListener('mousedown', (e) => {
      state.isDragging = true;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.velocityX = 0;
      state.velocityY = 0;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!state.isDragging) return;
      const dx = e.clientX - state.lastX;
      const dy = e.clientY - state.lastY;
      state.offsetX += dx;
      state.offsetY += dy;
      state.velocityX = dx;
      state.velocityY = dy;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      render();
    });
    const stopDrag = () => {
      if (!state.isDragging) return;
      state.isDragging = false;
      // Momentum
      const decay = () => {
        if (Math.abs(state.velocityX) < 0.5 && Math.abs(state.velocityY) < 0.5) return;
        state.velocityX *= 0.92;
        state.velocityY *= 0.92;
        state.offsetX += state.velocityX;
        state.offsetY += state.velocityY;
        render();
        requestAnimationFrame(decay);
      };
      requestAnimationFrame(decay);
    };
    canvas.addEventListener('mouseup', stopDrag);
    canvas.addEventListener('mouseleave', stopDrag);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [wx, wy] = screenToWorld(mx, my);
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const newZoom = Math.max(state.minZoom, Math.min(state.maxZoom, state.zoom * factor));
      state.offsetX = mx - wx * newZoom;
      state.offsetY = my - wy * newZoom;
      state.zoom = newZoom;
      render();
    }, { passive: false });

    canvas.addEventListener('click', (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const [wx, wy] = screenToWorld(mx, my);
      const found = publicApi.reverseGeocode(wx, wy, 12 / state.zoom);
      if (found) {
        selectedAddr = found;
        pinDropAnim = 0;
        const start = performance.now();
        const animateDrop = (t) => {
          pinDropAnim = Math.min(1, (t - start) / 300);
          render();
          if (pinDropAnim < 1) requestAnimationFrame(animateDrop);
        };
        requestAnimationFrame(animateDrop);
        if (inst.onSelect) inst.onSelect(found);
      }
    });
  }

  const inst = {
    canvas, ctx, state, render, selectedAddr, onSelect: null,
    setSelected(addr) {
      selectedAddr = addr;
      pinDropAnim = 1;
      render();
    },
    flyTo(addr, z) {
      if (!addr) return;
      selectedAddr = addr;
      state.zoom = z || 2.0;
      state.offsetX = -(addr.coords.x * state.zoom - canvas.width / 2);
      state.offsetY = -(addr.coords.y * state.zoom - canvas.height / 2);
      pinDropAnim = 0;
      const start = performance.now();
      const animateDrop = (t) => {
        pinDropAnim = Math.min(1, (t - start) / 300);
        render();
        if (pinDropAnim < 1) requestAnimationFrame(animateDrop);
      };
      requestAnimationFrame(animateDrop);
    },
    destroy() { if (animFrame) cancelAnimationFrame(animFrame); }
  };

  // Center map initially
  state.offsetX = canvas.width / 2 - 500 * state.zoom;
  state.offsetY = canvas.height / 2 - 400 * state.zoom;
  render();

  return inst;
}

/* ────────── Full-page Moogle Maps shell (WorldNet) ────────── */

const COS_SEAL_SVG = `<svg viewBox="0 0 140 140" width="24" height="24" style="vertical-align:middle;"><rect x="8" y="8" width="124" height="124" rx="6" fill="#0d1a3a" stroke="#a6b5e7" stroke-width="2"/><text x="56" y="74" font-family="Orbitron,monospace" font-weight="900" font-size="48" fill="white" text-anchor="middle" dominant-baseline="middle">C</text><text x="104" y="55" font-family="Orbitron,monospace" font-weight="700" font-size="20" fill="#a6b5e7" text-anchor="middle" dominant-baseline="middle">O</text><text x="104" y="86" font-family="Orbitron,monospace" font-weight="700" font-size="20" fill="#6688cc" text-anchor="middle" dominant-baseline="middle">S</text></svg>`;

export function renderMoogleMapsPage() {
  return `<div class="iebody" style="display:flex;flex-direction:column;height:100%;overflow:hidden;" data-wn-ad-page="moogle_maps">
<div style="background:#fff;height:44px;display:flex;align-items:center;padding:0 10px;border-bottom:2px solid #ccc;flex-shrink:0;">
  <div style="margin-right:12px;">
    <span style="font-family:'Times New Roman',Georgia,serif;font-size:20px;font-weight:bold;letter-spacing:1px;">
      <span style="color:#cc0000;">M</span><span style="color:#0a246a;">o</span><span style="color:#cc6600;">o</span><span style="color:#006600;">g</span><span style="color:#cc0000;">l</span><span style="color:#0a246a;">e</span>
    </span>
    <div style="font-size:10px;color:#555;margin-top:-2px;">Maps</div>
  </div>
  <input id="moogle-maps-search" type="text" placeholder="Search Hargrove addresses, places..." style="flex:1;height:24px;font-size:11px;padding:0 6px;border:2px inset #d4d0c8;font-family:Tahoma,sans-serif;">
  <button type="button" id="moogle-maps-search-btn" style="margin-left:4px;height:24px;padding:0 12px;background:#d4d0c8;border:2px solid;border-color:#fff #404040 #404040 #fff;font-size:11px;font-family:Tahoma,sans-serif;cursor:pointer;font-weight:bold;">Search</button>
</div>
<div style="display:flex;flex:1;min-height:0;">
  <div id="moogle-maps-sidebar" style="width:240px;flex-shrink:0;border-right:2px solid #ccc;overflow-y:auto;background:#fff;padding:8px;font-size:11px;">
    <div id="moogle-maps-results"></div>
    <div id="moogle-maps-selected" style="display:none;margin-top:8px;padding:8px;border:1px solid #ccc;background:#f8f8ff;"></div>
    <div style="margin-top:12px;padding:6px;border:1px solid #aaa;background:#eee;color:#888;font-size:10px;">Directions: Coming Soon</div>
    <div style="margin-top:12px;padding:6px;background:#e8ecf8;border:2px inset #d4d0c8;font-size:10px;color:#333;">
      ${COS_SEAL_SVG}
      <b style="margin-left:4px;">APPROVED BY CORPOS 2000</b><br>
      <span style="font-size:9px;">All location data verified per Federal Mandate 2000-CR7<br>Cartographic Compliance Division</span>
    </div>
  </div>
  <div style="flex:1;position:relative;min-width:0;">
    <canvas id="moogle-maps-canvas" style="display:block;width:100%;height:100%;"></canvas>
    <div style="position:absolute;bottom:8px;right:8px;display:flex;flex-direction:column;gap:2px;">
      <button type="button" id="moogle-maps-zin" style="width:26px;height:26px;background:#d4d0c8;border:2px solid;border-color:#fff #404040 #404040 #fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:Tahoma;">+</button>
      <button type="button" id="moogle-maps-zout" style="width:26px;height:26px;background:#d4d0c8;border:2px solid;border-color:#fff #404040 #404040 #fff;font-size:14px;font-weight:bold;cursor:pointer;font-family:Tahoma;">−</button>
    </div>
  </div>
</div>
<div id="moogle-maps-dropdown" style="display:none;position:absolute;z-index:100;background:#fff;border:1px solid #999;box-shadow:1px 2px 4px rgba(0,0,0,0.15);max-height:200px;overflow-y:auto;font-size:11px;"></div>
</div>`;
}

export function mountMoogleMaps(container) {
  const canvas = container.querySelector('#moogle-maps-canvas');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth || 600;
  canvas.height = canvas.offsetHeight || 400;
  const resObs = new ResizeObserver(() => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    if (mapInst) mapInst.render();
  });
  resObs.observe(canvas.parentElement);

  const mapInst = createMapInstance(canvas);
  _activeMap = mapInst;

  const searchInput = container.querySelector('#moogle-maps-search');
  const searchBtn = container.querySelector('#moogle-maps-search-btn');
  const resultsEl = container.querySelector('#moogle-maps-results');
  const selectedEl = container.querySelector('#moogle-maps-selected');
  const dropdown = container.querySelector('#moogle-maps-dropdown');

  function showDropdown(results) {
    if (!results.length) { dropdown.style.display = 'none'; return; }
    const rect = searchInput.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    dropdown.style.left = `${rect.left - containerRect.left}px`;
    dropdown.style.top = `${rect.bottom - containerRect.top}px`;
    dropdown.style.width = `${rect.width}px`;
    dropdown.style.display = 'block';
    dropdown.innerHTML = results.map((a) => {
      const icon = a.type === 'residential' ? '🏠' : a.type === 'commercial' ? '🏢' : a.type === 'industrial' ? '🏭' : '📍';
      return `<div data-addr-id="${escapeHtml(a.id)}" style="padding:4px 8px;cursor:pointer;border-bottom:1px solid #eee;" onmouseover="this.style.background='#d0d8ff'" onmouseout="this.style.background=''">${icon} <b>${escapeHtml(a.label)}</b> <span style="color:#888;font-size:10px;">${escapeHtml(a.district)}</span></div>`;
    }).join('');
    dropdown.querySelectorAll('[data-addr-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const addr = _indexById.get(el.getAttribute('data-addr-id'));
        if (addr) { selectAddress(addr); mapInst.flyTo(addr, 2.5); }
        dropdown.style.display = 'none';
      });
    });
  }

  function doSearch() {
    const q = searchInput?.value || '';
    const results = searchInternal(q, 12);
    renderResults(results);
    if (results.length) { selectAddress(results[0]); mapInst.flyTo(results[0], 2.0); }
    dropdown.style.display = 'none';
  }

  function renderResults(results) {
    if (!resultsEl) return;
    if (!results.length) { resultsEl.innerHTML = '<div style="color:#888;padding:4px;">No results found.</div>'; return; }
    resultsEl.innerHTML = results.map((a) => {
      const icon = a.type === 'residential' ? '🏠' : a.type === 'commercial' ? '🏢' : a.type === 'industrial' ? '🏭' : '📍';
      return `<div data-addr-id="${escapeHtml(a.id)}" style="padding:4px 2px;cursor:pointer;border-bottom:1px solid #eee;" onmouseover="this.style.background='#e8ecff'" onmouseout="this.style.background=''">${icon} ${escapeHtml(a.label)}<br><span style="font-size:9px;color:#888;">${escapeHtml(a.district)} · ${escapeHtml(a.type)}</span></div>`;
    }).join('');
    resultsEl.querySelectorAll('[data-addr-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const addr = _indexById.get(el.getAttribute('data-addr-id'));
        if (addr) { selectAddress(addr); mapInst.flyTo(addr, 2.5); }
      });
    });
  }

  function selectAddress(addr) {
    if (!selectedEl) return;
    selectedEl.style.display = 'block';
    selectedEl.innerHTML = `<b>${escapeHtml(addr.label)}</b><br>
<span style="font-size:10px;color:#555;">District: ${escapeHtml(addr.district)} · Type: ${escapeHtml(addr.type)}<br>Coords: (${addr.coords.x}, ${addr.coords.y})</span>`;
  }

  mapInst.onSelect = (addr) => selectAddress(addr);

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value;
      if (q.length >= 2) showDropdown(searchInternal(q, 6));
      else dropdown.style.display = 'none';
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { doSearch(); e.preventDefault(); }
      if (e.key === 'Escape') dropdown.style.display = 'none';
    });
  }
  if (searchBtn) searchBtn.addEventListener('click', doSearch);

  // Zoom buttons
  container.querySelector('#moogle-maps-zin')?.addEventListener('click', () => {
    mapInst.state.zoom = Math.min(4.0, mapInst.state.zoom * 1.3);
    mapInst.render();
  });
  container.querySelector('#moogle-maps-zout')?.addEventListener('click', () => {
    mapInst.state.zoom = Math.max(0.5, mapInst.state.zoom / 1.3);
    mapInst.render();
  });
}

export function teardownMoogleMaps() {
  if (_activeMap) { _activeMap.destroy(); _activeMap = null; }
}

/* ────────── Widget modes ────────── */

function mountPickerWidget(opts) {
  const container = typeof opts.container === 'string'
    ? document.querySelector(opts.container)
    : opts.container;
  if (!container) return null;

  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'border:2px inset #d4d0c8;background:#fff;';
  wrapper.innerHTML = `
<div style="padding:4px;">
  <input type="text" class="mm-picker-search" placeholder="Search address..." style="width:100%;height:20px;font-size:11px;padding:0 4px;border:2px inset #d4d0c8;" value="${escapeHtml(opts.prefill || '')}">
  <div class="mm-picker-dropdown" style="display:none;max-height:120px;overflow-y:auto;border:1px solid #999;background:#fff;font-size:10px;"></div>
</div>
<canvas class="mm-picker-canvas" width="350" height="220" style="display:block;width:100%;"></canvas>
<div class="mm-picker-info" style="padding:4px;font-size:10px;display:none;"></div>
<div style="padding:4px;text-align:right;">
  <button type="button" class="mm-picker-use" style="height:22px;padding:0 10px;background:#0a246a;color:#fff;border:1px outset #3366cc;font-size:10px;cursor:pointer;">Use this address</button>
</div>`;
  container.appendChild(wrapper);

  const canvas = wrapper.querySelector('.mm-picker-canvas');
  const mapInst = createMapInstance(canvas, { zoom: 1.0 });
  const searchEl = wrapper.querySelector('.mm-picker-search');
  const dropEl = wrapper.querySelector('.mm-picker-dropdown');
  const infoEl = wrapper.querySelector('.mm-picker-info');
  const useBtn = wrapper.querySelector('.mm-picker-use');
  let selected = null;

  const filterTypes = opts.filterTypes || opts.allowedZones || null;

  function showResults(results) {
    if (!results.length) { dropEl.style.display = 'none'; return; }
    dropEl.style.display = 'block';
    dropEl.innerHTML = results.map((a) =>
      `<div data-id="${a.id}" style="padding:3px 6px;cursor:pointer;border-bottom:1px solid #eee;" onmouseover="this.style.background='#d0d8ff'" onmouseout="this.style.background=''">${escapeHtml(a.label)}</div>`
    ).join('');
    dropEl.querySelectorAll('[data-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const addr = _indexById.get(el.getAttribute('data-id'));
        if (addr) { selectAddr(addr); mapInst.flyTo(addr, 2.0); }
        dropEl.style.display = 'none';
      });
    });
  }

  function selectAddr(addr) {
    selected = addr;
    infoEl.style.display = 'block';
    infoEl.innerHTML = `<b>${escapeHtml(addr.label)}</b> · ${escapeHtml(addr.district)}`;
  }

  searchEl?.addEventListener('input', () => {
    const q = searchEl.value;
    if (q.length >= 2) showResults(searchInternal(q, 6, filterTypes));
    else dropEl.style.display = 'none';
  });
  searchEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dropEl.style.display = 'none';
  });

  mapInst.onSelect = (addr) => { if (!filterTypes || filterTypes.includes(addr.type)) selectAddr(addr); };

  useBtn?.addEventListener('click', () => {
    if (selected && opts.onSelect) opts.onSelect(selected);
  });

  if (opts.prefill) {
    const pre = searchInternal(opts.prefill, 1, filterTypes);
    if (pre.length) { selectAddr(pre[0]); mapInst.flyTo(pre[0], 2.0); }
  }

  return { wrapper, mapInst, getSelected: () => selected };
}

function mountDisplayWidget(opts) {
  const container = typeof opts.container === 'string'
    ? document.querySelector(opts.container)
    : opts.container;
  if (!container) return null;

  const w = opts.width || 400, h = opts.height || 250;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.style.cssText = `display:block;width:${w}px;height:${h}px;border:2px inset #d4d0c8;`;
  container.appendChild(canvas);

  const mapInst = createMapInstance(canvas, { zoom: opts.zoom || 2.0, readonly: true });

  if (opts.address) {
    const result = searchInternal(opts.address, 1);
    if (result.length) mapInst.flyTo(result[0], opts.zoom || 2.0);
  }
  if (opts.addressId) {
    const addr = _indexById.get(opts.addressId);
    if (addr) mapInst.flyTo(addr, opts.zoom || 2.0);
  }

  return { canvas, mapInst };
}
