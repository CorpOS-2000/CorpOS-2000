import { resolveNarrative } from './d20.js';
import { escapeHtml } from './identity.js';
import { TOAST_KEYS, toast } from './toast.js';
import { worldnetPages } from './worldnet-pages.js';
import { BANK_META } from './bank-pages.js';
import { bankHtmlForPageKey, bindBankRoot, installBankWindowGlobals } from './bank-ui.js';
import {
  getGameEpochMs, getState, patchState,
  cancelSoftwareInstall, getInstallStatus, queueSoftwareInstall
} from './gameState.js';
import { smsToPlayer } from './black-cherry.js';
import { getSessionState, patchSession } from './sessionState.js';
import {
  ROOT_URL_BY_PAGE,
  urlForPage,
  resolveLocationFromAddress,
  renderWorldWideWebRegistryHtml,
  getWorldNetSiteDirectoryLinks,
  getRegisteredShopHosts,
  titleForWorldNetPage
} from './worldnet-routes.js';
import { renderPageDefinitionHtml } from './worldnet-page-renderer.js';
import { getStoreById } from './worldnet-shop.js';
import { renderDmbPage, dispatchDmbAction, dmbPageTitle } from './david-mitchell-bank.js';
import { initWorldNetAds, getAdsApi, mountPage } from './worldnet-ads.js';
import {
  renderShopHtml,
  bindShopRoot,
  initWorldNetShop,
  getShopApi,
  urlForShopSubPath,
  shopBrowserTitle
} from './worldnet-shop.js';
import {
  formatSoftwarePurchasePrice,
  getInstallableApp,
  getSoftwarePurchasePriceUsd,
  listInstallableApps
} from './installable-apps.js';
import { mountReviewBomberFeed, teardownReviewBomberFeed } from './review-bomber-feed.js';
import { mountYourspace, teardownYourspace } from './yourspace-feed.js';
import { mountMytube, teardownMytube } from './mytube-feed.js';
import { mountPipelineLiveComments, teardownPipelineLiveComments } from './pipeline-live-comments.js';
import { mountY2kForms, teardownY2kForms } from './worldnet-y2k-forms.js';
import {
  renderMoogleAbout,
  renderMoogleDirectory,
  renderMoogleGroups,
  renderMoogleHome,
  renderMoogleImages,
  renderMoogleSearchResults,
  runMoogleFeelingMoody,
  runMoogleSearch
} from './moogle.js';
import { submitBusinessRegistration } from './business-registry-tick.js';
import { ActorDB } from '../engine/ActorDB.js';
import { renderMoogleMapsPage, mountMoogleMaps, teardownMoogleMaps } from './moogle-maps.js';
import { mountWarehousePage } from './warehouse-tick.js';
import { mountMarketPulsePage } from './market-pulse-page.js';
import { initDailyHerald } from './daily-herald.js';
import { CORPOS_GATED_PAGE_KEYS, renderGateInterstitial } from './corpos-enrollment.js';
import { simpleHash, deliverCorpOSWelcomePacket } from './jeemail-corpos.js';
import { SMS } from './bc-sms.js';
import { renderFocsMandateHtml, renderCorposPortalHtml } from './worldnet-gov-pages.js';

let pages = { ...worldnetPages };
let historyEntries = [];
let historyIndex = -1;
let notFoundAddress = '';
let activeTransferDialogAppId = '';
let transferDialogDelegated = false;

export let currentPageKey = 'moogle_home';
export let currentSubPath = '';

function ui() {
  return {
    addr: document.getElementById('wnet-addr'),
    content: document.getElementById('wnet-content'),
    status: document.getElementById('wnet-status'),
    favPanel: document.getElementById('wnet-fav-panel')
  };
}

function knownHosts() {
  const hosts = new Set();
  for (const u of Object.values(ROOT_URL_BY_PAGE)) {
    try {
      hosts.add(new URL(u).hostname.toLowerCase());
    } catch {
      /* ignore invalid */
    }
  }
  for (const h of getRegisteredShopHosts()) {
    hosts.add(String(h).toLowerCase());
  }
  hosts.add('wahoo.net');
  hosts.add('www.wahoo.net');
  return hosts;
}

function isKnownAddress(raw) {
  const t = String(raw || '').trim();
  if (!t) return true;
  try {
    const parsed = new URL(t.includes('://') ? t : `http://${t}`);
    return knownHosts().has(parsed.hostname.toLowerCase());
  } catch {
    const low = t.toLowerCase();
    return (
      low.includes('wahoo') ||
      low.includes('worldnet') ||
      low.includes('jeemail') ||
      low.includes('bank') ||
      low.includes('ssa') ||
      low.includes('biz') ||
      low.includes('onion') ||
      low.includes('firsttrust') ||
      low.includes('davidmitchell') ||
      low.includes('99669') ||
      low.includes('rapidmart') ||
      low.includes('yourspace') ||
      low.includes('mytube') ||
      low.includes('moogle') ||
      low.includes('focs') ||
      low.includes('corpos')
    );
  }
}

function defaultNotFoundHtml() {
  const shown = notFoundAddress || 'Unknown address';
  return `<div class="iebody">
<h1 style="font-size:18px;color:#0a246a;font-family:Arial,sans-serif;">Page Not Found</h1>
<div style="font-size:10px;color:#666;margin-bottom:8px;">WorldNet Explorer 5.0 — CorpOS 2000</div>
<p style="font-size:11px;margin-bottom:10px;">The page or address you requested could not be located.</p>
<div style="border:1px solid #cc9900;background:#fff8f0;padding:8px;font-size:11px;margin-bottom:10px;">
  <b>Address:</b> ${shown}
</div>
<div style="display:flex;gap:8px;align-items:center;">
  <a data-nav="home">Return to Wahoo Home</a>
  <a data-nav="web_registry">Open World Wide Web Registry</a>
</div>
</div>`;
}

function renderDeadSiteHtml(pageEntry) {
  const url = escapeHtml(pageEntry.url || 'this address');
  return `<div class="iebody" style="display:flex;align-items:center;justify-content:center;min-height:400px;background:#ffffff;">
<table width="480" bgcolor="#fffef0" border="1" bordercolor="#cc0000" cellpadding="20">
  <tr bgcolor="#cc0000"><td align="center">
    <font face="Arial" size="4" color="white"><b>⚠ Cannot Display Webpage</b></font>
  </td></tr>
  <tr><td>
    <font face="Arial" size="2"><b>WorldNet Explorer cannot display this page.</b></font>
    <br><br>
    <font face="Arial" size="2" color="#666666">The website at <b>${url}</b> is not responding.</font>
    <br><br>
    <table width="100%" bgcolor="#f8f8f8" border="1" bordercolor="#dddddd" cellpadding="6">
      <tr><td><font face="Arial" size="2">
        • The website may be temporarily offline.<br>
        • The server may be experiencing technical difficulties.<br>
        • The domain may no longer be active.<br>
        • Network connectivity issues may be affecting this address.
      </font></td></tr>
    </table>
    <br>
    <font face="Arial" size="1" color="#999999">
      Error Code: HTTP 503 — Service Unavailable<br>
      Attempted: ${url}<br>
      WorldNet Explorer 5.0 · Mandate 2000-CR7 Compliant
    </font>
    <br><br>
    <a href="#" data-nav="home" style="font-size:11px;margin-right:12px;">Go to Wahoo!</a>
  </td></tr>
</table>
</div>`;
}

function renderWahooHome() {
  const s = getSessionState();
  const user = s.wahoo.currentUser;
  const account = user ? s.wahoo.accounts[user] : null;
  const top = `<div style="display:flex;justify-content:flex-end;gap:10px;font-size:11px;margin-bottom:6px;">
    ${
      user
        ? `<span>Hello, <b>${user}</b></span><a data-nav="wahoo_account">My Account</a><a data-action="wahoo-logout">Sign Out</a>`
        : `<a data-nav="wahoo_login">Sign In</a><a data-nav="wahoo_register">Create Account</a>`
    }
  </div>`;
  const extra = `<div style="margin-top:8px;border:1px solid #ccc;background:#fff;padding:6px;">
    <b>Popular services:</b>
    <a data-nav="jeemail_login" style="margin-left:8px;">JeeMail</a>
    <a data-nav="jeemail_register" style="margin-left:8px;">Get a JeeMail address</a>
    ${
      account?.contact
        ? `<span style="margin-left:12px;color:#666;">Contact: ${account.contact}</span>`
        : ''
    }
  </div>`;
  const base = pages.home || worldnetPages.home;
  return base.replace('<div class="iebody">', `<div class="iebody">${top}`).replace('</div></div>', `${extra}</div></div>`);
}

function renderFraPage() {
  const p = getState().player;
  const ssnTail = p.ssnFull ? `\u2026${String(p.ssnFull).slice(-4)}` : 'N/A';
  return `<div class="iebody" data-wn-ad-page="fra">
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div></aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<div style="text-align:center;margin-bottom:8px;">
<h1 style="font-size:18px;color:#0a246a;font-family:'Times New Roman',serif;">Federal Revenue Authority</h1>
<div style="font-size:10px;color:#666;">Department of Commercial Taxation &nbsp;|&nbsp; CorpOS 2000 Integrated Portal</div>
<div style="font-size:10px;color:#888;margin-top:2px;">Federal Mandate 2000-CR7 &mdash; Tax Compliance Division</div>
</div>
<div style="border:2px solid #0a246a;background:#f8f8ff;padding:10px 14px;margin-bottom:10px;">
<h3 style="font-size:12px;color:#0a246a;margin-bottom:6px;">Citizen Record</h3>
<table style="font-size:11px;border-collapse:collapse;width:100%;">
<tr><td style="padding:3px 6px;color:#555;width:130px;">Name:</td><td style="padding:3px 6px;">${escapeHtml(p.displayName || 'Not registered')}</td></tr>
<tr><td style="padding:3px 6px;color:#555;">SSN (last 4):</td><td style="padding:3px 6px;">${escapeHtml(ssnTail)}</td></tr>
<tr><td style="padding:3px 6px;color:#555;">Filing Status:</td><td style="padding:3px 6px;color:#006600;">Active — No Outstanding Obligations</td></tr>
</table>
</div>
<h2 style="font-size:13px;color:#0a246a;">Available Services</h2>
<table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px;">
<tr style="background:#e8ecf8;"><th style="text-align:left;padding:4px 6px;">Service</th><th style="text-align:left;padding:4px 6px;">Status</th><th style="text-align:left;padding:4px 6px;">Note</th></tr>
<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Employer Identification Number (EIN)</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;color:#006600;">Available</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Required before filing business taxes</td></tr>
<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Individual Tax Return (Form 2000-A)</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;color:#cc6600;">Coming Soon</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Annual filing deadline: April 15</td></tr>
<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Business Tax Filing</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;color:#cc6600;">Coming Soon</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Requires registered business + EIN</td></tr>
<tr><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Tax Payment Portal</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;color:#cc6600;">Coming Soon</td><td style="padding:4px 6px;border-bottom:1px solid #ddd;">Electronic payment processing</td></tr>
</table>
<div style="padding:8px;background:#fff8f0;border:1px solid #cc9900;font-size:10px;margin-bottom:8px;">
<b>NOTICE:</b> All businesses operating within CorpOS jurisdiction must register with the Federal Revenue Authority and obtain an EIN before commencing commercial operations. Failure to comply may result in penalties under Section 12 of the Commercial Systems Act.
</div>
<div style="padding:8px;background:#e8ecf8;border:2px inset #d4d0c8;font-size:10px;color:#333;">
Federal Revenue Authority &mdash; Compliance Division<br>
All tax records verified per Federal Mandate 2000-CR7<br>
<span style="font-size:9px;color:#888;">&copy; 2000 Federal Office of Commercial Systems</span>
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:8px;"></div>
</div>
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div></aside>
</div>
</div>`;
}

function renderDevtoolsPage() {
  const base = pages.devtools || worldnetPages.devtools || defaultNotFoundHtml();
  return base.replace(
    /<div data-devtools-app="([^"]+)"><\/div>/g,
    (_match, appId) => renderDevtoolsAppCard(appId)
  );
}

function renderBackroomsPage() {
  const base = pages.backrooms || worldnetPages.backrooms || defaultNotFoundHtml();
  return base.replace(
    /<div data-backrooms-app="([^"]+)"><\/div>/g,
    (_match, appId) => renderBackroomsAppCard(appId)
  );
}

function renderBackroomsAppCard(appId) {
  const app = getInstallableApp(appId);
  if (!app) return '';
  const status = getInstallStatus(appId);
  let buttonLabel = '[ DOWNLOAD ]';
  let disabled = '';
  let btnBg = '#1a0000';
  let btnBorder = '#ff0000';
  if (status.state === 'downloading') {
    buttonLabel = '[ DOWNLOADING... ]';
    disabled = 'disabled';
    btnBg = '#0a0a0a';
    btnBorder = '#333';
  } else if (status.state === 'installing') {
    buttonLabel = '[ INSTALLING... ]';
    disabled = 'disabled';
    btnBg = '#0a0a0a';
    btnBorder = '#333';
  } else if (status.state === 'installed') {
    buttonLabel = '[ INSTALLED ]';
    disabled = 'disabled';
    btnBg = '#001a00';
    btnBorder = '#004400';
  }
  const activeTransfer = status.state === 'downloading' || status.state === 'installing' || status.state === 'aborting';
  return `<div style="border:1px solid #003300;background:#0a0a0a;padding:10px;">
<div style="display:flex;align-items:flex-start;gap:10px;">
  <div style="font-size:28px;line-height:1;filter:hue-rotate(90deg);">${app.icon}</div>
  <div style="flex:1;">
    <div style="font-weight:bold;color:#00ff41;font-size:13px;letter-spacing:1px;">${escapeHtml(app.label)}</div>
    <div style="font-size:10px;color:#006600;line-height:1.4;margin-top:3px;">${escapeHtml(app.description)}</div>
    <div style="font-size:9px;color:#004400;margin-top:5px;">
      Source: <span style="color:#ff0000;">${escapeHtml(app.sourceHost)}</span> &nbsp;|&nbsp;
      Trust: <span style="color:#ff0000;">UNVERIFIED — USE AT OWN RISK</span> &nbsp;|&nbsp;
      Delivery: encrypted tunnel
    </div>
    <div style="margin-top:5px;font-size:12px;font-weight:bold;color:#ff0000;">${escapeHtml(formatSoftwarePurchasePrice(app))}</div>
    <div style="margin-top:4px;display:inline-block;padding:2px 6px;border:1px solid #660000;background:#1a0000;color:#ff4444;font-size:9px;font-weight:bold;letter-spacing:1px;">⚠ NOT CORPOS CERTIFIED — FLAGGED AS HOSTILE SOFTWARE</div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
      <button type="button" data-action="install-app" data-install-app-id="${escapeHtml(app.id)}"
        style="height:26px;padding:0 16px;background:${btnBg};color:#ff0000;border:1px solid ${btnBorder};cursor:pointer;font-family:'Courier New',monospace;font-size:11px;font-weight:bold;letter-spacing:2px;" ${disabled}>${escapeHtml(buttonLabel)}</button>
      ${activeTransfer ? `<button type="button" data-action="open-install-window" data-install-app-id="${escapeHtml(app.id)}" style="height:26px;padding:0 10px;background:#0a0a0a;color:#006600;border:1px solid #003300;cursor:pointer;font-family:'Courier New',monospace;font-size:10px;">STATUS</button>` : ''}
    </div>
  </div>
</div>
</div>`;
}

function ensureCorpOsConfirmDialog() {
  let overlay = document.getElementById('corpos-confirm-dialog');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'corpos-confirm-dialog';
  overlay.className = 'corpos-confirm is-hidden';
  overlay.innerHTML = `
    <div class="corpos-confirm__panel" role="dialog" aria-modal="true" aria-labelledby="corpos-confirm-title">
      <div class="corpos-confirm__titlebar">
        <span class="corpos-confirm__title" id="corpos-confirm-title">CorpOS Confirmation</span>
      </div>
      <div class="corpos-confirm__body">
        <div class="corpos-confirm__icon">💾</div>
        <div class="corpos-confirm__copy">
          <div class="corpos-confirm__message" id="corpos-confirm-message"></div>
          <div class="corpos-confirm__detail" id="corpos-confirm-detail"></div>
        </div>
      </div>
      <div class="corpos-confirm__actions">
        <button type="button" class="corpos-confirm__btn corpos-confirm__btn--primary" data-confirm-yes>Download</button>
        <button type="button" class="corpos-confirm__btn" data-confirm-no>Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function showCorpOsConfirm({ message, detail, confirmLabel, onConfirm }) {
  const overlay = ensureCorpOsConfirmDialog();
  const msg = overlay.querySelector('#corpos-confirm-message');
  const det = overlay.querySelector('#corpos-confirm-detail');
  const yes = overlay.querySelector('[data-confirm-yes]');
  const no = overlay.querySelector('[data-confirm-no]');
  if (!msg || !det || !yes || !no) return;
  msg.textContent = message;
  det.textContent = detail || '';
  if (confirmLabel) yes.textContent = confirmLabel;
  else yes.textContent = 'Download';
  overlay.classList.remove('is-hidden');

  const close = () => {
    overlay.classList.add('is-hidden');
    yes.textContent = 'Download';
    yes.removeEventListener('click', handleYes);
    no.removeEventListener('click', handleNo);
    overlay.removeEventListener('click', handleOverlay);
  };
  const handleYes = () => {
    close();
    onConfirm?.();
  };
  const handleNo = () => close();
  const handleOverlay = (e) => {
    if (e.target === overlay) close();
  };

  yes.addEventListener('click', handleYes);
  no.addEventListener('click', handleNo);
  overlay.addEventListener('click', handleOverlay);
}

function installTrustMeta(app) {
  return {
    verified:   { text: 'CorpOS verified',                  color: '#006600', bg: '#e8ffe8', border: '#3a8f3a' },
    unknown:    { text: 'Unknown to CorpOS',                color: '#8a6d00', bg: '#fff8d8', border: '#c9a227' },
    unverified: { text: 'Unverified — not CorpOS certified', color: '#8b0000', bg: '#fff0f0', border: '#cc6666' },
    untrusted:  { text: 'CorpOS does not trust this file',  color: '#8b0000', bg: '#ffe9e9', border: '#cc6666' }
  }[app?.trustLevel || 'unknown'];
}

function ensureCorpOsTransferDialog() {
  let overlay = document.getElementById('corpos-transfer-dialog');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'corpos-transfer-dialog';
    overlay.className = 'corpos-transfer is-hidden';
    overlay.innerHTML = `
    <div class="corpos-transfer__panel" role="dialog" aria-modal="true" aria-labelledby="corpos-transfer-title">
      <div class="corpos-transfer__titlebar">
        <span class="corpos-transfer__title" id="corpos-transfer-title">CorpOS Transfer Manager</span>
        <button type="button" class="corpos-transfer__close" data-transfer-close aria-label="Close">✕</button>
      </div>
      <div class="corpos-transfer__content"></div>
    </div>
  `;
    document.body.appendChild(overlay);
  }
  const bindTransferTitleClose = () => {
    const closeBtn = overlay.querySelector('[data-transfer-close]');
    if (!closeBtn || closeBtn.dataset.transferCloseBound === '1') return;
    closeBtn.dataset.transferCloseBound = '1';
    closeBtn.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeTransferDialog();
      },
      true
    );
  };
  bindTransferTitleClose();
  if (!transferDialogDelegated) {
    transferDialogDelegated = true;
    overlay.addEventListener(
      'click',
      (e) => {
        if (e.target === overlay) {
          closeTransferDialog();
          return;
        }
        const t = e.target;
        const el = t instanceof Element ? t : t?.parentElement;
        if (!el) return;
        if (el.closest('[data-transfer-close]')) {
          e.preventDefault();
          e.stopPropagation();
          closeTransferDialog();
          return;
        }
        const cancel = el.closest('[data-transfer-cancel]');
        if (cancel && !cancel.disabled) {
          const appId = cancel.getAttribute('data-install-app-id') || '';
          const res = cancelSoftwareInstall(appId);
          toast(res.message);
          refreshTransferDialog();
          if (currentPageKey === 'devtools' || currentPageKey === 'backrooms') navigate(currentPageKey, '', { pushHistory: false });
        }
      },
      false
    );
  }
  return overlay;
}

function closeTransferDialog() {
  const status = activeTransferDialogAppId ? getInstallStatus(activeTransferDialogAppId) : null;
  activeTransferDialogAppId = '';
  const overlay = document.getElementById('corpos-transfer-dialog');
  if (overlay) overlay.classList.add('is-hidden');
  if (status && (status.state === 'downloading' || status.state === 'installing' || status.state === 'aborting')) {
    toast({
      key: TOAST_KEYS.GENERIC,
      title: 'CorpOS Transfer Manager',
      message: 'Background download still in progress...',
      icon: '💾',
      autoDismiss: 4500
    });
  }
}

function renderTransferProgressRow(label, percent, color, detail) {
  return `<div class="corpos-transfer__meter-group">
    <div class="corpos-transfer__meter-label">
      <span>${escapeHtml(label)}</span>
      <span>${escapeHtml(detail)}</span>
    </div>
    <div class="corpos-transfer__meter">
      <div class="corpos-transfer__meter-fill" style="width:${Math.max(
        0,
        Math.min(100, percent)
      )}%;background:${escapeHtml(color)};"></div>
    </div>
  </div>`;
}

function renderTransferDialogBody(app, status) {
  const trustMeta = installTrustMeta(app);
  const downloadPct = Math.round((status.downloadProgress || 0) * 100);
  const installPct = Math.round((status.installProgress || 0) * 100);
  const cancelLocked = (status.totalProgress || 0) >= 0.75 || status.state === 'aborting';
  const cancelTitle = cancelLocked && status.state !== 'aborting' ? '(Safelock Installation Threshold)' : '';
  const phaseText =
    status.state === 'downloading'
      ? 'Downloading package from source host.'
      : status.state === 'installing'
      ? 'Installing application into CorpOS.'
      : `Aborting transfer. Estimated shutdown in ${Math.max(
          1,
          Math.ceil((status.abortRemainingMs || 0) / 1000)
        )}s.`;
  const installDetail =
    status.state === 'downloading'
      ? 'Waiting for download to complete'
      : status.state === 'installing'
      ? `${installPct}%`
      : 'Aborting...';
  const downloadDetail = status.state === 'aborting' ? `${downloadPct}% locked` : `${downloadPct}%`;
  return `<div class="corpos-transfer__body">
    <div class="corpos-transfer__hero">
      <div class="corpos-transfer__icon">${app.icon}</div>
      <div class="corpos-transfer__meta">
        <div class="corpos-transfer__app">${escapeHtml(app.label)}</div>
        <div class="corpos-transfer__desc">${escapeHtml(app.description)}</div>
        <div class="corpos-transfer__subline">Source: ${escapeHtml(app.sourceHost)} | Timed digital install</div>
        <div class="corpos-transfer__trust" style="border-color:${trustMeta.border};background:${trustMeta.bg};color:${trustMeta.color};">${escapeHtml(
          trustMeta.text
        )}</div>
      </div>
    </div>
    <div class="corpos-transfer__status">
      <div class="corpos-transfer__status-title">${
        status.state === 'aborting' ? 'Cancellation In Progress' : 'Transfer In Progress'
      }</div>
      <div class="corpos-transfer__status-copy">${escapeHtml(phaseText)}</div>
    </div>
    ${renderTransferProgressRow('Download', downloadPct, '#0a246a', downloadDetail)}
    ${renderTransferProgressRow('Installation', installPct, '#2f8f2f', installDetail)}
    <div class="corpos-transfer__actions corpos-transfer__actions--single">
      <button type="button" class="corpos-transfer__btn corpos-transfer__btn--danger corpos-transfer__btn--cancel-primary" data-transfer-cancel data-install-app-id="${escapeHtml(
        app.id
      )}" ${cancelLocked ? 'disabled' : ''} title="${escapeHtml(cancelTitle)}">${
        status.state === 'aborting' ? 'Aborting...' : 'Cancel Transfer'
      }</button>
    </div>
  </div>`;
}

function openTransferDialog(appId) {
  activeTransferDialogAppId = String(appId || '');
  refreshTransferDialog();
}

export function refreshTransferDialog() {
  const overlay = ensureCorpOsTransferDialog();
  if (!activeTransferDialogAppId) {
    overlay.classList.add('is-hidden');
    return;
  }
  const app = getInstallableApp(activeTransferDialogAppId);
  const status = getInstallStatus(activeTransferDialogAppId);
  if (!app || (status.state !== 'downloading' && status.state !== 'installing' && status.state !== 'aborting')) {
    closeTransferDialog();
    return;
  }
  const content = overlay.querySelector('.corpos-transfer__content');
  if (!content) return;
  content.innerHTML = renderTransferDialogBody(app, status);
  overlay.classList.remove('is-hidden');
}

function renderDevtoolsAppCard(appId) {
  const app = getInstallableApp(appId);
  if (!app) return '';
  const status = getInstallStatus(appId);
  let buttonLabel = 'Download & Install';
  let disabled = '';
  if (status.state === 'downloading') {
    buttonLabel = 'Downloading...';
    disabled = 'disabled';
  } else if (status.state === 'installing') {
    buttonLabel = 'Installing...';
    disabled = 'disabled';
  } else if (status.state === 'installed') {
    buttonLabel = 'Installed';
    disabled = 'disabled';
  }
  const trustMeta = installTrustMeta(app);
  const activeTransfer = status.state === 'downloading' || status.state === 'installing' || status.state === 'aborting';
  return `<div style="border:1px solid #aab4cc;background:#fff;padding:10px;">
<div style="display:flex;align-items:flex-start;gap:8px;">
  <div style="font-size:28px;line-height:1;">${app.icon}</div>
  <div style="flex:1;">
    <div style="font-weight:bold;color:#0a246a;font-size:12px;">${escapeHtml(app.label)}</div>
    <div style="font-size:10px;color:#555;line-height:1.4;margin-top:3px;">${escapeHtml(app.description)}</div>
    <div style="font-size:10px;color:#666;margin-top:5px;">Source: ${escapeHtml(
      app.sourceHost
    )} &nbsp;|&nbsp; Delivery: timed digital install</div>
    <div style="margin-top:5px;font-size:11px;font-weight:bold;color:#0a246a;">${escapeHtml(
      formatSoftwarePurchasePrice(app)
    )}</div>
    <div style="margin-top:6px;display:inline-block;padding:2px 6px;border:1px solid ${trustMeta.border};background:${trustMeta.bg};color:${trustMeta.color};font-size:10px;font-weight:bold;">${escapeHtml(
      trustMeta.text
    )}</div>
    <div style="margin-top:8px;display:flex;gap:8px;align-items:center;">
      <button type="button" data-action="install-app" data-install-app-id="${escapeHtml(
        app.id
      )}" style="height:24px;padding:0 12px;background:#0a246a;color:#fff;border:none;cursor:pointer;" ${disabled}>${escapeHtml(
        buttonLabel
      )}</button>
      ${
        activeTransfer
          ? `<button type="button" data-action="open-install-window" data-install-app-id="${escapeHtml(
              app.id
            )}" style="height:24px;padding:0 12px;background:#d4d0c8;color:#111;border:1px solid #666;cursor:pointer;">Open Transfer Window</button>`
          : ''
      }
      <span style="font-size:10px;color:${
        status.state === 'installed'
          ? '#006600'
          : status.state === 'installing' || status.state === 'downloading' || status.state === 'aborting'
            ? '#996600'
            : '#666'
      };">${escapeHtml(status.state)}</span>
    </div>
  </div>
</div>
</div>`;
}

function sendNewAccountSms(serviceName, line) {
  try {
    const simMs = getState().sim?.elapsedMs ?? 0;
    SMS.send({
      from: 'CORPOS_SYSTEM',
      message: `${serviceName}: ${line}`,
      gameTime: simMs
    });
  } catch {
    /* ignore */
  }
}

function renderWahooRegister() {
  return `<div class="iebody">
<h1 style="font-size:22px;color:#cc0000;font-family:'Times New Roman',serif;">Wahoo! Account Registration</h1>
<p style="font-size:11px;margin-bottom:10px;">Create your Wahoo identity to personalize your WorldNet portal.</p>
<table style="width:100%;max-width:520px;">
<tr><td style="width:180px;">Username</td><td><input id="wahoo-user" type="text" style="width:100%"></td></tr>
<tr><td>Password</td><td><input id="wahoo-pass" type="password" style="width:100%"></td></tr>
<tr><td>Date of Birth</td><td><input id="wahoo-dob" type="date" style="width:100%"></td></tr>
<tr><td>Security Question</td><td><input id="wahoo-secq" type="text" style="width:100%" placeholder="Your first company name?"></td></tr>
<tr><td>Mobile phone <span style="font-size:9px;color:#666;">(optional — SMS confirmation)</span></td><td><input id="wahoo-phone" type="tel" inputmode="numeric" autocomplete="off" placeholder="10 digits" style="width:100%"></td></tr>
</table>
<div style="margin-top:10px;"><button type="button" data-action="wahoo-register">Create Wahoo Account</button></div>
<div style="margin-top:8px;"><a data-nav="wahoo_login">Already registered? Sign in.</a></div>
</div>`;
}

function renderWahooLogin() {
  return `<div class="iebody">
<h1 style="font-size:22px;color:#cc0000;font-family:'Times New Roman',serif;">Wahoo! Sign In</h1>
<table style="width:100%;max-width:520px;">
<tr><td style="width:180px;">Username</td><td><input id="wahoo-login-user" type="text" style="width:100%"></td></tr>
<tr><td>Password</td><td><input id="wahoo-login-pass" type="password" style="width:100%"></td></tr>
</table>
<div style="margin-top:10px;"><button type="button" data-action="wahoo-login">Sign In</button></div>
<div style="margin-top:8px;"><a data-nav="wahoo_register">Create new account</a></div>
</div>`;
}

function renderWahooAccount() {
  const s = getSessionState();
  const user = s.wahoo.currentUser;
  if (!user || !s.wahoo.accounts[user]) return renderWahooLogin();
  const a = s.wahoo.accounts[user];
  return `<div class="iebody">
<h2>My Wahoo Account</h2>
<p><b>Username:</b> ${user}</p>
<p><b>Date of Birth:</b> ${a.dob || 'Not set'}</p>
<p><b>Security Question:</b> ${a.secq || 'Not set'}</p>
<table style="width:100%;max-width:520px;">
<tr><td style="width:180px;">Contact info</td><td><input id="wahoo-contact" type="text" value="${a.contact || ''}" style="width:100%" placeholder="Phone or alternate email"></td></tr>
</table>
<div style="margin-top:10px;"><button type="button" data-action="wahoo-save-settings">Save Settings</button></div>
<div style="margin-top:8px;"><a data-nav="home">Return to Wahoo Home</a></div>
</div>`;
}

function seedJeeMailInbox(email) {
  return [
    { from: 'team@jeemail.net', to: email, subject: 'Welcome to JeeMail!', body: 'Thanks for joining JeeMail. Your inbox is ready.', date: 'Jan 1, 2000' },
    { from: 'offers@rapidemart.net', to: email, subject: 'Limited-time modem deals', body: 'Get blazing 56k accessories.', date: 'Jan 1, 2000' },
    { from: 'alerts@corptools.biz', to: email, subject: 'Newsletter: Quarter 1 Trends', body: 'Business updates for growth-minded operators.', date: 'Jan 2, 2000' },
    { from: 'promo@an0n-ledger.tor.parody', to: email, subject: 'Private wealth opportunity', body: 'Open a discreet account today.', date: 'Jan 2, 2000' }
  ];
}

function jeemailCurrentAccount() {
  const s = getSessionState();
  const id = s.jeemail.currentUser;
  return id ? s.jeemail.accounts[id] : null;
}

function applyJeeMailComposePrefillFromSession() {
  const pf = getSessionState().jeemail?.composePrefill;
  if (!pf) return;
  queueMicrotask(() => {
    const toEl = document.getElementById('jeemail-to');
    const subEl = document.getElementById('jeemail-subject');
    const bodyEl = document.getElementById('jeemail-body');
    if (toEl && pf.to) toEl.value = pf.to;
    if (subEl && pf.subject != null) subEl.value = pf.subject;
    if (bodyEl && pf.body != null) bodyEl.value = pf.body;
    // Only clear when the compose form is present (logged in). Login page has no #jeemail-to — keep prefill for post-sign-in.
    if (toEl) {
      patchSession((s) => {
        if (s.jeemail) s.jeemail.composePrefill = null;
      });
    }
  });
}

function renderJeeMailLogin() {
  return `<div class="iebody">
<table style="width:100%;border:1px solid #99c;background:#eef7ff;">
<tr><td style="background:#003399;color:#fff;padding:6px;font-size:18px;font-weight:bold;">JeeMail</td></tr>
<tr><td style="padding:8px;font-size:11px;">The fastest mailbox on WorldNet.</td></tr>
</table>
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin-top:6px;"></div>
<div style="display:flex;gap:12px;align-items:flex-start;margin-top:8px;">
<div style="flex:1;min-width:0;">
<table style="width:100%;max-width:520px;">
<tr><td style="width:180px;">Email</td><td><input id="jeemail-login-user" type="text" placeholder="you@jeemail.net" style="width:100%"></td></tr>
<tr><td>Password</td><td><input id="jeemail-login-pass" type="password" style="width:100%"></td></tr>
</table>
<div style="margin-top:10px;">
  <button type="button" data-action="jeemail-login">Sign In</button>
  <button type="button" data-nav="jeemail_register">Register</button>
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:10px;"></div>
</div>
<aside style="width:126px;flex-shrink:0;">
<div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div>
<div data-wnet-ad-slot="right-rail-secondary" data-wnet-ad-region="right-rail"></div>
</aside>
</div>
</div>`;
}

function renderJeeMailRegister() {
  return `<div class="iebody">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin-bottom:6px;"></div>
<h1 style="font-size:22px;color:#003399;">Create your JeeMail account</h1>
<div id="jeemail-reg-form">
  <div style="margin-bottom:6px;">
    <label style="font-size:11px;">Choose a username</label>
    <div style="display:flex;align-items:center;gap:4px;">
      <input type="text" id="jeemail-reg-username" autocomplete="off" maxlength="30" style="width:200px;">
      <span style="font-size:11px;color:#666;">@jeemail.net</span>
    </div>
  </div>
  <div style="margin-bottom:6px;">
    <label style="font-size:11px;">Password</label>
    <input type="password" id="jeemail-reg-password" maxlength="50" style="width:200px;">
  </div>
  <div style="margin-bottom:6px;">
    <label style="font-size:11px;">Confirm password</label>
    <input type="password" id="jeemail-reg-confirm" maxlength="50" style="width:200px;">
  </div>
  <div style="margin-bottom:6px;">
    <label style="font-size:11px;">Mobile phone <span style="color:#cc0000;">*</span> <span style="font-size:9px;color:#666;">(required — SMS verification)</span></label>
    <input type="tel" id="jeemail-reg-phone" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="5551234567" style="width:200px;">
  </div>
  <div id="jeemail-reg-error" style="display:none;color:#cc0000;font-size:10px;margin-top:4px;"></div>
  <div style="margin-top:10px;"><button type="button" data-action="jeemail-register">Create Account</button></div>
  <div style="margin-top:6px;font-size:9px;color:#666;">
    By registering, you acknowledge that all communications sent through JeeMail
    are subject to monitoring per Federal Mandate 2000-CR7.
  </div>
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:6px;"></div>
<div style="margin-top:8px;"><a data-nav="jeemail_login">Already have an account? Sign in</a></div>
</div>`;
}

function mailListHtml(title, rows) {
  const body = rows
    .map((m, i) => `<tr><td>${m.date}</td><td>${m.from}</td><td><a data-action="jeemail-open-msg" data-msg-index="${i}" data-msg-box="${title.toLowerCase()}">${m.subject}</a></td></tr>`)
    .join('');
  return `<table style="width:100%;border-collapse:collapse;"><tr style="background:#003399;color:#fff;"><th>Date</th><th>From</th><th>Subject</th></tr>${body || '<tr><td colspan="3">No messages.</td></tr>'}</table>`;
}

function renderJeeMailInbox() {
  const acc = jeemailCurrentAccount();
  if (!acc) return renderJeeMailLogin();
  return `<div class="iebody">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
  <h2 style="margin:0;">JeeMail Inbox (${acc.email})</h2>
  <div><a data-nav="jeemail_compose">Compose</a> | <a data-nav="jeemail_sent">Sent</a> | <a data-nav="jeemail_trash">Trash</a> | <a data-action="jeemail-logout">Log out</a></div>
</div>
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin-bottom:8px;"></div>
${mailListHtml('inbox', acc.inbox || [])}
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:8px;"></div>
</div>`;
}

function renderJeeMailSent() {
  const acc = jeemailCurrentAccount();
  if (!acc) return renderJeeMailLogin();
  return `<div class="iebody"><div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin-bottom:8px;"></div><h2>Sent Mail</h2><div><a data-nav="jeemail_inbox">Inbox</a> | <a data-nav="jeemail_compose">Compose</a> | <a data-nav="jeemail_trash">Trash</a></div>${mailListHtml('sent', acc.sent || [])}</div>`;
}

function renderJeeMailTrash() {
  const acc = jeemailCurrentAccount();
  if (!acc) return renderJeeMailLogin();
  return `<div class="iebody"><div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin-bottom:8px;"></div><h2>Trash</h2><div><a data-nav="jeemail_inbox">Inbox</a> | <a data-nav="jeemail_compose">Compose</a> | <a data-nav="jeemail_sent">Sent</a></div>${mailListHtml('trash', acc.trash || [])}</div>`;
}

function renderJeeMailCompose() {
  const acc = jeemailCurrentAccount();
  if (!acc) return renderJeeMailLogin();
  return `<div class="iebody">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin-bottom:8px;"></div>
<h2>Compose Message</h2>
<table style="width:100%;max-width:640px;">
  <tr><td style="width:80px;">To</td><td><input id="jeemail-to" type="text" style="width:100%"></td></tr>
  <tr><td>Subject</td><td><input id="jeemail-subject" type="text" style="width:100%"></td></tr>
  <tr><td>Body</td><td><textarea id="jeemail-body" style="width:100%;height:180px;"></textarea></td></tr>
</table>
<div style="margin-top:10px;">
  <button type="button" data-action="jeemail-send">Send</button>
  <button type="button" data-nav="jeemail_inbox">Cancel</button>
</div>
</div>`;
}

function renderJeeMailConfirm() {
  return `<div class="iebody"><div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin-bottom:8px;"></div><h2>Message Sent</h2><p>Your message has been queued for WorldNet delivery.</p><a data-nav="jeemail_inbox">Return to Inbox</a></div>`;
}

function renderJeeMailRead() {
  const acc = jeemailCurrentAccount();
  if (!acc) return renderJeeMailLogin();
  const om = getSessionState().jeemail.openMessage;
  if (!om) return renderJeeMailInbox();
  const box = acc[om.box];
  const msg = box?.[om.index];
  if (!msg) return renderJeeMailInbox();
  const bodyContent = msg.bodyHtml
    ? `<div class="jm-html-body" style="padding:8px;background:#fff;border:1px solid #ccc;">${msg.bodyHtml}</div>`
    : `<pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${escapeHtml(msg.body || '')}</pre>`;
  return `<div class="iebody">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
  <h2 style="margin:0;">JeeMail (${acc.email})</h2>
  <div><a data-nav="jeemail_inbox">Inbox</a> | <a data-nav="jeemail_sent">Sent</a> | <a data-nav="jeemail_trash">Trash</a> | <a data-action="jeemail-logout">Log out</a></div>
</div>
<div style="background:#eef;padding:6px 8px;border:1px solid #99c;margin-bottom:8px;">
  <div style="font-size:12px;font-weight:bold;">${escapeHtml(msg.subject || '(no subject)')}</div>
  <div style="font-size:10px;color:#555;margin-top:2px;">From: ${escapeHtml(msg.fromName || msg.from || 'Unknown')} &lt;${escapeHtml(msg.from || '')}&gt;</div>
  <div style="font-size:10px;color:#555;">Date: ${escapeHtml(msg.date || '')}</div>
</div>
${bodyContent}
<div style="margin-top:10px;"><a data-nav="jeemail_inbox">&laquo; Back to Inbox</a></div>
</div>`;
}

function renderWahooSearchResults(query) {
  const q = query || '';
  const resultDefs = [
    { label: 'Business registration services', nav: 'bizreg', url: 'www.fedbizreg.gov' },
    { label: 'Online banking portal', nav: 'bank', url: 'www.firstnationalcorp.com' },
    { label: 'Stock market tracker', nav: 'stocks', url: 'market.worldnet.com' },
    { label: 'JeeMail webmail service', nav: 'jeemail_login', url: 'mail.jeemail.net' },
    { label: 'Government compliance portal', nav: 'ssa', url: 'www.ssa.gov.net' }
  ];
  const results = resultDefs
    .map(
      (r) =>
        `<div style="margin-bottom:10px;"><a data-nav="${r.nav}" style="font-size:14px;cursor:pointer;">${r.label}</a><br><span style="color:#006600;font-size:10px;">http://${r.url}/</span><br><span style="font-size:11px;">Find information about ${r.label.toLowerCase()} on WorldNet.</span></div>`
    )
    .join('');
  return `<div class="iebody"><h2>Wahoo! Search: "${q}"</h2><p style="color:#666;font-size:11px;margin-bottom:8px;">About 4,820,000 results (0.31 seconds)</p>${results}</div>`;
}

function renderBizDirectoryPanel() {
  const apps = getState().businessRegistry?.applications || [];
  if (!apps.length) {
    return '<p style="font-size:10px;color:#777;line-height:1.45;">No registered businesses yet. <a data-nav="bizreg" href="#" style="color:#000080;">File a registration</a>.</p>';
  }
  const rows = apps.map((a, i) => {
    const bg = i % 2 ? '#f3eaff' : '#fff';
    if (a.status === 'approved') {
      const link = a.pageId
        ? `<a data-nav="pipeline_page" data-wnet-subpath="${escapeHtml(a.pageId)}" href="#" style="color:#000080;font-weight:bold;text-decoration:underline;">${escapeHtml(a.tradingName)}</a>`
        : escapeHtml(a.tradingName);
      const shopLink = a.storeId
        ? ` · <a data-nav="wn_shop" data-wnet-subpath="${escapeHtml(a.storeId + '/home')}" href="#" style="color:#006600;font-size:10px;">Shop</a>`
        : '';
      return `<tr style="background:${bg};"><td style="padding:4px 8px;font-size:11px;">${link}${shopLink}</td><td style="padding:4px 8px;font-size:10px;">${escapeHtml(a.industry)}</td><td style="padding:4px 8px;font-size:10px;color:#006600;font-weight:bold;">Active</td></tr>`;
    }
    const dueDate = new Date(getGameEpochMs() + a.approvalDueSimMs);
    const dueStr = dueDate.toUTCString().slice(0, 16);
    return `<tr style="background:${bg};"><td style="padding:4px 8px;font-size:11px;">${escapeHtml(a.tradingName)}</td><td style="padding:4px 8px;font-size:10px;">${escapeHtml(a.industry)}</td><td style="padding:4px 8px;font-size:10px;color:#cc6600;">Processing (est. ${escapeHtml(dueStr)})</td></tr>`;
  }).join('');
  return `<table style="width:100%;border-collapse:collapse;border:1px solid #999;background:#fff;">
<tr style="background:#990099;color:#fff;font-size:10px;"><th style="text-align:left;padding:4px 8px;">Business</th><th style="text-align:left;padding:4px 8px;">Industry</th><th style="text-align:left;padding:4px 8px;">Status</th></tr>
${rows}
</table>
<p style="font-size:9px;color:#888;margin-top:4px;"><a data-nav="bizreg" href="#" style="color:#000080;">Register a new business</a></p>`;
}

let _peopleDirectoryPage = 0;
const PEOPLE_PAGE_SIZE = 50;

function renderPeopleDirectoryPanel() {
  const db = window.ActorDB;
  if (!db || !db.count || db.count() === 0) {
    return '<p style="font-size:10px;color:#777;line-height:1.45;">Directory loading... check back after system initialization.</p>';
  }
  const actors = db.getAll('social')
    .filter((a) => a.public_profile?.display_name)
    .sort((a, b) => (a.full_legal_name || '').localeCompare(b.full_legal_name || ''));

  if (!actors.length) {
    return '<p style="font-size:10px;color:#777;">No public citizen records found.</p>';
  }

  const totalPages = Math.ceil(actors.length / PEOPLE_PAGE_SIZE);
  _peopleDirectoryPage = Math.max(0, Math.min(_peopleDirectoryPage, totalPages - 1));
  const start = _peopleDirectoryPage * PEOPLE_PAGE_SIZE;
  const page = actors.slice(start, start + PEOPLE_PAGE_SIZE);

  const rows = page.map((a, i) => {
    const bg = i % 2 ? '#f3eaff' : '#fff';
    const name = escapeHtml(a.public_profile?.display_name || a.full_legal_name || 'Unknown');
    const prof = escapeHtml(a.public_profile?.occupation || a.profession || '—');
    const city = a.home_address?.city ? escapeHtml(a.home_address.city) : 'Hargrove';
    const role = a.is_player ? ' <span style="color:#0a246a;font-weight:bold;font-size:9px;">(You)</span>' : '';
    return `<tr style="background:${bg};">
<td style="padding:4px 8px;font-size:11px;">${name}${role}</td>
<td style="padding:4px 8px;font-size:10px;">${prof}</td>
<td style="padding:4px 8px;font-size:10px;">${city}, CA</td>
</tr>`;
  }).join('');

  const prevDisabled = _peopleDirectoryPage <= 0;
  const nextDisabled = _peopleDirectoryPage >= totalPages - 1;
  const pager = totalPages > 1
    ? `<div style="margin-top:6px;display:flex;align-items:center;gap:8px;font-size:10px;">
        <button data-action="people-dir-prev" style="padding:2px 8px;font-size:10px;cursor:${prevDisabled ? 'default' : 'pointer'};${prevDisabled ? 'opacity:.4;' : ''}" ${prevDisabled ? 'disabled' : ''}>&laquo; Prev</button>
        <span>Page ${_peopleDirectoryPage + 1} of ${totalPages} &nbsp;(${actors.length} citizens)</span>
        <button data-action="people-dir-next" style="padding:2px 8px;font-size:10px;cursor:${nextDisabled ? 'default' : 'pointer'};${nextDisabled ? 'opacity:.4;' : ''}" ${nextDisabled ? 'disabled' : ''}>Next &raquo;</button>
       </div>`
    : '';

  return `<p style="font-size:10px;color:#666;margin-bottom:6px;line-height:1.4;">Registered citizens (public records). Showing ${start + 1}–${start + page.length} of ${actors.length} profiles.</p>
<table style="width:100%;border-collapse:collapse;border:1px solid #999;background:#fff;">
<tr style="background:#990099;color:#fff;font-size:10px;">
<th style="text-align:left;padding:4px 8px;">Name</th>
<th style="text-align:left;padding:4px 8px;">Occupation</th>
<th style="text-align:left;padding:4px 8px;">City</th>
</tr>
${rows}
</table>
${pager}
<p style="font-size:9px;color:#888;margin-top:4px;">Cross-linked with CorpOS identity records. Updated on registry refresh.</p>`;
}

function renderPortal99669() {
  const rows = getWorldNetSiteDirectoryLinks();
  const siteRows = rows
    .map(
      (r, i) =>
        `<tr style="background:${i % 2 ? '#eef6ff' : '#fff'};">
<td style="padding:7px 10px;border-bottom:1px solid #ccc;vertical-align:top;">
<a data-nav="${escapeHtml(r.pageKey)}"${r.subPath ? ` data-wnet-subpath="${escapeHtml(r.subPath)}"` : ''} href="#" style="font-size:13px;font-weight:bold;color:#000080;cursor:pointer;text-decoration:underline;">${escapeHtml(r.title)}</a>
</td>
<td style="padding:7px 10px;border-bottom:1px solid #ccc;font-size:10px;font-family:Consolas,monospace;color:#006600;word-break:break-all;">${escapeHtml(r.url)}</td>
</tr>`
    )
    .join('');

  return `<div class="iebody" data-wn-ad-page="net99669">
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div></aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<div style="border:3px double #990099;padding:8px 12px;margin-bottom:10px;background:linear-gradient(180deg,#fff5ff 0%,#ffffff 100%);">
  <div style="font-size:32px;font-weight:900;color:#990099;font-family:'Times New Roman',Georgia,serif;letter-spacing:2px;">99669.net</div>
  <div style="font-size:11px;color:#555;margin-top:4px;"><b>The WorldNet Yellow Pages</b> &nbsp;|&nbsp; Every bookmarked host in one place &nbsp;|&nbsp; Est. 2000</div>
</div>
<div class="ad" style="background:#ffffcc;border:1px solid #cc9900;padding:6px;font-size:10px;margin-bottom:10px;">
  <b>SPONSORED:</b> Tired of typing URLs? Bookmark 99669.net — your federal-compliant shortcut to the simulated web.
</div>
<h2 style="font-size:15px;color:#000080;border-bottom:2px solid #990099;padding-bottom:4px;margin-bottom:8px;">🌐 All WorldNet sites</h2>
<p style="font-size:10px;color:#666;margin-bottom:8px;line-height:1.4;">Click a title to open the site in WorldNet Explorer. List updates when new hosts are registered with CorpOS.</p>
<div data-wnet-ad-slot="content-break" data-wnet-ad-region="content-break" style="margin:8px 0;"></div>
<table style="width:100%;border-collapse:collapse;border:2px solid #999;background:#fff;">
<tr style="background:#990099;color:#fff;font-size:11px;">
<th style="text-align:left;padding:6px 10px;border:1px solid #660066;">Site name</th>
<th style="text-align:left;padding:6px 10px;border:1px solid #660066;">Address</th>
</tr>
${siteRows}
</table>
<div style="margin-top:18px;padding:10px;border:2px solid #990099;background:#f9f9f9;">
  <h3 style="font-size:13px;color:#333;margin-bottom:6px;">👤 People directory</h3>
  ${renderPeopleDirectoryPanel()}
</div>
<div style="margin-top:10px;padding:10px;border:2px solid #990099;background:#faf5ff;">
  <h3 style="font-size:13px;color:#333;margin-bottom:6px;">🏢 Businesses directory</h3>
  ${renderBizDirectoryPanel()}
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:12px;"></div>
<div style="margin-top:14px;font-size:10px;color:#888;text-align:center;">
  <a data-nav="home" href="#" style="color:#000080;cursor:pointer;">Wahoo! Home</a>
  &nbsp;|&nbsp;
  <a data-nav="web_registry" href="#" style="color:#000080;cursor:pointer;">Official WWW Registry</a>
</div>
<p style="margin-top:8px;font-size:9px;color:#aaa;text-align:center;">© 2000 99669.net — Parody directory · Not affiliated with any real registry</p>
</div>
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div></aside>
</div>
</div>`;
}

function renderPage(key, sub = '') {
  if (key === 'home') return renderWahooHome();
  if (key === 'moogle_home') return renderMoogleHome();
  if (key === 'moogle_results') return renderMoogleSearchResults(sub || '');
  if (key === 'moogle_images') return renderMoogleImages();
  if (key === 'moogle_groups') return renderMoogleGroups();
  if (key === 'moogle_directory') return renderMoogleDirectory();
  if (key === 'moogle_about') return renderMoogleAbout();
  if (key === 'moogle_maps') return renderMoogleMapsPage();
  if (key === 'wahoo_results') return renderWahooSearchResults(decodeURIComponent(sub || ''));
  if (key === 'wahoo_register') return renderWahooRegister();
  if (key === 'wahoo_login') return renderWahooLogin();
  if (key === 'wahoo_account') return renderWahooAccount();
  if (key === 'jeemail_register') return renderJeeMailRegister();
  if (key === 'jeemail_login') return renderJeeMailLogin();
  if (key === 'jeemail_inbox') return renderJeeMailInbox();
  if (key === 'jeemail_sent') return renderJeeMailSent();
  if (key === 'jeemail_trash') return renderJeeMailTrash();
  if (key === 'jeemail_compose') return renderJeeMailCompose();
  if (key === 'jeemail_confirm') return renderJeeMailConfirm();
  if (key === 'jeemail_read') return renderJeeMailRead();
  if (key === 'dmb') return renderDmbPage(sub || '');
  if (key === 'net99669') return renderPortal99669();
  if (key === 'fra') return renderFraPage();
  if (key === 'focs_mandate') return renderFocsMandateHtml();
  if (key === 'corpos_portal') return renderCorposPortalHtml();
  if (key === 'warehouse') return pages.warehouse || defaultNotFoundHtml();
  if (key === 'market_pulse') return pages.market_pulse || defaultNotFoundHtml();
  if (key === 'herald') return '<div id="dh-wnet-root" style="min-height:100%;"></div>';
  if (key === 'devtools') return renderDevtoolsPage();
  if (key === 'backrooms') return renderBackroomsPage();
  if (key === 'wn_shop') return renderShopHtml(sub || '');
  if (key === 'not_found') return defaultNotFoundHtml();
  if (key === 'web_registry') return renderWorldWideWebRegistryHtml();
  if (key === 'pipeline_page') {
    const st = getState();
    const pageDef = st.contentRegistry?.pages?.find((p) => p.pageId === sub);
    if (pageDef) {
      if (pageDef.stats && pageDef.stats.health <= 0) {
        return renderDeadSiteHtml(pageDef);
      }
      const headlines =
        (typeof window !== 'undefined' && window.__wnetNewsHeadlines) || [];
      return renderPageDefinitionHtml(pageDef, {
        newsItems: headlines,
        getShopById: getStoreById,
        navigate
      });
    }
    return defaultNotFoundHtml();
  }
  if (BANK_META[key]) return bankHtmlForPageKey(key, getState(), sub) || defaultNotFoundHtml();
  const html = pages[key];
  return html || defaultNotFoundHtml();
}

function syncAddressBar(key, sub) {
  const { addr } = ui();
  if (!addr) return;
  if (key === 'pipeline_page') {
    const st = getState();
    const pageDef = st.contentRegistry?.pages?.find((p) => p.pageId === sub);
    addr.value = pageDef?.url || `http://pipeline.local/${sub}`;
    return;
  }
  if (key === 'wn_shop') {
    addr.value = urlForShopSubPath(sub || '') || urlForPage('wn_shop', sub) || ROOT_URL_BY_PAGE.wn_shop;
    return;
  }
  if (key === 'not_found') {
    addr.value = notFoundAddress || 'http://www.wahoo.net/not-found';
    return;
  }
  const u = urlForPage(key, sub) || `http://www.wahoo.net/${key}`;
  addr.value = u;
}

function setHistoryButtons() {
  const backBtn = document.getElementById('wnet-back-btn');
  const fwdBtn = document.getElementById('wnet-forward-btn');
  if (backBtn) backBtn.disabled = historyIndex <= 0;
  if (fwdBtn) fwdBtn.disabled = historyIndex >= historyEntries.length - 1;
}

function entryTitleForKey(key) {
  if (key === 'home') return 'Wahoo!';
  if (key === 'jeemail_inbox') return 'JeeMail Inbox';
  if (key === 'jeemail_read') return 'JeeMail — Message';
  if (key === 'wahoo_account') return 'My Account';
  if (key === 'wn_shop') return shopBrowserTitle(currentSubPath || '');
  if (key === 'not_found') return 'Page Not Found';
  if (key === 'pipeline_page') {
    const st = getState();
    const pageDef = st.contentRegistry?.pages?.find((p) => p.pageId === currentSubPath);
    return pageDef?.title || 'WorldNet Page';
  }
  if (BANK_META[key]) return BANK_META[key].title;
  if (key === 'net99669') return '99669.net';
  if (key === 'reviewbomber') return 'Review Bomber';
  if (key === 'yourspace') return 'YourSpace';
  if (key === 'mytube') return 'MyTube';
  if (key === 'moogle_home') return 'Moogle';
  if (key === 'moogle_maps') return 'Moogle Maps';
  if (key === 'fra') return 'Federal Revenue Authority';
  if (key === 'focs_mandate') return 'Federal Mandate 2000-CR7';
  if (key === 'corpos_portal') return 'CorpOS Operator Portal';
  if (key === 'moogle_results') return 'Moogle Search';
  if (key === 'moogle_images') return 'Moogle Images';
  if (key === 'moogle_groups') return 'Moogle Groups';
  if (key === 'moogle_directory') return 'Moogle Directory';
  if (key === 'moogle_about') return 'About Moogle';
  return key.replace(/_/g, ' ');
}

function ensureDefaultBrowserFavorites() {
  patchSession((s) => {
    if (!s.browser) s.browser = { favorites: [] };
    if (!Array.isArray(s.browser.favorites)) s.browser.favorites = [];
    const fav = s.browser.favorites;
    const seeds = [
      { key: 'moogle_home', sub: '', url: urlForPage('moogle_home', ''), title: titleForWorldNetPage('moogle_home') },
      { key: 'home', sub: '', url: urlForPage('home', ''), title: titleForWorldNetPage('home') }
    ];
    for (const seed of seeds) {
      if (seed.url && !fav.some((f) => f.url === seed.url)) fav.push(seed);
    }
  });
}

function renderFavoritesPanel() {
  const { favPanel } = ui();
  if (!favPanel) return;
  const list = getSessionState().browser.favorites || [];
  favPanel.innerHTML = '';
  if (!list.length) {
    favPanel.innerHTML = '<div class="wnet-fav-empty">No favorites saved yet.</div>';
    return;
  }
  for (const item of list) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wnet-fav-item';
    btn.textContent = `${item.title} - ${item.url}`;
    btn.addEventListener('click', () => {
      toggleFavorites(false);
      navigate(item.key, item.sub || '', { pushHistory: true });
    });
    favPanel.appendChild(btn);
  }
}

function toggleFavorites(force) {
  const { favPanel } = ui();
  if (!favPanel) return;
  const on = typeof force === 'boolean' ? force : favPanel.classList.contains('is-hidden');
  if (on) renderFavoritesPanel();
  favPanel.classList.toggle('is-hidden', !on);
}

function addCurrentFavorite() {
  const key = currentPageKey;
  const sub = currentSubPath || '';
  const url = key === 'not_found' ? (notFoundAddress || 'unknown') : (urlForPage(key, sub) || `worldnet://${key}`);
  patchSession((s) => {
    const exists = s.browser.favorites.some((f) => f.url === url);
    if (exists) return;
    s.browser.favorites.push({
      key,
      sub,
      url,
      title: entryTitleForKey(key)
    });
  });
  renderFavoritesPanel();
  toast('Added to Favorites.');
}

function resolveAddressNav(raw) {
  const value = String(raw || '').trim();
  if (!value) return { key: 'moogle_home', sub: '' };
  const loc = resolveLocationFromAddress(value);
  if (loc.pageKey === 'home' && !isKnownAddress(value)) {
    notFoundAddress = value;
    return { key: 'not_found', sub: '' };
  }
  return { key: loc.pageKey, sub: loc.subPath || '' };
}

function updateWindowDataAttrs() {
  const win = document.getElementById('win-worldnet');
  if (!win) return;
  win.dataset.wnetKey = currentPageKey;
  win.dataset.wnetSub = currentSubPath;
}

function navigate(key, sub = '', opts = {}) {
  const { content, status } = ui();
  if (!content || !status) return;
  status.textContent = 'Loading...';
  currentPageKey = key || 'moogle_home';
  currentSubPath = sub || '';
  const p = getState().player;
  if (CORPOS_GATED_PAGE_KEYS.has(currentPageKey) && (!p.corposEnrollmentComplete || p.licenseTerminated)) {
    content.innerHTML = renderGateInterstitial();
    bindWorldNetContent(content);
    syncAddressBar(currentPageKey, currentSubPath);
    updateWindowDataAttrs();
    return;
  }
  const html = renderPage(currentPageKey, currentSubPath);
  content.innerHTML = html;
  bindWorldNetContent(content);
  bindShopRoot(content, navigate);
  mountPage(content, currentPageKey);
  teardownReviewBomberFeed();
  teardownYourspace();
  teardownMytube();
  teardownPipelineLiveComments();
  teardownMoogleMaps();
  teardownY2kForms();
  if (currentPageKey === 'reviewbomber') void mountReviewBomberFeed(content);
  if (currentPageKey === 'yourspace') void mountYourspace(content, currentSubPath);
  if (currentPageKey === 'mytube') void mountMytube(content, currentSubPath);
  if (currentPageKey === 'pipeline_page') {
    const pageDef = getState().contentRegistry?.pages?.find((p) => p.pageId === currentSubPath);
    if (pageDef) {
      mountPipelineLiveComments(content, pageDef);
      if (pageDef.style === 'y2k') mountY2kForms(content, pageDef);
    }
  }
  if (currentPageKey === 'bizreg') mountBizRegForm(content);
  if (currentPageKey === 'ssa') mountSsaPage(content);
  if (currentPageKey === 'moogle_maps') mountMoogleMaps(content);
  if (currentPageKey === 'warehouse') mountWarehousePage(content);
  if (currentPageKey === 'market_pulse') mountMarketPulsePage(content);
  if (currentPageKey === 'herald') {
    const wm = content.querySelector('#dh-wnet-root');
    if (wm) initDailyHerald({ mount: wm });
  }
  if (currentPageKey === 'jeemail_compose') {
    applyJeeMailComposePrefillFromSession();
  }
  syncAddressBar(currentPageKey, currentSubPath);
  updateWindowDataAttrs();
  status.textContent = 'Done';

  try {
    const u = urlForPage(currentPageKey, currentSubPath) || `http://www.wahoo.net/${currentPageKey}`;
    window.ActivityLog?.log?.('WORLDNET_VISIT', `${u} — outbound`);
  } catch {
    /* ignore */
  }

  if (opts.pushHistory) {
    historyEntries = historyEntries.slice(0, historyIndex + 1);
    historyEntries.push({ key: currentPageKey, sub: currentSubPath });
    historyIndex = historyEntries.length - 1;
  }
  setHistoryButtons();
}

/**
 * Normalize legacy / shorthand page keys used by in-world apps (e.g. Black Cherry).
 */
function normalizeWorldNetNavigateTarget(pageKey, subPath = '') {
  const k = String(pageKey || '').trim();
  const sub = typeof subPath === 'string' ? subPath : '';
  if (k === 'wahoo') return { key: 'home', sub };
  if (k === 'jeemail') return { key: 'jeemail_inbox', sub };
  return { key: k || 'moogle_home', sub };
}

/**
 * Open WorldNet Explorer and navigate to an internal page (used by Black Cherry Maps, etc.).
 */
function navigateToWorldNetPage(pageKey, subPath = '', opts = {}) {
  const { key, sub } = normalizeWorldNetNavigateTarget(pageKey, subPath);
  const pushHistory = opts.pushHistory !== false;
  try {
    window.openW?.('worldnet');
  } catch {
    /* ignore */
  }
  navigate(key, sub, { pushHistory });
}

function mountSsaPage(container) {
  const curEl = container.querySelector('#ssa-addr-current');
  if (curEl) {
    const p = getState().player;
    curEl.textContent = p.address ? `Current address on file: ${p.address}` : 'No address on file.';
  }
  const addrInput = container.querySelector('#ssa-addr');
  const addrIdInput = container.querySelector('#ssa-addr-id');
  if (addrInput && window.MoogleMaps) {
    let dd = null;
    addrInput.addEventListener('input', () => {
      const q = addrInput.value.trim();
      if (q.length < 2) { if (dd) dd.style.display = 'none'; return; }
      const results = window.MoogleMaps.autocomplete(q, 6);
      if (!results.length) { if (dd) dd.style.display = 'none'; return; }
      if (!dd) {
        dd = document.createElement('div');
        dd.className = 'mm-picker-dropdown';
        dd.style.cssText = 'position:absolute;background:#fff;border:1px solid #999;z-index:400;max-height:150px;overflow-y:auto;font-size:11px;width:260px;';
        addrInput.parentElement.style.position = 'relative';
        addrInput.parentElement.appendChild(dd);
      }
      dd.innerHTML = results.map(a => `<div style="padding:3px 6px;cursor:pointer;" data-addr-id="${a.id}">${escapeHtml(a.label)}</div>`).join('');
      dd.style.display = 'block';
      dd.querySelectorAll('div').forEach(d => d.addEventListener('click', () => {
        const id = d.dataset.addrId;
        const addr = results.find(r => r.id === id);
        if (addr) {
          addrInput.value = addr.label;
          if (addrIdInput) addrIdInput.value = addr.id;
        }
        dd.style.display = 'none';
      }));
    });
  }
}

function mountBizRegForm(container) {
  const identityEl = container.querySelector('#bizreg-identity');
  if (!identityEl) return;
  const p = getState().player;
  const ssnTail = p.ssnFull ? `SSN …${String(p.ssnFull).slice(-4)}` : '';
  identityEl.innerHTML = `<b>Registrant:</b> ${escapeHtml(p.displayName)} &nbsp;|&nbsp; ${escapeHtml(p.address || '')} &nbsp;|&nbsp; ${escapeHtml(ssnTail)} &nbsp;|&nbsp; ${escapeHtml(p.email || '')}`;
  const agentInput = container.querySelector('#bizreg-agent');
  if (agentInput && !agentInput.value) agentInput.value = p.displayName;
  const phoneInput = container.querySelector('#bizreg-phone');
  if (phoneInput && !phoneInput.value) phoneInput.value = p.phone || '';
  const addrInput = container.querySelector('#bizreg-address');
  const addrIdInput = container.querySelector('#bizreg-address-id');
  if (addrInput && window.MoogleMaps) {
    const dd = document.createElement('div');
    dd.style.cssText = 'display:none;position:absolute;z-index:100;background:#fff;border:1px solid #999;box-shadow:1px 2px 4px rgba(0,0,0,.15);max-height:160px;overflow-y:auto;font-size:10px;';
    addrInput.parentElement.style.position = 'relative';
    addrInput.parentElement.appendChild(dd);
    addrInput.addEventListener('input', () => {
      const q = addrInput.value;
      if (q.length < 2) { dd.style.display = 'none'; return; }
      const results = window.MoogleMaps.autocomplete(q);
      const filtered = results.filter(a => a.type === 'commercial' || a.type === 'mixed');
      if (!filtered.length) { dd.style.display = 'none'; return; }
      dd.style.display = 'block';
      dd.innerHTML = filtered.map(a =>
        `<div data-id="${escapeHtml(a.id)}" style="padding:3px 6px;cursor:pointer;border-bottom:1px solid #eee;" onmouseover="this.style.background='#d0d8ff'" onmouseout="this.style.background=''">${escapeHtml(a.label)}</div>`
      ).join('');
      dd.querySelectorAll('[data-id]').forEach(el => {
        el.addEventListener('click', () => {
          const addr = window.MoogleMaps.getAddress(el.getAttribute('data-id'));
          if (addr) { addrInput.value = addr.label; if (addrIdInput) addrIdInput.value = addr.id; }
          dd.style.display = 'none';
        });
      });
    });
    addrInput.addEventListener('keydown', e => { if (e.key === 'Escape') dd.style.display = 'none'; });
  }
  const statusEl = container.querySelector('#bizreg-status');
  if (statusEl) {
    const apps = getState().businessRegistry?.applications || [];
    if (apps.length) {
      const rows = apps.map((a) => {
        const badge = a.status === 'approved'
          ? '<span style="color:#006600;font-weight:bold;">Approved</span>'
          : '<span style="color:#cc6600;">Processing</span>';
        return `<tr><td style="padding:3px 6px;font-size:10px;">${escapeHtml(a.tradingName)}</td><td style="padding:3px 6px;font-size:10px;">${escapeHtml(a.industry)}</td><td style="padding:3px 6px;font-size:10px;">${badge}</td></tr>`;
      }).join('');
      statusEl.innerHTML = `<h3 style="font-size:12px;color:#0a246a;margin-bottom:4px;">Your Applications</h3>
<table style="width:100%;border-collapse:collapse;border:1px solid #aaa;"><tr style="background:#0a246a;color:#fff;font-size:10px;"><th style="padding:3px 6px;text-align:left;">Name</th><th style="padding:3px 6px;text-align:left;">Industry</th><th style="padding:3px 6px;text-align:left;">Status</th></tr>${rows}</table>`;
    }
  }
}

function dispatchAction(action, rootEl, sourceEl = null) {
  if (!action) return false;
  if (dispatchDmbAction(action, { navigate, toast })) return true;
  if (action === 'install-app') {
    const appId =
      sourceEl?.getAttribute?.('data-install-app-id') ||
      rootEl?.querySelector?.('[data-install-app-id]')?.getAttribute?.('data-install-app-id') ||
      '';
    const app = getInstallableApp(appId);
    const price = getSoftwarePurchasePriceUsd(app);
    const priceLine =
      price > 0
        ? `Price ${formatSoftwarePurchasePrice(
            app
          )} · Charged to FNCB checking on confirm.`
        : 'No charge — licensed channel.';
    showCorpOsConfirm({
      message: 'Purchase and download this software?',
      detail: `${app?.label || appId} — ${priceLine}`,
      confirmLabel: price > 0 ? 'Purchase & Download' : 'Download',
      onConfirm: () => {
        const res = queueSoftwareInstall(appId);
        toast(
          res.ok ? `${getInstallableApp(appId)?.label || 'Application'} installation queued.` : res.message
        );
        if (res.ok) {
          openTransferDialog(appId);
          const purchased = getInstallableApp(appId);
          const amt = getSoftwarePurchasePriceUsd(purchased);
          if (amt > 0) {
            const st = getState();
            const fncb = st.accounts?.find((a) => a.id === 'fncb');
            const bankName = fncb?.name || 'First National Corp. Bank';
            const digits = String(fncb?.accountNumber || '').replace(/\D/g, '');
            const acctTail = digits.length >= 4 ? `Acct …${digits.slice(-4)}` : 'Business checking';
            const simDate = new Date(getGameEpochMs() + (st.sim?.elapsedMs ?? 0));
            const dateStr = simDate.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });
            const priceStr = formatSoftwarePurchasePrice(purchased);
            const host = purchased?.sourceHost || 'devtools.net';
            let msg = `${bankName}: ${dateStr}. Purchase ${priceStr} at ${host} — ${purchased?.label || appId}. ${acctTail}. If you did not authorize, call 1-800-555-CORP.`;
            if (msg.length > 160) msg = `${msg.slice(0, 157)}...`;
            smsToPlayer(msg);
          }
        }
        const srcPage = app?.sourceHost === 'backrooms.hck' ? 'backrooms' : 'devtools';
        navigate(srcPage, '', { pushHistory: false });
      }
    });
    return true;
  }
  if (action === 'open-install-window') {
    const appId = sourceEl?.getAttribute?.('data-install-app-id') || '';
    openTransferDialog(appId);
    return true;
  }
  if (action === 'moogle-search') {
    runMoogleSearch(navigate, rootEl);
    return true;
  }
  if (action === 'moogle-feeling-moody') {
    runMoogleFeelingMoody(navigate);
    return true;
  }
  if (action === 'wahoo-search') {
    wahooSearch(rootEl?.ownerDocument || document);
    return true;
  }
  if (action === 'ssa-name-change') {
    const r = resolveNarrative({
      dc: 12,
      modifier: 0,
      passSummary:
        'Your name change petition was accepted for processing. Allow three weeks for registry updates.',
      failSummary:
        'Your petition could not be accepted at this time. The filing fee has been forfeited per agency policy.'
    });
    toast(r.message);
    try {
      window.ActivityLog?.log?.(
        'SSA_REQUEST',
        `SSA request submitted — legal name change petition (${r.success ? 'accepted' : 'denied'})`,
        { notable: true }
      );
    } catch {
      /* ignore */
    }
    return true;
  }
  if (action === 'ssa-addr-lookup') {
    const pickerSlot = document.getElementById('ssa-addr-picker');
    if (pickerSlot && window.MoogleMaps) {
      pickerSlot.style.display = 'block';
      pickerSlot.innerHTML = '';
      window.MoogleMaps.embedPicker({
        container: pickerSlot,
        onSelect(addr) {
          const addrIn = document.getElementById('ssa-addr');
          const addrId = document.getElementById('ssa-addr-id');
          if (addrIn) addrIn.value = addr.label;
          if (addrId) addrId.value = addr.id;
          pickerSlot.style.display = 'none';
        }
      });
    }
    return true;
  }
  if (action === 'ssa-addr-update') {
    const addrLabel = (document.getElementById('ssa-addr')?.value || '').trim();
    const addrId = (document.getElementById('ssa-addr-id')?.value || '').trim();
    if (!addrLabel) { toast('Please select or enter an address.'); return true; }
    patchState(s => {
      s.player.address = addrLabel;
      if (addrId) s.player.hargroveAddressId = addrId;
      return s;
    });
    toast('Address updated successfully.');
    const curEl = document.getElementById('ssa-addr-current');
    if (curEl) curEl.textContent = `Current address: ${addrLabel}`;
    try {
      window.ActivityLog?.log?.(
        'SSA_REQUEST',
        'SSA request submitted — residential address update',
        { notable: true }
      );
    } catch {
      /* ignore */
    }
    return true;
  }
  if (action === 'wahoo-register') {
    const user = (document.getElementById('wahoo-user')?.value || '').trim();
    const pass = document.getElementById('wahoo-pass')?.value || '';
    const dob = document.getElementById('wahoo-dob')?.value || '';
    const secq = (document.getElementById('wahoo-secq')?.value || '').trim();
    const phoneDigits = String(document.getElementById('wahoo-phone')?.value || '').replace(/\D/g, '');
    if (!user || !pass || !dob || !secq) {
      toast('Complete all fields to register.');
      return true;
    }
    patchSession((s) => {
      s.wahoo.accounts[user] = { password: pass, dob, secq, contact: '', phone: phoneDigits };
      s.wahoo.currentUser = user;
    });
    toast('Wahoo account created.');
    if (phoneDigits.length >= 10) {
      sendNewAccountSms(
        'Wahoo!',
        `Welcome, ${user}. Your WorldNet portal account is active. Reply STOP to opt out of alerts (simulation).`
      );
    }
    navigate('home', '', { pushHistory: true });
    return true;
  }
  if (action === 'wahoo-login') {
    const user = (document.getElementById('wahoo-login-user')?.value || '').trim();
    const pass = document.getElementById('wahoo-login-pass')?.value || '';
    const account = getSessionState().wahoo.accounts[user];
    if (!account || account.password !== pass) {
      toast('Invalid Wahoo credentials.');
      return true;
    }
    patchSession((s) => {
      s.wahoo.currentUser = user;
    });
    try {
      window.ActivityLog?.log?.('WAHOO_LOGIN', `Wahoo! portal login: ${user}`);
    } catch {
      /* ignore */
    }
    navigate('moogle_home', '', { pushHistory: true });
    return true;
  }
  if (action === 'wahoo-logout') {
    patchSession((s) => {
      s.wahoo.currentUser = null;
    });
    navigate('moogle_home', '', { pushHistory: true });
    return true;
  }
  if (action === 'wahoo-save-settings') {
    const user = getSessionState().wahoo.currentUser;
    if (!user) return true;
    const contact = (document.getElementById('wahoo-contact')?.value || '').trim();
    patchSession((s) => {
      if (!s.wahoo.accounts[user]) return;
      s.wahoo.accounts[user].contact = contact;
    });
    toast('Wahoo settings saved.');
    return true;
  }
  if (action === 'jeemail-register') {
    const usernameEl = document.getElementById('jeemail-reg-username');
    const passwordEl = document.getElementById('jeemail-reg-password');
    const confirmEl = document.getElementById('jeemail-reg-confirm');
    const errEl = document.getElementById('jeemail-reg-error');
    function showRegErr(msg) {
      if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
      else toast(msg);
    }
    if (!usernameEl || !passwordEl) { toast('Registration form not found.'); return true; }

    const localPart = (usernameEl.value || '').trim().toLowerCase();
    const pass = (passwordEl.value || '').trim();
    const confirm = confirmEl ? (confirmEl.value || '').trim() : pass;
    const phoneReg = (document.getElementById('jeemail-reg-phone')?.value || '').trim();
    const phoneDigits = phoneReg.replace(/\D/g, '');

    const errors = [];
    if (!localPart || localPart.length < 3) errors.push('Username must be at least 3 characters.');
    if (!/^[a-z0-9._-]+$/.test(localPart)) errors.push('Username may only contain letters, numbers, dots, hyphens, and underscores.');
    if (!pass || pass.length < 4) errors.push('Password must be at least 4 characters.');
    if (pass !== confirm) errors.push('Passwords do not match.');
    if (phoneDigits.length < 10) errors.push('A valid 10-digit mobile number is required for JeeMail (federal verification).');

    const fullEmail = `${localPart}@jeemail.net`;
    const accounts = getSessionState().jeemail?.accounts || {};
    if (accounts[fullEmail]) errors.push('That username is already registered.');

    if (errors.length) { showRegErr(errors.join(' ')); return true; }

    const isFirst = Object.keys(accounts).length === 0;
    const hashed = simpleHash(pass);

    patchSession((s) => {
      if (!s.jeemail) s.jeemail = { accounts: {}, currentUser: null };
      if (!s.jeemail.accounts) s.jeemail.accounts = {};
      s.jeemail.accounts[fullEmail] = {
        email: fullEmail,
        phone: phoneDigits,
        password: pass,
        passwordHash: hashed,
        inbox: seedJeeMailInbox(fullEmail),
        sent: [],
        trash: []
      };
      s.jeemail.currentUser = fullEmail;
    });

    if (isFirst) {
      patchState(s => {
        s.player.firstJeemailAccount = fullEmail;
        s.player.email = fullEmail;
        return s;
      });
      const raw = ActorDB.getRaw('PLAYER_PRIMARY');
      if (raw && !raw.emails.includes(fullEmail)) {
        try { ActorDB.update('PLAYER_PRIMARY', { emails: [...raw.emails, fullEmail] }); } catch { /* ok */ }
      }
    }

    setTimeout(() => deliverCorpOSWelcomePacket(fullEmail, localPart), 800);
    sendNewAccountSms(
      'JeeMail',
      `Mailbox ${fullEmail} is ready. Verification code (simulation): ${String(100000 + (Math.floor(Math.random() * 899999) || 0))}.`
    );
    try {
      window.ActivityLog?.log?.('JEEMAIL_REGISTER', `JeeMail account registered: ${fullEmail}`);
    } catch {
      /* ignore */
    }
    const postReg = getSessionState().jeemail?.composePrefill ? 'jeemail_compose' : 'jeemail_inbox';
    navigate(postReg, '', { pushHistory: true });
    return true;
  }
  if (action === 'jeemail-open-msg') {
    const idx = Number(sourceEl?.dataset?.msgIndex ?? -1);
    const box = sourceEl?.dataset?.msgBox || 'inbox';
    if (idx < 0) return true;
    patchSession((s) => {
      s.jeemail.openMessage = { box, index: idx };
    });
    const acc = jeemailCurrentAccount();
    const msg = acc?.[box]?.[idx];
    if (msg && !msg.isRead) {
      patchSession((s) => {
        const a = s.jeemail.accounts[s.jeemail.currentUser];
        if (a?.[box]?.[idx]) a[box][idx].isRead = true;
      });
    }
    navigate('jeemail_read', '', { pushHistory: true });
    return true;
  }
  if (action === 'jeemail-login') {
    const user = (document.getElementById('jeemail-login-user')?.value || '').trim().toLowerCase();
    const pass = document.getElementById('jeemail-login-pass')?.value || '';
    const acc = getSessionState().jeemail.accounts[user];
    const passMatch = acc && (acc.password === pass || acc.passwordHash === simpleHash(pass));
    if (!acc || !passMatch) {
      toast('Invalid JeeMail credentials.');
      return true;
    }
    patchSession((s) => {
      s.jeemail.currentUser = user;
    });
    try {
      window.ActivityLog?.log?.('JEEMAIL_LOGIN', `JeeMail login: ${user}`);
    } catch {
      /* ignore */
    }
    const postLogin = getSessionState().jeemail?.composePrefill ? 'jeemail_compose' : 'jeemail_inbox';
    navigate(postLogin, '', { pushHistory: true });
    return true;
  }
  if (action === 'jeemail-send') {
    const to = (document.getElementById('jeemail-to')?.value || '').trim();
    const subject = (document.getElementById('jeemail-subject')?.value || '').trim();
    const body = (document.getElementById('jeemail-body')?.value || '').trim();
    const acc = jeemailCurrentAccount();
    if (!acc) return true;
    const actor = to && window.ActorDB?.getByEmail ? window.ActorDB.getByEmail(to) : null;
    const replyName =
      actor?.contactDisplayName || actor?.first_name || String(to).split('@')[0] || 'Contact';
    patchSession((s) => {
      const cur = s.jeemail.accounts[acc.email];
      cur.sent.push({
        from: acc.email,
        to: to || '(unspecified recipient)',
        subject: subject || '(no subject)',
        body,
        date: 'Jan 2, 2000'
      });
      if (actor?.actor_id && cur.inbox) {
        cur.inbox.unshift({
          from: to,
          subject: subject ? `Re: ${subject}` : 'Thanks for your message',
          body: `Hi — thanks for your message. I'll get back to you soon.\n\n— ${replyName}`,
          date: 'Jan 2, 2000'
        });
      }
    });
    if (actor?.actor_id && window.WorldNet?.axis) {
      window.WorldNet.axis.discover(actor.actor_id, {
        source: 'email',
        note: `Discovered through JeeMail correspondence with ${actor.full_legal_name || to}.`
      });
      window.WorldNet.axis.updateScore(actor.actor_id, 1, 'Email sent via JeeMail');
    }
    navigate('jeemail_confirm', '', { pushHistory: true });
    return true;
  }
  if (action === 'jeemail-logout') {
    patchSession((s) => {
      s.jeemail.currentUser = null;
    });
    navigate('jeemail_login', '', { pushHistory: true });
    return true;
  }
  if (action === 'bank-addr-lookup') {
    const pickerSlot = sourceEl?.closest('td')?.querySelector('[data-bank-addr-picker]') || sourceEl?.parentElement?.querySelector('[data-bank-addr-picker]');
    if (pickerSlot && window.MoogleMaps) {
      pickerSlot.style.display = 'block';
      pickerSlot.innerHTML = '';
      window.MoogleMaps.embedPicker({
        container: pickerSlot,
        onSelect(addr) {
          const addrInput = sourceEl?.closest('td')?.querySelector('[data-bank-field="reg-addr"]') || document.querySelector('[data-bank-field="reg-addr"]');
          const addrIdInput = sourceEl?.closest('td')?.querySelector('[data-bank-field="reg-addr-id"]') || document.querySelector('[data-bank-field="reg-addr-id"]');
          if (addrInput) addrInput.value = addr.label;
          if (addrIdInput) addrIdInput.value = addr.id;
          pickerSlot.style.display = 'none';
        }
      });
    }
    return true;
  }
  if (action === 'bizreg-submit') {
    const tradingName = document.getElementById('bizreg-trading')?.value || '';
    const legalName = document.getElementById('bizreg-legal')?.value || '';
    const entityType = document.getElementById('bizreg-entity')?.value || 'LLC';
    const industry = document.getElementById('bizreg-industry')?.value || 'general';
    const offeringsSummary = document.getElementById('bizreg-offerings')?.value || '';
    const addressId = document.getElementById('bizreg-address-id')?.value || '';
    const addressLabel = document.getElementById('bizreg-address')?.value || '';
    if (!tradingName.trim()) { toast('Please enter a trading name.'); return true; }
    if (!addressId && !addressLabel.trim()) { toast('Please select a business address.'); return true; }
    const actorId = getState().player.actor_id || 'player';
    const extras = {
      priorNames: document.getElementById('bizreg-prior-names')?.value || '',
      naics: document.getElementById('bizreg-naics')?.value || '',
      ein: document.getElementById('bizreg-ein')?.value || '',
      mailingAddress: document.getElementById('bizreg-mailing')?.value || '',
      phone: document.getElementById('bizreg-phone')?.value || '',
      fax: document.getElementById('bizreg-fax')?.value || '',
      email: document.getElementById('bizreg-email')?.value || '',
      agent: document.getElementById('bizreg-agent')?.value || '',
      agentAddr: document.getElementById('bizreg-agent-addr')?.value || '',
      employees: document.getElementById('bizreg-employees')?.value || '1',
      fiscalYearEnd: document.getElementById('bizreg-fiscal')?.value || 'dec',
      addressId,
      addressLabel
    };
    const res = submitBusinessRegistration({ actorId, tradingName, legalName, entityType, industry, offeringsSummary, ...extras });
    toast(res.message);
    if (res.ok) {
      navigate('bizreg', '', { pushHistory: false });
    }
    return true;
  }
  if (action === 'stub') {
    navigate('not_found', '', { pushHistory: true });
    return true;
  }
  if (action === 'people-dir-prev') {
    _peopleDirectoryPage = Math.max(0, _peopleDirectoryPage - 1);
    navigate('net99669', '', { pushHistory: false });
    return true;
  }
  if (action === 'people-dir-next') {
    _peopleDirectoryPage += 1;
    navigate('net99669', '', { pushHistory: false });
    return true;
  }
  return false;
}

function bindWorldNetContent(root) {
  root.querySelectorAll('a').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      const pipeNav = el.getAttribute('data-wnet-nav');
      if (pipeNav) {
        const resolved = resolveAddressNav(pipeNav);
        navigate(resolved.key, resolved.sub, { pushHistory: true });
        return;
      }
      const act = el.getAttribute('data-action');
      if (act && dispatchAction(act, root, el)) return;
      const key = el.getAttribute('data-nav');
      if (key === 'lucky') {
        wahooSearch(root.ownerDocument);
        return;
      }
      if (key) {
        navigate(key, el.getAttribute('data-wnet-subpath') || '', { pushHistory: true });
        return;
      }
      const href = el.getAttribute('href');
      if (href) {
        const resolved = resolveAddressNav(href);
        navigate(resolved.key, resolved.sub, { pushHistory: true });
        return;
      }
      navigate('not_found', '', { pushHistory: true });
    });
  });

  root.querySelectorAll('button,[role="button"]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      const node = /** @type {HTMLElement} */ (el);
      if (node.hasAttribute('data-bank-nav') || node.hasAttribute('data-bank-action') || node.hasAttribute('data-bank-subpath')) return;
      if (node.hasAttribute('onclick')) return;
      const action = node.getAttribute('data-action');
      if (dispatchAction(action, root, node)) {
        ev.preventDefault();
        return;
      }
      const nav = node.getAttribute('data-nav');
      if (nav) {
        ev.preventDefault();
        navigate(nav, node.getAttribute('data-wnet-subpath') || '', { pushHistory: true });
        return;
      }
      if (node.closest('form')) return;
      ev.preventDefault();
      navigate('not_found', '', { pushHistory: true });
    });
  });

  root.querySelectorAll('form').forEach((f) => {
    f.addEventListener('submit', (ev) => ev.preventDefault());
  });

  for (const id of ['moogle-q-home', 'moogle-q-results']) {
    const mq = document.getElementById(id);
    if (mq && !mq.dataset.moogleEnter) {
      mq.dataset.moogleEnter = '1';
      mq.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        runMoogleSearch(navigate, root);
      });
    }
  }

  if (root.querySelector('[data-bank-site]')) {
    bindBankRoot(root);
  }
}

export async function initWorldNet(loadJsonText) {
  try {
    if (loadJsonText) {
      const raw = await loadJsonText('pages.json');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        pages = { ...worldnetPages };
      } else if (parsed && typeof parsed === 'object') {
        pages = { ...worldnetPages, ...parsed };
      }
    }
  } catch {
    pages = { ...worldnetPages };
  }

  let adsJson = null;
  try {
    if (loadJsonText) {
      const baseAds = JSON.parse(await loadJsonText('ads.json'));
      let seedAds = [];
      try {
        seedAds = JSON.parse(await loadJsonText('ads/seed_ads.json'));
      } catch {
        seedAds = [];
      }
      adsJson = {
        defaultRotationMs: baseAds?.defaultRotationMs || 8000,
        ads: [...(baseAds?.ads || []), ...(Array.isArray(seedAds) ? seedAds : seedAds?.ads || [])]
      };
    }
  } catch {
    adsJson = null;
  }
  initWorldNetAds(adsJson, { navigate });
  await initWorldNetShop(loadJsonText, navigate);
  if (typeof window !== 'undefined') {
    window.WorldNet = {
      ...(window.WorldNet || {}),
      ads: getAdsApi(),
      shop: getShopApi(),
      navigateTo: navigateToWorldNetPage
    };
  }

  installBankWindowGlobals();
  ensureDefaultBrowserFavorites();
  document.getElementById('wnet-fav-btn')?.addEventListener('click', () => toggleFavorites());
  document.getElementById('wnet-add-fav-btn')?.addEventListener('click', () => addCurrentFavorite());
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#wnet-fav-btn') && !e.target.closest('#wnet-fav-panel')) {
      toggleFavorites(false);
    }
  });
}

export function wnetNav(page, subPath = '') {
  const { addr } = ui();
  let key = page;
  let sub = typeof subPath === 'string' ? subPath : '';
  if (page === 'addr') {
    const resolved = resolveAddressNav(addr?.value || '');
    key = resolved.key;
    sub = resolved.sub;
  }
  if (!key) key = 'not_found';
  navigate(key, sub, { pushHistory: true });
}

export function wnetGo(key, sub = '') {
  navigate(key, sub, { pushHistory: true });
}

export function wnetBack() {
  if (historyIndex <= 0) return;
  historyIndex--;
  const e = historyEntries[historyIndex];
  navigate(e.key, e.sub, { pushHistory: false });
}

export function wnetForward() {
  if (historyIndex >= historyEntries.length - 1) return;
  historyIndex++;
  const e = historyEntries[historyIndex];
  navigate(e.key, e.sub, { pushHistory: false });
}

export function wnetReload() {
  navigate(currentPageKey, currentSubPath, { pushHistory: false });
}

function isWorldNetWindowVisible(win) {
  if (!win) return false;
  if (win.style.display === 'none') return false;
  try {
    return getComputedStyle(win).display !== 'none';
  } catch {
    return win.style.display !== 'none';
  }
}

export function refreshIfBank() {
  const win = document.getElementById('win-worldnet');
  if (!isWorldNetWindowVisible(win)) return;
  if (currentPageKey === 'dmb' || currentPageKey === 'pipeline_page') {
    navigate(currentPageKey, currentSubPath, { pushHistory: false });
    return;
  }
  if (!BANK_META[currentPageKey]) return;
  navigate(currentPageKey, currentSubPath, { pushHistory: false });
}

export function wahooSearch(doc) {
  const root = doc || document;
  const input = root.getElementById('wsearch');
  const q = input?.value?.trim() || '';
  if (!q) return;
  try {
    window.ActivityLog?.log?.('WORLDNET_SEARCH', `Query: "${q}" via Wahoo!`);
  } catch {
    /* ignore */
  }
  navigate('wahoo_results', encodeURIComponent(q), { pushHistory: true });
}

export function ensureWorldNetHome() {
  installBankWindowGlobals();
  const win = document.getElementById('win-worldnet');
  if (win && !win.dataset.init) {
    win.dataset.init = '1';
    // If something (e.g. Black Cherry Maps via navigateTo) already navigated before the
    // window finished opening, do not reset history or overwrite that page.
    if (historyEntries.length === 0) {
      navigate('moogle_home', '', { pushHistory: true });
    }
  }
}

export function exposeGlobals() {
  installBankWindowGlobals();
  window.wnetNav = wnetNav;
  window.wnetGo = wnetGo;
  window.wnetBack = wnetBack;
  window.wnetForward = wnetForward;
  window.wnetReload = wnetReload;
  window.wahooSearch = () => wahooSearch(document);
  /** Used by Black Cherry mobile browser (`bc-browser.js`) — avoids circular imports. */
  window.renderWorldNetPage = (key, sub) => renderPage(key, sub ?? '');
}
