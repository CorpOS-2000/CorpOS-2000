/**
 * ETradeBay.com — Y2K online brokerage (WorldNet)
 */
import { getState } from './gameState.js';
import { escapeHtml } from './identity.js';
import { getEconomySummary } from './economy.js';

/**
 * @param {string} subpath
 * @param {(k: string, s?: string, o?: object) => void} navigate
 */
export function buildETradeBayPage(subpath = '', navigate) {
  const st = getState();
  const acct = st.etradeAccount || null;
  const sp = String(subpath || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');

  if (!acct) return renderETradeBayLanding(navigate);

  if (!sp || sp === 'home') return renderETradeBayHome(st, acct, navigate);
  if (sp === 'portfolio') return renderETradeBayPortfolio(st, acct, navigate);
  if (sp.startsWith('stock/')) return renderETradeBayStock(st, acct, sp.replace(/^stock\//, ''), navigate);
  if (sp === 'order-history') return renderETradeBayOrders(st, acct, navigate);
  if (sp === 'market') return renderETradeBayMarket(st, acct, navigate);
  return renderETradeBayHome(st, acct, navigate);
}

function etLink(sub, label) {
  return `<a data-nav="etrade_bay" data-wnet-subpath="${escapeHtml(sub)}" href="#">${escapeHtml(label)}</a>`;
}

function etMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

export function computeETradeStockPrice(company) {
  const base = (company.marketCap || 1_000_000) / Math.max(1, (company.employeeCount || 1) * 100);
  const sentMod = 0.5 + (company.publicSentiment || 60) / 100;
  return Math.max(1, base * sentMod);
}

function renderETradeBayLanding(_navigate) {
  return `<div class="iebody et-body">
<div class="et-masthead">
  <div class="et-logo">📈 E·Trade·Bay 2000</div>
  <div class="et-tagline">Online Investing for the Modern Operator</div>
  <div class="et-sub">Trade Hargrove's hottest companies from your CorpOS desktop</div>
</div>
<div class="et-landing-cols">
  <div class="et-register-box">
    <div class="et-box-title">Open a Free Account</div>
    <div class="et-form-group">
      <label class="et-label" for="et-reg-name">Full Name</label>
      <input type="text" class="et-input" id="et-reg-name" placeholder="Your full legal name" autocomplete="off">
    </div>
    <div class="et-form-group">
      <label class="et-label" for="et-reg-email">JeeMail Address</label>
      <input type="text" class="et-input" id="et-reg-email" placeholder="you@jeemail.com" autocomplete="off">
    </div>
    <div class="et-form-group">
      <label class="et-label" for="et-reg-user">Username</label>
      <input type="text" class="et-input" id="et-reg-user" placeholder="Choose a username" autocomplete="off">
    </div>
    <div class="et-form-group">
      <label class="et-label" for="et-reg-pass">Password</label>
      <input type="password" class="et-input" id="et-reg-pass" placeholder="8+ characters" autocomplete="off">
    </div>
    <div class="et-form-group">
      <label class="et-label" for="et-reg-deposit">Initial Deposit</label>
      <input type="number" class="et-input" id="et-reg-deposit" placeholder="Minimum 500" min="500" value="500">
      <div class="et-hint">Funds transferred from your FNCB checking account</div>
    </div>
    <div class="et-form-group">
      <label class="et-label" for="et-reg-risk">Risk Tolerance</label>
      <select class="et-input" id="et-reg-risk">
        <option value="conservative">Conservative (bonds + blue chip)</option>
        <option value="moderate" selected>Moderate (balanced portfolio)</option>
        <option value="aggressive">Aggressive (growth + speculative)</option>
      </select>
    </div>
    <div class="et-form-group">
      <label style="display:flex;align-items:flex-start;gap:6px;cursor:pointer;">
        <input type="checkbox" id="et-reg-terms" style="margin-top:2px">
        <span class="et-hint">I agree to the ETradeBay Terms of Service and acknowledge that trading involves risk. Past performance is not indicative of future results. ETradeBay is not a registered broker-dealer.</span>
      </label>
    </div>
    <button type="button" class="et-btn et-btn-primary" data-action="etradebay-register">Open Account →</button>
    <div id="et-reg-error" class="et-error" style="display:none;"></div>
  </div>
  <div class="et-market-preview">
    <div class="et-box-title">Today's Market Snapshot</div>
    ${renderMarketTicker()}
    <div style="margin-top:12px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:8px;">
      Already have an account? ${etLink('home', 'Sign in')}
    </div>
  </div>
</div>
</div>`;
}

function renderMarketTicker() {
  const st = getState();
  const rivals = st.rivalCompanies || [];
  const rows = rivals.slice(0, 8).map((c) => {
    const price = computeETradeStockPrice(c);
    const change = ((Math.random() - 0.45) * 8).toFixed(2);
    const changeNum = Number(change);
    return `<tr>
  <td class="et-ticker-sym">${escapeHtml(c.ticker || c.id.toUpperCase().slice(0, 4))}</td>
  <td class="et-ticker-name">${escapeHtml(c.tradingName)}</td>
  <td class="et-ticker-price">$${price.toFixed(2)}</td>
  <td class="et-ticker-change" style="color:${changeNum >= 0 ? '#006600' : '#cc0000'}">
    ${changeNum >= 0 ? '▲' : '▼'} ${Math.abs(changeNum).toFixed(2)}%
  </td>
</tr>`;
  }).join('');
  return `<table class="et-ticker-table">
  <tr class="et-ticker-hdr"><th>Ticker</th><th>Company</th><th>Price</th><th>Change</th></tr>
  ${rows}
</table>`;
}

function renderETradeBayHome(st, acct, _navigate) {
  const econ = getEconomySummary();
  const rivals = st.rivalCompanies || [];

  return `<div class="iebody et-body">
<div class="et-topbar">
  <div class="et-logo-sm">📈 ETradeBay</div>
  <nav class="et-nav">
    ${etLink('home', 'Home')}
    ${etLink('portfolio', 'Portfolio')}
    ${etLink('market', 'Market')}
    ${etLink('order-history', 'Orders')}
  </nav>
  <div class="et-acct-bar">
    <span>Welcome, ${escapeHtml(acct.username)}</span>
    <span class="et-bal">Cash: ${etMoney(acct.cashBalance)}</span>
  </div>
</div>
<div class="et-econ-bar">
  <div class="et-econ-stat"><div class="et-econ-label">GDP Index</div><div class="et-econ-val">${econ.gdpTrend} ${econ.gdpIndex.toFixed(1)}</div></div>
  <div class="et-econ-stat"><div class="et-econ-label">Consumer Conf.</div><div class="et-econ-val">${econ.confidence.toFixed(0)}</div></div>
  <div class="et-econ-stat"><div class="et-econ-label">Inflation</div><div class="et-econ-val">${econ.inflation}</div></div>
  <div class="et-econ-stat"><div class="et-econ-label">Unemployment</div><div class="et-econ-val">${econ.unemployment}</div></div>
  <div class="et-econ-stat"><div class="et-econ-label">Dot-Com Phase</div><div class="et-econ-val" style="color:${econ.bubbleWarning ? '#cc0000' : '#006600'}">${String(
    econ.dotComPhase
  ).toUpperCase()}</div></div>
  <div class="et-econ-stat"><div class="et-econ-label">Hargrove GDP</div><div class="et-econ-val">${econ.hargroveGdp}</div></div>
</div>
<div class="et-section-title">Hargrove Exchange — All Listed Companies</div>
<table class="et-market-table">
  <tr class="et-market-hdr">
    <th>Ticker</th><th>Company</th><th>Sector</th>
    <th>Price</th><th>Mkt Cap</th><th>Sentiment</th>
    <th>Volume</th><th>Trade</th>
  </tr>
  ${rivals
    .map((c) => {
      const price = computeETradeStockPrice(c);
      const owned = (acct.holdings || []).find((h) => h.companyId === c.id);
      const sentColor = c.publicSentiment > 65 ? '#006600' : c.publicSentiment < 40 ? '#cc0000' : '#886600';
      const disrupted = c.supplyDisrupted ? ' ⛔' : '';
      const flagged = c.underInvestigation ? ' ⚠' : '';
      return `<tr class="et-market-row">
  <td class="et-sym">${etLink(`stock/${c.id}`, c.ticker || c.id.slice(0, 4).toUpperCase())}</td>
  <td>${escapeHtml(c.tradingName)}${disrupted}${flagged}</td>
  <td class="et-sector">${escapeHtml(c.sector || '')}</td>
  <td class="et-price">$${price.toFixed(2)}</td>
  <td>$${((c.marketCap || 0) / 1e6).toFixed(1)}M</td>
  <td style="color:${sentColor}">${c.publicSentiment || 60}/100</td>
  <td>${((c.employeeCount || 0) * Math.floor(price * 10)).toLocaleString()}</td>
  <td>
    <button type="button" class="et-btn et-btn-buy" data-et-buy="${escapeHtml(c.id)}" data-et-price="${price.toFixed(2)}">Buy</button>
    ${owned ? `<button type="button" class="et-btn et-btn-sell" data-et-sell="${escapeHtml(c.id)}" data-et-price="${price.toFixed(2)}">Sell</button>` : ''}
  </td>
</tr>`;
    })
    .join('')}
</table>
<div class="et-disclaimer">ETradeBay is a simulated trading platform operating within CorpOS 2000. Operator accounts are monitored under Mandate 2000-CR7. All transactions are logged to your Activity Record.</div>
</div>`;
}

function renderETradeBayPortfolio(st, acct, _navigate) {
  const holdings = acct.holdings || [];
  const rivals = st.rivalCompanies || [];
  let totalValue = 0;
  let totalCost = 0;
  const rows = holdings
    .map((h) => {
      const company = rivals.find((c) => c.id === h.companyId);
      if (!company) return '';
      const currentP = computeETradeStockPrice(company);
      const curValue = currentP * h.shares;
      const costBasis = h.avgCostBasis * h.shares;
      const pnl = curValue - costBasis;
      const pnlPct = ((pnl / (costBasis || 1)) * 100).toFixed(1);
      totalValue += curValue;
      totalCost += costBasis;
      return `<tr class="et-market-row">
  <td class="et-sym">${etLink(`stock/${company.id}`, company.ticker || company.id.slice(0, 4).toUpperCase())}</td>
  <td>${escapeHtml(company.tradingName)}</td>
  <td>${h.shares}</td>
  <td>$${h.avgCostBasis.toFixed(2)}</td>
  <td>$${currentP.toFixed(2)}</td>
  <td>$${curValue.toFixed(2)}</td>
  <td style="color:${pnl >= 0 ? '#006600' : '#cc0000'}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnlPct}%)</td>
  <td>
    <button type="button" class="et-btn et-btn-sell" data-et-sell="${escapeHtml(company.id)}" data-et-price="${currentP.toFixed(2)}">Sell</button>
  </td>
</tr>`;
    })
    .filter(Boolean)
    .join('');

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(1) : '0.0';

  return `<div class="iebody et-body">
<div class="et-topbar">
  <div class="et-logo-sm">📈 ETradeBay</div>
  <nav class="et-nav">${etLink('home', 'Home')} ${etLink('portfolio', 'Portfolio')} ${etLink('market', 'Market')} ${etLink(
    'order-history',
    'Orders'
  )}</nav>
  <div class="et-acct-bar"><span>Cash: ${etMoney(acct.cashBalance)}</span></div>
</div>
<div class="et-portfolio-summary">
  <div class="et-port-stat"><div class="et-port-label">Portfolio Value</div><div class="et-port-val">$${totalValue.toFixed(2)}</div></div>
  <div class="et-port-stat"><div class="et-port-label">Cost Basis</div><div class="et-port-val">$${totalCost.toFixed(2)}</div></div>
  <div class="et-port-stat"><div class="et-port-label">Total P&L</div>
    <div class="et-port-val" style="color:${totalPnl >= 0 ? '#006600' : '#cc0000'}">
      ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnl >= 0 ? '+' : ''}${totalPnlPct}%)
    </div>
  </div>
  <div class="et-port-stat"><div class="et-port-label">Cash</div><div class="et-port-val">${etMoney(acct.cashBalance)}</div></div>
  <div class="et-port-stat"><div class="et-port-label">Total Assets</div><div class="et-port-val">$${(totalValue + (acct.cashBalance || 0)).toFixed(2)}</div></div>
</div>
${
  holdings.length
    ? `<div class="et-section-title">Holdings</div>
<table class="et-market-table">
  <tr class="et-market-hdr">
    <th>Ticker</th><th>Company</th><th>Shares</th><th>Avg Cost</th>
    <th>Current</th><th>Mkt Value</th><th>P&L</th><th>Action</th>
  </tr>
  ${rows}
</table>`
    : `<div class="et-empty">No holdings. ${etLink('home', 'Browse the market')} to start investing.</div>`
}
</div>`;
}

function renderETradeBayStock(st, acct, companyId, _navigate) {
  const company = (st.rivalCompanies || []).find((c) => c.id === companyId);
  if (!company) return `<div class="iebody et-body"><p>Company not found. ${etLink('home', 'Back to Market')}</p></div>`;

  const price = computeETradeStockPrice(company);
  const owned = (acct.holdings || []).find((h) => h.companyId === companyId);
  const products = (st.rivalProducts || []).filter((p) => p.companyId === companyId).slice(0, 5);
  const news = (st.newsRegistry || [])
    .filter(
      (n) =>
        (n.tags || []).includes(companyId) ||
        (n.namedActors || []).some((a) => a && company.currentCEO && a === company.currentCEO)
    )
    .slice(-5)
    .reverse();

  return `<div class="iebody et-body">
<div class="et-topbar">
  <div class="et-logo-sm">📈 ETradeBay</div>
  <nav class="et-nav">${etLink('home', '◀ Market')} ${etLink('portfolio', 'Portfolio')}</nav>
  <div class="et-acct-bar"><span>Cash: ${etMoney(acct.cashBalance)}</span></div>
</div>
<div class="et-stock-header">
  <div>
    <div class="et-stock-name">${escapeHtml(company.tradingName)}</div>
    <div class="et-stock-ticker">${escapeHtml(company.ticker || companyId.toUpperCase())}</div>
    <div class="et-stock-sector">${escapeHtml(company.sector || '')} · ${escapeHtml(company.headquarters || '')}</div>
  </div>
  <div class="et-stock-price-block">
    <div class="et-stock-price">$${price.toFixed(2)}</div>
    <div class="et-stock-mktcap">Mkt Cap: $${((company.marketCap || 0) / 1e6).toFixed(1)}M</div>
  </div>
</div>
<div class="et-stock-metrics">
  <div class="et-metric"><span class="et-metric-label">Revenue</span> $${((company.annualRevenue || 0) / 1e6).toFixed(1)}M</div>
  <div class="et-metric"><span class="et-metric-label">Employees</span> ${(company.employeeCount || 0).toLocaleString()}</div>
  <div class="et-metric"><span class="et-metric-label">Sentiment</span> ${company.publicSentiment}/100</div>
  <div class="et-metric"><span class="et-metric-label">Compliance</span> ${(company.complianceFlags || 0) > 0 ? `⚠ ${company.complianceFlags} flags` : '✓ Clean'}</div>
  <div class="et-metric"><span class="et-metric-label">Investigation</span> ${company.underInvestigation ? '⚠ Under review' : '—'}</div>
  <div class="et-metric"><span class="et-metric-label">Supply</span> ${company.supplyDisrupted ? '⛔ Disrupted' : '✓ Normal'}</div>
</div>
<div class="et-two-col et-stock-two-col" data-et-stock-root data-et-stock-price="${price.toFixed(2)}" data-et-stock-id="${escapeHtml(companyId)}">
  <div class="et-trade-box">
    <div class="et-box-title">Trade ${escapeHtml(company.ticker || company.id.toUpperCase().slice(0, 4))}</div>
    <div class="et-trade-price">Current: $${price.toFixed(2)} / share</div>
    <div class="et-form-group">
      <label class="et-label" for="et-trade-qty">Shares</label>
      <input type="number" class="et-input" id="et-trade-qty" value="1" min="1">
    </div>
    <div class="et-form-group">
      <div class="et-label">Estimated Total</div>
      <div class="et-trade-total" id="et-trade-total">$${price.toFixed(2)}</div>
    </div>
    <div class="et-trade-btns">
      <button type="button" class="et-btn et-btn-buy" data-et-buy="${escapeHtml(companyId)}" data-et-price="${price.toFixed(
    2
  )}" data-et-use-qty="true">Buy</button>
      ${
        owned
          ? `<button type="button" class="et-btn et-btn-sell" data-et-sell="${escapeHtml(companyId)}" data-et-price="${price.toFixed(
              2
            )}" data-et-use-qty="true">Sell</button>`
          : ''
      }
    </div>
    ${
      owned
        ? `<div class="et-owned">You own ${owned.shares} shares (avg $${owned.avgCostBasis.toFixed(2)})</div>`
        : ''
    }
    <div class="et-trade-disclaimer">Market orders execute at current price. ETradeBay does not guarantee fills during high volatility periods.</div>
  </div>
  <div class="et-company-desc">
    <div class="et-box-title">Company Overview</div>
    <p class="et-desc-text">${escapeHtml(company.description || '')}</p>
    ${
      products.length
        ? `<div class="et-box-title" style="margin-top:12px;">Key Products</div>
    <ul class="et-product-list">
      ${products.map((p) => `<li>${escapeHtml(p.name)} — $${(p.priceUsd || 0).toFixed(2)}</li>`).join('')}
    </ul>`
        : ''
    }
  </div>
</div>
${
  news.length
    ? `<div class="et-section-title">Recent News</div>
${news
  .map(
    (n) => `<div class="et-news-row">
  <div class="et-news-headline">${escapeHtml(n.headline)}</div>
  <div class="et-news-meta">Severity ${n.severity} · ${escapeHtml(n.category || '')}</div>
</div>`
  )
  .join('')}`
    : ''
}
</div>`;
}

function renderETradeBayOrders(st, acct, _navigate) {
  const orders = acct.orderHistory || [];
  return `<div class="iebody et-body">
<div class="et-topbar">
  <div class="et-logo-sm">📈 ETradeBay</div>
  <nav class="et-nav">${etLink('home', 'Home')} ${etLink('portfolio', 'Portfolio')}</nav>
  <div class="et-acct-bar"><span>Cash: ${etMoney(acct.cashBalance)}</span></div>
</div>
<div class="et-section-title">Order History</div>
${
  orders.length
    ? `<table class="et-market-table">
  <tr class="et-market-hdr">
    <th>Date</th><th>Company</th><th>Type</th><th>Shares</th><th>Price</th><th>Total</th><th>Status</th>
  </tr>
  ${orders
    .slice(-30)
    .reverse()
    .map(
      (o) => `<tr class="et-market-row">
  <td style="color:#888;font-size:10px;">${new Date(1262304000000 + (o.simMs || 0)).toLocaleDateString()}</td>
  <td>${escapeHtml(o.companyName)}</td>
  <td style="color:${o.type === 'buy' ? '#006600' : '#cc0000'}">${String(o.type || '').toUpperCase()}</td>
  <td>${o.shares}</td>
  <td>$${Number(o.price || 0).toFixed(2)}</td>
  <td>$${Number(o.total || 0).toFixed(2)}</td>
  <td style="color:#006600">✓ Filled</td>
</tr>`
    )
    .join('')}
</table>`
    : `<div class="et-empty">No orders yet. ${etLink('home', 'Start trading')}.</div>`
}
</div>`;
}

function renderETradeBayMarket(_st, acct, _navigate) {
  const econ = getEconomySummary();
  return `<div class="iebody et-body">
<div class="et-topbar">
  <div class="et-logo-sm">📈 ETradeBay</div>
  <nav class="et-nav">${etLink('home', 'Home')} ${etLink('portfolio', 'Portfolio')} ${etLink('market', 'Market')}</nav>
  <div class="et-acct-bar"><span>Cash: ${etMoney(acct.cashBalance)}</span></div>
</div>
<div class="et-section-title">Hargrove Economic Overview — January 2000</div>
<div class="et-econ-grid">
  <div class="et-econ-card"><div class="et-ec-title">GDP Index</div><div class="et-ec-val">${econ.gdpTrend} ${econ.gdpIndex.toFixed(
    1
  )}</div><div class="et-ec-desc">Base 100 = Jan 1, 2000</div></div>
  <div class="et-econ-card"><div class="et-ec-title">Consumer Confidence</div><div class="et-ec-val">${econ.confidence.toFixed(
    0
  )}</div><div class="et-ec-desc">0 = recession · 100 = euphoria</div></div>
  <div class="et-econ-card"><div class="et-ec-title">Inflation Rate</div><div class="et-ec-val">${econ.inflation}</div><div class="et-ec-desc">Annual CPI estimate</div></div>
  <div class="et-econ-card"><div class="et-ec-title">Unemployment</div><div class="et-ec-val">${econ.unemployment}</div><div class="et-ec-desc">Hargrove Metro Area</div></div>
  <div class="et-econ-card" style="border-color:${econ.bubbleWarning ? '#cc0000' : '#ddd'}">
    <div class="et-ec-title">Dot-Com Phase</div>
    <div class="et-ec-val" style="color:${econ.bubbleWarning ? '#cc0000' : '#006600'}">${String(
    econ.dotComPhase
  ).toUpperCase()}</div>
    <div class="et-ec-desc">${
      econ.bubbleWarning ? 'Warning: Market correction risk elevated' : 'Tech sector performing strongly'
    }</div>
  </div>
  <div class="et-econ-card"><div class="et-ec-title">Local Economy</div><div class="et-ec-val">${
    econ.hargroveGdp
  }</div><div class="et-ec-desc">Hargrove Metro GDP estimate</div></div>
</div>
</div>`;
}
