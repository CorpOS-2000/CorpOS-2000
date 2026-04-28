/**
 * Process delayed combat effects (Compliance Cannon, etc.) when sim time reaches dueSimMs.
 */
import { getState, patchState } from './gameState.js';
import { resolveRivalId, applyEffect } from './rival-companies.js';

export function processPendingCombatEffects() {
  const st = getState();
  const now = st.sim?.elapsedMs || 0;
  const list = st.pendingCombatEffects || [];
  if (!list.length) return;
  const keep = [];
  for (const e of list) {
    if (!e || (e.dueSimMs || 0) > now) {
      keep.push(e);
      continue;
    }
    if (e.kind === 'compliance_cannon') {
      const tid = String(e.targetId || '').trim();
      const rid = resolveRivalId(tid);
      if (rid) {
        applyEffect('compliance_flag', rid, {
          flags: e.flags,
          sentimentDamage: e.sentimentDamage,
          underInvestigation: e.triggersInvestigation
        });
      } else {
        patchState((s) => {
          const co = (s.companies || []).find((c) => c.id === tid || c.tradingName === tid);
          if (co) {
            const flags = Number(e.flags) || 1;
            co.complianceFlags = (co.complianceFlags || 0) + flags;
            co.publicSentiment = Math.max(0, (co.publicSentiment ?? 50) - (Number(e.sentimentDamage) || 12));
            if (e.triggersInvestigation) co.underInvestigation = true;
          }
          return s;
        });
      }
    } else {
      keep.push(e);
    }
  }
  if (keep.length !== list.length) {
    patchState((s) => {
      s.pendingCombatEffects = keep;
      return s;
    });
  }
}
