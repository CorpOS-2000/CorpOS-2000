/**
 * player-store.js — Player asset resale system.
 *
 * Players can list assets from their inventory for sale on their published WebEx
 * website. Each day, the market tick simulates NPC buyers visiting and potentially
 * purchasing listed assets. A scam roll is optionally applied on the buyer side
 * (the NPC may be a fraudulent buyer who doesn't pay, mirroring real scam logic).
 *
 * Integration:
 *  - Called from app.js daily tick (tickPlayerStore)
 *  - UI rendered via renderPlayerStoreHtml() for embedding in WebEx or inventory panels
 */
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { getListedAssets, consumeAsset, unlistAsset } from './player-assets.js';
import { toast } from './toast.js';
import { getPageAdOutcomeWeights, getAllAdAnalytics } from './ad-analytics.js';
import { escapeHtml } from './identity.js';

const STORE_FEE_RATE = 0.08; // 8% listing fee on sale
const MAX_LISTINGS = 15;

/**
 * List an asset for sale at a given asking price.
 * @param {string} assetId
 * @param {number} askPrice
 * @returns {{ ok: boolean, error?: string }}
 */
export function listAssetForSale(assetId, askPrice) {
  const st = getState();
  const listed = (st.player?.assets || []).filter((a) => a.listed);
  if (listed.length >= MAX_LISTINGS) {
    return { ok: false, error: `Listing limit reached (max ${MAX_LISTINGS}).` };
  }
  const asset = (st.player?.assets || []).find((a) => a.id === assetId);
  if (!asset) return { ok: false, error: 'Asset not found.' };
  if (asset.flags?.property) return { ok: false, error: 'Real estate cannot be listed on the item store.' };

  const price = Math.max(0.01, Number(askPrice) || asset.valueUsd || 1);
  patchState((s) => {
    const a = (s.player.assets || []).find((x) => x.id === assetId);
    if (a) {
      a.listed = true;
      a.askPrice = price;
    }
    return s;
  });
  return { ok: true };
}

/**
 * Delist an asset (player removes it from sale).
 * @param {string} assetId
 */
export function delistAsset(assetId) {
  patchState((s) => {
    const a = (s.player?.assets || []).find((x) => x.id === assetId);
    if (a) {
      a.listed = false;
      a.askPrice = undefined;
    }
    return s;
  });
}

/**
 * Daily tick: simulate NPC buyers visiting the player's store.
 * Uses ad analytics to weight how many buyers show up and whether they convert.
 * Scam roll: a small chance the "buyer" is fraudulent and doesn't pay.
 * @returns {{ sold: number, revenue: number, scammedSales: number }}
 */
export function tickPlayerStore() {
  const listed = getListedAssets();
  if (!listed.length) return { sold: 0, revenue: 0, scammedSales: 0 };

  // Use ad analytics from player's WebEx store page for visitor modelling
  const allAnalytics = getAllAdAnalytics();
  const storeAdIds = Object.keys(allAnalytics).filter(
    (id) => (allAnalytics[id]?.impressions ?? 0) > 0
  );
  const adWeights = getPageAdOutcomeWeights(storeAdIds);

  // Base visitor count: 0–3 NPC buyers per day, boosted by ad engagement
  const baseVisitors = Math.floor(Math.random() * 3);
  const engagedBoost = adWeights.engagement > 1.1 ? 1 : 0;
  const visitorCount = baseVisitors + engagedBoost;

  let sold = 0;
  let revenue = 0;
  let scammedSales = 0;

  for (let v = 0; v < visitorCount; v++) {
    // Bounce check — irritating ads drive buyers away
    const bounceThresh = Math.min(0.5, (adWeights.bounce - 1) * 0.3);
    if (Math.random() < bounceThresh) continue;

    // Pick a random listed asset
    const currentListed = (getState().player?.assets || []).filter((a) => a.listed && !a.flags?.property);
    if (!currentListed.length) break;
    const asset = currentListed[Math.floor(Math.random() * currentListed.length)];

    // Conversion check — base 35% + ad conversion boost
    const convProb = Math.min(0.8, 0.35 * adWeights.conversion);
    if (Math.random() > convProb) continue;

    // Scam roll on buyer side: 5% chance buyer doesn't pay
    const buyerScam = Math.random() < 0.05;
    if (buyerScam) {
      scammedSales++;
      // Asset gets "taken" but no payment received
      consumeAsset(asset.id);
      toast(`A buyer collected "${asset.name}" from your store without paying. Possible fraud.`);
      continue;
    }

    const price = Number(asset.askPrice) || asset.valueUsd || 1;
    const fee = Math.ceil(price * STORE_FEE_RATE * 100) / 100;
    const proceeds = Math.max(0, price - fee);

    patchState((s) => {
      s.player.hardCash = (s.player.hardCash || 0) + proceeds;
      const idx = (s.player.assets || []).findIndex((a) => a.id === asset.id);
      if (idx !== -1) s.player.assets.splice(idx, 1);
      return s;
    });

    sold++;
    revenue += proceeds;
  }

  if (sold > 0) {
    toast(`Your store sold ${sold} item${sold > 1 ? 's' : ''} today. Revenue: $${revenue.toFixed(2)}.`);
  }

  return { sold, revenue, scammedSales };
}

/**
 * Render player store inventory management HTML.
 * Shows listed items with delist buttons and unlisted items with a list-for-sale form.
 * @returns {string} HTML
 */
export function renderPlayerStoreHtml() {
  const st = getState();
  const assets = st.player?.assets || [];
  const listed = assets.filter((a) => a.listed && !a.flags?.property);
  const unlisted = assets.filter((a) => !a.listed && !a.flags?.property && !a.stored);

  let html = `<div style="font-family:Tahoma,Arial,sans-serif;font-size:11px;">`;

  html += `<div style="margin-bottom:8px;padding:4px 8px;background:#f0f8ff;border:1px solid #99bbdd;">
    <b>Player Store</b> — List items from your inventory for sale. NPC buyers visit daily.
    <br><span style="color:#666;font-size:10px;">Fee: ${(STORE_FEE_RATE * 100).toFixed(0)}% per sale &bull; Max ${MAX_LISTINGS} listings</span>
  </div>`;

  if (listed.length) {
    html += `<div style="margin:6px 0 3px;"><b style="color:#003366;">Listed for Sale (${listed.length}/${MAX_LISTINGS})</b></div>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:11px;">
      <tr style="background:#cce0f0;"><th style="text-align:left;padding:2px 4px;">Item</th><th style="text-align:right;padding:2px 4px;">Asking</th><th style="padding:2px 4px;"></th></tr>`;
    for (const a of listed) {
      html += `<tr style="border-bottom:1px solid #ddd;">
        <td style="padding:2px 4px;">${escapeHtml(a.name)}${a.flags?.counterfeit ? ' <span style="color:#cc0000;font-size:9px;">[COUNTERFEIT]</span>' : ''}${a.flags?.jackpot ? ' <span style="color:#009900;font-size:9px;">[RARE]</span>' : ''}</td>
        <td style="text-align:right;padding:2px 4px;">$${Number(a.askPrice || a.valueUsd || 0).toFixed(2)}</td>
        <td style="padding:2px 4px;"><button class="wx-btn" style="font-size:10px;padding:1px 6px;" data-ps-delist="${escapeHtml(a.id)}">Remove</button></td>
      </tr>`;
    }
    html += `</table>`;
  } else {
    html += `<p style="color:#888;font-size:10px;margin:4px 0;">No items listed yet.</p>`;
  }

  if (unlisted.length && listed.length < MAX_LISTINGS) {
    html += `<div style="margin:10px 0 3px;"><b style="color:#336600;">Add to Listing</b></div>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:11px;">
      <tr style="background:#d8f0cc;"><th style="text-align:left;padding:2px 4px;">Item</th><th style="text-align:right;padding:2px 4px;">Est. Value</th><th style="padding:2px 4px;">Ask Price</th><th style="padding:2px 4px;"></th></tr>`;
    for (const a of unlisted.slice(0, 10)) {
      const estVal = Number(a.valueUsd || 0).toFixed(2);
      html += `<tr style="border-bottom:1px solid #ddd;">
        <td style="padding:2px 4px;">${escapeHtml(a.name)}${a.flags?.counterfeit ? ' <span style="color:#cc0000;font-size:9px;">[?]</span>' : ''}</td>
        <td style="text-align:right;padding:2px 4px;color:#666;">$${estVal}</td>
        <td style="padding:2px 4px;"><input type="number" step="0.01" min="0.01" value="${estVal}" style="width:70px;font-size:10px;" data-ps-price="${escapeHtml(a.id)}"></td>
        <td style="padding:2px 4px;"><button class="wx-btn" style="font-size:10px;padding:1px 6px;" data-ps-list="${escapeHtml(a.id)}">List</button></td>
      </tr>`;
    }
    html += `</table>`;
  }

  html += `</div>`;
  return html;
}

/**
 * Bind player store interactive events on a container element.
 * @param {HTMLElement} root
 */
export function bindPlayerStore(root) {
  root.addEventListener('click', (e) => {
    const listBtn = e.target.closest('[data-ps-list]');
    if (listBtn) {
      const id = listBtn.getAttribute('data-ps-list');
      const priceInput = root.querySelector(`[data-ps-price="${CSS.escape(id)}"]`);
      const price = priceInput ? parseFloat(priceInput.value) : 0;
      const result = listAssetForSale(id, price);
      if (!result.ok) {
        toast(result.error || 'Could not list item.');
      } else {
        const replaced = root.querySelector('[data-ps-root]') || root;
        replaced.innerHTML = renderPlayerStoreHtml();
        bindPlayerStore(replaced);
      }
      return;
    }
    const delistBtn = e.target.closest('[data-ps-delist]');
    if (delistBtn) {
      const id = delistBtn.getAttribute('data-ps-delist');
      delistAsset(id);
      const replaced = root.querySelector('[data-ps-root]') || root;
      replaced.innerHTML = renderPlayerStoreHtml();
      bindPlayerStore(replaced);
      return;
    }
  });
}
