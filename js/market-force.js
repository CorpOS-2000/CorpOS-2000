/**
 * market-force.js — Financial warfare (marketBuzz shortages, price squeeze, company supply).
 */
import { applyEffect, resolveRivalId } from './rival-companies.js';
import { getState, patchState } from './gameState.js';
import { resolveAgainstDC } from './d20.js';
import { pickExcuse } from './market-dynamics.js';
import { emit } from './events.js';
import { combatCooldownRemaining, combatCooldownSet } from './combat-cooldowns.js';
import { versionSafeCombatLog, resolveCombatDc } from './combat-version.js';
import { SMS } from './bc-sms.js';

export const MF_ATTACKS = {
  create_shortage: {
    label: 'Engineer Shortage',
    icon: '📦',
    description:
      'Force artificial shortage. Affects all vendors including rivals. Best when market is already tight.',
    dc: 11,
    cooldownMs: 60 * 3600000,
    notorietyCost: 7,
    notorietyOnDiscover: 22,
    cost: 1200,
    shortageMultiplier: 1.35,
    durationDays: [2, 5]
  },
  price_squeeze: {
    label: 'Price Squeeze',
    icon: '💰',
    description:
      'Coordinate bulk buying pressure. Spikes prices, hurts budget competitors. Pure financial warfare.',
    dc: 13,
    cooldownMs: 36 * 3600000,
    notorietyCost: 5,
    notorietyOnDiscover: 18,
    cost: 1500,
    priceMultiplier: 1.35,
    durationDays: 2
  },
  supply_attack: {
    label: 'Supply Disruption',
    icon: '⛔',
    description:
      "Damage a company's supply chain. Costs them revenue and public trust for 48 hours.",
    dc: 14,
    cooldownMs: 72 * 3600000,
    notorietyCost: 11,
    notorietyOnDiscover: 28,
    cost: 2000,
    durationMs: 48 * 3600000,
    sentimentDamage: 12
  }
};

function normalizeTag(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
}

function cdKey(attackId, slot) {
  return `mf:${attackId}:${slot}`;
}

export function executeMarketForce(attackId, targetTag, targetCompanyId) {
  const attack = MF_ATTACKS[attackId];
  if (!attack) return { success: false, reason: 'Unknown attack.' };

  const slot =
    attackId === 'supply_attack'
      ? String(targetCompanyId || '').trim()
      : normalizeTag(targetTag || targetCompanyId || '');
  if (!slot) {
    return {
      success: false,
      reason:
        attackId === 'supply_attack'
          ? 'Enter a competitor company ID or trading name.'
          : 'Enter a product tag (e.g. laptop, coffee).'
    };
  }

  const left = combatCooldownRemaining(cdKey(attackId, slot));
  if (left > 0) {
    return { success: false, reason: `Cooldown (~${Math.ceil(left / 3600000)}h sim time left).` };
  }

  const st = getState();
  const primary = (st.accounts || []).find((a) => a.isPrimary) || st.accounts?.find((a) => a.id === 'fncb');
  if (!primary || Number(primary.balance || 0) < attack.cost) {
    return { success: false, reason: `Insufficient funds — need $${attack.cost.toLocaleString()}` };
  }

  patchState((s) => {
    const p = (s.accounts || []).find((a) => a.isPrimary) || s.accounts?.find((a) => a.id === 'fncb');
    if (p) p.balance = Math.round((Number(p.balance || 0) - attack.cost) * 100) / 100;
    return s;
  });

  const acumen = Number(st.player?.acumen ?? 10);
  const modifier = Math.floor((acumen - 10) / 2);
  const { adj, effectiveDc, intelBonus } = resolveCombatDc('market-force', attack, slot);
  const result = resolveAgainstDC({ dc: effectiveDc, modifier });
  const rollDisplay = { ...result, effectiveDc, intelBonus };

  patchState((s) => {
    s.corporateProfile = s.corporateProfile || {};
    s.corporateProfile.notoriety = Math.min(200, (s.corporateProfile.notoriety || 0) + adj.notorietyCost);
    return s;
  });

  combatCooldownSet(cdKey(attackId, slot), adj.cooldownMs);

  versionSafeCombatLog(
    'MARKET_OP',
    `Market operation [${adj.label}] ${attackId !== 'supply_attack' ? '#' + slot : slot}`,
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
          (s.corporateProfile.notoriety || 0) + (adj.notorietyOnDiscover || 0)
        );
        return s;
      });
      SMS.send({
        from: 'COMPLIANCE_MONITOR',
        message: `ALERT: Suspicious market intervention tied to your operator network — surveillance note added. Operator: ${st.player?.operatorId ?? 'UNKNOWN'}`,
        gameTime: st.sim?.elapsedMs ?? 0
      });
    }
    return {
      success: false,
      discovered,
      exposed: discovered,
      reason: 'Market forces resisted.',
      dice: rollDisplay
    };
  }

  const simMs = getState().sim?.elapsedMs || 0;
  const baseMult = attack.shortageMultiplier || 1.35;
  const priceMult = attack.priceMultiplier || 1.35;

  switch (attackId) {
    case 'create_shortage': {
      const dr = attack.durationDays;
      const d0 = Array.isArray(dr) ? dr[0] : 2;
      const d1 = Array.isArray(dr) ? dr[1] : 5;
      const days = d0 + Math.floor(Math.random() * (d1 - d0 + 1));
      patchState((s) => {
        ensureBuzz(s, slot);
        s.marketBuzz[slot].shortage = {
          active: true,
          excuse: pickExcuse(Date.now()),
          startSimMs: simMs,
          durationDays: days,
          priceSpike: baseMult
        };
        return s;
      });
      emit('news:breaking', {
        headline: `MARKETS: ${slot} shortage reported across Hargrove`,
        severity: 2
      });
      break;
    }

    case 'price_squeeze': {
      patchState((s) => {
        ensureBuzz(s, slot);
        const mult = priceMult + Math.max(0, result.passMargin || 0) * 0.01;
        s.marketBuzz[slot].priceSqueezeMultiplier = Math.min(2.2, mult);
        const d = Number(attack.durationDays) || 2;
        s.marketBuzz[slot].priceSqueezeUntilSimMs = simMs + d * 86400000;
        return s;
      });
      break;
    }

    case 'supply_attack': {
      const dur = attack.durationMs || 48 * 3600000;
      const sentD = Number(attack.sentimentDamage) || 12;
      const rid = resolveRivalId(slot);
      if (rid) {
        applyEffect('supply_disruption', rid, { durationMs: dur, sentimentDamage: sentD });
      } else {
        patchState((s) => {
          const co = (s.companies || []).find(
            (c) => c.id === slot || c.tradingName === slot || c.legalName === slot
          );
          if (co) {
            co.supplyDisrupted = true;
            co.supplyDisruptedUntil = simMs + dur;
            co.publicSentiment = Math.max(0, (co.publicSentiment ?? 50) - sentD);
          }
          return s;
        });
      }
      break;
    }
    default:
      break;
  }

  return { success: true, dice: rollDisplay };
}

function ensureBuzz(s, key) {
  if (!s.marketBuzz) s.marketBuzz = {};
  if (!s.marketBuzz[key]) {
    s.marketBuzz[key] = {
      mentions: 0,
      likes: 0,
      dislikes: 0,
      purchaseCountWindow: 0,
      lastPurchaseSimMs: 0
    };
  }
}
