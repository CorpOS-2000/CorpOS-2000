/**
 * EventSystem.js — World event scheduler and dispatcher.
 * Listens on the clock bus. Reads ActorDB and content pipeline.
 * Resolves outcomes through D20. Writes consequences to GameState.
 * Player never sees dice — only business outcomes.
 */

import { emit, on } from '../js/events.js';
import { resolveAgainstDC } from '../js/d20.js';
import {
  getState,
  getGameEpochMs,
  patchState,
  setWebsiteContract,
  siteIntegrationLog,
  siteGuestbookAppend
} from '../js/gameState.js';
import { getSessionState } from '../js/sessionState.js';
import { ActorDB } from './ActorDB.js';
import { SMS } from '../js/bc-sms.js';
import { PeekManager } from '../js/peek-manager.js';
import { ToastManager } from '../js/toast.js';
import { FederalAuditSequence } from '../js/federal-audit-sequence.js';
import { recordHashtagEvent } from '../js/market-dynamics.js';
import { getCurrentGameDate } from '../js/clock.js';
import { getTotalInventoryValue, getLiquidationPool } from '../js/warehouse-tick.js';
import { getGdpIndex, getConsumerConf, getDotComPhase, getInflationRate } from '../js/economy.js';

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
      if (!item.contextData) item.contextData = {};
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

  _poolActiveActors() {
    const gameDate = getCurrentGameDate();
    const districts = getState().player?.exploredDistricts || [1];
    return ActorDB.getActiveNow(gameDate.getUTCHours(), gameDate.getUTCDay(), districts);
  },

  _resolveActorQuery(query, _simMs) {
    const gameDate = getCurrentGameDate();
    const hour = gameDate.getUTCHours();
    const dow = gameDate.getUTCDay();

    let districts;
    if (query.district === 'player_district') {
      districts = getState().player?.exploredDistricts || [1];
    } else if (query.district === 'any') {
      districts = null;
    } else if (query.district != null) {
      districts = [query.district];
    } else {
      districts = getState().player?.exploredDistricts || [1];
    }

    let pool = ActorDB.getActiveNow(hour, dow, districts);

    if (query.taglets?.length) {
      pool = pool.filter((a) => query.taglets.some((t) => (a.taglets || []).includes(t)));
    }
    if (query.role && query.role !== 'any') {
      pool = pool.filter((a) => a.role === query.role);
    }
    if (query.shift) {
      pool = pool.filter((a) => a.work_schedule?.shift === query.shift);
    }

    const limit = query.limit || 5;
    const result = [];
    const arr = pool.slice();
    for (let i = 0; i < Math.min(limit, arr.length); i++) {
      const j = i + Math.floor(Math.random() * (arr.length - i));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
      result.push(arr[i]);
    }
    return result;
  },

  // ── FIRE AN EVENT ─────────────────────────────────────────────────
  _fireEvent(def, contextData, simMs) {
    if (def.actorQuery && contextData) {
      contextData.matchedActors = this._resolveActorQuery(def.actorQuery, simMs);
    }

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

    if (outcome.heraldHeadline) {
      const headline = this._interpolate(String(outcome.heraldHeadline), def, resolution);
      const severity = Number(outcome.heraldSeverity ?? 1);
      const newsId = `news_${def.id}_${Date.now()}`;
      patchState((st) => {
        st.newsRegistry = st.newsRegistry || [];
        st.newsRegistry.push({
          id: newsId,
          simMs: simMs ?? (getState().sim?.elapsedMs || 0),
          headline,
          summary: headline,
          category: def.newsCategory || 'general',
          severity,
          districtId: null,
          namedActors: [],
          tags: [],
          channels: ['herald'],
          reachRadius: 'city',
          decaySimMs: 86400000 * 2,
          reactions: { sympathy: 0, outrage: 0, indifferent: 0 },
          comments: [],
          processed: false,
        });
        if (st.newsRegistry.length > 100) st.newsRegistry.shift();
        return st;
      });
      if (severity >= 2 && typeof headline === 'string' && headline.trim()) {
        emit('news:breaking', {
          headline: headline.trim(),
          id: newsId,
          severity,
        });
      }
    }

    if (outcome.notorietyDelta != null) {
      patchState(st => {
        if (!st.corporateProfile || typeof st.corporateProfile !== 'object') {
          st.corporateProfile = {
            notoriety: 0,
            reputation: 0,
            exposure: 0,
            judicialRecord: [],
            investigatorTier: 0,
            assignedInvestigatorId: null,
            lastAuditSimMs: 0,
            auditCount: 0
          };
        }
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

      case 'log_flag_count_above': {
        const entries = (typeof window !== 'undefined' && window.ActivityLog?.getEntries?.()) || [];
        const flagged = entries.filter((e) => e.flag === 'FLAGGED').length;
        return flagged >= Number(condition.value);
      }
      case 'log_has_entry_type': {
        const entries = (typeof window !== 'undefined' && window.ActivityLog?.getEntries?.()) || [];
        return entries.some((e) => e.type === String(condition.entryType));
      }
      case 'log_tampered':
        return typeof window !== 'undefined' && window.ActivityLog?.isTampered?.() === true;

      case 'account_overdrawn': {
        const accounts = getState().accounts || [];
        const primary = accounts.find((a) => a.isPrimary) || accounts.find((a) => a.id === 'fncb');
        return (primary?.balance || 0) < 0;
      }
      case 'large_transfer_to_darkweb': {
        const threshold = Number(condition.value || 5000);
        const simMs = getState().sim?.elapsedMs || 0;
        const log = getState().bankingTransactionLog || [];
        return log.some((tx) => {
          const typeStr = String(tx.type || '').toUpperCase();
          const isTransfer = typeStr.includes('TRANSFER');
          const dest = String(tx.destinationBank || tx.toAccountBank || tx.bankName || '').toLowerCase();
          const desc = String(tx.description || '').toLowerCase();
          const toDark = dest.includes('dark') || desc.includes('dark web') || desc.includes('darkweb');
          return (
            isTransfer &&
            toDark &&
            (tx.amount || 0) >= threshold &&
            simMs - (tx.simTimestampMs || 0) < SIM_DAY_MS
          );
        });
      }

      case 'market_shortage_active': {
        const buzz = getState().marketBuzz || {};
        return Object.values(buzz).some((b) => b && b.shortage === true);
      }
      case 'market_shortage_tag': {
        const buzz = getState().marketBuzz || {};
        return buzz[condition.tag]?.shortage === true;
      }

      case 'any_site_offline': {
        const pages = (getState().contentRegistry?.pages || []).filter(
          (p) => p.webExProjectId && !p.ownedByCompany
        );
        return pages.some((p) => (p.stats?.health ?? 100) <= 0);
      }
      case 'site_traffic_above': {
        const pages = (getState().contentRegistry?.pages || []).filter(
          (p) => p.webExProjectId && !p.ownedByCompany
        );
        return pages.some((p) => (p.stats?.traffic || 0) >= Number(condition.value));
      }

      case 'actor_opinion_below': {
        try {
          const threshold = Number(condition.value ?? -50);
          const actors = this._poolActiveActors();
          const playerId = getState().player?.actor_id || 'PLAYER_PRIMARY';
          return actors.some((a) => {
            const opinion = a.opinion_profile?.[playerId] ?? 0;
            return opinion <= threshold;
          });
        } catch {
          return false;
        }
      }
      case 'actor_opinion_above': {
        try {
          const threshold = Number(condition.value ?? 70);
          const actors = this._poolActiveActors().filter((a) => a.role === 'contact');
          const playerId = getState().player?.actor_id || 'PLAYER_PRIMARY';
          return actors.some((a) => {
            const opinion = a.opinion_profile?.[playerId] ?? 0;
            return opinion >= threshold;
          });
        } catch {
          return false;
        }
      }
      case 'information_broker_hostile': {
        try {
          const actors = this._poolActiveActors().filter((a) => (a.taglets || []).includes('information_broker'));
          const playerId = getState().player?.actor_id || 'PLAYER_PRIMARY';
          return actors.some((a) => (a.opinion_profile?.[playerId] ?? 0) < -40);
        } catch {
          return false;
        }
      }

      case 'investigator_tier_above':
        return (getState().corporateProfile?.investigatorTier || 0) >= Number(condition.value);
      case 'investigator_assigned':
        return !!getState().corporateProfile?.assignedInvestigatorId;

      case 'company_count_above':
        return (getState().companies || []).length > Number(condition.value || 0);
      case 'has_active_contract':
        return (getState().activeTasks || []).some(
          (t) => t.type === 'website_contract' || t.type === 'business_contract'
        );

      case 'axis_contact_count_above': {
        const contacts = (typeof window !== 'undefined' && window.AXIS?.getContacts?.('All')) || [];
        return contacts.length >= Number(condition.value ?? 0);
      }
      case 'axis_has_hostile': {
        const contacts = (typeof window !== 'undefined' && window.AXIS?.getContacts?.('All')) || [];
        return contacts.some((c) => (c.entry?.relationship_score || 0) <= -55);
      }
      case 'axis_has_trusted': {
        const contacts = (typeof window !== 'undefined' && window.AXIS?.getContacts?.('All')) || [];
        return contacts.some((c) => (c.entry?.relationship_score || 0) >= 51);
      }
      case 'axis_has_allied': {
        const contacts = (typeof window !== 'undefined' && window.AXIS?.getContacts?.('All')) || [];
        return contacts.some((c) => (c.entry?.relationship_score || 0) >= 76);
      }
      case 'axis_favor_owed': {
        const contacts = (typeof window !== 'undefined' && window.AXIS?.getContacts?.('All')) || [];
        return contacts.some((c) => (c.entry?.favor_balance || 0) > 0);
      }
      case 'axis_intel_on_contact': {
        const contacts = (typeof window !== 'undefined' && window.AXIS?.getContacts?.('All')) || [];
        return contacts.some((c) => (c.entry?.intel_level || 0) >= Number(condition.value));
      }

      case 'inventory_value_above':
        return getTotalInventoryValue() >= Number(condition.value);
      case 'has_overdue_unit': {
        const s = getState();
        const simMs = s.sim?.elapsedMs || 0;
        return (s.warehouse?.units || []).some((u) => simMs > (u.paidThroughSimMs || 0));
      }
      case 'liquidation_items_above':
        return getLiquidationPool().length >= Number(condition.value);

      case 'gdp_below':
        return getGdpIndex() < Number(condition.value);
      case 'consumer_confidence_below':
        return getConsumerConf() < Number(condition.value);
      case 'dot_com_phase':
        return getDotComPhase() === condition.value;
      case 'inflation_above':
        return getInflationRate() > Number(condition.value);

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
    const acumen = Number(st.player?.acumen ?? 10);
    mod += Math.floor((acumen - 10) / 2);
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
        if (!st.corporateProfile || typeof st.corporateProfile !== 'object') {
          st.corporateProfile = {
            notoriety: 0,
            reputation: 0,
            exposure: 0,
            judicialRecord: [],
            investigatorTier: 0,
            assignedInvestigatorId: null,
            lastAuditSimMs: 0,
            auditCount: 0
          };
        }
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
    const hour = gameDate?.getUTCHours?.() ?? 9;
    try {
      const dow = gameDate?.getUTCDay?.() ?? 0;
      const districts = getState().player?.exploredDistricts || [1];
      actors = ActorDB.getActiveNow(hour, dow, districts).filter(
        (a) => a.active !== false && a.role !== 'player'
      );
    } catch {
      return;
    }

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
    const threshold = tier === 3 ? 100 : tier === 2 ? 50 : 25;

    if (notoriety < threshold) return;

    const tierGate = st.corporateProfile?.investigatorTierAdvanceEarliestSimMs || 0;
    const currentTier = st.corporateProfile?.investigatorTier || 0;
    if (simMs >= tierGate && currentTier < tier) {
      patchState((s) => {
        if (!s.corporateProfile || typeof s.corporateProfile !== 'object') {
          s.corporateProfile = {
            notoriety: 0,
            reputation: 0,
            exposure: 0,
            judicialRecord: [],
            investigatorTier: 0,
            assignedInvestigatorId: null,
            lastAuditSimMs: 0,
            auditCount: 0
          };
        }
        s.corporateProfile.investigatorTier = tier;
        s.corporateProfile.assignedInvestigatorId = actor.actor_id;
        return s;
      });

      const stAfter = getState();
      SMS.send({
        from: tier === 3 ? 'FBCE' : 'COMPLIANCE_MONITOR',
        message:
          tier === 1
            ? `NOTICE: Your operator account has been flagged for routine compliance monitoring. Activity logging is in effect. Operator: ${stAfter.player?.operatorId || 'UNKNOWN'}`
            : tier === 2
              ? `ESCALATION NOTICE: Your file has been assigned to a Senior Auditor. Continued irregular activity may result in a formal federal audit. Cooperate fully with any requests.`
              : `FEDERAL NOTICE: The Federal Bureau of Commerce Enforcement has opened a case file on your operator account. A federal agent has been assigned. Do not destroy records.`,
        gameTime: simMs
      });
    }

    const dc = 14 + (3 - tier) * 2;
    const result = resolveAgainstDC({ dc, modifier: Math.floor(notoriety / 25) });
    if (!result.success) return;

    const playerId = st.player?.actor_id || 'PLAYER_PRIMARY';
    let hostileBroker;
    try {
      hostileBroker = this._poolActiveActors().find(
        (a) =>
          (a.taglets || []).includes('information_broker') &&
          (a.opinion_profile?.[playerId] ?? 0) < -40
      );
    } catch {
      hostileBroker = undefined;
    }
    if (hostileBroker && typeof window !== 'undefined' && window.ActivityLog?.log) {
      window.ActivityLog.log('SYSTEM', 'Information broker activity detected near operator account', {
        notable: true
      });
    }

    const pool = {
      1: [
        'Automated compliance scan detected irregular patterns. Review your activity log.',
        'Compliance notice: Your account activity has triggered a monitoring flag.',
        'This is an automated notice. Continued irregular activity will be escalated.'
      ],
      2: [
        'This is Senior Auditor Rodriguez. I have reviewed your file. I will be in touch.',
        'Your financial transaction patterns are inconsistent with your declared business activity.',
        'We are requesting supplemental documentation. Expect formal correspondence via JeeMail.'
      ],
      3: [
        'FBCE Special Agent Moss. Do not destroy or alter any records. You are under federal review.',
        'This is a formal notice from the Federal Bureau of Commerce Enforcement. Respond within 48 hours.',
        'Your operator license is under review. All account activity has been preserved.'
      ]
    };
    const msgs = pool[tier] || pool[1];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];
    const senderMap = { 1: 'COMPLIANCE_MONITOR', 2: 'T2_AUDITOR', 3: 'FBCE' };

    SMS.send({
      from: senderMap[tier] || 'COMPLIANCE_MONITOR',
      message: msg,
      gameTime: simMs
    });
  },

  // ── WEBSITE WORLD TICK (hourly) ────────────────────────────────────
  _tickWebsiteWorld(simMs) {
    const playerPages = (getState().contentRegistry?.pages || []).filter(
      (p) => p.webExProjectId && !p.ownedByCompany
    );
    if (!playerPages.length) return;

    let allActors;
    try {
      const gd = new Date(getGameEpochMs() + simMs);
      const districts = getState().player?.exploredDistricts || [1];
      allActors = ActorDB.getActiveNow(gd.getUTCHours(), gd.getUTCDay(), districts).filter(
        (a) => a.active !== false && a.actor_id
      );
    } catch {
      return;
    }
    if (!allActors.length) return;

    const gameDate = new Date(getGameEpochMs() + simMs);
    const timeLabel = `${gameDate.getUTCMonth() + 1}/${gameDate.getUTCDate()} ${gameDate.getUTCHours()}:00`;
    const modulesOf = (page) => page.modules || [];

    for (const page of playerPages) {
      if (page.stats?.health <= 0) continue;

      const trafficMod = (page.stats?.traffic || 50) / 100;
      const visitChance = 0.03 * trafficMod;
      const visitors = allActors.filter(() => Math.random() < visitChance);
      if (!visitors.length) continue;

      for (const actor of visitors) {
        const slug = String(page.pageId || page.title || 'site')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_');
        recordHashtagEvent(slug, 'mention');

        const actorName =
          actor.public_profile?.display_name ||
          (actor.full_legal_name && String(actor.full_legal_name).split(' ')[0]) ||
          actor.actor_id;

        siteIntegrationLog(page.pageId, {
          type: 'npc_visit',
          actorId: actor.actor_id,
          actorName,
          action: 'visited your site',
          timeLabel,
          simMs
        });

        patchState((s) => {
          const pg = (s.contentRegistry?.pages || []).find((p) => p.pageId === page.pageId);
          if (pg?.stats) {
            pg.stats.traffic = Math.min(100, (pg.stats.traffic || 0) + 0.1);
          }
          return s;
        });

        const hasGuestbook = modulesOf(page).includes('guestbook');
        if (hasGuestbook) {
          const tags = actor.taglets || [];
          const willSign = tags.includes('vocal') || tags.includes('transactional')
            ? Math.random() < 0.4
            : Math.random() < 0.08;

          if (willSign) {
            const messages = [
              `Great site! Really impressed with what you have here.`,
              `Found you through Wahoo! Keep up the good work.`,
              `Excellent content. Will be returning for sure.`,
              `Nice to see a local business on WorldNet. Support from Hargrove!`,
              `Very professional. Bookmarked for later.`,
              `This is exactly what I was looking for. Thank you!`,
              `Good stuff. Shared with a few colleagues.`,
              `First time here. Won't be the last.`
            ];
            const msg = messages[Math.floor(Math.random() * messages.length)];
            siteGuestbookAppend(page.pageId, {
              actorId: actor.actor_id,
              actorName,
              message: msg,
              timeLabel,
              simMs
            });
            siteIntegrationLog(page.pageId, {
              type: 'guestbook_entry',
              actorId: actor.actor_id,
              actorName,
              action: `signed guestbook: "${msg.slice(0, 40)}..."`,
              timeLabel,
              simMs
            });
          }
        }

        const hasShop =
          page.hasShop ||
          modulesOf(page).some(
            (m) => m === 'shop' || m === 'product_listing' || m === 'checkout_widget'
          );
        if (hasShop) {
          const tags = actor.taglets || [];
          const uxScore = page.uxScore || 50;
          const buyChance = (uxScore / 200) * (tags.includes('transactional') ? 0.35 : 0.08);
          if (Math.random() < buyChance && page.shopId) {
            siteIntegrationLog(page.pageId, {
              type: 'commerce',
              actorId: actor.actor_id,
              actorName,
              action: 'purchased from your shop',
              timeLabel,
              simMs
            });
            const revenue = Math.round(20 + Math.random() * 80);
            patchState((s) => {
              const primary = (s.accounts || []).find((a) => a.id === 'fncb');
              if (primary) primary.balance = (primary.balance || 0) + revenue;
              const pg = (s.contentRegistry?.pages || []).find((p) => p.pageId === page.pageId);
              if (pg?.stats) {
                pg.stats.traffic = Math.min(100, (pg.stats.traffic || 0) + 0.5);
              }
              return s;
            });
          }
        }

        if (modulesOf(page).includes('banner_ad_slot') && Math.random() < 0.15) {
          siteIntegrationLog(page.pageId, {
            type: 'ad_click',
            actorId: actor.actor_id,
            actorName,
            action: 'engaged with advertisement',
            timeLabel,
            simMs
          });
        }

        if (modulesOf(page).includes('contact_form') && Math.random() < 0.05) {
          siteIntegrationLog(page.pageId, {
            type: 'form_submit',
            actorId: actor.actor_id,
            actorName,
            action: 'submitted contact form',
            timeLabel,
            simMs
          });
        }
      }

      const st = getState();
      const pEntry = (st.contentRegistry?.pages || []).find((p) => p.pageId === page.pageId);
      const totalVisits = (pEntry?.integrationLog || []).filter((e) => e.type === 'npc_visit').length;
      const milestones = [10, 50, 100, 500, 1000];
      for (const m of milestones) {
        const flagKey = `site_traffic_milestone_${page.pageId}_${m}`;
        if (totalVisits >= m && !st.flags?.[flagKey]) {
          patchState((s) => {
            if (!s.flags) s.flags = {};
            s.flags[flagKey] = true;
            return s;
          });
          ToastManager.fire({
            key: flagKey,
            title: 'Website Traffic',
            message: `${page.title || page.pageId} has reached ${m} visitors.`,
            icon: '🌐'
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
