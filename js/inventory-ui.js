/**
 * inventory-ui.js — Player inventory management window
 */
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { escapeHtml } from './identity.js';
import { getPlayerInventory, storeItem, ITEM_CATEGORIES } from './warehouse-tick.js';
import { computeBuyPrice, computeSellPrice, recordTransaction } from './economy.js';
import { toast } from './toast.js';

const SIM_DAY_MS = SIM_HOUR_MS * 24;

export function mountInventoryWindow(rootEl) {
  if (!rootEl) return;
  let selectedItemId = null;
  let activeTab = 'items';

  function render() {
    const st = getState();
    const items = getPlayerInventory();
    const units = st.warehouse?.units || [];
    const manifest = st.playerInventory?.manifest || [];
    const totalVal = st.playerInventory?.totalValue || 0;

    rootEl.innerHTML = `
<div class="inv-shell">
  <div class="inv-header">
    <div class="inv-title">📦 Player Inventory</div>
    <div class="inv-stats">
      <span>Carried: ${items.length} items</span>
      <span>Stored: ${units.reduce((n, u) => n + (u.items?.length || 0), 0)} items</span>
      <span>Total Value: $${Number(totalVal).toLocaleString()}</span>
    </div>
  </div>
  <div class="inv-tabs">
    <button type="button" class="inv-tab ${activeTab === 'items' ? 'inv-tab-active' : ''}" data-inv-tab="items">Items</button>
    <button type="button" class="inv-tab ${activeTab === 'stored' ? 'inv-tab-active' : ''}" data-inv-tab="stored">In Storage</button>
    <button type="button" class="inv-tab ${activeTab === 'manifest' ? 'inv-tab-active' : ''}" data-inv-tab="manifest">Manifest</button>
  </div>
  ${activeTab === 'items' ? renderItemsTab(items, selectedItemId, units) : ''}
  ${activeTab === 'stored' ? renderStoredTab(units, selectedItemId) : ''}
  ${activeTab === 'manifest' ? renderManifestTab(manifest) : ''}
</div>`;

    rootEl.querySelectorAll('[data-inv-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTab = btn.getAttribute('data-inv-tab') || 'items';
        selectedItemId = null;
        render();
      });
    });

    rootEl.querySelectorAll('[data-inv-select]').forEach((row) => {
      row.addEventListener('click', () => {
        selectedItemId = row.getAttribute('data-inv-select');
        render();
      });
    });

    rootEl.querySelector('[data-inv-store]')?.addEventListener('click', () => {
      const unitId = rootEl.querySelector('[data-inv-unit-select]')?.value;
      if (!unitId || !selectedItemId) return;
      const item = items.find((i) => i.id === selectedItemId);
      if (!item) return;
      const result = storeItem(unitId, item);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      selectedItemId = null;
      render();
    });

    rootEl.querySelector('[data-inv-sell-marketplace]')?.addEventListener('click', () => {
      if (!selectedItemId) return;
      const item = items.find((i) => i.id === selectedItemId);
      if (!item) return;
      const buyP = computeBuyPrice(item.unitValue || 0, item.category, item.tags || []);
      const sellP = computeSellPrice(buyP, item.condition ?? 100, 'marketplace');
      const q = item.quantity || 1;
      const lineTotal = sellP * q;
      if (
        !confirm(
          `List "${item.name}" (${q}×) on ETradeBay for $${lineTotal.toFixed(2)} total?\n(${Math.round(
            (sellP / buyP) * 100
          )}% of assessed per-unit buy value)`
        )
      ) {
        return;
      }
      sellItem(item, lineTotal, 'marketplace');
      render();
    });

    rootEl.querySelector('[data-inv-sell-wholesale]')?.addEventListener('click', () => {
      if (!selectedItemId) return;
      const item = items.find((i) => i.id === selectedItemId);
      if (!item) return;
      const buyP = computeBuyPrice(item.unitValue || 0, item.category, item.tags || []);
      const sellP = computeSellPrice(buyP, item.condition ?? 100, 'wholesale');
      const q = item.quantity || 1;
      const lineTotal = sellP * q;
      if (
        !confirm(
          `Sell "${item.name}" wholesale for $${lineTotal.toFixed(2)} total?\n(${Math.round(
            (sellP / buyP) * 100
          )}% of assessed per-unit value — instant)`
        )
      ) {
        return;
      }
      sellItem(item, lineTotal, 'wholesale');
      render();
    });

    rootEl.querySelector('[data-inv-sell-private]')?.addEventListener('click', () => {
      if (!selectedItemId) return;
      const item = items.find((i) => i.id === selectedItemId);
      if (!item) return;
      const buyP = computeBuyPrice(item.unitValue || 0, item.category, item.tags || []);
      const sellP = computeSellPrice(buyP, item.condition ?? 100, 'private');
      const q = item.quantity || 1;
      const lineTotal = sellP * q;
      if (
        !confirm(
          `Sell "${item.name}" to a private buyer for $${lineTotal.toFixed(2)} total?\n(${Math.round(
            (sellP / buyP) * 100
          )}% of assessed per-unit value)`
        )
      ) {
        return;
      }
      sellItem(item, lineTotal, 'private');
      render();
    });
  }

  function renderItemsTab(items, selectedId, units) {
    if (!items.length) {
      return `<div class="inv-empty">No items in your inventory. Items appear here when deliveries arrive.</div>`;
    }
    const selectedItem = items.find((i) => i.id === selectedId);
    const buyP = selectedItem
      ? computeBuyPrice(selectedItem.unitValue || 0, selectedItem.category, selectedItem.tags || [])
      : 0;
    const sellPMkt = computeSellPrice(buyP, selectedItem?.condition ?? 100, 'marketplace');
    const sellPWS = computeSellPrice(buyP, selectedItem?.condition ?? 100, 'wholesale');
    const sellPPriv = computeSellPrice(buyP, selectedItem?.condition ?? 100, 'private');
    const q = selectedItem?.quantity || 1;

    return `
<div class="inv-two-col">
  <div class="inv-list">
    ${items
      .map((item) => {
        const cat = ITEM_CATEGORIES[item.category];
        return `
<div class="inv-row ${item.id === selectedId ? 'inv-row-selected' : ''}" data-inv-select="${escapeHtml(item.id)}">
  <span class="inv-row-icon">${cat?.icon || '📦'}</span>
  <div class="inv-row-info">
    <div class="inv-row-name">${escapeHtml(item.name)}</div>
    <div class="inv-row-meta">${escapeHtml(cat?.label || item.category)} · Qty ${
        item.quantity || 1
      } · $${(item.unitValue || 0).toFixed(2)}</div>
  </div>
  <div class="inv-row-cond" style="color:${(item.condition || 100) < 50 ? '#cc0000' : '#006600'}">
    ${item.condition ?? 100}%
  </div>
</div>`;
      })
      .join('')}
  </div>
  <div class="inv-detail">
    ${
      selectedItem
        ? `
    <div class="inv-detail-title">${escapeHtml(selectedItem.name)}</div>
    <div class="inv-detail-badge">${ITEM_CATEGORIES[selectedItem.category]?.icon || '📦'} ${escapeHtml(
        ITEM_CATEGORIES[selectedItem.category]?.label || selectedItem.category
      )}</div>
    <table class="inv-detail-table">
      <tr><td>Qty</td><td>${selectedItem.quantity || 1}</td></tr>
      <tr><td>Acquired</td><td>$${(selectedItem.unitValue || 0).toFixed(2)} each</td></tr>
      <tr><td>Current Buy Price</td><td><b>$${buyP.toFixed(2)}</b> (per unit)</td></tr>
      <tr><td>Condition</td><td>${selectedItem.condition ?? 100}%</td></tr>
      <tr><td>Source</td><td>${escapeHtml(selectedItem.source || 'unknown')}</td></tr>
    </table>
    <div class="inv-action-group">
      <div class="inv-action-label">Store in Warehouse</div>
      <select class="inv-unit-select" data-inv-unit-select>
        <option value="">— Select unit —</option>
        ${units
          .map(
            (u) =>
              `<option value="${escapeHtml(u.id)}">${escapeHtml(
                u.providerName || u.label
              )} — ${escapeHtml(u.label)} (${(u.items || []).length}/${u.maxItems})</option>`
          )
          .join('')}
      </select>
      <button type="button" class="inv-btn" data-inv-store>Store Item</button>
    </div>
    <div class="inv-action-group">
      <div class="inv-action-label">Sell (est. total for ${q} unit${q > 1 ? 's' : ''})</div>
      <button type="button" class="inv-btn" data-inv-sell-private>Private Sale — $${(sellPPriv * q).toFixed(2)}</button>
      <button type="button" class="inv-btn" data-inv-sell-marketplace>ETradeBay — $${(sellPMkt * q).toFixed(2)}</button>
      <button type="button" class="inv-btn" data-inv-sell-wholesale>Wholesale — $${(sellPWS * q).toFixed(2)}</button>
    </div>
    `
        : `<div class="inv-detail-empty">Select an item to see details and options.</div>`
    }
  </div>
</div>`;
  }

  function renderStoredTab(units, _selectedId) {
    if (!units.length) {
      return `<div class="inv-empty">No storage units rented. Visit a warehouse on WorldNet.</div>`;
    }
    const elNow = getState().sim?.elapsedMs || 0;
    return units
      .map((u) => {
        const daysLeft = Math.max(0, Math.ceil(((u.paidThroughSimMs || 0) - elNow) / SIM_DAY_MS));
        return `
<div class="inv-unit-block">
  <div class="inv-unit-header">
    <span>${escapeHtml(u.providerName || u.label)} — ${escapeHtml(u.label)}</span>
    <span class="inv-unit-meta">${(u.items || []).length}/${
      u.maxItems
    } items · ${daysLeft} days left · ${u.insured ? '✓ Insured' : 'Uninsured'}</span>
  </div>
  ${
    (u.items || []).length
      ? (u.items || [])
          .map(
            (item) => `
<div class="inv-row">
  <span class="inv-row-icon">${ITEM_CATEGORIES[item.category]?.icon || '📦'}</span>
  <div class="inv-row-info">
    <div class="inv-row-name">${escapeHtml(item.name)}</div>
    <div class="inv-row-meta">$${(item.unitValue || 0).toFixed(2)} · Cond: ${item.condition ?? 100}%</div>
  </div>
</div>`
          )
          .join('')
      : `<div class="inv-empty" style="padding:8px;">Unit is empty.</div>`
  }
</div>`;
      })
      .join('');
  }

  function renderManifestTab(manifest) {
    if (!manifest.length) return `<div class="inv-empty">No transactions recorded yet.</div>`;
    const TYPE_ICONS = {
      acquired: '📥',
      stored: '📦',
      retrieved: '📤',
      unit_rented: '🔑',
      auctioned: '🔨',
      sold: '💰'
    };
    return `
<table class="inv-manifest-table">
  <tr class="inv-manifest-hdr">
    <th>Type</th><th>Item / Unit</th><th>Amount</th><th>Time</th>
  </tr>
  ${manifest
    .slice(-50)
    .reverse()
    .map(
      (e) => `
<tr>
  <td>${TYPE_ICONS[e.type] || '◆'} ${escapeHtml(String(e.type || '').replace(/_/g, ' ')) || '—'}</td>
  <td>${escapeHtml(e.itemName || e.provider || e.tier || '—')}</td>
  <td>${
    e.cost != null
      ? '$' + e.cost.toLocaleString()
      : e.revenue != null
      ? '$' + e.revenue.toLocaleString()
      : '—'
  }</td>
  <td style="color:#888;font-size:10px;">${formatSimTime(e.simMs)}</td>
</tr>`
    )
    .join('')}
</table>`;
  }

  function sellItem(item, totalRevenue, channel) {
    const lineValue = (item.unitValue || 0) * (item.quantity || 1);
    patchState((s) => {
      s.playerInventory = s.playerInventory || { items: [], manifest: [], totalValue: 0 };
      s.playerInventory.items = (s.playerInventory.items || []).filter((i) => i.id !== item.id);
      if (channel === 'marketplace') {
        s.activeTasks = s.activeTasks || [];
        s.activeTasks.push({
          id: `sale_${item.id}_${Date.now()}`,
          type: 'marketplace_settlement',
          label: `ETradeBay sale: ${item.name}`,
          icon: '💰',
          dueSimMs: (s.sim?.elapsedMs || 0) + 24 * SIM_HOUR_MS,
          amount: totalRevenue,
          status: 'in_progress'
        });
      } else {
        s.player = s.player || {};
        s.player.hardCash = (s.player.hardCash || 0) + totalRevenue;
      }
      s.playerInventory.manifest = s.playerInventory.manifest || [];
      s.playerInventory.manifest.push({
        type: 'sold',
        itemId: item.id,
        itemName: item.name,
        revenue: totalRevenue,
        channel,
        simMs: s.sim?.elapsedMs || 0
      });
      s.playerInventory.totalValue = Math.max(0, (s.playerInventory.totalValue || 0) - lineValue);
      return s;
    });
    recordTransaction(totalRevenue, item.category, 'sale');
    try {
      window.ActivityLog?.log?.('SALE', `Sold ${item.name} via ${channel} for $${totalRevenue.toFixed(2)}`, {
        notable: true
      });
    } catch {
      /* ignore */
    }
    toast({
      key: `sold_${item.id}`,
      title: 'Item Sold',
      message: `${item.name} sold for $${totalRevenue.toFixed(2)} via ${channel}.`,
      icon: '💰',
      autoDismiss: 4000
    });
  }

  function formatSimTime(simMs) {
    if (simMs == null) return '—';
    const d = new Date(1262304000000 + simMs);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${d.getUTCHours()}:00`;
  }

  render();
}
