/**
 * signal-scrub.js — Counter-surveillance (audit log noise, investigator gate delay).
 */
import { getState, patchState } from './gameState.js';
import { applyEffect, getAll } from './rival-companies.js';
import { resolveAgainstDC } from './d20.js';
import { combatCooldownRemaining, combatCooldownSet } from './combat-cooldowns.js';
import { getVersionProfile, versionSafeCombatLog, resolveCombatDc } from './combat-version.js';
import { SMS } from './bc-sms.js';

const SIM_HOUR_MS = 3600000;

export const SS_OPS = {
  degrade_log: {
    label: 'Degrade Log Entries',
    icon: '🗑',
    description:
      'Replace up to 8 FLAGGED entries with neutral noise. Net positive on notoriety if 3+ flags removed.',
    dc: 12,
    cooldownMs: 20 * 3600000,
    notorietyCost: 8,
    notorietyOnDiscover: 20,
    cost: 0,
    maxEntriesDegraded: 8
  },
  slow_escalation: {
    label: 'Slow Investigator',
    icon: '🐌',
    description:
      'Delays investigator tier advancement by 48–72 hours. Buys time to reduce notoriety through other means.',
    dc: 14,
    cooldownMs: 60 * 3600000,
    notorietyCost: 6,
    notorietyOnDiscover: 16,
    cost: 250,
    delayGrantedMs: 60 * 3600000
  },
  noise_burst: {
    label: 'Noise Burst',
    icon: '📡',
    description: 'Flood log with 30-60 benign entries. Only works BEFORE agent copy at audit Stage 2.',
    dc: 9,
    cooldownMs: 36 * 3600000,
    notorietyCost: 4,
    notorietyOnDiscover: 12,
    cost: 0,
    noiseBurstMin: 30,
    noiseBurstMax: 60
  }
};

export function executeSignalScrub(opId) {
  const base = SS_OPS[opId];
  if (!base) return { success: false, reason: 'Unknown operation.' };

  const vp = getVersionProfile('signal-scrub');
  if (!vp) return { success: false, reason: 'SignalScrub is not installed.' };

  const { adj, effectiveDc, intelBonus } = resolveCombatDc('signal-scrub', base, '');

  const left = combatCooldownRemaining(`ss:${opId}`);
  if (left > 0) return { success: false, reason: `Cooldown (~${Math.ceil(left / 3600000)}h sim).` };

  const st = getState();

  if (adj.cost > 0) {
    const primary = (st.accounts || []).find((a) => a.isPrimary) || st.accounts?.find((a) => a.id === 'fncb');
    if (!primary || Number(primary.balance || 0) < adj.cost) {
      return { success: false, reason: `Need $${adj.cost} for traffic generators.` };
    }
    patchState((s) => {
      const p = (s.accounts || []).find((a) => a.isPrimary) || s.accounts?.find((a) => a.id === 'fncb');
      if (p) p.balance = Math.round((Number(p.balance || 0) - adj.cost) * 100) / 100;
      return s;
    });
  }

  const acumen = Number(st.player?.acumen ?? 10);
  const result = resolveAgainstDC({ dc: effectiveDc, modifier: Math.floor((acumen - 10) / 2) });
  const rollDisplay = { ...result, effectiveDc, intelBonus };

  patchState((s) => {
    s.corporateProfile = s.corporateProfile || {};
    s.corporateProfile.notoriety = Math.min(200, (s.corporateProfile.notoriety || 0) + adj.notorietyCost);
    return s;
  });

  combatCooldownSet(`ss:${opId}`, adj.cooldownMs);

  versionSafeCombatLog('SCRUB_OP', `SignalScrub [${adj.label}]`, { suspicious: true }, adj);

  if (!result.success) {
    let discovered = false;
    if (Math.random() < adj.discoveryChance) {
      discovered = true;
      patchState((s) => {
        s.corporateProfile = s.corporateProfile || {};
        s.corporateProfile.notoriety = Math.min(
          200,
          (s.corporateProfile.notoriety || 0) + (adj.notorietyOnDiscover || 0)
        );
        return s;
      });
      SMS.send({
        from: 'COMPLIANCE_MONITOR',
        message: `ALERT: Tamper attempt on audit substrate — operator flag raised. Operator: ${st.player?.operatorId ?? 'UNKNOWN'}`,
        gameTime: st.sim?.elapsedMs ?? 0
      });
    }
    return {
      success: false,
      discovered,
      exposed: discovered,
      reason: 'Log integrity check blocked scrub.',
      dice: rollDisplay
    };
  }

  if (opId === 'degrade_log') {
    const maxD = base.maxEntriesDegraded ?? 8;
    const n = window.ActivityLog?.degradeFlaggedEntries?.(maxD) ?? 0;
    return { success: true, dice: rollDisplay, payload: { degradedEntries: n } };
  }

  if (opId === 'slow_escalation') {
    const delay = base.delayGrantedMs || 60 * SIM_HOUR_MS;
    patchState((s) => {
      s.corporateProfile = s.corporateProfile || {};
      const now = s.sim?.elapsedMs || 0;
      const cur = s.corporateProfile.investigatorTierAdvanceEarliestSimMs || 0;
      s.corporateProfile.investigatorTierAdvanceEarliestSimMs = Math.max(cur, now) + delay;
      return s;
    });
    return { success: true, dice: rollDisplay, payload: { investigatorDelayHours: Math.round(delay / SIM_HOUR_MS) } };
  }

  const minL = base.noiseBurstMin ?? 30;
  const maxL = base.noiseBurstMax ?? 60;
  const count = minL + Math.floor(Math.random() * (maxL - minL + 1));
  const noiseTypes = [
    ['SYSTEM_CHECK', 'Automated system health check completed.'],
    ['WORLDNET_VISIT', 'http://www.wahoo.net/ — outbound'],
    ['SYSTEM_ROUTINE', 'Background process audit — no anomalies.'],
    ['APP_LAUNCH', 'Media Player launched.']
  ];
  if (adj.logDetail !== 'none') {
    for (let i = 0; i < count; i++) {
      const [type, detail] = noiseTypes[Math.floor(Math.random() * noiseTypes.length)];
      window.ActivityLog?.log?.(type, detail);
    }
  }

  if (opId === 'noise_burst') {
    const rivals = getAll();
    if (rivals.length) {
      const pick = rivals[Math.floor(Math.random() * rivals.length)];
      applyEffect('regulator_whisper', pick.id, {});
    }
  }

  return { success: true, dice: rollDisplay, payload: { noiseLines: adj.logDetail === 'none' ? 0 : count } };
}
