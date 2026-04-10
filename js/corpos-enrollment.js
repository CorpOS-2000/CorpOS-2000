/**
 * CorpOS 2000 — Mandatory enrollment wizard, identity validation,
 * compliance lockout, and license termination.
 */
import { getState, patchState } from './gameState.js';
import { generatePlayerAndMomAfterEnrollment } from './world-generation.js';
import { SaveManager } from '../engine/SaveManager.js';

const COS_SEAL_SVG = `<svg viewBox="0 0 140 140" width="64" height="64" style="vertical-align:middle;"><rect x="8" y="8" width="124" height="124" rx="6" fill="#0d1a3a" stroke="#a6b5e7" stroke-width="1.5"/><rect x="14" y="14" width="112" height="112" rx="4" fill="none" stroke="#a6b5e7" stroke-width=".5" opacity=".25"/><path d="M14 28 L14 14 L28 14" fill="none" stroke="#a6b5e7" stroke-width="1.5" opacity=".55"/><path d="M112 14 L126 14 L126 28" fill="none" stroke="#a6b5e7" stroke-width="1.5" opacity=".55"/><path d="M14 112 L14 126 L28 126" fill="none" stroke="#a6b5e7" stroke-width="1.5" opacity=".55"/><path d="M112 126 L126 126 L126 112" fill="none" stroke="#a6b5e7" stroke-width="1.5" opacity=".55"/><text x="56" y="74" font-family="Orbitron,monospace" font-weight="900" font-size="68" fill="white" text-anchor="middle" dominant-baseline="middle">C</text><text x="102" y="57" font-family="Orbitron,monospace" font-weight="700" font-size="24" fill="#a6b5e7" text-anchor="middle" dominant-baseline="middle">O</text><line x1="86" y1="72" x2="118" y2="72" stroke="#a6b5e7" stroke-width=".8" opacity=".45"/><text x="102" y="90" font-family="Orbitron,monospace" font-weight="700" font-size="24" fill="#6688cc" text-anchor="middle" dominant-baseline="middle">S</text><line x1="22" y1="108" x2="118" y2="108" stroke="#a6b5e7" stroke-width=".6" opacity=".3"/><text x="70" y="118" font-family="Share Tech Mono,monospace" font-size="7" fill="#445577" text-anchor="middle" letter-spacing="5">CORPOS 2000</text></svg>`;

/* ──── DEV-ONLY: Set to true to show a "fill test data" button on Step 1. ──── */
export const CORPOS_DEV_ENROLLMENT_AUTOFILL = true;
/** Dev enrollment and logon use this password (Federal test credential). */
export const CORPOS_DEV_DEFAULT_PASSWORD = '1234';
/* ──────────────────────────────────────────────────────────────────────────── */

const SEX_OPTIONS = ['Male', 'Female'];
const RACE_OPTIONS = [
  'White', 'Black or African American', 'Hispanic or Latino',
  'Asian', 'Native American or Alaska Native',
  'Native Hawaiian or Pacific Islander', 'Two or More Races', 'Other'
];

const VIOLATION_MESSAGES = [
  'Please refrain from troll-like behavior.',
  'Please refrain from troll-like behavior.',
  'You are being traced. Please desist.',
  'Your data has been logged. A Federal Mandate Agent will be with you shortly.'
];

const MAX_LOGIN_ATTEMPTS = 5;

/* ────────── Identity validation ────────── */

export function validateIdentityInputs(f) {
  const nameRe = /^[A-Za-z][A-Za-z' -]{0,48}[A-Za-z]$/;
  if (!f.firstName || !nameRe.test(f.firstName.trim())) return { ok: false, code: 'bad_first_name' };
  if (!f.lastName || !nameRe.test(f.lastName.trim())) return { ok: false, code: 'bad_last_name' };
  if (!f.dob) return { ok: false, code: 'bad_dob' };
  const dobDate = new Date(f.dob);
  if (isNaN(dobDate.getTime())) return { ok: false, code: 'bad_dob' };
  const ageNum = Number(f.age);
  if (!Number.isFinite(ageNum) || ageNum < 18 || ageNum > 100) return { ok: false, code: 'bad_age' };
  const calcAge = Math.floor((Date.UTC(2000, 0, 1) - dobDate.getTime()) / (365.25 * 86400000));
  if (Math.abs(calcAge - ageNum) > 1) return { ok: false, code: 'age_mismatch' };
  if (!SEX_OPTIONS.includes(f.sex)) return { ok: false, code: 'bad_sex' };
  if (!RACE_OPTIONS.includes(f.race)) return { ok: false, code: 'bad_race' };
  const ht = Number(f.heightInches);
  if (!Number.isFinite(ht) || ht < 54 || ht > 84) return { ok: false, code: 'bad_height' };
  return { ok: true, code: '' };
}

/* ────────── Violation + termination ────────── */

export function getViolationMessage(attemptIndex) {
  return VIOLATION_MESSAGES[Math.min(attemptIndex, VIOLATION_MESSAGES.length - 1)];
}

export function shouldTerminate(attemptIndex) {
  return attemptIndex >= 3;
}

export function triggerLicenseTermination(section) {
  patchState(s => {
    s.player.licenseTerminated = true;
    s.player.terminationReason = section || 'Section 17';
    return s;
  });
  showTerminationOverlay(section || 'Section 17');
}

function showTerminationOverlay(section) {
  let overlay = document.getElementById('mandate-termination');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'mandate-termination';
    document.body.appendChild(overlay);
  }
  overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:#0d1a3a;display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `
<div style="text-align:center;max-width:560px;color:#fff;font-family:Tahoma,Arial,sans-serif;">
  ${COS_SEAL_SVG}
  <h1 style="color:#cc0000;font-size:20px;margin:16px 0 8px;">LICENSE TERMINATED</h1>
  <p style="font-size:13px;line-height:1.6;color:#b8c4e0;">
    Your CorpOS 2000 operating license has been <b style="color:#ff4444;">TERMINATED</b> due to mandate violation
    <b>(${section})</b>.
  </p>
  <p style="font-size:11px;color:#8899bb;margin-top:8px;">
    All session data has been forwarded to the Federal Office of Commercial Systems.<br>
    Compliance Division case file has been opened. No further access is permitted.
  </p>
  <div style="margin-top:24px;padding:12px;border:2px solid #cc0000;background:rgba(200,0,0,0.08);">
    <p style="font-size:12px;color:#ffaaaa;">
      Federal Mandate 2000-CR7 — Compliance Enforcement<br>
      <span style="font-size:10px;color:#8899bb;">Violation recorded. Terminal session flagged.</span>
    </p>
  </div>
  <button type="button" id="terminate-exit-btn" style="margin-top:24px;padding:8px 32px;font-size:14px;font-weight:bold;background:#cc0000;color:#fff;border:2px solid #ff4444;cursor:pointer;font-family:Tahoma,sans-serif;">Exit</button>
  <p id="terminate-fallback" style="display:none;font-size:10px;color:#667;margin-top:8px;">If the window did not close: press Alt+F4 or close this tab.</p>
</div>`;
  overlay.querySelector('#terminate-exit-btn').addEventListener('click', () => {
    try { window.close(); } catch { /* */ }
    document.getElementById('terminate-fallback').style.display = 'block';
  });
}

/* ────────── SSN generator ────────── */

function generateSSN() {
  const area = String(100 + Math.floor(Math.random() * 800)).padStart(3, '0');
  const group = String(1 + Math.floor(Math.random() * 99)).padStart(2, '0');
  const serial = String(1 + Math.floor(Math.random() * 9999)).padStart(4, '0');
  return `${area}-${group}-${serial}`;
}

/* ────────── Enrollment wizard ────────── */

let _enrollmentResolve = null;

export function showEnrollment() {
  return new Promise(resolve => {
    _enrollmentResolve = resolve;
    const screen = document.getElementById('enrollment-screen');
    if (screen) {
      screen.style.display = 'flex';
      renderStep1(screen);
    }
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function mandateHeader() {
  return `
<div style="text-align:center;margin-bottom:16px;">
  ${COS_SEAL_SVG}
  <h1 style="font-size:18px;color:#fff;margin:10px 0 4px;font-family:Tahoma,sans-serif;">CorpOS 2000 — Federal Registration</h1>
  <div style="font-size:10px;color:#8899bb;">Federal Office of Commercial Systems &nbsp;|&nbsp; Mandate 2000-CR7</div>
  <div style="font-size:10px;color:#667;margin-top:4px;">All citizens must complete identity registration before accessing CorpOS workstations.<br>Providing false information is a federal offense under Section 17 of the Commercial Systems Act.</div>
</div>`;
}

function selectOptions(list, selected) {
  return '<option value="">— Select —</option>' +
    list.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

const FIELD_STYLE = 'height:20px;font-size:11px;padding:0 4px;border:2px inset #555;background:#1a2a4a;color:#fff;';
const SELECT_STYLE = 'height:22px;font-size:11px;background:#1a2a4a;color:#fff;border:2px inset #555;';
const ERROR_OUTLINE = '2px solid #cc0000';
const ERROR_SHADOW = '0 0 6px rgba(255,50,50,0.6)';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const ERROR_CODE_TO_FIELDS = {
  bad_first_name: ['enr-fname'],
  bad_last_name: ['enr-lname'],
  bad_dob: ['enr-dob-month', 'enr-dob-day', 'enr-dob-year'],
  bad_age: ['enr-age'],
  age_mismatch: ['enr-age', 'enr-dob-month', 'enr-dob-day', 'enr-dob-year'],
  bad_sex: ['enr-sex'],
  bad_race: ['enr-race'],
  bad_height: ['enr-ht-ft', 'enr-ht-in']
};

function clearFieldErrors() {
  for (const ids of Object.values(ERROR_CODE_TO_FIELDS)) {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) { el.style.border = '2px inset #555'; el.style.boxShadow = 'none'; }
    }
  }
}

function highlightFieldErrors(code) {
  clearFieldErrors();
  const ids = ERROR_CODE_TO_FIELDS[code];
  if (!ids) return;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) { el.style.border = ERROR_OUTLINE; el.style.boxShadow = ERROR_SHADOW; }
  }
}

function monthOptions() {
  return '<option value="">Month</option>' +
    MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('');
}

function dayOptions() {
  let h = '<option value="">Day</option>';
  for (let d = 1; d <= 31; d++) h += `<option value="${d}">${d}</option>`;
  return h;
}

function yearOptions() {
  let h = '<option value="">Year</option>';
  for (let y = 1900; y <= 1982; y++) h += `<option value="${y}">${y}</option>`;
  return h;
}

function feetOptions() {
  let h = '<option value="">ft</option>';
  for (let f = 4; f <= 7; f++) h += `<option value="${f}">${f}\u2032</option>`;
  return h;
}

function inchOptions() {
  let h = '<option value="">in</option>';
  for (let i = 0; i <= 11; i++) h += `<option value="${i}">${i}\u2033</option>`;
  return h;
}

/* ──── DEV autofill helper (gated by CORPOS_DEV_ENROLLMENT_AUTOFILL) ──── */
const DEV_FIRST_NAMES = ['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda','David','Barbara','William','Elizabeth','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen'];
const DEV_LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin'];

function randomValidIdentityFields() {
  const firstName = DEV_FIRST_NAMES[Math.floor(Math.random() * DEV_FIRST_NAMES.length)];
  const lastName = DEV_LAST_NAMES[Math.floor(Math.random() * DEV_LAST_NAMES.length)];
  const sex = SEX_OPTIONS[Math.floor(Math.random() * SEX_OPTIONS.length)];
  const race = RACE_OPTIONS[Math.floor(Math.random() * RACE_OPTIONS.length)];
  const birthYear = 1940 + Math.floor(Math.random() * 42); // 1940–1981 → age 19–60 on Jan 1, 2000
  const birthMonth = 1 + Math.floor(Math.random() * 12);
  const maxDay = new Date(birthYear, birthMonth, 0).getDate();
  const birthDay = 1 + Math.floor(Math.random() * maxDay);
  const age = Math.floor((Date.UTC(2000, 0, 1) - Date.UTC(birthYear, birthMonth - 1, birthDay)) / (365.25 * 86400000));
  const totalInches = 54 + Math.floor(Math.random() * 31); // 54–84
  const htFt = Math.floor(totalInches / 12);
  const htIn = totalInches % 12;
  return { firstName, lastName, birthMonth, birthDay, birthYear, age, sex, race, htFt, htIn };
}

function devFillStep4Credentials() {
  const suffix = String(Math.floor(100 + Math.random() * 900));
  const user = `DEVOP${suffix}`;
  const p = CORPOS_DEV_DEFAULT_PASSWORD;
  const el = (id) => document.getElementById(id);
  if (el('enr-user')) el('enr-user').value = user;
  if (el('enr-pass')) el('enr-pass').value = p;
  if (el('enr-pass2')) el('enr-pass2').value = p;
}

function devFillStep1() {
  const f = randomValidIdentityFields();
  const el = (id) => document.getElementById(id);
  if (el('enr-fname')) el('enr-fname').value = f.firstName;
  if (el('enr-lname')) el('enr-lname').value = f.lastName;
  if (el('enr-dob-month')) el('enr-dob-month').value = String(f.birthMonth);
  if (el('enr-dob-day')) el('enr-dob-day').value = String(f.birthDay);
  if (el('enr-dob-year')) el('enr-dob-year').value = String(f.birthYear);
  if (el('enr-age')) el('enr-age').value = String(f.age);
  if (el('enr-sex')) el('enr-sex').value = f.sex;
  if (el('enr-race')) el('enr-race').value = f.race;
  if (el('enr-ht-ft')) el('enr-ht-ft').value = String(f.htFt);
  if (el('enr-ht-in')) el('enr-ht-in').value = String(f.htIn);
}
/* ─────────────────────────────────────────────────────────────────────── */

function renderStep1(screen) {
  const inner = screen.querySelector('.enrollment-inner') || screen;
  const devBtn = CORPOS_DEV_ENROLLMENT_AUTOFILL
    ? `<button type="button" id="enr-dev-fill" style="padding:3px 10px;font-size:9px;background:#333;color:#888;border:1px solid #555;cursor:pointer;margin-right:8px;">Dev: fill test data</button>`
    : '';
  inner.innerHTML = `
${mandateHeader()}
<div style="max-width:440px;margin:0 auto;">
  <h2 style="font-size:14px;color:#a6b5e7;margin-bottom:8px;">Step 1 of 4 — Identity Verification</h2>
  <div id="enroll-warn" style="display:none;padding:6px 10px;margin-bottom:8px;border:2px solid #cc0000;background:rgba(200,0,0,0.15);color:#ff8888;font-size:11px;"></div>
  <table style="border-collapse:collapse;width:100%;">
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;width:120px;">First Name</td><td><input type="text" id="enr-fname" style="width:200px;${FIELD_STYLE}"></td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Last Name</td><td><input type="text" id="enr-lname" style="width:200px;${FIELD_STYLE}"></td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Date of Birth</td><td style="display:flex;gap:4px;align-items:center;">
      <select id="enr-dob-month" style="width:100px;${SELECT_STYLE}">${monthOptions()}</select>
      <select id="enr-dob-day" style="width:56px;${SELECT_STYLE}">${dayOptions()}</select>
      <select id="enr-dob-year" style="width:72px;${SELECT_STYLE}">${yearOptions()}</select>
    </td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Age</td><td><input type="number" id="enr-age" min="18" max="100" style="width:80px;${FIELD_STYLE}"></td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Sex</td><td><select id="enr-sex" style="${SELECT_STYLE}">${selectOptions(SEX_OPTIONS)}</select></td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Race / Ethnicity</td><td><select id="enr-race" style="${SELECT_STYLE}">${selectOptions(RACE_OPTIONS)}</select></td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Height</td><td style="display:flex;gap:4px;align-items:center;">
      <select id="enr-ht-ft" style="width:60px;${SELECT_STYLE}">${feetOptions()}</select>
      <select id="enr-ht-in" style="width:58px;${SELECT_STYLE}">${inchOptions()}</select>
    </td></tr>
  </table>
  <div style="margin-top:12px;text-align:right;">
    ${devBtn}<button type="button" id="enr-step1-next" style="padding:6px 24px;font-size:12px;font-weight:bold;background:#0a246a;color:#fff;border:2px outset #4466aa;cursor:pointer;">Continue</button>
  </div>
</div>`;
  inner.querySelector('#enr-step1-next').addEventListener('click', () => handleStep1(screen));
  if (CORPOS_DEV_ENROLLMENT_AUTOFILL) {
    inner.querySelector('#enr-dev-fill')?.addEventListener('click', devFillStep1);
  }
}

function handleStep1(screen) {
  const dobMonth = document.getElementById('enr-dob-month')?.value || '';
  const dobDay = document.getElementById('enr-dob-day')?.value || '';
  const dobYear = document.getElementById('enr-dob-year')?.value || '';
  let dob = '';
  if (dobMonth && dobDay && dobYear) {
    dob = `${MONTHS[Number(dobMonth) - 1]} ${dobDay}, ${dobYear}`;
  }

  const htFt = Number(document.getElementById('enr-ht-ft')?.value || 0);
  const htIn = Number(document.getElementById('enr-ht-in')?.value || 0);
  const heightInches = (htFt > 0) ? htFt * 12 + htIn : 0;

  const fields = {
    firstName: document.getElementById('enr-fname')?.value?.trim(),
    lastName: document.getElementById('enr-lname')?.value?.trim(),
    dob,
    age: document.getElementById('enr-age')?.value,
    sex: document.getElementById('enr-sex')?.value,
    race: document.getElementById('enr-race')?.value,
    heightInches: String(heightInches)
  };

  clearFieldErrors();
  const result = validateIdentityInputs(fields);
  if (!result.ok) {
    highlightFieldErrors(result.code);
    const st = getState();
    const attempts = (st.player.identityViolationAttemptCount || 0) + 1;
    patchState(s => { s.player.identityViolationAttemptCount = attempts; return s; });
    const idx = attempts - 1;
    if (shouldTerminate(idx)) {
      triggerLicenseTermination('Section 17');
      return;
    }
    const warnEl = document.getElementById('enroll-warn');
    if (warnEl) {
      warnEl.style.display = 'block';
      warnEl.textContent = getViolationMessage(idx);
    }
    return;
  }
  screen._enrollData = { ...fields };
  renderStep2SSN(screen, fields);
}

function renderStep2SSN(screen, fields) {
  const ssn = generateSSN();
  screen._enrollData.ssnFull = ssn;
  screen._enrollData.ssnSuffix = ssn.slice(-4);
  const inner = screen.querySelector('.enrollment-inner') || screen;
  inner.innerHTML = `
${mandateHeader()}
<div style="max-width:440px;margin:0 auto;text-align:center;">
  <h2 style="font-size:14px;color:#a6b5e7;margin-bottom:8px;">Step 2 of 4 — Social Security Number Assignment</h2>
  <p style="color:#b8c4e0;font-size:11px;">Based on your identity verification, the Federal Office of Commercial Systems has assigned the following Social Security Number:</p>
  <div style="margin:16px auto;padding:12px 20px;border:2px solid #a6b5e7;background:rgba(166,181,231,0.1);display:inline-block;">
    <span style="font-family:'Share Tech Mono',monospace;font-size:28px;color:#fff;letter-spacing:4px;">${esc(ssn)}</span>
  </div>
  <p style="color:#667;font-size:10px;margin-top:8px;">Record this number. It is required for all future government and financial interactions.<br>Unauthorized use of another citizen's SSN is punishable under Federal Mandate 2000-CR7.</p>
  <div style="margin-top:16px;">
    <button type="button" id="enr-step2-next" style="padding:6px 24px;font-size:12px;font-weight:bold;background:#0a246a;color:#fff;border:2px outset #4466aa;cursor:pointer;">Continue to Address Registration</button>
  </div>
</div>`;
  inner.querySelector('#enr-step2-next').addEventListener('click', () => renderStep3Address(screen));
}

function renderStep3Address(screen) {
  const inner = screen.querySelector('.enrollment-inner') || screen;
  inner.innerHTML = `
${mandateHeader()}
<div style="max-width:500px;margin:0 auto;">
  <h2 style="font-size:14px;color:#a6b5e7;margin-bottom:8px;">Step 3 of 4 — Residential Address</h2>
  <p style="color:#b8c4e0;font-size:11px;margin-bottom:8px;">Enter your current residential address using the Federal Cartographic Lookup System (Moogle Maps).</p>
  <div id="enr-addr-display" style="display:none;padding:8px 12px;background:rgba(166,181,231,0.1);border:1px solid #4466aa;color:#fff;font-size:12px;margin-bottom:8px;"></div>
  <input type="hidden" id="enr-addr-id" value="">
  <div id="enr-addr-picker" style="border:2px inset #555;background:#111a30;min-height:280px;position:relative;z-index:1;pointer-events:auto;"></div>
  <div style="margin-top:12px;text-align:right;">
    <button type="button" id="enr-step3-next" disabled style="padding:6px 24px;font-size:12px;font-weight:bold;background:#333;color:#888;border:2px outset #444;cursor:not-allowed;">Select an address to continue</button>
  </div>
</div>`;

  const pickerContainer = inner.querySelector('#enr-addr-picker');
  const nextBtn = inner.querySelector('#enr-step3-next');
  const displayEl = inner.querySelector('#enr-addr-display');
  const idEl = inner.querySelector('#enr-addr-id');

  if (window.MoogleMaps?.embedPicker) {
    window.MoogleMaps.embedPicker({
      container: pickerContainer,
      onSelect(addr) {
        idEl.value = addr.id;
        displayEl.style.display = 'block';
        displayEl.textContent = addr.label;
        screen._enrollData.hargroveAddressId = addr.id;
        screen._enrollData.address = addr.label;
        nextBtn.disabled = false;
        nextBtn.style.background = '#0a246a';
        nextBtn.style.color = '#fff';
        nextBtn.style.cursor = 'pointer';
        nextBtn.textContent = 'Continue';
      }
    });
  } else {
    pickerContainer.innerHTML = '<div style="padding:12px;color:#888;font-size:11px;">Moogle Maps not available. Enter address manually:</div><input type="text" id="enr-addr-manual" style="width:90%;margin:8px;height:22px;font-size:11px;padding:0 4px;border:2px inset #555;background:#1a2a4a;color:#fff;">';
    const manualInput = pickerContainer.querySelector('#enr-addr-manual');
    manualInput?.addEventListener('input', () => {
      const v = manualInput.value.trim();
      if (v.length > 5) {
        screen._enrollData.address = v;
        nextBtn.disabled = false;
        nextBtn.style.background = '#0a246a';
        nextBtn.style.color = '#fff';
        nextBtn.style.cursor = 'pointer';
        nextBtn.textContent = 'Continue';
      }
    });
  }
  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled) return;
    renderStep4Credentials(screen);
  });
}

function renderStep4Credentials(screen) {
  const inner = screen.querySelector('.enrollment-inner') || screen;
  inner.innerHTML = `
${mandateHeader()}
<div style="max-width:440px;margin:0 auto;">
  <h2 style="font-size:14px;color:#a6b5e7;margin-bottom:8px;">Step 4 of 4 — Account Credentials & Attestation</h2>
  <p style="color:#b8c4e0;font-size:11px;margin-bottom:8px;">Create your CorpOS workstation credentials. These will be used for all future logon sessions.</p>
  <div id="enr-cred-warn" style="display:none;padding:6px 10px;margin-bottom:8px;border:1px solid #cc6600;background:rgba(200,100,0,0.15);color:#ffaa44;font-size:11px;"></div>
  <table style="border-collapse:collapse;width:100%;">
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;width:140px;">Username</td><td><input type="text" id="enr-user" maxlength="30" style="width:200px;height:20px;font-size:11px;padding:0 4px;border:2px inset #555;background:#1a2a4a;color:#fff;text-transform:uppercase;"></td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Password</td><td><input type="password" id="enr-pass" maxlength="30" style="width:200px;height:20px;font-size:11px;padding:0 4px;border:2px inset #555;background:#1a2a4a;color:#fff;"></td></tr>
    <tr><td style="padding:4px 8px;color:#b8c4e0;font-size:11px;">Confirm Password</td><td><input type="password" id="enr-pass2" maxlength="30" style="width:200px;height:20px;font-size:11px;padding:0 4px;border:2px inset #555;background:#1a2a4a;color:#fff;"></td></tr>
  </table>
  <div style="margin-top:16px;padding:10px;border:2px solid #4466aa;background:rgba(10,36,106,0.2);">
    <label style="display:flex;gap:8px;align-items:flex-start;cursor:pointer;">
      <input type="checkbox" id="enr-attest" style="margin-top:2px;">
      <span style="font-size:10px;color:#b8c4e0;line-height:1.5;">I solemnly swear that all information provided herein is true and accurate to the best of my knowledge, under penalty of law pursuant to Federal Mandate 2000-CR7, Section 4(a). I understand that willful falsification constitutes a federal offense subject to license termination and criminal referral.</span>
    </label>
  </div>
  <div style="margin-top:12px;text-align:right;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;align-items:center;">
    ${CORPOS_DEV_ENROLLMENT_AUTOFILL ? `<button type="button" id="enr-dev-creds" style="padding:4px 10px;font-size:9px;background:#2a1a0a;color:#ccaa66;border:1px solid #664422;cursor:pointer;">Dev: mandate test credentials (pwd 1234)</button>` : ''}
    <button type="button" id="enr-register" disabled style="padding:6px 24px;font-size:12px;font-weight:bold;background:#333;color:#888;border:2px outset #444;cursor:not-allowed;">Register</button>
  </div>
</div>`;

  const attestBox = inner.querySelector('#enr-attest');
  const regBtn = inner.querySelector('#enr-register');
  if (CORPOS_DEV_ENROLLMENT_AUTOFILL) {
    inner.querySelector('#enr-dev-creds')?.addEventListener('click', devFillStep4Credentials);
  }
  attestBox.addEventListener('change', () => {
    if (attestBox.checked) {
      regBtn.disabled = false;
      regBtn.style.background = '#0a246a';
      regBtn.style.color = '#fff';
      regBtn.style.cursor = 'pointer';
    } else {
      regBtn.disabled = true;
      regBtn.style.background = '#333';
      regBtn.style.color = '#888';
      regBtn.style.cursor = 'not-allowed';
    }
  });
  regBtn.addEventListener('click', () => {
    if (regBtn.disabled) return;
    handleRegistration(screen);
  });
}

function handleRegistration(screen) {
  let user = (document.getElementById('enr-user')?.value || '').trim().toUpperCase();
  let pass = document.getElementById('enr-pass')?.value || '';
  let pass2 = document.getElementById('enr-pass2')?.value || '';
  if (CORPOS_DEV_ENROLLMENT_AUTOFILL) {
    pass = CORPOS_DEV_DEFAULT_PASSWORD;
    pass2 = CORPOS_DEV_DEFAULT_PASSWORD;
    const ep = document.getElementById('enr-pass');
    const ep2 = document.getElementById('enr-pass2');
    if (ep) ep.value = pass;
    if (ep2) ep2.value = pass2;
  }
  const warnEl = document.getElementById('enr-cred-warn');
  function warn(msg) { if (warnEl) { warnEl.style.display = 'block'; warnEl.textContent = msg; } }

  if (!user || user.length < 3) { warn('Username must be at least 3 characters.'); return; }
  if (!pass || pass.length < 4) { warn('Password must be at least 4 characters.'); return; }
  if (pass !== pass2) { warn('Passwords do not match.'); return; }

  const d = screen._enrollData;
  patchState(s => {
    const p = s.player;
    p.firstName = d.firstName;
    p.lastName = d.lastName;
    p.displayName = `${d.firstName} ${d.lastName}`;
    p.dob = d.dob;
    p.age = Number(d.age);
    p.sex = d.sex;
    p.race = d.race;
    p.heightInches = Number(d.heightInches);
    p.ssnFull = d.ssnFull;
    p.ssnSuffix = d.ssnSuffix;
    p.address = d.address || '';
    p.hargroveAddressId = d.hargroveAddressId || null;
    p.username = user;
    p.password = pass;
    p.passwordHash = SaveManager.hashPassword(pass);
    p.corposEnrollmentComplete = true;
    p.corposEnrollmentCompletedAtSimMs = s.sim?.elapsedMs || 0;
    p.identityViolationAttemptCount = 0;
    p.osFailedLoginCount = 0;
    const ply = s.registry?.citizens?.find(c => c.kind === 'player');
    if (ply) {
      ply.displayName = p.displayName;
      ply.dob = p.dob;
      ply.ssnFull = p.ssnFull;
    }
    return s;
  });

  screen.style.display = 'none';
  generatePlayerAndMomAfterEnrollment();

  const displayName = `${d.firstName} ${d.lastName}`.trim();
  const passwordHash = SaveManager.hashPassword(pass);
  SaveManager.registerUser(user, passwordHash, displayName);
  SaveManager.setActiveUsername(user);
  SaveManager.save();

  if (_enrollmentResolve) { _enrollmentResolve(); _enrollmentResolve = null; }
}

/* ────────── OS login verification ────────── */

export function verifyOsLogin(username, password) {
  const p = getState().player;
  if (p.licenseTerminated) return { ok: false, reason: 'terminated' };

  const match = SaveManager.verifyPassword(username, password);
  if (match) {
    patchState(s => { s.player.osFailedLoginCount = 0; return s; });
    return { ok: true };
  }

  const attempts = (p.osFailedLoginCount || 0) + 1;
  patchState(s => { s.player.osFailedLoginCount = attempts; return s; });

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    triggerLicenseTermination('Section 22 — Unauthorized Access');
    return { ok: false, reason: 'terminated' };
  }
  return { ok: false, reason: 'invalid', attemptsLeft: MAX_LOGIN_ATTEMPTS - attempts };
}

/* ────────── WorldNet gate interstitial ────────── */

export const CORPOS_GATED_PAGE_KEYS = new Set([
  'bizreg', 'ssa', 'fra', 'devtools'
]);

export function renderGateInterstitial() {
  const p = getState().player;
  if (p.licenseTerminated) {
    return `<div class="iebody" style="text-align:center;padding:40px 20px;font-family:Tahoma,sans-serif;">
${COS_SEAL_SVG}
<h2 style="color:#cc0000;margin-top:12px;">ACCESS DENIED — LICENSE TERMINATED</h2>
<p style="font-size:11px;color:#666;">Your CorpOS 2000 license has been terminated due to mandate violation (${esc(p.terminationReason)}).<br>No further access to federal systems is permitted.</p>
</div>`;
  }
  return `<div class="iebody" style="text-align:center;padding:40px 20px;font-family:Tahoma,sans-serif;">
${COS_SEAL_SVG}
<h2 style="color:#0a246a;margin-top:12px;">ACCESS RESTRICTED</h2>
<p style="font-size:12px;color:#333;margin-top:8px;">This federal system requires completed CorpOS 2000 registration.</p>
<p style="font-size:11px;color:#666;margin-top:4px;">Complete identity enrollment at your workstation logon screen before accessing this resource.</p>
<div style="margin-top:16px;padding:8px 12px;background:#e8ecf8;border:2px inset #d4d0c8;display:inline-block;font-size:10px;color:#333;">
  Federal Mandate 2000-CR7 — Access Control Division<br>
  All attempts to circumvent registration are logged.
</div>
</div>`;
}
