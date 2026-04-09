/**
 * Early-2000s WorldNet bank faux-sites (parody institutions; era-typical layout: banner, nav strip, table forms).
 * HTML is rebuilt on each interaction via bank-ui rerender.
 */

import { escapeHtml } from './identity.js';
import { isPacificUnlocked } from './gameState.js';
import {
  BANK_RULES,
  PACIFIC_UNLOCK_DAYS,
  PACIFIC_UNLOCK_NET_WORTH,
  DARKWEB_MIN_OPEN
} from './bank-config.js';
import { getSessionState } from './sessionState.js';

export const BANK_PAGE_KEYS = [
  'bank',
  'bank_meridian',
  'bank_harbor',
  'bank_pacific',
  'bank_darkweb'
];

export const BANK_META = {
  bank: {
    id: 'fncb',
    title: 'First National Corp. Bank',
    url: 'www.firstnationalcorp.com',
    accent: '#0a246a',
    accent2: '#cc0000',
    layout: 'fncb',
    tagline: 'Commercial Strength Since 1892 · Member FDIC',
    banner: '◆ COMMERCIAL CENTER ◆ SMALL BUSINESS ◆ TRUST SERVICES ◆ ONLINE CASH MGMT',
    blurb:
      '<p style="margin:8px 0;font-size:11px;line-height:1.5;">Treasury, payroll ACH, and consumer checking under one roof. <b>Business checking</b> requires a registered LLC on file with the Federal Business Registry.</p>'
  },
  bank_meridian: {
    id: 'meridian',
    title: 'Meridian Savings & Trust',
    url: 'www.meridiansavings.com',
    accent: '#165d31',
    accent2: '#b8860b',
    layout: 'meridian',
    tagline: 'Regional Banking · Nationwide Trust Network · FDIC',
    banner: '◆ SAVINGS 3.2% APY ◆ MONEY MARKET ◆ HOME LOANS ◆ IRA',
    blurb:
      '<p style="margin:8px 0;font-size:11px;line-height:1.5;">Meridian <b>personal savings</b> earns <b>3.2% APY</b> posted weekly (simulated). Checking stays liquid; savings builds with relationship managers and 128-bit WorldNet SSL.</p>'
  },
  bank_harbor: {
    id: 'harbor',
    title: 'Harbor Credit Union',
    url: 'www.harborcu.org',
    accent: '#006b8f',
    accent2: '#c45c00',
    layout: 'harbor',
    tagline: 'Not for profit. For members. · NCUA insured equivalent disclosure',
    banner: '◆ MEMBER SERVICES ◆ AUTO LOANS ◆ SHARED BRANCHING ◆ CU ONLINE',
    blurb:
      '<p style="margin:8px 0;font-size:11px;line-height:1.5;">One member, one vote. <b>Member since</b> dates reflect your online enrollment — the credit union way, now on WorldNet.</p>'
  },
  bank_pacific: {
    id: 'pacific',
    title: 'Pacific Rim Financial',
    url: 'www.pacificrimfinancial.com',
    accent: '#8b0000',
    accent2: '#d4af37',
    layout: 'pacific',
    tagline: 'Pacific gateway · Wire desk · Invitation tier',
    banner: '◆ GLOBAL WIRE ◆ FX DESK ◆ EXPAT PACKAGES ◆ TRADE FINANCE',
    blurb:
      '<p style="margin:8px 0;font-size:11px;line-height:1.5;">Correspondent desks in Singapore and Tokyo models. <b>Minimum opening deposit $10,000.</b> Outbound wires above policy thresholds are logged for compliance. <button type="button" class="bank-link-btn bank-link-btn--inline" data-bank-nav="register" role="link" style="color:#8b0000;font-weight:bold;">Request enrollment →</button></p>'
  },
  bank_darkweb: {
    id: 'darkweb',
    title: 'First Trust (Onion)',
    url: 'firsttrust.onion.net',
    accent: '#003300',
    accent2: '#00ff66',
    layout: 'darkweb',
    tagline: 'Off-ledger routing · Not FDIC insured · Monitored session',
    banner: '',
    blurb: ''
  }
};

function tableRow(label, val) {
  return `<tr><td style="padding:4px 8px;border:1px solid #ccc;background:#f9f9f9;font-size:11px;"><b>${label}</b></td><td style="padding:4px 8px;border:1px solid #ccc;font-size:11px;">${val}</td></tr>`;
}

function formatMoney(n) {
  return (
    '$' +
    Number(n || 0).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

function maskAccountNumber(acc) {
  const raw = acc?.accountNumber;
  if (!raw) return 'Pending assignment';
  const m = String(raw).match(/^([A-Za-z]+)-(\d{6})$/);
  if (!m) return escapeHtml(raw);
  return `${m[1].toUpperCase()}-**${m[2].slice(2)}`;
}

function accountTypeLabel(t) {
  if (t === 'business_checking') return 'Business Checking';
  if (t === 'personal_savings') return 'Personal Savings';
  return 'Personal Checking';
}

function federalFooterHtml(meta) {
  const rules = BANK_RULES[meta.id];
  if (!rules?.federalMandateFooter) return '';
  return `<div style="border:2px solid #999;border-top:none;padding:8px 10px;background:#fffef5;font-size:9px;color:#333;">
<b>Federal Mandate 2000-CR7:</b> This institution reports transactions above scrutiny thresholds to the Federal Office of Commercial Systems. Identity verification may be delayed up to two (2) sim days.
</div>`;
}

function buildTransactionTable(transactions) {
  const list = Array.isArray(transactions) ? transactions.slice(0, 10) : [];
  if (!list.length) {
    return '<p style="font-size:10px;color:#666;">No recent activity on this account.</p>';
  }
  const rows = list
    .map(
      (tx) =>
        `<tr>
<td style="padding:4px 6px;border:1px solid #ddd;font-size:10px;">${escapeHtml(tx.description || tx.type || '—')}</td>
<td style="padding:4px 6px;border:1px solid #ddd;font-size:10px;">${escapeHtml(tx.type || '')}</td>
<td style="padding:4px 6px;border:1px solid #ddd;font-size:10px;text-align:right;">${formatMoney(tx.amount)}</td>
<td style="padding:4px 6px;border:1px solid #ddd;font-size:10px;text-align:right;font-weight:bold;">${formatMoney(tx.balanceAfter)}</td>
<td style="padding:4px 6px;border:1px solid #ddd;font-size:10px;">${tx.complianceFlag ? '<span style="color:#c60;">FLAG</span>' : '—'}</td>
</tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:10px;">
<tr style="background:#333;color:#fff;"><th style="text-align:left;padding:4px 6px;">Description</th><th style="padding:4px 6px;">Type</th><th style="padding:4px 6px;">Amount</th><th style="padding:4px 6px;">Balance</th><th style="padding:4px 6px;">AML</th></tr>
${rows}
</table>`;
}

function buildPacificLockedPage(pageKey, meta) {
  const nw = PACIFIC_UNLOCK_NET_WORTH;
  return `<div class="iebody bank-era" data-bank-site="${meta.id}" data-bank-page="${pageKey}" style="font-family:Georgia,serif;background:#1a0505;color:#f5e6c8;min-height:320px;padding:20px 24px;">
<h1 style="color:${meta.accent2};font-size:20px;letter-spacing:2px;margin-bottom:8px;">PACIFIC RIM FINANCIAL</h1>
<p style="font-size:11px;opacity:0.9;line-height:1.6;max-width:520px;">Pacific Rim online banking is <b>by invitation only</b>. Prospective clients must meet <b>one</b> of the following:</p>
<ul style="font-size:11px;line-height:1.7;max-width:520px;">
<li>Simulated net worth exceeding <b>${formatMoney(nw)}</b> (aggregate deposits less installment debt), <i>or</i></li>
<li><b>${PACIFIC_UNLOCK_DAYS}</b> in-game days elapsed since Jan 1, 2000 sim epoch.</li>
</ul>
<p style="font-size:10px;color:#aa8;">This page updates automatically when you qualify. Direct enrollment URLs remain unpublished on Wahoo.</p>
<p style="margin-top:20px;font-size:10px;"><button type="button" class="bank-link-btn" data-bank-subpath="about" role="link" style="color:#d4af37;">Institutional disclosure →</button></p>
</div>`;
}

function buildAboutPage(pageKey, meta) {
  return `<div class="iebody bank-era" data-bank-site="${meta.id}" data-bank-page="${pageKey}" data-wn-ad-page="${pageKey}" style="font-family:Tahoma,Arial,sans-serif;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:0 0 8px 0;"></div>
<h1 style="color:${meta.accent};font-size:17px;border-bottom:1px solid #ccc;padding-bottom:6px;">About ${escapeHtml(meta.title)}</h1>
<p style="font-size:11px;line-height:1.55;color:#333;margin:12px 0;">${escapeHtml(meta.tagline)}</p>
<p style="font-size:11px;line-height:1.55;color:#444;margin-bottom:14px;">
${escapeHtml(meta.title)} is a simulated <b>Year 2000</b> WorldNet presence. Disclosures are parody. For printed rate sheets, visit a branch lobby.
</p>
<p style="font-size:10px;color:#666;"><button type="button" class="bank-link-btn" data-bank-nav="landing" role="link">← Return to ${escapeHtml(meta.title)} home</button></p>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:8px;"></div>
</div>`;
}

function buildDarkwebAbout(pageKey, meta) {
  return `<div class="iebody bank-era" data-bank-site="${meta.id}" data-bank-page="${pageKey}" style="font-family:Consolas,monospace;background:#000;color:#0f0;padding:16px;font-size:11px;">
<pre style="white-space:pre-wrap;margin:0;">ABOUT FIRST TRUST (ONION)
-------------------------
Not a member of any federal deposit insurance program.
Routing is opaque. You are the product.

<a href="#" style="color:#0f0;" onclick="return false;">[ back ]</a> use Home command.
</pre>
<button type="button" class="bank-link-btn" data-bank-nav="landing" style="margin-top:12px;background:#111;color:#0f0;border:1px solid #0f0;">HOME</button>
</div>`;
}

function enrollmentExtras(meta, state) {
  const sessRef = escapeHtml(getSessionState().banking?.darkWebReferralCode || '');
  if (meta.id === 'fncb') {
    return `${tableRow(
      'Account type',
      `<select data-bank-field="reg-acct-type" style="width:220px;font-size:11px;">
<option value="personal_checking">Personal checking</option>
<option value="business_checking">Business checking (LLC required)</option>
</select>`
    )}`;
  }
  if (meta.id === 'meridian') {
    return `${tableRow(
      'Account type',
      `<select data-bank-field="reg-acct-type" style="width:220px;font-size:11px;">
<option value="personal_checking">Personal checking</option>
<option value="personal_savings">Personal savings (3.2% APY, weekly credit)</option>
</select>`
    )}`;
  }
  if (meta.id === 'pacific') {
    const min = BANK_RULES.pacific.minOpeningDeposit;
    return `${tableRow(
      'Opening deposit (from First National checking)',
      `<input type="number" data-bank-field="reg-open-dep" min="${min}" step="100" value="${min}" style="width:120px;font-size:11px;"> <span style="font-size:9px;color:#666;">Min ${formatMoney(min)}</span>`
    )}`;
  }
  if (meta.id === 'darkweb') {
    return `${tableRow(
      'Referral code',
      `<input type="text" data-bank-field="reg-referral" value="${sessRef}" placeholder="BLACKCHERRY / MOONLIGHT / DEVREF" style="width:240px;font-size:11px;font-family:monospace;">`
    )}${tableRow(
      'Initial ledger credit (from checking)',
      `<input type="number" data-bank-field="reg-open-dep" min="${DARKWEB_MIN_OPEN}" step="1000" value="${DARKWEB_MIN_OPEN}" style="width:140px;font-size:11px;"> <span style="font-size:9px;color:#666;">Min ${formatMoney(DARKWEB_MIN_OPEN)}</span>`
    )}`;
  }
  return `${tableRow(
    'Account type',
    `<select data-bank-field="reg-acct-type" style="width:220px;font-size:11px;"><option value="personal_checking">Personal checking</option></select>`
  )}`;
}

function commonRegisterFields(meta, state) {
  const acc = state.accounts.find((a) => a.id === meta.id);
  const p = state.player;
  const prof = acc?.enrolledProfile;
  const prefName = escapeHtml(prof?.legalName ?? p?.displayName ?? '');
  const prefDob = escapeHtml(prof?.dob ?? p?.dob ?? '');
  const prefSsn =
    prof?.ssnDigits && String(prof.ssnDigits).length === 9
      ? `${String(prof.ssnDigits).slice(0, 3)}-${String(prof.ssnDigits).slice(3, 5)}-${String(prof.ssnDigits).slice(5)}`
      : escapeHtml(p?.ssnFull ?? '');
  const prefAddr = escapeHtml(prof?.address ?? p?.address ?? '');
  const prefPhone = escapeHtml(prof?.phone ?? p?.phone ?? '');
  const prefEmail = escapeHtml(prof?.email ?? p?.email ?? '');
  const prefEmp = escapeHtml(prof?.employmentStatus ?? '');
  const prefEmpl = escapeHtml(prof?.employerName ?? '');
  const prefInc = prof?.annualIncome != null ? escapeHtml(String(prof.annualIncome)) : '';
  const prefIdt = escapeHtml(prof?.idType ?? '');
  const prefIdn = escapeHtml(prof?.idNumber ?? '');

  return `${tableRow('Legal name (as on SS card)', `<input type="text" data-bank-field="reg-legal" value="${prefName}" style="width:260px;font-size:11px;padding:2px;">`)}
${tableRow('Date of birth', `<input type="text" data-bank-field="reg-dob" value="${prefDob}" placeholder="e.g. March 14, 1976" style="width:220px;font-size:11px;padding:2px;">`)}
${tableRow('SSN (###-##-####) — must match CorpOS Personal Profile', `<input type="text" data-bank-field="reg-ssn-full" value="${prefSsn}" style="width:140px;font-size:11px;padding:2px;">`)}
${tableRow('Home address', `<input type="text" data-bank-field="reg-addr" value="${prefAddr}" style="width:220px;font-size:11px;padding:2px;"><input type="hidden" data-bank-field="reg-addr-id" value=""> <button type="button" data-action="bank-addr-lookup" style="font-size:10px;height:20px;padding:0 6px;cursor:pointer;">Lookup\u2026</button><div data-bank-addr-picker style="display:none;margin-top:4px;"></div>`)}
${tableRow('Day phone', `<input type="text" data-bank-field="reg-phone" value="${prefPhone}" style="width:160px;font-size:11px;padding:2px;">`)}
${tableRow('Email', `<input type="text" data-bank-field="reg-email" value="${prefEmail}" style="width:220px;font-size:11px;padding:2px;">`)}
${tableRow('Employment status', `<input type="text" data-bank-field="reg-employment" value="${prefEmp}" placeholder="Employed / Self-employed" style="width:200px;font-size:11px;padding:2px;">`)}
${tableRow('Employer / business name', `<input type="text" data-bank-field="reg-employer" value="${prefEmpl}" style="width:220px;font-size:11px;padding:2px;">`)}
${tableRow('Annual income (USD)', `<input type="number" data-bank-field="reg-income" value="${prefInc}" min="0" step="500" style="width:120px;font-size:11px;padding:2px;">`)}
${tableRow('Government ID type', `<input type="text" data-bank-field="reg-id-type" value="${prefIdt}" placeholder="Driver's License" style="width:200px;font-size:11px;padding:2px;">`)}
${tableRow('Government ID number', `<input type="text" data-bank-field="reg-id-num" value="${prefIdn}" style="width:160px;font-size:11px;padding:2px;">`)}
${enrollmentExtras(meta, state)}
${tableRow('Choose online User ID', `<input type="text" data-bank-field="reg-user" style="width:220px;font-size:11px;padding:2px;">`)}
${tableRow('Create PIN (4–8 digits)', `<input type="password" data-bank-field="reg-pin" style="width:120px;font-size:11px;padding:2px;">`)}
${tableRow('Confirm PIN', `<input type="password" data-bank-field="reg-pin2" style="width:120px;font-size:11px;padding:2px;">`)}
${tableRow("Secret phrase (mother's maiden name)", `<input type="text" data-bank-field="reg-maiden" style="width:220px;font-size:11px;padding:2px;">`)}`;
}

export function buildRegisterPageHtml(pageKey, state, meta) {
  return `<div class="iebody bank-era" data-bank-site="${meta.id}" data-bank-page="${pageKey}" data-wn-ad-page="${pageKey}" style="font-family:Tahoma,Arial,sans-serif;">
<div style="background:#f5f5f5;border-bottom:1px solid #999;padding:8px 10px;font-size:10px;">
<button type="button" class="bank-link-btn" data-bank-nav="landing" role="link">← Back to ${escapeHtml(meta.title)}</button>
<span style="color:#888;margin-left:12px;">Dedicated enrollment page</span>
</div>
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:8px 12px 0;"></div>
<div style="padding:12px 14px;max-width:760px;">
<h2 style="color:${meta.accent2};font-size:14px;border-bottom:1px solid #ccc;padding-bottom:4px;">Online Banking Enrollment</h2>
<p style="font-size:10px;color:#666;line-height:1.45;">SSN must match your <b>CorpOS Personal Profile</b>. Federal batch verification runs on a two-day delay — <b>false documents are flagged under Mandate 2000-CR7.</b></p>
<div style="margin:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
<button type="button" data-bank-action="prefill-profile" style="padding:3px 12px;font-size:10px;background:#ffffcc;border:2px outset #ccc;cursor:pointer;">Fill from Personal Profile</button>
</div>
<table style="border-collapse:collapse;margin-top:8px;">
${commonRegisterFields(meta, state)}
</table>
<p style="font-size:9px;color:#888;margin-top:8px;">By enrolling you agree to electronic statements and audit access under 2000-CR7 where applicable.</p>
<div style="margin-top:10px;display:flex;gap:8px;">
<button type="button" data-bank-action="submit-register" style="padding:4px 16px;font-size:11px;font-weight:bold;background:${meta.accent2};color:#fff;border:2px outset #ccc;cursor:pointer;">Submit enrollment</button>
<button type="button" data-bank-action="cancel-register" style="padding:4px 12px;font-size:11px;background:#eee;border:2px outset #ccc;cursor:pointer;">Cancel</button>
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:10px;"></div>
</div>
</div>`;
}

function darkwebRegisterPage(pageKey, state, meta) {
  return `<div class="iebody bank-era" data-bank-site="${meta.id}" data-bank-page="${pageKey}" style="font-family:Consolas,monospace;background:#000;color:#0f0;padding:12px;font-size:11px;">
<pre style="color:#0f0;margin:0 0 12px 0;">FIRST_TRUST.ONION :: ENROLLMENT
--------------------------------</pre>
<div style="border:1px solid #093;padding:10px;background:#020;">
<table style="color:#cfc;border-collapse:collapse;width:100%;">
${commonRegisterFields(meta, state)}
</table>
</div>
<p style="font-size:9px;color:#666;margin-top:10px;">Min opening ${formatMoney(DARKWEB_MIN_OPEN)}. Valid referral required. CorpOS may log this session.</p>
<div style="margin-top:10px;">
<button type="button" data-bank-action="submit-register" style="padding:4px 14px;font-size:11px;background:#030;color:#0f0;border:2px solid #0f0;cursor:pointer;">EXECUTE_ENROLL</button>
<button type="button" data-bank-action="cancel-register" style="padding:4px 12px;font-size:11px;margin-left:8px;background:#111;color:#888;border:1px solid #444;cursor:pointer;">ABORT</button>
</div>
</div>`;
}

function txnPinRow() {
  return `${tableRow(
    'Authorize (PIN)',
    `<input type="password" data-bank-field="txn-pin" autocomplete="off" placeholder="••••" style="width:100px;font-size:11px;"> <span style="font-size:9px;color:#666;">Required for money movement</span>`
  )}`;
}

function dashboardForms(meta, acc) {
  const rules = BANK_RULES[meta.id];
  const tiers = (rules?.loanTiers || []).join(', ');
  const loanBlock =
    rules?.offersLoans && tiers
      ? `<tr><td colspan="2" style="padding:6px 8px;background:#eee;font-weight:bold;font-size:11px;">Installment credit — tiers ${escapeHtml(tiers)} USD</td></tr>
<tr><td style="padding:8px;">Draw loan</td><td style="padding:8px;"><input type="number" data-bank-field="loan-take-amt" min="500" step="100" style="width:100px;font-size:11px;"> <button type="button" data-bank-action="loan-take" style="font-size:11px;padding:2px 8px;">Disburse</button></td></tr>
<tr><td style="padding:8px;">Repay principal</td><td style="padding:8px;"><input type="number" data-bank-field="loan-pay-amt" min="1" step="1" style="width:100px;font-size:11px;"> <button type="button" data-bank-action="loan-pay" style="font-size:11px;padding:2px 8px;">Pay</button></td></tr>`
      : '';
  const transferBlock = `<tr><td colspan="2" style="padding:6px 8px;background:#eee;font-weight:bold;font-size:11px;">Transfer to another institution</td></tr>
<tr><td style="padding:8px;">Destination account #</td><td style="padding:8px;"><input type="text" data-bank-field="xfer-to" placeholder="PREFIX-######" style="width:140px;font-size:11px;font-family:monospace;"></td></tr>
<tr><td style="padding:8px;">Amount USD</td><td style="padding:8px;"><input type="number" data-bank-field="xfer-amt" min="1" step="1" style="width:100px;font-size:11px;"> <button type="button" data-bank-action="transfer" style="font-size:11px;padding:2px 8px;">Send transfer</button></td></tr>`;

  return `<table style="width:100%;border-collapse:collapse;margin-top:14px;background:#fafafa;border:1px solid #ddd;">
<tr><td colspan="2" style="padding:6px 8px;background:#eee;font-weight:bold;font-size:11px;">Deposit</td></tr>
<tr><td style="padding:8px;">Amount USD</td><td style="padding:8px;"><input type="number" data-bank-field="dep-amt" min="1" step="1" style="width:100px;font-size:11px;"> <button type="button" data-bank-action="deposit" style="font-size:11px;padding:2px 8px;">Deposit</button></td></tr>
<tr><td colspan="2" style="padding:6px 8px;background:#eee;font-weight:bold;font-size:11px;">Withdraw</td></tr>
<tr><td style="padding:8px;">Amount USD</td><td style="padding:8px;"><input type="number" data-bank-field="wd-amt" min="1" step="1" style="width:100px;font-size:11px;"> <button type="button" data-bank-action="withdraw" style="font-size:11px;padding:2px 8px;">Withdraw</button></td></tr>
${loanBlock}
${transferBlock}
${txnPinRow()}
</table>`;
}

function shellClassic(pageKey, meta, state, ui, acc, panelLanding, panelDash, sidebarHtml, mainExtra = '') {
  const balance = acc?.balance ?? 0;
  const loan = acc?.loanBalance ?? 0;
  const reg = !!acc?.onlineRegistered;
  const logged = !!ui.session;
  const balFmt = formatMoney(balance);
  const loanFmt = formatMoney(loan);
  const masked = maskAccountNumber(acc);
  const loginHint =
    reg && acc?.enrolledUserId != null ? escapeHtml(acc.enrolledUserId) : escapeHtml(state.player?.username ?? '');
  const memberSince =
    acc?.memberSinceElapsedMs != null
      ? `Member since sim day ${Math.floor(acc.memberSinceElapsedMs / 86400000) + 1}`
      : '—';

  return `<div class="iebody bank-era" data-bank-site="${meta.id}" data-bank-page="${pageKey}" data-wn-ad-page="${pageKey}" style="font-family:Tahoma,Arial,sans-serif;">
<div style="background:linear-gradient(180deg,#f0f0f0 0%,#ffffff 40%);border:2px solid #999;border-bottom:none;padding:8px 10px;">
  <table style="width:100%;border-collapse:collapse;"><tr>
    <td style="vertical-align:middle;">
      <span style="font-size:20px;font-weight:bold;color:${meta.accent};letter-spacing:-1px;">${escapeHtml(meta.title)}</span><br>
      <span style="font-size:10px;color:#666;">https://${escapeHtml(meta.url)}/ &nbsp;|&nbsp; SSL session &nbsp;|&nbsp; WorldNet Explorer 5.0</span>
    </td>
    <td style="text-align:right;font-size:10px;color:#666;vertical-align:top;">
      <div style="border:1px solid #ccc;background:#ffffee;padding:4px 8px;display:inline-block;"><b>Member FDIC</b> / equiv.</div><br>
      <span data-bank-clock style="color:#333;">Session timer: live</span>
    </td>
  </tr></table>
  <div style="margin-top:6px;padding:4px 6px;background:${meta.accent};color:#fff;font-size:10px;letter-spacing:0.5px;">${meta.banner}</div>
</div>
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:8px 0;"></div>
<div style="display:flex;gap:0;border:2px solid #999;border-top:none;min-height:340px;">
  <div style="width:140px;background:#e8e8e8;border-right:1px solid #999;padding:10px 6px;font-size:10px;line-height:1.6;">
    ${sidebarHtml}
    <div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail" style="margin-top:8px;"></div>
  </div>
  <div style="flex:1;padding:12px 14px;background:#fff;">
    ${meta.blurb}
    ${mainExtra}
    <div data-bank-panel="landing" style="display:${panelLanding};">
      <h2 style="color:${meta.accent};font-size:14px;border-bottom:1px solid #ccc;padding-bottom:4px;">Secure Log In</h2>
      <p style="font-size:10px;color:#666;margin:6px 0;">First-time users: <button type="button" class="bank-link-btn bank-link-btn--inline" data-bank-nav="register" role="link">enroll for online access</button></p>
      <table style="border-collapse:collapse;margin-top:8px;">
        ${tableRow('Online User ID', `<input type="text" data-bank-field="user" value="${loginHint}" autocomplete="off" style="width:200px;font-size:11px;padding:2px;border:1px inset #999;">`)}
        ${tableRow('Password / PIN', `<input type="password" data-bank-field="pass" autocomplete="off" style="width:200px;font-size:11px;padding:2px;border:1px inset #999;">`)}
      </table>
      <div style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button type="button" data-bank-action="login" style="padding:4px 18px;font-size:11px;font-weight:bold;background:${meta.accent};color:#fff;border:2px outset #ccc;cursor:pointer;">Log In</button>
        <button type="button" data-bank-action="forgot" style="padding:4px 12px;font-size:11px;background:#eee;border:2px outset #ccc;cursor:pointer;">Forgot password?</button>
      </div>
    </div>
    <div data-bank-panel="dashboard" style="display:${panelDash};">
      <h2 style="color:${meta.accent};font-size:14px;">Welcome, ${escapeHtml((acc?.enrolledProfile?.legalName || state.player?.displayName || 'Customer').split(' ')[0])}</h2>
      <p style="font-size:10px;color:#666;">Account <b>${masked}</b> · ${escapeHtml(accountTypeLabel(acc?.accountType))} · ${memberSince}</p>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:11px;">
        <tr style="background:${meta.accent};color:#fff;"><th style="text-align:left;padding:4px 6px;">Product</th><th style="padding:4px 6px;">Available</th><th style="padding:4px 6px;">Loan</th><th style="padding:4px 6px;">Status</th></tr>
        <tr><td style="padding:6px;border:1px solid #ddd;">${escapeHtml(accountTypeLabel(acc?.accountType))}</td><td style="padding:6px;border:1px solid #ddd;color:#060;font-weight:bold;" data-bank-live="balance">${balFmt}</td><td style="padding:6px;border:1px solid #ddd;" data-bank-live="loan">${loanFmt}</td><td style="padding:6px;border:1px solid #ddd;">Active</td></tr>
      </table>
      <h3 style="font-size:12px;color:${meta.accent};margin-bottom:4px;">Recent activity (newest first)</h3>
      ${buildTransactionTable(acc?.transactions)}
      ${dashboardForms(meta, acc)}
      <div style="margin-top:14px;">
        <button type="button" data-bank-action="logout" style="font-size:11px;padding:3px 12px;background:#eee;border:2px outset #ccc;cursor:pointer;">Log out</button>
      </div>
    </div>
  </div>
</div>
<div style="border:2px solid #999;border-top:none;padding:6px 10px;background:#f5f5f5;font-size:9px;color:#666;text-align:center;">
  © 2000 ${escapeHtml(meta.title)}. <a href="#" style="color:#666;">Privacy</a>
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:8px;"></div>
${federalFooterHtml(meta)}
</div>`;
}

function buildDarkwebTerminal(pageKey, state, ui, acc) {
  const meta = BANK_META[pageKey];
  const reg = !!acc?.onlineRegistered;
  const logged = !!ui.session;
  let panelLanding = 'block';
  let panelDash = 'none';
  if (reg && logged) {
    panelLanding = 'none';
    panelDash = 'block';
  }
  const masked = maskAccountNumber(acc);
  const balFmt = formatMoney(acc?.balance ?? 0);

  return `<div class="iebody bank-era" data-bank-site="${meta.id}" data-bank-page="${pageKey}" style="font-family:Consolas,monospace;background:#000;color:#0f0;padding:12px;min-height:360px;">
<pre style="color:#0a0;margin:0 0 8px 0;">firsttrust.onion.net [CONNECTED]
SESSION: ENCRYPTED (THEATRICAL)</pre>
<div data-bank-panel="landing" style="display:${panelLanding};">
<p style="color:#8f8;font-size:11px;">AUTHENTICATE</p>
<table style="border-collapse:collapse;color:#0f0;">
${tableRow('USER', `<input type="text" data-bank-field="user" style="background:#111;color:#0f0;border:1px solid #0f0;width:200px;">`)}
${tableRow('PIN', `<input type="password" data-bank-field="pass" style="background:#111;color:#0f0;border:1px solid #0f0;width:120px;">`)}
</table>
<button type="button" data-bank-action="login" style="margin-top:10px;padding:4px 12px;background:#030;color:#0f0;border:2px solid #0f0;cursor:pointer;">LOGIN</button>
<button type="button" data-bank-nav="register" style="margin-left:8px;padding:4px 12px;background:#111;color:#888;border:1px solid #444;cursor:pointer;">NEW_SHELL</button>
</div>
<div data-bank-panel="dashboard" style="display:${panelDash};">
<pre style="color:#0f0;">LEDGER_VIEW  ${masked}
BALANCE      ${balFmt}</pre>
${buildTransactionTable(acc?.transactions)}
${dashboardForms(meta, acc)}
<button type="button" data-bank-action="logout" style="margin-top:12px;padding:4px 12px;background:#300;color:#f88;border:1px solid #f00;cursor:pointer;">DISCONNECT</button>
</div>
<p style="margin-top:16px;font-size:9px;color:#555;">Not FDIC insured. Tier-3 routing may observe large transfers.</p>
</div>`;
}

export function buildBankPageHtml(pageKey, state, ui, subPath = '') {
  const meta = BANK_META[pageKey];
  if (!meta) return '<div class="iebody"><p>Unknown bank.</p></div>';

  if (meta.id === 'pacific' && !isPacificUnlocked(state)) {
    if (subPath === 'about') return buildAboutPage(pageKey, meta);
    if (subPath === 'register') return buildPacificLockedPage(pageKey, meta);
    return buildPacificLockedPage(pageKey, meta);
  }

  const acc = state.accounts.find((a) => a.id === meta.id);
  const reg = !!acc?.onlineRegistered;
  const logged = !!ui.session;
  let panelLanding = 'block';
  let panelDash = 'none';
  if (reg && logged) {
    panelLanding = 'none';
    panelDash = 'block';
  }

  if (pageKey === 'bank_darkweb') {
    if (subPath === 'register') return darkwebRegisterPage(pageKey, state, meta);
    if (subPath === 'about') return buildDarkwebAbout(pageKey, meta);
    return buildDarkwebTerminal(pageKey, state, ui, acc);
  }

  if (subPath === 'register') return buildRegisterPageHtml(pageKey, state, meta);
  if (subPath === 'about') return buildAboutPage(pageKey, meta);

  const nav = `<div style="font-weight:bold;color:${meta.accent};margin-bottom:6px;">ONLINE</div>
    <button type="button" class="bank-link-btn" data-bank-nav="landing" role="link">Home / Log In</button>
    <button type="button" class="bank-link-btn" data-bank-nav="register" role="link">Enroll</button>
    <button type="button" class="bank-link-btn" data-bank-subpath="about" role="link">About</button>`;

  if (meta.layout === 'meridian') {
    const side = `${nav}<hr style="border:none;border-top:1px solid #bbb;margin:8px 0;"><div style="font-size:9px;color:#165d31;"><b>Savings APY</b><br>3.2% compounded weekly sim</div>`;
    return shellClassic(pageKey, meta, state, ui, acc, panelLanding, panelDash, side);
  }
  if (meta.layout === 'harbor') {
    const side = `${nav}<hr style="border:none;border-top:1px solid #bbb;margin:8px 0;"><div style="font-size:9px;">Shared branching<br>Coast-to-coast</div>`;
    return shellClassic(pageKey, meta, state, ui, acc, panelLanding, panelDash, side);
  }

  if (meta.layout === 'pacific') {
    const side = `${nav}<div style="font-size:9px;color:#8b0000;margin-top:8px;">Wire compliance<br>Outbound &gt;${formatMoney(10000)} logged</div>`;
    return shellClassic(pageKey, meta, state, ui, acc, panelLanding, panelDash, side);
  }

  const side = `${nav}<hr style="border:none;border-top:1px solid #bbb;margin:8px 0;"><div style="font-size:9px;">Cash mgmt hotline<br>1-800-PARODY-0</div>`;
  return shellClassic(pageKey, meta, state, ui, acc, panelLanding, panelDash, side);
}
