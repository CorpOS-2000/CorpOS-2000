/**
 * WorldNet Shopping — JSON store templates, cart/checkout, banking, deliveries, SMS.
 * @see window.WorldNet.shop after initWorldNet completes.
 */

import { escapeHtml } from './identity.js';
import { toast, ToastManager } from './toast.js';
import {
  getState,
  patchState,
  appendBankingTransaction,
  SIM_HOUR_MS
} from './gameState.js';
import { registerWorldNetShopHost } from './worldnet-routes.js';
import { smsToPlayer } from './black-cherry.js';
import { getSiteByPageKey } from './worldnet-site-registry.js';
import { addToPlayerInventory, inferCategoryFromProduct } from './warehouse-tick.js';
import { syncShopProductRowToStockroom } from './webex-stockroom-sync.js';
import { productVisualDataUri } from './product-visuals.js';
import { resolveScamPurchase } from './scam-purchases.js';
import { recordConversion } from './ad-analytics.js';
import { recordPurchase } from './market-dynamics.js';
import { ensureAmazoneRivalProducts } from './amazone-rival-catalog.js';

/** @type {Map<string, object>} */
const _stores = new Map();

/** @param {{ id?: string, title?: string, categoryId?: string }} p */
function productThumbImgHtml(p, imgClass = 'wn-shop-card-img-pic') {
  const uri = productVisualDataUri({
    id: p.id,
    title: p.title,
    categoryId: p.categoryId
  });
  return `<img class="${imgClass}" src="${uri}" alt="" draggable="false"/>`;
}

/** @type {(key: string, sub?: string, opts?: { pushHistory?: boolean }) => void} */
let _navigate = () => {};

function stockKey(storeId, productId) {
  return `${storeId}:${productId}`;
}

export function parseShopSubPath(raw) {
  const parts = String(raw || '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  const storeId = parts[0] || '';
  const segments = parts.slice(1);
  return { storeId, segments };
}

/**
 * Public URL for address bar sync (shop uses per-store host).
 * @param {string} subPath e.g. rapidmart/cart
 * @returns {string}
 */
export function urlForShopSubPath(subPath) {
  const { storeId, segments } = parseShopSubPath(subPath);
  const st = _stores.get(storeId);
  if (!st?.publicHost) return '';
  const host = String(st.publicHost).replace(/^\/*/, '').replace(/\/$/, '');
  const path = segments.length ? `/${segments.join('/')}` : '/';
  return `http://${host}${path}`;
}

/**
 * Window title for favorites / chrome.
 * @param {string} subPath
 */
export function shopBrowserTitle(subPath) {
  const { storeId, segments } = parseShopSubPath(subPath);
  const store = _stores.get(storeId);
  const name = store?.name || 'Shop';
  const v = segments[0] || 'home';
  if (v === 'home' || v === '') return `${name} — Home`;
  if (v === 'cart') return `${name} — Cart`;
  if (v === 'checkout') return `${name} — Checkout`;
  if (v === 'confirm' && segments[1]) return `${name} — Order ${segments[1]}`;
  if (v === 'category' && segments[1])
    return `${name} — ${store?.categories?.find((c) => c.id === segments[1])?.name || segments[1]}`;
  if (v === 'product' && segments[1]) {
    const p = store?.productsById?.[segments[1]];
    return p ? `${name} — ${p.title}` : name;
  }
  return name;
}

function money(n) {
  const x = Number(n);
  if (Number.isNaN(x)) return '$0.00';
  return `$${x.toFixed(2)}`;
}

function getLiveStock(storeId, productId) {
  const k = stockKey(storeId, productId);
  const v = getState().worldNetProductStock[k];
  return v == null ? 0 : Number(v);
}

function cartLineCount(storeId) {
  const lines = getState().worldNetShopping?.carts?.[storeId]?.lines || [];
  return lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
}

function fmtSimEtaHours(deliverBySimMs) {
  const now = getState().sim?.elapsedMs ?? 0;
  const h = Math.max(0, Math.ceil((deliverBySimMs - now) / SIM_HOUR_MS));
  return `${h} sim hour${h === 1 ? '' : 's'}`;
}

function layoutWrapper(store, innerHtml, adPageKey) {
  const storeId = escapeHtml(store.id);
  const adPg = escapeHtml(adPageKey);
  const themeExtra =
    store.themeClass && /^[a-zA-Z0-9_-]+$/.test(String(store.themeClass))
      ? ` ${String(store.themeClass)}`
      : '';
  return `<div class="wn-shop-root iebody${themeExtra}" data-wn-shop-root="1" data-wn-ad-page="${adPg}" data-wn-ad-store="${storeId}">
${innerHtml}
</div>`;
}

/** Y2K-style department strip for Amazone (matches classic nav tabs). */
function amazoneDepartmentStrip(store) {
  if (store.id !== 'amazone') return '';
  const sid = store.id;
  const tabs = [
    ['books', 'Books'],
    ['music', 'Music'],
    ['dvd_video', 'DVD / Video'],
    ['electronics', 'Electronics'],
    ['auctions', 'Auctions'],
    ['zshops', 'zShops']
  ];
  const parts = tabs.map(
    ([cid, label]) => linkShop(sid, `${sid}/category/${cid}`, label)
  );
  parts.push(linkShop(sid, `${sid}/home`, 'All departments'));
  parts.push(linkShop(sid, `${sid}/cart`, 'Cart'));
  return `<div class="wn-shop-amazone-deptnav" role="navigation">${parts.join(
    ' <span class="wn-shop-amazone-sep">|</span> '
  )}</div>`;
}

function mapAmazoneRivalCategoryToShelf(raw) {
  const c = String(raw || '').toLowerCase();
  if (!c) return 'general';
  if (c.includes('book')) return 'books';
  if (c.includes('music')) return 'music';
  if (c.includes('dvd') || c.includes('video') || c.includes('vhs') || c.includes('film'))
    return 'dvd_video';
  if (c.includes('electron')) return 'electronics';
  if (c.includes('auction')) return 'auctions';
  if (c.includes('zshop') || c.includes('marketplace')) return 'zshops';
  if (c.includes('home') || c.includes('kitchen') || c.includes('desk')) return 'home';
  if (c.includes('software') || c.includes('game')) return 'software';
  if (c.includes('toy')) return 'toys';
  if (c.includes('sport')) return 'sports';
  if (c.includes('subscription')) return 'subscription';
  if (c.includes('service')) return 'service';
  if (c.includes('advertis') || c.includes('sponsor')) return 'advertising';
  if (c.includes('logistic') || c.includes('fulfill')) return 'logistics';
  if (c.includes('food') || c.includes('grocer') || c.includes('fresh')) return 'food';
  if (c.includes('fintech') || c.includes('payment')) return 'fintech';
  if (c.includes('consumer')) return 'consumer';
  if (c.includes('education') || c.includes('training') || c.includes('cert')) return 'education';
  if (c.includes('hardware') || c.includes('computer')) return 'hardware';
  if (c.includes('office')) return 'office';
  return 'general';
}

/** Extra SKUs so sparse shelves stay full (does not replace rival JSON data). */
const AMAZONE_EXTRA_SKUS = [
  {
    id: 'amazone-sk-stapler',
    title: 'Heavy-Duty Stapler — “Audit Ready”',
    description: 'Bundled with 500 stainless vows to staple responsibly.',
    price: 24.99,
    categoryId: 'office',
    stockCount: 40,
    tags: ['amazone', 'office']
  },
  {
    id: 'amazone-sk-pencils',
    title: 'No. 2 Pencils — Gross Pack',
    description: 'Pre-sharpened for standardized tests and standardized lives.',
    price: 8.99,
    categoryId: 'office',
    stockCount: 120,
    tags: ['amazone', 'office']
  },
  {
    id: 'amazone-sk-toner',
    title: 'Laser Toner — “Almost Compatible”',
    description: 'Works with most printers until it doesn’t.',
    price: 69,
    categoryId: 'office',
    stockCount: 22,
    tags: ['amazone', 'office']
  },
  {
    id: 'amazone-sk-mousepad',
    title: 'Ergonomic Gel Mouse Pad — Cobalt Swirl',
    description: 'Wrist depression molded by ergonomics interns.',
    price: 16.5,
    categoryId: 'office',
    stockCount: 55,
    tags: ['amazone', 'office']
  },
  {
    id: 'amazone-sk-labelmaker',
    title: 'Electronic Label Maker LT-2000',
    description: 'Tape cartridges sold separately. Anxiety included.',
    price: 44,
    categoryId: 'electronics',
    stockCount: 28,
    tags: ['amazone', 'electronics']
  },
  {
    id: 'amazone-sk-lamp',
    title: 'Architect Swing-Arm Desk Lamp — Brass Finish',
    description: 'Halogen bulb runs hot enough to simulate ambition.',
    price: 39.99,
    categoryId: 'home',
    stockCount: 33,
    tags: ['amazone', 'home']
  },
  {
    id: 'amazone-sk-mug',
    title: 'WorldNet Explorer Celebrity Mug',
    description: 'Thermal ink fades when you admit you use competing browsers.',
    price: 11.99,
    categoryId: 'home',
    stockCount: 80,
    tags: ['amazone', 'home']
  },
  {
    id: 'amazone-sk-backpack',
    title: 'Cordura Laptop Backpack — “Southside Commuter”',
    description: 'Padded sleeve fits most Y2K slabs under 8 lbs.',
    price: 59.99,
    categoryId: 'consumer',
    stockCount: 44,
    tags: ['amazone', 'consumer']
  },
  {
    id: 'amazone-sk-water',
    title: 'Bottled Water — 24-Pack “Harbor Mist”',
    description: 'Filtered through marketing copy.',
    price: 7.49,
    categoryId: 'food',
    stockCount: 200,
    tags: ['amazone', 'food']
  },
  {
    id: 'amazone-sk-energy',
    title: 'Citrus Lightning Energy Drink — Case of 12',
    description: 'Warning: may cause belief in overnight shipping.',
    price: 18.99,
    categoryId: 'food',
    stockCount: 90,
    tags: ['amazone', 'food']
  },
  {
    id: 'amazone-sk-yoga',
    title: 'Foam Yoga Block — Set of 2',
    description: 'Achieve inner peace between quarterly filings.',
    price: 21,
    categoryId: 'sports',
    stockCount: 36,
    tags: ['amazone', 'sports']
  },
  {
    id: 'amazone-sk-dumbbell',
    title: 'Neoprene Dumbbell Pair — 10 lb',
    description: 'Tone delts while downloading RealAudio.',
    price: 27.99,
    categoryId: 'sports',
    stockCount: 24,
    tags: ['amazone', 'sports']
  },
  {
    id: 'amazone-sk-puzzle',
    title: '1500-Piece Jigsaw — “Harbor at Dusk”',
    description: 'Includes one factory-defect edge piece for realism.',
    price: 15.99,
    categoryId: 'toys',
    stockCount: 48,
    tags: ['amazone', 'toys']
  },
  {
    id: 'amazone-sk-radio',
    title: 'AM/FM Portable Radio — Telescopic Pride',
    description: 'Picks up emergency broadcasts and lonely truckers.',
    price: 22,
    categoryId: 'electronics',
    stockCount: 41,
    tags: ['amazone', 'electronics']
  },
  {
    id: 'amazone-sk-lan',
    title: 'Cat-5 Patch Cable — 25 ft Aqua',
    description: 'Certified for LAN parties up to moderate sabotage.',
    price: 9.99,
    categoryId: 'hardware',
    stockCount: 150,
    tags: ['amazone', 'hardware']
  },
  {
    id: 'amazone-sk-hub',
    title: '4-Port Ethernet Hub — Store-and-Forward Dreams',
    description: 'Half-duplex nostalgia in brushed plastic.',
    price: 34,
    categoryId: 'hardware',
    stockCount: 18,
    tags: ['amazone', 'hardware']
  },
  {
    id: 'amazone-sk-cert-prep',
    title: 'CorpOS Operator Exam Flash Cards — Deluxe Tin',
    description: '800 cards. Zero guarantees.',
    price: 42,
    categoryId: 'education',
    stockCount: 30,
    tags: ['amazone', 'education']
  },
  {
    id: 'amazone-sk-giftcard',
    title: 'Amazone Gift Certificate — $25 plastic',
    description: 'Redeemable for anything we remember to ship.',
    price: 25,
    categoryId: 'general',
    stockCount: 999,
    tags: ['amazone', 'gift']
  },
  {
    id: 'amazone-sk-zshop-slot',
    title: 'zShops Featured Listing — 7 Days',
    description: 'Boost visibility in the zShops bargain bin universe.',
    price: 12.99,
    categoryId: 'zshops',
    stockCount: 500,
    tags: ['amazone', 'seller']
  },
  {
    id: 'amazone-sk-auction-snipe',
    title: 'Auction Sniping Browser Toolbar — CD-ROM',
    description: 'Live at the edge of dial-up latency.',
    price: 19,
    categoryId: 'auctions',
    stockCount: 60,
    tags: ['amazone', 'auctions']
  }
];

/**
 * After rivals load: merge Amazone Corp SKUs into the WorldNet shop + extras.
 * Safe to call multiple times (skips existing product ids).
 */
export function hydrateAmazoneWorldNetStore() {
  ensureAmazoneRivalProducts();
  const store = _stores.get('amazone');
  if (!store) return;

  const rivals = (getState().rivalProducts || []).filter((p) => p.companyId === 'amazone-corp');
  for (const rp of rivals) {
    if (store.productsById[rp.id]) continue;
    const categoryId = mapAmazoneRivalCategoryToShelf(rp.category);
    addProduct('amazone', {
      id: rp.id,
      title: rp.name,
      description: rp.description || '',
      price: Math.max(0, Number(rp.priceUsd) || 0),
      categoryId,
      tags: rp.tags || [],
      stockCount: Math.max(12, 40 + (Number(rp.quality) % 50))
    });
  }

  for (const row of AMAZONE_EXTRA_SKUS) {
    if (store.productsById[row.id]) continue;
    addProduct('amazone', { ...row });
  }

  const feat = ['amazone-prime', 'amazone-cloud', 'amazone-pay'].filter((id) => store.productsById[id]);
  if (feat.length) store.featuredProductIds = feat;
}

/**
 * Map store template slot names to Y2K placement modules (optional explicit region).
 */
function regionForStoreAdSlot(slot) {
  const s = String(slot || '').toLowerCase();
  if (s.includes('left-rail')) return 'left-rail';
  if (s.includes('right-rail') || s === 'sidebar') return 'right-rail';
  if (s.includes('paired-half')) return 'paired-half-banners';
  if (s.includes('above-footer') || s.includes('footer')) return 'above-footer';
  if (s.includes('below-header') || s.includes('leaderboard')) return 'below-header';
  if (s.includes('sidebar')) return 'content-sidebar';
  if (s.includes('badge')) return 'footer-badges';
  if (s.includes('content') || s.includes('inline')) return 'content-break';
  return 'content-break';
}

function adBannerSlot(slot) {
  const reg = regionForStoreAdSlot(slot);
  return `<div data-wnet-ad-slot="${escapeHtml(slot)}" data-wnet-ad-region="${escapeHtml(reg)}"></div>`;
}

function shippingBannerHtml(store, subtotal) {
  const th = Number(store.freeShippingThreshold);
  if (Number.isNaN(th) || th <= 0) return '';
  const ok = subtotal >= th;
  return `<div class="wn-shop-ship-banner${ok ? ' wn-shop-ship-banner--ok' : ''}">
  ${ok ? '&#9989; FREE SHIPPING unlocked for this cart!' : `Add ${money(th - subtotal)} more for FREE SHIPPING (orders ${money(th)}+).`}
</div>`;
}

/**
 * @param {string} subPath
 */
export function renderShopHtml(subPath) {
  const { storeId, segments } = parseShopSubPath(subPath);
  const store = _stores.get(storeId);
  if (!store) {
    return `<div class="iebody"><h2>Store not found</h2><p class="wn-shop-muted"><a data-nav="home" href="#">Wahoo! Home</a></p></div>`;
  }

  const view = (segments[0] || 'home').toLowerCase();
  if (view === 'home' || view === '') return renderHome(store);
  if (view === 'category' && segments[1]) return renderCategory(store, segments[1]);
  if (view === 'product' && segments[1]) return renderProduct(store, segments[1]);
  if (view === 'cart') return renderCart(store);
  if (view === 'checkout') return renderCheckout(store);
  if (view === 'confirm' && segments[1]) return renderConfirm(store, segments[1]);
  return renderHome(store);
}

function linkShop(storeId, pathWithin, label) {
  const sub = pathWithin.includes('/') ? pathWithin : `${storeId}/${pathWithin}`;
  return `<a data-nav="wn_shop" data-wnet-subpath="${escapeHtml(sub)}" href="#">${label}</a>`;
}

function renderHome(store) {
  const sid = store.id;
  const adPage = `${sid}_home`;
  const feat = (store.featuredProductIds || [])
    .map((id) => store.productsById[id])
    .filter(Boolean);
  const cats = store.categories || [];
  const badge = cartLineCount(sid);
  const inner = `
<div class="wn-shop-banner-row">${adBannerSlot('below-header')}</div>
${amazoneDepartmentStrip(store)}
<div class="wn-shop-header">
  <div>
    <div class="wn-shop-logo">${escapeHtml(store.name)}</div>
    <div class="wn-shop-tag">${escapeHtml(store.tagline || '')}</div>
  </div>
  <div class="wn-shop-header-actions">
    ${linkShop(sid, `${sid}/cart`, `Cart${badge ? ` (${badge})` : ''}`)}
  </div>
</div>
<div class="wn-shop-layout">
  <main class="wn-shop-main">
    <p class="wn-shop-crumb">${linkShop(sid, `${sid}/home`, 'Home')}</p>
    <h1 class="wn-shop-h1">Welcome — Featured specials</h1>
    <div class="wn-shop-grid">
      ${feat
        .map(
          (p) => `
      <div class="wn-shop-card">
        <div class="wn-shop-card-img">${productThumbImgHtml(p)}</div>
        <div class="wn-shop-card-body">
          <div class="wn-shop-card-title">${linkShop(sid, `${sid}/product/${p.id}`, escapeHtml(p.title))}</div>
          <div class="wn-shop-price-row">${priceRowInner(p)}</div>
          <div class="wn-shop-stock">${stockLine(sid, p)}</div>
        </div>
      </div>`
        )
        .join('')}
    </div>
  </main>
  <aside class="wn-shop-aside">
    <div class="wn-shop-side-cat">
      <div class="wn-shop-side-title">Categories</div>
      <ul class="wn-shop-cat-list">
        ${cats
          .map(
            (c) =>
              `<li>${linkShop(sid, `${sid}/category/${c.id}`, escapeHtml(c.name))}</li>`
          )
          .join('')}
      </ul>
    </div>
    ${adBannerSlot('right-rail-primary')}
  </aside>
</div>`;
  return layoutWrapper(store, inner, adPage);
}

function renderCategory(store, catId) {
  const sid = store.id;
  const adPage = `${sid}_category`;
  const cat = (store.categories || []).find((c) => c.id === catId);
  const prods = Object.values(store.productsById || {}).filter((p) => p.categoryId === catId);
  const badge = cartLineCount(sid);
  const inner = `
<div class="wn-shop-header">
  <div><div class="wn-shop-logo">${escapeHtml(store.name)}</div></div>
  <div class="wn-shop-header-actions">${linkShop(sid, `${sid}/cart`, `Cart${badge ? ` (${badge})` : ''}`)}</div>
</div>
${amazoneDepartmentStrip(store)}
<div class="wn-shop-layout">
  <main class="wn-shop-main">
    <p class="wn-shop-crumb">${linkShop(sid, `${sid}/home`, 'Home')} &raquo; ${escapeHtml(cat?.name || catId)}</p>
    <h1 class="wn-shop-h1">${escapeHtml(cat?.name || 'Category')}</h1>
    <div class="wn-shop-banner-row wn-shop-banner-row--inline">${adBannerSlot('content-break')}</div>
    <div class="wn-shop-grid">
      ${prods
        .map(
          (p) => `
      <div class="wn-shop-card">
        <div class="wn-shop-card-img">${productThumbImgHtml(p)}</div>
        <div class="wn-shop-card-body">
          <div class="wn-shop-card-title">${linkShop(sid, `${sid}/product/${p.id}`, escapeHtml(p.title))}</div>
          <div class="wn-shop-price-row">${priceRowInner(p)}</div>
          <div class="wn-shop-stock">${stockLine(sid, p)}</div>
        </div>
      </div>`
        )
        .join('')}
    </div>
  </main>
  <aside class="wn-shop-aside">
    <div class="wn-shop-side-cat"><div class="wn-shop-side-title">Categories</div>
    <ul class="wn-shop-cat-list">${(store.categories || [])
      .map((c) => `<li>${linkShop(sid, `${sid}/category/${c.id}`, escapeHtml(c.name))}</li>`)
      .join('')}</ul></div>
    ${adBannerSlot('right-rail-primary')}
  </aside>
</div>`;
  return layoutWrapper(store, inner, adPage);
}

function priceRowInner(p) {
  const sale = p.salePrice != null && !Number.isNaN(Number(p.salePrice));
  if (sale) {
    return `<span class="wn-shop-price-sale">${money(p.salePrice)}</span> <span class="wn-shop-price-was">${money(p.price)}</span>`;
  }
  return `<span class="wn-shop-price">${money(p.price)}</span>`;
}

function unitPrice(p) {
  if (p.salePrice != null && !Number.isNaN(Number(p.salePrice))) return Number(p.salePrice);
  return Number(p.price) || 0;
}

function stockLine(storeId, p) {
  const n = getLiveStock(storeId, p.id);
  return `${n} remaining`;
}

function renderProduct(store, productId) {
  const sid = store.id;
  const adPage = `${sid}_product`;
  const p = store.productsById[productId];
  if (!p) {
    return layoutWrapper(
      store,
      `<p>Product not found. ${linkShop(sid, `${sid}/home`, 'Home')}</p>`,
      `${sid}_product`
    );
  }
  const subtotal = cartSubtotal(sid);
  const related = Object.values(store.productsById).filter(
    (x) => x.categoryId === p.categoryId && x.id !== p.id
  );
  const badge = cartLineCount(sid);
  const inner = `
${shippingBannerHtml(store, subtotal)}
<div class="wn-shop-header">
  <div><div class="wn-shop-logo">${escapeHtml(store.name)}</div></div>
  <div class="wn-shop-header-actions">${linkShop(sid, `${sid}/cart`, `Cart${badge ? ` (${badge})` : ''}`)}</div>
</div>
${amazoneDepartmentStrip(store)}
<div class="wn-shop-layout">
  <main class="wn-shop-main">
    <p class="wn-shop-crumb">${linkShop(sid, `${sid}/home`, 'Home')} &raquo; ${linkShop(
    sid,
    `${sid}/category/${p.categoryId}`,
    escapeHtml(store.categories?.find((c) => c.id === p.categoryId)?.name || p.categoryId)
  )} &raquo; ${escapeHtml(p.title)}</p>
    <div class="wn-shop-product">
      <div class="wn-shop-product-visual">${productThumbImgHtml(p, 'wn-shop-product-visual-pic')}</div>
      <div>
        <h1 class="wn-shop-h1">${escapeHtml(p.title)}</h1>
        <div class="wn-shop-price-row big">${priceRowInner(p)}</div>
        <p class="wn-shop-stock">${stockLine(sid, p)}</p>
        <p class="wn-shop-desc">${escapeHtml(p.description || '')}</p>
        <div class="wn-shop-add-row">
          <label>Qty <input type="number" class="wn-shop-qty" id="wn-shop-qty" value="1" min="1" max="99"></label>
          <button type="button" class="wn-shop-btn" data-shop-add data-shop-store="${escapeHtml(
            sid
          )}" data-shop-product="${escapeHtml(p.id)}">Add to Cart</button>
        </div>
        <div class="wn-shop-banner-row wn-shop-banner-row--inline">${adBannerSlot('content-break')}</div>
        <h2 class="wn-shop-h2">Related</h2>
        <ul class="wn-shop-related">
          ${related
            .slice(0, 4)
            .map(
              (r) =>
                `<li>${linkShop(sid, `${sid}/product/${r.id}`, escapeHtml(r.title))} — ${money(
                  unitPrice(r)
                )}</li>`
            )
            .join('')}
        </ul>
      </div>
    </div>
  </main>
  <aside class="wn-shop-aside">
    ${adBannerSlot('right-rail-primary')}
  </aside>
</div>`;
  return layoutWrapper(store, inner, adPage);
}

function cartSubtotal(storeId) {
  const st = getState();
  const lines = st.worldNetShopping?.carts?.[storeId]?.lines || [];
  const store = _stores.get(storeId);
  if (!store) return 0;
  let t = 0;
  for (const l of lines) {
    const p = store.productsById[l.productId];
    if (!p) continue;
    t += unitPrice(p) * (Number(l.qty) || 0);
  }
  return t;
}

function renderCart(store) {
  const sid = store.id;
  const adPage = `${sid}_cart`;
  const st = getState();
  const lines = st.worldNetShopping?.carts?.[sid]?.lines || [];
  const rows = [];
  for (const l of lines) {
    const p = store.productsById[l.productId];
    if (!p) continue;
    const lineTot = unitPrice(p) * (Number(l.qty) || 0);
    rows.push(`<tr>
  <td>${linkShop(sid, `${sid}/product/${p.id}`, escapeHtml(p.title))}</td>
  <td>${money(unitPrice(p))}</td>
  <td><input type="number" class="wn-shop-qty-input" data-shop-line-qty data-shop-store="${escapeHtml(
    sid
  )}" data-shop-product="${escapeHtml(p.id)}" value="${Number(l.qty) || 0}" min="0" max="999"></td>
  <td>${money(lineTot)}</td>
  <td><button type="button" class="wn-shop-btn-small" data-shop-remove data-shop-store="${escapeHtml(
    sid
  )}" data-shop-product="${escapeHtml(p.id)}">Remove</button></td>
</tr>`);
  }
  const sub = cartSubtotal(sid);
  const inner = `
<div class="wn-shop-header">
  <div><div class="wn-shop-logo">${escapeHtml(store.name)} — Cart</div></div>
  <div class="wn-shop-header-actions">${linkShop(sid, `${sid}/home`, 'Continue shopping')}</div>
</div>
${shippingBannerHtml(store, sub)}
${amazoneDepartmentStrip(store)}
<div class="wn-shop-main solo">
  <table class="wn-shop-table">
    <tr><th>Item</th><th>Price</th><th>Qty</th><th>Line</th><th></th></tr>
    ${rows.join('') || '<tr><td colspan="5">Your cart is empty.</td></tr>'}
  </table>
  <div class="wn-shop-cart-foot">
    <div><b>Subtotal:</b> ${money(sub)}</div>
    <div class="wn-shop-cart-actions">
      <a data-nav="wn_shop" data-wnet-subpath="${escapeHtml(`${sid}/checkout`)}" class="wn-shop-btn" href="#">Checkout</a>
    </div>
  </div>
</div>`;
  return layoutWrapper(store, inner, adPage);
}

function renderCheckout(store) {
  const sid = store.id;
  const adPage = `${sid}_checkout`;
  const st = getState();
  const player = st.player || {};
  const lines = st.worldNetShopping?.carts?.[sid]?.lines || [];
  if (!lines.length) {
    return layoutWrapper(
      store,
      `<p>Cart is empty. ${linkShop(sid, `${sid}/home`, 'Return to store')}</p>`,
      adPage
    );
  }
  const sub = cartSubtotal(sid);
  const shipFeeStd = Number(store.shippingFee) || 0;
  const shipFeePrem = Number(store.premiumShippingFee) || 0;
  const th = Number(store.freeShippingThreshold) || 0;
  const freeShip = th > 0 && sub >= th;

  const accounts = (st.accounts || []).filter(
    (a) => a.onlineRegistered && (a.balance || 0) > 0
  );
  const cash = Number(player.hardCash) || 0;

  let shipOpts = `<label><input type="radio" name="wn-ship" value="standard" checked> Standard delivery (${freeShip ? 'shipping waived' : money(shipFeeStd)})</label>`;
  if (store.deliveryHoursPremium != null) {
    shipOpts += `<label><input type="radio" name="wn-ship" value="premium"> Premium delivery (+${money(
      shipFeePrem
    )}, faster)</label>`;
  }

  let payOpts = '';
  let firstAcc = true;
  for (const a of accounts) {
    payOpts += `<label><input type="radio" name="wn-pay" value="bank:${escapeHtml(
      a.id
    )}" ${firstAcc ? 'checked' : ''}> ${escapeHtml(a.name)} — ${money(a.balance)}</label>`;
    firstAcc = false;
  }
  payOpts += `<label><input type="radio" name="wn-pay" value="cash" ${
    !accounts.length ? 'checked' : ''
  }> Cash on hand — ${money(cash)}</label>`;

  const estStandard = sub + (freeShip ? 0 : shipFeeStd);
  const estPremium = sub + (freeShip ? shipFeePrem : shipFeePrem);

  const inner = `
<div class="wn-shop-header"><div class="wn-shop-logo">Checkout — ${escapeHtml(store.name)}</div></div>
${amazoneDepartmentStrip(store)}
<div class="wn-shop-main solo">
  ${shippingBannerHtml(store, sub)}
  <p class="wn-shop-checkout-est"><b>Merchandise:</b> ${money(sub)} · <b>Est. total (standard ship):</b> ${money(estStandard)} · <b>Est. total (premium ship):</b> ${money(estPremium)}</p>
  <p><b>Ship to</b></p>
  <form class="wn-shop-checkout-form" data-wn-shop-checkout="1">
    <table class="wn-shop-table wn-shop-form-table">
      <tr><td>Name</td><td><input name="shipName" value="${escapeHtml(player.displayName || '')}"></td></tr>
      <tr><td>Address</td><td><input name="shipAddr" value="${escapeHtml(player.address || '')}"></td></tr>
    </table>
    <p><b>Shipping</b></p>
    <div class="wn-shop-radio-col">${shipOpts}</div>
    <p><b>Payment</b></p>
    <div class="wn-shop-radio-col">${payOpts}</div>
    <p class="wn-shop-summary">Review totals above — shipping follows RapidMart rules (standard vs premium).</p>
    <button type="submit" class="wn-shop-btn">Place Order</button>
    &nbsp; ${linkShop(sid, `${sid}/cart`, 'Back to cart')}
    <input type="hidden" name="shopStore" value="${escapeHtml(sid)}">
  </form>
</div>`;
  return layoutWrapper(store, inner, adPage);
}

function renderConfirm(store, orderId) {
  const sid = store.id;
  const adPage = `${sid}_confirm`;
  const st = getState();
  const ord = (st.worldNetShopping?.orders || []).find((o) => o.orderId === orderId);
  if (!ord || ord.storeId !== sid) {
    return layoutWrapper(
      store,
      `<p>Order not found. ${linkShop(sid, `${sid}/home`, 'Home')}</p>`,
      adPage
    );
  }
  const eta = fmtSimEtaHours(ord.deliverBySimMs);
  const lines = (ord.lines || [])
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.title)}</td><td>${l.qty}</td><td>${money(l.unitPrice)}</td><td>${money(
          l.lineTotal
        )}</td></tr>`
    )
    .join('');
  const inner = `
<div class="wn-shop-header"><div class="wn-shop-logo">Order confirmed</div></div>
${amazoneDepartmentStrip(store)}
<div class="wn-shop-main solo">
  <h1 class="wn-shop-h1">Thank you!</h1>
  <p>Order <b>${escapeHtml(orderId)}</b></p>
  <p>Estimated delivery: <b>${eta}</b> (from time of purchase).</p>
  <table class="wn-shop-table"><tr><th>Item</th><th>Qty</th><th>Each</th><th>Total</th></tr>${lines}</table>
  <p><b>Merchandise subtotal:</b> ${money(ord.subtotal)}</p>
  <p><b>Shipping &amp; handling (${escapeHtml(ord.shipTier || 'standard')}):</b> ${money(ord.shipping)}</p>
  <p><b>Total charged:</b> ${money(ord.total)}</p>
  <p>${linkShop(sid, `${sid}/home`, 'Back to shop')}</p>
</div>`;
  return layoutWrapper(store, inner, adPage);
}

/**
 * @param {HTMLElement} root
 * @param {typeof _navigate} navigate
 */
export function bindShopRoot(root, navigate) {
  _navigate = navigate;
  const r = root.closest?.('#wnet-content') || root;
  if (!r.querySelector?.('[data-wn-shop-root]')) return;

  r.querySelectorAll('[data-shop-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const storeId = btn.getAttribute('data-shop-store') || '';
      const productId = btn.getAttribute('data-shop-product') || '';
      const qtyEl = r.querySelector('#wn-shop-qty');
      let qty = Number(qtyEl?.value) || 1;
      if (qty < 1) qty = 1;
      addLineToCart(storeId, productId, qty);
      const store = _stores.get(storeId);
      toastShop(`Added to ${store?.name || 'cart'}.`);
      navigate('wn_shop', `${storeId}/cart`, { pushHistory: true });
    });
  });

  r.querySelectorAll('[data-shop-line-qty]').forEach((inp) => {
    inp.addEventListener('change', () => {
      const storeId = inp.getAttribute('data-shop-store') || '';
      const productId = inp.getAttribute('data-shop-product') || '';
      let q = Number(inp.value) || 0;
      if (q < 0) q = 0;
      setLineQty(storeId, productId, q);
      navigate('wn_shop', `${storeId}/cart`, { pushHistory: false });
    });
  });

  r.querySelectorAll('[data-shop-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const storeId = btn.getAttribute('data-shop-store') || '';
      const productId = btn.getAttribute('data-shop-product') || '';
      setLineQty(storeId, productId, 0);
      navigate('wn_shop', `${storeId}/cart`, { pushHistory: false });
    });
  });

  const form = r.querySelector('form[data-wn-shop-checkout]');
  if (form) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const storeId = /** @type {HTMLFormElement} */ (form).elements.namedItem('shopStore')?.value || '';
      const data = new FormData(form);
      const ship = data.get('wn-ship') || 'standard';
      const payRaw = data.get('wn-pay') || 'cash';
      const res = completeCheckout(storeId, {
        shipTier: String(ship),
        payRaw: String(payRaw),
        shipName: String(data.get('shipName') || ''),
        shipAddr: String(data.get('shipAddr') || '')
      });
      if (!res.ok) {
        toastShop(res.message || 'Checkout failed.');
        return;
      }
      navigate('wn_shop', `${storeId}/confirm/${res.orderId}`, { pushHistory: true });
    });
  }
}

function toastShop(msg) {
  toast(msg);
}

function addLineToCart(storeId, productId, qtyAdd) {
  patchState((st) => {
    const w = st.worldNetShopping;
    w.carts = w.carts || {};
    if (!w.carts[storeId]) w.carts[storeId] = { lines: [] };
    const lines = w.carts[storeId].lines;
    const ex = lines.find((l) => l.productId === productId);
    const add = Math.max(0, Number(qtyAdd) || 0);
    if (ex) ex.qty = Math.max(0, (Number(ex.qty) || 0) + add);
    else if (add > 0) lines.push({ productId, qty: add });
    return st;
  });
}

function setLineQty(storeId, productId, qty) {
  patchState((st) => {
    const w = st.worldNetShopping;
    const cart = w.carts?.[storeId];
    if (!cart?.lines) return st;
    const q = Math.max(0, Number(qty) || 0);
    cart.lines = cart.lines
      .map((l) => (l.productId === productId ? { ...l, qty: q } : l))
      .filter((l) => l.qty > 0);
    return st;
  });
}

/**
 * @returns {{ ok: boolean, orderId?: string, message?: string }}
 */
function completeCheckout(storeId, { shipTier, payRaw, shipName, shipAddr }) {
  const store = _stores.get(storeId);
  if (!store) return { ok: false, message: 'Unknown store.' };
  const st0 = getState();
  const lines0 = st0.worldNetShopping?.carts?.[storeId]?.lines || [];
  if (!lines0.length) return { ok: false, message: 'Cart is empty.' };

  let sub = 0;
  const resolved = [];
  for (const l of lines0) {
    const p = store.productsById[l.productId];
    if (!p) continue;
    const q = Math.max(0, Number(l.qty) || 0);
    if (!q) continue;
    const avail = getLiveStock(storeId, p.id);
    const take = Math.min(q, avail);
    if (take < q) {
      return { ok: false, message: `Not enough stock for ${p.title}.` };
    }
    const u = unitPrice(p);
    sub += u * take;
    resolved.push({ p, qty: take, unit: u, line: u * take });
  }
  if (!resolved.length) return { ok: false, message: 'Nothing to buy.' };

  const shipFeeStd = Number(store.shippingFee) || 0;
  const shipFeePrem = Number(store.premiumShippingFee) || 0;
  const th = Number(store.freeShippingThreshold) || 0;
  let shipCost = 0;
  if (!(th > 0 && sub >= th)) {
    shipCost = shipTier === 'premium' ? shipFeePrem : shipFeeStd;
  } else if (shipTier === 'premium') {
    shipCost = shipFeePrem;
  }

  const total = sub + shipCost;

  if (payRaw.startsWith('bank:')) {
    const bid = payRaw.slice(5);
    const acc = st0.accounts.find((a) => a.id === bid);
    if (!acc || (acc.balance || 0) < total) {
      return { ok: false, message: 'Insufficient funds in that account.' };
    }
  } else if (payRaw === 'cash') {
    if ((st0.player?.hardCash || 0) < total) {
      return { ok: false, message: 'Not enough cash on hand.' };
    }
  } else {
    return { ok: false, message: 'Select a payment method.' };
  }

  let orderId = '';
  let usedCash = false;

  patchState((st) => {
    const player = st.player || {};
    const pay = payRaw;
    if (pay.startsWith('bank:')) {
      const bankId = pay.slice(5);
      const acc = st.accounts.find((a) => a.id === bankId);
      acc.balance = (acc.balance || 0) - total;
      appendBankingTransaction(st, {
        bankName: acc.name,
        accountNumber: acc.accountNumber || acc.id,
        type: 'debit',
        amount: total,
        description: `${store.name} purchase (${storeId})`
      });
    } else {
      usedCash = true;
      player.hardCash = (Number(player.hardCash) || 0) - total;
      appendBankingTransaction(st, {
        bankName: 'Cash on Hand',
        accountNumber: 'CASH',
        type: 'debit',
        amount: total,
        description: `${store.name} purchase (${storeId})`
      });
    }

    const w = st.worldNetShopping;
    const seq = w.nextOrderSeq ?? 1;
    orderId = `WN-${storeId.toUpperCase()}-${seq}`;
    w.nextOrderSeq = seq + 1;

    const hours =
      shipTier === 'premium'
        ? Number(store.deliveryHoursPremium || store.deliveryHoursBudget || 24)
        : Number(store.deliveryHoursBudget || 48);
    const deliverBy = (st.sim?.elapsedMs ?? 0) + hours * SIM_HOUR_MS;

    const orderLines = resolved.map(({ p, qty, unit, line }) => ({
      productId: p.id,
      title: p.title,
      qty,
      unitPrice: unit,
      lineTotal: line
    }));

    w.orders.push({
      orderId,
      storeId,
      storeName: store.name,
      lines: orderLines,
      subtotal: sub,
      shipping: shipCost,
      total,
      shipTier,
      paidWith: usedCash ? 'cash' : payRaw,
      placedAtSimMs: st.sim?.elapsedMs ?? 0,
      deliverBySimMs: deliverBy,
      shipName,
      shipAddr
    });

    w.activeDeliveries.push({
      id: `del-${orderId}`,
      orderId,
      storeId,
      storeName: store.name,
      title: `Awaiting delivery: ${store.name}`,
      deliverBySimMs: deliverBy
    });

    for (const { p, qty } of resolved) {
      const k = stockKey(storeId, p.id);
      const cur = Number(st.worldNetProductStock[k]) || 0;
      st.worldNetProductStock[k] = Math.max(0, cur - qty);
      w.inventory.push({
        productId: p.id,
        productTitle: p.title,
        storeId,
        storeName: store.name,
        orderId,
        purchaseDateSimMs: st.sim?.elapsedMs ?? 0,
        deliveryStatus: 'pending',
        qty
      });
    }

    if (w.carts[storeId]) w.carts[storeId].lines = [];

    return st;
  });

  if (!orderId) {
    return { ok: false, message: 'Order could not be recorded.' };
  }

  const st1 = getState();
  const ord = st1.worldNetShopping.orders.find((o) => o.orderId === orderId);
  const etaH =
    ord != null ? Math.ceil((ord.deliverBySimMs - (st1.sim?.elapsedMs ?? 0)) / SIM_HOUR_MS) : 0;

  // Determine site classification — scam sites skip normal delivery and roll their table
  const siteMeta = getSiteByPageKey(storeId) || getSiteByPageKey('wn_shop');
  const isScam = siteMeta?.outcome === 'scam';

  if (isScam && siteMeta?.scam) {
    const cartSummary = {
      storeId,
      orderId,
      total,
      lines: resolved.map(({ p, qty, unit }) => ({ title: p.title, qty, unitPrice: unit }))
    };
    resolveScamPurchase(siteMeta, cartSummary);
    // Scam sites do not send a legit confirmation SMS — they send a vague one
    smsToPlayer(`Order ${orderId} placed. Delivery details will be communicated separately.`);
  } else {
    for (const { p, qty, unit } of resolved) {
      addToPlayerInventory({
        name: p.title,
        productRef: p.id,
        category: inferCategoryFromProduct(p),
        quantity: qty,
        unitValue: unit,
        source: 'purchase',
        tags: p.tags || []
      });
      syncShopProductRowToStockroom(p);
    }
    ToastManager?.fire({
      key: `delivery_${orderId}`,
      title: 'Order placed',
      message: `${resolved.length} line(s) added to your inventory. Open a warehouse site to store overflow.`,
      icon: '📦',
      notifAction: { type: 'open_window', payload: 'worldnet' }
    });

    // Record ad conversion if one was recently clicked
    const lastAdId = st1.worldNetShopping?._lastClickedAdId;
    if (lastAdId) recordConversion(lastAdId);

    smsToPlayer(`Order ${orderId} confirmed. ETA ~${etaH} sim hours. ${store.name} thanks you.`);
    recordPurchase(storeId === 'amazone' ? 'amazone_order' : 'worldnet_shop_order', st1.sim?.elapsedMs || 0);
  }

  return { ok: true, orderId };
}

/**
 * @param {string} storeId
 */
export function getStoreById(storeId) {
  return _stores.get(storeId) || null;
}

/**
 * Resolve a product row by SKU across all registered WorldNet shops (RapidMart, Amazone, etc.).
 * @param {string} productId
 * @returns {{ storeId: string, product: object } | null}
 */
export function findShopProductById(productId) {
  const pid = String(productId || '');
  if (!pid) return null;
  for (const store of _stores.values()) {
    const product = store.productsById?.[pid];
    if (product) return { storeId: store.id, product };
  }
  return null;
}

/**
 * Compact product grid HTML for embedded page definitions (add-to-cart wired in bindShopRoot).
 * @param {object} store
 * @param {{ maxItems?: number }} opts
 */
export function renderShopProductGridHtml(store, opts = {}) {
  const max = opts.maxItems ?? 12;
  const sid = store.id;
  const prods = Object.values(store.productsById || {}).slice(0, max);
  const cards = prods
    .map(
      (p) => `
    <div class="wn-shop-card" style="min-width:140px;max-width:180px;border:1px solid #999;">
      <div class="wn-shop-card-img" style="height:72px">${productThumbImgHtml(p)}</div>
      <div class="wn-shop-card-body" style="padding:6px;">
        <div class="wn-shop-card-title" style="font-size:11px;font-weight:bold;">${escapeHtml(p.title)}</div>
        <div class="wn-shop-price-row" style="font-size:11px;">${priceRowInner(p)}</div>
        <button type="button" class="wn-shop-btn" data-shop-add data-shop-store="${escapeHtml(sid)}" data-shop-product="${escapeHtml(p.id)}">Add to cart</button>
      </div>
    </div>`
    )
    .join('');
  return `<div class="wn-shop-grid" style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0;">${cards || '<span>No products.</span>'}</div>`;
}

/**
 * Load store definition (products, host, pricing). Seeds stock in game state once.
 * @param {object} def store JSON
 */
export function createStore(def) {
  if (!def?.id) return;
  const plist = (def.products || []).map((p) => ({ ...p }));
  const productsById = Object.fromEntries(plist.map((p) => [p.id, p]));
  _stores.set(def.id, { ...def, products: plist, productsById });
  if (def.publicHost) registerWorldNetShopHost(def.publicHost, def.id);
  if (Array.isArray(def.alternateHosts)) {
    for (const h of def.alternateHosts) {
      const hn = String(h || '').trim();
      if (hn) registerWorldNetShopHost(hn, def.id);
    }
  }
  patchState((st) => {
    for (const p of def.products || []) {
      const k = stockKey(def.id, p.id);
      if (st.worldNetProductStock[k] == null) {
        st.worldNetProductStock[k] =
          p.stockCount != null ? Number(p.stockCount) : 0;
      }
    }
    return st;
  });
}

/**
 * @param {string} storeId
 * @param {object} product
 */
export function addProduct(storeId, product) {
  const s = _stores.get(storeId);
  if (!s || !product?.id) return;
  const copy = { ...product };
  s.productsById[product.id] = copy;
  if (!s.products) s.products = [];
  s.products.push(copy);
  patchState((st) => {
    const k = stockKey(storeId, product.id);
    if (st.worldNetProductStock[k] == null) {
      st.worldNetProductStock[k] =
        product.stockCount != null ? Number(product.stockCount) : 0;
    }
    return st;
  });
}

/**
 * @param {string} storeId
 * @param {string} productId
 * @param {object} partial
 */
export function updateProduct(storeId, productId, partial) {
  const s = _stores.get(storeId);
  if (!s?.productsById[productId]) return;
  const next = { ...s.productsById[productId], ...partial, id: productId };
  s.productsById[productId] = next;
  if (Array.isArray(s.products)) {
    const i = s.products.findIndex((p) => p.id === productId);
    if (i >= 0) s.products[i] = next;
  }
}

/**
 * @param {string} storeId
 * @param {string} productId
 */
export function removeProduct(storeId, productId) {
  const s = _stores.get(storeId);
  if (!s?.productsById[productId]) return;
  delete s.productsById[productId];
  if (Array.isArray(s.products)) s.products = s.products.filter((p) => p.id !== productId);
}

/**
 * @param {string} storeId
 * @returns {{ productId: string, qty: number }[]}
 */
export function getCart(storeId) {
  const lines = getState().worldNetShopping?.carts?.[storeId]?.lines || [];
  return lines.map((l) => ({ productId: l.productId, qty: Number(l.qty) || 0 }));
}

/**
 * @param {string} storeId
 */
export function clearCart(storeId) {
  patchState((st) => {
    if (st.worldNetShopping.carts[storeId]) {
      st.worldNetShopping.carts[storeId].lines = [];
    }
    return st;
  });
}

/**
 * @param {(name: string) => Promise<string | null>} loadJsonText
 * @param {typeof _navigate} navigate
 */
export async function initWorldNetShop(loadJsonText, navigate) {
  _navigate = navigate;
  if (!loadJsonText) return;
  let loaded = false;
  try {
    const rawShops = await loadJsonText('shops.json');
    const parsed = JSON.parse(rawShops);
    if (Array.isArray(parsed)) {
      for (const def of parsed) {
        if (def?.id) createStore(def);
      }
      loaded = parsed.length > 0;
    }
  } catch {
    /* optional */
  }
  if (loaded) return;
  try {
    const raw = await loadJsonText('shop-demo.json');
    const def = JSON.parse(raw);
    if (def?.id) createStore(def);
  } catch {
    /* optional demo */
  }
}

/**
 * @returns {{ createStore: typeof createStore, addProduct: typeof addProduct, updateProduct: typeof updateProduct, removeProduct: typeof removeProduct, getCart: typeof getCart, clearCart: typeof clearCart }}
 */
export function getShopApi() {
  return {
    createStore,
    addProduct,
    updateProduct,
    removeProduct,
    getCart,
    clearCart,
    getStoreById,
    hydrateAmazoneWorldNetStore
  };
}
