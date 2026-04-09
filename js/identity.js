/** In-game citizen registry + enrollment checks (player + NPCs). */

export const SIM_DAY_MS = 86400000;
export const IDENTITY_FINE_DELAY_DAYS = 2;
export const IDENTITY_FINE_BASE = 5000;

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeSsnDigits(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length !== 9) return null;
  return d;
}

export function normalizePersonName(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDobLoose(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function findCitizenBySsn(state, ssnDigits) {
  const citizens = state.registry?.citizens;
  if (!citizens || !ssnDigits) return null;
  return citizens.find((c) => normalizeSsnDigits(c.ssnFull) === ssnDigits) || null;
}

export function classifyBankEnrollment(state, { legalName, dob, ssnRaw }) {
  const ssnDigits = normalizeSsnDigits(ssnRaw);
  if (!ssnDigits) {
    return { ok: false, violation: 'false_identification', reason: 'invalid_ssn' };
  }
  const citizen = findCitizenBySsn(state, ssnDigits);
  if (!citizen) {
    return { ok: false, violation: 'false_identification', reason: 'unknown_ssn' };
  }
  const submitted = normalizePersonName(legalName);
  const expected = normalizePersonName(citizen.displayName);
  if (submitted !== expected) {
    return { ok: false, violation: 'misrepresentation', reason: 'name_mismatch' };
  }
  if (dob && citizen.dob) {
    if (normalizeDobLoose(dob) !== normalizeDobLoose(citizen.dob)) {
      return { ok: false, violation: 'misrepresentation', reason: 'dob_mismatch' };
    }
  }
  return { ok: true, citizen };
}

export function violationTitle(code) {
  if (code === 'misrepresentation') return 'Misrepresentation';
  return 'False Identification';
}
