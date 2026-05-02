/**
 * Assets — unified view of carried products, websites, owned property, rentals, manifest.
 */
import { getState, patchState, SIM_HOUR_MS } from './gameState.js';
import { escapeHtml } from './identity.js';
import {
  getPlayerInventory,
  storeItem,
  retrieveItem,
  ITEM_CATEGORIES,
  PROPERTY_TIERS
} from './warehouse-tick.js';
import { computeBuyPrice, computeSellPrice, recordTransaction } from './economy.js';
import { toast } from './toast.js';
import { productVisualDataUri } from './product-visuals.js';
import { ensureStockroomEntryForCarriedItem } from './webex-stockroom-sync.js';
import {
  playerHasWebsiteWithShopModule,
  openWebExPublisherHighlightStock
} from './webex-publisher.js';
import { findShopProductById } from './worldnet-shop.js';
import { consumeAsset } from './player-assets.js';
import { getGameDayIndex } from './clock.js';
import { emit, on } from './events.js';

const SIM_DAY_MS = SIM_HOUR_MS * 24;

function describeCarriedItem(item) {
  const st = getState();
  if (item.productRef) {
    const rp = (st.rivalProducts || []).find((p) => p.id === item.productRef);
    if (rp?.description) return String(rp.description);
    const shop = getStoreById('rapidmart');
    const row = shop?.productsById?.[item.productRef];
    if (row?.description) return String(row.description);
  }
  return 'No extended description on file.';
}

function evaluateLitteringNewsAfterDiscard(s, dayIndex) {
  if (!Array.isArray(s.player.assetDiscardDays)) s.player.assetDiscardDays = [];
  const todayCount = s.player.assetDiscardDays.filter((d) => d === dayIndex).length;

  const pushNews = (headline, severity) => {
    const simMs = s.sim?.elapsedMs ?? 0;
    s.newsRegistry = s.newsRegistry || [];
    s.newsRegistry.push({
      id: `asset_litter_${simMs}_${severity}`,
      simMs,
      headline,
      summary: `${headline} Sources cite curb-side commerce waste tied to operator discard frequency.`,
      category: 'local',
      severity,
      channels: ['herald', 'rtc'],
      tags: ['waste', 'operator', 'environment'],
      reactions: { sympathy: 2, outrage: 6, indifferent: 2 },
      comments: []
    });
    if (s.newsRegistry.length > 200) s.newsRegistry.shift();
    emit('news:breaking', { headline, severity });
  };

  if (todayCount >= 7) {
    if (s.player.assetLitterSevereDayIndex !== dayIndex) {
      s.player.assetLitterSevereDayIndex = dayIndex;
      pushNews(
        'Federal litter tipsheet names “serial discard” operators — wasteful dumping inquiry widens',
        4
      );
    }
  } else if (todayCount >= 4) {
    if (s.player.assetLitterNewsDayIndex !== dayIndex) {
      s.player.assetLitterNewsDayIndex = dayIndex;
      pushNews(
        'Hargrove Herald: neighbors cite curb piles tied to operator discard habits — city waste desk opens tip line',
        3
      );
    }
  }
}

const _assetsStateUnsub = new WeakMap();

export function mountInventoryWindow(rootEl) {
  if (!rootEl) return;
  /** @type {string | null} row key: "inv:<id>" | "pa:<id>" */
  let selectedKey = null;
  let activeSection = 'products';

  _assetsStateUnsub.get(rootEl)?.();

  function render() {
    const st = getState();
    const items = getPlayerInventory();
    const legacyAssets = Array.isArray(st.player?.assets) ? st.player.assets : [];
    const units = st.warehouse?.units || [];
    const props = st.warehouse?.properties || [];
    const manifest = st.playerInventory?.manifest || [];
    const projects = st.player?.webExProjects || [];
    const totalVal = st.playerInventory?.totalValue || 0;
    const storedCount = units.reduce((n, u) => n + (u.items?.length || 0), 0);

    const selectedItem =
      selectedKey?.startsWith('inv:') === true
        ? items.find((i) => i.id === selectedKey.slice(4))
        : null;
    const selectedLegacy =
      selectedKey?.startsWith('pa:') === true
        ? legacyAssets.find((a) => a.id === selectedKey.slice(3))
        : null;

    rootEl.innerHTML = `
<div class="ast-shell">
  <div class="ast-header">
    <div class="ast-title">Assets</div>
    <div class="ast-stats">
      <span>Carried: ${items.length}</span>
      <span>Holdings: ${legacyAssets.length}</span>
      <span>Stored: ${storedCount}</span>
      <span>Value est.: $${Number(totalVal).toLocaleString()}</span>
    </div>
  </div>
  <div class="ast-nav">
    <button type="button" class="ast-nav-btn ${activeSection === 'products' ? 'ast-nav-on' : ''}" data-ast-sec="products">Products</button>
    <button type="button" class="ast-nav-btn ${activeSection === 'websites' ? 'ast-nav-on' : ''}" data-ast-sec="websites">Websites</button>
    <button type="button" class="ast-nav-btn ${activeSection === 'properties' ? 'ast-nav-on' : ''}" data-ast-sec="properties">Properties</button>
    <button type="button" class="ast-nav-btn ${activeSection === 'rentals' ? 'ast-nav-on' : ''}" data-ast-sec="rentals">Rentals</button>
    <button type="button" class="ast-nav-btn ${activeSection === 'manifest' ? 'ast-nav-on' : ''}" data-ast-sec="manifest">Manifest</button>
  </div>
  <div class="ast-body">
    ${activeSection === 'products' ? renderProductsSection(items, selectedItem, units) : ''}
    ${activeSection === 'websites' ? renderWebsitesSection(projects) : ''}
    ${activeSection === 'properties' ? renderPropertiesSection(props) : ''}
    ${activeSection === 'rentals' ? renderRentalsSection(units) : ''}
    ${activeSection === 'manifest' ? renderManifestSection(manifest) : ''}
  </div>
</div>`;

    rootEl.querySelectorAll('[data-ast-sec]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeSection = btn.getAttribute('data-ast-sec') || 'products';
        selectedKey = null;
        render();
      });
    });

    rootEl.querySelectorAll('[data-ast-pick]').forEach((el) => {
      el.addEventListener('click', () => {
        const row = el.getAttribute('data-ast-row');
        const id = el.getAttribute('data-ast-id');
        if (!row || !id) return;
        selectedKey = `${row}:${id}`;
        render();
      });
    });

    rootEl.querySelector('[data-ast-discard]')?.addEventListener('click', () => {
      if (!selectedKey?.startsWith('inv:')) return;
      const item = items.find((i) => i.id === selectedKey.slice(4));
      if (!item) return;
      if (!confirm(`Discard ${item.name} from your carried assets? This cannot be undone.`)) return;
      const lineValue = (item.unitValue || 0) * (item.quantity || 1);
      const dayIdx = getGameDayIndex();
      patchState((s) => {
        s.playerInventory = s.playerInventory || { items: [], manifest: [], totalValue: 0 };
        s.playerInventory.items = (s.playerInventory.items || []).filter((i) => i.id !== item.id);
        s.playerInventory.manifest = s.playerInventory.manifest || [];
        s.playerInventory.manifest.push({
          type: 'discarded',
          itemId: item.id,
          itemName: item.name,
          simMs: s.sim?.elapsedMs || 0
        });
        s.playerInventory.totalValue = Math.max(0, (s.playerInventory.totalValue || 0) - lineValue);
        s.player = s.player || {};
        if (!Array.isArray(s.player.assetDiscardDays)) s.player.assetDiscardDays = [];
        s.player.assetDiscardDays.push(dayIdx);
        s.player.assetDiscardDays = s.player.assetDiscardDays.slice(-48);
        evaluateLitteringNewsAfterDiscard(s, dayIdx);
        return s;
      });
      toast({
        key: `discard_${item.id}`,
        title: 'Discarded',
        message: `${item.name} removed from carried assets.`,
        icon: '🗑️',
        autoDismiss: 3500
      });
      selectedKey = null;
      render();
    });

    rootEl.querySelector('[data-ast-discard-legacy]')?.addEventListener('click', () => {
      if (!selectedKey?.startsWith('pa:')) return;
      const asset = legacyAssets.find((a) => a.id === selectedKey.slice(3));
      if (!asset) return;
      if (
        !confirm(
          `Remove "${asset.name}" from registered holdings? This cannot be undone.`
        )
      )
        return;
      consumeAsset(asset.id);
      patchState((s) => {
        s.playerInventory = s.playerInventory || { items: [], manifest: [], totalValue: 0 };
        s.playerInventory.manifest = s.playerInventory.manifest || [];
        s.playerInventory.manifest.push({
          type: 'discarded',
          itemId: asset.id,
          itemName: asset.name,
          simMs: s.sim?.elapsedMs || 0
        });
        return s;
      });
      toast({
        key: `discard_legacy_${asset.id}`,
        title: 'Removed',
        message: `${asset.name} removed from holdings.`,
        icon: '🗑️',
        autoDismiss: 3500
      });
      selectedKey = null;
      render();
    });

    rootEl.querySelector('[data-ast-sell-shop]')?.addEventListener('click', () => {
      if (!selectedKey?.startsWith('inv:')) return;
      const item = items.find((i) => i.id === selectedKey.slice(4));
      if (!item) return;
      if (!playerHasWebsiteWithShopModule()) {
        window.alert('No website shop available.');
        return;
      }
      const stockId = ensureStockroomEntryForCarriedItem(item);
      if (!stockId) return;
      openWebExPublisherHighlightStock(stockId);
      toast({
        key: `sell_hint_${item.id}`,
        title: 'WebEx-Publisher',
        message: 'Drag the highlighted product into Website inventory, then onto a Shop module.',
        icon: '🛒',
        autoDismiss: 7000
      });
    });

    rootEl.querySelector('[data-ast-store]')?.addEventListener('click', () => {
      const unitId = rootEl.querySelector('[data-ast-unit]')?.value;
      if (!unitId || !selectedKey?.startsWith('inv:')) return;
      const item = items.find((i) => i.id === selectedKey.slice(4));
      if (!item) return;
      const result = storeItem(unitId, item);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      selectedKey = null;
      render();
    });

    rootEl.querySelectorAll('[data-ast-sell-mkt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!selectedKey?.startsWith('inv:')) return;
        const item = items.find((i) => i.id === selectedKey.slice(4));
        if (!item) return;
        sellChannel(item, 'marketplace');
        render();
      });
    });
    rootEl.querySelectorAll('[data-ast-sell-wh]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!selectedKey?.startsWith('inv:')) return;
        const item = items.find((i) => i.id === selectedKey.slice(4));
        if (!item) return;
        sellChannel(item, 'wholesale');
        render();
      });
    });
    rootEl.querySelectorAll('[data-ast-sell-pr]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!selectedKey?.startsWith('inv:')) return;
        const item = items.find((i) => i.id === selectedKey.slice(4));
        if (!item) return;
        sellChannel(item, 'private');
        render();
      });
    });

    rootEl.querySelectorAll('[data-ast-retrieve]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const unitId = btn.getAttribute('data-unit');
        const itemId = btn.getAttribute('data-item');
        if (!unitId || !itemId) return;
        const itemName =
          units.find((u) => u.id === unitId)?.items?.find((it) => it.id === itemId)?.name || 'item';
        if (!confirm(`Retrieve ${itemName} from storage into carried inventory?`)) return;
        const r = retrieveItem(unitId, itemId);
        if (!r.ok) window.alert(r.error || 'Could not retrieve.');
        else {
          toast({
            key: `retrieve_${itemId}`,
            title: 'Retrieved',
            message: `${itemName} is now in carried inventory.`,
            icon: '📦',
            autoDismiss: 4000
          });
        }
        render();
      });
    });
  }

  function renderProductsSection(items, legacyAssets, selectedItem, selectedLegacy, units) {
    const emptyCarried = !items.length;
    const emptyLegacy = !legacyAssets.length;
    if (emptyCarried && emptyLegacy) {
      return `<div class="ast-empty">No portable assets yet. Buy from WorldNet shops, complete deliveries, or receive registered holdings (deeds, scam bundles, etc.).</div>`;
    }

    const carriedCards = items
      .map((item) => {
        const uri = productVisualDataUri({
          id: item.productRef || item.id,
          title: item.name,
          categoryId: item.category
        });
        const on = item.id === selectedItem?.id ? ' ast-card--selected' : '';
        return `<div class="ast-card${on}" data-ast-pick data-ast-row="inv" data-ast-id="${escapeHtml(item.id)}">
          <div class="ast-card-img"><img src="${uri}" alt="" draggable="false"/></div>
          <div class="ast-card-cap">${escapeHtml(item.name)}</div>
          <div class="ast-card-sub">×${item.quantity || 1} · $${(item.unitValue || 0).toFixed(2)}</div>
        </div>`;
      })
      .join('');

    const legacyCards = legacyAssets
      .map((asset) => {
        const uri = productVisualDataUri({
          id: asset.id,
          title: asset.name,
          categoryId: asset.kind || 'consumer'
        });
        const on = asset.id === selectedLegacy?.id ? ' ast-card--selected' : '';
        const sub =
          asset.flags?.property === true
            ? 'Property deed'
            : `${String(asset.kind || 'asset')} · $${Number(asset.valueUsd || 0).toFixed(2)}`;
        return `<div class="ast-card ast-card--legacy${on}" data-ast-pick data-ast-row="pa" data-ast-id="${escapeHtml(asset.id)}">
          <div class="ast-card-img"><img src="${uri}" alt="" draggable="false"/></div>
          <div class="ast-card-cap">${escapeHtml(asset.name)}</div>
          <div class="ast-card-sub">${escapeHtml(sub)}</div>
        </div>`;
      })
      .join('');

    const leftCol = `
      <div class="ast-products-cols">
        ${emptyCarried ? '' : `<div class="ast-subsec"><div class="ast-subsec-title">Carried inventory</div><div class="ast-grid ast-grid--section">${carriedCards}</div></div>`}
        ${emptyLegacy ? '' : `<div class="ast-subsec"><div class="ast-subsec-title">Registered holdings</div><div class="ast-muted ast-subsec-hint">Deeds, deliveries outside the carry catalog, and special acquisitions.</div><div class="ast-grid ast-grid--section">${legacyCards}</div></div>`}
      </div>`;

    const detail = selectedItem
      ? (() => {
          const buyP = computeBuyPrice(
            selectedItem.unitValue || 0,
            selectedItem.category,
            selectedItem.tags || []
          );
          const sellPMkt = computeSellPrice(buyP, selectedItem.condition ?? 100, 'marketplace');
          const q = selectedItem.quantity || 1;
          const uri = productVisualDataUri({
            id: selectedItem.productRef || selectedItem.id,
            title: selectedItem.name,
            categoryId: selectedItem.category
          });
          const cat = ITEM_CATEGORIES[selectedItem.category];
          return `
      <div class="ast-detail">
        <div class="ast-detail-visual ast-detail-visual--pop"><img src="${uri}" alt="" draggable="false"/></div>
        <div class="ast-detail-copy">
          <div class="ast-detail-title">${escapeHtml(selectedItem.name)}</div>
          <div class="ast-detail-badge">${cat?.icon || '📦'} ${escapeHtml(cat?.label || selectedItem.category)}</div>
          <p class="ast-detail-desc">${escapeHtml(describeCarriedItem(selectedItem))}</p>
          <table class="ast-detail-table">
            <tr><td>Obtained via</td><td>${escapeHtml(selectedItem.source || 'unknown')}</td></tr>
            <tr><td>Your unit price</td><td>$${(selectedItem.unitValue || 0).toFixed(2)}</td></tr>
            <tr><td>Est. public buy value</td><td><b>$${buyP.toFixed(2)}</b> / unit</td></tr>
            <tr><td>Qty</td><td>${q}</td></tr>
            <tr><td>Condition</td><td>${selectedItem.condition ?? 100}%</td></tr>
          </table>
          <div class="ast-detail-actions">
            <button type="button" class="ast-btn ast-btn-warn" data-ast-discard>Discard</button>
            <button type="button" class="ast-btn ast-btn-primary" data-ast-sell-shop>Sell on my shop…</button>
          </div>
          <div class="ast-subhdr">Move to warehouse unit</div>
          <select class="ast-select" data-ast-unit>
            <option value="">— Select rental unit —</option>
            ${units
              .map(
                (u) =>
                  `<option value="${escapeHtml(u.id)}">${escapeHtml(
                    u.providerName || u.label
                  )} — ${escapeHtml(u.label)} (${(u.items || []).length}/${u.maxItems})</option>`
              )
              .join('')}
          </select>
          <button type="button" class="ast-btn" data-ast-store>Store in unit</button>
          <div class="ast-subhdr">Liquidate (carried)</div>
          <button type="button" class="ast-btn" data-ast-sell-pr>Private — $${(computeSellPrice(buyP, selectedItem.condition ?? 100, 'private') * q).toFixed(2)}</button>
          <button type="button" class="ast-btn" data-ast-sell-mkt>ETradeBay — $${(sellPMkt * q).toFixed(2)}</button>
          <button type="button" class="ast-btn" data-ast-sell-wh>Wholesale — $${(
            computeSellPrice(buyP, selectedItem.condition ?? 100, 'wholesale') * q
          ).toFixed(2)}</button>
        </div>
      </div>`;
        })()
      : selectedLegacy
      ? (() => {
          const uri = productVisualDataUri({
            id: selectedLegacy.id,
            title: selectedLegacy.name,
            categoryId: selectedLegacy.kind || 'consumer'
          });
          const flags = selectedLegacy.flags || {};
          const flagStr = [
            flags.counterfeit && 'Counterfeit',
            flags.jackpot && 'Jackpot',
            flags.property && 'Property'
          ]
            .filter(Boolean)
            .join(', ');
          return `
      <div class="ast-detail">
        <div class="ast-detail-visual ast-detail-visual--pop"><img src="${uri}" alt="" draggable="false"/></div>
        <div class="ast-detail-copy">
          <div class="ast-detail-title">${escapeHtml(selectedLegacy.name)}</div>
          <div class="ast-detail-badge">📋 Registered holding</div>
          <p class="ast-detail-desc">${escapeHtml(
            flagStr || 'Recorded in the operator holdings registry.'
          )}</p>
          <table class="ast-detail-table">
            <tr><td>Kind</td><td>${escapeHtml(selectedLegacy.kind || '—')}</td></tr>
            <tr><td>Value (book)</td><td>$${Number(selectedLegacy.valueUsd || 0).toFixed(2)}</td></tr>
            <tr><td>Quality</td><td>${selectedLegacy.quality ?? '—'}%</td></tr>
            <tr><td>Source site</td><td>${escapeHtml(selectedLegacy.sourceSiteId || '—')}</td></tr>
            <tr><td>Stored</td><td>${selectedLegacy.stored ? 'Yes (overflow / warehouse)' : 'Portable'}</td></tr>
            <tr><td>Listed for sale</td><td>${selectedLegacy.listed ? 'Yes' : 'No'}</td></tr>
          </table>
          <div class="ast-detail-actions">
            <button type="button" class="ast-btn ast-btn-warn" data-ast-discard-legacy>Remove from registry</button>
          </div>
          <p class="ast-muted" style="font-size:10px;margin-top:8px;">Removing only clears this registry entry; use carried inventory for shop SKUs you can liquidate or warehouse.</p>
        </div>
      </div>`;
        })()
      : `<div class="ast-detail-placeholder">Select an asset to inspect.</div>`;

    return `<div class="ast-products-layout">
      ${leftCol}
      ${detail}
    </div>`;
  }

  function renderWebsitesSection(projects) {
    if (!projects.length) {
      return `<div class="ast-empty">No WebEx-Publisher projects yet.</div>`;
    }
    return `<table class="ast-table">
      <tr><th>Site</th><th>Shop module</th><th>Published</th></tr>
      ${projects
        .map((p) => {
          const shop = (p.slots || []).some((s) => s.moduleId === 'shop');
          const host = p.lastPublishedHost ? escapeHtml(p.lastPublishedHost) : '—';
          return `<tr>
            <td><b>${escapeHtml(p.siteName || 'Untitled')}</b></td>
            <td>${shop ? '✓ Yes' : '—'}</td>
            <td style="font-size:10px;">${host}</td>
          </tr>`;
        })
        .join('')}
    </table>`;
  }

  function renderPropertiesSection(props) {
    if (!props.length) {
      return `<div class="ast-empty">No titled properties. Purchase warehouse deeds from property tiers when offered.</div>`;
    }
    return `<table class="ast-table">
      <tr><th>Property</th><th>Tier</th><th>Slots</th></tr>
      ${props
        .map((pr) => {
          const tier = PROPERTY_TIERS.find((t) => t.id === pr.tierId);
          return `<tr>
            <td>${escapeHtml(pr.label || pr.id)}</td>
            <td>${escapeHtml(tier?.label || pr.tierId)}</td>
            <td>${(pr.items || []).length}/${pr.maxItems ?? '—'}</td>
          </tr>`;
        })
        .join('')}
    </table>`;
  }

  function renderRentalsSection(units) {
    if (!units.length) {
      return `<div class="ast-empty">No rented storage. Open a warehouse provider on WorldNet.</div>`;
    }
    const elNow = getState().sim?.elapsedMs || 0;
    return units
      .map((u) => {
        const daysLeft = Math.max(0, Math.ceil(((u.paidThroughSimMs || 0) - elNow) / SIM_DAY_MS));
        return `<div class="ast-unit">
          <div class="ast-unit-hdr"><b>${escapeHtml(u.providerName || '')}</b> — ${escapeHtml(u.label)}</div>
          <div class="ast-unit-meta">${daysLeft} days prepaid · ${(u.items || []).length}/${u.maxItems} items · ${
          u.insured ? 'Insured' : 'Uninsured'
        }</div>
        ${
          (u.items || []).length
            ? `<ul class="ast-mini-list">${(u.items || [])
                .map(
                  (it) =>
                    `<li>${escapeHtml(it.name)} · $${(it.unitValue || 0).toFixed(2)} <button type="button" class="ast-btn ast-btn-inline" data-ast-retrieve data-unit="${escapeHtml(u.id)}" data-item="${escapeHtml(it.id)}">Retrieve</button></li>`
                )
                .join('')}</ul>`
            : '<div class="ast-muted">Empty unit.</div>'
        }
      </div>`;
      })
      .join('');
  }

  function renderManifestSection(manifest) {
    if (!manifest.length) return `<div class="ast-empty">No manifest entries.</div>`;
    const TYPE_ICONS = {
      acquired: '📥',
      stored: '📦',
      retrieved: '📤',
      discarded: '🗑️',
      sold: '💰'
    };
    return `
<table class="ast-table ast-manifest">
  <tr><th>Type</th><th>Detail</th><th>Amount</th><th>When</th></tr>
  ${manifest
    .slice(-80)
    .reverse()
    .map(
      (e) => `
<tr>
  <td>${TYPE_ICONS[e.type] || '◆'} ${escapeHtml(String(e.type || '').replace(/_/g, ' '))}</td>
  <td>${escapeHtml(e.itemName || e.provider || '—')}</td>
  <td>${
    e.cost != null
      ? '$' + e.cost.toLocaleString()
      : e.revenue != null
      ? '$' + e.revenue.toLocaleString()
      : '—'
  }</td>
  <td style="color:#666;font-size:10px;">${formatSimTime(e.simMs)}</td>
</tr>`
    )
    .join('')}
</table>`;
  }

  function sellChannel(item, channel) {
    const buyP = computeBuyPrice(item.unitValue || 0, item.category, item.tags || []);
    const sellP = computeSellPrice(buyP, item.condition ?? 100, channel);
    const q = item.quantity || 1;
    const lineTotal = sellP * q;
    const label =
      channel === 'marketplace'
        ? `List on ETradeBay for $${lineTotal.toFixed(2)} total?`
        : channel === 'wholesale'
        ? `Sell wholesale for $${lineTotal.toFixed(2)}?`
        : `Private sale for $${lineTotal.toFixed(2)}?`;
    if (!window.confirm(label)) return;
    const lineValue = (item.unitValue || 0) * q;
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
          amount: lineTotal,
          status: 'in_progress'
        });
      } else {
        s.player = s.player || {};
        s.player.hardCash = (s.player.hardCash || 0) + lineTotal;
      }
      s.playerInventory.manifest = s.playerInventory.manifest || [];
      s.playerInventory.manifest.push({
        type: 'sold',
        itemId: item.id,
        itemName: item.name,
        revenue: lineTotal,
        channel,
        simMs: s.sim?.elapsedMs || 0
      });
      s.playerInventory.totalValue = Math.max(0, (s.playerInventory.totalValue || 0) - lineValue);
      return s;
    });
    recordTransaction(lineTotal, item.category, 'sale');
    try {
      window.ActivityLog?.log?.('SALE', `Sold ${item.name} via ${channel} for $${lineTotal.toFixed(2)}`, {
        notable: true
      });
    } catch {
      /* ignore */
    }
    toast({
      key: `sold_${item.id}`,
      title: 'Sale recorded',
      message: `${item.name} — $${lineTotal.toFixed(2)} (${channel}).`,
      icon: '💰',
      autoDismiss: 4000
    });
    selectedKey = null;
  }

  function formatSimTime(simMs) {
    if (simMs == null) return '—';
    const d = new Date(1262304000000 + simMs);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${d.getUTCHours()}:00`;
  }

  const unsubState = on('stateChanged', () => {
    if (!rootEl.isConnected) {
      unsubState();
      _assetsStateUnsub.delete(rootEl);
      return;
    }
    render();
  });
  _assetsStateUnsub.set(rootEl, unsubState);

  render();
}
