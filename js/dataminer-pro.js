/**
 * dataminer-pro.js — OSINT console (AXIS intel, companies, banking log scrape).
 */
import { applyEffect, resolveRivalId } from './rival-companies.js';
import { getState, patchState } from './gameState.js';
import { ActorDB } from '../engine/ActorDB.js';
import { resolveAgainstDC } from './d20.js';
import { combatCooldownRemaining, combatCooldownSet } from './combat-cooldowns.js';
import { SMS } from './bc-sms.js';
import { versionSafeCombatLog, resolveCombatDc } from './combat-version.js';

export const DM_OPS = {
  compile_dossier: {
    label: 'Compile Dossier',
    icon: '📋',
    description:
      'Full actor profile. Reveals employment, taglets, schedule, relationships. Provides DC bonus to other operations targeting this actor.',
    dc: 9,
    cooldownMs: 8 * 3600000,
    notorietyCost: 4,
    notorietyOnDiscover: 18,
    cost: 0,
    dcBonusGranted: 2
  },
  map_company: {
    label: 'Map Company',
    icon: '🗺',
    description:
      'Ownership graph, shell links, subsidiaries. Unlocks proxy acquire targets and reveals hidden defenses.',
    dc: 11,
    cooldownMs: 18 * 3600000,
    notorietyCost: 6,
    notorietyOnDiscover: 22,
    cost: 0,
    dcBonusGranted: 3
  },
  track_banking: {
    label: 'Track Banking',
    icon: '🏦',
    description:
      'Intercept public transaction patterns. Identifies optimal timing for financial attacks. Buffs MarketForce vs this company.',
    dc: 13,
    cooldownMs: 36 * 3600000,
    notorietyCost: 9,
    notorietyOnDiscover: 28,
    cost: 200,
    dcBonusGranted: 4,
    grantsBonusToPrograms: ['market-force']
  }
};

export function executeDataMiner(opId, targetId) {
  const op = DM_OPS[opId];
  if (!op) return { success: false, reason: 'Unknown operation.' };

  const tid = String(targetId || '').trim();
  if (!tid) return { success: false, reason: 'Enter a target ID or name.' };

  const left = combatCooldownRemaining(`dm:${opId}:${tid}`);
  if (left > 0) {
    return { success: false, reason: `Cooldown (~${Math.ceil(left / 3600000)}h sim).` };
  }

  if (opId === 'compile_dossier' && !ActorDB.getRaw(tid)) {
    return { success: false, reason: 'Actor not found in registry.' };
  }

  const st = getState();
  if (op.cost > 0) {
    const primary = (st.accounts || []).find((a) => a.isPrimary) || st.accounts?.find((a) => a.id === 'fncb');
    if (!primary || Number(primary.balance || 0) < op.cost) {
      return { success: false, reason: `Need $${op.cost} for commercial data brokers.` };
    }
    patchState((s) => {
      const p = (s.accounts || []).find((a) => a.isPrimary) || s.accounts?.find((a) => a.id === 'fncb');
      if (p) p.balance = Math.round((Number(p.balance || 0) - op.cost) * 100) / 100;
      return s;
    });
  }

  const acumen = Number(st.player?.acumen ?? 10);
  const { adj, effectiveDc, intelBonus } = resolveCombatDc('dataminer-pro', op, tid);
  const result = resolveAgainstDC({ dc: effectiveDc, modifier: Math.floor((acumen - 10) / 2) });
  const rollDisplay = { ...result, effectiveDc, intelBonus };

  patchState((s) => {
    s.corporateProfile = s.corporateProfile || {};
    s.corporateProfile.notoriety = Math.min(200, (s.corporateProfile.notoriety || 0) + adj.notorietyCost);
    return s;
  });

  combatCooldownSet(`dm:${opId}:${tid}`, adj.cooldownMs);

  versionSafeCombatLog('INTEL_OP', `DataMiner [${adj.label}] — ${tid}`, { notable: true }, adj);

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
        message: `ALERT: Unauthorized intelligence probe attributed to your operator session — watchlist updated. Operator: ${st.player?.operatorId ?? 'UNKNOWN'}`,
        gameTime: st.sim?.elapsedMs ?? 0
      });
    }
    return {
      success: false,
      discovered,
      exposed: discovered,
      reason: 'Target data not accessible.',
      dice: rollDisplay
    };
  }

  const simNow = st.sim?.elapsedMs || 0;
  const bonusN = op.dcBonusGranted ?? 2;

  patchState((s) => {
    s.dataMinerDossiers = s.dataMinerDossiers || {};
    s.dataMinerDossiers[tid] = {
      dcBonus: bonusN,
      lastUpdated: simNow,
      opType: opId
    };
    if (opId === 'track_banking' && Array.isArray(op.grantsBonusToPrograms)) {
      for (const prog of op.grantsBonusToPrograms) {
        s.dataMinerDossiers[`${prog}:${tid}`] = {
          dcBonus: op.dcBonusGranted || 4,
          lastUpdated: simNow
        };
      }
    }
    return s;
  });

  let payload = {};

  if (opId === 'compile_dossier') {
    const actor = ActorDB.getRaw(tid);

    window.AXIS?.discover?.(tid, { source: 'espionage', note: 'DataMiner dossier pull' });
    window.AXIS?.recordIntel?.(tid, {
      type: 'DataMiner Dossier',
      description: `Compiled profile — ${actor.profession}; taglets: ${(actor.taglets || []).join(', ')}`,
      source: 'dataminer'
    });

    payload = {
      actorId: actor.actor_id,
      name: actor.full_legal_name,
      profession: actor.profession,
      employer: actor.employer_id,
      taglets: actor.taglets || [],
      schedule: actor.work_schedule,
      relationships: (actor.relationships || []).slice(0, 5),
      districtId: actor.districtId,
      intelBonusGranted: bonusN
    };
  } else if (opId === 'map_company') {
    const rid = resolveRivalId(tid);
    if (rid) {
      const intel = applyEffect('intel_gather', rid, {});
      payload = intel?.payload
        ? { company: rid, source: 'rival', rival: true, ...intel.payload, intelBonusGranted: bonusN }
        : { company: tid, source: 'rival', missing: true };
    } else {
      const co = (st.companies || []).find((c) => c.id === tid || c.tradingName === tid);
      payload = {
        company: co?.tradingName || tid,
        isShell: !!co?.isShell,
        industry: co?.industry,
        subsidiaries: (st.companies || []).filter((c) => c.parentId === tid || c.parentCompanyId === tid),
        sentiment: co?.publicSentiment,
        disrupted: co?.supplyDisrupted,
        intelBonusGranted: bonusN
      };
    }
  } else if (opId === 'track_banking') {
    const q = tid.toLowerCase();
    const log = (st.bankingTransactionLog || [])
      .filter((tx) => JSON.stringify(tx || '').toLowerCase().includes(q))
      .slice(-12);
    payload = { transactions: log, count: log.length, intelBonusGranted: bonusN };
  }

  return { success: true, payload, dice: rollDisplay };
}
