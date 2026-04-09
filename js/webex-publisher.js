/**
 * WebEx-Publisher — drag-and-drop e-commerce website builder.
 * Layout: presets | canvas (mirrors live grid) | modules; dual inventory; publish → 1:1 WorldNet page.
 */
import { getState, patchState, appendBankingTransaction } from './gameState.js';
import { SIM_WEEK_MS, SIM_DAY_MS } from './bank-config.js';
import { escapeHtml } from './identity.js';
import { toast, TOAST_KEYS } from './toast.js';
import { createStore, getStoreById } from './worldnet-shop.js';
import { newPageId, defaultPageDef } from './pipeline/website-editor.js';
import { setPipelinePageRoutes } from './worldnet-routes.js';

let _modules = [];
let _rootEl = null;
let _currentProjectId = null;
let _priceOverlay = null;
let _textOverlay = null;
/** @type {'editor' | 'properties'} */
let _mainTab = 'editor';

const LAYOUT_PRESETS = [
  { id: 'shop_forward', label: 'Shop Forward', icon: '🛒', slots: [
    { slotId: 's1', x: 0, y: 0, w: 2, h: 2, accepts: 'large', label: 'Hero / Shop' },
    { slotId: 's2', x: 2, y: 0, w: 1, h: 1, accepts: 'medium', label: 'Sidebar' },
    { slotId: 's3', x: 2, y: 1, w: 1, h: 1, accepts: 'small', label: 'Widget' },
    { slotId: 's4', x: 0, y: 2, w: 3, h: 1, accepts: 'medium', label: 'Footer' },
  ]},
  { id: 'blog_forward', label: 'Blog Forward', icon: '📝', slots: [
    { slotId: 's1', x: 0, y: 0, w: 3, h: 1, accepts: 'large', label: 'Header' },
    { slotId: 's2', x: 0, y: 1, w: 2, h: 2, accepts: 'large', label: 'Main Content' },
    { slotId: 's3', x: 2, y: 1, w: 1, h: 1, accepts: 'small', label: 'Sidebar Top' },
    { slotId: 's4', x: 2, y: 2, w: 1, h: 1, accepts: 'small', label: 'Sidebar Bottom' },
  ]},
  { id: 'corporate', label: 'Corporate', icon: '🏢', slots: [
    { slotId: 's1', x: 0, y: 0, w: 3, h: 1, accepts: 'large', label: 'Banner' },
    { slotId: 's2', x: 0, y: 1, w: 1, h: 1, accepts: 'medium', label: 'Left Panel' },
    { slotId: 's3', x: 1, y: 1, w: 1, h: 1, accepts: 'medium', label: 'Center Panel' },
    { slotId: 's4', x: 2, y: 1, w: 1, h: 1, accepts: 'medium', label: 'Right Panel' },
    { slotId: 's5', x: 0, y: 2, w: 3, h: 1, accepts: 'small', label: 'Footer' },
  ]},
  { id: 'media_page', label: 'Media Page', icon: '🎬', slots: [
    { slotId: 's1', x: 0, y: 0, w: 2, h: 2, accepts: 'large', label: 'Media Area' },
    { slotId: 's2', x: 2, y: 0, w: 1, h: 2, accepts: 'medium', label: 'Info / List' },
    { slotId: 's3', x: 0, y: 2, w: 1, h: 1, accepts: 'small', label: 'Widget A' },
    { slotId: 's4', x: 1, y: 2, w: 1, h: 1, accepts: 'small', label: 'Widget B' },
    { slotId: 's5', x: 2, y: 2, w: 1, h: 1, accepts: 'small', label: 'Widget C' },
  ]},
  { id: 'minimal_two_col', label: 'Minimal 2×2', icon: '▦', columns: 2, slots: [
    { slotId: 's1', x: 0, y: 0, w: 1, h: 1, accepts: 'medium', label: 'Panel A' },
    { slotId: 's2', x: 1, y: 0, w: 1, h: 1, accepts: 'medium', label: 'Panel B' },
    { slotId: 's3', x: 0, y: 1, w: 1, h: 1, accepts: 'medium', label: 'Panel C' },
    { slotId: 's4', x: 1, y: 1, w: 1, h: 1, accepts: 'medium', label: 'Panel D' },
  ]},
  { id: 'landing_strip', label: 'Landing Strip', icon: '📎', columns: 4, slots: [
    { slotId: 's1', x: 0, y: 0, w: 4, h: 1, accepts: 'large', label: 'Full-width hero' },
    { slotId: 's2', x: 0, y: 1, w: 1, h: 1, accepts: 'small', label: 'Tile' },
    { slotId: 's3', x: 1, y: 1, w: 1, h: 1, accepts: 'small', label: 'Tile' },
    { slotId: 's4', x: 2, y: 1, w: 1, h: 1, accepts: 'small', label: 'Tile' },
    { slotId: 's5', x: 3, y: 1, w: 1, h: 1, accepts: 'small', label: 'Tile' },
  ]},
  { id: 'wide_quad', label: 'Wide Quad', icon: '⬛', columns: 4, slots: [
    { slotId: 's1', x: 0, y: 0, w: 2, h: 2, accepts: 'large', label: 'Main feature' },
    { slotId: 's2', x: 2, y: 0, w: 1, h: 1, accepts: 'small', label: 'Top R1' },
    { slotId: 's3', x: 3, y: 0, w: 1, h: 1, accepts: 'small', label: 'Top R2' },
    { slotId: 's4', x: 2, y: 1, w: 2, h: 1, accepts: 'medium', label: 'Lower bar' },
  ]},
  { id: 'tall_stack', label: 'Tall Stack', icon: '📚', columns: 3, slots: [
    { slotId: 's1', x: 0, y: 0, w: 3, h: 1, accepts: 'large', label: 'Header' },
    { slotId: 's2', x: 0, y: 1, w: 2, h: 2, accepts: 'large', label: 'Body' },
    { slotId: 's3', x: 2, y: 1, w: 1, h: 1, accepts: 'small', label: 'Rail 1' },
    { slotId: 's4', x: 2, y: 2, w: 1, h: 1, accepts: 'small', label: 'Rail 2' },
    { slotId: 's5', x: 0, y: 3, w: 3, h: 1, accepts: 'medium', label: 'Footer strip' },
  ]},
  { id: 'mosaic_six', label: 'Mosaic Six', icon: '🔶', columns: 3, slots: [
    { slotId: 's1', x: 0, y: 0, w: 1, h: 1, accepts: 'small', label: 'Cell 1' },
    { slotId: 's2', x: 1, y: 0, w: 1, h: 1, accepts: 'small', label: 'Cell 2' },
    { slotId: 's3', x: 2, y: 0, w: 1, h: 1, accepts: 'small', label: 'Cell 3' },
    { slotId: 's4', x: 0, y: 1, w: 3, h: 1, accepts: 'large', label: 'Wide band' },
    { slotId: 's5', x: 0, y: 2, w: 1, h: 1, accepts: 'small', label: 'Cell 4' },
    { slotId: 's6', x: 1, y: 2, w: 2, h: 1, accepts: 'medium', label: 'Wide footer' },
  ]},
];

const COMMERCE_MODULE_IDS = new Set(['shop', 'product_listing', 'cart_checkout']);

/** Slots with a right-click menu (commerce or text box). */
const COMMERCE_CTX_MODULES = new Set(['shop', 'product_listing']);

/** TLD options: highest price / traffic first → value tier last. Weekly subscription. */
export const DOMAIN_TLD_OPTIONS = [
  { tld: '.com', weeklyFee: 24.99, label: '.com — premium (most traffic) · $24.99/wk' },
  { tld: '.net', weeklyFee: 14.99, label: '.net — business standard · $14.99/wk' },
  { tld: '.org', weeklyFee: 8.99, label: '.org — org / trust · $8.99/wk' },
  { tld: '.co', weeklyFee: 3.49, label: '.co — value / lighter traffic · $3.49/wk' }
];

export const TITLE_FONT_OPTIONS = [
  { id: 'tahoma', label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
  { id: 'georgia', label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { id: 'arial', label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { id: 'times', label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
  { id: 'courier', label: 'Courier New', stack: '"Courier New", Courier, monospace' },
  { id: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { id: 'impact', label: 'Impact', stack: 'Impact, Haettenschweiler, "Arial Narrow", sans-serif' }
];

export const TITLE_SIZE_OPTIONS = [10, 11, 12, 14, 16, 18, 20, 22, 24, 28];

function getWeeklyFeeForTld(tld) {
  const raw = String(tld || '.net').toLowerCase();
  const norm = raw.startsWith('.') ? raw : `.${raw}`;
  const row = DOMAIN_TLD_OPTIONS.find((o) => o.tld === norm);
  return row ? row.weeklyFee : 14.99;
}

function getTitleFontStack(fontId) {
  const id = String(fontId || 'tahoma');
  const row = TITLE_FONT_OPTIONS.find((f) => f.id === id);
  return row?.stack || TITLE_FONT_OPTIONS[0].stack;
}

function sanitizeDomainSlug(raw, fallbackName) {
  const base = String(raw || '').trim() || String(fallbackName || '').trim();
  let s = base.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  if (s.length < 2) {
    const fb = String(fallbackName || 'site')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    s = (fb.length >= 2 ? fb : 'mysite') + '-' + Math.random().toString(36).slice(2, 5);
  }
  return s.slice(0, 30);
}

function buildPublicHost(proj) {
  const slug = sanitizeDomainSlug('', proj.siteName);
  const rawTld = proj.domainTld || '.net';
  const tld = rawTld.startsWith('.') ? rawTld : `.${rawTld}`;
  return `${slug}${tld}`;
}

/** Bank accounts debited in order (then wallet cash). Matches players who keep wealth in banks, not hardCash. */
const WEBEX_PAY_ACCOUNT_ORDER = ['fncb', 'meridian', 'harbor', 'pacific', 'darkweb', 'davidmitchell'];

function playerSpendableFunds(st) {
  const wallet = Number(st.player?.hardCash) || 0;
  const banks = (st.accounts || []).reduce((s, a) => s + Math.max(0, Number(a.balance) || 0), 0);
  return wallet + banks;
}

/**
 * Debit hosting fee across accounts (ordered) then physical cash. Logs one ledger entry per institution used.
 * @returns {boolean} true if the full amount was applied (caller must verify sufficiency first)
 */
function deductWebExHostingFee(st, amount, description) {
  const fee = Number(amount) || 0;
  if (fee <= 0) return true;
  let remaining = fee;
  const seen = new Set(); /** @type {Set<string>} */
  const tryDebitAcc = (acc) => {
    if (!acc || remaining <= 0) return;
    const id = acc.id;
    if (!id || seen.has(id)) return;
    const bal = Math.max(0, Number(acc.balance) || 0);
    if (bal <= 0) return;
    seen.add(id);
    const take = Math.min(bal, remaining);
    acc.balance = bal - take;
    remaining -= take;
    appendBankingTransaction(st, {
      bankName: acc.name,
      accountNumber: acc.accountNumber || '—',
      type: 'debit',
      amount: take,
      description
    });
  };
  for (const id of WEBEX_PAY_ACCOUNT_ORDER) {
    tryDebitAcc(st.accounts?.find((a) => a.id === id));
  }
  for (const acc of st.accounts || []) {
    tryDebitAcc(acc);
  }
  if (remaining > 0) {
    const hc = Number(st.player.hardCash) || 0;
    const take = Math.min(hc, remaining);
    st.player.hardCash = hc - take;
    remaining -= take;
    if (take > 0) {
      appendBankingTransaction(st, {
        bankName: 'Cash',
        accountNumber: '—',
        type: 'debit',
        amount: take,
        description: `${description} (wallet)`
      });
    }
  }
  return remaining <= 0;
}

function refreshDomainFeeHint() {
  if (!_rootEl) return;
  const sel = _rootEl.querySelector('[data-wx-tld]');
  const hint = _rootEl.querySelector('[data-wx-tld-hint]');
  if (!sel || !hint) return;
  hint.textContent = `$${getWeeklyFeeForTld(sel.value).toFixed(2)}/wk`;
}

/**
 * Weekly domain hosting charges. Call from sim tick via patchState.
 * @param {object} st game state
 */
export function tickWebExDomainBilling(st) {
  const subs = st?.player?.webExDomainSubscriptions;
  if (!Array.isArray(subs) || !subs.length) return;
  const now = st.sim?.elapsedMs ?? 0;
  for (const sub of subs) {
    if (sub.nextDueSimMs > now) continue;
    const fee = Number(sub.weeklyFee) || 0;
    if (fee <= 0) {
      sub.nextDueSimMs = now + SIM_WEEK_MS;
      continue;
    }
    if (playerSpendableFunds(st) >= fee) {
      deductWebExHostingFee(st, fee, `Domain hosting ${sub.publicHost} (weekly)`);
      sub.nextDueSimMs = now + SIM_WEEK_MS;
      toast({
        key: TOAST_KEYS.GENERIC,
        title: 'Domain billing',
        message: `$${fee.toFixed(2)} charged for ${sub.publicHost}. Next renewal in one sim week.`,
        icon: '🌐',
        autoDismiss: 5000
      });
    } else {
      sub.nextDueSimMs = now + SIM_DAY_MS;
      toast({
        key: TOAST_KEYS.GENERIC,
        title: 'Domain bill unpaid',
        message: `Need $${fee.toFixed(2)} for ${sub.publicHost} (wallet + any bank balance). Will retry after 1 sim day.`,
        icon: '⚠',
        autoDismiss: 6000
      });
    }
  }
}

function uid() { return `wx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }

function getProject(id) {
  return (getState().player.webExProjects || []).find(p => p.id === id) || null;
}

function currentProject() {
  return _currentProjectId ? getProject(_currentProjectId) : null;
}

function moduleById(mid) { return _modules.find(m => m.id === mid) || null; }

function layoutMetricsFromPreset(presetId) {
  const preset = LAYOUT_PRESETS.find(p => p.id === presetId);
  let rows = 0;
  let cols = preset?.columns ?? 3;
  for (const s of preset?.slots || []) {
    rows = Math.max(rows, s.y + s.h);
    cols = Math.max(cols, s.x + s.w);
  }
  return { columns: Math.max(cols, preset?.columns ?? 3), rows: Math.max(rows, 1), gapPx: 4, rowMinPx: 80 };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Interconnected WebEx site simulation stats (modules → trade-offs).
 * @param {object} proj
 */
export function computeWebsiteProperties(proj) {
  if (!proj?.slots) {
    return {
      diskUsedMb: 0,
      diskCapMb: 5,
      loadSpeed: 50,
      webSpeed: 50,
      trafficVisitors: 0,
      serverLoad: 0,
      security: 50,
      userSatisfaction: 50,
      websiteHealth: 50,
      monetizationEfficiency: 30,
      stability: 90,
      bandwidthStress: 10
    };
  }
  const placed = [];
  for (const s of proj.slots) {
    if (s.moduleId) {
      const m = moduleById(s.moduleId);
      if (m) placed.push(m);
    }
  }
  const n = placed.length;
  const clutter = placed.reduce((a, m) => a + (m.clutterScore || 0), 0);
  const utility = placed.reduce((a, m) => a + (m.utilityScore || 0), 0);
  const ux = computeUxScore(proj);

  const heavyIds = new Set([
    'video_embed',
    'autoplay_video_promo',
    'image_gallery',
    'popup_ads',
    'featured_product_carousel',
    'forum_discussion_board',
    'data_tracker_pixel'
  ]);
  const heavyCount = placed.filter((m) => heavyIds.has(m.id)).length;

  const securityIds = new Set([
    'security_encryption_badge',
    'verified_seller_badge',
    'admin_panel',
    'user_accounts'
  ]);
  const secCount = placed.filter((m) => securityIds.has(m.id)).length;

  const listed = proj.websiteInventory?.length || 0;

  let loadSpeed = 100 - n * 5 - heavyCount * 14 - clutter * 1.8 + Math.min(18, utility * 0.35);
  loadSpeed = clamp(loadSpeed, 8, 99);

  let traffic = 18 + n * 9 + listed * 6 + utility * 0.4 + ux * 0.5;
  traffic = clamp(traffic, 6, 220);

  let serverLoad = n * 8 + Math.floor(traffic / 7) + heavyCount * 16 - secCount * 4;
  serverLoad = clamp(serverLoad, 6, 96);

  let security = 32 + secCount * 17 + ux * 0.35 - heavyCount * 4;
  security = clamp(security, 12, 99);

  let satisfaction = 48 + ux * 0.85 - clutter * 2.2 - heavyCount * 6 - Math.max(0, serverLoad - 58) * 0.55;
  if (placed.some((m) => m.id === 'popup_ads')) satisfaction -= 14;
  if (placed.some((m) => m.id === 'data_tracker_pixel')) satisfaction -= 5;
  satisfaction = clamp(satisfaction, 6, 99);

  let health = 100 - serverLoad * 0.38 - (100 - loadSpeed) * 0.22 - (100 - satisfaction) * 0.2 - (100 - security) * 0.08;
  health = clamp(health, 10, 99);

  const monIds = new Set([
    'shop',
    'product_listing',
    'popup_ads',
    'discount_coupon',
    'cart_checkout',
    'flash_sale_timer'
  ]);
  let monet = 28 + placed.filter((m) => monIds.has(m.id)).length * 11 + listed * 2;
  monet -= satisfaction < 38 ? 18 : 0;
  monet -= serverLoad > 82 ? 12 : 0;
  monet = clamp(monet, 12, 99);

  let stability = 94 - n * 5 - heavyCount * 5 + secCount * 3;
  stability -= Math.max(0, serverLoad - 68) * 0.9;
  stability = clamp(stability, 14, 99);

  const bandwidthStress = clamp(serverLoad + heavyCount * 6 + Math.floor(traffic / 25) - 15, 8, 99);

  const diskCap = 5;
  const diskUsed = clamp(0.35 + n * 0.32 + heavyCount * 0.75 + listed * 0.04 + clutter * 0.02, 0.2, diskCap - 0.01);

  return {
    diskUsedMb: Math.round(diskUsed * 100) / 100,
    diskCapMb: diskCap,
    loadSpeed: Math.round(loadSpeed),
    webSpeed: Math.round(loadSpeed),
    trafficVisitors: Math.round(traffic),
    serverLoad: Math.round(serverLoad),
    security: Math.round(security),
    userSatisfaction: Math.round(satisfaction),
    websiteHealth: Math.round(health),
    monetizationEfficiency: Math.round(monet),
    stability: Math.round(stability),
    bandwidthStress: Math.round(bandwidthStress)
  };
}

/** Semicircle gauge (wireframe-style). @param {string} color hex */
function wxSemiGauge(label, pct, color = '#0a246a') {
  const p = clamp(pct, 0, 100);
  const arcLen = 119.38;
  const dash = (p / 100) * arcLen;
  return `<div class="wx-gauge">
    <div class="wx-gauge-svgwrap">
      <svg class="wx-gauge-svg" viewBox="0 0 100 58" width="100" height="58" aria-hidden="true">
        <path d="M 12 48 A 38 38 0 0 1 88 48" fill="none" stroke="#c8c8c8" stroke-width="7" stroke-dasharray="4 5"/>
        <path d="M 12 48 A 38 38 0 0 1 88 48" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${dash} ${arcLen}"/>
      </svg>
      <div class="wx-gauge-overlay">
        <span class="wx-gauge-pct">${Math.round(p)}%</span>
        <span class="wx-gauge-lbl">${escapeHtml(label)}</span>
      </div>
    </div>
  </div>`;
}

function renderPropertiesPanel(proj) {
  if (!proj) {
    return `<div class="wx-properties wx-properties--empty">
      <p>Open or create a project to view <b>Website Properties</b>.</p>
    </div>`;
  }
  const st = computeWebsiteProperties(proj);
  const diskPct = Math.min(100, (st.diskUsedMb / st.diskCapMb) * 100);
  const tradeHint =
    serverLoadHint(st) +
    speedHint(st) +
    satHint(st);

  return `<div class="wx-properties">
    <h2 class="wx-prop-title">Website Properties</h2>
    <p class="wx-prop-lead">Stats interconnect: more modules → heavier load &amp; slower loads; ads &amp; trackers → money but angrier visitors.</p>

    <div class="wx-prop-section">
      <div class="wx-prop-label">Hosting space</div>
      <div class="wx-prop-diskbar-wrap">
        <div class="wx-prop-diskbar" style="width:${diskPct}%;"></div>
      </div>
      <div class="wx-prop-disk-cap">${st.diskUsedMb.toFixed(2)} MB / ${st.diskCapMb} MB</div>
    </div>

    <div class="wx-prop-section wx-prop-kv">
      <div><span class="wx-prop-k">Traffic</span> <span class="wx-prop-v">${st.trafficVisitors}</span> <span class="wx-prop-note">(sim visitors / day — drives revenue stress)</span></div>
      <div><span class="wx-prop-k">Security</span> <span class="wx-prop-v">${st.security}%</span> <span class="wx-prop-note">(badges &amp; accounts help; heavy pages hurt focus)</span></div>
      <div><span class="wx-prop-k">User satisfaction</span> <span class="wx-prop-v">${st.userSatisfaction}%</span> <span class="wx-prop-note">(speed + UX score − clutter &amp; pop-ups)</span></div>
    </div>

    <div class="wx-prop-gauges">
      ${wxSemiGauge('Server load', st.serverLoad, '#a04020')}
      ${wxSemiGauge('Web speed', st.webSpeed, '#2060a0')}
      ${wxSemiGauge('Web health', st.websiteHealth, '#2a7a2a')}
    </div>

    <div class="wx-prop-section wx-prop-extra">
      <div class="wx-prop-subtitle">More levers</div>
      <ul class="wx-prop-list">
        <li><b>Load speed</b> ${st.loadSpeed}% — video, galleries, and clutter drag dial-up users away.</li>
        <li><b>Monetization</b> ${st.monetizationEfficiency}% — shop &amp; ads pay better when the site isn’t melting down.</li>
        <li><b>Stability</b> ${st.stability}% — too many features + high load = random “page not found” moments.</li>
        <li><b>Bandwidth stress</b> ${st.bandwidthStress}% — traffic × heavy assets; pairs with server load.</li>
      </ul>
    </div>
    <div class="wx-prop-trade">${tradeHint}</div>
  </div>`;
}

function serverLoadHint(st) {
  if (st.serverLoad >= 80) return '⚠ Server load critical — trim modules or heavy media before you lose visitors. ';
  if (st.serverLoad >= 60) return 'Host is warming up: more traffic without upgrades will bite satisfaction. ';
  return '';
}
function speedHint(st) {
  if (st.loadSpeed <= 35) return '⚡ Dial-up nightmare territory — cut autoplay, galleries, or ad weight. ';
  return '';
}
function satHint(st) {
  if (st.userSatisfaction <= 35) return '😟 Satisfaction low — ease off pop-ups &amp; trackers or add navigation/help modules.';
  return '';
}

/**
 * Switch layout preset on the current project without wiping name, domain, inventory, or titles.
 */
function applyLayoutPresetToProject(presetId) {
  const proj = currentProject();
  if (!proj) {
    createNewProject(presetId);
    return;
  }
  const preset = LAYOUT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  const oldBySlot = Object.fromEntries((proj.slots || []).map((s) => [s.slotId, s.moduleId]));
  const newSlots = preset.slots.map((s) => ({
    slotId: s.slotId,
    moduleId: oldBySlot[s.slotId] ?? null
  }));
  const validIds = new Set(preset.slots.map((s) => s.slotId));
  patchState((s) => {
    const p = (s.player.webExProjects || []).find((x) => x.id === proj.id);
    if (!p) return s;
    p.layoutPresetId = preset.id;
    p.slots = newSlots;
    if (p.slotModuleData && typeof p.slotModuleData === 'object') {
      for (const k of Object.keys(p.slotModuleData)) {
        if (!validIds.has(k)) delete p.slotModuleData[k];
      }
    }
    return s;
  });
  setStatus(`Layout: ${preset.label} — site name & domain kept. Modules matched by slot id where possible.`);
  render();
}

function computeUxScore(project) {
  if (!project?.slots) return 0;
  let utility = 0, clutter = 0;
  const placed = new Set();
  for (const slot of project.slots) {
    if (!slot.moduleId) continue;
    const mod = moduleById(slot.moduleId);
    if (!mod) continue;
    utility += mod.utilityScore || 0;
    clutter += mod.clutterScore || 0;
    if (placed.has(slot.moduleId)) clutter += 5;
    placed.add(slot.moduleId);
  }
  return Math.max(0, utility - clutter);
}

function ensureWebExStockroom() {
  patchState((s) => {
    if (!Array.isArray(s.player.webExStockroom)) s.player.webExStockroom = [];
    if (s.player.webExStockroom.length > 0) return s;
    const rm = getStoreById('rapidmart');
    if (!rm?.products?.length) return s;
    s.player.webExStockroom = rm.products.map((p) => ({
      id: `wxs-${p.id}`,
      sourceSku: p.id,
      title: p.title,
      price: p.price,
      salePrice: p.salePrice,
      categoryId: p.categoryId,
      swatch: p.swatch,
      description: p.description,
      stockCount: p.stockCount != null ? Number(p.stockCount) : 10
    }));
    return s;
  });
}

function projectNeedsCommerceStore(proj) {
  return (proj.slots || []).some((sl) => sl.moduleId && COMMERCE_MODULE_IDS.has(sl.moduleId));
}

function categoriesForProducts(products, rm) {
  const rmCats = rm?.categories || [];
  const byCat = new Map(rmCats.map((c) => [c.id, c]));
  const ids = [...new Set(products.map((p) => p.categoryId).filter(Boolean))];
  return ids.map((id) => byCat.get(id) || { id, name: id });
}

function buildStoreProductsFromWebsiteInventory(proj, storeId) {
  const st = getState();
  const room = st.player.webExStockroom || [];
  const byId = Object.fromEntries(room.map((i) => [i.id, i]));
  const lines = proj.websiteInventory || [];
  const prefix = String(storeId).replace(/[^a-z0-9]/gi, '').slice(0, 12) || 'wxstore';
  return lines
    .map((line) => {
      const src = byId[line.stockItemId];
      if (!src) return null;
      const pid =
        line.storeProductId ||
        `${prefix}_${String(line.stockItemId).replace(/[^a-z0-9_]/gi, '_')}`.slice(0, 48);
      const listPrice = Number(line.listPrice);
      const base = Number(src.price) || 9.99;
      const sale = src.salePrice != null ? Number(src.salePrice) : null;
      const display = !Number.isNaN(listPrice) && listPrice > 0 ? listPrice : (sale ?? base);
      return {
        id: pid,
        title: src.title,
        categoryId: src.categoryId || 'general',
        swatch: src.swatch,
        description: src.description || '',
        price: base,
        salePrice: display !== base ? display : (sale != null && sale !== base ? sale : undefined),
        stockCount: src.stockCount != null ? Number(src.stockCount) : 10
      };
    })
    .filter(Boolean);
}

function upsertWebExCommerceStore(storeId, hostName, siteName, proj) {
  if (!projectNeedsCommerceStore(proj)) return;
  const rm = getStoreById('rapidmart');
  const fromInv = buildStoreProductsFromWebsiteInventory(proj, storeId);
  const products = fromInv;
  const categories = products.length ? categoriesForProducts(products, rm) : [];
  createStore({
    id: storeId,
    name: siteName,
    publicHost: hostName,
    products,
    categories,
    accentColor: '#0a246a',
    tagline: `Welcome to ${siteName}`,
    freeShippingThreshold: rm?.freeShippingThreshold ?? 75,
    shippingFee: rm?.shippingFee ?? 5.99,
    premiumShippingFee: rm?.premiumShippingFee ?? 12.99,
    deliveryHoursBudget: rm?.deliveryHoursBudget ?? 48,
    deliveryHoursPremium: rm?.deliveryHoursPremium ?? 12,
    featuredProductIds: products.slice(0, 3).map((p) => p.id),
    adSlots: Array.isArray(rm?.adSlots) ? [...rm.adSlots] : ['banner-top', 'sidebar-right']
  });
}

/**
 * Sections for one canvas module (mirrors live cell).
 * @param {string} [slotId] preset slot id (for per-slot text module data)
 */
function buildModuleSections(modId, sid, commerce, storeId, proj, slotId) {
  switch (modId) {
    case 'custom_text_box': {
      const data = proj?.slotModuleData?.[slotId] || {};
      return [
        {
          type: 'text',
          sectionId: sid,
          headline: data.headline || '',
          body: data.body || 'Right-click this module → Edit text.',
          webexPlain: true
        }
      ];
    }
    case 'shop':
      return [
        {
          type: 'text',
          sectionId: `${sid}-intro`,
          headline: 'Shop',
          body: 'Browse the catalog. Cart and checkout use WorldNet Commerce. Only items in Website Inventory appear below.'
        },
        ...(commerce && storeId
          ? [
              { type: 'productGrid', sectionId: `${sid}-grid`, shopId: storeId, maxItems: 24 },
              {
                type: 'shop_nav',
                sectionId: `${sid}-nav`,
                shopId: storeId,
                emphasis: 'all',
                title: 'Store & checkout'
              }
            ]
          : [])
      ];
    case 'product_listing':
      if (commerce && storeId) {
        return [{ type: 'productGrid', sectionId: sid, shopId: storeId, maxItems: 24 }];
      }
      return [
        {
          type: 'text',
          sectionId: sid,
          headline: 'Products',
          body: 'Add a Shop module and items to Website Inventory, then publish.'
        }
      ];
    case 'cart_checkout':
      if (commerce && storeId) {
        return [
          {
            type: 'shop_nav',
            sectionId: sid,
            shopId: storeId,
            emphasis: 'checkout',
            title: 'Cart & checkout'
          }
        ];
      }
      return [
        {
          type: 'text',
          sectionId: sid,
          headline: 'Cart',
          body: 'Commerce not enabled. Add Shop and publish.'
        }
      ];
    case 'featured_product_carousel':
      return commerce && storeId
        ? [{ type: 'webex_widget', widget: 'featured_carousel', sectionId: sid, shopId: storeId }]
        : [{ type: 'text', sectionId: sid, headline: 'Carousel', body: 'Requires Shop + publish.' }];
    case 'discount_coupon':
      return [{ type: 'webex_widget', widget: 'discount_coupon', sectionId: sid }];
    case 'flash_sale_timer':
      return [{ type: 'webex_widget', widget: 'flash_sale_timer', sectionId: sid }];
    case 'subscription_membership':
      return [{ type: 'webex_widget', widget: 'subscription_membership', sectionId: sid }];
    case 'bundle_deals':
      return [{ type: 'webex_widget', widget: 'bundle_deals', sectionId: sid }];
    case 'blog':
      return [
        { type: 'newsFeed', sectionId: sid, count: 6 },
        {
          type: 'text',
          sectionId: `${sid}-note`,
          headline: 'Blog',
          body: 'Headlines mirror the WorldNet news wire.'
        }
      ];
    case 'comments':
      return [
        {
          type: 'live_thread',
          sectionId: sid,
          title: 'Comments',
          commentContext: 'generic',
          commentFlavor: 'generic'
        }
      ];
    case 'reviews':
      return [{ type: 'reviews_block', sectionId: sid, title: 'Ratings & reviews' }];
    case 'forum_discussion_board':
      return [{ type: 'webex_widget', widget: 'forum_board', sectionId: sid }];
    case 'polls_surveys':
      return [{ type: 'webex_widget', widget: 'polls_surveys', sectionId: sid }];
    case 'newsletter_signup':
      return [{ type: 'webex_widget', widget: 'newsletter_signup', sectionId: sid }];
    case 'announcement_banner':
      return [{ type: 'webex_widget', widget: 'announcement_banner', sectionId: sid }];
    case 'faq_section':
      return [{ type: 'webex_widget', widget: 'faq_section', sectionId: sid }];
    case 'verified_seller_badge':
      return [{ type: 'webex_widget', widget: 'verified_seller_badge', sectionId: sid }];
    case 'security_encryption_badge':
      return [{ type: 'webex_widget', widget: 'security_badge', sectionId: sid }];
    case 'testimonials_module':
      return [{ type: 'webex_widget', widget: 'testimonials', sectionId: sid }];
    case 'return_policy_terms':
      return [{ type: 'webex_widget', widget: 'return_policy', sectionId: sid }];
    case 'search_bar':
      return [{ type: 'webex_widget', widget: 'search_bar', sectionId: sid }];
    case 'filters_sorting':
      return [{ type: 'webex_widget', widget: 'filters_sort', sectionId: sid }];
    case 'pagination_module':
      return [{ type: 'webex_widget', widget: 'pagination', sectionId: sid }];
    case 'breadcrumb_navigation':
      return [{ type: 'webex_widget', widget: 'breadcrumb', sectionId: sid }];
    case 'dark_mode_toggle':
      return [{ type: 'webex_widget', widget: 'dark_mode_toggle', sectionId: sid }];
    case 'popup_ads':
      return [{ type: 'webex_widget', widget: 'popup_ad', sectionId: sid }];
    case 'data_tracker_pixel':
      return [{ type: 'webex_widget', widget: 'data_tracker', sectionId: sid }];
    case 'autoplay_video_promo':
      return [
        {
          type: 'video_embed',
          sectionId: sid,
          title: 'Promo video',
          caption: 'Autoplay engaged — CorpMedia 2000',
          autoplayPromo: true
        }
      ];
    case 'video_embed':
      return [
        {
          type: 'video_embed',
          sectionId: sid,
          title: 'Featured video',
          caption: 'Now streaming — CorpMedia 2000'
        }
      ];
    case 'image_gallery':
      return [{ type: 'image_gallery', sectionId: sid, title: 'Gallery' }];
    case 'user_accounts':
      return [
        {
          type: 'login',
          sectionId: sid,
          headline: 'Member sign in',
          systemType: 'webex',
          buttonLabel: 'Sign in'
        }
      ];
    case 'admin_panel':
      return [
        {
          type: 'text',
          sectionId: sid,
          headline: 'Administrator console',
          body:
            'Reports, bans, and SAR exports require elevated CorpOS credentials. Activity on this site is logged per Federal Mandate 2000-CR7.'
        }
      ];
    default: {
      const mod = moduleById(modId);
      return [
        {
          type: 'text',
          sectionId: sid,
          headline: mod?.label || 'Module',
          body: mod?.description || String(modId)
        }
      ];
    }
  }
}

function buildWebExMirrorLayout(proj, storeId) {
  const preset = LAYOUT_PRESETS.find((p) => p.id === proj.layoutPresetId);
  const slotOrder = preset?.slots || [];
  const modBySlot = Object.fromEntries((proj.slots || []).map((s) => [s.slotId, s.moduleId]));
  const commerce = projectNeedsCommerceStore(proj);
  const metrics = layoutMetricsFromPreset(proj.layoutPresetId);
  const cells = slotOrder.map((ps) => {
    const modId = modBySlot[ps.slotId] || null;
    const sid = modId ? `wx-${ps.slotId}-${modId}` : `wx-${ps.slotId}-empty`;
    const sections = modId
      ? buildModuleSections(modId, sid, commerce, storeId, proj, ps.slotId)
      : [{ type: 'webex_empty', sectionId: sid }];
    return {
      slotId: ps.slotId,
      x: ps.x,
      y: ps.y,
      w: ps.w,
      h: ps.h,
      moduleId: modId,
      sections
    };
  });
  return { webExLayout: { ...metrics, presetId: proj.layoutPresetId, cells }, commerce };
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function render() {
  if (!_rootEl) return;
  if (_priceOverlay) {
    _priceOverlay.remove();
    _priceOverlay = null;
  }
  if (_textOverlay) {
    _textOverlay.remove();
    _textOverlay = null;
  }
  const proj = currentProject();
  const editorDisplay = _mainTab === 'editor' ? 'flex' : 'none';
  const propsDisplay = _mainTab === 'properties' ? 'flex' : 'none';
  _rootEl.innerHTML = `
    <div class="wx-app">
      <div class="wx-main-tabs">
        <button type="button" class="wx-main-tab${_mainTab === 'editor' ? ' wx-main-tab--active' : ''}" data-wx-main-tab="editor">Editor</button>
        <button type="button" class="wx-main-tab${_mainTab === 'properties' ? ' wx-main-tab--active' : ''}" data-wx-main-tab="properties">Properties</button>
      </div>
      <div class="wx-tab-views">
        <div class="wx-editor-layout" style="display:${editorDisplay};">
          <div class="wx-left">${renderPresets(proj)}</div>
          <div class="wx-center">${proj ? renderCanvas(proj) : renderNoProject()}</div>
          <div class="wx-right">${renderModulePanel()}</div>
        </div>
        <div class="wx-properties-layout" style="display:${propsDisplay};">
          ${renderPropertiesPanel(proj)}
        </div>
      </div>
    </div>
  `;
  bindEvents();
}

function renderNoProject() {
  const projects = getState().player.webExProjects || [];
  let list = '';
  if (projects.length) {
    list = projects.map(p => `<div class="wx-proj-row" data-wx-load="${p.id}">
      <b>${escapeHtml(p.siteName || 'Untitled')}</b>
      <span style="color:#666;font-size:10px;margin-left:6px;">${p.layoutPresetId || ''}</span>
    </div>`).join('');
  }
  return `<div class="wx-empty">
    <div style="font-size:32px;margin-bottom:8px;">🌐</div>
    <div style="font-weight:bold;margin-bottom:6px;">WebEx-Publisher</div>
    <div style="color:#666;font-size:11px;margin-bottom:12px;">Select a layout preset or load an existing project.</div>
    ${list ? '<div class="wx-proj-list">' + list + '</div>' : ''}
    <button class="wx-btn wx-btn-new" data-wx-new>+ New Website</button>
  </div>`;
}

function renderPresets(proj) {
  return `<div class="wx-section-title">Layout Presets</div>
    <div class="wx-preset-hint">Applies to open site — keeps name &amp; domain.</div>` +
    LAYOUT_PRESETS.map(p => {
      const active = proj && proj.layoutPresetId === p.id ? ' wx-preset--active' : '';
      return `<div class="wx-preset${active}" data-wx-preset="${p.id}" draggable="false">
      <span>${p.icon}</span> ${escapeHtml(p.label)}
    </div>`;
    }).join('');
}

function renderInventoryPanels(proj) {
  const st = getState();
  const room = st.player.webExStockroom || [];
  const listed = proj.websiteInventory || [];
  const personalRows = room.length
    ? room.map((item) => {
        const pr = item.salePrice != null ? Number(item.salePrice) : Number(item.price) || 0;
        return `<div class="wx-inv-item" draggable="true" data-wx-stock-id="${escapeHtml(item.id)}">
          <span class="wx-inv-swatch" style="background:${escapeHtml(item.swatch || '#ccc')}"></span>
          <span class="wx-inv-item-text">${escapeHtml(item.title)} · $${pr.toFixed(2)}</span>
        </div>`;
      }).join('')
    : '<div class="wx-inv-empty">No stockroom items (seeded from RapidMart when available).</div>';
  const websiteRows = listed.length
    ? listed.map((line, idx) => {
        const src = room.find((i) => i.id === line.stockItemId);
        const title = src?.title || line.stockItemId;
        const lp = Number(line.listPrice) || 0;
        return `<div class="wx-inv-item" draggable="true" data-wx-listing-idx="${idx}">
          <span class="wx-inv-swatch" style="background:${escapeHtml(src?.swatch || '#aaa')}"></span>
          <span class="wx-inv-item-text">${escapeHtml(title)} · $${lp.toFixed(2)}</span>
        </div>`;
      }).join('')
    : '<div class="wx-inv-empty">Drag from Personal to list products for Shop / Product Listing.</div>';
  return `<div class="wx-inv-split">
    <div class="wx-inv-panel">
      <div class="wx-inv-title">Personal inventory</div>
      <div class="wx-inv-scroll" data-wx-drop-personal>${personalRows}</div>
    </div>
    <div class="wx-inv-panel">
      <div class="wx-inv-title">Website inventory</div>
      <div class="wx-inv-scroll" data-wx-drop-website>${websiteRows}</div>
    </div>
  </div>`;
}

function renderCanvas(proj) {
  const preset = LAYOUT_PRESETS.find(p => p.id === proj.layoutPresetId);
  const slots = proj.slots || [];
  const { rows, columns: gridCols } = layoutMetricsFromPreset(proj.layoutPresetId);
  const gridCells = (preset?.slots || []).map(ps => {
    const filled = slots.find(s => s.slotId === ps.slotId);
    const mod = filled?.moduleId ? moduleById(filled.moduleId) : null;
    const needsCtx =
      mod && (COMMERCE_CTX_MODULES.has(filled.moduleId) || filled.moduleId === 'custom_text_box');
    const ctxMenu = needsCtx
      ? ` data-wx-ctx-slot="${ps.slotId}" data-wx-ctx-mod="${filled.moduleId}"`
      : '';
    return `<div class="wx-slot${mod ? ' wx-slot-filled' : ''}"
        style="grid-column:${ps.x + 1}/span ${ps.w};grid-row:${ps.y + 1}/span ${ps.h};"
        data-wx-slot="${ps.slotId}"
        data-wx-accepts="${ps.accepts}"${ctxMenu}>
      ${mod
        ? `<span class="wx-slot-icon">${mod.icon}</span><span class="wx-slot-label">${escapeHtml(mod.label)}</span><button class="wx-slot-remove" data-wx-remove="${ps.slotId}" title="Remove">✕</button>`
        : `<span class="wx-slot-plus">+</span><span class="wx-slot-hint">${escapeHtml(ps.label)}</span>`}
    </div>`;
  });
  const ux = computeUxScore(proj);
  const tld = proj.domainTld || '.net';
  const fee = getWeeklyFeeForTld(tld);
  const fontOpts = TITLE_FONT_OPTIONS.map(
    (f) =>
      `<option value="${escapeHtml(f.id)}"${proj.titleFontId === f.id || (!proj.titleFontId && f.id === 'tahoma') ? ' selected' : ''}>${escapeHtml(f.label)}</option>`
  ).join('');
  const sizeOpts = TITLE_SIZE_OPTIONS.map(
    (px) =>
      `<option value="${px}"${Number(proj.titleSizePx) === px || (!proj.titleSizePx && px === 12) ? ' selected' : ''}>${px}px</option>`
  ).join('');
  const tldOpts = DOMAIN_TLD_OPTIONS.map(
    (o) =>
      `<option value="${escapeHtml(o.tld)}"${tld === o.tld ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
  ).join('');
  const titlePreviewStack = escapeHtml(getTitleFontStack(proj.titleFontId));
  const titlePreviewSize = Math.min(32, Math.max(10, Number(proj.titleSizePx) || 12));
  return `<div class="wx-center-stack">
    <div class="wx-center-top">
      <div class="wx-canvas-header">
        <input class="wx-site-name" style="font-family:${titlePreviewStack};font-size:${titlePreviewSize}px;line-height:1.2;" value="${escapeHtml(proj.siteName || '')}" data-wx-sitename placeholder="Website Name" />
        <span class="wx-ux-badge" title="UX Score">UX: ${ux}</span>
      </div>
      <div class="wx-domain-row">
        <span class="wx-domain-name-hint">Site address: <b>${escapeHtml(sanitizeDomainSlug('', proj.siteName || 'preview'))}</b> + extension (from website name).</span>
        <label class="wx-domain-label">Extension
          <select class="wx-domain-tld" data-wx-tld title="Weekly subscription by TLD">${tldOpts}</select>
        </label>
        <span class="wx-domain-fee-hint" data-wx-tld-hint>$${fee.toFixed(2)}/wk</span>
      </div>
      <div class="wx-title-style-row">
        <label class="wx-domain-label">Title font
          <select class="wx-title-font" data-wx-titlefont>${fontOpts}</select>
        </label>
        <label class="wx-domain-label">Title size
          <select class="wx-title-size" data-wx-titlesize>${sizeOpts}</select>
        </label>
      </div>
      <div class="wx-grid" style="grid-template-columns:repeat(${gridCols},1fr);grid-template-rows:repeat(${rows},80px);">${gridCells.join('')}</div>
    </div>
    ${renderInventoryPanels(proj)}
    <div class="wx-canvas-footer">
      <button class="wx-btn" data-wx-save>Save</button>
      <button class="wx-btn" data-wx-publish>Publish</button>
      <button class="wx-btn wx-btn-danger" data-wx-delete>Delete</button>
    </div>
  </div>`;
}

function renderModulePanel() {
  return `<div class="wx-section-title">Modules</div>` +
    _modules.map(m => `<div class="wx-module" draggable="true" data-wx-mod="${m.id}" title="${escapeHtml(m.description)}">
      <span>${m.icon}</span> ${escapeHtml(m.label)}
      <span class="wx-mod-stats">+${m.utilityScore}/${-m.clutterScore}</span>
    </div>`).join('');
}

function closePriceEditor(force) {
  if (!_priceOverlay) return;
  const win = _priceOverlay.querySelector('.wx-price-window');
  const dirty = win?.getAttribute('data-wx-price-dirty') === '1';
  if (!force && dirty) {
    if (!window.confirm('Are you sure you wish to exit without saving?')) return;
  }
  _priceOverlay.remove();
  _priceOverlay = null;
}

function openPriceEditor() {
  const proj = currentProject();
  if (!proj) return;
  const st = getState();
  const inv = proj.websiteInventory || [];
  const roomBy = Object.fromEntries((st.player.webExStockroom || []).map((i) => [i.id, i]));
  const host =
    document.querySelector('#win-webex-publisher .wc') ||
    document.getElementById('win-webex-publisher') ||
    document.body;
  if (_priceOverlay) _priceOverlay.remove();
  _priceOverlay = document.createElement('div');
  _priceOverlay.className = 'wx-price-overlay';
  const rows = inv
    .map((line, idx) => {
      const src = roomBy[line.stockItemId];
      const title = escapeHtml(src?.title || line.stockItemId);
      const lp = Number(line.listPrice) || 0;
      return `<tr data-wx-price-row="${idx}">
        <td>${title}</td>
        <td><input type="number" step="0.01" min="0" class="wx-price-input" data-wx-price-idx="${idx}" value="${lp.toFixed(2)}" /></td>
      </tr>`;
    })
    .join('');
  _priceOverlay.innerHTML = `<div class="wx-price-window">
    <button type="button" class="wx-price-exit" data-wx-price-exit title="Exit">✕</button>
    <div class="wx-price-title">Edit prices</div>
    <p class="wx-price-sub">Website inventory — prices apply to the live store on publish.</p>
    <table class="wx-price-table">
      <thead><tr><th>Product</th><th>Price ($)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2">No listed products. Drag items into Website inventory.</td></tr>'}</tbody>
    </table>
    <div class="wx-price-actions">
      <button type="button" class="wx-btn" data-wx-price-save>Save</button>
    </div>
  </div>`;
  host.appendChild(_priceOverlay);
  _priceOverlay.querySelectorAll('.wx-price-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      inp.closest('.wx-price-window')?.setAttribute('data-wx-price-dirty', '1');
    });
  });
  _priceOverlay.querySelector('[data-wx-price-save]')?.addEventListener('click', () => {
    const fresh = currentProject();
    if (!fresh) return;
    patchState((s) => {
      const p = (s.player.webExProjects || []).find((x) => x.id === fresh.id);
      if (!p?.websiteInventory) return s;
      _priceOverlay.querySelectorAll('.wx-price-input').forEach((inp) => {
        const i = parseInt(inp.getAttribute('data-wx-price-idx'), 10);
        if (Number.isNaN(i) || !p.websiteInventory[i]) return;
        const v = parseFloat(inp.value);
        p.websiteInventory[i].listPrice = !Number.isNaN(v) && v > 0 ? v : p.websiteInventory[i].listPrice;
      });
      return s;
    });
    _priceOverlay.querySelector('.wx-price-window')?.setAttribute('data-wx-price-dirty', '0');
    setStatus('Prices saved.');
    closePriceEditor(true);
    render();
  });
  _priceOverlay.querySelector('[data-wx-price-exit]')?.addEventListener('click', () => {
    closePriceEditor(false);
  });
  _priceOverlay.addEventListener('click', (e) => {
    if (e.target === _priceOverlay) closePriceEditor(false);
  });
}

function showSlotContextMenu(clientX, clientY, slotId, modId) {
  document.querySelector('.wx-ctx-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'wx-ctx-menu';
  let items = '';
  if (modId === 'shop' || modId === 'product_listing') {
    items = `<div class="wx-ctx-item" data-wx-ctx="prices">Edit prices</div>
    <div class="wx-ctx-item" data-wx-ctx="inventory">Manage inventory</div>
    <div class="wx-ctx-item" data-wx-ctx="settings">Module settings</div>`;
  } else if (modId === 'custom_text_box') {
    items = `<div class="wx-ctx-item" data-wx-ctx="edittext">Edit text</div>
    <div class="wx-ctx-item" data-wx-ctx="settings">Module settings</div>`;
  } else {
    items = `<div class="wx-ctx-item" data-wx-ctx="settings">Module settings</div>`;
  }
  menu.innerHTML = items;
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;
  document.body.appendChild(menu);
  const close = () => {
    menu.remove();
    document.removeEventListener('click', close, true);
  };
  setTimeout(() => document.addEventListener('click', close, true), 0);
  menu.querySelector('[data-wx-ctx="prices"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
    openPriceEditor();
  });
  menu.querySelector('[data-wx-ctx="inventory"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
    _rootEl?.querySelector('[data-wx-drop-website]')?.scrollIntoView({ block: 'nearest' });
    setStatus('Website inventory — drag items to list or unlist.');
  });
  menu.querySelector('[data-wx-ctx="edittext"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
    openTextBoxEditor(slotId);
  });
  menu.querySelector('[data-wx-ctx="settings"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
    const mod = moduleById(modId);
    window.alert(
      `${mod?.label || modId}\n\nUtility +${mod?.utilityScore ?? 0} · Clutter ${mod?.clutterScore ?? 0}\n${mod?.description || ''}`
    );
  });
}

function closeTextEditor(force) {
  if (!_textOverlay) return;
  const win = _textOverlay.querySelector('.wx-price-window');
  const dirty = win?.getAttribute('data-wx-text-dirty') === '1';
  if (!force && dirty) {
    if (!window.confirm('Are you sure you wish to exit without saving?')) return;
  }
  _textOverlay.remove();
  _textOverlay = null;
}

function openTextBoxEditor(slotId) {
  const proj = currentProject();
  if (!proj || !slotId) return;
  const st = getState();
  const p = (st.player.webExProjects || []).find((x) => x.id === proj.id);
  if (!p) return;
  const data = p.slotModuleData?.[slotId] || { headline: '', body: '' };
  const host =
    document.querySelector('#win-webex-publisher .wc') ||
    document.getElementById('win-webex-publisher') ||
    document.body;
  if (_textOverlay) _textOverlay.remove();
  _textOverlay = document.createElement('div');
  _textOverlay.className = 'wx-price-overlay';
  _textOverlay.innerHTML = `<div class="wx-price-window">
    <button type="button" class="wx-price-exit" data-wx-text-exit title="Exit">✕</button>
    <div class="wx-price-title">Edit text box</div>
    <p class="wx-price-sub">Content appears in this slot on the live site.</p>
    <label class="wx-text-edit-label">Headline (optional)<br><input type="text" class="wx-text-headline" data-wx-text-headline value="${escapeHtml(data.headline || '')}" maxlength="120" /></label>
    <label class="wx-text-edit-label">Body<br><textarea class="wx-text-body" data-wx-text-body rows="6" maxlength="4000">${escapeHtml(data.body || '')}</textarea></label>
    <div class="wx-price-actions">
      <button type="button" class="wx-btn" data-wx-text-save>Save</button>
    </div>
  </div>`;
  host.appendChild(_textOverlay);
  const markDirty = () => {
    _textOverlay.querySelector('.wx-price-window')?.setAttribute('data-wx-text-dirty', '1');
  };
  _textOverlay.querySelector('[data-wx-text-headline]')?.addEventListener('input', markDirty);
  _textOverlay.querySelector('[data-wx-text-body]')?.addEventListener('input', markDirty);
  _textOverlay.querySelector('[data-wx-text-save]')?.addEventListener('click', () => {
    const h = _textOverlay.querySelector('[data-wx-text-headline]')?.value?.trim().slice(0, 120) || '';
    const b = _textOverlay.querySelector('[data-wx-text-body]')?.value?.slice(0, 4000) || '';
    patchState((s) => {
      const projRow = (s.player.webExProjects || []).find((x) => x.id === proj.id);
      if (!projRow) return s;
      if (!projRow.slotModuleData) projRow.slotModuleData = {};
      projRow.slotModuleData[slotId] = { headline: h, body: b };
      return s;
    });
    _textOverlay.querySelector('.wx-price-window')?.setAttribute('data-wx-text-dirty', '0');
    setStatus('Text saved.');
    closeTextEditor(true);
    render();
  });
  _textOverlay.querySelector('[data-wx-text-exit]')?.addEventListener('click', () => {
    closeTextEditor(false);
  });
  _textOverlay.addEventListener('click', (e) => {
    if (e.target === _textOverlay) closeTextEditor(false);
  });
}

// ─── Events ──────────────────────────────────────────────────────────────────

function bindEvents() {
  if (!_rootEl) return;

  _rootEl.querySelectorAll('[data-wx-main-tab]').forEach((el) => {
    el.addEventListener('click', () => {
      const tab = el.getAttribute('data-wx-main-tab');
      if (tab === 'editor' || tab === 'properties') {
        _mainTab = tab;
        render();
      }
    });
  });

  _rootEl.querySelectorAll('[data-wx-preset]').forEach(el => {
    el.addEventListener('click', () => {
      applyLayoutPresetToProject(el.getAttribute('data-wx-preset'));
    });
  });

  _rootEl.querySelectorAll('[data-wx-load]').forEach(el => {
    el.addEventListener('click', () => {
      _currentProjectId = el.getAttribute('data-wx-load');
      render();
    });
  });

  _rootEl.querySelector('[data-wx-new]')?.addEventListener('click', () => {
    createNewProject('shop_forward');
  });

  const nameInput = _rootEl.querySelector('[data-wx-sitename]');
  if (nameInput) {
    nameInput.addEventListener('change', () => {
      const proj = currentProject();
      if (!proj) return;
      patchState(s => {
        const p = (s.player.webExProjects || []).find(x => x.id === proj.id);
        if (p) p.siteName = nameInput.value.trim().slice(0, 40);
        return s;
      });
      setStatus(`Renamed to "${nameInput.value.trim().slice(0, 40)}".`);
      render();
    });
  }

  const tldSel = _rootEl.querySelector('[data-wx-tld]');
  if (tldSel) {
    tldSel.addEventListener('change', () => {
      const proj = currentProject();
      if (!proj) return;
      patchState(s => {
        const p = (s.player.webExProjects || []).find(x => x.id === proj.id);
        if (p) p.domainTld = tldSel.value;
        return s;
      });
      refreshDomainFeeHint();
    });
  }

  _rootEl.querySelector('[data-wx-titlefont]')?.addEventListener('change', () => {
    const proj = currentProject();
    if (!proj) return;
    const v = _rootEl.querySelector('[data-wx-titlefont]')?.value;
    patchState(s => {
      const p = (s.player.webExProjects || []).find(x => x.id === proj.id);
      if (p) p.titleFontId = v;
      return s;
    });
    render();
  });

  _rootEl.querySelector('[data-wx-titlesize]')?.addEventListener('change', () => {
    const proj = currentProject();
    if (!proj) return;
    const v = parseInt(_rootEl.querySelector('[data-wx-titlesize]')?.value, 10);
    patchState(s => {
      const p = (s.player.webExProjects || []).find(x => x.id === proj.id);
      if (p) p.titleSizePx = Number.isNaN(v) ? 12 : v;
      return s;
    });
    render();
  });

  refreshDomainFeeHint();

  _rootEl.querySelector('[data-wx-save]')?.addEventListener('click', saveProject);
  _rootEl.querySelector('[data-wx-publish]')?.addEventListener('click', publishProject);
  _rootEl.querySelector('[data-wx-delete]')?.addEventListener('click', deleteProject);

  _rootEl.querySelectorAll('[data-wx-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeModuleFromSlot(btn.getAttribute('data-wx-remove'));
    });
  });

  _rootEl.querySelectorAll('[data-wx-mod]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', el.getAttribute('data-wx-mod'));
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  _rootEl.querySelectorAll('[data-wx-stock-id]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', `stock:${el.getAttribute('data-wx-stock-id')}`);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  _rootEl.querySelectorAll('[data-wx-listing-idx]').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', `listing:${el.getAttribute('data-wx-listing-idx')}`);
      e.dataTransfer.effectAllowed = 'move';
    });
  });

  const webDrop = _rootEl.querySelector('[data-wx-drop-website]');
  if (webDrop) {
    webDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      webDrop.classList.add('wx-inv-hover');
    });
    webDrop.addEventListener('dragleave', () => webDrop.classList.remove('wx-inv-hover'));
    webDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      webDrop.classList.remove('wx-inv-hover');
      const raw = e.dataTransfer.getData('text/plain');
      if (raw.startsWith('stock:')) addWebsiteListing(raw.slice(6));
    });
  }

  const perDrop = _rootEl.querySelector('[data-wx-drop-personal]');
  if (perDrop) {
    perDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      perDrop.classList.add('wx-inv-hover');
    });
    perDrop.addEventListener('dragleave', () => perDrop.classList.remove('wx-inv-hover'));
    perDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      perDrop.classList.remove('wx-inv-hover');
      const raw = e.dataTransfer.getData('text/plain');
      if (raw.startsWith('listing:')) removeWebsiteListing(parseInt(raw.slice(8), 10));
    });
  }

  _rootEl.querySelectorAll('[data-wx-slot]').forEach(el => {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('wx-slot-hover');
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('wx-slot-hover');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('wx-slot-hover');
      const raw = e.dataTransfer.getData('text/plain');
      if (raw.startsWith('stock:') || raw.startsWith('listing:')) return;
      const modId = raw;
      const slotId = el.getAttribute('data-wx-slot');
      if (modId && slotId) placeModuleInSlot(slotId, modId);
    });
    el.addEventListener('click', () => {
      if (el.classList.contains('wx-slot-filled')) return;
      showModulePicker(el.getAttribute('data-wx-slot'));
    });
    const ctxMod = el.getAttribute('data-wx-ctx-mod');
    if (ctxMod) {
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showSlotContextMenu(e.clientX, e.clientY, el.getAttribute('data-wx-slot'), ctxMod);
      });
    }
  });
}

function showModulePicker(slotId) {
  const proj = currentProject();
  if (!proj) return;
  const slot = (LAYOUT_PRESETS.find(p => p.id === proj.layoutPresetId)?.slots || []).find(s => s.slotId === slotId);
  if (!slot) return;
  const compatible = _modules.filter(m => {
    if (slot.accepts === 'small') return true;
    if (slot.accepts === 'medium') return m.slotSize !== 'large' || slot.accepts === 'large';
    return true;
  });
  const menu = document.createElement('div');
  menu.className = 'wx-picker-overlay';
  menu.innerHTML = `<div class="wx-picker">
    <div class="wx-picker-title">Select Module for "${escapeHtml(slot.label)}"</div>
    ${compatible.map(m => `<div class="wx-picker-item" data-pick="${m.id}">
      ${m.icon} ${escapeHtml(m.label)} <span class="wx-mod-stats">+${m.utilityScore}/${-m.clutterScore}</span>
    </div>`).join('')}
    <button class="wx-btn wx-picker-cancel">Cancel</button>
  </div>`;
  _rootEl.appendChild(menu);
  menu.querySelector('.wx-picker-cancel')?.addEventListener('click', () => menu.remove());
  menu.querySelectorAll('[data-pick]').forEach(el => {
    el.addEventListener('click', () => {
      placeModuleInSlot(slotId, el.getAttribute('data-pick'));
      menu.remove();
    });
  });
}

function addWebsiteListing(stockItemId) {
  const proj = currentProject();
  if (!proj) return;
  let dup = false;
  patchState((s) => {
    const p = (s.player.webExProjects || []).find((x) => x.id === proj.id);
    if (!p) return s;
    if (!Array.isArray(p.websiteInventory)) p.websiteInventory = [];
    if (p.websiteInventory.some((l) => l.stockItemId === stockItemId)) {
      dup = true;
      return s;
    }
    const stock = (s.player.webExStockroom || []).find((i) => i.id === stockItemId);
    const listPrice = Number(stock?.salePrice ?? stock?.price) || 9.99;
    const safe = String(p.id).replace(/[^a-z0-9]/gi, '').slice(-10) || 'p';
    const sid = String(stockItemId).replace(/[^a-z0-9_]/gi, '_');
    p.websiteInventory.push({
      stockItemId,
      listPrice,
      storeProductId: `${safe}_${sid}`.slice(0, 48)
    });
    return s;
  });
  setStatus(dup ? 'That item is already listed on the website.' : 'Added to website inventory.');
  render();
}

function removeWebsiteListing(idx) {
  const proj = currentProject();
  if (!proj || Number.isNaN(idx)) return;
  patchState((s) => {
    const p = (s.player.webExProjects || []).find((x) => x.id === proj.id);
    if (!p?.websiteInventory || idx < 0 || idx >= p.websiteInventory.length) return s;
    p.websiteInventory.splice(idx, 1);
    return s;
  });
  setStatus('Removed from website inventory.');
  render();
}

function createNewProject(presetId) {
  const preset = LAYOUT_PRESETS.find(p => p.id === presetId) || LAYOUT_PRESETS[0];
  const id = uid();
  const proj = {
    id,
    siteName: '',
    domainSlug: '',
    domainTld: '.net',
    titleFontId: 'tahoma',
    titleSizePx: 12,
    slotModuleData: {},
    layoutPresetId: preset.id,
    slots: preset.slots.map(s => ({ slotId: s.slotId, moduleId: null })),
    websiteInventory: [],
    createdSimMs: getState().sim?.elapsedMs || 0,
    publishedPageId: null,
    publishedStoreId: null,
    lastPublishedHost: null,
  };
  patchState(s => {
    if (!Array.isArray(s.player.webExProjects)) s.player.webExProjects = [];
    s.player.webExProjects.push(proj);
    return s;
  });
  _currentProjectId = id;
  setStatus('New project created.');
  render();
}

function placeModuleInSlot(slotId, moduleId) {
  const proj = currentProject();
  if (!proj) return;
  const mod = moduleById(moduleId);
  if (!mod) return;
  const placed = new Set(proj.slots.filter(s => s.moduleId).map(s => s.moduleId));
  for (const req of (mod.requires || [])) {
    if (!placed.has(req)) {
      setStatus(`"${mod.label}" requires "${moduleById(req)?.label || req}" to be placed first.`);
      return;
    }
  }
  patchState(s => {
    const p = (s.player.webExProjects || []).find(x => x.id === proj.id);
    if (!p) return s;
    const slot = p.slots.find(sl => sl.slotId === slotId);
    if (slot) slot.moduleId = moduleId;
    if (moduleId === 'custom_text_box') {
      if (!p.slotModuleData) p.slotModuleData = {};
      if (!p.slotModuleData[slotId]) {
        p.slotModuleData[slotId] = {
          headline: '',
          body: 'Right-click this slot → Edit text. This copy appears on the live site.'
        };
      }
    }
    return s;
  });
  setStatus(`Placed "${mod.label}".`);
  render();
}

function removeModuleFromSlot(slotId) {
  const proj = currentProject();
  if (!proj) return;
  patchState(s => {
    const p = (s.player.webExProjects || []).find(x => x.id === proj.id);
    if (!p) return s;
    const slot = p.slots.find(sl => sl.slotId === slotId);
    if (slot) {
      if (p.slotModuleData && slot.moduleId === 'custom_text_box' && p.slotModuleData[slotId]) {
        delete p.slotModuleData[slotId];
      }
      slot.moduleId = null;
    }
    return s;
  });
  setStatus('Module removed.');
  render();
}

function saveProject() {
  setStatus('Project saved.');
}

function publishProject() {
  const proj = currentProject();
  if (!proj) return;
  if (!proj.siteName?.trim()) {
    setStatus('Enter a website name before publishing.');
    return;
  }
  const siteName = proj.siteName.trim();
  const fullHost = buildPublicHost(proj);
  const fee = getWeeklyFeeForTld(proj.domainTld || '.net');
  const shouldChargeDomain = !proj.lastPublishedHost || proj.lastPublishedHost !== fullHost;
  if (shouldChargeDomain) {
    if (playerSpendableFunds(getState()) < fee) {
      setStatus(
        `Insufficient funds (wallet + bank). First week for ${proj.domainTld || '.net'} is $${fee.toFixed(2)}.`
      );
      return;
    }
  }

  const storeId = proj.publishedStoreId || `player-${proj.id}`;
  const pageId = proj.publishedPageId || newPageId();
  const titleFontStack = getTitleFontStack(proj.titleFontId);
  const titleSizePx = Math.min(32, Math.max(10, Number(proj.titleSizePx) || 12));

  upsertWebExCommerceStore(storeId, fullHost, siteName, proj);

  const { webExLayout, commerce } = buildWebExMirrorLayout(proj, storeId);
  const placedModuleIds = proj.slots.filter((s) => s.moduleId).map((s) => s.moduleId);

  patchState((s) => {
    if (shouldChargeDomain) {
      deductWebExHostingFee(
        s,
        fee,
        `Web domain ${fullHost} — weekly hosting (${proj.domainTld || '.net'})`
      );
    }

    if (!s.contentRegistry) s.contentRegistry = { pages: [], companies: [], npcs: [], government: {} };
    if (!Array.isArray(s.contentRegistry.pages)) s.contentRegistry.pages = [];
    const existing = s.contentRegistry.pages.findIndex((pg) => pg.pageId === pageId);
    const pageDef = {
      ...defaultPageDef({
        category: commerce ? 'shopping' : 'general'
      }),
      pageId,
      url: `http://${fullHost}/`,
      title: siteName,
      siteName,
      hasShop: commerce,
      shopId: commerce ? storeId : undefined,
      modules: placedModuleIds,
      uxScore: computeUxScore(proj),
      webExProjectId: proj.id,
      layoutTemplate: 'webex_mirror',
      webExLayout,
      webExTitleFontStack: titleFontStack,
      webExTitleSizePx: titleSizePx,
      sections: [],
      navLinks: [],
      footerText: `© 2000 ${siteName} · Built with WebEx-Publisher™`,
      siteTagline: commerce ? 'WorldNet Commerce enabled' : 'WebEx-Publisher site'
    };
    if (existing >= 0) {
      s.contentRegistry.pages[existing] = pageDef;
    } else {
      s.contentRegistry.pages.push(pageDef);
    }

    const p = (s.player.webExProjects || []).find((x) => x.id === proj.id);
    if (p) {
      p.publishedPageId = pageId;
      p.publishedStoreId = storeId;
      p.lastPublishedHost = fullHost;
    }

    if (!Array.isArray(s.player.webExDomainSubscriptions)) s.player.webExDomainSubscriptions = [];
    const subs = s.player.webExDomainSubscriptions;
    const idx = subs.findIndex((x) => x.projectId === proj.id);
    const now = s.sim?.elapsedMs ?? 0;
    if (idx >= 0) {
      const prev = subs[idx];
      if (shouldChargeDomain) {
        subs[idx] = {
          projectId: proj.id,
          publicHost: fullHost,
          weeklyFee: fee,
          nextDueSimMs: now + SIM_WEEK_MS
        };
      } else {
        subs[idx] = {
          ...prev,
          publicHost: fullHost,
          weeklyFee: fee
        };
      }
    } else {
      subs.push({
        projectId: proj.id,
        publicHost: fullHost,
        weeklyFee: fee,
        nextDueSimMs: now + SIM_WEEK_MS
      });
    }

    return s;
  });

  setPipelinePageRoutes(getState().contentRegistry.pages || []);

  setStatus(
    `Published "${siteName}" at ${fullHost}${shouldChargeDomain ? ` — charged $${fee.toFixed(2)} for domain week` : ''}.`
  );
  render();
}

function deleteProject() {
  const proj = currentProject();
  if (!proj) return;
  patchState(s => {
    s.player.webExProjects = (s.player.webExProjects || []).filter(p => p.id !== proj.id);
    if (Array.isArray(s.player.webExDomainSubscriptions)) {
      s.player.webExDomainSubscriptions = s.player.webExDomainSubscriptions.filter(
        (x) => x.projectId !== proj.id
      );
    }
    return s;
  });
  _currentProjectId = null;
  setStatus('Project deleted.');
  render();
}

function setStatus(msg) {
  const el = document.getElementById('webex-status');
  if (el) el.textContent = msg;
}

export async function initWebExPublisher(loadJson) {
  try {
    const raw = await loadJson('webex-modules.json');
    _modules = Array.isArray(raw) ? raw : [];
  } catch { _modules = []; }

  _rootEl = document.getElementById('webex-root');
  if (!_rootEl) return;
  ensureWebExStockroom();
  render();
}

export { computeUxScore };
