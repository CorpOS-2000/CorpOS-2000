/**
 * Player-slice persistence (localStorage in dev; swap SAVE_KEY handler for electron-store later).
 * World/regenerated content is not saved — only operator progress and discovered actor records.
 */
import { getState, patchState, getGameEpochMs } from '../js/gameState.js';
import { getSessionState, patchSession } from '../js/sessionState.js';
import { ActorDB } from './ActorDB.js';

const SAVE_KEY = 'corpos2000_player_save';
const CURRENT_VERSION = '2.1.0';

const MIGRATION_ORDER = ['2.0.0', '2.1.0'];

/** @type {Record<string, object> | null} */
let _pendingDiscoveredActors = null;

function simpleHash(str) {
  const s = String(str || '');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return String(h >>> 0);
}

function safeGameDatePayload() {
  const st = getState();
  return {
    elapsedMs: Number(st.sim?.elapsedMs || 0),
    iso: new Date(getGameEpochMs() + Number(st.sim?.elapsedMs || 0)).toISOString()
  };
}

function buildDiscoveredActorSnapshot() {
  const st = getState();
  const fromContacts = (st.player?.blackCherryContacts || []).map((c) => c.actorId || c.actor_id).filter(Boolean);
  const axisRows = typeof window !== 'undefined' && window.AXIS?.exportRelationships
    ? window.AXIS.exportRelationships()
    : [];
  const fromAxis = (axisRows || []).map((r) => r.actor_id).filter(Boolean);
  const unique = [...new Set([...fromContacts, ...fromAxis])];
  const snapshot = {};
  for (const id of unique) {
    const actor = ActorDB.getRaw(id);
    if (actor) snapshot[id] = JSON.parse(JSON.stringify(actor));
  }
  return snapshot;
}

const migrations = {
  '2.0.0': (save) => {
    if (!save.flags) save.flags = {};
    if (!save.mediaPlayer) {
      save.mediaPlayer = { purchased: [], favorites: [], lastTrack: null, lastPosition: 0 };
    }
    save.contacts = save.contacts ?? save.identity?.contacts ?? [];
    if (!Array.isArray(save.contacts)) save.contacts = [];
    if (!save.smsThreads) save.smsThreads = {};
    if (!save.callLog) save.callLog = [];
    return save;
  },
  '2.1.0': (save) => {
    if (!save.mediaPlayer) save.mediaPlayer = {};
    if (save.mediaPlayer.lastPosition == null) save.mediaPlayer.lastPosition = 0;
    if (save.flags && save.flags.kyleCallCompleted == null) save.flags.kyleCallCompleted = false;
    if (!save.axisRelationships) save.axisRelationships = [];
    if (!save.completedEvents) save.completedEvents = [];
    if (!save.discoveredActors) save.discoveredActors = {};
    return save;
  }
};

function runMigrations(save) {
  let version = save.version || '1.0.0';
  let idx = MIGRATION_ORDER.indexOf(version);
  if (idx < 0) idx = -1;
  for (let i = idx + 1; i < MIGRATION_ORDER.length; i++) {
    const v = MIGRATION_ORDER[i];
    const fn = migrations[v];
    if (fn) {
      save = fn(save);
      save.version = v;
      console.log(`[SaveManager] Migrated save to ${v}`);
    }
  }
  return save;
}

export const SaveManager = {
  SAVE_KEY,
  CURRENT_VERSION,

  save() {
    const payload = this.buildPlayerSlice();
    payload.version = CURRENT_VERSION;
    payload.savedAt = new Date().toISOString();
    payload.gameDate = safeGameDatePayload();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      console.log(`[SaveManager] Saved at ${payload.savedAt}`);
      return { success: true, savedAt: payload.savedAt };
    } catch (err) {
      console.error('[SaveManager] Save failed:', err);
      return { success: false, error: err?.message || String(err) };
    }
  },

  load() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (e) {
      console.error('[SaveManager] Storage read failed:', e);
      return { exists: false };
    }
    if (!raw) return { exists: false };
    let save;
    try {
      save = JSON.parse(raw);
    } catch (err) {
      console.error('[SaveManager] Save file corrupted:', err);
      return { exists: true, corrupted: true };
    }
    save = runMigrations(save);
    save.version = CURRENT_VERSION;
    return { exists: true, corrupted: false, data: save };
  },

  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
    _pendingDiscoveredActors = null;
    console.log('[SaveManager] Save cleared. New game on next load.');
  },

  hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  },

  buildPlayerSlice() {
    const st = getState();
    const P = st.player || {};
    const sess = getSessionState();

    const axisRows =
      typeof window !== 'undefined' && window.AXIS?.exportRelationships
        ? window.AXIS.exportRelationships()
        : [];

    return {
      identity: {
        full_legal_name: P.displayName || [P.firstName, P.lastName].filter(Boolean).join(' ') || '',
        ssn_hash: P.ssnFull ? simpleHash(P.ssnFull) : '',
        dob: P.dob || '',
        home_address: P.address || '',
        phone_number: P.phone || (Array.isArray(P.phone_numbers) ? P.phone_numbers[0] : '') || '',
        operatorId: P.operatorId || P.username || '',
        username: P.username || ''
      },
      finances: {
        hardCash: P.hardCash ?? 0,
        cashPassBalance: P.cashPassBalance ?? 0,
        bankAccounts: st.accounts || []
      },
      jeemail: {
        accounts: sess.jeemail?.accounts || {},
        active: sess.jeemail?.currentUser ?? null
      },
      wahoo: {
        accounts: sess.wahoo?.accounts || {},
        active: sess.wahoo?.currentUser ?? null
      },
      companies: st.companies || [],
      corporateProfile: st.corporateProfile || {},
      inventory: st.worldNetShopping?.inventory || [],
      properties: st.properties || [],
      contacts: P.blackCherryContacts || [],
      discoveredActors: buildDiscoveredActorSnapshot(),
      smsThreads: st.smsThreads || {},
      callLog: sess.blackCherry?.recentCalls || [],
      activeTasks: st.activeTasks || [],
      completedEvents: st.completedEvents || [],
      axisRelationships: axisRows,
      mediaPlayer: {
        purchased: st.mediaPlayer?.unlockedIds || [],
        favorites: st.mediaPlayer?.favorites || [],
        lastTrack: st.mediaPlayer?.currentTrackId ?? null,
        lastPosition: st.mediaPlayer?.positionSec ?? 0
      },
      flags: {
        ...(st.flags || {}),
        kyleCallCompleted: !!(st.flags && st.flags.kyleCallCompleted)
      },
      bankingTransactionLog: st.bankingTransactionLog || [],
      businessRegistry: st.businessRegistry || {},
      virtualFs: st.virtualFs || { entries: [], nextSeq: 1 },
      software: st.software || { installedAppIds: [], activeInstalls: [] },
      registry: st.registry,
      regulatory: st.regulatory,
      worldNetShoppingMeta: {
        carts: st.worldNetShopping?.carts || {},
        orders: st.worldNetShopping?.orders || [],
        activeDeliveries: st.worldNetShopping?.activeDeliveries || [],
        nextOrderSeq: st.worldNetShopping?.nextOrderSeq ?? 1
      }
    };
  },

  /** Queue discovered actors to merge after world NPC bootstrap (BIOS). */
  setPendingDiscoveredActors(snapshot) {
    _pendingDiscoveredActors = snapshot && typeof snapshot === 'object' ? snapshot : null;
  },

  applyPendingDiscoveredActors() {
    if (!_pendingDiscoveredActors) return;
    const snap = _pendingDiscoveredActors;
    _pendingDiscoveredActors = null;
    for (const [id, actor] of Object.entries(snap)) {
      if (!actor || !id) continue;
      try {
        ActorDB.importActorRecord(actor);
      } catch (e) {
        console.warn('[SaveManager] importActorRecord', id, e);
      }
    }
    console.log('[SaveManager] Merged discovered actor records from save.');
  },

  /**
   * Hydrate GameState + session from save. Does not touch ActorDB — use applyPendingDiscoveredActors after world gen.
   */
  hydrate(saveData) {
    const d = saveData && typeof saveData === 'object' ? { ...saveData } : null;
    if (!d) return null;
    const axisRows = Array.isArray(d.axisRelationships) ? d.axisRelationships : null;
    delete d.axisRelationships;

    if (d.gameDate && typeof d.gameDate.elapsedMs === 'number') {
      patchState((st) => {
        st.sim = st.sim || {};
        st.sim.elapsedMs = d.gameDate.elapsedMs;
        return st;
      });
    }

    patchState((st) => {
      const id = d.identity || {};
      st.player = st.player || {};
      const p = st.player;
      if (id.full_legal_name) {
        p.displayName = id.full_legal_name;
        const parts = String(id.full_legal_name).trim().split(/\s+/);
        p.firstName = parts[0] || p.firstName;
        p.lastName = parts.length > 1 ? parts.slice(1).join(' ') : p.lastName;
      }
      if (id.dob) p.dob = id.dob;
      if (id.home_address) p.address = id.home_address;
      if (id.phone_number) {
        p.phone = id.phone_number;
        p.phone_numbers = [id.phone_number];
      }
      if (id.username) p.username = id.username;
      if (id.operatorId) p.operatorId = id.operatorId;
      p.hardCash = d.finances?.hardCash ?? p.hardCash ?? 0;
      p.cashPassBalance = d.finances?.cashPassBalance ?? p.cashPassBalance ?? 0;
      if (d.finances?.bankAccounts) st.accounts = d.finances.bankAccounts;
      st.companies = d.companies ?? st.companies ?? [];
      st.corporateProfile = d.corporateProfile ?? st.corporateProfile ?? {};
      st.worldNetShopping = st.worldNetShopping || {};
      if (d.inventory) st.worldNetShopping.inventory = d.inventory;
      if (d.worldNetShoppingMeta) {
        Object.assign(st.worldNetShopping, d.worldNetShoppingMeta);
      }
      st.properties = d.properties ?? st.properties ?? [];
      st.smsThreads = d.smsThreads ?? st.smsThreads ?? {};
      st.activeTasks = d.activeTasks ?? st.activeTasks ?? [];
      st.completedEvents = d.completedEvents ?? st.completedEvents ?? [];
      st.flags = { ...(st.flags || {}), ...(d.flags || {}) };
      st.bankingTransactionLog = d.bankingTransactionLog ?? st.bankingTransactionLog ?? [];
      st.businessRegistry = d.businessRegistry ?? st.businessRegistry ?? {};
      st.virtualFs = d.virtualFs ?? st.virtualFs ?? { entries: [], nextSeq: 1 };
      st.software = d.software ?? st.software ?? { installedAppIds: [], activeInstalls: [] };
      if (d.registry) st.registry = d.registry;
      if (d.regulatory) st.regulatory = d.regulatory;
      p.blackCherryContacts = Array.isArray(d.contacts) ? d.contacts : p.blackCherryContacts || [];

      st.mediaPlayer = st.mediaPlayer || {};
      const mp = d.mediaPlayer || {};
      st.mediaPlayer.unlockedIds = mp.purchased ?? st.mediaPlayer.unlockedIds ?? [];
      st.mediaPlayer.favorites = mp.favorites ?? st.mediaPlayer.favorites ?? [];
      st.mediaPlayer.currentTrackId = mp.lastTrack ?? st.mediaPlayer.currentTrackId ?? null;
      st.mediaPlayer.positionSec = mp.lastPosition ?? st.mediaPlayer.positionSec ?? 0;

      return st;
    });

    patchSession((s) => {
      s.jeemail = s.jeemail || { accounts: {}, currentUser: null };
      s.jeemail.accounts = d.jeemail?.accounts || {};
      s.jeemail.currentUser = d.jeemail?.active ?? null;
      s.wahoo = s.wahoo || { accounts: {}, currentUser: null };
      s.wahoo.accounts = d.wahoo?.accounts || {};
      s.wahoo.currentUser = d.wahoo?.active ?? null;
      s.blackCherry = s.blackCherry || { inbox: [], recentCalls: [], pendingRudenessEvents: [] };
      s.blackCherry.recentCalls = Array.isArray(d.callLog) ? d.callLog : s.blackCherry.recentCalls || [];
      return s;
    });

    this.setPendingDiscoveredActors(d.discoveredActors || null);

    console.log('[SaveManager] Game state hydrated from save.');
    return axisRows;
  },

  /** Call after ActorDB.init and initAxis (from app.js). */
  loadAndHydrateState() {
    const result = this.load();
    if (result.exists && !result.corrupted && result.data) {
      console.log('[Boot] Save found. Loading player slice...');
      const axisRows = this.hydrate(result.data);
      return { loaded: true, axisRelationships: axisRows };
    }
    if (result.exists && result.corrupted) {
      console.warn('[Boot] Save corrupted. Clearing.');
      this.reset();
    } else {
      console.log('[Boot] No save found. New game.');
    }
    return { loaded: false, axisRelationships: null };
  }
};

export function saveAfterMutation() {
  try {
    SaveManager.save();
  } catch (e) {
    console.warn('[SaveManager] saveAfterMutation:', e);
  }
}
