/**
 * ghost-corp.js — Shell companies & obfuscated corporate ops (dark web).
 */
import { applyEffect, resolveRivalId } from './rival-companies.js';
import { getState, patchState } from './gameState.js';
import { resolveAgainstDC } from './d20.js';
import { combatCooldownRemaining, combatCooldownSet } from './combat-cooldowns.js';
import { SMS } from './bc-sms.js';
import {
  getVersionProfile,
  versionSafeCombatLog,
  resolveCombatDc
} from './combat-version.js';

export const GC_OPS = {
  register_shell: {
    label: 'Register Shell Entity',
    icon: '🏚',
    description: 'Create anonymous company. Untraceable on v1 and v2. On v3, piercing requires federal audit.',
    dc: 12,
    cooldownMs: 24 * 3600000,
    notorietyCost: 14,
    notorietyOnDiscover: 32,
    cost: 2000
  },
  proxy_acquire: {
    label: 'Proxy Acquisition',
    icon: '🤝',
    description: 'Acquire assets through a shell. Owns rival shares invisibly. Most powerful long-term operation.',
    dc: 15,
    cooldownMs: 60 * 3600000,
    notorietyCost: 18,
    notorietyOnDiscover: 28,
    cost: 0,
    acquisitionPct: 10
  },
  launder_assets: {
    label: 'Asset Laundering',
    icon: '💸',
    description: 'Move money through shells. Obscures transaction origin. On failure: traced to primary account.',
    dc: 16,
    cooldownMs: 48 * 3600000,
    notorietyCost: 22,
    notorietyOnDiscover: 40,
    cost: 0
  }
};

export function executeGhostCorp(opId, targetId, amount) {
  const base = GC_OPS[opId];
  if (!base) return { success: false, reason: 'Unknown operation.' };

  const vp = getVersionProfile('ghost-corp');
  if (!vp) return { success: false, reason: 'GhostCorp is not installed.' };

  const intelTid = opId === 'register_shell' ? '' : String(targetId || '').trim();
  const { adj, effectiveDc, intelBonus } = resolveCombatDc('ghost-corp', base, intelTid);

  let cdSlot = 'register_shell';
  if (opId !== 'register_shell') {
    if (opId === 'launder_assets') cdSlot = `launder_assets:${Math.max(0, Number(amount) || 0)}`;
    else cdSlot = `${opId}:${String(targetId || '').trim() || 'x'}`;
  }
  const left = combatCooldownRemaining(`gc:${cdSlot}`);
  if (left > 0) {
    return { success: false, reason: `Cooldown (~${Math.ceil(left / 3600000)}h sim).` };
  }

  const st = getState();

  if (opId === 'register_shell') {
    const primary = (st.accounts || []).find((a) => a.isPrimary) || st.accounts?.find((a) => a.id === 'fncb');
    if (!primary || Number(primary.balance || 0) < adj.cost) {
      return { success: false, reason: `Need $${adj.cost} for filing fees.` };
    }
  }

  const acumen = Number(st.player?.acumen ?? 10);
  const modifier = Math.floor((acumen - 10) / 2);
  const result = resolveAgainstDC({ dc: effectiveDc, modifier });
  const rollDisplay = { ...result, effectiveDc, intelBonus };

  patchState((s) => {
    s.corporateProfile = s.corporateProfile || {};
    s.corporateProfile.notoriety = Math.min(200, (s.corporateProfile.notoriety || 0) + adj.notorietyCost);
    return s;
  });

  combatCooldownSet(`gc:${cdSlot}`, adj.cooldownMs);

  versionSafeCombatLog('GHOST_OP', `Shell operation [${adj.label}]`, { suspicious: true }, adj);

  if (!result.success) {
    let exposed = false;
    if (Math.random() < adj.discoveryChance) {
      exposed = true;
      patchState((s) => {
        s.corporateProfile = s.corporateProfile || {};
        s.corporateProfile.notoriety = Math.min(
          200,
          (s.corporateProfile.notoriety || 0) + (adj.notorietyOnDiscover ?? 20)
        );
        return s;
      });
      SMS.send({
        from: 'CORPOS_SYSTEM',
        message: `COMPLIANCE ALERT: Irregular corporate registration activity on your operator account — escalated to FBCE review. Ref: GC-${Date.now().toString().slice(-6)}`,
        gameTime: st.sim?.elapsedMs ?? 0
      });
    }
    return {
      success: false,
      exposed,
      discovered: exposed,
      reason: exposed ? 'Operation detected.' : 'Operation failed — no attribution.',
      dice: rollDisplay
    };
  }

  if (opId === 'register_shell') {
    patchState((s) => {
      const p = (s.accounts || []).find((a) => a.isPrimary) || s.accounts?.find((a) => a.id === 'fncb');
      if (p) p.balance = Math.round((Number(p.balance || 0) - adj.cost) * 100) / 100;
      return s;
    });
    const shellId = `shell-${Date.now().toString(36)}`;
    const shellName = `${['Meridian', 'Harbor', 'Pacific', 'Coastal', 'Valley'][Math.floor(Math.random() * 5)]} ${['Holdings', 'Partners', 'Ventures', 'Capital', 'Group'][Math.floor(Math.random() * 5)]} LLC`;
    patchState((s) => {
      s.companies = s.companies || [];
      s.companies.push({
        id: shellId,
        tradingName: shellName,
        legalName: shellName,
        isShell: true,
        ownedByPlayer: true,
        ownerObfuscated: true,
        industry: 'Holdings',
        publicSentiment: 50,
        registeredSimMs: s.sim?.elapsedMs || 0
      });
      return s;
    });
    scheduleGhostReferralSms();
    return { success: true, shellId, shellName, dice: rollDisplay };
  }

  if (opId === 'proxy_acquire') {
    const rid = resolveRivalId(String(targetId || ''));
    const st2 = getState();
    const shells = (st2.companies || []).filter((c) => c.ownedByPlayer && c.isShell);
    const shell = shells[shells.length - 1];
    const pct = base.acquisitionPct || 10;
    if (rid && shell) {
      applyEffect('proxy_acquire', rid, { shellId: shell.id, pct });
    }
    return {
      success: true,
      dice: rollDisplay,
      payload: {
        note: 'Proxy acquisition routed through layered shell nominee. No public record until next filing window.',
        target: String(targetId || '').trim(),
        shellId: shell?.id || null
      }
    };
  }

  const amt = Math.max(0, Number(amount) || 0);
  return {
    success: true,
    dice: rollDisplay,
    payload: {
      note:
        amt > 0
          ? `Structured pass-through of $${amt.toLocaleString()} across nominee accounts — compliance trail intentionally ambiguous.`
          : 'Specify an amount on the next build for layered pass-through bookkeeping.'
    }
  };
}

/** Sim-time delayed SMS with PHANTOM30 (6–48h after first successful shell). */
function scheduleGhostReferralSms() {
  patchState((s) => {
    s.flags = s.flags || {};
    if (s.flags._ghostReferralSmsSent || s.flags._ghostReferralSmsDueSimMs != null) return s;
    const delay = (6 + Math.random() * 42) * 3600000;
    s.flags._ghostReferralSmsDueSimMs = (s.sim?.elapsedMs || 0) + delay;
    return s;
  });
}

export function tickGhostReferralSms() {
  const st = getState();
  const due = st.flags?._ghostReferralSmsDueSimMs;
  if (due == null || st.flags?._ghostReferralSmsSent) return;
  if ((st.sim?.elapsedMs || 0) < due) return;
  patchState((s) => {
    s.flags = s.flags || {};
    s.flags._ghostReferralSmsSent = true;
    delete s.flags._ghostReferralSmsDueSimMs;
    return s;
  });
  SMS.send({
    from: 'ANON_559',
    message:
      `Nice work with the shells. If you want the real tools — PHANTOM30. Don't share it. Don't ask where I got it.`,
    gameTime: st.sim?.elapsedMs ?? 0
  });
}
