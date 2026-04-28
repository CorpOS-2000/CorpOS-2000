/**
 * WorldNet HTML for the three Hargrove warehouse / storage sites.
 */
import { escapeHtml } from './identity.js';
import { getState } from './gameState.js';
import {
  WAREHOUSE_PROVIDERS,
  getUnitsByProvider,
  getLiquidationPool,
  getTotalInventoryValue,
  SIM_DAY_MS
} from './warehouse-tick.js';

export function buildWhereAllThingsGoPage() {
  const st = getState();
  const units = getUnitsByProvider('whereallthingsgo');
  const liq = getLiquidationPool();
  const provider = WAREHOUSE_PROVIDERS.whereallthingsgo;
  const simMs = st.sim?.elapsedMs || 0;

  const unitRows = units
    .map((u) => {
      const daysLeft = Math.max(0, (u.paidThroughSimMs - simMs) / SIM_DAY_MS);
      const overdue = simMs > u.paidThroughSimMs;
      return `
<tr style="background:${overdue ? '#ffe8e8' : '#f8f4ec'};">
  <td style="padding:4px 6px;border:1px solid #c0a880;">${escapeHtml(u.label)}</td>
  <td style="padding:4px 6px;border:1px solid #c0a880;text-align:center;">${(u.items || []).length}/${
        u.maxItems
      }</td>
  <td style="padding:4px 6px;border:1px solid #c0a880;text-align:center;color:${overdue ? '#c00' : '#555'};">
    ${overdue ? 'OVERDUE' : Math.ceil(daysLeft) + ' days'}
  </td>
  <td style="padding:4px 6px;border:1px solid #c0a880;">
    <button class="wh-btn" data-wh-pay="${escapeHtml(u.id)}" data-wh-days="7">Pay 7 days ($${u.rentPerDay * 7})</button>
    <button class="wh-btn" data-wh-pay="${escapeHtml(u.id)}" data-wh-days="30">Pay 30 days ($${u.rentPerDay * 30})</button>
    <button class="wh-btn" data-wh-manifest="${escapeHtml(u.id)}">View Items</button>
  </td>
</tr>`;
    })
    .join('');

  const tierButtons = provider.units
    .map(
      (tier) => `
<tr>
  <td style="padding:5px 8px;border:1px solid #c0a880;font-weight:bold;">${escapeHtml(tier.label)}</td>
  <td style="padding:5px 8px;border:1px solid #c0a880;text-align:center;">${tier.maxItems} items</td>
  <td style="padding:5px 8px;border:1px solid #c0a880;text-align:center;">${
        tier.maxValueUsd != null ? '$' + tier.maxValueUsd.toLocaleString() : 'Unlimited'
      }</td>
  <td style="padding:5px 8px;border:1px solid #c0a880;text-align:center;">$${tier.rentPerDay}/day</td>
  <td style="padding:5px 8px;border:1px solid #c0a880;">
    <button class="wh-btn wh-rent-btn" data-wh-provider="whereallthingsgo" data-wh-tier="${escapeHtml(
      tier.id
    )}" data-wh-insure="false">
      Rent ($${tier.rentPerDay * 14} deposit)
    </button>
  </td>
</tr>`
    )
    .join('');

  const liqRows = liq.slice(0, 30).map((item) => {
    const name = String(item.name || 'Unknown');
    return `
<tr>
  <td style="padding:3px 6px;border:1px solid #d0b898;">${escapeHtml(name)}</td>
  <td style="padding:3px 6px;border:1px solid #d0b898;text-align:center;">${escapeHtml(
    item.category || '—'
  )}</td>
  <td style="padding:3px 6px;border:1px solid #d0b898;text-align:right;color:#888;text-decoration:line-through;">$${(item.originalPrice != null
    ? item.originalPrice
    : 0
  ).toFixed(2)}</td>
  <td style="padding:3px 6px;border:1px solid #d0b898;text-align:right;color:#993300;font-weight:bold;">$${(item.listPrice != null
    ? item.listPrice
    : 0
  ).toFixed(2)}</td>
  <td style="padding:3px 6px;border:1px solid #d0b898;">
    <button class="wh-btn wh-buy-liq" data-liq-id="${escapeHtml(
      String(item.id || item.productRef || '')
    )}" data-liq-name="${escapeHtml(
      name
    )}" data-liq-price="${(item.listPrice != null ? item.listPrice : 0).toFixed(2)}" data-liq-orig="${(item.originalPrice != null
      ? item.originalPrice
      : 0
    ).toFixed(2)}">Buy</button>
  </td>
</tr>`;
  }).join('');

  return `<div class="iebody" data-wn-ad-page="warehouse">
<div style="text-align:center;margin-bottom:10px;">
  <div style="font-size:28px;font-weight:bold;color:#663300;font-family:Georgia,serif;">WhereAllThingsGo.net</div>
  <div style="font-size:12px;color:#555;">Hargrove's Premier Self-Storage &amp; Liquidation Outlet</div>
  <div style="font-size:10px;color:#888;">1400 Warehouse Row, Southside Industrial — Hargrove, CA 94526 (559) 400-1400</div>
  <div style="font-size:10px;color:#993300;margin-top:4px;">Cash only. No insurance. No climate control. No questions.</div>
</div>
<hr style="border:none;border-top:2px solid #c0a880;margin:10px 0;">

${units.length ? `
<div style="font-weight:bold;color:#663300;margin-bottom:6px;">Your Units</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:14px;">
  <tr style="background:#d4a878;color:#fff;">
    <th style="padding:4px 6px;">Unit</th><th style="padding:4px 6px;">Items</th>
    <th style="padding:4px 6px;">Expires</th><th style="padding:4px 6px;">Actions</th>
  </tr>
  ${unitRows}
</table>` : '<p style="color:#888;font-size:11px;margin-bottom:12px;">You have no units rented here.</p>'}

<div style="font-weight:bold;color:#663300;margin-bottom:6px;">Rent a Unit</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
  <tr style="background:#d4a878;color:#fff;">
    <th style="padding:5px 8px;">Size</th><th style="padding:5px 8px;">Capacity</th>
    <th style="padding:5px 8px;">Max Value</th><th style="padding:5px 8px;">Daily Rate</th><th style="padding:5px 8px;">Action</th>
  </tr>
  ${tierButtons}
</table>

${
  liq.length
    ? `
<hr style="border:none;border-top:1px solid #c0a880;margin:14px 0 10px;">
<div style="font-weight:bold;color:#993300;margin-bottom:6px;">
  Liquidation Outlet
  <span style="font-size:10px;font-weight:normal;color:#888;margin-left:8px;">${liq.length} items at markdown · NPC buyers visit daily</span>
</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;">
  <tr style="background:#c09060;color:#fff;">
    <th style="padding:3px 6px;">Item</th><th style="padding:3px 6px;">Category</th>
    <th style="padding:3px 6px;">Was</th><th style="padding:3px 6px;">Now</th><th style="padding:3px 6px;">Buy</th>
  </tr>
  ${liqRows}
</table>
${liq.length > 30 ? `<p style="font-size:10px;color:#888;margin-top:4px;">...and ${liq.length - 30} more items</p>` : ''}`
    : ''
}

<div style="margin-top:14px;background:#f0e8d8;border:1px solid #c0a880;padding:8px;font-size:10px;color:#555;">
  <b>Policy:</b> Units not renewed within the posted grace period are repossessed. WATG lists contents at clearance prices. NPC buyers may purchase daily. Proceeds go to your cash.
</div>
<p style="font-size:10px;color:#666;margin-top:10px;">
  <a data-nav="hargrove_vault" href="#">HargroveVault</a> &nbsp;|&nbsp;
  <a data-nav="stor_it" href="#">StorIt Hargrove</a> &nbsp;|&nbsp;
  <a data-nav="market_pulse" href="#">Market Pulse</a> &nbsp;|&nbsp;
  <a data-nav="home" href="#">Wahoo! Home</a>
</p>
<div id="wh-manifest-modal"></div>
</div>`;
}

export function buildHargroveVaultPage() {
  const units = getUnitsByProvider('hargroVault');
  const provider = WAREHOUSE_PROVIDERS.hargroVault;
  const st = getState();
  const simMs = st.sim?.elapsedMs || 0;

  const unitRows = units
    .map((u) => {
      const daysLeft = Math.max(0, (u.paidThroughSimMs - simMs) / SIM_DAY_MS);
      const v = (u.items || []).reduce((s, i) => s + (i.unitValue || 0) * (i.quantity || 1), 0);
      return `
<tr>
  <td style="padding:6px 10px;border-bottom:1px solid #d0d8f0;">${escapeHtml(u.label)}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #d0d8f0;text-align:center;">${(u.items || []).length}/${
        u.maxItems
      }</td>
  <td style="padding:6px 10px;border-bottom:1px solid #d0d8f0;text-align:right;">$${v.toLocaleString()}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #d0d8f0;text-align:center;">${u.insured ? 'Insured' : '—'}</td>
  <td style="padding:6px 10px;border-bottom:1px solid #d0d8f0;text-align:center;color:${
    daysLeft < 7 && daysLeft >= 0 ? '#cc0000' : '#333'
  };">${Math.ceil(daysLeft)} days</td>
  <td style="padding:6px 10px;border-bottom:1px solid #d0d8f0;">
    <button class="wh-btn wh-vault-btn" data-wh-pay="${escapeHtml(u.id)}" data-wh-days="30">Extend 30 days</button>
    <button class="wh-btn" data-wh-manifest="${escapeHtml(u.id)}">Items</button>
  </td>
</tr>`;
    })
    .join('');

  const tierRows = provider.units
    .map(
      (tier) => `
<tr>
  <td style="padding:8px 10px;border-bottom:1px solid #d0d8f0;font-weight:bold;">${escapeHtml(tier.label)}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #d0d8f0;text-align:center;">${tier.maxItems}</td>
  <td style="padding:8px 10px;border-bottom:1px solid #d0d8f0;text-align:right;">${
    tier.maxValueUsd ? '$' + tier.maxValueUsd.toLocaleString() : 'Unlimited'
  }</td>
  <td style="padding:8px 10px;border-bottom:1px solid #d0d8f0;text-align:right;">$${tier.rentPerDay}/day</td>
  <td style="padding:8px 10px;border-bottom:1px solid #d0d8f0;">
    <button class="wh-btn wh-vault-btn wh-rent-btn" data-wh-provider="hargroVault" data-wh-tier="${escapeHtml(
      tier.id
    )}" data-wh-insure="false">
      Rent $${(tier.rentPerDay * 14).toLocaleString()} dep.
    </button>
    <button class="wh-btn wh-vault-btn wh-rent-btn" data-wh-provider="hargroVault" data-wh-tier="${escapeHtml(
      tier.id
    )}" data-wh-insure="true">
      + Insurance (+${Math.round((provider.insurancePremiumPct || 0) * 100)}%)
    </button>
  </td>
</tr>`
    )
    .join('');

  return `<div class="iebody hv-body" data-wn-ad-page="hargrove_vault">
<div style="text-align:center;padding:20px 0 12px;background:linear-gradient(to bottom,#0a246a,#1a3a8f);color:white;margin:-8px -8px 16px;">
  <div style="font-size:26px;font-weight:bold;letter-spacing:2px;">HARGROVE VAULT</div>
  <div style="font-size:11px;opacity:0.8;margin-top:4px;">Climate-Controlled Insured 24-Hour Monitored Financial District</div>
  <div style="font-size:10px;opacity:0.6;margin-top:2px;">200 Executive Drive (559) 200-8282</div>
</div>

<div style="display:flex;gap:12px;margin-bottom:16px;font-size:11px;">
  <div style="flex:1;padding:10px;background:#f0f4ff;border:1px solid #c0d0f0;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#0a246a;">${units.length}</div>
    <div style="color:#888;">Active Units</div>
  </div>
  <div style="flex:1;padding:10px;background:#f0f4ff;border:1px solid #c0d0f0;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#0a246a;">$${getTotalInventoryValue().toLocaleString()}</div>
    <div style="color:#888;">Total Inventory Value</div>
  </div>
  <div style="flex:1;padding:10px;background:#f0f4ff;border:1px solid #c0d0f0;text-align:center;">
    <div style="font-size:18px;font-weight:bold;color:#006600;">80%</div>
    <div style="color:#888;">Insurance (insured units)</div>
  </div>
</div>

${
  units.length
    ? `
<div style="font-weight:bold;color:#0a246a;margin-bottom:6px;font-size:13px;">Your Vault Units</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:20px;">
  <tr style="background:#0a246a;color:white;">
    <th style="padding:6px 10px;">Unit</th><th style="padding:6px 10px;">Items</th>
    <th style="padding:6px 10px;">Est. Value</th><th style="padding:6px 10px;">Insurance</th>
    <th style="padding:6px 10px;">Expires</th><th style="padding:6px 10px;">Manage</th>
  </tr>
  ${unitRows}
</table>`
    : ''
}

<div style="font-weight:bold;color:#0a246a;margin-bottom:8px;font-size:13px;">Reserve a Unit</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
  <tr style="background:#0a246a;color:white;">
    <th style="padding:8px 10px;">Unit Type</th><th style="padding:8px 10px;">Capacity</th>
    <th style="padding:8px 10px;">Value Limit</th><th style="padding:8px 10px;">Daily Rate</th><th style="padding:8px 10px;">Reserve</th>
  </tr>
  ${tierRows}
</table>

<div style="background:#e8f0e8;border:1px solid #a0c0a0;padding:10px;font-size:10px;color:#224422;margin-bottom:12px;">
  <b>Guarantee:</b> Insured vault items may be reimbursed up to 80% of value if damaged. Past-due units may be sent to the weekly auction; net proceeds (after fees) are deposited to your FNCB account.
</div>
<p style="font-size:10px;color:#666;">
  <a data-nav="warehouse" href="#">WhereAllThingsGo</a> &nbsp;|&nbsp;
  <a data-nav="stor_it" href="#">StorIt Hargrove</a> &nbsp;|&nbsp;
  <a data-nav="market_pulse" href="#">Market Pulse</a>
</p>
</div>`;
}

export function buildStorItPage() {
  const units = getUnitsByProvider('storIt');
  const provider = WAREHOUSE_PROVIDERS.storIt;
  const st = getState();
  const simMs = st.sim?.elapsedMs || 0;

  const locationList = (provider.locations || [])
    .map(
      (l) =>
        `<li style="font-size:11px;margin:3px 0;">District ${l.district}: ${escapeHtml(l.address)}</li>`
    )
    .join('');

  const tierCards = provider.units
    .map(
      (tier) => `
<div style="border:2px solid #e85d04;padding:10px;background:#fff;flex:1;min-width:140px;">
  <div style="font-weight:bold;color:#e85d04;font-size:12px;">${escapeHtml(tier.label)}</div>
  <div style="font-size:10px;color:#666;margin:4px 0;">Up to ${tier.maxItems} items</div>
  <div style="font-size:10px;color:#666;">Max $${tier.maxValueUsd != null ? tier.maxValueUsd.toLocaleString() : 'Unlimited'}</div>
  <div style="font-size:14px;font-weight:bold;color:#333;margin:8px 0;">$${tier.rentPerDay}/day</div>
  <button class="wh-btn wh-storit-btn wh-rent-btn"
    data-wh-provider="storIt" data-wh-tier="${escapeHtml(tier.id)}" data-wh-insure="false">Rent</button>
  <button class="wh-btn wh-storit-btn wh-rent-btn"
    data-wh-provider="storIt" data-wh-tier="${escapeHtml(
      tier.id
    )}" data-wh-insure="true"
    style="margin-top:4px;background:#e85d04;color:white;border-color:#c04a00;">+ Ins (+${Math.round(
    (provider.insurancePremiumPct || 0) * 100
  )}%)</button>
</div>`
    )
    .join('');

  const unitRows = units
    .map((u) => {
      const daysLeft = Math.max(0, Math.ceil((u.paidThroughSimMs - simMs) / SIM_DAY_MS));
      return `
<tr>
  <td style="padding:5px 8px;border-bottom:1px solid #f0d8c0;">${escapeHtml(u.label)}</td>
  <td style="padding:5px 8px;border-bottom:1px solid #f0d8c0;text-align:center;">${(u.items || []).length}/${
        u.maxItems
      }</td>
  <td style="padding:5px 8px;border-bottom:1px solid #f0d8c0;text-align:center;">${daysLeft} days</td>
  <td style="padding:5px 8px;border-bottom:1px solid #f0d8c0;text-align:center;">${u.insured ? 'Yes' : '—'}</td>
  <td style="padding:5px 8px;border-bottom:1px solid #f0d8c0;">
    <button class="wh-btn wh-storit-btn" data-wh-pay="${escapeHtml(u.id)}" data-wh-days="30">Extend 30d</button>
    <button class="wh-btn" data-wh-manifest="${escapeHtml(u.id)}">Items</button>
  </td>
</tr>`;
    })
    .join('');

  return `<div class="iebody" data-wn-ad-page="stor_it">
<div style="background:#e85d04;color:white;padding:14px 16px;margin:-8px -8px 16px;">
  <div style="font-size:24px;font-weight:bold;">StorIt Hargrove</div>
  <div style="font-size:11px;opacity:0.85;margin-top:3px;">4 locations Business inventory online accounts</div>
</div>

<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
  ${tierCards}
</div>

${
  units.length
    ? `
<div style="font-weight:bold;color:#e85d04;margin-bottom:6px;">Your StorIt Units</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px;">
  <tr style="background:#e85d04;color:white;">
    <th style="padding:5px 8px;">Unit</th><th style="padding:5px 8px;">Items</th>
    <th style="padding:5px 8px;">Time Left</th><th style="padding:5px 8px;">Insured</th><th style="padding:5px 8px;">Actions</th>
  </tr>
  ${unitRows}
</table>`
    : ''
}

<div style="background:#fff8f0;border:1px solid #f0c080;padding:10px;font-size:11px;margin-bottom:12px;">
  <b style="color:#e85d04;">Locations</b>
  <ul style="margin:6px 0 0 16px;padding:0;">${locationList}</ul>
</div>

<div style="font-size:10px;color:#666;background:#fff8f0;border:1px solid #f0c080;padding:8px;">
  <b>StorIt Policy:</b> Past-due units may be repossessed; business inventory and manifests supported. Optional insurance may cover 80% on eligible items.
</div>

<p style="font-size:10px;color:#666;margin-top:10px;">
  <a data-nav="warehouse" href="#">WhereAllThingsGo</a> &nbsp;|&nbsp;
  <a data-nav="hargrove_vault" href="#">HargroveVault</a> &nbsp;|&nbsp;
  <a data-nav="bizreg" href="#">Business Registry</a>
</p>
</div>`;
}
