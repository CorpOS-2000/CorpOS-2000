/**
 * market-pulse-page.js — Y2K retro analytics page for Market Pulse.
 * Renders product tracking tables, demand bars, price multipliers, and shortage notices.
 */
import { escapeHtml } from './identity.js';
import { getAllMarketData, priceMultiplier, pickExcuse } from './market-dynamics.js';
import { getState } from './gameState.js';

const MONO = "'Courier New', monospace";

function barHtml(value, max, color) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return `<div style="background:#1a1a1a;width:100%;height:10px;border:1px solid #333;position:relative;">
    <div style="background:${color};width:${pct}%;height:100%;"></div>
  </div>`;
}

function sentimentColor(likes, dislikes) {
  if (likes + dislikes === 0) return '#888';
  const ratio = (likes - dislikes) / (likes + dislikes);
  if (ratio > 0.3) return '#00cc00';
  if (ratio < -0.3) return '#cc3300';
  return '#ccaa00';
}

/**
 * Mount the Market Pulse analytics page into #market-pulse-root.
 */
export function mountMarketPulsePage(root) {
  const container = root.querySelector('#market-pulse-root');
  if (!container) return;

  const data = getAllMarketData();
  const st = getState();

  // Aggregate company data from contentRegistry
  const companies = st.contentRegistry?.companies || [];
  const orders = st.worldNetShopping?.orders || [];

  let html = '';

  // ── Active Shortages Banner ──
  const shortages = data.filter(d => d.shortage?.active);
  if (shortages.length) {
    html += `<div style="background:#330000;border:1px solid #660000;padding:6px;margin-bottom:8px;font-family:${MONO};font-size:10px;color:#ff6600;">
      <b>⚠ ACTIVE SUPPLY DISRUPTIONS</b><br>`;
    for (const s of shortages) {
      html += `<div style="margin-top:3px;">▸ <b style="color:#ffaa00;">#${escapeHtml(s.tag)}</b>: ${escapeHtml(s.shortage.excuse)}</div>`;
    }
    html += `</div>`;
  }

  // ── Product Tracking Table ──
  if (data.length) {
    const maxMentions = Math.max(1, ...data.map(d => d.mentions));
    const maxPurchases = Math.max(1, ...data.map(d => d.purchaseCountWindow));

    html += `<div style="background:#0a0a0a;padding:6px;margin-bottom:8px;">
      <div style="font-family:${MONO};font-size:11px;color:#00cc00;font-weight:bold;margin-bottom:4px;">PRODUCT TRACKING</div>
      <table style="width:100%;border-collapse:collapse;font-family:${MONO};font-size:10px;color:#ccc;">
        <tr style="color:#00aa00;border-bottom:1px solid #333;">
          <th style="text-align:left;padding:2px 4px;">Tag</th>
          <th style="text-align:right;padding:2px 4px;">Mentions</th>
          <th style="text-align:center;padding:2px 4px;width:80px;">Demand</th>
          <th style="text-align:right;padding:2px 4px;">👍</th>
          <th style="text-align:right;padding:2px 4px;">👎</th>
          <th style="text-align:center;padding:2px 4px;width:80px;">Sentiment</th>
          <th style="text-align:right;padding:2px 4px;">Purchases</th>
          <th style="text-align:right;padding:2px 4px;">Price Mod</th>
        </tr>`;

    const sorted = [...data].sort((a, b) => b.mentions - a.mentions);
    for (const d of sorted.slice(0, 30)) {
      const pm = priceMultiplier(d.tag);
      const sColor = sentimentColor(d.likes, d.dislikes);
      const pmColor = pm > 1.05 ? '#00cc00' : pm < 0.95 ? '#cc3300' : '#ccaa00';
      const shortage = d.shortage?.active ? ' 🔴' : '';
      html += `<tr style="border-bottom:1px solid #1a1a1a;">
        <td style="padding:2px 4px;color:#00ccff;">#${escapeHtml(d.tag)}${shortage}</td>
        <td style="text-align:right;padding:2px 4px;">${d.mentions}</td>
        <td style="padding:2px 4px;">${barHtml(d.purchaseCountWindow, maxPurchases, '#00cc00')}</td>
        <td style="text-align:right;padding:2px 4px;color:#00cc00;">${d.likes}</td>
        <td style="text-align:right;padding:2px 4px;color:#cc3300;">${d.dislikes}</td>
        <td style="padding:2px 4px;">${barHtml(d.likes, d.likes + d.dislikes, sColor)}</td>
        <td style="text-align:right;padding:2px 4px;">${d.purchaseCountWindow}</td>
        <td style="text-align:right;padding:2px 4px;color:${pmColor};">${pm.toFixed(2)}x</td>
      </tr>`;
    }
    html += `</table></div>`;
  } else {
    html += `<div style="background:#0a0a0a;padding:12px;text-align:center;font-family:${MONO};font-size:11px;color:#666;margin-bottom:8px;">
      No product data tracked yet. Hashtags (#product) in posts and purchases populate this feed.
    </div>`;
  }

  // ── Company Overview ──
  if (companies.length) {
    html += `<div style="background:#0a0a0a;padding:6px;margin-bottom:8px;">
      <div style="font-family:${MONO};font-size:11px;color:#00cc00;font-weight:bold;margin-bottom:4px;">REGISTERED COMPANIES</div>
      <table style="width:100%;border-collapse:collapse;font-family:${MONO};font-size:10px;color:#ccc;">
        <tr style="color:#00aa00;border-bottom:1px solid #333;">
          <th style="text-align:left;padding:2px 4px;">Company</th>
          <th style="text-align:right;padding:2px 4px;">Valuation</th>
          <th style="text-align:left;padding:2px 4px;">Sector</th>
        </tr>`;
    for (const c of companies.slice(0, 20)) {
      html += `<tr style="border-bottom:1px solid #1a1a1a;">
        <td style="padding:2px 4px;color:#00ccff;">${escapeHtml(c.name || c.id)}</td>
        <td style="text-align:right;padding:2px 4px;">$${Number(c.adjustedValuation || c.totalAssets || 0).toLocaleString()}</td>
        <td style="padding:2px 4px;">${escapeHtml(c.sector || c.industry || '—')}</td>
      </tr>`;
    }
    html += `</table></div>`;
  }

  // ── Recent Orders ──
  if (orders.length) {
    html += `<div style="background:#0a0a0a;padding:6px;margin-bottom:8px;">
      <div style="font-family:${MONO};font-size:11px;color:#00cc00;font-weight:bold;margin-bottom:4px;">RECENT TRANSACTIONS</div>
      <table style="width:100%;border-collapse:collapse;font-family:${MONO};font-size:10px;color:#ccc;">
        <tr style="color:#00aa00;border-bottom:1px solid #333;">
          <th style="text-align:left;padding:2px 4px;">Order</th>
          <th style="text-align:left;padding:2px 4px;">Store</th>
          <th style="text-align:right;padding:2px 4px;">Total</th>
          <th style="text-align:left;padding:2px 4px;">Status</th>
        </tr>`;
    for (const o of orders.slice(-15).reverse()) {
      html += `<tr style="border-bottom:1px solid #1a1a1a;">
        <td style="padding:2px 4px;color:#888;">${escapeHtml(String(o.orderId || o.id || '').slice(0, 12))}</td>
        <td style="padding:2px 4px;">${escapeHtml(o.storeId || '—')}</td>
        <td style="text-align:right;padding:2px 4px;">$${Number(o.total || 0).toFixed(2)}</td>
        <td style="padding:2px 4px;color:${o.delivered ? '#00cc00' : '#ccaa00'};">${o.delivered ? 'Delivered' : 'In Transit'}</td>
      </tr>`;
    }
    html += `</table></div>`;
  }

  // ── Footer ──
  html += `<div style="background:#0a0a0a;padding:4px 8px;font-family:${MONO};font-size:9px;color:#444;text-align:center;border-top:1px solid #333;">
    Market Pulse v1.0 — Data refreshes on page load — &copy; 2000 Hargrove Commerce Bureau
  </div>`;

  container.innerHTML = html;
}
