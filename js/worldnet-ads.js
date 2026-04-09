/**
 * WorldNet Ad Engine — JSON-driven slots, weighted rotation, Y2K formats.
 *
 * ## Pipeline: where ads go on any page
 *
 * 1. **Inventory** — `data-wnet-ad-slot="<id>"` must match each ad row’s `position` in `ads.json`.
 * 2. **Layout module (Y2K placement)** — optional `data-wnet-ad-region="<region>"` selects how the
 *    host is styled: `banner-top` | `banner-bottom` | `sidebar-right` | `sidebar-left` | `inline`.
 *    If omitted, region is inferred from the slot id (e.g. `sidebar-right`, `footer-banner` → bottom).
 * 3. **Page filter** — `data-wn-ad-page` / `data-wn-ad-store` on an ancestor (unchanged).
 *
 * Example — custom slot name with leaderboard placement:
 * `<div data-wnet-ad-slot="corp-home-hero" data-wnet-ad-region="banner-top"></div>`
 * Ads use `"position": "corp-home-hero"` in JSON.
 */

import { escapeHtml } from './identity.js';
import { getState } from './gameState.js';
import {
  AD_RENDER_RULES,
  listAdPlacements,
  listAdSizes,
  normalizePlacementId,
  getAdPlacementById,
  validateAdConfig,
  normalizeAdConfig
} from './worldnet-ad-schema.js';

/** Recognized placement modules (year-2000 layout presets). */
export const AD_SLOT_REGIONS = Object.freeze(listAdPlacements().map((x) => x.id));

/** @typedef {(key: string, sub?: string, opts?: { pushHistory?: boolean }) => void} WnNavigateFn */

const ANIM_CLASS = {
  flash: 'wn-anim-flash',
  pulse: 'wn-anim-pulse',
  'slide-in': 'wn-anim-slide-in',
  'scroll-text': 'wn-anim-scroll-text',
  'color-cycle': 'wn-anim-color-cycle',
  shake: 'wn-anim-shake',
  typewriter: 'wn-anim-typewriter',
  'fade-loop': 'wn-anim-fade-loop',
  bounce: 'wn-anim-bounce',
  glitch: 'wn-anim-glitch'
};

let _baseAds = [];
let _defaultRotationMs = 8000;
/** @type {Set<string>} */
const _suppressedBaseIds = new Set();
/** @type {Map<string, object>} */
const _runtime = new Map();
/** @type {WnNavigateFn | null} */
let _navigate = null;

function mergedAdList() {
  const list = _baseAds.filter((a) => a && a.id && !_suppressedBaseIds.has(a.id));
  for (const ad of _runtime.values()) {
    const i = list.findIndex((x) => x.id === ad.id);
    if (i >= 0) list[i] = { ...list[i], ...ad };
    else list.push(ad);
  }
  return list.map((ad) => normalizeAdConfig(ad)).filter(Boolean);
}

/**
 * @param {string} pageKey
 * @param {string} slotId
 * @param {string} [storeId] optional shop store filter when pageKey is shared
 */
function adsForPageSlot(pageKey, slotId, storeId = '') {
  return mergedAdList().filter((a) => {
    if (a.pageKey !== pageKey || a.position !== slotId) return false;
    if (a.storeId) {
      if (!storeId || a.storeId !== storeId) return false;
    }
    if (a.unlockRequirement) {
      const f = getState().flags || {};
      if (!f[a.unlockRequirement]) return false;
    }
    return true;
  });
}

function weightedPick(ads) {
  if (!ads.length) return null;
  const sum = ads.reduce((s, a) => s + Math.max(0.01, Number(a.weight) || 1), 0);
  let r = Math.random() * sum;
  for (const a of ads) {
    r -= Math.max(0.01, Number(a.weight) || 1);
    if (r <= 0) return a;
  }
  return ads[ads.length - 1];
}

function cleanupHost(host) {
  if (host._wnAdInterval) {
    clearInterval(host._wnAdInterval);
    host._wnAdInterval = null;
  }
}

function resolveAdPageAndStore(el, defaultPageKey) {
  const host = el.closest('[data-wn-ad-page]');
  const page = host?.getAttribute('data-wn-ad-page')?.trim() || defaultPageKey;
  const storeId = host?.getAttribute('data-wn-ad-store')?.trim() || '';
  return { page, storeId };
}

function normalizeRegion(raw) {
  const r = normalizePlacementId(raw);
  return AD_SLOT_REGIONS.includes(r) ? r : null;
}

/**
 * Infer Y2K layout module from slot id when `data-wnet-ad-region` is not set.
 * @param {string} slotId
 */
export function inferSlotRegionFromId(slotId) {
  const s = String(slotId || '').toLowerCase();
  if (s.includes('below-header') || s.includes('top-banner') || s.includes('leaderboard'))
    return 'below-header';
  if (s.includes('above-footer') || s.includes('footer') || s.includes('bottom'))
    return 'above-footer';
  if (s.includes('paired-half')) return 'paired-half-banners';
  if (s.includes('left-rail')) return 'left-rail';
  if (s.includes('right-rail') || s.includes('skyscraper') || s.includes('tower')) return 'right-rail';
  if (s.includes('badge')) return 'footer-badges';
  if (s.includes('content-sidebar')) return 'content-sidebar';
  if (s.includes('content') || s.includes('inline') || s.includes('break')) return 'content-break';
  return 'content-break';
}

/**
 * @param {HTMLElement} el slot host
 * @param {string} slotId
 */
export function resolveSlotRegion(el, slotId) {
  const fromAttr = normalizeRegion(el.getAttribute('data-wnet-ad-region'));
  if (fromAttr) return fromAttr;
  const fromId = normalizeRegion(slotId);
  if (fromId) return fromId;
  return inferSlotRegionFromId(slotId);
}

const MODULE_BASE = 'wn-ad-module';
const MODULE_PREFIX = 'wn-ad-module--';

function stripModuleClasses(el) {
  [...el.classList].forEach((c) => {
    if (c === MODULE_BASE || c.startsWith(MODULE_PREFIX)) el.classList.remove(c);
  });
}

function applySlotModuleLayout(el, region) {
  stripModuleClasses(el);
  el.classList.add(MODULE_BASE, `${MODULE_PREFIX}${region}`);
}

function buildY2kFallbackBlock(ad) {
  const wrap = document.createElement('div');
  wrap.className = 'wn-ad-css wn-ad-y2k-fallback wn-anim-flash';
  const raw = String(ad.content || '').trim();
  const parts = raw
    .split(/\|/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  const phrases =
    parts.length >= 2
      ? parts
      : [
          raw || 'SPONSORED LINK',
          'CLICK HERE — LIMITED TIME',
          'Y2K WEB SPECIAL'
        ].filter((p, i, a) => p && a.indexOf(p) === i);
  const lineExtra = ['wn-anim-color-cycle', 'wn-anim-glitch', 'wn-anim-flash'];
  phrases.forEach((text, i) => {
    const span = document.createElement('span');
    const rainbow = i % 2 === 1;
    span.className = rainbow
      ? 'wn-ad-y2k-line wn-ad-y2k-line--rainbow'
      : `wn-ad-y2k-line ${lineExtra[i % lineExtra.length]}`;
    span.textContent = text;
    wrap.appendChild(span);
  });
  return wrap;
}

function swapCreativeToY2k(creative, ad) {
  creative.innerHTML = '';
  creative.appendChild(buildY2kFallbackBlock(ad));
}

/**
 * @param {object} ad
 * @param {string} [placementRegion]
 * @returns {{ label: HTMLSpanElement, inner: HTMLDivElement }}
 */
function buildAdElements(ad, placementRegion = '') {
  const labelText = ad.label || AD_RENDER_RULES.label_rules.text;
  const label = document.createElement('span');
  label.className = 'wn-ad-label';
  label.textContent = labelText;

  const inner = document.createElement('div');
  inner.className = 'wn-ad-slot-inner';
  const isRail = placementRegion === 'left-rail' || placementRegion === 'right-rail';
  const rawW = Number(ad.width) || 468;
  const rawH = Number(ad.height) || 60;
  const w = isRail ? Math.min(rawW, 126) : rawW;
  const h = isRail ? Math.min(rawH, 240) : rawH;
  inner.style.width = `${w}px`;
  inner.style.maxWidth = '100%';
  inner.style.minHeight = `${Math.min(Math.max(h, isRail ? 28 : 36), isRail ? 220 : 400)}px`;
  inner.style.background = ad.bgColor || '#ffffcc';
  inner.style.borderColor = ad.borderColor || '#cc9900';
  Object.assign(inner.style, AD_RENDER_RULES.container_styles);
  label.style.fontSize = AD_RENDER_RULES.label_rules.fontSize;
  label.style.color = AD_RENDER_RULES.label_rules.color;
  label.style.textAlign = AD_RENDER_RULES.label_rules.textAlign;
  label.style.letterSpacing = AD_RENDER_RULES.label_rules.letterSpacing;

  const hasLink = !!(ad.link && _navigate);
  const creative = document.createElement(hasLink ? 'a' : 'div');
  creative.className = 'wn-ad-creative wn-ad-fade';
  if (hasLink) {
    creative.href = '#';
    creative.addEventListener('click', (e) => {
      e.preventDefault();
      _navigate(ad.link, ad.linkSubpath != null ? String(ad.linkSubpath) : '', {
        pushHistory: true
      });
    });
  } else {
    creative.setAttribute('aria-disabled', 'true');
  }

  const type = ad.type || 'image';

  if (type === 'gif' || type === 'image') {
    const img = document.createElement('img');
    img.className = 'wn-ad-img';
    img.alt = '';
    img.src = ad.src || '';
    img.width = w;
    img.height = h;
    const onFail = () => swapCreativeToY2k(creative, ad);
    img.addEventListener('error', onFail);
    img.addEventListener('load', () => {
      if (img.naturalWidth < 2 || img.naturalHeight < 2) onFail();
    });
    if (!ad.src) onFail();
    else creative.appendChild(img);
  } else if (type === 'video') {
    const v = document.createElement('video');
    v.className = 'wn-ad-video';
    v.muted = true;
    v.autoplay = true;
    v.loop = true;
    v.playsInline = true;
    v.width = w;
    v.height = h;
    if (ad.poster) v.poster = ad.poster;
    v.src = ad.src || '';
    v.addEventListener('error', () => {
      if (ad.fallbackSrc) {
        v.src = ad.fallbackSrc;
        return;
      }
      swapCreativeToY2k(creative, ad);
    });
    creative.appendChild(v);
    if (!ad.src) swapCreativeToY2k(creative, ad);
  } else if (type === 'css-animation') {
    let name = ad.animation || 'flash';
    if (!ANIM_CLASS[name]) name = Math.random() > 0.5 ? 'flash' : 'scroll-text';
    const div = document.createElement('div');
    div.className = `wn-ad-css ${ANIM_CLASS[name]}`;
    const text = ad.content || 'Sponsored';
    if (name === 'scroll-text') {
      div.innerHTML = `<span>${escapeHtml(text)}</span>`;
    } else if (name === 'typewriter') {
      div.textContent = text;
    } else {
      div.innerHTML = escapeHtml(text);
    }
    creative.appendChild(div);
  }

  inner.appendChild(creative);
  return { label, inner };
}

function mountInto(hostEl, pageKey, slotId, storeId) {
  cleanupHost(hostEl);
  const pool = adsForPageSlot(pageKey, slotId, storeId);
  if (!pool.length) {
    stripModuleClasses(hostEl);
    hostEl.innerHTML = '';
    hostEl.style.display = 'none';
    return;
  }
  hostEl.style.display = '';
  const placement = resolveSlotRegion(hostEl, slotId);
  applySlotModuleLayout(hostEl, placement);
  hostEl.setAttribute('data-wnet-ad-region', placement);

  const rot = pool.map((a) => Number(a.rotationIntervalMs)).find((n) => !Number.isNaN(n) && n > 0);
  const rotMs = rot ?? _defaultRotationMs;

  const paint = () => {
    const ad = weightedPick(pool);
    if (!ad) return;
    const { label, inner } = buildAdElements(ad, placement);
    hostEl.innerHTML = '';
    hostEl.classList.add('wn-ad-mount');
    hostEl.appendChild(label);
    hostEl.appendChild(inner);
    inner.classList.add('is-fading');
    requestAnimationFrame(() => inner.classList.remove('is-fading'));
  };

  paint();
  if (pool.length > 1 && rotMs > 0) {
    hostEl._wnAdInterval = setInterval(paint, rotMs);
  }
}

/**
 * Render one slot (weighted pick + optional rotation).
 * @param {string} pageKey
 * @param {string} slotId
 * @param {HTMLElement} containerElement
 */
export function render(pageKey, slotId, containerElement) {
  mountInto(containerElement, pageKey, slotId, '');
}

/**
 * Find [data-wnet-ad-slot] under root; use closest [data-wn-ad-page] for ad page key when present.
 * @param {HTMLElement} root
 * @param {string} defaultPageKey WorldNet page id (e.g. home)
 */
export function mountPage(root, defaultPageKey) {
  if (!root) return;
  root.querySelectorAll('[data-wnet-ad-slot]').forEach((el) => {
    const slotId = el.getAttribute('data-wnet-ad-slot') || '';
    const { page, storeId } = resolveAdPageAndStore(el, defaultPageKey);
    mountInto(el, page, slotId, storeId);
  });
}

/**
 * @param {object | null} json parsed ads.json
 * @param {{ navigate: WnNavigateFn }} deps
 */
export function initWorldNetAds(json, deps) {
  _navigate = deps.navigate;
  _suppressedBaseIds.clear();
  _runtime.clear();
  if (json && Array.isArray(json.ads)) {
    _baseAds = json.ads
      .map((ad) => {
        const { errors, normalized } = validateAdConfig(ad);
        return errors.length ? null : normalized;
      })
      .filter(Boolean);
    _defaultRotationMs = Number(json.defaultRotationMs) || 8000;
  } else {
    _baseAds = [];
  }
}

/**
 * Runtime register (add or replace creative for pipeline agents).
 * @param {object} adConfig full ad object including id
 */
export function register(adConfig) {
  if (!adConfig?.id) return;
  const { errors, normalized } = validateAdConfig(adConfig);
  if (errors.length) return;
  _suppressedBaseIds.delete(String(adConfig.id));
  _runtime.set(String(adConfig.id), { ...normalized });
}

/**
 * @param {string} adId
 */
export function unregister(adId) {
  const id = String(adId);
  _runtime.delete(id);
  _suppressedBaseIds.add(id);
}

/**
 * @param {string} adId
 * @param {object} newConfig partial ad fields
 */
export function update(adId, newConfig) {
  const id = String(adId);
  const cur = _runtime.get(id) || _baseAds.find((a) => a.id === id) || { id };
  const merged = { ...cur, ...newConfig, id };
  const { errors, normalized } = validateAdConfig(merged);
  if (errors.length) return;
  _runtime.set(id, normalized);
  _suppressedBaseIds.delete(id);
}

/**
 * @returns {{
 *   render: typeof render,
 *   mountPage: typeof mountPage,
 *   register: typeof register,
 *   unregister: typeof unregister,
 *   update: typeof update,
 *   getSlotRegions: () => string[],
 *   getAdPlacements: typeof listAdPlacements,
 *   getAdSizes: typeof listAdSizes,
 *   resolveSlotRegion: typeof resolveSlotRegion,
 *   inferSlotRegionFromId: typeof inferSlotRegionFromId
 * }}
 */
export function getAdsApi() {
  return {
    render,
    mountPage,
    register,
    unregister,
    update,
    getSlotRegions: () => [...AD_SLOT_REGIONS],
    getAdPlacements: listAdPlacements,
    getAdSizes: listAdSizes,
    resolveSlotRegion,
    inferSlotRegionFromId
  };
}
