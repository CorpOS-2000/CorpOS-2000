/**
 * player-assets.js — Player inventory (10-slot carry cap), net worth calculator,
 * and warehouse overflow helpers.
 *
 * Assets are typed objects that live in state.player.assets[].
 * Purchases from worldNetShopping deliver here; warehouse overflow is handled
 * automatically when the carry cap is exceeded.
 */
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { storeItem } from './warehouse-tick.js';
import { toast } from './toast.js';

export const CARRY_CAP = 10;

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   sourceSiteId: string,
 *   kind: 'physical' | 'digital' | 'fake' | 'rare',
 *   valueUsd: number,
 *   quality: number,
 *   flags: { counterfeit?: boolean, jackpot?: boolean },
 *   acquiredSimMs: number,
 *   orderId?: string,
 *   listed?: boolean
 * }} PlayerAsset
 */

function ensureAssets(st) {
  if (!Array.isArray(st.player.assets)) st.player.assets = [];
  if (!Array.isArray(st.player.scamHistory)) st.player.scamHistory = [];
}

/**
 * Return how many asset slots are currently used in carry inventory.
 * @returns {number}
 */
export function getCarryCount() {
  const st = getState();
  ensureAssets(st);
  return (st.player.assets || []).filter((a) => !a.stored).length;
}

/**
 * Return carry cap headroom (0 = full).
 * @returns {number}
 */
export function getCarryHeadroom() {
  return Math.max(0, CARRY_CAP - getCarryCount());
}

/**
 * Deliver an asset to the player's carry inventory, spilling to warehouse if full.
 * Returns { ok, overflow, unitId } where overflow=true means it went to warehouse.
 *
 * @param {Omit<PlayerAsset, 'id' | 'acquiredSimMs'>} assetDef
 * @returns {{ ok: boolean, overflow: boolean, unitId?: string }}
 */
export function deliverAsset(assetDef) {
  const st = getState();
  const simMs = st.sim?.elapsedMs ?? 0;
  const asset = {
    id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    acquiredSimMs: simMs,
    flags: {},
    quality: 100,
    ...assetDef
  };

  const carry = (st.player.assets || []).filter((a) => !a.stored).length;

  if (carry < CARRY_CAP) {
    patchState((s) => {
      ensureAssets(s);
      s.player.assets.push({ ...asset, stored: false });
      return s;
    });
    return { ok: true, overflow: false };
  }

  // Carry is full — try to spill to first available warehouse unit
  const units = st.warehouse?.units || [];
  const targetUnit = units.find((u) => (u.items?.length ?? 0) < u.maxItems);
  if (targetUnit) {
    const result = storeItem(targetUnit.id, {
      name: asset.name,
      productRef: asset.id,
      listPrice: asset.valueUsd,
      price: asset.valueUsd,
      unitValue: asset.valueUsd,
      kind: asset.kind,
      category: 'consumer',
      flags: asset.flags
    });
    if (result.ok) {
      patchState((s) => {
        ensureAssets(s);
        s.player.assets.push({ ...asset, stored: true, storedInUnit: targetUnit.id });
        return s;
      });
      toast(`Inventory full — "${asset.name}" stored in ${targetUnit.label}.`);
      return { ok: true, overflow: true, unitId: targetUnit.id };
    }
  }

  // No warehouse space — player must take action
  patchState((s) => {
    ensureAssets(s);
    // Store it as an unplaced overflow item with stored=true but no unit
    s.player.assets.push({ ...asset, stored: true, storedInUnit: null });
    return s;
  });
  toast(
    `Inventory full! "${asset.name}" is in overflow — rent a warehouse unit on WhereAllThingsGo.net.`
  );
  return { ok: true, overflow: true };
}

/**
 * Remove an asset by id. Returns the removed asset or null.
 * @param {string} assetId
 * @returns {PlayerAsset | null}
 */
export function consumeAsset(assetId) {
  let removed = null;
  patchState((s) => {
    ensureAssets(s);
    const idx = s.player.assets.findIndex((a) => a.id === assetId);
    if (idx !== -1) {
      removed = s.player.assets[idx];
      s.player.assets.splice(idx, 1);
    }
    return s;
  });
  return removed;
}

/**
 * Mark an asset as listed (for resale via WebEx store).
 * @param {string} assetId
 */
export function listAssetForSale(assetId) {
  patchState((s) => {
    ensureAssets(s);
    const a = s.player.assets.find((x) => x.id === assetId);
    if (a) a.listed = true;
    return s;
  });
}

/**
 * Unlist an asset.
 * @param {string} assetId
 */
export function unlistAsset(assetId) {
  patchState((s) => {
    ensureAssets(s);
    const a = s.player.assets.find((x) => x.id === assetId);
    if (a) a.listed = false;
    return s;
  });
}

/**
 * Calculate total player net worth in USD:
 * bank balances + hardCash + assets + player inventory (carried + stored) + warehouse liquidation list.
 * @returns {number}
 */
export function getPlayerNetWorthUsd() {
  const st = getState();
  let total = Number(st.player?.hardCash) || 0;
  for (const acc of st.accounts || []) {
    total += Math.max(0, Number(acc.balance) || 0);
    total -= Math.max(0, Number(acc.loanBalance) || 0);
  }
  for (const asset of st.player?.assets || []) {
    total += Math.max(0, Number(asset.valueUsd) || 0);
  }
  total += Math.max(0, Number(st.playerInventory?.totalValue) || 0);
  for (const item of st.warehouse?.liquidation || []) {
    total += Math.max(0, Number(item.listPrice) || 0);
  }
  return Math.round(total * 100) / 100;
}

/**
 * Return all unlisted carry-inventory assets.
 * @returns {PlayerAsset[]}
 */
export function getCarryAssets() {
  const st = getState();
  return (st.player?.assets || []).filter((a) => !a.stored && !a.listed);
}

/**
 * Return all listed assets (available for sale in player's store).
 * @returns {PlayerAsset[]}
 */
export function getListedAssets() {
  const st = getState();
  return (st.player?.assets || []).filter((a) => a.listed);
}

/**
 * Convenience HTML snippet showing carry status (used in warehouse/checkout UIs).
 * @returns {string}
 */
export function carryStatusHtml() {
  const count = getCarryCount();
  const full = count >= CARRY_CAP;
  const color = full ? '#cc0000' : count >= CARRY_CAP - 2 ? '#cc6600' : '#006600';
  return `<span style="font-size:10px;color:${color};font-family:Arial,sans-serif;">Inventory: ${count}/${CARRY_CAP}</span>`;
}
