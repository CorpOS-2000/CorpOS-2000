/**
 * scam-purchases.js — Scam site purchase resolution.
 *
 * resolveScamPurchase() is called from worldnet-shop.js after charging the player
 * for a purchase on a scam site. It rolls the delivery table and returns an outcome
 * object, then persists the event in player.scamHistory.
 *
 * Subtle visual signals for the Y2K renderer are exported separately.
 */
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { deliverAsset } from './player-assets.js';
import { toast } from './toast.js';

/**
 * @typedef {'nothing' | 'fake' | 'jackpot'} ScamOutcomeKind
 *
 * @typedef {{
 *   kind: ScamOutcomeKind,
 *   assetDelivered?: boolean,
 *   assetId?: string,
 *   message: string
 * }} ScamResult
 */

const FAKE_ITEM_POOL = [
  { name: 'Clearly Empty Box', valueUsd: 0.01, quality: 1 },
  { name: 'Generic "Electronics" Bag', valueUsd: 0.50, quality: 5 },
  { name: 'Counterfeit Software CD (Blank)', valueUsd: 0.25, quality: 2 },
  { name: '"Authentic" Certificate of Purchase', valueUsd: 0.10, quality: 1 },
  { name: 'Mystery Components (Unidentifiable)', valueUsd: 1.00, quality: 10 },
  { name: 'Bag of Packing Peanuts', valueUsd: 0.00, quality: 0 },
  { name: 'Broken Peripheral Adapter', valueUsd: 0.75, quality: 3 },
  { name: 'Off-Brand Surge Protector (Untested)', valueUsd: 3.00, quality: 15 }
];

const JACKPOT_ITEM_POOL = [
  { name: 'Uncirculated 1999 Mint Error Coin', valueUsd: 280, quality: 98 },
  { name: 'Pre-IPO Stock Certificate (Unverified)', valueUsd: 500, quality: 70 },
  { name: 'Sealed Y2K Prep Kit (Complete)', valueUsd: 120, quality: 90 },
  { name: 'Vintage Server RAM — 256MB ECC', valueUsd: 200, quality: 85 },
  { name: 'Rare Promo DVD Bundle (Unopened)', valueUsd: 75, quality: 95 }
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Roll the delivery table and resolve what the player receives (or doesn't).
 *
 * @param {{ scam: import('./worldnet-site-registry.js').ScamMeta }} siteMeta
 * @param {{ storeId: string, orderId: string, total: number, lines: { title: string, qty: number, unitPrice: number }[] }} cart
 * @returns {ScamResult}
 */
export function resolveScamPurchase(siteMeta, cart) {
  const deliveryTable = siteMeta.scam?.deliveryTable || [
    { p: 0.1, outcome: 'jackpot' },
    { p: 0.3, outcome: 'fake' },
    { p: 0.6, outcome: 'nothing' }
  ];

  // Normalize probabilities to sum to 1
  const total = deliveryTable.reduce((s, r) => s + (r.p || 0), 0) || 1;
  let roll = Math.random() * total;
  let resolved = 'nothing';
  for (const row of deliveryTable) {
    roll -= (row.p || 0);
    if (roll <= 0) {
      resolved = row.outcome;
      break;
    }
  }

  const simMs = getState().sim?.elapsedMs ?? 0;
  const historyEntry = {
    id: `scam-${Date.now().toString(36)}`,
    storeId: cart.storeId,
    orderId: cart.orderId,
    chargedUsd: cart.total,
    outcome: resolved,
    simMs,
    assetId: null
  };

  let result;

  if (resolved === 'nothing') {
    patchState((s) => {
      if (!Array.isArray(s.player.scamHistory)) s.player.scamHistory = [];
      s.player.scamHistory.push(historyEntry);
      return s;
    });
    result = {
      kind: 'nothing',
      assetDelivered: false,
      message: `Your order from "${cart.storeId}" never arrived. No refund available.`
    };
    toast(`Order ${cart.orderId}: Item never shipped. Possible fraud.`);

  } else if (resolved === 'fake') {
    const template = pickRandom(FAKE_ITEM_POOL);
    const delivery = deliverAsset({
      name: template.name,
      sourceSiteId: cart.storeId,
      kind: 'fake',
      valueUsd: template.valueUsd,
      quality: template.quality,
      flags: { counterfeit: true },
      orderId: cart.orderId
    });
    historyEntry.assetId = null; // id not easily available cross-call but logged for history
    patchState((s) => {
      if (!Array.isArray(s.player.scamHistory)) s.player.scamHistory = [];
      s.player.scamHistory.push(historyEntry);
      return s;
    });
    result = {
      kind: 'fake',
      assetDelivered: delivery.ok,
      message: `Your order from "${cart.storeId}" arrived — but the item appears to be a counterfeit.`
    };
    toast(`Order ${cart.orderId}: Suspicious item received — check your inventory.`);

  } else {
    // jackpot
    const template = pickRandom(JACKPOT_ITEM_POOL);
    const delivery = deliverAsset({
      name: template.name,
      sourceSiteId: cart.storeId,
      kind: 'rare',
      valueUsd: template.valueUsd,
      quality: template.quality,
      flags: { jackpot: true },
      orderId: cart.orderId
    });
    patchState((s) => {
      if (!Array.isArray(s.player.scamHistory)) s.player.scamHistory = [];
      s.player.scamHistory.push({ ...historyEntry, outcome: 'jackpot' });
      return s;
    });
    result = {
      kind: 'jackpot',
      assetDelivered: delivery.ok,
      message: `Unexpected windfall from "${cart.storeId}" — something valuable arrived with your order.`
    };
    toast(`Order ${cart.orderId}: Rare item received! Check your inventory.`);
  }

  return result;
}

/**
 * Subtle CSS class string to inject into a Y2K page wrapper when rendering a scam site.
 * Level 1 = barely noticeable; level 3 = noticeably off domain/style.
 *
 * CSS classes must be defined in styles.css or webexploiter.css.
 * @param {number} copyTypoLevel
 * @returns {string}
 */
export function scamPageCssClass(copyTypoLevel) {
  if (copyTypoLevel >= 3) return 'wn-scam-heavy';
  if (copyTypoLevel >= 2) return 'wn-scam-medium';
  if (copyTypoLevel >= 1) return 'wn-scam-light';
  return '';
}

/**
 * Generate a subtle disclaimer HTML line shown at the bottom of scam sites
 * (e.g. vague "satisfaction guarantee" with broken address details).
 * The player has to notice the inconsistencies themselves.
 * @param {import('./worldnet-site-registry.js').SiteEntry} entry
 * @returns {string}
 */
export function scamFooterHtml(entry) {
  if (entry?.outcome !== 'scam') return '';
  const level = entry.scam?.copyTypoLevel ?? 0;

  if (level >= 3) {
    return `<div style="font-size:9px;color:#888;border-top:1px solid #ddd;margin-top:8px;padding-top:4px;">
      © 1999 InterNational Online Trust Comercial Group LLC. All rights resereved.
      <br>Registred at: 1 Busines Park Dr, Ste 99B, [City], [State] 00000
      <br><span style="color:#aaa;">SSL Cerrtificate: Pending Verificaton</span>
    </div>`;
  }
  if (level >= 2) {
    return `<div style="font-size:9px;color:#999;border-top:1px solid #ddd;margin-top:8px;padding-top:4px;">
      © 1999 Online Merchant Services, Inc. &bull; Satisfacton Guaranteed*
      <br><span style="color:#bbb;font-size:8px;">*Subject to processing and verification periods of up to 180 business days.</span>
    </div>`;
  }
  if (level >= 1) {
    return `<div style="font-size:9px;color:#aaa;border-top:1px solid #eee;margin-top:8px;padding-top:4px;">
      Secure Shopping Guaranteed &bull; 128-bit Encription &bull; Privacy Protected
    </div>`;
  }
  return '';
}
