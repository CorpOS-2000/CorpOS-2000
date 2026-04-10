import { pause, unpause } from './clock.js';
import { TOAST_KEYS, toast } from './toast.js';
import { getState, resetState } from './gameState.js';
import { patchSession } from './sessionState.js';
import { resetBlackCherryView } from './black-cherry.js';
import {
  showEnrollment,
  verifyOsLogin,
  triggerLicenseTermination,
  CORPOS_DEV_ENROLLMENT_AUTOFILL,
  CORPOS_DEV_DEFAULT_PASSWORD
} from './corpos-enrollment.js';
import { triggerKyleCall } from './kyle-call.js';
import {
  loadFirstPlayableAudio,
  getPowerOnCandidates,
  getBiosInitializeCandidates,
  getBiosExecuteCandidates,
  getCorpBootCandidates,
  safeDurationMs
} from './boot-audio.js';
import { generateWorldNpcsDuringBios, fireQueuedSmsEvents } from './world-generation.js';
import { SaveManager } from '../engine/SaveManager.js';

/** Per-line delay from bios.json (`d` ms); 0 in data = short beat (50ms) before next line. */
const BIOS_MS_MULT = 1.55;

let biosDelayScale = 1;

let powerOnAudioLoadPromise = null;
/** @type {HTMLAudioElement | null} */
let powerOnAudioInstance = null;

let biosInitLoadPromise = null;
let biosExecLoadPromise = null;
/** @type {HTMLAudioElement | null} */
let biosInitAudioInstance = null;
/** @type {HTMLAudioElement | null} */
let biosExecAudioInstance = null;

let corpBootAudioInstance = null;

/** Default markup for #lverify (must include #vdone). Failed login replaces innerHTML and drops vdone — reset each attempt. */
const LOGIN_VERIFY_PENDING_HTML =
  'Verifying credentials with Federal Business Registry...<br>Checking compliance status...<br><span id="vdone"></span>';

/** Restores login form after Access Denied; cleared on new attempt or successful login. */
let loginFailUiTimer = null;

/** Single pre-BIOS step: insert disc (cosmetic; Enter continues to POST). */
export const BOOT_DEVICES = [
  {
    id: 'disc',
    label: 'Insert disc',
    sub: 'CorpOS 2000 installation media — press Enter when ready'
  }
];

let bootMenuActive = false;
let bootDriveHandler = null;
let selectedBootDriveIndex = 0;

const FALLBACK_BIOS = [
  { t: 'CORPOS BIOS (C)2000 Federal Office of Commercial Systems', d: 0, c: 'hi' },
  { t: 'BIOS Version 2.00.10.CR7', d: 120, c: 'hi' },
  { t: '', d: 200 },
  { t: 'POST complete.', d: 400, c: 'ok' },
  { t: 'Starting CorpOS 2000...', d: 0, c: 'hi' },
  { t: 'Done.', d: 120, c: 'ok' },
  { t: '', d: 400 }
];

function biosLineDelayMs(line) {
  const raw = typeof line.d === 'number' && line.d > 0 ? line.d : line.d === 0 ? 50 : 50;
  return Math.max(30, Math.round(raw * BIOS_MS_MULT));
}

function prefetchPowerOnAudio() {
  if (!powerOnAudioLoadPromise) {
    powerOnAudioLoadPromise = loadFirstPlayableAudio(getPowerOnCandidates());
  }
  return powerOnAudioLoadPromise;
}

function prefetchBiosPostAudio() {
  if (!biosInitLoadPromise) {
    biosInitLoadPromise = loadFirstPlayableAudio(getBiosInitializeCandidates());
  }
  if (!biosExecLoadPromise) {
    biosExecLoadPromise = loadFirstPlayableAudio(getBiosExecuteCandidates());
  }
  return Promise.all([biosInitLoadPromise, biosExecLoadPromise]);
}

let biosLines = [];

export async function loadBiosLines(loadJson) {
  try {
    const data = await loadJson('bios.json');
    if (Array.isArray(data) && data.length) biosLines = data;
    else biosLines = FALLBACK_BIOS;
  } catch {
    biosLines = FALLBACK_BIOS;
  }
}

function stopAudioEl(a) {
  if (!a) return;
  try {
    a.pause();
    a.currentTime = 0;
  } catch {
    /* ignore */
  }
}

function hideBios() {
  stopAudioEl(biosInitAudioInstance);
  stopAudioEl(biosExecAudioInstance);
  stopAudioEl(powerOnAudioInstance);

  const b = document.getElementById('bios');
  if (!b) {
    showLogo();
    return;
  }
  b.style.transition = 'opacity 1s ease';
  b.style.opacity = '0';
  setTimeout(() => {
    b.style.display = 'none';
    showLogo();
  }, 1000);
}

let biosIdx = 0;
let biosEl = null;
/** Resolves when all BIOS lines have been rendered (before hideBios). */
let _biosLinesResolve = null;
/** Promise that resolves once NPC generation finishes (runs in parallel with BIOS). */
let _npcGenPromise = null;
/** True after first non-empty POST line (AMI header) — later non-empty lines use BiosExecute. */
let biosInitPlayed = false;
/** Index of "Mouse.........Detected" line; stutter execute runs only after this when phases are known. */
let biosMouseIdx = -1;
/** Last technical POST line before driver load (e.g. FrontPage). */
let biosTechEndIdx = -1;
/** First “tail” line (e.g. Starting CorpOS) — earlier: driver/compliance execute stutter; here: hard audio stop. */
let biosLastFewStartIdx = -1;
/** When markers are missing from bios.json, keep older behavior (execute restart every line after init). */
let biosLegacyAudio = true;
/** POST beep once, immediately before the final blank line. */
let biosPostBeepScheduled = false;

function refreshBiosAudioPhases() {
  biosMouseIdx = biosLines.findIndex((l) => /\bMouse\b[\s.]*Detected/i.test(l.t || ''));
  biosTechEndIdx = biosLines.findIndex((l) => (l.t || '').includes('FrontPage 2000'));
  biosLastFewStartIdx = biosLines.findIndex((l) => /Starting CorpOS/i.test(l.t || ''));
  biosLegacyAudio = biosMouseIdx < 0 || biosTechEndIdx < 0 || biosTechEndIdx <= biosMouseIdx;
}

function interruptBiosPostAudio() {
  stopAudioEl(biosInitAudioInstance);
  stopAudioEl(biosExecAudioInstance);
}

async function playBiosInitialize() {
  if (!biosInitAudioInstance) return;
  try {
    biosInitAudioInstance.pause();
    biosInitAudioInstance.currentTime = 0;
    biosInitAudioInstance.volume = 0.88;
    await biosInitAudioInstance.play();
  } catch {
    /* autoplay / codec */
  }
}

/** Short BiosExecute hit — restarts each line (typing / scan cadence). */
async function playBiosExecuteStutter() {
  if (!biosExecAudioInstance) return;
  try {
    if (biosInitAudioInstance && !biosInitAudioInstance.paused) {
      biosInitAudioInstance.pause();
      biosInitAudioInstance.currentTime = 0;
    }
    biosExecAudioInstance.pause();
    biosExecAudioInstance.currentTime = 0;
    biosExecAudioInstance.volume = 0.82;
    await biosExecAudioInstance.play();
  } catch {
    /* ignore */
  }
}

/** Deeper, duller PC-speaker style POST beep (triangle ~400 Hz). */
function playPcPostBeep() {
  try {
    const AC =
      typeof window.AudioContext !== 'undefined'
        ? window.AudioContext
        : typeof window.webkitAudioContext !== 'undefined'
          ? window.webkitAudioContext
          : null;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 400;
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.018);
    g.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    o.connect(g);
    g.connect(ctx.destination);
    o.onended = () => {
      try {
        ctx.close();
      } catch {
        /* ignore */
      }
    };
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.34);
  } catch {
    /* ignore */
  }
}

function nextBiosLine() {
  if (!biosEl) return;
  if (biosIdx >= biosLines.length) {
    const tailMs = Math.max(100, Math.round(950 * biosDelayScale));
    setTimeout(() => {
      if (_biosLinesResolve) { _biosLinesResolve(); _biosLinesResolve = null; }
    }, tailMs);
    return;
  }
  const line = biosLines[biosIdx++];
  const lineIndex = biosIdx - 1;
  const delay = Math.round(biosLineDelayMs(line) * biosDelayScale);
  const isLastLine = lineIndex === biosLines.length - 1;
  setTimeout(() => {
    if (!biosLegacyAudio && biosLastFewStartIdx >= 0 && lineIndex === biosLastFewStartIdx) {
      interruptBiosPostAudio();
    }
    if (isLastLine) {
      interruptBiosPostAudio();
      if (!biosPostBeepScheduled) {
        biosPostBeepScheduled = true;
        playPcPostBeep();
      }
    }

    const span = document.createElement('span');
    span.textContent = (line.t || '') + '\n';
    if (line.c === 'hi') span.style.color = '#ffffff';
    if (line.c === 'ok') span.style.color = '#00ff66';
    if (line.c === 'warn') span.style.color = '#ffcc00';
    if (line.c === 'dim') span.style.color = '#aaaaaa';
    if (line.c === 'skip') span.style.color = '#8899aa';
    biosEl.appendChild(span);
    const parent = biosEl.parentElement;
    if (parent) parent.scrollTop = parent.scrollHeight;

    const hasText = String(line.t || '').trim().length > 0;
    const inDriverPhase =
      !biosLegacyAudio &&
      biosInitPlayed &&
      hasText &&
      biosLastFewStartIdx >= 0 &&
      lineIndex > biosTechEndIdx &&
      lineIndex < biosLastFewStartIdx;

    if (hasText && !biosInitPlayed) {
      biosInitPlayed = true;
      void playBiosInitialize();
    } else if (biosLegacyAudio && biosInitPlayed) {
      void playBiosExecuteStutter();
    } else if (
      !biosLegacyAudio &&
      biosInitPlayed &&
      hasText &&
      lineIndex > biosMouseIdx &&
      lineIndex < biosTechEndIdx
    ) {
      void playBiosExecuteStutter();
    } else if (inDriverPhase) {
      void playBiosExecuteStutter();
    }

    nextBiosLine();
  }, delay);
}

export function runBios() {
  biosEl = document.getElementById('bios-text');
  biosIdx = 0;
  if (!biosEl || biosLines.length === 0) {
    hideBios();
    return;
  }
  biosEl.textContent = '';
  const bios = document.getElementById('bios');
  if (bios) {
    bios.style.display = '';
    bios.style.opacity = '1';
    bios.style.transition = '';
  }
  void runBiosWithAudio();
}

async function runBiosWithAudio() {
  try {
    const [initA, execA] = await prefetchBiosPostAudio();
    biosInitAudioInstance = initA;
    biosExecAudioInstance = execA;
  } catch {
    biosInitAudioInstance = null;
    biosExecAudioInstance = null;
  }

  biosDelayScale = 1;

  const biosLinesPromise = new Promise((resolve) => {
    _biosLinesResolve = resolve;
  });

  _npcGenPromise = generateWorldNpcsDuringBios().catch((err) => {
    console.error('[WorldGen] NPC generation error during BIOS:', err);
  });

  biosIdx = 0;
  biosInitPlayed = false;
  biosPostBeepScheduled = false;
  refreshBiosAudioPhases();
  nextBiosLine();

  await Promise.all([biosLinesPromise, _npcGenPromise]);
  hideBios();
}

async function playPowerOnThenBios() {
  prefetchPowerOnAudio();
  try {
    powerOnAudioInstance = await powerOnAudioLoadPromise;
    if (powerOnAudioInstance) {
      powerOnAudioInstance.currentTime = 0;
      powerOnAudioInstance.volume = 0.9;
      try {
        await powerOnAudioInstance.play();
      } catch {
        /* autoplay blocked */
      }
    }
  } catch {
    powerOnAudioInstance = null;
  }
  runBios();
}

function renderBootDriveSelection() {
  document.querySelectorAll('#boot-drive-list .bds-item').forEach((el, i) => {
    const on = i === selectedBootDriveIndex;
    el.classList.toggle('bds-item-sel', on);
    el.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function onBootDriveKeydown(e) {
  if (!bootMenuActive) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    confirmBootDrive();
  }
}

function confirmBootDrive() {
  if (!bootMenuActive) return;
  bootMenuActive = false;
  if (bootDriveHandler) {
    window.removeEventListener('keydown', bootDriveHandler, true);
    bootDriveHandler = null;
  }
  const dev = BOOT_DEVICES[selectedBootDriveIndex];
  window.__corpOSBootDevice = dev?.id ?? 'disc';

  const screen = document.getElementById('boot-drive-screen');
  if (screen) {
    screen.classList.add('is-hidden');
    screen.blur();
  }

  void playPowerOnThenBios();
}

/** Show drive picker; after Enter, PowerON then POST / BIOS scroll. */
export function startBootFlow() {
  prefetchPowerOnAudio();
  const screen = document.getElementById('boot-drive-screen');
  const list = document.getElementById('boot-drive-list');
  if (!screen || !list) {
    void playPowerOnThenBios();
    return;
  }

  list.innerHTML = '';
  BOOT_DEVICES.forEach((d, i) => {
    const li = document.createElement('li');
    li.className = 'bds-item';
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    li.innerHTML = `<div class="bds-line1">${d.label}</div><div class="bds-line2">${d.sub}</div>`;
    li.addEventListener('click', () => {
      if (!bootMenuActive) return;
      selectedBootDriveIndex = i;
      renderBootDriveSelection();
      confirmBootDrive();
    });
    list.appendChild(li);
  });

  selectedBootDriveIndex = 0;
  bootMenuActive = true;
  screen.classList.remove('is-hidden');
  screen.focus({ preventScroll: true });

  renderBootDriveSelection();

  bootDriveHandler = onBootDriveKeydown;
  window.addEventListener('keydown', bootDriveHandler, true);
}

export function showLogo() {
  const ls = document.getElementById('logo-screen');
  if (!ls) {
    showLoginOrEnrollment();
    return;
  }
  ls.classList.add('show');
  ls.style.display = '';
  ls.style.opacity = '1';
  ls.style.transition = '';
  document
    .querySelectorAll(
      '#logo-screen .lw-bar, #logo-screen .lw-corp, #logo-screen .lw-os, #logo-screen .lw-year, #logo-screen .lw-tag'
    )
    .forEach((el) => {
      el.style.opacity = '0';
    });

  runLogoWithBootSound(ls);
}

async function runLogoWithBootSound(ls) {
  corpBootAudioInstance = await loadFirstPlayableAudio(getCorpBootCandidates());
  const totalMs = safeDurationMs(corpBootAudioInstance) || 5300;
  const fadeMs = Math.min(1400, Math.max(450, Math.round(totalMs * 0.2)));
  const revealEnd = Math.max(fadeMs + 120, totalMs - fadeMs - 60);

  const step = (frac) => Math.min(revealEnd - 40, Math.round(totalMs * frac));

  if (corpBootAudioInstance) {
    corpBootAudioInstance.volume = 0.85;
    corpBootAudioInstance.currentTime = 0;
    try {
      await corpBootAudioInstance.play();
    } catch {
      /* continue silent */
    }
  }

  /** Wordmark reveal paced to fill most of `corpOSbootingsound` before fade-out. */
  const seq = [
    { sel: '.lw-bar', d: 0 },
    { sel: '.lw-corp', d: step(0.11) },
    { sel: '.lw-os', d: step(0.24) },
    { sel: '.lw-year', d: step(0.38) },
    { sel: '.lw-tag', d: step(0.52) }
  ];
  for (const s of seq) {
    setTimeout(() => {
      document.querySelectorAll(`#logo-screen ${s.sel}`).forEach((el) => {
        el.style.opacity = '1';
      });
    }, s.d);
  }

  const fadeStart = Math.max(0, totalMs - fadeMs);
  setTimeout(() => {
    ls.style.transition = `opacity ${fadeMs}ms ease`;
    ls.style.opacity = '0';
    setTimeout(() => {
      ls.style.display = 'none';
      if (corpBootAudioInstance) {
        try {
          corpBootAudioInstance.pause();
          corpBootAudioInstance.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
      showLoginOrEnrollment();
    }, fadeMs);
  }, fadeStart);
}

async function waitForSaveReady() {
  while (!window.__corpOsSaveStatus?.ready) {
    await new Promise((r) => setTimeout(r, 80));
  }
  return window.__corpOsSaveStatus;
}

/**
 * Enrollment must sit above Start menu (z-index 99999), Black Cherry (10050), and logoff (99998).
 * After logoff / purge, login or other chrome can otherwise stay in the stacking order and steal hits.
 */
function prepareChromeForEnrollment() {
  document.getElementById('smenu')?.classList.remove('open');
  document.getElementById('start-btn')?.classList.remove('active');
  const logoff = document.getElementById('logoff-screen');
  if (logoff) {
    logoff.classList.remove('show');
    logoff.style.display = 'none';
  }
  const login = document.getElementById('login-screen');
  if (login) {
    login.classList.remove('show');
    login.style.display = 'none';
    login.style.opacity = '1';
    login.style.pointerEvents = '';
  }
  const desktop = document.getElementById('desktop');
  if (desktop) {
    desktop.classList.remove('show');
    desktop.style.opacity = '';
  }
  hideUserPicker();
  const enroll = document.getElementById('enrollment-screen');
  if (enroll) {
    enroll.style.zIndex = '100060';
    enroll.style.position = 'fixed';
    enroll.style.inset = '0';
  }
}

async function showLoginOrEnrollment() {
  const saveStatus = await waitForSaveReady();

  if (saveStatus.hasUsers) {
    showUserPicker(saveStatus.accounts);
    return;
  }

  prepareChromeForEnrollment();
  const enrollScreen = document.getElementById('enrollment-screen');
  if (enrollScreen) {
    enrollScreen.style.display = 'flex';
    await showEnrollment();
    window.__corpOsSaveStatus.hasUsers = true;
    window.__corpOsSaveStatus.accounts = window.SaveManager?.getAccountIndex?.() || [];
  }
  showLogin();
}

function ensurePurgeConfirmDialog() {
  let overlay = document.getElementById('corpos-purge-dialog');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'corpos-purge-dialog';
  overlay.className = 'corpos-confirm corpos-purge-confirm is-hidden';
  overlay.innerHTML = `
    <div class="corpos-confirm__panel" role="dialog" aria-modal="true" aria-labelledby="corpos-purge-title">
      <div class="corpos-confirm__titlebar">
        <span class="corpos-confirm__title" id="corpos-purge-title">Federal Business Registry — Operator purge</span>
      </div>
      <div class="corpos-confirm__body">
        <div class="corpos-confirm__icon" aria-hidden="true">⚠</div>
        <div class="corpos-confirm__copy">
          <div class="corpos-confirm__message" id="corpos-purge-message"></div>
          <div class="corpos-confirm__detail" id="corpos-purge-detail"></div>
        </div>
      </div>
      <div class="corpos-confirm__actions">
        <button type="button" class="corpos-confirm__btn" data-purge-cancel>Cancel</button>
        <button type="button" class="corpos-confirm__btn corpos-confirm__btn--danger" data-purge-confirm>Purge record</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Themed confirmation (replaces window.confirm). Resolves true if the operator confirms purge.
 * @param {string} displayLabel
 * @param {string} usernameNorm
 * @returns {Promise<boolean>}
 */
function showPurgeConfirmDialog(displayLabel, usernameNorm) {
  return new Promise((resolve) => {
    const overlay = ensurePurgeConfirmDialog();
    const msg = overlay.querySelector('#corpos-purge-message');
    const det = overlay.querySelector('#corpos-purge-detail');
    const btnCancel = overlay.querySelector('[data-purge-cancel]');
    const btnOk = overlay.querySelector('[data-purge-confirm]');
    if (!msg || !det || !btnCancel || !btnOk) {
      resolve(false);
      return;
    }

    msg.textContent =
      'Revoke this workstation credential and purge all local data tied to it: saved session files, ' +
      'virtual file system records, and compliance data. This action cannot be undone.';
    det.textContent = `${displayLabel} (${usernameNorm})`;

    overlay.classList.remove('is-hidden');

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      overlay.classList.add('is-hidden');
      btnCancel.removeEventListener('click', onCancel);
      btnOk.removeEventListener('click', onOk);
      overlay.removeEventListener('click', onOverlay);
      window.removeEventListener('keydown', onKey);
      resolve(val);
    };

    const onCancel = () => finish(false);
    const onOk = () => finish(true);
    const onOverlay = (e) => {
      if (e.target === overlay) onCancel();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    btnCancel.addEventListener('click', onCancel);
    btnOk.addEventListener('click', onOk);
    overlay.addEventListener('click', onOverlay);
    window.addEventListener('keydown', onKey);

    requestAnimationFrame(() => {
      try {
        btnCancel.focus();
      } catch {
        /* ignore */
      }
    });
  });
}

async function openNewOperatorEnrollmentFlow() {
  prepareChromeForEnrollment();
  window.__corpOsSaveStatus = window.__corpOsSaveStatus || { ready: true, hasUsers: false, accounts: [] };
  window.__corpOsSaveStatus.hasUsers = false;
  window.__corpOsSaveStatus.accounts = [];
  const enrollScreen = document.getElementById('enrollment-screen');
  if (enrollScreen) {
    enrollScreen.style.display = 'flex';
    await showEnrollment();
  }
  window.__corpOsSaveStatus.accounts = window.SaveManager?.getAccountIndex?.() || [];
  window.__corpOsSaveStatus.hasUsers = window.__corpOsSaveStatus.accounts.length > 0;
  const unameEl = document.getElementById('uname');
  if (unameEl) { unameEl.value = ''; unameEl.readOnly = false; }
  const upassEl = document.getElementById('upass');
  if (upassEl) upassEl.value = '';
  showLogin();
}

function onPurgeOperatorClick(e, acct) {
  e.preventDefault();
  e.stopPropagation();
  const label = acct.displayName || acct.username;
  void (async () => {
    const ok = await showPurgeConfirmDialog(label, acct.username);
    if (!ok) return;
    const res = window.SaveManager?.deleteOperatorRecord?.(acct.username);
    if (!res?.ok) {
      window.alert?.('Purge failed. The operator record could not be removed.');
      return;
    }
    // Full session reload: UEFI → BIOS → logo → login/enrollment. Clears enrollment / Moogle Maps state.
    window.location.reload();
  })();
}

function showUserPicker(accounts) {
  const screen = document.getElementById('user-picker-screen');
  if (!screen) {
    showLogin();
    return;
  }
  if (!accounts || accounts.length === 0) {
    const idx = window.SaveManager?.getAccountIndex?.() || [];
    if (idx.length === 0) {
      void openNewOperatorEnrollmentFlow();
    } else {
      showUserPicker(idx);
    }
    return;
  }
  const list = document.getElementById('up-list');
  if (list) {
    list.innerHTML = '';
    for (const acct of accounts) {
      const li = document.createElement('li');
      li.className = 'up-entry';
      li.dataset.username = acct.username;

      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'up-select';
      const icon = document.createElement('span');
      icon.className = 'up-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = '👤';
      const nameSpan = document.createElement('span');
      nameSpan.className = 'up-name';
      nameSpan.textContent = acct.displayName || acct.username;
      const idSpan = document.createElement('span');
      idSpan.className = 'up-id';
      idSpan.textContent = acct.username;
      selectBtn.append(icon, nameSpan, idSpan);
      selectBtn.addEventListener('click', () => {
        const unameEl = document.getElementById('uname');
        if (unameEl) { unameEl.value = acct.username; unameEl.readOnly = true; }
        hideUserPicker();
        showLogin();
        const passEl = document.getElementById('upass');
        if (passEl) { passEl.value = ''; passEl.focus(); }
      });

      li.append(selectBtn);
      list.appendChild(li);
    }
  }

  const reg = document.getElementById('up-registry');
  if (reg) {
    reg.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'up-registry-head';
    head.textContent = 'Local operator registry';
    reg.appendChild(head);
    for (const acct of accounts) {
      const row = document.createElement('div');
      row.className = 'up-reg-row';
      const meta = document.createElement('div');
      meta.className = 'up-reg-meta';
      const nameEl = document.createElement('span');
      nameEl.className = 'up-reg-name';
      nameEl.textContent = acct.displayName || acct.username;
      const idEl = document.createElement('span');
      idEl.className = 'up-reg-id';
      idEl.textContent = acct.username;
      meta.append(nameEl, idEl);

      const purgeBtn = document.createElement('button');
      purgeBtn.type = 'button';
      purgeBtn.className = 'up-reg-purge';
      purgeBtn.title = 'Revoke license and purge local operator record';
      purgeBtn.textContent = 'Purge record';
      purgeBtn.addEventListener('click', (ev) => onPurgeOperatorClick(ev, acct));

      row.append(meta, purgeBtn);
      reg.appendChild(row);
    }
  }
  screen.classList.add('show');
  screen.style.display = 'flex';
  screen.style.pointerEvents = 'auto';
}

function hideUserPicker() {
  const screen = document.getElementById('user-picker-screen');
  const list = document.getElementById('up-list');
  const reg = document.getElementById('up-registry');
  if (list) list.innerHTML = '';
  if (reg) reg.innerHTML = '';
  if (screen) {
    screen.classList.remove('show');
    screen.style.display = 'none';
    screen.style.pointerEvents = 'none';
  }
}

function devFillLoginCredentials() {
  const accounts = window.SaveManager?.getAccountIndex?.() || [];
  if (!accounts.length) return;
  const pick = accounts[Math.floor(Math.random() * accounts.length)];
  const un = document.getElementById('uname');
  const pw = document.getElementById('upass');
  if (un) {
    un.value = pick.username;
    un.readOnly = true;
  }
  if (pw) pw.value = CORPOS_DEV_DEFAULT_PASSWORD;
}

function ensureDevLoginShortcut() {
  if (!CORPOS_DEV_ENROLLMENT_AUTOFILL) return;
  const lform = document.getElementById('lform');
  if (!lform || document.getElementById('login-dev-creds')) return;
  const btn = document.createElement('button');
  btn.id = 'login-dev-creds';
  btn.type = 'button';
  btn.className = 'login-dev-creds-btn';
  btn.textContent = 'Dev: fill operator + Federal test password (1234)';
  btn.addEventListener('click', devFillLoginCredentials);
  const notice = lform.querySelector('.lnotice');
  if (notice) lform.insertBefore(btn, notice);
  else lform.appendChild(btn);
}

export function showLogin() {
  const p = getState().player;
  const unameEl = document.getElementById('uname');
  if (unameEl && p.username && !unameEl.value) unameEl.value = p.username;
  const ls = document.getElementById('login-screen');
  ls?.classList.add('show');
  ls && (ls.style.display = 'flex');
  const vEl = document.getElementById('lverify');
  const fEl = document.getElementById('lform');
  if (loginFailUiTimer) {
    clearTimeout(loginFailUiTimer);
    loginFailUiTimer = null;
  }
  if (vEl) {
    vEl.innerHTML = LOGIN_VERIFY_PENDING_HTML;
    vEl.style.display = 'none';
  }
  if (fEl) fEl.style.display = 'block';
  ensureDevLoginShortcut();
}

export function doLogin() {
  if (loginFailUiTimer) {
    clearTimeout(loginFailUiTimer);
    loginFailUiTimer = null;
  }

  const uname = (document.getElementById('uname')?.value || '').trim();
  const upass = document.getElementById('upass')?.value || '';
  const result = verifyOsLogin(uname, upass);

  if (!result.ok) {
    const vEl = document.getElementById('lverify');
    const fEl = document.getElementById('lform');
    if (result.reason === 'terminated') return;
    if (vEl) {
      if (fEl) fEl.style.display = 'none';
      vEl.style.display = 'block';
      vEl.innerHTML = `<span style="color:#cc0000;font-weight:bold;">Access Denied.</span><br>Invalid credentials.${result.attemptsLeft != null ? ` ${result.attemptsLeft} attempt${result.attemptsLeft === 1 ? '' : 's'} remaining.` : ''}`;
      loginFailUiTimer = setTimeout(() => {
        loginFailUiTimer = null;
        vEl.style.display = 'none';
        if (fEl) fEl.style.display = 'block';
        vEl.innerHTML = LOGIN_VERIFY_PENDING_HTML;
      }, 2400);
    }
    return;
  }

  hideUserPicker();
  try {
    window.__corpOsHydrateUser?.(uname);
  } catch (e) {
    console.error('[Boot] Hydrate user failed:', e);
  }

  try {
    window.ActivityLog?.log?.('LOGIN_SUCCESS', `Operator login: ${uname}`);
  } catch {
    /* ignore */
  }

  try {
    const url = new URL('assets/CorpOSLoginSound.mp3', window.location.href).href;
    const loginAud = new Audio(url);
    loginAud.volume = 0.9;
    const p = loginAud.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* ignore */ }

  const form = document.getElementById('lform');
  const v = document.getElementById('lverify');
  if (v) {
    v.innerHTML = LOGIN_VERIFY_PENDING_HTML;
    v.style.display = 'block';
  }
  if (form) form.style.display = 'none';
  setTimeout(() => {
    const el = document.getElementById('vdone');
    if (el) {
      el.innerHTML = `<br><span style="color:#006600;font-weight:bold;">✓ Access Granted. Welcome, ${uname.toUpperCase()}.</span>`;
    }
  }, 2100);
  setTimeout(() => {
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
      loginScreen.style.transition = 'opacity 1s ease';
      loginScreen.style.opacity = '0';
      setTimeout(() => {
        loginScreen.style.display = 'none';
        bootDesktop();
      }, 900);
    }
  }, 4200);
}

function bootDesktop() {
  unpause('boot');
  const d = document.getElementById('desktop');
  if (d) {
    d.classList.add('show');
    d.style.opacity = '0';
    d.style.transition = 'opacity 1.1s ease';
    setTimeout(() => {
      d.style.opacity = '1';
    }, 80);
  }
  const demo = document.getElementById('demo-btn');
  if (demo) demo.style.display = 'block';
  setTimeout(() => {
    toast({
      key: TOAST_KEYS.SYSTEM_LOAD,
      title: 'CorpOS 2000',
      message: 'System loaded.',
      icon: '◆',
      autoDismiss: 4000
    });
  }, 200);
  setTimeout(() => {
    toast({
      key: TOAST_KEYS.SYSTEM_LOAD,
      title: 'CorpOS 2000',
      message: 'Federal Mandate 2000-CR7 compliance mode active.',
      icon: '◆',
      autoDismiss: 5000
    });
  }, 1000);
  setTimeout(() => {
    const u = document.getElementById('uname')?.value || 'OPERATOR';
    toast({
      key: TOAST_KEYS.SYSTEM_LOAD,
      title: 'Welcome',
      message: `Welcome, ${u.toUpperCase()}. You have new messages.`,
      icon: '👤',
      autoDismiss: 4000
    });
  }, 2400);
  setTimeout(() => fireQueuedSmsEvents(), 3000);
  setTimeout(() => {
    const st = getState();
    if (st.flags?.kyleCallCompleted) return;
    triggerKyleCall();
  }, 10000);
}

export function doShutdown() {
  pause('shutdown');
  try {
    const ms = getState().sim?.elapsedMs ?? 0;
    const dur = ms > 0 ? `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m` : '0m';
    window.ActivityLog?.log?.('SESSION_END', `CorpOS session terminated — duration ${dur}`);
  } catch {
    /* ignore */
  }
  const saveResult = SaveManager.save();

  const screen = document.getElementById('shutdown-screen');
  if (!screen) return;
  screen.innerHTML = '';
  screen.classList.add('show');

  const lines = [
    { text: 'CorpOS 2000 — System Shutdown Initiated', color: '#ffffff', delay: 0 },
    { text: '', delay: 300 },
    { text: 'Saving operator session...', delay: 500 },
    {
      text: saveResult.success
        ? `  Session saved.  [ ${String(saveResult.savedAt || '').slice(11, 19) || 'OK'} ]`
        : '  WARNING: Session save may have failed.',
      color: saveResult.success ? '#00cc00' : '#ffcc00',
      delay: 1100
    },
    { text: '', delay: 1400 },
    { text: 'Closing WorldNet connections...', delay: 1600 },
    { text: '  Connection pool flushed.                   [ OK ]', color: '#00cc00', delay: 2200 },
    { text: 'Flushing audit log buffer...', delay: 2400 },
    { text: '  1,847 log entries committed.               [ OK ]', color: '#00cc00', delay: 3000 },
    { text: 'Synchronizing with Federal Business Registry...', delay: 3200 },
    { text: '  Registry sync complete.                    [ OK ]', color: '#00cc00', delay: 4000 },
    { text: 'Committing compliance records...', delay: 4200 },
    { text: '  All compliance records written.            [ OK ]', color: '#00cc00', delay: 4900 },
    { text: 'Terminating CorpOS services...', delay: 5100 },
    { text: '  All services stopped.                      [ OK ]', color: '#00cc00', delay: 5700 },
    { text: '', delay: 6000 },
    {
      text: 'All activity has been logged per Federal Mandate 2000-CR7.',
      color: '#666666',
      delay: 6200
    },
    { text: '', delay: 6800 },
    { text: 'It is now safe to turn off your computer.', color: '#ffffff', delay: 7000 }
  ];

  let accumulated = 0;
  lines.forEach((line) => {
    accumulated = Math.max(accumulated, line.delay);
    setTimeout(() => {
      const el = document.createElement('div');
      el.style.color = line.color || '#aaaaaa';
      el.style.minHeight = '1.8em';
      el.textContent = line.text;
      screen.appendChild(el);
      screen.scrollTop = screen.scrollHeight;
    }, line.delay);
  });

  setTimeout(() => {
    if (window.corpOS?.quit) {
      window.corpOS.quit();
    } else if (typeof window.require === 'function') {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('app-quit');
      } catch {
        /* browser dev — stay on screen */
      }
    }
  }, accumulated + 2000);
}

export function doLogOff() {
  try {
    const u = getState().player?.username || 'OPERATOR';
    window.ActivityLog?.log?.('LOGOFF', `Operator logoff: ${u}`);
  } catch {
    /* ignore */
  }
  const result = SaveManager.save();
  const screen = document.getElementById('logoff-screen');
  const container = document.getElementById('logoff-lines');
  if (!screen || !container) return;

  container.innerHTML = '';
  const desktop = document.getElementById('desktop');
  if (desktop) {
    desktop.classList.remove('show');
    desktop.style.opacity = '0';
  }

  screen.classList.add('show');

  const lines = [
    { text: 'Saving session data...', delay: 0 },
    {
      text: result.success
        ? '✓ Session saved successfully.'
        : '⚠ Save warning — data may not have persisted.',
      delay: 500
    },
    { text: 'Closing active connections...', delay: 900 },
    { text: 'Flushing audit log buffer...', delay: 1300 },
    { text: 'Committing compliance records to registry...', delay: 1700 },
    { text: '', delay: 2100 },
    { text: 'Session terminated.', delay: 2300 },
    { text: 'Returning to login screen...', delay: 2700 }
  ];

  let acc = 0;
  lines.forEach((line) => {
    acc += line.delay;
    setTimeout(() => {
      if (line.text) {
        const el = document.createElement('div');
        el.className = 'logoff-line';
        el.textContent = line.text;
        container.appendChild(el);
      }
    }, acc);
  });

  setTimeout(() => {
    screen.classList.remove('show');
    container.innerHTML = '';

    resetState();
    patchSession((s) => {
      s.blackCherry = { inbox: [], recentCalls: [], pendingRudenessEvents: [] };
      s.jeemail = { accounts: {}, currentUser: null, openMessage: null };
      s.wahoo = { accounts: {}, currentUser: null };
      s.explorerClipboard = { mode: null, items: [] };
      return s;
    });
    try { resetBlackCherryView(); } catch { /* ignore */ }
    SaveManager.setActiveUsername(null);

    if (loginFailUiTimer) {
      clearTimeout(loginFailUiTimer);
      loginFailUiTimer = null;
    }
    const unameEl = document.getElementById('uname');
    if (unameEl) { unameEl.value = ''; unameEl.readOnly = false; }
    const upassEl = document.getElementById('upass');
    if (upassEl) upassEl.value = '';

    window.__corpOsSaveStatus = window.__corpOsSaveStatus || { ready: true, hasUsers: false, accounts: [] };
    window.__corpOsSaveStatus.accounts = window.SaveManager?.getAccountIndex?.() || [];
    window.__corpOsSaveStatus.hasUsers = window.__corpOsSaveStatus.accounts.length > 0;

    if (window.__corpOsSaveStatus.hasUsers) {
      showUserPicker(window.__corpOsSaveStatus.accounts);
    }

    const loginScreen = document.getElementById('login-screen');
    if (loginScreen) {
      loginScreen.style.display = 'flex';
      loginScreen.style.opacity = '1';
      loginScreen.classList.add('show');
    }
    const f = document.getElementById('lform');
    const v = document.getElementById('lverify');
    if (v) {
      v.innerHTML = LOGIN_VERIFY_PENDING_HTML;
      v.style.display = 'none';
    }
    if (f) f.style.display = 'block';
  }, acc + 1200);
}

export function exposeGlobals() {
  window.doLogin = doLogin;
  window.doShutdown = doShutdown;
  window.doLogOff = doLogOff;
}
