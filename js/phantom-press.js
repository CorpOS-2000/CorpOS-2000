/**
 * phantom-press.js — Reputation warfare (Herald, ReviewBomber-linked buzz, news registry).
 */
import { resolveRivalId, applyEffect } from './rival-companies.js';
import { getState, patchState, SIM_DAY_MS } from './gameState.js';
import { resolveAgainstDC } from './d20.js';
import { ActorDB } from '../engine/ActorDB.js';
import { emit } from './events.js';
import { generateSocialComment } from './social-comments.js';
import { recordHashtagEvent } from './market-dynamics.js';
import { combatCooldownRemaining, combatCooldownSet } from './combat-cooldowns.js';
import { SMS } from './bc-sms.js';
import { versionSafeCombatLog, resolveCombatDc } from './combat-version.js';

export const ATTACK_TYPES = {
  fabricate_story: {
    label: 'Fabricate Story',
    icon: '📰',
    description:
      'Plant a false Herald story. High notoriety on exposure. Strongest single reputation hit.',
    dc: 13,
    cooldownMs: 36 * 3600000,
    notorietyCost: 10,
    notorietyOnDiscover: 28,
    cost: 0,
    targetSentimentDamage: 22,
    effectDurationMs: 48 * 3600000,
    defenseTypes: ['pr_firm', 'legal_team']
  },
  review_bomb: {
    label: 'Review Bomb',
    icon: '💣',
    description: 'Coordinate NPC negative reviews. Fast, cheap, lower impact. Stacks well.',
    dc: 9,
    cooldownMs: 18 * 3600000,
    notorietyCost: 5,
    notorietyOnDiscover: 10,
    cost: 0,
    targetSentimentDamage: 8,
    npcBomberCount: [5, 12],
    defenseTypes: ['community_manager']
  },
  suppress_story: {
    label: 'Suppress Coverage',
    icon: '🤐',
    description:
      'Kill a positive Herald story before it publishes. Prevents a sentiment gain rather than causing damage.',
    dc: 15,
    cooldownMs: 48 * 3600000,
    notorietyCost: 7,
    notorietyOnDiscover: 18,
    cost: 400,
    targetSentimentDamage: 0,
    defenseTypes: ['media_relations']
  },
  smear_campaign: {
    label: 'Smear Campaign',
    icon: '📢',
    description:
      'Sustained 3-day NPC posting campaign. Highest total damage but slowest. Hard to stop once running.',
    dc: 11,
    cooldownMs: 72 * 3600000,
    notorietyCost: 12,
    notorietyOnDiscover: 22,
    cost: 200,
    targetSentimentDamage: 4,
    durationDays: 3,
    defenseTypes: ['pr_firm', 'community_manager']
  }
};

function cdKey(attackId, targetId) {
  return `phantom:${attackId}:${targetId}`;
}

/** @returns {object} result bundle for combat UI */
export function executePhantomPress(attackId, targetId, targetType) {
  const attack = ATTACK_TYPES[attackId];
  if (!attack) return { success: false, reason: 'Unknown attack type.' };

  const tid = String(targetId || '').trim();
  if (!tid) return { success: false, reason: 'Enter a target ID or company name.' };

  const left = combatCooldownRemaining(cdKey(attackId, tid));
  if (left > 0) {
    const h = Math.ceil(left / 3600000);
    return { success: false, reason: `On cooldown (~${h}h sim time remaining).` };
  }

  const st = getState();
  const acumen = Number(st.player?.acumen ?? 10);
  const modifier = Math.floor((acumen - 10) / 2);

  if (attack.cost > 0) {
    const primary = (st.accounts || []).find((a) => a.isPrimary) || st.accounts?.find((a) => a.id === 'fncb');
    if (!primary || primary.balance < attack.cost) {
      return { success: false, reason: `Need $${attack.cost} in primary checking.` };
    }
    patchState((s) => {
      const p = (s.accounts || []).find((a) => a.isPrimary) || s.accounts?.find((a) => a.id === 'fncb');
      if (p) p.balance = Math.round((Number(p.balance || 0) - attack.cost) * 100) / 100;
      return s;
    });
  }

  const { adj, effectiveDc, intelBonus } = resolveCombatDc('phantom-press', attack, tid);
  const result = resolveAgainstDC({ dc: effectiveDc, modifier });
  const rollDisplay = { ...result, effectiveDc, intelBonus };

  patchState((s) => {
    s.corporateProfile = s.corporateProfile || {};
    s.corporateProfile.notoriety = Math.min(200, (s.corporateProfile.notoriety || 0) + adj.notorietyCost);
    return s;
  });

  combatCooldownSet(cdKey(attackId, tid), adj.cooldownMs);

  versionSafeCombatLog(
    'PHANTOM_OP',
    `Reputation operation [${adj.label}] vs ${tid}`,
    { suspicious: true },
    adj
  );

  if (!result.success) {
    let discovered = false;
    if (Math.random() < adj.discoveryChance) {
      discovered = true;
      patchState((s) => {
        s.corporateProfile = s.corporateProfile || {};
        s.corporateProfile.notoriety = Math.min(
          200,
          (s.corporateProfile.notoriety || 0) + adj.notorietyOnDiscover
        );
        return s;
      });
      SMS.send({
        from: 'COMPLIANCE_MONITOR',
        message: `ALERT: Irregular media activity originating from your operator account has been detected. Case file updated. Operator: ${st.player?.operatorId ?? 'UNKNOWN'}`,
        gameTime: st.sim?.elapsedMs ?? 0
      });
    }
    return {
      success: false,
      discovered,
      reason: 'Operation failed — target defenses held.',
      dice: rollDisplay,
      exposed: discovered
    };
  }

  applyPhantomEffect(attackId, tid, targetType || 'company', result, attack);
  return { success: true, dice: rollDisplay };
}

function applyPhantomEffect(attackId, targetId, targetType, diceResult, baseAttack) {
  const st = getState();
  const simMs = st.sim?.elapsedMs || 0;
  const hour = new Date(simMs).getUTCHours();
  const dow = new Date(simMs).getUTCDay();
  const actors = ActorDB.getActiveNow(hour, dow, null);
  const dmg = Number(baseAttack?.targetSentimentDamage) || 20;

  switch (attackId) {
    case 'fabricate_story': {
      const headline =
        targetType === 'actor'
          ? `LOCAL: ${targetId} at center of workplace misconduct investigation`
          : `EXCLUSIVE: ${targetId} faces regulatory inquiry over unreported liabilities`;

      patchState((s) => {
        s.newsRegistry = s.newsRegistry || [];
        s.newsRegistry.push({
          id: `phantom_${Date.now()}`,
          simMs,
          headline,
          summary: `${headline} — developing story.`,
          category: 'business',
          severity: 3,
          districtId: null,
          namedActors: targetType === 'actor' ? [targetId] : [],
          tags: [String(targetId).toLowerCase(), 'investigation'],
          channels: ['herald', 'rtc'],
          reachRadius: 'city',
          decaySimMs: (baseAttack?.effectDurationMs || 48 * 3600000) * 2,
          reactions: { sympathy: 0, outrage: 0, indifferent: 0 },
          comments: [],
          fabricated: true
        });
        return s;
      });

      if (targetType === 'company') {
        const rid = resolveRivalId(targetId);
        if (rid) {
          applyEffect('reputation_damage', rid, { amount: dmg, severity: 3, silent: true });
        } else {
          patchState((s) => {
            const co = (s.companies || []).find((c) => c.id === targetId || c.tradingName === targetId);
            if (co) co.publicSentiment = Math.max(0, (co.publicSentiment ?? 50) - dmg);
            return s;
          });
        }
      } else if (window.AXIS?.updateScore) {
        window.AXIS.updateScore(targetId, -15, 'Fabricated Herald story — public perception damaged');
      }

      emit('news:breaking', { headline, severity: 3 });
      break;
    }

    case 'review_bomb': {
      const r = baseAttack?.npcBomberCount;
      const minB = Array.isArray(r) ? r[0] : 5;
      const maxB = Array.isArray(r) ? r[1] : 12;
      const count = minB + Math.floor(Math.random() * (maxB - minB + 1));
      const bombers = actors
        .filter((a) => (a.taglets || []).some((t) => ['vocal', 'contrarian', 'community_hub'].includes(t)))
        .slice(0, count);

      for (const actor of bombers) {
        const gen = generateSocialComment({
          seed: (Date.now() + (actor.actor_id || '').charCodeAt(0)) >>> 0,
          flavor: 'generic',
          context: 'generic',
          actor_id: actor.actor_id,
          personality: 'skeptic'
        });
        recordHashtagEvent(targetId, 'dislike');
        patchState((s) => {
          s.phantomReviewRipple = s.phantomReviewRipple || [];
          s.phantomReviewRipple.push({
            targetId,
            actorId: actor.actor_id,
            text: gen.text,
            simMs
          });
          if (s.phantomReviewRipple.length > 200) s.phantomReviewRipple.shift();
          return s;
        });
      }
      recordHashtagEvent(targetId, 'mention');
      break;
    }

    case 'suppress_story': {
      patchState((s) => {
        const nr = s.newsRegistry || [];
        const idx = nr.findIndex(
          (n) =>
            !n.fabricated &&
            (Number(n.reactions?.sympathy ?? 0) >= Number(n.reactions?.outrage ?? 0)) &&
            ((n.namedActors || []).includes(targetId) ||
              (n.tags || []).some((t) => String(t).toLowerCase().includes(String(targetId).toLowerCase())))
        );
        if (idx >= 0) nr.splice(idx, 1);
        return s;
      });
      break;
    }

    case 'smear_campaign': {
      const days = Math.max(1, Number(baseAttack?.durationDays) || 3);
      patchState((s) => {
        s.activeTasks = s.activeTasks || [];
        s.activeTasks.push({
          id: `smear_${targetId}_${Date.now()}`,
          type: 'smear_campaign',
          label: `Smear campaign — ${targetId}`,
          icon: '📢',
          targetId,
          targetType,
          startSimMs: simMs,
          dueSimMs: simMs + days * SIM_DAY_MS,
          durationMs: days * SIM_DAY_MS,
          status: 'in_progress',
          postsPerDay: 3 + Math.floor(Math.random() * 5),
          damagePerDay: Math.max(1, dmg + Math.floor(Math.abs(diceResult.passMargin || 0) / 4))
        });
        return s;
      });
      break;
    }
    default:
      break;
  }
}

/** Once per in-game day — gradual reputation drain until the campaign expires. */
export function tickPhantomSmearCampaignsDaily() {
  const st = getState();
  const now = st.sim?.elapsedMs ?? 0;
  patchState((s) => {
    if (!Array.isArray(s.activeTasks)) return s;
    const next = [];
    for (const t of s.activeTasks) {
      if (t.type !== 'smear_campaign') {
        next.push(t);
        continue;
      }
      if (t.status !== 'in_progress') {
        next.push(t);
        continue;
      }
      if ((t.dueSimMs || 0) <= now) {
        next.push({ ...t, status: 'completed', completedSimMs: now });
        continue;
      }
      const d = Number(t.damagePerDay) || 2;
      if (t.targetType === 'actor' && window.AXIS?.updateScore) {
        window.AXIS.updateScore(t.targetId, -d, 'Smear campaign — sustained negative coverage');
      } else {
        const rid = resolveRivalId(String(t.targetId));
        if (rid) {
          const c = (s.rivalCompanies || []).find((r) => r.id === rid);
          if (c) c.publicSentiment = Math.max(0, (c.publicSentiment || 50) - d);
        } else {
          const co = (s.companies || []).find((c) => c.id === t.targetId || c.tradingName === t.targetId);
          if (co) co.publicSentiment = Math.max(0, (co.publicSentiment ?? 50) - d);
        }
      }
      next.push(t);
    }
    s.activeTasks = next;
    return s;
  });
}
