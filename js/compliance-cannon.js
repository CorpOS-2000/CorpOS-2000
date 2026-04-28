/**
 * compliance-cannon.js — Fabricated federal complaints vs competitors (dark web).
 */
import { resolveRivalId } from './rival-companies.js';
import { getState, patchState } from './gameState.js';
import { resolveAgainstDC } from './d20.js';
import { combatCooldownRemaining, combatCooldownSet } from './combat-cooldowns.js';
import { SMS } from './bc-sms.js';
import { getVersionProfile, versionSafeCombatLog, resolveCombatDc } from './combat-version.js';

export const CC_OPS = {
  file_complaint: {
    label: 'File Anonymous Complaint',
    icon: '📨',
    description: 'Submit fabricated complaint to FRA/FBCE. Damage is delayed — takes 2 in-game days to process.',
    dc: 11,
    cooldownMs: 36 * 3600000,
    notorietyCost: 15,
    notorietyOnExpose: 45,
    cost: 0,
    delayMs: 2 * 24 * 3600000,
    sentimentDamage: 12,
    complianceFlagsAdded: 1,
    triggersInvestigation: false
  },
  trigger_audit: {
    label: 'Trigger Rival Audit',
    icon: '⚖',
    description:
      'Force federal audit on a competitor. Devastating if successful. Takes 3 days to land. Federal blowback on failure.',
    dc: 16,
    cooldownMs: 96 * 3600000,
    notorietyCost: 28,
    notorietyOnExpose: 65,
    cost: 3500,
    delayMs: 3 * 24 * 3600000,
    sentimentDamage: 0,
    complianceFlagsAdded: 3,
    triggersInvestigation: true
  }
};

export function executeComplianceCannon(opId, targetId) {
  const base = CC_OPS[opId];
  if (!base) return { success: false, reason: 'Unknown operation.' };

  const vp = getVersionProfile('compliance-cannon');
  if (!vp) return { success: false, reason: 'Compliance Cannon is not installed.' };

  const tid = String(targetId || '').trim();
  if (!tid) return { success: false, reason: 'Enter competitor company ID or name.' };

  const left = combatCooldownRemaining(`cc:${opId}:${tid}`);
  if (left > 0) return { success: false, reason: `Cooldown (~${Math.ceil(left / 3600000)}h sim).` };

  const st = getState();

  const { adj, effectiveDc, intelBonus } = resolveCombatDc('compliance-cannon', base, tid);

  if (adj.cost > 0) {
    const primary = (st.accounts || []).find((a) => a.isPrimary) || st.accounts?.find((a) => a.id === 'fncb');
    if (!primary || Number(primary.balance || 0) < adj.cost) {
      return { success: false, reason: `Need $${adj.cost.toLocaleString()} for forged filings.` };
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

  combatCooldownSet(`cc:${opId}:${tid}`, adj.cooldownMs);

  versionSafeCombatLog(
    'COMPLIANCE_OP',
    `Compliance Cannon [${adj.label}] — ${tid}`,
    { suspicious: true },
    adj
  );

  if (!result.success) {
    let exposed = false;
    if (Math.random() < adj.discoveryChance) {
      exposed = true;
      patchState((s) => {
        s.corporateProfile = s.corporateProfile || {};
        s.corporateProfile.notoriety = Math.min(200, (s.corporateProfile.notoriety || 0) + (adj.notorietyOnExpose || 0));
        return s;
      });
      SMS.send({
        from: 'FBCE',
        message: `NOTICE: A fraudulent federal complaint traced to your operator network — Special Review. Operator: ${st.player?.operatorId ?? 'UNKNOWN'}`,
        gameTime: st.sim?.elapsedMs ?? 0
      });
    }
    return { success: false, exposed, reason: exposed ? 'Operation traced.' : 'Filing rejected — forensics inconclusive.', dice: rollDisplay };
  }

  const simMs = st.sim?.elapsedMs || 0;
  const flags = base.complianceFlagsAdded || 1;
  const sent = opId === 'file_complaint' ? base.sentimentDamage ?? 12 : 0;
  const delay = base.delayMs || 2 * 24 * 3600000;

  patchState((s) => {
    s.pendingCombatEffects = s.pendingCombatEffects || [];
    s.pendingCombatEffects.push({
      kind: 'compliance_cannon',
      targetId: tid,
      dueSimMs: simMs + delay,
      flags: opId === 'trigger_audit' ? 3 : flags,
      sentimentDamage: opId === 'file_complaint' ? sent : 0,
      triggersInvestigation: !!base.triggersInvestigation
    });
    return s;
  });

  return {
    success: true,
    dice: rollDisplay,
    payload: {
      notice: 'Federal channels acknowledged filing — market impact is delayed per processing windows.',
      delayMs: delay
    }
  };
}
