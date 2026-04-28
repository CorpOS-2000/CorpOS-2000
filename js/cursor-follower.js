/**
 * Software CorpOS cursor — Chromium/Electron on Windows often ignores
 * cursor:url() for local PNGs. We hide the OS cursor and follow with <img>.
 *
 * rAF-coalesced position (subpixel), dual-layer crossfade on sprite change,
 * slightly enlarged hit display vs 32px source art.
 */

const SPRITES = {
  arrow: 'assets/cursors/corpos-arrow.png',
  pressed: 'assets/cursors/corpos-arrow-pressed.png',
  ibeam: 'assets/cursors/corpos-ibeam.png',
  wait: 'assets/cursors/corpos-wait.png'
};

/** Hotspots in source-pixel space (sprites are 32×32). */
const HOTSPOTS_32 = {
  arrow: [0, 0],
  pressed: [1, 1],
  ibeam: [15, 15],
  wait: [8, 8]
};

/** Logical size of source PNGs (for hotspot math). */
const SRC = 32;
/** On-screen cursor size — slightly larger than 32px art. */
const DISPLAY = 36;
const HOTSPOT_SCALE = DISPLAY / SRC;

let rootEl = null;
let stackEl = null;
/** @type {HTMLImageElement[]} */
let layerEls = [];
let visibleLayer = 0;
let displayedSpriteKey = 'arrow';
/** Guards async decode so rapid sprite changes do not apply stale swaps. */
let spriteSwapGen = 0;
let urls = {};
let pointerDown = false;
let busyObserver = null;

let rafId = null;
/** @type {PointerEvent | MouseEvent | null} */
let pendingPointerEv = null;

function resolveUrl(rel) {
  try {
    return new URL(rel, window.location.href).href;
  } catch {
    return rel;
  }
}

function scaledHotspot(mode) {
  const [hx, hy] = HOTSPOTS_32[mode] || HOTSPOTS_32.arrow;
  return [hx * HOTSPOT_SCALE, hy * HOTSPOT_SCALE];
}

function isTextLikeTarget(el) {
  if (!el || typeof el.closest !== 'function') return false;
  const t = el.closest(
    'input, textarea, [contenteditable="true"], .wn-addr, .bcb-addr'
  );
  if (!t) return false;
  if (t.matches('[contenteditable="true"]') || t.matches('textarea')) return true;
  if (!t.matches('input')) return false;
  const ty = (t.getAttribute('type') || 'text').toLowerCase();
  if (['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(ty)) {
    return false;
  }
  return ['text', 'password', 'search', 'email', 'url', 'number', 'tel', 'date', 'time', 'datetime-local'].includes(ty) || ty === '';
}

/** @returns {'resize'|'grab'|'grabbing'|'move'|null} */
function nativeCursorMode(el, ev) {
  if (!el || el.nodeType !== 1) return null;
  if (el.closest('#corpos-cursor-root')) return null;

  if (el.closest('.wrz')) return 'resize';
  if (el.closest('.mm-picker-canvas')) return 'grab';

  const inv = el.closest('.wx-inv-item');
  if (inv) return ev && (ev.buttons & 1) ? 'grabbing' : 'grab';

  const mod = el.closest('.wx-module');
  if (mod) return 'grab';

  const wtb = el.closest('.wtb');
  if (wtb && !el.closest('.wcb')) return 'move';

  return null;
}

function applyStackPosition(clientX, clientY, mode) {
  const [hx, hy] = scaledHotspot(mode);
  stackEl.style.transform = `translate3d(${clientX - hx}px, ${clientY - hy}px, 0)`;
}

function pickSprite(el) {
  if (isTextLikeTarget(el)) return 'ibeam';
  if (pointerDown) return 'pressed';
  return 'arrow';
}

/** Avoid elementFromPoint on large pages (e.g. YourSpace) — it forces full hit-test every frame. */
function hitTargetFromEvent(e, clientX, clientY) {
  if (e && e.target != null) {
    let t = /** @type {Node} */ (e.target);
    if (t.nodeType === Node.TEXT_NODE) t = t.parentElement;
    if (t && t.nodeType === Node.ELEMENT_NODE) return /** @type {Element} */ (t);
  }
  return document.elementFromPoint(clientX, clientY);
}

/**
 * @param {string} key
 * @param {() => void} [onDone]
 */
function showSpriteKey(key, onDone) {
  if (!layerEls.length) return;
  if (key === displayedSpriteKey) {
    onDone?.();
    return;
  }

  const href = urls[key];
  if (!href) {
    onDone?.();
    return;
  }

  const swapId = ++spriteSwapGen;
  const hidden = 1 - visibleLayer;
  const showEl = layerEls[hidden];
  const hideEl = layerEls[visibleLayer];

  const applySwap = () => {
    if (swapId !== spriteSwapGen) return;
    hideEl.classList.remove('is-visible');
    showEl.classList.add('is-visible');
    visibleLayer = hidden;
    displayedSpriteKey = key;
    onDone?.();
  };

  showEl.setAttribute('src', href);
  const p = showEl.decode?.();
  if (p && typeof p.then === 'function') {
    p.then(applySwap).catch(applySwap);
  } else if (showEl.complete && showEl.naturalWidth > 0) {
    applySwap();
  } else {
    showEl.onload = () => {
      showEl.onload = null;
      showEl.onerror = null;
      applySwap();
    };
    showEl.onerror = () => {
      showEl.onload = null;
      showEl.onerror = null;
      applySwap();
    };
  }
}

function paint() {
  if (!rootEl || !stackEl) return;

  const e =
    pendingPointerEv ||
    window.__corposLastPointerEv || {
      clientX: Math.floor(window.innerWidth / 2),
      clientY: Math.floor(window.innerHeight / 2),
      buttons: 0
    };

  const x = e.clientX;
  const y = e.clientY;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) {
    rootEl.style.visibility = 'hidden';
    return;
  }

  const target = hitTargetFromEvent(e, x, y);

  if (document.body.classList.contains('corpos-busy')) {
    rootEl.style.visibility = 'visible';
    applyStackPosition(x, y, 'wait');
    showSpriteKey('wait', () => applyStackPosition(x, y, 'wait'));
    return;
  }

  const native = nativeCursorMode(target, e);
  if (native) {
    rootEl.style.visibility = 'hidden';
    return;
  }

  rootEl.style.visibility = 'visible';

  const sprite = pickSprite(target);
  applyStackPosition(x, y, sprite);
  showSpriteKey(sprite, () => applyStackPosition(x, y, sprite));
}

function schedulePaint() {
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    paint();
  });
}

function refresh(ev) {
  if (ev) window.__corposLastPointerEv = ev;
  if (ev) pendingPointerEv = ev;
  schedulePaint();
}

function onPointer(ev) {
  pendingPointerEv = ev;
  window.__corposLastPointerEv = ev;
  schedulePaint();
}

function onPointerDown(ev) {
  pointerDown = true;
  onPointer(ev);
}

function onPointerUp(ev) {
  pointerDown = false;
  onPointer(ev);
}

function preloadSprites() {
  for (const u of Object.values(urls)) {
    const im = new Image();
    im.src = u;
  }
}

export function initCorpOsCursorFollower() {
  if (typeof document === 'undefined') return;
  if (document.documentElement.classList.contains('corpos-soft-cursor')) return;

  for (const [k, v] of Object.entries(SPRITES)) {
    urls[k] = resolveUrl(v);
  }
  preloadSprites();

  rootEl = document.createElement('div');
  rootEl.id = 'corpos-cursor-root';
  rootEl.setAttribute('aria-hidden', 'true');

  stackEl = document.createElement('div');
  stackEl.id = 'corpos-cursor-stack';

  for (let i = 0; i < 2; i++) {
    const im = document.createElement('img');
    im.className = 'corpos-cursor-layer';
    im.alt = '';
    im.draggable = false;
    im.decoding = 'async';
    im.setAttribute('src', urls.arrow);
    if (i === 0) im.classList.add('is-visible');
    stackEl.appendChild(im);
    layerEls.push(im);
  }
  visibleLayer = 0;
  displayedSpriteKey = 'arrow';

  rootEl.appendChild(stackEl);
  document.documentElement.appendChild(rootEl);
  document.documentElement.classList.add('corpos-soft-cursor');

  window.addEventListener('pointermove', onPointer, { capture: true, passive: true });
  window.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  window.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
  window.addEventListener('pointercancel', onPointerUp, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => refresh(), { passive: true });

  busyObserver = new MutationObserver(() => refresh());
  busyObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  refresh({
    clientX: Math.floor(window.innerWidth / 2),
    clientY: Math.floor(window.innerHeight / 2),
    buttons: 0
  });
}
