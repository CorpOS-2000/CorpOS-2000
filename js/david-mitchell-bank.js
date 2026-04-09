/**
 * David & Mitchell Banking — Wahoo-style portal (separate from other bank templates).
 * WorldNet page key: dmb. Subpaths: register, about, confirm.
 */

import {
  appendBankingTransaction,
  findAccountByFullNumber,
  formatMoney,
  generateBankAccountNumber,
  getState,
  patchState,
  scheduleEnrollmentViolation
} from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import {
  classifyBankEnrollment,
  escapeHtml,
  IDENTITY_FINE_DELAY_DAYS,
  normalizeSsnDigits
} from './identity.js';
import { complianceNoticeAmount } from './bank-config.js';

const BANK_ID = 'davidmitchell';

function acc() {
  return getState().accounts.find((a) => a.id === BANK_ID);
}

function isDmbSession() {
  const u = getSessionState().dmb?.browserSessionUser;
  return typeof u === 'string' && u.length > 0;
}

function formatMaskedDmbAccount(raw) {
  const m = String(raw || '').match(/^DMB-(\d{6})$/i);
  if (!m) return escapeHtml(raw || 'Pending');
  return `DMB-**${m[1].slice(2)}`;
}

function pushTx(st, a, entry) {
  const txs = Array.isArray(a.transactions) ? a.transactions : [];
  txs.unshift({
    simElapsedMs: st.sim.elapsedMs,
    type: entry.type,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    description: entry.description,
    complianceFlag: !!entry.complianceFlag
  });
  a.transactions = txs.slice(0, 10);
}

/** @param {string} sub */
export function renderDmbPage(sub = '') {
  const st = getState();
  const a = st.accounts.find((x) => x.id === BANK_ID);
  const sess = isDmbSession() && a?.onlineRegistered;
  const user = getSessionState().dmb?.browserSessionUser;

  if (sub === 'about') return renderAbout();
  if (sub === 'confirm') return renderConfirm();
  if (sub === 'register') return renderRegister(st, a);
  if (sess && user && a?.enrolledUserId?.toUpperCase() === user.toUpperCase()) {
    return renderDashboard(st, a);
  }
  return renderPublicHome(st, a);
}

function navLink(sub, label) {
  const s = sub || '';
  return `<a href="#" data-nav="dmb" data-wnet-subpath="${escapeHtml(s)}" style="color:#8b0000;cursor:pointer;font-size:11px;">${label}</a>`;
}

function renderPublicHome(st, a) {
  const reg = !!a?.onlineRegistered;
  const hint = reg
    ? 'Welcome back — sign in below with your online username and password.'
    : 'New to David &amp; Mitchell? Open your first account online in minutes.';

  return `<div class="iebody" data-dmb-site="1" style="font-family:Tahoma,Arial,sans-serif;">
<div class="ntbar" style="background:#4a1520;color:#fff;font-size:10px;padding:4px 6px;">◆ FDIC MEMBER — EQUAL HOUSING LENDER &nbsp;|&nbsp; ◆ ONLINE BANKING SECURE SESSION &nbsp;|&nbsp; ◆ MANDATE 2000-CR7 COMPLIANT</div>
<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap;">
  <div style="font-size:34px;font-weight:900;color:#6b0f1a;font-family:'Times New Roman',Georgia,serif;letter-spacing:-1px;">David &amp; Mitchell</div>
  <div style="font-size:11px;color:#555;"><b>Banking</b> &nbsp;|&nbsp; Since 1894 &nbsp;|&nbsp; ${navLink('', 'Home')}</div>
</div>
<div style="border:2px solid #8b0000;padding:6px;margin-bottom:8px;background:#fffaf5;">
  <div class="sbox" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
    <input class="sinput" type="text" placeholder="Find a branch or ATM near you…" id="dmb-branch-q" style="flex:1;min-width:160px;">
    <button type="button" class="sbtn" data-action="dmb-branch-search" style="background:#6b0f1a;color:#fff;border:2px outset #ccc;padding:2px 10px;font-size:11px;cursor:pointer;">Search</button>
    &nbsp;${navLink('register', 'Open an account online →')}
  </div>
  <div style="font-size:10px;color:#666;text-align:center;margin-top:4px;">David &amp; Mitchell Banking — not affiliated with any search portal. Search covers our branch directory only.</div>
</div>
<div class="ad" style="background:#fff3cd;border:1px solid #c9a227;padding:6px;font-size:10px;">📢 <b>Featured:</b> Free checking with no minimum when you enroll online — ${navLink('register', 'apply today')}</div>
<div class="cgrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
  <div class="cat" style="border:1px solid #ccc;padding:6px;background:#fff;"><div class="cat-t" style="font-weight:bold;color:#6b0f1a;font-size:11px;margin-bottom:4px;">🏛️ Personal</div>
    ${navLink('register', 'Checking & savings')}<br>
    ${navLink('', 'Home banking overview')}<br>
    ${navLink('register', 'Order checks')}
  </div>
  <div class="cat" style="border:1px solid #ccc;padding:6px;background:#fff;"><div class="cat-t" style="font-weight:bold;color:#6b0f1a;font-size:11px;margin-bottom:4px;">💼 Business</div>
    ${navLink('register', 'Small business')}<br>
    ${navLink('', 'Cash management intro')}<br>
    ${navLink('register', 'Merchant services info')}
  </div>
  <div class="cat" style="border:1px solid #ccc;padding:6px;background:#fff;"><div class="cat-t" style="font-weight:bold;color:#6b0f1a;font-size:11px;margin-bottom:4px;">📈 Invest</div>
    ${navLink('', 'Market outlook (summary)')}<br>
    ${navLink('', 'CD specials')}<br>
    ${navLink('register', 'Speak with a banker')}
  </div>
  <div class="cat" style="border:1px solid #ccc;padding:6px;background:#fff;"><div class="cat-t" style="font-weight:bold;color:#6b0f1a;font-size:11px;margin-bottom:4px;">🏠 Borrow</div>
    ${navLink('register', 'Mortgage center')}<br>
    ${navLink('register', 'Auto loans')}<br>
    ${navLink('register', 'Credit lines')}
  </div>
  <div class="cat" style="border:1px solid #ccc;padding:6px;background:#fff;"><div class="cat-t" style="font-weight:bold;color:#6b0f1a;font-size:11px;margin-bottom:4px;">⚖️ Service</div>
    ${navLink('', 'Customer service hours')}<br>
    ${navLink('', 'Report a lost card')}<br>
    ${navLink('register', 'Update your profile')}
  </div>
  <div class="cat" style="border:1px solid #ccc;padding:6px;background:#fff;"><div class="cat-t" style="font-weight:bold;color:#6b0f1a;font-size:11px;margin-bottom:4px;">📰 News</div>
    ${navLink('', 'D&amp;M community news')}<br>
    ${navLink('', 'Rate announcements')}<br>
    ${navLink('', 'Security tips')}
  </div>
</div>
<div style="margin-top:12px;border:2px groove #ccc;padding:10px;background:#f5f0eb;">
  <div style="font-weight:bold;color:#6b0f1a;margin-bottom:6px;">Secure online banking</div>
  <p style="font-size:10px;color:#444;margin-bottom:8px;">${hint}</p>
  <table style="font-size:11px;border-collapse:collapse;">
    <tr><td style="padding:4px;"><b>Username</b></td><td style="padding:4px;"><input type="text" id="dmb-login-user" style="width:180px;font-size:11px;"></td></tr>
    <tr><td style="padding:4px;"><b>Password</b></td><td style="padding:4px;"><input type="password" id="dmb-login-pass" style="width:180px;font-size:11px;"></td></tr>
  </table>
  <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
    <button type="button" data-action="dmb-login" style="padding:4px 14px;font-size:11px;font-weight:bold;background:#6b0f1a;color:#fff;border:2px outset #ccc;cursor:pointer;">Sign in</button>
    ${navLink('register', 'Enroll for online access')}
  </div>
</div>
<div style="margin-top:10px;font-size:9px;color:#777;text-align:center;border-top:1px solid #ddd;padding-top:6px;">
  © 2000 David &amp; Mitchell Banking, Member FDIC. ${navLink('', 'Return to home')} &nbsp;|&nbsp;
  <span style="opacity:.65;">D&amp;M-09 institutional disclosures:</span> ${navLink('about', 'About David &amp; Mitchell')}
</div>
<div style="font-size:9px;color:#555;margin-top:6px;text-align:center;border:1px solid #c9a227;background:#fffef8;padding:6px;">
  <b>Federal notice:</b> All transactions above scrutiny thresholds are reported to the Federal Revenue Authority per Mandate 2000-CR7.
</div>
</div>`;
}

function renderRegister(st, a) {
  if (a?.onlineRegistered) {
    return `<div class="iebody" style="font-family:Tahoma,Arial,sans-serif;">
<p style="font-size:11px;">You already have an account with us. ${navLink('', 'Sign in on the home page')}.</p>
</div>`;
  }
  const p = st.player;
  return `<div class="iebody" data-dmb-site="1" style="font-family:Tahoma,Arial,sans-serif;max-width:720px;">
<div style="background:#6b0f1a;color:#fff;padding:6px 10px;font-size:12px;font-weight:bold;">David &amp; Mitchell Banking — Online enrollment</div>
<p style="font-size:10px;color:#666;margin:10px 0;">Complete every field. Your <b>Social Security Number</b> must match your CorpOS Personal Profile. You may align other fields with any citizen in the federal directory (NPC) for role-play; SSN must still match the profile on file.</p>
<button type="button" data-action="dmb-prefill" style="font-size:10px;margin-bottom:10px;padding:3px 10px;background:#ffffcc;border:2px outset #ccc;cursor:pointer;">Fill from Personal Profile</button>
<table style="width:100%;border-collapse:collapse;font-size:11px;">
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;width:200px;"><b>Legal name</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-legal" value="${escapeHtml(p.displayName)}" style="width:98%;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>Date of birth</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-dob" value="${escapeHtml(p.dob)}" style="width:98%;"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>SSN (###-##-####)</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-ssn" value="${escapeHtml(p.ssnFull || '')}" style="width:140px;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>Street address</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-street" value="${escapeHtml(p.address?.split(',')[0] || p.address || '')}" style="width:98%;"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>City</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-city" style="width:140px;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>State</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-state" style="width:60px;" maxlength="2" placeholder="CA"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>ZIP</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-zip" style="width:100px;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>Phone</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-phone" value="${escapeHtml(p.phone)}" style="width:160px;"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>Email</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-email" value="${escapeHtml(p.email)}" style="width:98%;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>Employment status</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-empstat" style="width:98%;" placeholder="Employed / Self-employed"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>Employer name</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-employer" style="width:98%;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>Annual income (USD)</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="number" id="dmb-reg-income" min="0" step="500" style="width:120px;"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>Government ID type</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-idtype" style="width:98%;" placeholder="Driver's license"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>Government ID number</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-idnum" style="width:200px;"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>Mother's maiden name</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-maiden" style="width:200px;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>Choose username</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="text" id="dmb-reg-user" style="width:200px;"></td></tr>
<tr style="background:#eee;"><td style="padding:6px;border:1px solid #ccc;"><b>Password</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="password" id="dmb-reg-pass" style="width:200px;"></td></tr>
<tr><td style="padding:6px;border:1px solid #ccc;"><b>PIN (4 digits)</b></td><td style="padding:6px;border:1px solid #ccc;"><input type="password" id="dmb-reg-pin" maxlength="4" style="width:80px;"></td></tr>
</table>
<p style="font-size:9px;color:#888;margin-top:8px;">By submitting you consent to electronic records and verification under Mandate 2000-CR7.</p>
<div style="margin-top:10px;display:flex;gap:8px;">
  <button type="button" data-action="dmb-register" style="padding:5px 18px;font-size:11px;font-weight:bold;background:#6b0f1a;color:#fff;border:2px outset #ccc;cursor:pointer;">Submit application</button>
  ${navLink('', 'Cancel — home')}
</div>
</div>`;
}

function renderAbout() {
  return `<div class="iebody" data-dmb-site="1" style="font-family:Tahoma,Arial,sans-serif;max-width:640px;">
<h1 style="color:#6b0f1a;font-size:16px;border-bottom:1px solid #ccc;padding-bottom:6px;">About David &amp; Mitchell Banking</h1>
<p style="font-size:11px;line-height:1.55;color:#333;margin:12px 0;">David &amp; Mitchell has served families and businesses since the 19th century. This WorldNet presence is a <b>simulated Year 2000</b> experience — rates, products, and disclosures are parody.</p>
<p style="font-size:10px;color:#666;">Member FDIC · Equal Housing Lender · Routing information available at your branch.</p>
<p style="margin-top:16px;">${navLink('', '← Return to David &amp; Mitchell home')}</p>
</div>`;
}

function renderConfirm() {
  const num = getSessionState().dmb?.lastConfirmedAccount || '';
  if (!num) {
    return `<div class="iebody" style="font-family:Tahoma,Arial,sans-serif;"><p style="font-size:11px;">No pending confirmation. ${navLink('register', 'Open an account')}</p></div>`;
  }
  return `<div class="iebody" data-dmb-site="1" style="font-family:Tahoma,Arial,sans-serif;text-align:center;padding:20px;">
<div style="border:3px double #6b0f1a;background:#fffaf5;padding:20px;max-width:420px;margin:0 auto;">
<h2 style="color:#6b0f1a;font-size:14px;">Enrollment complete</h2>
<p style="font-size:11px;margin:12px 0;">Your account number has been assigned. Please record it — others will need this number to send you transfers.</p>
<div style="font-family:Consolas,monospace;font-size:18px;font-weight:bold;color:#000;margin:16px 0;">${escapeHtml(num)}</div>
<p style="font-size:10px;color:#666;">Sign in from the home page with your username and password.</p>
${navLink('', 'Continue to home')}
</div>
</div>`;
}

function txTable(transactions) {
  const list = Array.isArray(transactions) ? transactions.slice(0, 10) : [];
  if (!list.length) return '<p style="font-size:10px;color:#666;">No transactions yet.</p>';
  const rows = list
    .map(
      (tx) =>
        `<tr><td style="padding:4px;border:1px solid #ddd;font-size:10px;">${escapeHtml(tx.description || '')}</td>
<td style="padding:4px;border:1px solid #ddd;font-size:10px;">${escapeHtml(tx.type || '')}</td>
<td style="padding:4px;border:1px solid #ddd;font-size:10px;text-align:right;">${formatMoney(tx.amount)}</td>
<td style="padding:4px;border:1px solid #ddd;font-size:10px;text-align:right;">${formatMoney(tx.balanceAfter)}</td></tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;font-size:10px;margin-top:8px;">
<tr style="background:#6b0f1a;color:#fff;"><th style="text-align:left;padding:4px;">Description</th><th style="padding:4px;">Type</th><th style="padding:4px;">Amount</th><th style="padding:4px;">Balance</th></tr>
${rows}</table>`;
}

function renderDashboard(st, a) {
  const name = escapeHtml(a.enrolledProfile?.legalName || st.player.displayName);
  const maskedAcct = formatMaskedDmbAccount(a.accountNumber);
  const bal = formatMoney(a.balance || 0);

  return `<div class="iebody" data-dmb-site="1" style="font-family:Tahoma,Arial,sans-serif;">
<div style="background:#6b0f1a;color:#fff;padding:6px 10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
  <span style="font-weight:bold;">David &amp; Mitchell — Online Banking</span>
  <span>${navLink('', 'Home')} &nbsp; ${navLink('about', 'About')} &nbsp; <button type="button" data-action="dmb-logout" style="background:transparent;border:none;color:#ffcccc;cursor:pointer;font-size:11px;text-decoration:underline;padding:0;">Sign out</button></span>
</div>
<p style="font-size:11px;margin:10px 0;">Welcome, <b>${name}</b></p>
<table style="font-size:11px;border-collapse:collapse;margin-bottom:12px;">
<tr><td style="padding:4px 8px;background:#f5f0eb;border:1px solid #ccc;"><b>Account no.</b></td><td style="padding:4px 8px;border:1px solid #ccc;font-family:Consolas,monospace;">${maskedAcct}</td></tr>
<tr><td style="padding:4px 8px;background:#f5f0eb;border:1px solid #ccc;"><b>Available balance</b></td><td style="padding:4px 8px;border:1px solid #ccc;color:#060;font-weight:bold;">${bal}</td></tr>
<tr><td style="padding:4px 8px;background:#f5f0eb;border:1px solid #ccc;"><b>Account type</b></td><td style="padding:4px 8px;border:1px solid #ccc;">${escapeHtml(a.accountType === 'business_checking' ? 'Business checking' : 'Personal checking')}</td></tr>
<tr><td style="padding:4px 8px;background:#f5f0eb;border:1px solid #ccc;"><b>Status</b></td><td style="padding:4px 8px;border:1px solid #ccc;">Active — good standing</td></tr>
</table>
<h3 style="font-size:12px;color:#6b0f1a;">Recent activity (last 10)</h3>
${txTable(a.transactions)}
<div style="margin-top:14px;border:1px solid #ccc;padding:10px;background:#fafafa;">
  <div style="font-weight:bold;margin-bottom:6px;">Move money <span style="font-size:9px;color:#666;">(PIN required)</span></div>
  <table style="font-size:11px;">
  <tr><td>Deposit</td><td><input type="number" id="dmb-dep" min="1" step="1" style="width:100px;"> <button type="button" data-action="dmb-deposit" style="font-size:10px;">Deposit</button></td></tr>
  <tr><td>Withdraw</td><td><input type="number" id="dmb-wd" min="1" step="1" style="width:100px;"> <button type="button" data-action="dmb-withdraw" style="font-size:10px;">Withdraw</button></td></tr>
  <tr><td>Transfer to</td><td><input type="text" id="dmb-xfer-to" placeholder="PREFIX-######" style="width:130px;font-family:monospace;"> amt <input type="number" id="dmb-xfer-amt" min="1" style="width:80px;"> <button type="button" data-action="dmb-transfer" style="font-size:10px;">Send</button></td></tr>
  <tr><td>PIN</td><td><input type="password" id="dmb-txn-pin" maxlength="8" style="width:80px;"></td></tr>
  </table>
</div>
<div style="font-size:9px;color:#555;margin-top:12px;text-align:center;border:1px solid #c9a227;background:#fffef8;padding:6px;">
  <b>Federal notice:</b> All transactions above scrutiny thresholds are reported to the Federal Revenue Authority per Mandate 2000-CR7.
</div>
</div>`;
}

function val(id) {
  return (document.getElementById(id)?.value ?? '').trim();
}

/**
 * @param {string} action
 * @param {{ navigate: (k: string, s?: string, o?: object) => void, toast: (m: string) => void }} ctx
 * @returns {boolean}
 */
export function dispatchDmbAction(action, ctx) {
  const { navigate, toast } = ctx;
  const msg = (m) => toast(`David & Mitchell: ${m}`);

  if (action === 'dmb-branch-search') {
    msg('Branch search: please call 1-800-DAVID-01 or visit your local office. (Simulation.)');
    return true;
  }

  if (action === 'dmb-prefill') {
    const st = getState();
    const p = st.player;
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = v ?? '';
    };
    set('dmb-reg-legal', p.displayName);
    set('dmb-reg-dob', p.dob);
    set('dmb-reg-ssn', p.ssnFull || '');
    set('dmb-reg-phone', p.phone);
    set('dmb-reg-email', p.email);
    const parts = String(p.address || '').split(',');
    set('dmb-reg-street', parts[0]?.trim() || p.address || '');
    msg('Form filled from CorpOS Personal Profile. Review all fields before submitting.');
    return true;
  }

  if (action === 'dmb-login') {
    const user = val('dmb-login-user').toUpperCase();
    const pass = document.getElementById('dmb-login-pass')?.value || '';
    const a = acc();
    if (!a?.onlineRegistered) {
      msg('No online enrollment on file. Open an account first.');
      return true;
    }
    if (!user || !pass) {
      msg('Enter username and password.');
      return true;
    }
    if (user !== String(a.enrolledUserId || '').toUpperCase() || pass !== (a.enrolledPassword || a.enrolledPin || '')) {
      msg('We could not verify your credentials. Please try again.');
      return true;
    }
    patchSession((s) => {
      s.dmb = s.dmb || {};
      s.dmb.browserSessionUser = user;
    });
    msg('Signed in securely.');
    navigate('dmb', '', { pushHistory: true });
    return true;
  }

  if (action === 'dmb-logout') {
    patchSession((s) => {
      if (s.dmb) s.dmb.browserSessionUser = null;
    });
    msg('You have been signed out.');
    navigate('dmb', '', { pushHistory: true });
    return true;
  }

  if (action === 'dmb-register') {
    const aBefore = acc();
    if (aBefore?.onlineRegistered) {
      msg('You already have an account.');
      navigate('dmb', '', { pushHistory: true });
      return true;
    }

    const legal = val('dmb-reg-legal');
    const dob = val('dmb-reg-dob');
    const ssnRaw = val('dmb-reg-ssn');
    const street = val('dmb-reg-street');
    const city = val('dmb-reg-city');
    const state = val('dmb-reg-state');
    const zip = val('dmb-reg-zip');
    const phone = val('dmb-reg-phone');
    const email = val('dmb-reg-email');
    const empStat = val('dmb-reg-empstat');
    const employer = val('dmb-reg-employer');
    const incomeStr = val('dmb-reg-income');
    if (!incomeStr) {
      msg('Annual income is required (enter a number, or 0 if not applicable).');
      return true;
    }
    const income = Math.floor(Number(incomeStr) || 0);
    const idType = val('dmb-reg-idtype');
    const idNum = val('dmb-reg-idnum');
    const maiden = val('dmb-reg-maiden');
    const user = val('dmb-reg-user');
    const pass = document.getElementById('dmb-reg-pass')?.value || '';
    const pin = val('dmb-reg-pin');

    const need = [
      legal,
      dob,
      ssnRaw,
      street,
      city,
      state,
      zip,
      phone,
      email,
      empStat,
      employer,
      idType,
      idNum,
      maiden,
      user,
      pass,
      pin
    ];
    if (need.some((x) => !String(x ?? '').trim())) {
      msg('All fields are required. Please complete the application.');
      return true;
    }
    if (!/^\d{4}$/.test(pin)) {
      msg('PIN must be exactly 4 digits.');
      return true;
    }
    if (user.length < 3 || pass.length < 4) {
      msg('Username (min 3) and password (min 4) are required.');
      return true;
    }

    const st0 = getState();
    const profileDigits = normalizeSsnDigits(st0.player?.ssnFull);
    const submittedDigits = normalizeSsnDigits(ssnRaw);
    if (!profileDigits || !submittedDigits || profileDigits !== submittedDigits) {
      msg('Registration declined: Social Security Number must match your CorpOS Personal Profile.');
      return true;
    }

    const verdict = classifyBankEnrollment(st0, { legalName: legal, dob, ssnRaw });
    const fullAddr = `${street}, ${city}, ${state} ${zip}`.trim();

    patchState((st) => {
      const a = st.accounts.find((x) => x.id === BANK_ID);
      if (!a || a.onlineRegistered) return st;
      a.accountNumber = generateBankAccountNumber('DMB');
      a.onlineRegistered = true;
      a.enrolledUserId = user.toUpperCase();
      a.enrolledPassword = pass;
      a.enrolledPin = pin;
      a.accountType = 'personal_checking';
      a.memberSinceElapsedMs = st.sim.elapsedMs;
      a.balance = 0;
      a.loanBalance = 0;
      a.loanDetail = null;
      a.transactions = [];
      a.enrolledProfile = {
        legalName: legal,
        dob,
        ssnDigits: submittedDigits,
        address: fullAddr,
        phone,
        email,
        employmentStatus: empStat,
        employerName: employer,
        annualIncome: income,
        idType,
        idNumber: idNum,
        motherMaiden: maiden,
        enrolledAtElapsedMs: st.sim.elapsedMs
      };
      if (!verdict.ok) {
        scheduleEnrollmentViolation(st, BANK_ID, verdict.violation, IDENTITY_FINE_DELAY_DAYS);
      }
      return st;
    });

    const num = getState().accounts.find((x) => x.id === BANK_ID)?.accountNumber || '';
    patchSession((s) => {
      s.dmb = s.dmb || {};
      s.dmb.lastConfirmedAccount = num;
      s.dmb.browserSessionUser = user.toUpperCase();
    });

    if (verdict.ok) {
      toast('David & Mitchell: Welcome — your account is open.');
    } else {
      msg(`Application received. A ${IDENTITY_FINE_DELAY_DAYS}-day verification window applies; discrepancies may carry penalties.`);
    }
    navigate('dmb', 'confirm', { pushHistory: true });
    return true;
  }

  if (action === 'dmb-deposit' || action === 'dmb-withdraw' || action === 'dmb-transfer') {
    if (!isDmbSession()) {
      msg('Sign in again to continue.');
      navigate('dmb', '', { pushHistory: true });
      return true;
    }
    const a = acc();
    const pin = document.getElementById('dmb-txn-pin')?.value || '';
    if (pin !== (a?.enrolledPin || '')) {
      msg('Incorrect PIN. Transaction not posted.');
      return true;
    }

    if (action === 'dmb-deposit') {
      const amt = Math.floor(Number(val('dmb-dep')) || 0);
      if (amt < 1) {
        msg('Enter a valid deposit amount.');
        return true;
      }
      const flagged = complianceNoticeAmount(BANK_ID, amt);
      patchState((st) => {
        const x = st.accounts.find((y) => y.id === BANK_ID);
        if (!x) return st;
        x.balance = (x.balance || 0) + amt;
        pushTx(st, x, {
          type: 'DEPOSIT',
          amount: amt,
          balanceAfter: x.balance,
          description: 'Deposit',
          complianceFlag: flagged
        });
        appendBankingTransaction(st, {
          bankName: x.name,
          accountNumber: x.accountNumber,
          type: 'deposit',
          amount: amt,
          complianceFlag: flagged,
          description: 'Deposit'
        });
        return st;
      });
      msg(
        flagged
          ? 'Deposit posted. This transaction has been flagged for standard compliance review per Federal Mandate 2000-CR7.'
          : 'Deposit posted.'
      );
      navigate('dmb', '', { pushHistory: false });
      return true;
    }

    if (action === 'dmb-withdraw') {
      const amt = Math.floor(Number(val('dmb-wd')) || 0);
      if (amt < 1) {
        msg('Enter a valid withdrawal amount.');
        return true;
      }
      if ((a?.balance || 0) < amt) {
        msg('Insufficient funds — withdrawal not posted.');
        return true;
      }
      const flagged = complianceNoticeAmount(BANK_ID, amt);
      patchState((st) => {
        const x = st.accounts.find((y) => y.id === BANK_ID);
        if (!x) return st;
        x.balance = (x.balance || 0) - amt;
        pushTx(st, x, {
          type: 'WITHDRAWAL',
          amount: -amt,
          balanceAfter: x.balance,
          description: 'Withdrawal',
          complianceFlag: flagged
        });
        appendBankingTransaction(st, {
          bankName: x.name,
          accountNumber: x.accountNumber,
          type: 'withdraw',
          amount: amt,
          complianceFlag: flagged,
          description: 'Withdrawal'
        });
        return st;
      });
      msg(
        flagged
          ? 'Withdrawal posted. This transaction has been flagged for standard compliance review per Federal Mandate 2000-CR7.'
          : 'Withdrawal posted.'
      );
      navigate('dmb', '', { pushHistory: false });
      return true;
    }

    if (action === 'dmb-transfer') {
      const destRaw = val('dmb-xfer-to');
      const amt = Math.floor(Number(val('dmb-xfer-amt')) || 0);
      if (amt < 1) {
        msg('Enter a valid transfer amount.');
        return true;
      }
      if ((a?.balance || 0) < amt) {
        msg('Insufficient funds for this transfer.');
        return true;
      }
      const dst = findAccountByFullNumber(getState(), destRaw);
      if (!dst) {
        msg('Transfer failed — destination account number not found.');
        return true;
      }
      if (dst.accountNumber && a.accountNumber && dst.accountNumber === a.accountNumber) {
        msg('Cannot transfer to the same account.');
        return true;
      }
    let complianceFlag = complianceNoticeAmount(BANK_ID, amt) || complianceNoticeAmount(dst.id, amt);
      if (amt > 10000) complianceFlag = true;

      patchState((st) => {
        const src = st.accounts.find((y) => y.id === BANK_ID);
        const d = findAccountByFullNumber(st, destRaw);
        if (!src || !d || (src.balance || 0) < amt) return st;
        src.balance = (src.balance || 0) - amt;
        d.balance = (d.balance || 0) + amt;
        pushTx(st, src, {
          type: 'TRANSFER OUT',
          amount: -amt,
          balanceAfter: src.balance,
          description: `To ${d.accountNumber}`,
          complianceFlag
        });
        pushTx(st, d, {
          type: 'TRANSFER IN',
          amount: amt,
          balanceAfter: d.balance,
          description: `From ${src.accountNumber}`,
          complianceFlag
        });
        appendBankingTransaction(st, {
          bankName: src.name,
          accountNumber: src.accountNumber,
          type: 'transfer',
          amount: amt,
          destinationAccountNumber: d.accountNumber,
          destinationBank: d.name,
          complianceFlag,
          description: 'Interbank transfer'
        });
        return st;
      });
      msg(
        complianceFlag
          ? 'Transfer completed. This transaction has been flagged for standard compliance review per Federal Mandate 2000-CR7.'
          : 'Transfer completed.'
      );
      navigate('dmb', '', { pushHistory: false });
      return true;
    }
  }

  return false;
}

export function dmbPageTitle() {
  return 'David & Mitchell Banking';
}
