/**
 * Player-slice persistence (localStorage in dev; swap SAVE_KEY handler for electron-store later).
 * World/regenerated content is not saved — only operator progress and discovered actor records.
 */
import { getState, patchState, getGameEpochMs } from '../js/gameState.js';
import { getSessionState, patchSession } from '../js/sessionState.js';
import { syncDesktopIconPositionsToSession } from '../js/desktop.js';
import { ActorDB } from './ActorDB.js';
import { ActivityLog } from './ActivityLog.js';

const LEGACY_SAVE_KEY = 'corpos2000_player_save';
const ACCOUNT_INDEX_KEY = 'corpos2000_account_index';
const SAVE_KEY_PREFIX = 'corpos2000_save__';
const CURRENT_VERSION = '2.2.0';

const MIGRATION_ORDER = ['2.0.0', '2.1.0', '2.2.0'];

let _activeUsername = null;

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
  },
  '2.2.0': (save) => {
    if (!save.desktop || typeof save.desktop !== 'object') {
      save.desktop = { wallpaper: '#008080', positions: {} };
    }
    if (!save.desktop.positions || typeof save.desktop.positions !== 'object') save.desktop.positions = {};
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

function userSaveKey(username) {
  return SAVE_KEY_PREFIX + String(username || '').trim().toUpperCase();
}

function loadAccountIndex() {
  try {
    const raw = localStorage.getItem(ACCOUNT_INDEX_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAccountIndex(arr) {
  try {
    localStorage.setItem(ACCOUNT_INDEX_KEY, JSON.stringify(arr));
  } catch (e) {
    console.error('[SaveManager] Failed to write account index:', e);
  }
}

export const SaveManager = {
  CURRENT_VERSION,

  getActiveUsername() {
    return _activeUsername;
  },

  setActiveUsername(username) {
    _activeUsername = username ? String(username).trim().toUpperCase() : null;
  },

  getAccountIndex() {
    return loadAccountIndex();
  },

  hasRegisteredUsers() {
    return loadAccountIndex().length > 0;
  },

  registerUser(username, passwordHash, displayName) {
    const norm = String(username || '').trim().toUpperCase();
    if (!norm) return false;
    const idx = loadAccountIndex();
    if (idx.some((a) => a.username === norm)) return false;
    idx.push({
      username: norm,
      passwordHash: String(passwordHash || ''),
      displayName: displayName || norm,
      createdAt: new Date().toISOString()
    });
    saveAccountIndex(idx);
    console.log(`[SaveManager] Registered user: ${norm}`);
    return true;
  },

  /**
   * Remove an operator from the workstation registry and delete their local save blob.
   * Does not clear other users' data.
   */
  deleteOperatorRecord(username) {
    const norm = String(username || '').trim().toUpperCase();
    if (!norm) return { ok: false, reason: 'invalid' };
    const prev = loadAccountIndex();
    const idx = prev.filter((a) => a.username !== norm);
    if (idx.length === prev.length) return { ok: false, reason: 'not_found' };
    saveAccountIndex(idx);
    try {
      localStorage.removeItem(userSaveKey(norm));
    } catch {
      /* ignore */
    }
    if (_activeUsername === norm) _activeUsername = null;
    _pendingDiscoveredActors = null;
    console.log(`[SaveManager] Operator record purged: ${norm}`);
    return { ok: true };
  },

  verifyPassword(username, password) {
    const norm = String(username || '').trim().toUpperCase();
    const idx = loadAccountIndex();
    const entry = idx.find((a) => a.username === norm);
    if (!entry) return false;
    if (!entry.passwordHash) return true;
    return entry.passwordHash === simpleHash(password);
  },

  updatePasswordHash(username, passwordHash) {
    const norm = String(username || '').trim().toUpperCase();
    const idx = loadAccountIndex();
    const entry = idx.find((a) => a.username === norm);
    if (!entry) return;
    entry.passwordHash = passwordHash;
    saveAccountIndex(idx);
  },

  hashPassword(password) {
    return simpleHash(password);
  },

  save() {
    try {
      syncDesktopIconPositionsToSession();
    } catch (e) {
      console.warn('[SaveManager] Desktop icon sync:', e);
    }
    const payload = this.buildPlayerSlice();
    payload.version = CURRENT_VERSION;
    payload.savedAt = new Date().toISOString();
    payload.gameDate = safeGameDatePayload();
    const key = _activeUsername ? userSaveKey(_activeUsername) : userSaveKey(payload.identity?.username || 'DEFAULT');
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      console.log(`[SaveManager] Saved ${key} at ${payload.savedAt}`);
      return { success: true, savedAt: payload.savedAt };
    } catch (err) {
      console.error('[SaveManager] Save failed:', err);
      return { success: false, error: err?.message || String(err) };
    }
  },

  loadUser(username) {
    const key = userSaveKey(username);
    let raw;
    try {
      raw = localStorage.getItem(key);
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

  load() {
    if (_activeUsername) return this.loadUser(_activeUsername);
    let raw;
    try {
      raw = localStorage.getItem(LEGACY_SAVE_KEY);
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

  migrateLegacySave() {
    try {
      const raw = localStorage.getItem(LEGACY_SAVE_KEY);
      if (!raw) return false;
      const save = JSON.parse(raw);
      const username = String(save.identity?.username || 'OPERATOR').trim().toUpperCase();
      const key = userSaveKey(username);
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, raw);
        console.log(`[SaveManager] Legacy save migrated to ${key}`);
      }
      let ph = save.identity?.passwordHash || '';
      if (!ph && save.playerMeta?.password) {
        ph = simpleHash(save.playerMeta.password);
      }

      const idx = loadAccountIndex();
      if (!idx.some((a) => a.username === username)) {
        idx.push({
          username,
          passwordHash: ph,
          displayName: save.identity?.full_legal_name || username,
          createdAt: save.savedAt || new Date().toISOString()
        });
        saveAccountIndex(idx);
      }
      localStorage.removeItem(LEGACY_SAVE_KEY);
      return true;
    } catch (e) {
      console.warn('[SaveManager] Legacy migration failed:', e);
      return false;
    }
  },

  reset() {
    if (_activeUsername) {
      try {
        localStorage.removeItem(userSaveKey(_activeUsername));
      } catch {
        /* ignore */
      }
    }
    _pendingDiscoveredActors = null;
    console.log('[SaveManager] Save cleared for active user.');
  },

  hasSave() {
    if (_activeUsername) {
      try {
        return !!localStorage.getItem(userSaveKey(_activeUsername));
      } catch {
        return false;
      }
    }
    try {
      return !!localStorage.getItem(LEGACY_SAVE_KEY);
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
        username: P.username || '',
        passwordHash: P.passwordHash || ''
      },
      playerMeta: {
        corposEnrollmentComplete: !!P.corposEnrollmentComplete,
        corposEnrollmentCompletedAtSimMs: P.corposEnrollmentCompletedAtSimMs ?? null,
        momActorId: P.momActorId ?? null,
        actor_id: P.actor_id || 'ACT-PLAYER01',
        sex: P.sex || '',
        race: P.race || '',
        heightInches: P.heightInches || 0,
        age: P.age || 0,
        ssnFull: P.ssnFull || '',
        ssnSuffix: P.ssnSuffix || '',
        licenseTerminated: !!P.licenseTerminated,
        terminationReason: P.terminationReason || '',
        identityViolationAttemptCount: P.identityViolationAttemptCount || 0,
        osFailedLoginCount: P.osFailedLoginCount || 0,
        firstJeemailAccount: P.firstJeemailAccount ?? null,
        irsNoticeAcknowledged: !!P.irsNoticeAcknowledged,
        hargroveAddressId: P.hargroveAddressId ?? null,
        vehicle: P.vehicle || '',
        residence: P.residence || '',
        acumen: P.acumen ?? 10,
        webExProjects: P.webExProjects || [],
        webExStockroom: P.webExStockroom || [],
        webExDomainSubscriptions: P.webExDomainSubscriptions || [],
        pendingSmsEvents: P.pendingSmsEvents || [],
        cashUpTransactions: P.cashUpTransactions || [],
        relationships: P.relationships || [],
        phone_numbers: P.phone_numbers || [],
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
      desktop: {
        wallpaper: sess.desktop?.wallpaper || '#008080',
        positions: sess.desktop?.positions && typeof sess.desktop.positions === 'object'
          ? { ...sess.desktop.positions }
          : {}
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
      if (id.passwordHash) p.passwordHash = id.passwordHash;

      const pm = d.playerMeta || {};
      if (pm.corposEnrollmentComplete != null) p.corposEnrollmentComplete = pm.corposEnrollmentComplete;
      if (pm.corposEnrollmentCompletedAtSimMs != null) p.corposEnrollmentCompletedAtSimMs = pm.corposEnrollmentCompletedAtSimMs;
      if (pm.momActorId != null) p.momActorId = pm.momActorId;
      if (pm.actor_id) p.actor_id = pm.actor_id;
      if (pm.sex) p.sex = pm.sex;
      if (pm.race) p.race = pm.race;
      if (pm.heightInches) p.heightInches = pm.heightInches;
      if (pm.age) p.age = pm.age;
      if (pm.ssnFull) p.ssnFull = pm.ssnFull;
      if (pm.ssnSuffix) p.ssnSuffix = pm.ssnSuffix;
      if (pm.licenseTerminated != null) p.licenseTerminated = pm.licenseTerminated;
      if (pm.terminationReason) p.terminationReason = pm.terminationReason;
      if (pm.identityViolationAttemptCount != null) p.identityViolationAttemptCount = pm.identityViolationAttemptCount;
      if (pm.osFailedLoginCount != null) p.osFailedLoginCount = pm.osFailedLoginCount;
      if (pm.firstJeemailAccount !== undefined) p.firstJeemailAccount = pm.firstJeemailAccount;
      if (pm.irsNoticeAcknowledged != null) p.irsNoticeAcknowledged = pm.irsNoticeAcknowledged;
      if (pm.hargroveAddressId !== undefined) p.hargroveAddressId = pm.hargroveAddressId;
      if (pm.vehicle) p.vehicle = pm.vehicle;
      if (pm.residence) p.residence = pm.residence;
      if (pm.acumen != null) p.acumen = pm.acumen;
      if (Array.isArray(pm.webExProjects)) p.webExProjects = pm.webExProjects;
      if (Array.isArray(pm.webExStockroom)) p.webExStockroom = pm.webExStockroom;
      if (Array.isArray(pm.webExDomainSubscriptions)) p.webExDomainSubscriptions = pm.webExDomainSubscriptions;
      if (Array.isArray(pm.pendingSmsEvents)) p.pendingSmsEvents = pm.pendingSmsEvents;
      if (Array.isArray(pm.cashUpTransactions)) p.cashUpTransactions = pm.cashUpTransactions;
      if (Array.isArray(pm.relationships)) p.relationships = pm.relationships;
      if (Array.isArray(pm.phone_numbers)) p.phone_numbers = pm.phone_numbers;

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
      s.desktop = s.desktop || { wallpaper: '#008080', customIcons: [], positions: {} };
      const desk = d.desktop;
      if (desk && typeof desk === 'object') {
        if (typeof desk.wallpaper === 'string' && desk.wallpaper) s.desktop.wallpaper = desk.wallpaper;
        if (desk.positions && typeof desk.positions === 'object') {
          s.desktop.positions = { ...desk.positions };
        } else {
          s.desktop.positions = {};
        }
      } else {
        s.desktop.positions = {};
      }
      return s;
    });

    this.setPendingDiscoveredActors(d.discoveredActors || null);

    try {
      ActivityLog.init();
    } catch (e) {
      console.warn('[SaveManager] ActivityLog.init', e);
    }

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
