/**
 * EventSystem.js — World event scheduler and dispatcher.
 * Listens on the clock bus. Reads ActorDB and content pipeline.
 * Resolves outcomes through D20. Writes consequences to GameState.
 * Player never sees dice — only business outcomes.
 */

import { on } from '../js/events.js';
import { resolveAgainstDC } from '../js/d20.js';
import { getState, patchState, setWebsiteContract } from '../js/gameState.js';
import { getSessionState } from '../js/sessionState.js';
import { ActorDB } from './ActorDB.js';
import { SMS } from '../js/bc-sms.js';
import { PeekManager } from '../js/peek-manager.js';
import { ToastManager } from '../js/toast.js';
import { FederalAuditSequence } from '../js/federal-audit-sequence.js';
import { recordHashtagEvent } from '../js/market-dynamics.js';

const SIM_DAY_MS = 86400000;
const SIM_HOUR_MS = 3600000;

/** Minimum cooldown between repeat fires of non-oneShot triggered events. */
const TRIGGERED_COOLDOWN_MS = 24 * SIM_HOUR_MS;

export const EventSystem = {

  _queue: [],
  _registry: [],
  _firedIds: new Set(),
  _initialized: false,

  // ── INIT ────────────────────────────────────────────────────────────
  init() {
    if (this._initialized) return;
    this._initialized = true;

    const completed = getState().completedEvents || [];
    completed.forEach(id => this._firedIds.add(id));

    if (this._firedIds.has('evt_website_first_publish_bonus') && !this._firedIds.has('evt_website_first_publish')) {
      this._firedIds.add('evt_website_first_publish');
      patchState((st) => {
        const c = st.completedEvents || [];
        st.completedEvents = [
          ...new Set(
            c.map((id) => (id === 'evt_website_first_publish_bonus' ? 'evt_website_first_publish' : id))
          )
        ];
        return st;
      });
    }

    on('hour',       (payload) => this._onHour(payload));
    on('dayChanged', (payload) => this._onDay(payload));

    console.log('[EventSystem] Initialized.');
  },

  // ── LOAD EVENT DEFINITIONS ────────────────────────────────────────
  loadDefinitions(defs) {
    if (!Array.isArray(defs)) return;
    this._registry = defs;
    this._scheduleUpcoming();
    console.log(`[EventSystem] Loaded ${defs.length} event definitions.`);
  },

  // ── SCHEDULE UPCOMING EVENTS ──────────────────────────────────────
  _scheduleUpcoming() {
    const simMs = getState().sim?.elapsedMs || 0;

    for (const def of this._registry) {
      if (def.oneShot && this._firedIds.has(def.id)) continue;
      if (def.condition && !this._checkCondition(def.condition)) continue;

      const fireAt = this._computeFireTime(def, simMs);
      if (fireAt === null) continue;

      if (this._queue.some(q => q.eventDef.id === def.id)) continue;

      this._queue.push({ firesAtSimMs: fireAt, eventDef: def, contextData: {} });
    }

    this._queue.sort((a, b) => a.firesAtSimMs - b.firesAtSimMs);
  },

  _computeFireTime(def, simMs) {
    if (def.type === 'scheduled') {
      const fireDay = Number(def.fireOnDay || 0);
      const fireHour = Number(def.fireOnHour || 9);
      return fireDay * SIM_DAY_MS + fireHour * SIM_HOUR_MS;
    }
    if (def.type === 'interval') {
      const intervalMs = Number(def.intervalHours || 24) * SIM_HOUR_MS;
      const lastFiredMs = this._getIntervalLastFired(def.id);
      return lastFiredMs + intervalMs;
    }
    // Triggered events have no pre-scheduled fire time
    return null;
  },

  _getIntervalLastFired(eventId) {
    return getState().eventSystem?.intervalLastFired?.[eventId] || 0;
  },

  _setIntervalLastFired(eventId, simMs) {
    patchState(st => {
      if (!st.eventSystem) st.eventSystem = { intervalLastFired: {} };
      if (!st.eventSystem.intervalLastFired) st.eventSystem.intervalLastFired = {};
      st.eventSystem.intervalLastFired[eventId] = simMs;
      return st;
    });
  },

  // ── HOUR TICK ─────────────────────────────────────────────────────
  _onHour(_payload) {
    const simMs = getState().sim?.elapsedMs || 0;

    const due = this._queue.filter(q => q.firesAtSimMs <= simMs);
    this._queue = this._queue.filter(q => q.firesAtSimMs > simMs);

    for (const item of due) {
      this._fireEvent(item.eventDef, item.contextData, simMs);
    }

    // Evaluate triggered events
    for (const def of this._registry) {
      if (def.type !== 'triggered') continue;
      if (def.oneShot && this._firedIds.has(def.id)) continue;
      if (def.condition && !this._checkCondition(def.condition)) continue;

      // Cooldown: don't spam non-oneShot triggered events
      if (!def.oneShot) {
        const lastFired = this._getIntervalLastFired(def.id);
        if (lastFired && simMs - lastFired < TRIGGERED_COOLDOWN_MS) continue;
      }

      this._fireEvent(def, {}, simMs);
    }

    this._scheduleUpcoming();
  },

  // ── DAY TICK ──────────────────────────────────────────────────────
  _onDay({ gameDate }) {
    const simMs = getState().sim?.elapsedMs || 0;

    this._applyDailyExpenses(simMs);
    this._tickActorWorld(simMs, gameDate);
    this._tickWebsiteWorld(simMs);
  },

  // ── FIRE AN EVENT ─────────────────────────────────────────────────
  _fireEvent(def, _contextData, simMs) {
    let resolution = { success: true, passMargin: 10 };
    if (typeof def.dc === 'number' && def.dc > 0) {
      const modifier = this._computeModifier(def);
      resolution = resolveAgainstDC({ dc: def.dc, modifier });
    }

    const outcome = resolution.success
      ? (def.outcomes?.pass || def.outcomes?.default || null)
      : (def.outcomes?.fail || null);

    if (!outcome) return;

    this._applyOutcome(outcome, def, resolution, simMs);

    if (def.oneShot) {
      this._firedIds.add(def.id);
      patchState(st => {
        if (!st.completedEvents) st.completedEvents = [];
        if (!st.completedEvents.includes(def.id)) st.completedEvents.push(def.id);
        return st;
      });
    }

    if (def.type === 'interval') {
      this._setIntervalLastFired(def.id, simMs);
    }

    // Track cooldown for non-oneShot triggered events
    if (def.type === 'triggered' && !def.oneShot) {
      this._setIntervalLastFired(def.id, simMs);
    }

    console.log(`[EventSystem] Fired: ${def.id} — ${resolution.success ? 'PASS' : 'FAIL'} (margin ${resolution.passMargin})`);
  },

  // ── APPLY OUTCOME ─────────────────────────────────────────────────
  _applyOutcome(outcome, def, resolution, simMs) {
    if (outcome.sms) {
      const sender = outcome.sms.from || 'CORPOS_SYSTEM';
      const msg = this._interpolate(outcome.sms.message, def, resolution);
      SMS.send({ from: sender, message: msg, gameTime: simMs });
    }

    if (outcome.peek) {
      PeekManager.show({
        sender:   this._interpolate(outcome.peek.sender || def.title || 'Event', def, resolution),
        preview:  this._interpolate(outcome.peek.message || '', def, resolution),
        type:     outcome.peek.type || 'toast_only',
        targetId: outcome.peek.targetId || null,
        icon:     outcome.peek.icon || '◆',
      });
    }

    if (outcome.toast) {
      ToastManager.fire({
        key:     def.id,
        title:   this._interpolate(outcome.toast.title || def.title || '', def, resolution),
        message: this._interpolate(outcome.toast.message || '', def, resolution),
        icon:    outcome.toast.icon || '◆',
      });
    }

    if (outcome.notorietyDelta != null) {
      patchState(st => {
        if (!st.corporateProfile) st.corporateProfile = { notoriety: 0, reputation: 0 };
        st.corporateProfile.notoriety = Math.min(200, Math.max(0,
          (st.corporateProfile.notoriety || 0) + Number(outcome.notorietyDelta)
        ));
        return st;
      });
    }

    if (outcome.axisUpdate) {
      const { actorId, delta, reason } = outcome.axisUpdate;
      window.AXIS?.updateScore?.(actorId, delta, reason);
    }

    if (outcome.financeDelta != null) {
      patchState(st => {
        const primary = (st.accounts || []).find(a => a.id === 'fncb');
        if (primary) primary.balance = Math.max(0, primary.balance + Number(outcome.financeDelta));
        return st;
      });
    }

    if (outcome.setFlag) {
      patchState(st => {
        if (!st.flags) st.flags = {};
        st.flags[outcome.setFlag] = true;
        return st;
      });
    }

    if (outcome.triggerAudit) {
      FederalAuditSequence.trigger(outcome.triggerAudit);
    }

    if (outcome.scheduleFollowUp) {
      const { eventId, delayHours } = outcome.scheduleFollowUp;
      const followDef = this._registry.find(d => d.id === eventId);
      if (followDef) {
        const fireAt = (getState().sim?.elapsedMs || 0) + delayHours * SIM_HOUR_MS;
        this._queue.push({ firesAtSimMs: fireAt, eventDef: followDef, contextData: {} });
        this._queue.sort((a, b) => a.firesAtSimMs - b.firesAtSimMs);
      }
    }

    if (outcome.createWebsiteContract) {
      const c = outcome.createWebsiteContract;
      const st0 = getState();
      if (st0.websiteContract?.active || st0.activeTasks?.some((t) => t.id === c.contractId)) {
        return;
      }
      const simMsNow = st0.sim?.elapsedMs || 0;
      const deadlineSimMs = simMsNow + (c.deadlineHours || 168) * SIM_HOUR_MS;

      setWebsiteContract({
        contractId: c.contractId,
        companyId: c.companyId,
        companyName: c.companyName,
        requirements: c.requirements,
        reward: c.reward,
        breachFee: c.breachFee || 0,
        startSimMs: simMsNow,
        deadlineSimMs,
      });

      patchState((st) => {
        st.activeTasks = st.activeTasks || [];
        st.activeTasks.push({
          id: c.contractId,
          type: 'website_contract',
          label: `Build website — ${c.companyName}`,
          icon: '🌐',
          companyName: c.companyName,
          reward: c.reward,
          breachFee: c.breachFee || 0,
          startSimMs: simMsNow,
          dueSimMs: deadlineSimMs,
          durationMs: (c.deadlineHours || 168) * SIM_HOUR_MS,
          status: 'in_progress',
          requirements: c.requirements,
        });
        return st;
      });

      ToastManager.fire({
        key: c.contractId,
        title: 'Website Contract',
        message: `New contract from ${c.companyName}. Build and deliver a website. Reward: $${Number(c.reward || 0).toLocaleString()}. Open WebEx Publisher to start.`,
        icon: '🌐',
      });
    }
  },

  // ── CONDITION CHECK ───────────────────────────────────────────────
  _checkCondition(condition) {
    const st = getState();
    switch (condition.type) {
      case 'flag_set':
        return !!st.flags?.[condition.flag];
      case 'flag_not_set':
        return !st.flags?.[condition.flag];
      case 'notoriety_above':
        return (st.corporateProfile?.notoriety || 0) >= Number(condition.value);
      case 'notoriety_below':
        return (st.corporateProfile?.notoriety || 0) < Number(condition.value);
      case 'bank_balance_above':
        return this._totalBankBalance(st) >= Number(condition.value);
      case 'bank_balance_below':
        return this._totalBankBalance(st) < Number(condition.value);
      case 'company_registered':
        return (st.companies || []).length > 0;
      case 'day_after':
        return (st.sim?.elapsedMs || 0) >= Number(condition.days) * SIM_DAY_MS;
      case 'has_jeemail':
        return Object.keys(getSessionState().jeemail?.accounts || {}).length > 0;
      case 'website_published':
        return (st.contentRegistry?.pages || []).some(p => p.webExProjectId);
      default:
        return true;
    }
  },

  // ── MODIFIER COMPUTATION ──────────────────────────────────────────
  _computeModifier(def) {
    const st = getState();
    let mod = 0;
    if (def.modifiers?.notoriety) {
      const n = st.corporateProfile?.notoriety || 0;
      mod += Math.floor(n / 50) * Number(def.modifiers.notoriety);
    }
    if (def.modifiers?.balance) {
      const b = this._totalBankBalance(st);
      mod += b > 50000 ? 2 : b > 10000 ? 1 : -1;
    }
    if (def.modifiers?.reputation) {
      mod += Math.floor((st.corporateProfile?.reputation || 0) / 20);
    }
    return mod;
  },

  // ── ECONOMY TICK ──────────────────────────────────────────────────
  _applyDailyExpenses(simMs) {
    const DAILY_EXPENSE = 68.57;
    patchState(st => {
      const primary = (st.accounts || []).find(a => a.id === 'fncb');
      if (primary && primary.balance >= DAILY_EXPENSE) {
        primary.balance = Math.round((primary.balance - DAILY_EXPENSE) * 100) / 100;
      } else if (primary) {
        if (!st.corporateProfile) st.corporateProfile = { notoriety: 0, reputation: 0 };
        st.corporateProfile.notoriety = Math.min(200, (st.corporateProfile.notoriety || 0) + 2);
        SMS.send({
          from: 'FRA',
          message: `NOTICE: Your account balance is insufficient to cover mandatory operating expenses. Continued non-payment may result in compliance review. Operator: ${st.player?.operatorId || 'UNKNOWN'}`,
          gameTime: simMs,
        });
      }
      return st;
    });
  },

  // ── ACTOR WORLD TICK (daily) ───────────────────────────────────────
  _tickActorWorld(simMs, gameDate) {
    let actors;
    try {
      actors = ActorDB.getAllRaw().filter(a => a.active !== false && a.role !== 'player');
    } catch { return; }
    const hour = gameDate?.getUTCHours?.() ?? 9;

    for (const actor of actors) {
      const peaks = actor.activity_schedule?.peak_hours || [];
      if (!peaks.length) continue;

      const nearPeak = peaks.some(h => Math.abs(h - hour) <= 2);
      if (!nearPeak) continue;

      if (Math.random() > 0.15) continue;

      this._processActorDailyAction(actor, simMs);
    }
  },

  _processActorDailyAction(actor, simMs) {
    const platforms = actor.activity_schedule?.platforms || [];
    if (!platforms.length) return;

    if (actor.role === 'contact' && Math.random() < 0.08) {
      const playerKnows = (getState().player?.blackCherryContacts || [])
        .some(c => c.actorId === actor.actor_id);
      if (playerKnows) {
        this._generateActorInitiatedContact(actor, simMs);
      }
    }

    if (actor.role === 'investigator') {
      this._tickInvestigator(actor, simMs);
    }
  },

  _generateActorInitiatedContact(actor, simMs) {
    const taglets = actor.taglets || [];

    let message;
    if (taglets.includes('vocal') || taglets.includes('information_broker')) {
      message = 'Hey — got something you might want to know about. Call me when you get a chance.';
    } else if (taglets.includes('transactional')) {
      message = 'I have a potential business opportunity. Are you available to discuss?';
    } else if (taglets.includes('cautious')) {
      message = 'Checking in. Let me know if you need anything.';
    } else {
      const pool = [
        "How's business going? Haven't heard from you in a while.",
        'Saw something interesting today — thought of you.',
        'Give me a call when you get a moment.',
        "Hope everything's going well on your end.",
      ];
      message = pool[Math.floor(Math.random() * pool.length)];
    }

    SMS.receive(actor.actor_id, message, simMs);
  },

  _tickInvestigator(actor, simMs) {
    const st = getState();
    const notoriety = st.corporateProfile?.notoriety || 0;
    const tier = actor.investigator_tier || 1;

    const threshold = tier === 3 ? 100 : tier === 2 ? 75 : 50;
    if (notoriety < threshold) return;

    const result = resolveAgainstDC({ dc: 14, modifier: Math.floor(notoriety / 25) });
    if (!result.success) return;

    // Use existing government sender keys so avatars resolve
    const senderKey = tier >= 3 ? 'FBCE' : 'COMPLIANCE_MONITOR';
    const messages = [
      'This is a formal notice. Your operator activity has been flagged for review. Cooperation is expected.',
      'Compliance review is ongoing. Additional documentation may be requested. Do not destroy records.',
      'Your account activity has triggered automatic review under Mandate 2000-CR7. Stand by for further communication.',
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    SMS.send({ from: senderKey, message: msg, gameTime: simMs });
  },

  // ── WEBSITE WORLD TICK (daily) ─────────────────────────────────────
  _tickWebsiteWorld(simMs) {
    const st = getState();
    const playerPages = (st.contentRegistry?.pages || []).filter(p => p.webExProjectId);
    if (!playerPages.length) return;

    let actors;
    try {
      actors = ActorDB.getAllRaw().filter(a => a.active !== false);
    } catch { return; }

    for (const page of playerPages) {
      const visitors = actors.filter(() => Math.random() < 0.03);
      if (!visitors.length) continue;

      for (let i = 0; i < visitors.length; i++) {
        const slug = String(page.pageId || page.title || 'site').toLowerCase().replace(/[^a-z0-9_]/g, '_');
        recordHashtagEvent(slug, 'mention');
      }

      const totalVisits = st.marketBuzz?.[String(page.pageId || '').toLowerCase().replace(/[^a-z0-9_]/g, '_')]?.mentions || 0;
      const milestones = [10, 50, 100, 500, 1000];
      for (const m of milestones) {
        const flagKey = `site_traffic_milestone_${page.pageId}_${m}`;
        if (totalVisits >= m && !st.flags?.[flagKey]) {
          patchState(s => {
            if (!s.flags) s.flags = {};
            s.flags[flagKey] = true;
            return s;
          });
          ToastManager.fire({
            key: flagKey,
            title: 'Website Traffic',
            message: `${page.title || page.pageId} reached ${m} visitors`,
            icon: '🌐',
          });
        }
      }
    }
  },

  // ── HELPERS ───────────────────────────────────────────────────────
  _totalBankBalance(st) {
    return (st.accounts || []).reduce((s, a) => s + Math.max(0, Number(a.balance) || 0), 0);
  },

  _interpolate(str, def, resolution) {
    if (!str) return '';
    const st = getState();
    return str
      .replace(/\{operatorId\}/g, st.player?.operatorId || 'UNKNOWN')
      .replace(/\{playerName\}/g, st.player?.displayName || 'Operator')
      .replace(/\{passMargin\}/g, String(resolution?.passMargin || 0))
      .replace(/\{eventTitle\}/g, def?.title || '');
  },

  // ── PUBLIC API ────────────────────────────────────────────────────
  getQueue()    { return [...this._queue]; },
  getRegistry() { return [...this._registry]; },
  hasFired(id)  { return this._firedIds.has(id); },
  forceEvent(id) {
    const def = this._registry.find(d => d.id === id);
    if (def) {
      this._fireEvent(def, {}, getState().sim?.elapsedMs || 0);
    } else {
      console.warn(`[EventSystem] forceEvent: ID not found in registry — ${id}`);
    }
  },
};
