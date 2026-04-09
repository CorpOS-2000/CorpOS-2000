import { emit } from './events.js';
import {
  PACIFIC_UNLOCK_DAYS,
  PACIFIC_UNLOCK_NET_WORTH,
  BANK_RULES,
  SIM_WEEK_MS
} from './bank-config.js';
import { createEmptyContentRegistry, ensureContentRegistry } from './content-registry-defaults.js';
import { getInstallableApp, getSoftwarePurchasePriceUsd, isInstallableApp } from './installable-apps.js';

const GAME_EPOCH_UTC_MS = Date.UTC(2000, 0, 1, 6, 0, 0, 0);

const DEFAULT_REGISTRY = {
  citizens: [
    {
      id: 'player',
      kind: 'player',
      displayName: 'John Michael Doe',
      dob: 'March 14, 1976',
      ssnFull: '123-45-4821'
    },
    {
      id: 'npc1',
      kind: 'npc',
      displayName: 'Margaret Ellen Hayes',
      dob: 'April 3, 1958',
      ssnFull: '456-78-9012'
    },
    {
      id: 'npc2',
      kind: 'npc',
      displayName: 'James Porter Whitfield',
      dob: 'November 21, 1963',
      ssnFull: '321-54-7788'
    },
    {
      id: 'npc3',
      kind: 'npc',
      displayName: 'Luis Alvarez-Ramirez',
      dob: 'January 9, 1972',
      ssnFull: '559-13-4401'
    },
    {
      id: 'npc4',
      kind: 'npc',
      displayName: 'Diane Kwok',
      dob: 'August 30, 1951',
      ssnFull: '075-42-9910'
    }
  ]
};

function randomSixDigits() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function generateBankAccountNumber(prefix) {
  return `${prefix}-${randomSixDigits()}`;
}

export function appendBankingTransaction(st, entry) {
  if (!st.bankingTransactionLog) st.bankingTransactionLog = [];
  st.bankingTransactionLog.push({
    simTimestampMs: st.sim?.elapsedMs ?? 0,
    bankName: entry.bankName,
    accountNumber: entry.accountNumber,
    type: entry.type,
    amount: entry.amount,
    destinationAccountNumber: entry.destinationAccountNumber ?? null,
    destinationBank: entry.destinationBank ?? null,
    complianceFlag: !!entry.complianceFlag,
    description: entry.description ?? ''
  });
}

export function findAccountByFullNumber(st, raw) {
  const want = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s/g, '');
  return (st.accounts || []).find((a) => String(a.accountNumber || '').toUpperCase().replace(/\s/g, '') === want);
}

export function isPacificUnlocked(st) {
  const elapsed = st.sim?.elapsedMs ?? 0;
  if (elapsed >= PACIFIC_UNLOCK_DAYS * 86400000) return true;
  return getNetWorth(st) > PACIFIC_UNLOCK_NET_WORTH;
}

function ensureAccountBankingFields(a, st) {
  const rules = BANK_RULES[a.id];
  if (!rules) return;
  if (!a.accountNumber && a.onlineRegistered) {
    a.accountNumber = generateBankAccountNumber(rules.accountPrefix);
  }
  if (!Array.isArray(a.transactions)) a.transactions = [];
  if (a.accountType == null) a.accountType = 'personal_checking';
  if (a.memberSinceElapsedMs == null && a.onlineRegistered) {
    a.memberSinceElapsedMs = st.sim?.elapsedMs ?? 0;
  }
  if (a.loanDetail == null) {
    const lb = Number(a.loanBalance || 0);
    if (lb > 0) {
      a.loanDetail = {
        principal: lb,
        aprPercent: rules.loanAprPercent,
        totalOwed: lb,
        minWeeklyPayment: Math.max(25, Math.ceil(lb * 0.02)),
        createdElapsedMs: st.sim?.elapsedMs ?? 0
      };
    } else {
      a.loanDetail = null;
    }
  }
  if (a.meridianInterestWeekIndex == null) a.meridianInterestWeekIndex = -1;
}

/** One in-game hour in sim elapsed ms (wall-clock style game timeline). */
export const SIM_HOUR_MS = 3600000;

function createInitialStateInternal() {
  return {
    meta: { version: 14 },
    sim: { elapsedMs: 0, speed: 1 },
    player: {
      actor_id: 'ACT-PLAYER01',
      firstName: '',
      lastName: '',
      displayName: '',
      username: '',
      password: '',
      age: 0,
      dob: '',
      sex: '',
      race: '',
      heightInches: 0,
      email: '',
      phone: '',
      address: '',
      hargroveAddressId: null,
      hardCash: 0,
      ssnFull: '',
      ssnSuffix: '',
      vehicle: '',
      residence: '',
      corposEnrollmentComplete: false,
      corposEnrollmentCompletedAtSimMs: null,
      identityViolationAttemptCount: 0,
      osFailedLoginCount: 0,
      licenseTerminated: false,
      terminationReason: '',
      firstJeemailAccount: null,
      irsNoticeAcknowledged: false,
      momActorId: null,
      blackCherryContacts: [],
      relationships: [],
      cashUpTransactions: [],
      acumen: 10,
      webExProjects: [],
      webExStockroom: [],
      webExDomainSubscriptions: [],
    },
    registry: JSON.parse(JSON.stringify(DEFAULT_REGISTRY)),
    regulatory: {
      identityFineCount: 0,
      pendingFines: [],
      fineArrears: 0
    },
    bankingTransactionLog: [],
    accounts: [
      {
        id: 'fncb',
        name: 'First National Corp. Bank',
        balance: 0,
        loanBalance: 0,
        accountNumber: null,
        accountType: 'personal_checking',
        transactions: [],
        loanDetail: null,
        memberSinceElapsedMs: null,
        meridianInterestWeekIndex: -1,
        onlineRegistered: false
      },
      {
        id: 'meridian',
        name: 'Meridian Savings & Trust',
        balance: 0,
        loanBalance: 0,
        accountNumber: null,
        accountType: 'personal_checking',
        transactions: [],
        loanDetail: null,
        memberSinceElapsedMs: null,
        meridianInterestWeekIndex: -1,
        onlineRegistered: false
      },
      {
        id: 'harbor',
        name: 'Harbor Credit Union',
        balance: 0,
        loanBalance: 0,
        accountNumber: null,
        accountType: 'personal_checking',
        transactions: [],
        loanDetail: null,
        memberSinceElapsedMs: null,
        meridianInterestWeekIndex: -1,
        onlineRegistered: false
      },
      {
        id: 'pacific',
        name: 'Pacific Rim Financial',
        balance: 0,
        loanBalance: 0,
        accountNumber: null,
        accountType: 'personal_checking',
        transactions: [],
        loanDetail: null,
        memberSinceElapsedMs: null,
        meridianInterestWeekIndex: -1,
        onlineRegistered: false
      },
      {
        id: 'darkweb',
        name: 'Dark Web Bank',
        balance: 0,
        loanBalance: 0,
        accountNumber: null,
        accountType: 'personal_checking',
        transactions: [],
        loanDetail: null,
        memberSinceElapsedMs: null,
        meridianInterestWeekIndex: -1,
        onlineRegistered: false
      },
      {
        id: 'davidmitchell',
        name: 'David & Mitchell Banking',
        balance: 0,
        loanBalance: 0,
        accountNumber: null,
        accountType: 'personal_checking',
        transactions: [],
        loanDetail: null,
        memberSinceElapsedMs: null,
        meridianInterestWeekIndex: -1,
        onlineRegistered: false
      }
    ],
    companies: [],
    flags: {},
    worldNetShopping: {
      carts: {},
      inventory: [],
      orders: [],
      activeDeliveries: [],
      nextOrderSeq: 1
    },
    software: {
      installedAppIds: [],
      activeInstalls: []
    },
    worldNetProductStock: {},
    contentRegistry: createEmptyContentRegistry(),
    mediaPlayer: {
      currentTrackId: null,
      positionSec: 0,
      volume: 0.8,
      shuffle: false,
      repeat: 'off',
      favorites: [],
      unlockedIds: [],
      eq: { bass: 50, mid: 50, treble: 50 },
      vizMode: 'bars'
    },
    /** Virtual user files in Explorer (parentId = folder-* keys). Movable via Cut/Paste. */
    virtualFs: {
      entries: [],
      nextSeq: 1
    },
    /** Federal Business Registry — applications, daily filing cap. */
    businessRegistry: {
      applications: [],
      lastFilingDayIndex: -1,
      filingsCountOnThatDay: 0
    },
    /** Threaded SMS messages keyed by senderId. */
    smsThreads: {},
    /** WhereAllThingsGo.net warehouse storage units and liquidation pool. */
    warehouse: { units: [], liquidation: [] },
    /** Product hashtag tracking: tag -> { mentions, likes, dislikes, purchaseCountWindow, lastPurchaseSimMs, shortage? } */
    marketBuzz: {}
  };
}

let state = createInitialStateInternal();

export function getGameEpochMs() {
  return GAME_EPOCH_UTC_MS;
}

export function getState() {
  return state;
}

export function patchState(mutator) {
  const draft = JSON.parse(JSON.stringify(state));
  const next = mutator(draft);
  if (!next || typeof next !== 'object') return;
  state = next;
  emit('stateChanged', state);
}

export function replaceState(next) {
  state = migrateStateIfNeeded(next);
  emit('stateChanged', state);
}

export function serialize() {
  return JSON.stringify(state, null, 2);
}

export function hydrate(json) {
  state = migrateStateIfNeeded(JSON.parse(json));
  emit('stateChanged', state);
}

export function resetState() {
  state = createInitialStateInternal();
  emit('stateChanged', state);
}

export function migrateStateIfNeeded(st) {
  const preMigrateVersion = Number(st.meta?.version) || 0;
  if (!st.registry?.citizens?.length) {
    st.registry = JSON.parse(JSON.stringify(DEFAULT_REGISTRY));
  }
  if (!st.regulatory) {
    st.regulatory = { identityFineCount: 0, pendingFines: [], fineArrears: 0 };
  }
  st.regulatory.pendingFines = Array.isArray(st.regulatory.pendingFines)
    ? st.regulatory.pendingFines
    : [];
  if (!st.bankingTransactionLog) st.bankingTransactionLog = [];
  st.meta = st.meta || { version: 5 };
  if ((st.meta.version || 0) < 3) {
    st.meta.version = 3;
  }
  if (!st.player.actor_id) st.player.actor_id = 'ACT-PLAYER01';
  if ((st.meta.version || 0) < 4) {
    st.meta.version = 4;
    if (st.player && st.player.hardCash == null) st.player.hardCash = 0;
    if (!st.worldNetShopping) {
      st.worldNetShopping = {
        carts: {},
        inventory: [],
        orders: [],
        activeDeliveries: [],
        nextOrderSeq: 1
      };
    } else {
      st.worldNetShopping.carts = st.worldNetShopping.carts || {};
      st.worldNetShopping.inventory = Array.isArray(st.worldNetShopping.inventory)
        ? st.worldNetShopping.inventory
        : [];
      st.worldNetShopping.orders = Array.isArray(st.worldNetShopping.orders)
        ? st.worldNetShopping.orders
        : [];
      st.worldNetShopping.activeDeliveries = Array.isArray(st.worldNetShopping.activeDeliveries)
        ? st.worldNetShopping.activeDeliveries
        : [];
      if (st.worldNetShopping.nextOrderSeq == null) st.worldNetShopping.nextOrderSeq = 1;
    }
    if (!st.worldNetProductStock || typeof st.worldNetProductStock !== 'object') st.worldNetProductStock = {};
  }
  if ((st.meta.version || 0) < 5) {
    st.meta.version = 5;
    if (!st.contentRegistry) st.contentRegistry = createEmptyContentRegistry();
    ensureContentRegistry(st);
  } else {
    ensureContentRegistry(st);
  }
  if ((st.meta.version || 0) < 6) {
    st.meta.version = 6;
    if (!st.mediaPlayer || typeof st.mediaPlayer !== 'object') {
      st.mediaPlayer = {
        currentTrackId: null,
        positionSec: 0,
        volume: 0.8,
        shuffle: false,
        repeat: 'off',
        favorites: [],
        unlockedIds: []
      };
    } else {
      st.mediaPlayer.favorites = Array.isArray(st.mediaPlayer.favorites)
        ? st.mediaPlayer.favorites.map(String)
        : [];
      st.mediaPlayer.unlockedIds = Array.isArray(st.mediaPlayer.unlockedIds)
        ? st.mediaPlayer.unlockedIds.map(String)
        : [];
      if (st.mediaPlayer.volume == null) st.mediaPlayer.volume = 0.8;
      if (st.mediaPlayer.shuffle == null) st.mediaPlayer.shuffle = false;
      if (!st.mediaPlayer.repeat) st.mediaPlayer.repeat = 'off';
      if (!st.mediaPlayer.eq || typeof st.mediaPlayer.eq !== 'object') {
        st.mediaPlayer.eq = { bass: 50, mid: 50, treble: 50 };
      }
    }
    if (!st.virtualFs || typeof st.virtualFs !== 'object') {
      st.virtualFs = { entries: [], nextSeq: 1 };
    } else {
      st.virtualFs.entries = Array.isArray(st.virtualFs.entries) ? st.virtualFs.entries : [];
      if (st.virtualFs.nextSeq == null) st.virtualFs.nextSeq = 1;
    }
  }
  if (!st.software || typeof st.software !== 'object') {
    st.software = { installedAppIds: [], activeInstalls: [] };
  } else {
    st.software.installedAppIds = Array.isArray(st.software.installedAppIds)
      ? st.software.installedAppIds.filter((id) => isInstallableApp(id))
      : [];
    st.software.activeInstalls = Array.isArray(st.software.activeInstalls)
      ? st.software.activeInstalls.filter((x) => isInstallableApp(x?.appId))
      : [];
  }
  st.worldNetShopping = st.worldNetShopping || {
    carts: {},
    inventory: [],
    orders: [],
    activeDeliveries: [],
    nextOrderSeq: 1
  };
  st.worldNetShopping.activeDeliveries = Array.isArray(st.worldNetShopping.activeDeliveries)
    ? st.worldNetShopping.activeDeliveries
    : [];
  st.accounts = (st.accounts || []).filter((a) => a && a.id !== 'shootingmoon');
  if (!st.accounts.some((a) => a.id === 'davidmitchell')) {
    st.accounts.push({
      id: 'davidmitchell',
      name: 'David & Mitchell Banking',
      balance: 0,
      loanBalance: 0,
      accountNumber: null,
      accountType: 'personal_checking',
      transactions: [],
      loanDetail: null,
      memberSinceElapsedMs: null,
      meridianInterestWeekIndex: -1,
      onlineRegistered: false
    });
  }
  if (!st.player.ssnFull && st.player.ssnSuffix) {
    st.player.ssnFull = `000-00-${st.player.ssnSuffix}`;
  }
  for (const a of st.accounts || []) {
    if (a.onlineRegistered && !a.enrolledProfile) {
      const p = st.player;
      const digits = String(p.ssnFull || '').replace(/\D/g, '');
      a.enrolledProfile = {
        legalName: p.displayName,
        dob: p.dob,
        ssnDigits: digits.length === 9 ? digits : `00000${p.ssnSuffix || ''}`.slice(-9),
        address: p.address,
        phone: p.phone,
        email: p.email,
        employmentStatus: '',
        employerName: '',
        annualIncome: 0,
        idType: '',
        idNumber: '',
        motherMaiden: '',
        enrolledAtElapsedMs: st.sim?.elapsedMs || 0
      };
      if (!a.enrolledUserId) a.enrolledUserId = p.username;
    }
    ensureAccountBankingFields(a, st);
    if (a.enrolledPassword == null && a.enrolledPin != null && a.enrolledPin !== '') {
      a.enrolledPassword = a.enrolledPin;
    }
  }
  const ply = st.registry.citizens.find((c) => c.kind === 'player');
  if (ply && st.player.ssnFull && normalizeSsnDigitsLocal(st.player.ssnFull)) {
    ply.ssnFull = st.player.ssnFull;
    ply.displayName = st.player.displayName;
    ply.dob = st.player.dob;
  }
  if (!st.mediaPlayer || typeof st.mediaPlayer !== 'object') {
    st.mediaPlayer = {
      currentTrackId: null,
      positionSec: 0,
      volume: 0.8,
      shuffle: false,
      repeat: 'off',
      favorites: [],
      unlockedIds: [],
      eq: { bass: 50, mid: 50, treble: 50 },
      vizMode: 'bars'
    };
  }
  st.mediaPlayer.favorites = Array.isArray(st.mediaPlayer.favorites)
    ? st.mediaPlayer.favorites.map(String)
    : [];
  st.mediaPlayer.unlockedIds = Array.isArray(st.mediaPlayer.unlockedIds)
    ? st.mediaPlayer.unlockedIds.map(String)
    : [];
  if (st.mediaPlayer.volume == null) st.mediaPlayer.volume = 0.8;
  if (st.mediaPlayer.shuffle == null) st.mediaPlayer.shuffle = false;
  if (!st.mediaPlayer.repeat) st.mediaPlayer.repeat = 'off';
  if (!st.mediaPlayer.eq || typeof st.mediaPlayer.eq !== 'object') {
    st.mediaPlayer.eq = { bass: 50, mid: 50, treble: 50 };
  }
  if (!st.virtualFs || typeof st.virtualFs !== 'object') {
    st.virtualFs = { entries: [], nextSeq: 1 };
  }
  st.virtualFs.entries = Array.isArray(st.virtualFs.entries) ? st.virtualFs.entries : [];
  if (st.virtualFs.nextSeq == null) st.virtualFs.nextSeq = 1;
  if ((st.meta.version || 0) < 7) {
    st.meta.version = 7;
    if (!st.software || typeof st.software !== 'object') {
      st.software = { installedAppIds: [], activeInstalls: [] };
    }
    st.software.installedAppIds = Array.isArray(st.software.installedAppIds)
      ? st.software.installedAppIds.filter((id) => isInstallableApp(id))
      : [];
    if (
      preMigrateVersion >= 1 &&
      preMigrateVersion <= 6 &&
      !st.software.installedAppIds.includes('media-player')
    ) {
      st.software.installedAppIds.push('media-player');
    }
  }
  if ((st.meta.version || 0) < 8) {
    st.meta.version = 8;
    if (st.mediaPlayer && typeof st.mediaPlayer === 'object' && !st.mediaPlayer.eq) {
      st.mediaPlayer.eq = { bass: 50, mid: 50, treble: 50 };
    }
  }
  if ((st.meta.version || 0) < 9) {
    st.meta.version = 9;
    if (st.mediaPlayer && typeof st.mediaPlayer === 'object' && st.mediaPlayer.vizMode == null) {
      st.mediaPlayer.vizMode = 'bars';
    }
  }
  if (st.mediaPlayer && typeof st.mediaPlayer === 'object') {
    if (!st.mediaPlayer.eq || typeof st.mediaPlayer.eq !== 'object') {
      st.mediaPlayer.eq = { bass: 50, mid: 50, treble: 50 };
    } else {
      for (const k of ['bass', 'mid', 'treble']) {
        const v = Number(st.mediaPlayer.eq[k]);
        st.mediaPlayer.eq[k] = Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : 50;
      }
    }
    const vm = String(st.mediaPlayer.vizMode || 'bars');
    const okViz = ['bars', 'waveform', 'scope', 'matrix', 'radar'];
    st.mediaPlayer.vizMode = okViz.includes(vm) ? vm : 'bars';
  }
  if ((st.meta.version || 0) < 10) {
    st.meta.version = 10;
    const p = st.player;
    if (p.corposEnrollmentComplete == null) {
      const hadSsn = p.ssnFull && String(p.ssnFull).replace(/\D/g, '').length === 9;
      p.corposEnrollmentComplete = !!hadSsn;
    }
    if (p.firstName == null) p.firstName = '';
    if (p.lastName == null) p.lastName = '';
    if (p.password == null) p.password = '';
    if (p.sex == null) p.sex = '';
    if (p.race == null) p.race = '';
    if (p.heightInches == null) p.heightInches = 0;
    if (p.hargroveAddressId == null) p.hargroveAddressId = null;
    if (p.corposEnrollmentCompletedAtSimMs == null) p.corposEnrollmentCompletedAtSimMs = null;
    if (p.identityViolationAttemptCount == null) p.identityViolationAttemptCount = 0;
    if (p.osFailedLoginCount == null) p.osFailedLoginCount = 0;
    if (p.licenseTerminated == null) p.licenseTerminated = false;
    if (p.terminationReason == null) p.terminationReason = '';
    if (p.firstJeemailAccount == null) p.firstJeemailAccount = null;
    if (p.irsNoticeAcknowledged == null) p.irsNoticeAcknowledged = false;
  }
  if ((st.meta.version || 0) < 11) {
    st.meta.version = 11;
    const p = st.player;
    if (p.momActorId == null) p.momActorId = null;
    if (!Array.isArray(p.blackCherryContacts)) p.blackCherryContacts = [];
    if (!Array.isArray(p.relationships)) p.relationships = [];
    if (!Array.isArray(p.cashUpTransactions)) p.cashUpTransactions = [];
    if (!st.smsThreads || typeof st.smsThreads !== 'object') st.smsThreads = {};
  }
  if ((st.meta.version || 0) < 12) {
    st.meta.version = 12;
    if (st.player.acumen == null) st.player.acumen = 10;
    if (!Array.isArray(st.player.webExProjects)) st.player.webExProjects = [];
    if (!st.warehouse) st.warehouse = { units: [], liquidation: [] };
    if (!st.marketBuzz || typeof st.marketBuzz !== 'object') st.marketBuzz = {};
  }
  if ((st.meta.version || 0) < 13) {
    st.meta.version = 13;
    if (!Array.isArray(st.player.webExStockroom)) st.player.webExStockroom = [];
    for (const p of st.player.webExProjects || []) {
      if (!Array.isArray(p.websiteInventory)) p.websiteInventory = [];
    }
  }
  if ((st.meta.version || 0) < 14) {
    st.meta.version = 14;
    if (!Array.isArray(st.player.webExDomainSubscriptions)) st.player.webExDomainSubscriptions = [];
    for (const p of st.player.webExProjects || []) {
      if (p.domainTld == null) p.domainTld = '.net';
      if (p.domainSlug == null) p.domainSlug = '';
      if (p.titleFontId == null) p.titleFontId = 'tahoma';
      if (p.titleSizePx == null) p.titleSizePx = 12;
      if (!p.slotModuleData || typeof p.slotModuleData !== 'object') p.slotModuleData = {};
      if (p.lastPublishedHost == null) p.lastPublishedHost = null;
    }
  }
  if (!st.smsThreads || typeof st.smsThreads !== 'object') st.smsThreads = {};
  if (!Array.isArray(st.player.cashUpTransactions)) st.player.cashUpTransactions = [];
  if (!Array.isArray(st.player.blackCherryContacts)) st.player.blackCherryContacts = [];
  if (!Array.isArray(st.player.relationships)) st.player.relationships = [];
  if (!st.businessRegistry || typeof st.businessRegistry !== 'object') {
    st.businessRegistry = { applications: [], lastFilingDayIndex: -1, filingsCountOnThatDay: 0 };
  }
  st.businessRegistry.applications = Array.isArray(st.businessRegistry.applications)
    ? st.businessRegistry.applications
    : [];
  if (st.businessRegistry.lastFilingDayIndex == null) st.businessRegistry.lastFilingDayIndex = -1;
  if (st.businessRegistry.filingsCountOnThatDay == null) st.businessRegistry.filingsCountOnThatDay = 0;
  return st;
}

function normalizeSsnDigitsLocal(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length === 9 ? d : null;
}

export function nextIdentityFineAmount(st) {
  const n = st.regulatory?.identityFineCount || 0;
  return 5000 * 2 ** n;
}

function levyFineFromAccounts(st, amount) {
  let due = Math.round(amount);
  const order = ['fncb', 'meridian', 'harbor', 'pacific', 'darkweb', 'davidmitchell'];
  for (const id of order) {
    if (due < 1) break;
    const a = st.accounts.find((x) => x.id === id);
    if (!a) continue;
    const bal = Math.max(0, a.balance || 0);
    const take = Math.min(bal, due);
    a.balance = bal - take;
    due -= take;
  }
  if (due > 0) {
    st.regulatory.fineArrears = (st.regulatory.fineArrears || 0) + due;
  }
  const co = st.companies?.[0];
  if (co) {
    co.notoriety = Math.min(200, (co.notoriety || 0) + 12);
    co.judicialEntries = (co.judicialEntries || 0) + 1;
  }
}

/** After each in-game day change: levy due penalties, emit state. Returns toast lines. */
export function applyDueRegulatoryFinesPatch() {
  if (!state.regulatory?.pendingFines?.length) return [];
  const now = state.sim.elapsedMs;
  if (!state.regulatory.pendingFines.some((p) => now >= p.dueElapsedMs)) return [];
  const messages = [];
  patchState((st) => {
    const keep = [];
    for (const p of st.regulatory.pendingFines) {
      if (st.sim.elapsedMs < p.dueElapsedMs) {
        keep.push(p);
        continue;
      }
      const amt = nextIdentityFineAmount(st);
      levyFineFromAccounts(st, amt);
      st.regulatory.identityFineCount = (st.regulatory.identityFineCount || 0) + 1;
      const title = p.violation === 'misrepresentation' ? 'Misrepresentation' : 'False Identification';
      messages.push(
        `Federal Notice — ${title}: administrative penalty ${formatMoney(amt)} levied (bank ref: ${p.bankId}). Verification period elapsed.`
      );
    }
    st.regulatory.pendingFines = keep;
    return st;
  });
  return messages;
}

export function scheduleEnrollmentViolation(st, bankId, violation, delayDays = 2) {
  const SIM_DAY_MS = 86400000;
  st.regulatory.pendingFines.push({
    bankId,
    violation,
    dueElapsedMs: st.sim.elapsedMs + delayDays * SIM_DAY_MS,
    delayDays,
    scheduledAt: st.sim.elapsedMs
  });
}

export function formatMoney(n) {
  return (
    '$' +
    Number(n).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

export function getPrimaryCheckingBalance(stateObj = state) {
  const a = stateObj.accounts.find((x) => x.id === 'fncb');
  return a ? a.balance : 0;
}

export function getNetWorth(stateObj = state) {
  const cash = stateObj.accounts.reduce((s, x) => s + (x.balance || 0), 0);
  const debt = stateObj.accounts.reduce((s, x) => s + (x.loanBalance || 0), 0);
  return Math.max(0, cash - debt);
}

/** Call on sim calendar day rollover; accrues savings interest for each sim week crossed. */
export function applyMeridianSavingsInterestIfNeeded(st) {
  const a = st.accounts?.find((x) => x.id === 'meridian');
  if (!a || !a.onlineRegistered || a.accountType !== 'personal_savings') return;
  const apy = BANK_RULES.meridian?.savingsApyPercent;
  if (apy == null || apy <= 0) return;
  const wi = Math.floor((st.sim?.elapsedMs ?? 0) / SIM_WEEK_MS);
  let prev = a.meridianInterestWeekIndex ?? -1;
  const weeklyRate = apy / 100 / 52;
  while (prev < wi) {
    const bal = Math.max(0, a.balance || 0);
    const interest = Math.floor(bal * weeklyRate * 100) / 100;
    if (interest > 0) {
      a.balance = bal + interest;
      const txs = Array.isArray(a.transactions) ? a.transactions : [];
      txs.unshift({
        simElapsedMs: st.sim.elapsedMs,
        type: 'interest',
        amount: interest,
        balanceAfter: a.balance,
        description: `Savings interest (${apy}% APY, weekly post)`,
        complianceFlag: false
      });
      a.transactions = txs.slice(0, 10);
      appendBankingTransaction(st, {
        bankName: a.name,
        accountNumber: a.accountNumber,
        type: 'interest',
        amount: interest,
        complianceFlag: false,
        description: 'Meridian savings weekly interest'
      });
    }
    prev += 1;
    a.meridianInterestWeekIndex = prev;
  }
}

export function notorietyLabel(pct) {
  if (pct >= 200) return 'Federal Target';
  if (pct >= 175) return 'Priority Target';
  if (pct >= 150) return 'Federal Interest';
  if (pct >= 125) return 'High-Risk Entity';
  if (pct >= 100) return 'Under Investigation';
  if (pct >= 75) return 'Under Review';
  if (pct >= 50) return 'Non-Compliant';
  if (pct >= 25) return 'Minor Irregularities';
  return 'Exemplary';
}

export function exposureLabel(pct) {
  if (pct >= 86) return 'Active Investigation';
  if (pct >= 71) return 'Under Audit';
  if (pct >= 56) return 'Formal Inquiry';
  if (pct >= 41) return 'Monitored';
  if (pct >= 26) return 'Flagged';
  if (pct >= 11) return 'On Record';
  return 'Under the Radar';
}

/**
 * Advance WorldNet shopping deliveries; call on sim tick.
 * @returns {{ text: string }[]} SMS payloads for Black Cherry (one per completed delivery).
 */
export function processWorldNetDeliveriesIfNeeded() {
  const sms = [];
  const now = state.sim?.elapsedMs ?? 0;
  patchState((st) => {
    const w = st.worldNetShopping;
    if (!w || !w.activeDeliveries?.length) return st;
    const keep = [];
    for (const d of w.activeDeliveries) {
      if (d.phase === 'ending') {
        if ((d.endCompleteAtSimMs ?? 0) > now) keep.push(d);
        continue;
      }
      if (d.deliverBySimMs > now) {
        keep.push(d);
        continue;
      }
      for (const inv of w.inventory) {
        if (inv.orderId === d.orderId && inv.deliveryStatus === 'pending') {
          inv.deliveryStatus = 'delivered';
          inv.deliveredAtSimMs = now;
        }
      }
      sms.push({ text: `Your order from ${d.storeName} has arrived.` });
    }
    w.activeDeliveries = keep;
    return st;
  });
  return sms;
}

export function isAppInstalled(appId, stateObj = state) {
  return !!stateObj.software?.installedAppIds?.includes(String(appId || ''));
}

function randomDurationMs(minSeconds, maxSeconds) {
  const min = Math.max(1, Math.floor(Number(minSeconds) || 1));
  const max = Math.max(min, Math.floor(Number(maxSeconds) || min));
  const seconds = Math.floor(Math.random() * (max - min + 1)) + min;
  return seconds * 1000;
}

export function getInstallStatus(appId, stateObj = state) {
  const id = String(appId || '');
  if (!isInstallableApp(id)) return { state: 'unknown', appId: id };
  if (isAppInstalled(id, stateObj)) return { state: 'installed', appId: id };
  const queued = stateObj.software?.activeInstalls?.find((x) => x.appId === id);
  if (queued) {
    const now = stateObj.sim?.elapsedMs ?? 0;
    const downloadTotal = Math.max(1, Number(queued.downloadDurationMs) || 1);
    const installTotal = Math.max(1, Number(queued.installDurationMs) || 1);
    const queuedAt = Number(queued.queuedAtSimMs) || 0;
    const downloadEnd = Number(queued.downloadCompleteAtSimMs) || queuedAt + downloadTotal;
    const installEnd = Number(queued.installCompleteAtSimMs) || downloadEnd + installTotal;
    const phase = queued.phase || (now < downloadEnd ? 'downloading' : 'installing');
    const downloadProgress =
      phase === 'aborting'
        ? Math.min(1, Math.max(0, Number(queued.downloadProgressAtAbort) || 0))
        : Math.min(1, Math.max(0, (now - queuedAt) / downloadTotal));
    const installProgress =
      phase === 'aborting'
        ? Math.min(1, Math.max(0, Number(queued.installProgressAtAbort) || 0))
        : Math.min(1, Math.max(0, (now - downloadEnd) / installTotal));
    const abortStart = Number(queued.abortStartedAtSimMs) || now;
    const abortDuration = Math.max(1, Number(queued.abortDurationMs) || 1);
    const abortEnd = Number(queued.abortCompleteAtSimMs) || abortStart + abortDuration;
    const progress =
      phase === 'downloading'
        ? downloadProgress
        : phase === 'installing'
        ? installProgress
        : Math.min(1, Math.max(0, (now - abortStart) / abortDuration));
    const totalProgress = Math.min(1, Math.max(0, (now - queuedAt) / (downloadTotal + installTotal)));
    return {
      state: phase,
      appId: id,
      queued,
      progress,
      totalProgress,
      downloadProgress,
      installProgress,
      abortRemainingMs: Math.max(0, abortEnd - now)
    };
  }
  return { state: 'available', appId: id };
}

export function queueSoftwareInstall(appId) {
  const app = getInstallableApp(appId);
  if (!app) return { ok: false, reason: 'unknown_app', message: 'Unknown software package.' };
  const status = getInstallStatus(appId);
  if (status.state === 'installed') {
    return { ok: false, reason: 'installed', message: `${app.label} is already installed.` };
  }
  if (status.state === 'downloading' || status.state === 'installing') {
    return { ok: false, reason: 'installing', message: `${app.label} is already installing.` };
  }
  if (status.state === 'aborting') {
    return { ok: false, reason: 'aborting', message: `${app.label} is aborting its current transfer.` };
  }
  const price = getSoftwarePurchasePriceUsd(app);
  if (price > 0) {
    const stCheck = getState();
    const fncb = stCheck.accounts?.find((a) => a.id === 'fncb');
    const bal = Number(fncb?.balance ?? 0);
    if (!fncb || bal < price) {
      return {
        ok: false,
        reason: 'insufficient_funds',
        message: `Insufficient funds in ${fncb?.name || 'FNCB'}. ${app.label} costs $${price.toFixed(
          2
        )}.`
      };
    }
  }
  const now = getState().sim?.elapsedMs ?? 0;
  patchState((st) => {
    if (price > 0) {
      const a = st.accounts?.find((x) => x.id === 'fncb');
      if (a) {
        a.balance = Math.round((Number(a.balance || 0) - price) * 100) / 100;
        appendBankingTransaction(st, {
          bankName: a.name,
          accountNumber: a.accountNumber,
          type: 'purchase',
          amount: -price,
          description: `devtools.net — ${app.label}`
        });
      }
    }
    st.software.activeInstalls.push({
      appId: app.id,
      phase: 'downloading',
      queuedAtSimMs: now,
      downloadDurationMs: app.downloadDurationMs,
      installDurationMs: app.installDurationMs,
      downloadCompleteAtSimMs: now + app.downloadDurationMs,
      installCompleteAtSimMs: now + app.downloadDurationMs + app.installDurationMs,
      sourceHost: app.sourceHost
    });
    return st;
  });
  return { ok: true, app };
}

export function cancelSoftwareInstall(appId) {
  const status = getInstallStatus(appId);
  if (status.state !== 'downloading' && status.state !== 'installing') {
    return { ok: false, message: 'No active software transfer found.' };
  }
  if ((status.totalProgress || 0) >= 0.75) {
    return { ok: false, message: 'Cancellation locked by Safelock Installation Threshold.' };
  }
  const now = getState().sim?.elapsedMs ?? 0;
  const abortDurationMs = Math.random() < 0.5 ? 3000 : 5000;
  patchState((st) => {
    st.software.activeInstalls = st.software.activeInstalls.map((job) =>
      job.appId !== appId
        ? job
        : {
            ...job,
            phase: 'aborting',
            abortStartedAtSimMs: now,
            abortDurationMs,
            abortCompleteAtSimMs: now + abortDurationMs,
            downloadProgressAtAbort: status.downloadProgress || 0,
            installProgressAtAbort: status.installProgress || 0
          }
    );
    return st;
  });
  return { ok: true, message: 'Aborting software transfer...', abortDurationMs };
}

export function killSoftwareInstall(appId) {
  const status = getInstallStatus(appId);
  if (status.state !== 'downloading' && status.state !== 'installing' && status.state !== 'aborting') {
    return { ok: false, message: 'No active software transfer found.' };
  }
  patchState((st) => {
    st.software.activeInstalls = st.software.activeInstalls.filter((x) => x.appId !== appId);
    return st;
  });
  return { ok: true, message: 'Software transfer terminated.' };
}

export function endDeliveryTask(deliveryId) {
  const id = String(deliveryId || '');
  const delivery = state.worldNetShopping?.activeDeliveries?.find((x) => x.id === id);
  if (!delivery) return { ok: false, message: 'Background task not found.' };
  if (delivery.phase === 'ending') {
    return { ok: false, message: 'Task is already ending.' };
  }
  const durationMs = randomDurationMs(3, 7);
  const now = state.sim?.elapsedMs ?? 0;
  patchState((st) => {
    st.worldNetShopping.activeDeliveries = (st.worldNetShopping.activeDeliveries || []).map((item) =>
      item.id !== id
        ? item
        : {
            ...item,
            phase: 'ending',
            endingStartedAtSimMs: now,
            endDurationMs: durationMs,
            endCompleteAtSimMs: now + durationMs
          }
    );
    return st;
  });
  return { ok: true, message: 'Ending task...', durationMs };
}

export function killDeliveryTask(deliveryId) {
  const id = String(deliveryId || '');
  const delivery = state.worldNetShopping?.activeDeliveries?.find((x) => x.id === id);
  if (!delivery) return { ok: false, message: 'Background task not found.' };
  patchState((st) => {
    st.worldNetShopping.activeDeliveries = (st.worldNetShopping.activeDeliveries || []).filter(
      (item) => item.id !== id
    );
    return st;
  });
  return { ok: true, message: 'Task terminated.' };
}

export function listBackgroundTasks(stateObj = state) {
  const now = stateObj.sim?.elapsedMs ?? 0;
  const installs = (stateObj.software?.activeInstalls || []).map((job) => {
    const status = getInstallStatus(job.appId, stateObj);
    const app = getInstallableApp(job.appId);
    return {
      id: `install:${job.appId}`,
      taskType: 'install',
      targetId: job.appId,
      icon: app?.icon || '💾',
      label: app?.label || job.appId,
      category: 'Background Transfer',
      status: status.state === 'aborting' ? 'Aborting' : status.state === 'installing' ? 'Installing' : 'Downloading',
      progress:
        status.state === 'aborting'
          ? 100 - Math.max(0, Math.min(100, Math.ceil((status.abortRemainingMs || 0) / 50)))
          : Math.round((status.totalProgress || 0) * 100),
      detail: app?.sourceHost || 'WorldNet',
      canEnd: status.state === 'downloading' || status.state === 'installing',
      canKill: true
    };
  });
  const deliveries = (stateObj.worldNetShopping?.activeDeliveries || []).map((job) => {
    const durationMs = Math.max(1, Number(job.endDurationMs) || 1);
    const endingProgress =
      job.phase === 'ending'
        ? Math.round(
            Math.min(1, Math.max(0, (now - (Number(job.endingStartedAtSimMs) || now)) / durationMs)) * 100
          )
        : 0;
    return {
      id: `delivery:${job.id}`,
      taskType: 'delivery',
      targetId: job.id,
      icon: '📦',
      label: job.title || 'WorldNet delivery',
      category: 'Background Delivery',
      status: job.phase === 'ending' ? 'Ending Task' : 'Queued',
      progress: endingProgress,
      detail: job.storeName || job.orderId || '',
      canEnd: job.phase !== 'ending',
      canKill: true
    };
  });
  return [...installs, ...deliveries];
}

export function processSoftwareInstallsIfNeeded() {
  const completed = [];
  const now = state.sim?.elapsedMs ?? 0;
  if (
    !state.software?.activeInstalls?.some(
      (job) =>
        (job.phase === 'aborting' && (job.abortCompleteAtSimMs ?? 0) <= now) ||
        (job.downloadCompleteAtSimMs ?? 0) <= now ||
        (job.installCompleteAtSimMs ?? 0) <= now
    )
  ) {
    return completed;
  }
  patchState((st) => {
    const software = st.software;
    if (!software?.activeInstalls?.length) return st;
    const keep = [];
    for (const job of software.activeInstalls) {
      if (job.phase === 'aborting') {
        if ((job.abortCompleteAtSimMs ?? 0) > now) {
          keep.push(job);
        }
        continue;
      }
      if ((job.downloadCompleteAtSimMs ?? 0) <= now && job.phase === 'downloading') {
        job.phase = 'installing';
      }
      if ((job.installCompleteAtSimMs ?? 0) > now) {
        keep.push(job);
        continue;
      }
      const app = getInstallableApp(job.appId);
      if (app && !software.installedAppIds.includes(app.id)) {
        software.installedAppIds.push(app.id);
        completed.push(app);
      }
    }
    software.activeInstalls = keep;
    return st;
  });
  return completed;
}
