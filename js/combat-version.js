/**
 * combat-version.js
 * Shared version progression for CorpOS combat / espionage programs.
 */
import { getState, patchState } from './gameState.js';

export const VERSION_PROFILES = {
  '1.0': {
    label: 'v1.0',
    dcBonus: 0,
    notorietyMultiplier: 1.0,
    discoveryChance: 0.3,
    cooldownMultiplier: 1.0,
    logSeverity: 'suspicious',
    logDetail: 'full',
    traceLevel: 'full'
  },
  '2.0': {
    label: 'v2.0',
    dcBonus: 3,
    notorietyMultiplier: 0.65,
    discoveryChance: 0.15,
    cooldownMultiplier: 0.7,
    logSeverity: 'notable',
    logDetail: 'partial',
    traceLevel: 'partial'
  },
  '3.0': {
    label: 'v3.0',
    dcBonus: 6,
    notorietyMultiplier: 0.35,
    discoveryChance: 0.05,
    cooldownMultiplier: 0.45,
    logSeverity: null,
    logDetail: 'none',
    traceLevel: 'none'
  }
};

/** @type {string[]} */
export const COMBAT_PROGRAM_BASE_IDS = Object.freeze([
  'phantom-press',
  'market-force',
  'ghost-corp',
  'dataminer-pro',
  'compliance-cannon',
  'signal-scrub'
]);

export function getInstalledVersion(baseAppId) {
  const st = getState();
  const installed = st.software?.installedAppIds || [];
  const b = String(baseAppId || '');
  if (installed.includes(`${b}-v3`)) return '3.0';
  if (installed.includes(`${b}-v2`)) return '2.0';
  if (installed.includes(b)) return '1.0';
  return null;
}

/** Effective manifest / VFS id for integrity + seeding (highest tier only). */
export function getEffectiveInstallId(baseAppId) {
  const v = getInstalledVersion(baseAppId);
  if (!v) return null;
  const b = String(baseAppId || '');
  if (v === '3.0') return `${b}-v3`;
  if (v === '2.0') return `${b}-v2`;
  return b;
}

export function getVersionProfile(baseAppId) {
  const ver = getInstalledVersion(baseAppId);
  if (!ver) return null;
  return VERSION_PROFILES[ver];
}

export function applyVersionModifiers(baseAttack, versionProfile) {
  const mult = versionProfile.notorietyMultiplier;
  const baseDiscover = baseAttack.notorietyOnDiscover ?? baseAttack.notorietyCost * 2;
  const expose = baseAttack.notorietyOnExpose ?? 0;
  return {
    ...baseAttack,
    dc: Math.max(1, baseAttack.dc - versionProfile.dcBonus),
    notorietyCost: Math.max(0, Math.round(baseAttack.notorietyCost * mult)),
    notorietyOnDiscover: Math.max(0, Math.round(baseDiscover * mult)),
    notorietyOnExpose: Math.max(0, Math.round(expose * mult)),
    cooldownMs: Math.max(1000, Math.round(baseAttack.cooldownMs * versionProfile.cooldownMultiplier)),
    discoveryChance: versionProfile.discoveryChance,
    logDetail: versionProfile.logDetail,
    logSeverity: versionProfile.logSeverity,
    traceLevel: versionProfile.traceLevel
  };
}

/** DataMiner intel reduces effective DC against the same target. */
export function getIntelDcBonus(targetId, baseAppId) {
  const st = getState();
  const d = st.dataMinerDossiers || {};
  const tid = String(targetId || '').trim();
  if (!tid) return 0;
  let b = 0;
  if (d[tid]?.dcBonus) b = Math.max(b, Number(d[tid].dcBonus) || 0);
  if (baseAppId === 'market-force' && d[`market-force:${tid}`]?.dcBonus) {
    b = Math.max(b, Number(d[`market-force:${tid}`].dcBonus) || 0);
  }
  return b;
}

/**
 * Version-tuned attack row + sim DC after intel. Does not modify state.
 * @returns {{ adj: object, effectiveDc: number, intelBonus: number }}
 */
export function resolveCombatDc(baseAppId, baseAttack, targetId) {
  const vp = getVersionProfile(baseAppId);
  let adj;
  if (vp) {
    adj = applyVersionModifiers(baseAttack, vp);
  } else {
    const nd = baseAttack.notorietyOnDiscover ?? (Number(baseAttack.notorietyCost) || 0) * 2;
    adj = {
      ...baseAttack,
      discoveryChance: 0.3,
      notorietyOnDiscover: nd,
      dc: baseAttack.dc,
      cooldownMs: baseAttack.cooldownMs
    };
  }
  const intelBonus = getIntelDcBonus(String(targetId || '').trim(), baseAppId);
  const effectiveDc = Math.max(2, adj.dc - intelBonus);
  return { adj, effectiveDc, intelBonus };
}

/**
 * Combat operation log — respects version trace (full / partial / none).
 * @param {string} logType e.g. PHANTOM_OP, MARKET_OP
 * @param {string} fullDetail full message for v1
 * @param {{ suspicious?: boolean, notable?: boolean }} meta
 * @param {{ logDetail?: string }} attack version-adjusted attack row
 */
export function versionSafeCombatLog(logType, fullDetail, meta, attack) {
  const ld = attack?.logDetail ?? 'full';
  if (ld === 'none') return;
  if (ld === 'partial') {
    window.ActivityLog?.log?.('SYSTEM_PROCESS', 'Background process completed.', { notable: true });
    return;
  }
  window.ActivityLog?.log?.(logType, fullDetail, meta);
}

export function canUpgradeTo(baseAppId, targetVersion) {
  const current = getInstalledVersion(baseAppId);
  if (targetVersion === '2.0') return current === '1.0';
  if (targetVersion === '3.0') {
    if (current !== '2.0') return false;
    return !!getState().flags?.darkWebReferralUnlocked;
  }
  return false;
}

const REFERRAL_CODES = new Set(['DEEPNODE559', 'PHANTOM30', 'CORPOS_DARK_V3']);

export function unlockV3Referral(code) {
  const normalized = String(code || '')
    .toUpperCase()
    .trim();
  if (!REFERRAL_CODES.has(normalized)) {
    return { ok: false, message: 'Invalid referral code.' };
  }
  const st = getState();
  if (st.flags?.darkWebReferralUnlocked) {
    return { ok: true, message: 'Referral tier already unlocked.' };
  }
  patchState((s) => {
    s.flags = s.flags || {};
    s.flags.darkWebReferralUnlocked = true;
    return s;
  });
  return {
    ok: true,
    message: 'Restricted v3.0 listings unlocked. Check devtools.net and dark web storefronts.'
  };
}
