/**
 * warehouse-tick.js — WhereAllThingsGo.net warehouse lease, repossession, liquidation,
 * and daily NPC buyer simulation.
 */
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { rollD4 } from './d20.js';
import { escapeHtml } from './identity.js';
import { getPageAdOutcomeWeights, getAllAdAnalytics } from './ad-analytics.js';

const SIM_DAY_MS = SIM_HOUR_MS * 24;

const UNIT_TIERS = [
  { id: 'small',  label: '5×5 Locker',     rentPerDay: 8,   maxItems: 10 },
  { id: 'medium', label: '10×10 Standard',  rentPerDay: 18,  maxItems: 30 },
  { id: 'large',  label: '10×20 Large',     rentPerDay: 35,  maxItems: 60 },
  { id: 'xlarge', label: '10×30 Warehouse', rentPerDay: 60,  maxItems: 120 },
];

export { UNIT_TIERS };

/** Purchasable property tiers (no recurring cost after purchase; increase net worth). */
export const PROPERTY_TIERS = [
  { id: 'storage_unit', label: 'Storage Unit (5×10)',  purchasePrice: 4500,  maxItems: 20,  maintenancePerDay: 2,  kind: 'storage_unit' },
  { id: 'warehouse',    label: 'Small Warehouse',       purchasePrice: 22000, maxItems: 150, maintenancePerDay: 10, kind: 'warehouse' },
  { id: 'commercial',   label: 'Commercial Building',   purchasePrice: 95000, maxItems: 500, maintenancePerDay: 40, kind: 'commercial' }
];

function ensureWarehouse(st) {
  if (!st.warehouse) st.warehouse = { units: [], liquidation: [] };
  if (!Array.isArray(st.warehouse.units)) st.warehouse.units = [];
  if (!Array.isArray(st.warehouse.liquidation)) st.warehouse.liquidation = [];
  if (!Array.isArray(st.warehouse.properties)) st.warehouse.properties = [];
}

/**
 * Purchase a property outright. Debits cash, creates asset in player.assets and
 * a permanent property record in warehouse.properties.
 * @param {string} tierId
 * @returns {{ ok: boolean, error?: string, propertyId?: string }}
 */
export function purchaseProperty(tierId) {
  const tier = PROPERTY_TIERS.find((t) => t.id === tierId);
  if (!tier) return { ok: false, error: 'Unknown property type.' };
  const st = getState();
  const cash = (st.player?.hardCash || 0) + (st.accounts?.reduce((s, a) => s + (a.balance || 0), 0) || 0);
  if ((st.player?.hardCash || 0) < tier.purchasePrice) {
    return { ok: false, error: `Insufficient cash. Need $${tier.purchasePrice.toLocaleString()} on hand.` };
  }
  const propertyId = `prop-${Date.now().toString(36)}`;
  patchState((s) => {
    ensureWarehouse(s);
    s.player.hardCash = (s.player.hardCash || 0) - tier.purchasePrice;
    const property = {
      id: propertyId,
      tierId: tier.id,
      label: tier.label,
      purchasePrice: tier.purchasePrice,
      maintenancePerDay: tier.maintenancePerDay,
      maxItems: tier.maxItems,
      items: [],
      acquiredSimMs: s.sim?.elapsedMs ?? 0,
      kind: tier.kind
    };
    s.warehouse.properties.push(property);
    if (!Array.isArray(s.player.assets)) s.player.assets = [];
    s.player.assets.push({
      id: `asset-prop-${propertyId}`,
      name: tier.label,
      sourceSiteId: 'warehouse',
      kind: 'physical',
      valueUsd: tier.purchasePrice,
      quality: 100,
      flags: { property: true, propertyId },
      acquiredSimMs: s.sim?.elapsedMs ?? 0,
      stored: false,
      listed: false
    });
    return s;
  });
  return { ok: true, propertyId };
}

/**
 * Store item into an owned property. Falls back to warehouse units if none provided.
 * @param {string} propertyId
 * @param {object} item
 */
export function storeItemInProperty(propertyId, item) {
  const st = getState();
  const prop = (st.warehouse?.properties || []).find((p) => p.id === propertyId);
  if (!prop) return { ok: false, error: 'Property not found.' };
  if ((prop.items?.length || 0) >= prop.maxItems) return { ok: false, error: 'Property storage is full.' };
  patchState((s) => {
    ensureWarehouse(s);
    const p = s.warehouse.properties.find((x) => x.id === propertyId);
    if (p) p.items.push({ ...item, storedSimMs: s.sim?.elapsedMs ?? 0 });
    return s;
  });
  return { ok: true };
}

/**
 * Rent a new storage unit. Debits hard cash.
 */
export function rentUnit(tierId) {
  const tier = UNIT_TIERS.find(t => t.id === tierId);
  if (!tier) return { ok: false, error: 'Unknown unit size.' };
  const st = getState();
  const cash = st.player.hardCash || 0;
  const deposit = tier.rentPerDay * 7; // one week upfront
  if (cash < deposit) return { ok: false, error: `Insufficient funds. Need $${deposit} deposit (1 week).` };
  const unitId = `wu-${Date.now().toString(36)}`;
  const simMs = st.sim?.elapsedMs || 0;
  patchState(s => {
    ensureWarehouse(s);
    s.player.hardCash = (s.player.hardCash || 0) - deposit;
    s.warehouse.units.push({
      id: unitId,
      sizeTier: tier.id,
      label: tier.label,
      rentPerDay: tier.rentPerDay,
      maxItems: tier.maxItems,
      paidThroughSimMs: simMs + 7 * SIM_DAY_MS,
      items: [],
    });
    return s;
  });
  return { ok: true, unitId };
}

/**
 * Pay rent extension for an existing unit.
 */
export function payRent(unitId, days) {
  const st = getState();
  const unit = st.warehouse?.units?.find(u => u.id === unitId);
  if (!unit) return { ok: false, error: 'Unit not found.' };
  const cost = unit.rentPerDay * days;
  if ((st.player.hardCash || 0) < cost) return { ok: false, error: 'Insufficient funds.' };
  patchState(s => {
    ensureWarehouse(s);
    const u = s.warehouse.units.find(u2 => u2.id === unitId);
    if (!u) return s;
    s.player.hardCash -= cost;
    u.paidThroughSimMs = Math.max(u.paidThroughSimMs, s.sim.elapsedMs) + days * SIM_DAY_MS;
    return s;
  });
  return { ok: true };
}

/**
 * Store an item in a unit.
 */
export function storeItem(unitId, item) {
  const st = getState();
  const unit = st.warehouse?.units?.find(u => u.id === unitId);
  if (!unit) return { ok: false, error: 'Unit not found.' };
  if ((unit.items?.length || 0) >= unit.maxItems) return { ok: false, error: 'Unit is full.' };
  patchState(s => {
    ensureWarehouse(s);
    const u = s.warehouse.units.find(u2 => u2.id === unitId);
    if (!u) return s;
    u.items.push({ ...item, storedSimMs: s.sim.elapsedMs });
    return s;
  });
  return { ok: true };
}

/**
 * Retrieve an item from a unit.
 */
export function retrieveItem(unitId, itemIndex) {
  patchState(s => {
    ensureWarehouse(s);
    const u = s.warehouse.units.find(u2 => u2.id === unitId);
    if (!u || !u.items[itemIndex]) return s;
    u.items.splice(itemIndex, 1);
    return s;
  });
}

/**
 * Daily tick: repossess overdue units, collect property maintenance, and simulate NPC liquidation buyers.
 */
export function tickWarehouseDaily() {
  const st = getState();
  ensureWarehouse(st);
  const simMs = st.sim?.elapsedMs || 0;

  // Collect property maintenance costs
  patchState(s => {
    ensureWarehouse(s);
    for (const prop of s.warehouse.properties || []) {
      const cost = Number(prop.maintenancePerDay) || 0;
      if (cost > 0) {
        s.player.hardCash = Math.max(0, (s.player.hardCash || 0) - cost);
      }
    }
    return s;
  });

  // Repossess overdue units
  patchState(s => {
    ensureWarehouse(s);
    const overdue = s.warehouse.units.filter(u => simMs > u.paidThroughSimMs);
    for (const u of overdue) {
      for (const item of u.items) {
        const markdown = Math.max(1, Math.round((item.listPrice || item.price || 10) * 0.4));
        s.warehouse.liquidation.push({
          ...item,
          listPrice: markdown,
          originalPrice: item.listPrice || item.price || 10,
          liquidatedSimMs: simMs,
          fromUnit: u.id,
        });
      }
    }
    s.warehouse.units = s.warehouse.units.filter(u => simMs <= u.paidThroughSimMs);
    return s;
  });

  // NPC buyers for liquidation items
  const liq = getState().warehouse?.liquidation || [];
  if (!liq.length) return;

  // Derive ad tone weights from warehouse page ads
  const allAnalytics = getAllAdAnalytics();
  const warehouseAdIds = Object.keys(allAnalytics).filter((id) =>
    id.toLowerCase().includes('warehouse') || id.toLowerCase().includes('storage')
  );
  const adWeights = getPageAdOutcomeWeights(warehouseAdIds);

  // Base buyer count modified by ad engagement (more engaging ads attract more visitors)
  const baseBuyerCount = rollD4();
  const engagedBuyerBoost = adWeights.engagement > 1.1 ? 1 : 0;
  const buyerCount = baseBuyerCount + engagedBuyerBoost;

  // Bounce modifier: highly irritating ads mean some buyers leave without purchasing
  const bounceProb = Math.min(0.6, (adWeights.bounce - 1) * 0.4);

  let totalSold = 0;
  let totalRevenue = 0;

  patchState(s => {
    ensureWarehouse(s);
    for (let b = 0; b < buyerCount && s.warehouse.liquidation.length > 0; b++) {
      // Simulate NPC "bounce" driven by ad irritation
      if (Math.random() < bounceProb) continue;

      // Conversion boost: good ads push NPC to buy more items
      const convBoost = adWeights.conversion > 1.05 ? 1 : 0;
      const itemsToBuy = 1 + convBoost + (Math.random() < 0.5 ? 1 : 0); // 1–3 items
      for (let i = 0; i < itemsToBuy && s.warehouse.liquidation.length > 0; i++) {
        const idx = Math.floor(Math.random() * s.warehouse.liquidation.length);
        const item = s.warehouse.liquidation[idx];
        const price = item.listPrice || 1;
        s.player.hardCash = (s.player.hardCash || 0) + price;
        totalRevenue += price;
        totalSold++;
        s.warehouse.liquidation.splice(idx, 1);
      }
    }
    return s;
  });

  return { buyerCount, totalSold, totalRevenue };
}

/**
 * Render the warehouse page UI into the #warehouse-root element.
 */
export function mountWarehousePage(root) {
  const container = root.querySelector('#warehouse-root');
  if (!container) return;

  function renderWarehouseUI() {
    const st = getState();
    ensureWarehouse(st);
    const units = st.warehouse.units || [];
    const properties = st.warehouse.properties || [];
    const liq = st.warehouse.liquidation || [];
    const simMs = st.sim?.elapsedMs || 0;
    const cash = st.player?.hardCash || 0;

    let html = '';

    // ── Owned Properties ──────────────────────────────────────────────────────
    if (properties.length > 0) {
      html += `<div style="margin:8px 0 4px;"><b style="color:#003366;">Your Owned Properties</b></div>`;
      for (const prop of properties) {
        html += `<div style="border:2px solid #6699cc;padding:6px;margin-bottom:6px;background:#edf4fb;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <b>${escapeHtml(prop.label)}</b>
            <span style="font-size:10px;color:#336699;">Owned &bull; $${(prop.maintenancePerDay || 0)}/day maintenance</span>
          </div>
          <div style="font-size:10px;color:#555;margin-top:2px;">${(prop.items || []).length}/${prop.maxItems} items stored &bull; Purchase value: $${(prop.purchasePrice || 0).toLocaleString()}</div>
        </div>`;
      }
    }

    // ── Rented Units ──────────────────────────────────────────────────────────
    html += `<div style="margin:8px 0 4px;">
      <b style="color:#663300;">Rented Storage Units</b>
      ${units.length === 0 ? '<span style="color:#666;font-size:11px;margin-left:6px;">None active.</span>' : ''}
    </div>`;
    for (const u of units) {
      const daysLeft = Math.max(0, Math.ceil((u.paidThroughSimMs - simMs) / SIM_DAY_MS));
      const overdue = simMs > u.paidThroughSimMs;
      html += `<div style="border:2px inset #c0c0c0;padding:6px;margin-bottom:6px;background:${overdue ? '#ffe0e0' : '#f8f4ec'};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <b>${escapeHtml(u.label)}</b>
          <span style="font-size:10px;color:${overdue ? '#c00' : '#666'};">${overdue ? 'OVERDUE — repossession pending' : `${daysLeft} days remaining`}</span>
        </div>
        <div style="font-size:10px;color:#666;margin-top:2px;">$${u.rentPerDay}/day &bull; ${(u.items || []).length}/${u.maxItems} items</div>
        <div style="margin-top:4px;">
          <button class="wx-btn" data-wh-pay="${escapeHtml(u.id)}">Pay 7 Days ($${u.rentPerDay * 7})</button>
        </div>
      </div>`;
    }

    // ── Rent a Unit ───────────────────────────────────────────────────────────
    html += `<div style="margin:12px 0 6px;"><b style="color:#663300;">Rent a Unit</b></div>`;
    for (const tier of UNIT_TIERS) {
      html += `<div style="display:inline-block;border:2px outset #d0d0d0;padding:4px 8px;margin:2px;background:#e8e4dc;cursor:pointer;font-size:11px;" data-wh-rent="${escapeHtml(tier.id)}">
        ${escapeHtml(tier.label)} — $${tier.rentPerDay}/day<br>
        <span style="font-size:9px;color:#666;">Max ${tier.maxItems} items &bull; $${tier.rentPerDay * 7} deposit</span>
      </div>`;
    }

    // ── Purchase Property ─────────────────────────────────────────────────────
    html += `<div style="margin:14px 0 6px;"><b style="color:#003366;">Purchase Property</b>
      <span style="font-size:10px;color:#666;margin-left:6px;">One-time cost — no lease, no repossession</span></div>`;
    for (const tier of PROPERTY_TIERS) {
      const canAfford = cash >= tier.purchasePrice;
      html += `<div style="display:inline-block;border:2px outset #aabbd0;padding:5px 10px;margin:3px;background:${canAfford ? '#ddeeff' : '#e8e8e8'};cursor:${canAfford ? 'pointer' : 'default'};font-size:11px;${canAfford ? '' : 'opacity:0.6;'}" ${canAfford ? `data-wh-buy="${escapeHtml(tier.id)}"` : ''}>
        <b>${escapeHtml(tier.label)}</b><br>
        $${tier.purchasePrice.toLocaleString()} purchase &bull; $${tier.maintenancePerDay}/day maintenance<br>
        <span style="font-size:9px;color:#666;">Max ${tier.maxItems} items &bull; Contributes to net worth</span>
        ${canAfford ? '' : `<br><span style="font-size:9px;color:#cc6600;">Insufficient cash (have $${cash.toFixed(2)})</span>`}
      </div>`;
    }

    // ── Liquidation Outlet ────────────────────────────────────────────────────
    if (liq.length) {
      html += `<div style="margin:14px 0 6px;"><b style="color:#993300;">Liquidation Outlet</b>
        <span style="font-size:10px;color:#666;margin-left:6px;">${liq.length} items at clearance prices</span></div>`;
      html += `<table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tr style="background:#d4d0c8;"><th style="text-align:left;padding:2px 4px;">Item</th><th style="text-align:right;padding:2px 4px;">Was</th><th style="text-align:right;padding:2px 4px;">Now</th></tr>`;
      for (const item of liq.slice(0, 20)) {
        html += `<tr style="border-bottom:1px solid #ddd;">
          <td style="padding:2px 4px;">${escapeHtml(item.name || item.productRef || 'Item')}</td>
          <td style="text-align:right;padding:2px 4px;color:#999;text-decoration:line-through;">$${(item.originalPrice || 0).toFixed(2)}</td>
          <td style="text-align:right;padding:2px 4px;color:#993300;font-weight:bold;">$${(item.listPrice || 0).toFixed(2)}</td>
        </tr>`;
      }
      html += `</table>`;
      if (liq.length > 20) html += `<p style="font-size:10px;color:#888;">...and ${liq.length - 20} more items</p>`;
    }

    html += `<div style="margin-top:14px;background:#f0e8d8;border:1px solid #c0a880;padding:6px;font-size:10px;color:#555;">
      <b>Policy Notice:</b> Rented units not paid within their term will be repossessed. Purchased properties are yours permanently but require daily maintenance deducted from cash.
      NPC buyers visit the Liquidation Outlet daily — proceeds go directly to your cash balance.
    </div>`;

    container.innerHTML = html;
  }

  renderWarehouseUI();

  container.addEventListener('click', (e) => {
    const rentBtn = e.target.closest('[data-wh-rent]');
    if (rentBtn) {
      const result = rentUnit(rentBtn.getAttribute('data-wh-rent'));
      if (!result.ok) alert(result.error);
      renderWarehouseUI();
      return;
    }
    const payBtn = e.target.closest('[data-wh-pay]');
    if (payBtn) {
      const result = payRent(payBtn.getAttribute('data-wh-pay'), 7);
      if (!result.ok) alert(result.error);
      renderWarehouseUI();
      return;
    }
    const buyBtn = e.target.closest('[data-wh-buy]');
    if (buyBtn) {
      const result = purchaseProperty(buyBtn.getAttribute('data-wh-buy'));
      if (!result.ok) alert(result.error);
      renderWarehouseUI();
      return;
    }
  });
}
