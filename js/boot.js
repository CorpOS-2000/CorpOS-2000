import { pause, unpause } from './clock.js';
import { TOAST_KEYS, toast } from './toast.js';
import { smsToPlayer } from './black-cherry.js';
import { getState } from './gameState.js';
import { showEnrollment, verifyOsLogin, triggerLicenseTermination } from './corpos-enrollment.js';
import {
  loadFirstPlayableAudio,
  getPowerOnCandidates,
  getBiosInitializeCandidates,
  getBiosExecuteCandidates,
  getCorpBootCandidates,
  safeDurationMs
} from './boot-audio.js';

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
    setTimeout(() => hideBios(), tailMs);
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

  biosIdx = 0;
  biosInitPlayed = false;
  biosPostBeepScheduled = false;
  refreshBiosAudioPhases();
  nextBiosLine();
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
    showLogin();
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

async function showLoginOrEnrollment() {
  const p = getState().player;
  if (p.licenseTerminated) {
    triggerLicenseTermination(p.terminationReason || 'Section 17');
    return;
  }
  if (!p.corposEnrollmentComplete) {
    const enrollScreen = document.getElementById('enrollment-screen');
    if (enrollScreen) {
      enrollScreen.style.display = 'flex';
      await showEnrollment();
    }
  }
  showLogin();
}

export function showLogin() {
  const p = getState().player;
  const unameEl = document.getElementById('uname');
  if (unameEl && p.username) unameEl.value = p.username;
  const ls = document.getElementById('login-screen');
  ls?.classList.add('show');
}

export function doLogin() {
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
      setTimeout(() => {
        vEl.style.display = 'none';
        if (fEl) fEl.style.display = 'block';
      }, 2400);
    }
    return;
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
  if (form) form.style.display = 'none';
  if (v) v.style.display = 'block';
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
      message: 'Federal Mandate 2000-CR7 compliance mode active.',
      icon: '◆',
      autoDismiss: 5000
    });
  }, 1400);
  setTimeout(() => {
    const u = document.getElementById('uname')?.value || 'OPERATOR';
    smsToPlayer(`Welcome, ${u.toUpperCase()}. You have 1 new message in Black Cherry.`);
  }, 3200);
}

export function doShutdown() {
  pause('shutdown');
  const sd = document.getElementById('shutdown-screen');
  if (!sd) return;
  sd.classList.add('show');
  const msg = document.getElementById('sd-msg');
  if (!msg) return;
  const lines = [
    'Saving session data...',
    'Closing active connections...',
    'Flushing audit log buffer...',
    'Synchronizing with Federal Business Registry...',
    'Committing compliance records...',
    'Terminating CorpOS services...',
    '',
    'It is now safe to turn off your computer.',
    '',
    '<span style="font-size:11px;color:#555;">All activity has been logged per Federal Mandate 2000-CR7.</span>'
  ];
  let i = 0;
  function nextLine() {
    if (i >= lines.length) return;
    msg.innerHTML += lines[i] + '<br>';
    i++;
    setTimeout(nextLine, i < 7 ? 600 : 1200);
  }
  nextLine();
}

export function exposeGlobals() {
  window.doLogin = doLogin;
  window.doShutdown = doShutdown;
}
