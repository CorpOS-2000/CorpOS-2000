/**
 * warehouse-tick.js — Full inventory and warehouse management system.
 * Three warehouse providers, item categories, insurance,
 * transfers, manifests, and integration with shopping overflow.
 */
import { getState, patchState, SIM_HOUR_MS, appendBankingTransaction } from './gameState.js';
import { rollD4, rollD20 } from './d20.js';
import { escapeHtml } from './identity.js';
import { getPageAdOutcomeWeights, getAllAdAnalytics } from './ad-analytics.js';
import { toast, TOAST_KEYS, ToastManager } from './toast.js';
import { SMS } from './bc-sms.js';
import { recordHashtagEvent } from './market-dynamics.js';

export const SIM_DAY_MS = SIM_HOUR_MS * 24;

function getPrimaryAccount(st) {
  return (st.accounts || []).find((a) => a.id === 'fncb') || (st.accounts || [])[0] || null;
}

// Legacy export — WATG tier list (used by older imports).
export const UNIT_TIERS = [
  { id: 'small', label: '5×5 Locker', rentPerDay: 6, maxItems: 10 },
  { id: 'medium', label: '10×10 Standard', rentPerDay: 14, maxItems: 30 },
  { id: 'large', label: '10×20 Large Bay', rentPerDay: 28, maxItems: 75 },
  { id: 'xlarge', label: '10×30 Full Unit', rentPerDay: 50, maxItems: 150 }
];

// ── WAREHOUSE PROVIDERS ───────────────────────────────────────────────────────

export const WAREHOUSE_PROVIDERS = {
  whereallthingsgo: {
    id: 'whereallthingsgo',
    name: 'WhereAllThingsGo.net',
    shortName: 'WATG',
    pageKey: 'warehouse',
    url: 'http://www.whereallthingsgo.net/',
    address: '1400 Warehouse Row, Southside Industrial — Hargrove, CA 94526',
    districtId: 6,
    color: '#663300',
    bgColor: '#f8f4ec',
    description:
      "Hargrove's original self-storage and liquidation outlet. No frills. No climate control. No questions asked.",
    insurance: false,
    climateCtrl: false,
    security: 'standard',
    paymentType: 'hardCash',
    units: [
      { id: 'watg-small', label: '5×5 Locker', rentPerDay: 6, maxItems: 10, maxValueUsd: 5000 },
      { id: 'watg-medium', label: '10×10 Standard', rentPerDay: 14, maxItems: 30, maxValueUsd: 20000 },
      { id: 'watg-large', label: '10×20 Large Bay', rentPerDay: 28, maxItems: 75, maxValueUsd: 75000 },
      { id: 'watg-xlarge', label: '10×30 Full Unit', rentPerDay: 50, maxItems: 150, maxValueUsd: 200000 }
    ],
    liquidation: true,
    repossessionDays: 7
  },
  hargroVault: {
    id: 'hargroVault',
    name: 'HargroveVault',
    shortName: 'VAULT',
    pageKey: 'hargrove_vault',
    url: 'http://www.hargrove-vault.com/',
    address: '200 Executive Drive, Financial District — Hargrove, CA 94521',
    districtId: 10,
    color: '#1a1a2e',
    bgColor: '#f0f4ff',
    description: 'Climate-controlled, insured, 24-hour monitored secure storage. For assets that matter.',
    insurance: true,
    insurancePremiumPct: 0.15,
    climateCtrl: true,
    security: 'premium',
    paymentType: 'bank',
    units: [
      { id: 'hv-small', label: 'Secure Locker (5×5)', rentPerDay: 18, maxItems: 10, maxValueUsd: 50000 },
      { id: 'hv-medium', label: 'Standard Suite (10×10)', rentPerDay: 45, maxItems: 40, maxValueUsd: 250000 },
      { id: 'hv-large', label: 'Executive Bay (10×20)', rentPerDay: 90, maxItems: 100, maxValueUsd: 1000000 },
      { id: 'hv-vault', label: 'Private Vault (custom)', rentPerDay: 200, maxItems: 500, maxValueUsd: null }
    ],
    liquidation: false,
    repossessionDays: 30,
    auctionHouse: true
  },
  storIt: {
    id: 'storIt',
    name: 'StorIt Hargrove',
    shortName: 'STORIT',
    pageKey: 'stor_it',
    url: 'http://www.stor-it-hargrove.com/',
    address: 'Multiple locations across Hargrove',
    districtId: null,
    color: '#e85d04',
    bgColor: '#fff8f0',
    description:
      "Hargrove's fastest-growing storage chain. Locations in 4 districts. Business inventory welcome.",
    insurance: true,
    insurancePremiumPct: 0.08,
    climateCtrl: false,
    security: 'standard',
    paymentType: 'bank',
    units: [
      { id: 'si-small', label: '5×5 Unit', rentPerDay: 10, maxItems: 15, maxValueUsd: 10000 },
      { id: 'si-medium', label: '10×10 Unit', rentPerDay: 22, maxItems: 50, maxValueUsd: 50000 },
      { id: 'si-large', label: '10×20 Business Bay', rentPerDay: 42, maxItems: 120, maxValueUsd: 200000 },
      { id: 'si-xlarge', label: '10×30 Warehouse', rentPerDay: 75, maxItems: 250, maxValueUsd: 500000 },
      { id: 'si-climate', label: 'Climate Suite', rentPerDay: 55, maxItems: 80, maxValueUsd: 500000 }
    ],
    liquidation: true,
    repossessionDays: 14,
    businessFriendly: true,
    locations: [
      { district: 1, address: '88 Main St, Downtown Core' },
      { district: 4, address: '412 East Blvd, Eastside' },
      { district: 7, address: '99 Harbor Rd, Harbor District' },
      { district: 12, address: '5 Outskirts Way, Outskirts' }
    ]
  }
};

export const ITEM_CATEGORIES = {
  consumer: { label: 'Consumer Goods', icon: '📦', perishable: false, conditionDecayPerDay: 0 },
  hardware: { label: 'Hardware', icon: '🖥', perishable: false, conditionDecayPerDay: 0.5 },
  equipment: { label: 'Equipment', icon: '⚙', perishable: false, conditionDecayPerDay: 0.2 },
  deed: { label: 'Property Deed', icon: '📋', perishable: false, conditionDecayPerDay: 0 },
  stock: { label: 'Stock Certificate', icon: '📈', perishable: false, conditionDecayPerDay: 0 },
  data: { label: 'Data Package', icon: '💾', perishable: false, conditionDecayPerDay: 0 },
  vehicle: { label: 'Vehicle', icon: '🚗', perishable: false, conditionDecayPerDay: 1 },
  raw_material: { label: 'Raw Materials', icon: '🧱', perishable: true, conditionDecayPerDay: 2 },
  food: { label: 'Food / Perishable', icon: '🥫', perishable: true, conditionDecayPerDay: 8 },
  document: { label: 'Documents', icon: '📄', perishable: false, conditionDecayPerDay: 0 }
};

export const PROPERTY_TIERS = [
  {
    id: 'storage_unit',
    label: 'Storage Unit (5×10)',
    purchasePrice: 4500,
    maxItems: 20,
    maintenancePerDay: 2,
    kind: 'storage_unit'
  },
  {
    id: 'warehouse',
    label: 'Small Warehouse',
    purchasePrice: 22000,
    maxItems: 150,
    maintenancePerDay: 10,
    kind: 'warehouse'
  },
  {
    id: 'commercial',
    label: 'Commercial Building',
    purchasePrice: 95000,
    maxItems: 500,
    maintenancePerDay: 40,
    kind: 'commercial'
  }
];

function ensureInventory(st) {
  if (!st.warehouse) st.warehouse = { units: [], liquidation: [], insurance: {}, transfers: [] };
  if (!Array.isArray(st.warehouse.units)) st.warehouse.units = [];
  if (!Array.isArray(st.warehouse.liquidation)) st.warehouse.liquidation = [];
  if (!st.warehouse.insurance || typeof st.warehouse.insurance !== 'object') st.warehouse.insurance = {};
  if (!Array.isArray(st.warehouse.transfers)) st.warehouse.transfers = [];
  if (!Array.isArray(st.warehouse.properties)) st.warehouse.properties = [];
  if (!st.playerInventory) st.playerInventory = { items: [], manifest: [], totalValue: 0 };
  if (!Array.isArray(st.playerInventory.items)) st.playerInventory.items = [];
  if (!Array.isArray(st.playerInventory.manifest)) st.playerInventory.manifest = [];
}

// ── RENT A UNIT ───────────────────────────────────────────────────────────────

export function rentUnit(providerId, tierUnitId, withInsurance = false) {
  const provider = WAREHOUSE_PROVIDERS[providerId];
  if (!provider) return { ok: false, error: 'Unknown warehouse provider.' };
  const tierDef = provider.units.find((u) => u.id === tierUnitId);
  if (!tierDef) return { ok: false, error: 'Unknown unit size.' };

  const st = getState();
  const simMs = st.sim?.elapsedMs || 0;
  const deposit = tierDef.rentPerDay * 14;
  const insuranceSurcharge =
    withInsurance && provider.insurance ? Math.round(deposit * provider.insurancePremiumPct) : 0;
  const totalCost = deposit + insuranceSurcharge;

  if (provider.paymentType === 'hardCash') {
    const cash = st.player?.hardCash || 0;
    if (cash < totalCost) {
      return { ok: false, error: `Need $${totalCost} cash. You have $${cash.toFixed(2)}.` };
    }
  } else {
    const acc = getPrimaryAccount(st);
    if (!acc || (acc.balance || 0) < totalCost) {
      return { ok: false, error: `Need $${totalCost} in your bank account (FNCB primary).` };
    }
  }

  const unitId = `${provider.shortName}-${Date.now().toString(36)}`;

  patchState((s) => {
    ensureInventory(s);
    const player = s.player || (s.player = {});
    if (provider.paymentType === 'hardCash') {
      s.player.hardCash = (s.player.hardCash || 0) - totalCost;
    } else {
      const primary = getPrimaryAccount(s);
      if (primary) {
        primary.balance = (primary.balance || 0) - totalCost;
        appendBankingTransaction(s, {
          bankName: primary.name,
          accountNumber: primary.accountNumber || primary.id,
          type: 'debit',
          amount: totalCost,
          description: `Warehouse rental — ${provider.name} ${tierDef.label} (14-day deposit${
            withInsurance ? ' + insurance' : ''
          })`
        });
      }
    }
    s.warehouse.units.push({
      id: unitId,
      providerId,
      providerName: provider.name,
      tierUnitId,
      label: tierDef.label,
      rentPerDay: tierDef.rentPerDay,
      maxItems: tierDef.maxItems,
      maxValueUsd: tierDef.maxValueUsd,
      paidThroughSimMs: simMs + 14 * SIM_DAY_MS,
      items: [],
      insured: !!(withInsurance && provider.insurance),
      insurancePct: withInsurance ? (provider.insurancePremiumPct || 0) : 0,
      climateControlled: provider.climateCtrl,
      rentedSimMs: simMs,
      lastInspectedSimMs: simMs
    });
    s.playerInventory.manifest.push({
      type: 'unit_rented',
      unitId,
      provider: provider.name,
      tier: tierDef.label,
      cost: totalCost,
      simMs
    });
    return s;
  });

  try {
    window.ActivityLog?.log?.(
      'WAREHOUSE_RENT',
      `Rented ${tierDef.label} at ${provider.name} — $${totalCost} (${
        withInsurance ? 'insured' : 'uninsured'
      })`,
      { notable: true }
    );
  } catch {
    /* ignore */
  }
  return { ok: true, unitId, cost: totalCost };
}

// ── PAY RENT ──────────────────────────────────────────────────────────────────

export function payRent(unitId, days) {
  const st = getState();
  const unit = (st.warehouse?.units || []).find((u) => u.id === unitId);
  if (!unit) return { ok: false, error: 'Unit not found.' };
  const provider = WAREHOUSE_PROVIDERS[unit.providerId] || { paymentType: 'hardCash' };
  const cost = unit.rentPerDay * days;
  const simMs = st.sim?.elapsedMs || 0;

  if (provider.paymentType === 'hardCash') {
    if ((st.player?.hardCash || 0) < cost) return { ok: false, error: `Need $${cost} cash.` };
  } else {
    const acc = getPrimaryAccount(st);
    if (!acc || (acc.balance || 0) < cost) return { ok: false, error: `Need $${cost} in your account.` };
  }

  patchState((s) => {
    ensureInventory(s);
    if (provider.paymentType === 'hardCash') {
      s.player.hardCash = (s.player.hardCash || 0) - cost;
    } else {
      const primary = getPrimaryAccount(s);
      if (primary) {
        primary.balance = (primary.balance || 0) - cost;
        appendBankingTransaction(s, {
          bankName: primary.name,
          accountNumber: primary.accountNumber || primary.id,
          type: 'debit',
          amount: cost,
          description: `Storage rent — ${unit.label} (${days}d)`
        });
      }
    }
    const u = s.warehouse.units.find((u2) => u2.id === unitId);
    if (u) u.paidThroughSimMs = Math.max(u.paidThroughSimMs, simMs) + days * SIM_DAY_MS;
    s.playerInventory.manifest.push({
      type: 'rent_paid',
      unitId,
      days,
      cost,
      simMs
    });
    return s;
  });
  return { ok: true, cost };
}

// ── STORE / RETRIEVE / TRANSFER ──────────────────────────────────────────────

export function storeItem(unitId, item) {
  const st = getState();
  const unit = (st.warehouse?.units || []).find((u) => u.id === unitId);
  if (!unit) return { ok: false, error: 'Unit not found.' };
  if ((unit.items?.length || 0) >= unit.maxItems) {
    return { ok: false, error: `Unit is full (${unit.maxItems} item limit).` };
  }
  if (unit.maxValueUsd != null) {
    const currentValue = (unit.items || []).reduce(
      (s, i) => s + (i.unitValue || 0) * (i.quantity || 1),
      0
    );
    const newValue = (item.unitValue || 0) * (item.quantity || 1);
    if (currentValue + newValue > unit.maxValueUsd) {
      return { ok: false, error: `Exceeds unit value limit ($${unit.maxValueUsd.toLocaleString()}).` };
    }
  }

  const itemId = item.id || `inv-${Date.now().toString(36)}`;
  const simMs = st.sim?.elapsedMs || 0;
  const cat = item.category || inferCategory(item);

  patchState((s) => {
    ensureInventory(s);
    const u = s.warehouse.units.find((u2) => u2.id === unitId);
    if (!u) return s;
    const fullItem = {
      ...item,
      id: itemId,
      category: cat,
      storedInUnit: unitId,
      storedSimMs: simMs,
      condition: item.condition != null ? item.condition : 100,
      perishable: item.perishable != null ? item.perishable : !!ITEM_CATEGORIES[cat]?.perishable
    };
    u.items.push(fullItem);
    s.playerInventory.items = (s.playerInventory.items || []).filter((i) => i.id !== itemId);
    s.playerInventory.totalValue = computeTotalInventoryValue(s);
    s.playerInventory.manifest.push({ type: 'stored', itemId, itemName: item.name, unitId, simMs });
    return s;
  });
  return { ok: true, itemId };
}

export function retrieveItem(unitId, itemId) {
  const simMs = getState().sim?.elapsedMs || 0;
  let ok = false;
  let itemName = '';
  patchState((s) => {
    ensureInventory(s);
    const u = s.warehouse.units.find((u2) => u2.id === unitId);
    if (!u) return s;
    const idx = (u.items || []).findIndex((i) => i.id === itemId);
    if (idx < 0) return s;
    const [item] = u.items.splice(idx, 1);
    itemName = item.name;
    item.storedInUnit = null;
    s.playerInventory.items.push(item);
    s.playerInventory.totalValue = computeTotalInventoryValue(s);
    s.playerInventory.manifest.push({ type: 'retrieved', itemId, itemName: item.name, unitId, simMs });
    ok = true;
    return s;
  });
  return { ok, error: ok ? undefined : 'Item not found in unit.' };
}

export function transferItem(fromUnitId, toUnitId, itemId) {
  const r = retrieveItem(fromUnitId, itemId);
  if (!r.ok) return r;
  const st = getState();
  const item = (st.playerInventory?.items || []).find((i) => i.id === itemId);
  if (!item) return { ok: false, error: 'Item not found after retrieval.' };
  return storeItem(toUnitId, { ...item });
}

export function addToPlayerInventory(item) {
  const simMs = getState().sim?.elapsedMs || 0;
  const itemId = item.id || `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

  patchState((s) => {
    ensureInventory(s);
    const category = item.category || inferCategoryFromProduct({ category: item.productCategory, title: item.name, tags: item.tags });
    s.playerInventory.items.push({
      ...item,
      id: itemId,
      category,
      quantity: item.quantity != null ? item.quantity : 1,
      unitValue: item.unitValue != null ? item.unitValue : 0,
      acquiredAt: simMs,
      storedInUnit: null,
      condition: 100,
      perishable: item.perishable != null ? item.perishable : !!ITEM_CATEGORIES[category]?.perishable
    });
    s.playerInventory.totalValue = computeTotalInventoryValue(s);
    s.playerInventory.manifest.push({
      type: 'acquired',
      itemId,
      itemName: item.name,
      source: item.source || 'purchase',
      simMs
    });
    return s;
  });
  return itemId;
}

export function inferCategoryFromProduct(p) {
  if (!p) return 'consumer';
  const cid = String(p.categoryId || '').toLowerCase();
  if (cid.includes('food') || cid.includes('grocery')) return 'food';
  if (cid.includes('hardware') || cid.includes('electron')) return 'hardware';
  if (cid.includes('software') || cid.includes('game')) return 'data';
  if (cid.includes('vehicle') || cid.includes('auto')) return 'vehicle';
  const t = String(p.title || p.name || '').toLowerCase();
  const c = String(p.category || '').toLowerCase();
  if (c.includes('food') || t.includes('snack') || t.includes('coffee')) return 'food';
  if (c.includes('vehicle') || t.includes('auto')) return 'vehicle';
  if (c.includes('deed') || t.includes('deed')) return 'deed';
  if (c.includes('stock') || t.includes('certificate')) return 'stock';
  if (c.includes('software') || c.includes('data') || t.includes('data')) return 'data';
  if (c.includes('hard') || c.includes('computer') || t.includes('laptop') || t.includes('pc')) return 'hardware';
  if (c.includes('equip') || t.includes('tool')) return 'equipment';
  if (c.includes('raw') || t.includes('material')) return 'raw_material';
  return 'consumer';
}

function inferCategory(item) {
  const cat = (item.category || item.productCategory || '').toString().toLowerCase();
  if (cat) {
    for (const k of Object.keys(ITEM_CATEGORIES)) {
      if (cat.includes(k)) return k;
    }
  }
  if (item.productRef) {
    const st = getState();
    const rp = (st.rivalProducts || []).find((p) => p.id === item.productRef);
    if (rp) return inferCategoryFromProduct(rp);
  }
  if (cat.includes('hardware') || cat.includes('computer')) return 'hardware';
  if (cat.includes('food') || cat.includes('grocery')) return 'food';
  if (cat.includes('vehicle') || cat.includes('auto')) return 'vehicle';
  if (cat.includes('deed') || cat.includes('document')) return 'deed';
  if (cat.includes('data')) return 'data';
  if (cat.includes('equip') || cat.includes('tool')) return 'equipment';
  if (cat.includes('raw') || cat.includes('material')) return 'raw_material';
  return 'consumer';
}

function computeTotalInventoryValue(st) {
  const carried = (st.playerInventory?.items || []).reduce(
    (s, i) => s + (i.unitValue || 0) * (i.quantity || 1),
    0
  );
  const stored = (st.warehouse?.units || [])
    .flatMap((u) => u.items || [])
    .reduce((s, i) => s + (i.unitValue || 0) * (i.quantity || 1), 0);
  return Math.round(carried + stored);
}

// ── PURCHASED PROPERTY (unchanged behavior, uses ensureInventory) ────────────

export function purchaseProperty(tierId) {
  const tier = PROPERTY_TIERS.find((t) => t.id === tierId);
  if (!tier) return { ok: false, error: 'Unknown property type.' };
  const st = getState();
  if ((st.player?.hardCash || 0) < tier.purchasePrice) {
    return { ok: false, error: `Insufficient cash. Need $${tier.purchasePrice.toLocaleString()} on hand.` };
  }
  const propertyId = `prop-${Date.now().toString(36)}`;
  patchState((s) => {
    ensureInventory(s);
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

export function storeItemInProperty(propertyId, item) {
  const st = getState();
  const prop = (st.warehouse?.properties || []).find((p) => p.id === propertyId);
  if (!prop) return { ok: false, error: 'Property not found.' };
  if ((prop.items?.length || 0) >= prop.maxItems) return { ok: false, error: 'Property storage is full.' };
  patchState((s) => {
    ensureInventory(s);
    const p = s.warehouse.properties.find((x) => x.id === propertyId);
    if (p) p.items.push({ ...item, storedSimMs: s.sim?.elapsedMs ?? 0 });
    return s;
  });
  return { ok: true };
}

// ── DAILY TICK ────────────────────────────────────────────────────────────────

export function tickWarehouseDaily() {
  const st = getState();
  const simMs = st.sim?.elapsedMs || 0;
  ensureInventory(st);

  _tickRentReminders(simMs);
  const repo = _tickRepossessions(simMs);
  _tickConditionDecay(simMs);
  const liqResult = _tickLiquidationBuyers(simMs, repo?.buyerCountBase);
  _tickVaultAuction(simMs);
  _tickInventoryMarketBuzz();
  _tickRivalStorageBuzz(simMs);
  _tickInsurancePayouts(simMs);

  return { ...liqResult, repossessed: repo?.count || 0 };
}

function _tickRentReminders(simMs) {
  const st = getState();
  for (const unit of st.warehouse?.units || []) {
    const daysLeft = (unit.paidThroughSimMs - simMs) / SIM_DAY_MS;
    if (daysLeft > 0 && daysLeft <= 3 && rollD4() === 1) {
      const provider = WAREHOUSE_PROVIDERS[unit.providerId];
      SMS.send({
        from: 'CORPOS_SYSTEM',
        message: `STORAGE NOTICE: Your ${unit.label} at ${
          provider?.name || unit.providerName
        } expires in ${Math.ceil(daysLeft)} day(s). Pay now to avoid repossession.`,
        gameTime: simMs
      });
    }
  }
}

function _tickRepossessions(simMs) {
  let count = 0;
  const stBefore = getState();
  const pending = (stBefore.warehouse?.units || []).filter((u) => {
    const provider = WAREHOUSE_PROVIDERS[u.providerId] || { repossessionDays: 7, liquidation: true };
    const graceDays = provider.repossessionDays || 7;
    return simMs > u.paidThroughSimMs + graceDays * SIM_DAY_MS;
  });
  const pendingIds = new Set(pending.map((u) => u.id));
  count = pending.length;

  patchState((s) => {
    ensureInventory(s);
    for (const u of s.warehouse.units || []) {
      if (!pendingIds.has(u.id)) continue;
      const provider = WAREHOUSE_PROVIDERS[u.providerId] || { repossessionDays: 7, auctionHouse: false, liquidation: true };
      if (provider.auctionHouse) {
        for (const item of u.items || []) {
          const base = (item.unitValue || 0) * (item.quantity || 1);
          const auctionGross = Math.max(0, Math.round(base * 0.7));
          const net = Math.max(0, Math.round(auctionGross * 0.7));
          const primary = getPrimaryAccount(s);
          if (primary) primary.balance = (primary.balance || 0) + net;
          s.playerInventory.manifest.push({
            type: 'auctioned',
            itemId: item.id,
            itemName: item.name,
            unitId: u.id,
            revenue: net,
            simMs
          });
        }
      } else {
        for (const item of u.items || []) {
          const uVal = (item.unitValue != null ? item.unitValue : item.listPrice) || 0;
          const markdown = Math.max(1, Math.round(uVal * (item.quantity || 1) * 0.4));
          s.warehouse.liquidation.push({
            ...item,
            listPrice: markdown,
            originalPrice: uVal * (item.quantity || 1),
            liquidatedSimMs: simMs,
            fromUnit: u.id
          });
        }
      }
    }
    s.warehouse.units = (s.warehouse.units || []).filter((u) => {
      if (pendingIds.has(u.id)) return false;
      return true;
    });
    s.playerInventory.totalValue = computeTotalInventoryValue(s);
    return s;
  });

  if (count > 0) {
    SMS.send({
      from: 'CORPOS_SYSTEM',
      message: `REPOSSESSION NOTICE: One or more storage units were repossessed for non-payment. See manifest for item disposition (liquidation or auction).`,
      gameTime: simMs
    });
  }
  return { count, buyerCountBase: rollD4() };
}

function _tickConditionDecay(simMs) {
  patchState((s) => {
    ensureInventory(s);
    for (const unit of s.warehouse.units || []) {
      for (const item of unit.items || []) {
        if (!item.perishable) continue;
        const cat = ITEM_CATEGORIES[item.category];
        const baseDecay = (cat && cat.conditionDecayPerDay) || 0;
        const decayRate = unit.climateControlled ? baseDecay * 0.2 : baseDecay;
        if (decayRate <= 0) continue;
        item.condition = Math.max(0, (item.condition || 100) - decayRate);
        if (item.condition <= 0) item.destroyed = true;
      }
      unit.items = (unit.items || []).filter((i) => !i.destroyed);
    }
    s.playerInventory.totalValue = computeTotalInventoryValue(s);
    return s;
  });
}

function _tickLiquidationBuyers(simMs, buyerCountOverride) {
  const liq = getState().warehouse?.liquidation || [];
  if (!liq.length) return { totalSold: 0, totalRevenue: 0, buyerCount: 0 };

  const allAnalytics = getAllAdAnalytics();
  const warehouseAdIds = Object.keys(allAnalytics).filter(
    (id) => id.toLowerCase().includes('warehouse') || id.toLowerCase().includes('storage')
  );
  const adWeights = getPageAdOutcomeWeights(warehouseAdIds);
  const base = typeof buyerCountOverride === 'number' ? buyerCountOverride : rollD4();
  const engagedBuyerBoost = adWeights.engagement > 1.1 ? 1 : 0;
  const buyerCount = base + engagedBuyerBoost;
  const bounceProb = Math.min(0.6, (adWeights.bounce - 1) * 0.4);
  let totalSold = 0;
  let totalRevenue = 0;

  patchState((s) => {
    ensureInventory(s);
    for (let b = 0; b < buyerCount && (s.warehouse.liquidation || []).length > 0; b++) {
      if (Math.random() < bounceProb) continue;
      const convBoost = adWeights.conversion > 1.05 ? 1 : 0;
      const items = 1 + convBoost + (rollD4() > 2 ? 1 : 0);
      for (let i = 0; i < items && s.warehouse.liquidation.length > 0; i++) {
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

  if (totalSold > 0) {
    ToastManager?.fire({
      key: `liq_sale_${simMs}`,
      title: 'Liquidation Sale',
      message: `${totalSold} item(s) sold at the outlet for $${totalRevenue.toFixed(2)} (cash).`,
      icon: '🏷',
      autoDismiss: 5000
    });
  }
  return { totalSold, totalRevenue, buyerCount };
}

function _tickVaultAuction(simMs) {
  const st = getState();
  const last = st.warehouse?.lastVaultAuctionSimMs || 0;
  if (simMs - last < 7 * SIM_DAY_MS) return;
  patchState((s) => {
    ensureInventory(s);
    s.warehouse.lastVaultAuctionSimMs = simMs;
    return s;
  });
}

function _tickInventoryMarketBuzz() {
  patchState((s) => {
    ensureMarketBuzzShape(s);
    for (const unit of s.warehouse?.units || []) {
      for (const item of unit.items || []) {
        const rawTags = item.tags || (item.category ? [item.category] : []);
        for (const t of rawTags) {
          const k = String(t)
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, '');
          if (!k) continue;
          if (!s.marketBuzz[k]) s.marketBuzz[k] = { mentions: 0, likes: 0, dislikes: 0, purchaseCountWindow: 0, lastPurchaseSimMs: 0 };
          s.marketBuzz[k].mentions = (s.marketBuzz[k].mentions || 0) + 0.1;
        }
      }
    }
    return s;
  });
}

function ensureMarketBuzzShape(s) {
  if (!s.marketBuzz || typeof s.marketBuzz !== 'object') s.marketBuzz = {};
}

function _tickRivalStorageBuzz(_simMs) {
  const st = getState();
  const rps = st.rivalProducts || [];
  for (const unit of st.warehouse?.units || []) {
    for (const item of unit.items || []) {
      const pr = (item.productRef && rps.find((p) => p.id === item.productRef)) || null;
      if (!pr || !(pr.tags || []).length) continue;
      if (rollD20() < 15) continue;
      for (const t of pr.tags) {
        recordHashtagEvent(t, 'mention');
      }
    }
  }
}

function _tickInsurancePayouts(simMs) {
  for (const unit of getState().warehouse?.units || []) {
    if (!unit.insured) continue;
    for (const item of unit.items || []) {
      if ((item.condition || 100) >= 30 || item.insuranceClaimed) continue;
      const payout = Math.round((item.unitValue || 0) * (item.quantity || 1) * 0.8);
      if (payout <= 0) continue;
      const itemId = item.id;
      const unitId = unit.id;
      const itemName = item.name;
      patchState((s) => {
        const primary = getPrimaryAccount(s);
        if (primary) primary.balance = (primary.balance || 0) + payout;
        appendBankingTransaction(s, {
          bankName: primary.name,
          accountNumber: primary.accountNumber || primary.id,
          type: 'credit',
          amount: payout,
          description: `Storage insurance — ${itemName} (${unitId})`
        });
        const u = (s.warehouse?.units || []).find((x) => x.id === unitId);
        const it = (u?.items || []).find((x) => x.id === itemId);
        if (it) it.insuranceClaimed = true;
        return s;
      });
      SMS?.send({
        from: 'CORPOS_SYSTEM',
        message: `INSURANCE PAYOUT: ${itemName} in your unit was damaged. $${payout.toFixed(2)} deposited to FNCB.`,
        gameTime: simMs
      });
    }
  }
}

// ── GETTERS ─────────────────────────────────────────────────────────────────

export function getAllUnits() {
  return getState().warehouse?.units || [];
}
export function getPlayerInventory() {
  return getState().playerInventory?.items || [];
}
export function getLiquidationPool() {
  return getState().warehouse?.liquidation || [];
}
export function getManifest() {
  return getState().playerInventory?.manifest || [];
}
export function getTotalInventoryValue() {
  return getState().playerInventory?.totalValue || 0;
}
export function getUnitsByProvider(providerId) {
  return getAllUnits().filter((u) => u.providerId === providerId);
}

// Legacy WorldNet (deprecated — pages use HTML builders in worldnet-warehouse-pages.js)
export function mountWarehousePage(root) {
  const c = root.querySelector('#warehouse-root');
  if (c) c.innerHTML = '<p style="font-size:11px;">Use the updated site layout above.</p>';
}
