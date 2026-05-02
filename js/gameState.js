import { emit } from './events.js';
import {
  PACIFIC_UNLOCK_DAYS,
  PACIFIC_UNLOCK_NET_WORTH,
  BANK_RULES,
  SIM_WEEK_MS
} from './bank-config.js';
import { createEmptyContentRegistry, ensureContentRegistry } from './content-registry-defaults.js';
import {
  getInstallableApp,
  getSoftwarePurchasePriceUsd,
  isInstallableApp
} from './installable-apps.js';
import { createDefaultWorldNetState } from './worldnet-sites-registry.js';

const GAME_EPOCH_UTC_MS = Date.UTC(2000, 0, 1, 6, 0, 0, 0);

/** One in-game day in simulated milliseconds (re-exported for modules that already import game state). */
export const SIM_DAY_MS = 86400000;

export function ensureWebsiteStats(pageEntry) {
  if (!pageEntry.stats) {
    pageEntry.stats = {
      health:       100,
      traffic:      Math.floor(20 + Math.random() * 80),
      reputation:   Math.floor(30 + Math.random() * 70),
      security:     Math.floor(10 + Math.random() * 60),
      uptime:       100,
      lastAttacked: null,
      attackLog:    [],
    };
  }
  return pageEntry;
}

export function migrateWebsiteStats(st) {
  if (!st.contentRegistry?.pages) return st;
  for (const p of st.contentRegistry.pages) {
    ensureWebsiteStats(p);
  }
  return st;
}

/**
 * Append to a published page's integration log (visitor activity, etc.).
 * @param {string} pageId
 * @param {object} entry
 */
export function siteIntegrationLog(pageId, entry) {
  patchState((st) => {
    const page = (st.contentRegistry?.pages || []).find((p) => p.pageId === pageId);
    if (!page) return st;
    page.integrationLog = page.integrationLog || [];
    page.integrationLog.push(entry);
    if (page.integrationLog.length > 100) {
      page.integrationLog = page.integrationLog.slice(-100);
    }
    return st;
  });
}

/**
 * Append a guestbook entry (player or NPC). One sign per actor per in-game day.
 * @param {string} pageId
 * @param {object} entry
 */
export function siteGuestbookAppend(pageId, entry) {
  patchState((st) => {
    const page = (st.contentRegistry?.pages || []).find((p) => p.pageId === pageId);
    if (!page) return st;
    const today = Math.floor((st.sim?.elapsedMs || 0) / 86400000);
    page.guestbook = page.guestbook || [];
    const alreadyToday = page.guestbook.some(
      (e) => e.actorId === entry.actorId && e.dayIndex === today
    );
    if (!alreadyToday) {
      page.guestbook.push({ ...entry, dayIndex: today });
      if (page.guestbook.length > 200) page.guestbook.shift();
    }
    return st;
  });
}

export function getWebsiteContract(st) {
  return st?.websiteContract || null;
}

export function hasActiveWebsiteContract(st) {
  return !!(st?.websiteContract?.active);
}

export function setWebsiteContract(contractData) {
  patchState((st) => {
    st.websiteContract = {
      active: true,
      contractId: contractData.contractId ?? null,
      companyId: contractData.companyId ?? null,
      companyName: contractData.companyName ?? 'Unknown Client',
      requirements: contractData.requirements ?? null,
      reward: Number(contractData.reward) || 0,
      breachFee: Number(contractData.breachFee) || 0,
      startSimMs: contractData.startSimMs ?? 0,
      deadlineSimMs: contractData.deadlineSimMs ?? 0,
    };
    return st;
  });
}

export function clearWebsiteContract() {
  patchState((st) => {
    st.websiteContract = {
      active: false,
      contractId: null,
      companyId: null,
      companyName: null,
      requirements: null,
      reward: 0,
      breachFee: 0,
      startSimMs: 0,
      deadlineSimMs: 0,
    };
    return st;
  });
}

export function transferSiteToCompany(pageId, companyId, companyName) {
  patchState((st) => {
    const page = (st.contentRegistry?.pages || []).find((p) => p.pageId === pageId);
    if (!page) return st;

    page.ownedByCompany = companyId;
    page.ownedByName = companyName;
    page.transferredAt = st.sim?.elapsedMs || 0;
    page.playerOwned = false;

    const owningProj = (st.player?.webExProjects || []).find((p) => p.publishedPageId === pageId);
    if (owningProj && Array.isArray(st.player.webExDomainSubscriptions)) {
      st.player.webExDomainSubscriptions = st.player.webExDomainSubscriptions.filter(
        (sub) => sub.projectId !== owningProj.id
      );
    }

    const company = (st.companies || []).find((c) => c.id === companyId || c.actor_id === companyId);
    if (company) {
      company.assets = company.assets || [];
      company.assets.push({
        type: 'website',
        pageId,
        url: page.url,
        title: page.title,
        acquiredAt: st.sim?.elapsedMs || 0,
        source: 'contract_delivery',
      });
    }

    return st;
  });
}

export function cancelWebsiteContractTask(taskId) {
  let cleared = false;
  patchState((st) => {
    if (!Array.isArray(st.activeTasks)) st.activeTasks = [];
    st.activeTasks = st.activeTasks.filter((t) => t.id !== taskId);
    const wc = st.websiteContract;
    if (wc?.active && wc.contractId === taskId) {
      cleared = true;
      st.websiteContract = {
        active: false,
        contractId: null,
        companyId: null,
        companyName: null,
        requirements: null,
        reward: 0,
        breachFee: 0,
        startSimMs: 0,
        deadlineSimMs: 0,
      };
    }
    return st;
  });
  return { ok: true, message: cleared ? 'Website contract cancelled.' : 'Task removed.' };
}

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
  const row = {
    simTimestampMs: st.sim?.elapsedMs ?? 0,
    bankName: entry.bankName,
    accountNumber: entry.accountNumber,
    type: entry.type,
    amount: entry.amount,
    destinationAccountNumber: entry.destinationAccountNumber ?? null,
    destinationBank: entry.destinationBank ?? null,
    complianceFlag: !!entry.complianceFlag,
    description: entry.description ?? ''
  };
  st.bankingTransactionLog.push(row);
  if (typeof window !== 'undefined') {
    const gameTime = st.sim?.elapsedMs ?? 0;
    queueMicrotask(() => {
      import('./bc-sms.js')
        .then((m) => m.smsBankingAlert(row, gameTime))
        .catch(() => {});
    });
  }
  if (typeof window !== 'undefined' && window.SaveManager?.save) {
    queueMicrotask(() => {
      try {
        window.SaveManager.save();
      } catch {
        /* ignore */
      }
    });
  }
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
    meta: { version: 34 },
    sim: { elapsedMs: 0, speed: 1 },
    player: {
      actor_id: 'ACT-PLAYER01',
      firstName: '',
      lastName: '',
      displayName: '',
      username: '',
      password: '',
      passwordHash: '',
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
      pendingSmsEvents: [],
      lastActiveWebExProjectId: null,
      assetDiscardDays: [],
      assetLitterNewsDayIndex: null,
      assetLitterSevereDayIndex: null,
      worldSeed: null,
      exploredDistricts: [1]
    },
    websiteContract: {
      active: false,
      contractId: null,
      companyId: null,
      companyName: null,
      requirements: null,
      reward: 0,
      breachFee: 0,
      startSimMs: 0,
      deadlineSimMs: 0,
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
    rivalCompanies: [],
    rivalProducts: [],
    districtManifest: null,
    /** World-news items for Herald ticker + reaction systems */
    newsRegistry: [],
    corporateProfile: {
      notoriety: 0,
      reputation: 0,
      exposure: 0,
      judicialRecord: [],
      investigatorTier: 0,
      investigatorTierAdvanceEarliestSimMs: 0,
      assignedInvestigatorId: null,
      lastAuditSimMs: 0,
      auditCount: 0
    },
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
      volume: 0.2,
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
    /** Self-storage: units, liquidation, optional insurance map, inter-unit transfer queue. */
    warehouse: { units: [], liquidation: [], insurance: {}, transfers: [], properties: [], lastVaultAuctionSimMs: 0 },
    /** Player item inventory (carried) + manifest; includes shop purchases. */
    playerInventory: { items: [], manifest: [], totalValue: 0 },
    /** Product hashtag tracking: tag -> { mentions, likes, dislikes, purchaseCountWindow, lastPurchaseSimMs, shortage? } */
    marketBuzz: {},
    economy: {
      inflationRate: 0.031,
      unemploymentRate: 0.04,
      gdpIndex: 100,
      consumerConfidence: 72,
      dotComBubble: 'peak',
      hargroveGdp: 2_400_000_000,
      totalTransactionVolume: 0,
      transactionLog: [],
      lastInflationAdjustMs: 0,
      npcPurchaseLog: [],
      priceIndex: {}
    },
    /** CCR — Contacts, Contracts & Relations. */
    ccr: { contracts: [], newsFeed: [], nextSeq: 1 },
    /** Background jobs (site repair, etc.) — processed on tick. */
    activeTasks: [],
    /** Global ad performance analytics: impressions, clicks, conversions, irritation per ad. */
    adAnalytics: { byAdId: {} },
    /** Saved-the-cookies.org petition submissions (satire phishing). */
    cookiePetitionData: [],
    quarryHeartsDonor: false,
    /** Combat — DataMiner intel keys targetId → { dcBonus, lastUpdated, opType? } */
    dataMinerDossiers: {},
    /** Combat — delayed operations (e.g. Compliance Cannon) */
    pendingCombatEffects: [],
    /** Combat suites — cooldown keys → sim-ms when cooldown ends */
    combatCooldowns: {},
    /** WorldNet expansion — form logs, visit counters, directory seed */
    worldnet: createDefaultWorldNetState(),
    /** Public sentiment — product ratings, popularity, herald engagement, syndicated comments */
    publicPulse: {
      products: {},
      herald: { articles: {}, playerVote: {} },
      syndicatedComments: []
    }
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
        volume: 0.2,
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
      if (st.mediaPlayer.volume == null) st.mediaPlayer.volume = 0.2;
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
  if (!Array.isArray(st.cookiePetitionData)) st.cookiePetitionData = [];
  if (st.quarryHeartsDonor == null) st.quarryHeartsDonor = false;
  if (!st.combatCooldowns || typeof st.combatCooldowns !== 'object') st.combatCooldowns = {};
  if (!st.dataMinerDossiers || typeof st.dataMinerDossiers !== 'object') st.dataMinerDossiers = {};
  if (!Array.isArray(st.pendingCombatEffects)) st.pendingCombatEffects = [];
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
      volume: 0.2,
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
  if (st.mediaPlayer.volume == null) st.mediaPlayer.volume = 0.2;
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
  if ((st.meta.version || 0) < 15) {
    st.meta.version = 15;
    if (!Array.isArray(st.player.pendingSmsEvents)) st.player.pendingSmsEvents = [];
  }
  if ((st.meta.version || 0) < 16) {
    st.meta.version = 16;
    const p = st.player;
    if (p && (p.operatorId == null || p.operatorId === '')) {
      const u = String(p.username || '').trim();
      let suf = '0000';
      if (u) {
        let h = 0;
        for (let i = 0; i < u.length; i++) h = ((h << 5) - h + u.charCodeAt(i)) | 0;
        suf = String(Math.abs(h) % 10000).padStart(4, '0');
      } else {
        suf = String(Math.floor(1000 + Math.random() * 9000));
      }
      p.operatorId = `00-2000-${suf}`;
    }
  }
  if ((st.meta.version || 0) < 17) {
    st.meta.version = 17;
    if (!st.ccr || typeof st.ccr !== 'object') {
      st.ccr = { contracts: [], newsFeed: [], nextSeq: 1 };
    }
    st.ccr.contracts = Array.isArray(st.ccr.contracts) ? st.ccr.contracts : [];
    st.ccr.newsFeed = Array.isArray(st.ccr.newsFeed) ? st.ccr.newsFeed : [];
    if (st.ccr.nextSeq == null) st.ccr.nextSeq = 1;
  }
  if ((st.meta.version || 0) < 18) {
    st.meta.version = 18;
    if (!Array.isArray(st.completedEvents)) st.completedEvents = [];
    if (!st.corporateProfile || typeof st.corporateProfile !== 'object') {
      st.corporateProfile = { notoriety: 0, reputation: 0 };
    }
    if (st.corporateProfile.notoriety == null) st.corporateProfile.notoriety = 0;
    if (st.corporateProfile.reputation == null) st.corporateProfile.reputation = 0;
    if (!st.eventSystem || typeof st.eventSystem !== 'object') {
      st.eventSystem = { intervalLastFired: {} };
    }
    if (!st.eventSystem.intervalLastFired) st.eventSystem.intervalLastFired = {};
  }
  if ((st.meta.version || 0) < 19) {
    st.meta.version = 19;
    if (!st.virtualFs || typeof st.virtualFs !== 'object') {
      st.virtualFs = { entries: [], nextSeq: 1 };
    }
    st.virtualFs.entries = Array.isArray(st.virtualFs.entries) ? st.virtualFs.entries : [];
    if (st.virtualFs.nextSeq == null) st.virtualFs.nextSeq = 1;
  }
  if ((st.meta.version || 0) < 20) {
    st.meta.version = 20;
    migrateWebsiteStats(st);
  }
  if ((st.meta.version || 0) < 21) {
    st.meta.version = 21;
    if (!Array.isArray(st.activeTasks)) st.activeTasks = [];
    for (const p of st.player?.webExProjects || []) {
      if (!Array.isArray(p.securityModules)) p.securityModules = [];
    }
  }
  if ((st.meta.version || 0) < 22) {
    st.meta.version = 22;
    if (st.player && st.player.lastActiveWebExProjectId == null) {
      st.player.lastActiveWebExProjectId = null;
    }
    if (!st.websiteContract || typeof st.websiteContract !== 'object') {
      st.websiteContract = {
        active: false,
        contractId: null,
        companyId: null,
        companyName: null,
        requirements: null,
        reward: 0,
        breachFee: 0,
        startSimMs: 0,
        deadlineSimMs: 0,
      };
    }
    for (const p of st.player?.webExProjects || []) {
      if (p.lastAutoSavedAt == null) p.lastAutoSavedAt = 0;
    }
  }
  if (!st.ccr || typeof st.ccr !== 'object') {
    st.ccr = { contracts: [], newsFeed: [], nextSeq: 1 };
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
  if ((st.meta.version || 0) < 23) {
    st.meta.version = 23;
    if (!Array.isArray(st.player.assets)) st.player.assets = [];
    if (!Array.isArray(st.player.scamHistory)) st.player.scamHistory = [];
    if (!st.adAnalytics || typeof st.adAnalytics !== 'object') {
      st.adAnalytics = { byAdId: {} };
    }
    if (!st.adAnalytics.byAdId || typeof st.adAnalytics.byAdId !== 'object') {
      st.adAnalytics.byAdId = {};
    }
    if (!st.warehouse) st.warehouse = { units: [], liquidation: [], properties: [] };
    if (!Array.isArray(st.warehouse.properties)) st.warehouse.properties = [];
  }
  if ((st.meta.version || 0) < 24) {
    st.meta.version = 24;
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
    const cp = st.corporateProfile;
    if (cp.notoriety == null) cp.notoriety = 0;
    if (cp.reputation == null) cp.reputation = 0;
    if (cp.exposure == null) cp.exposure = 0;
    if (!Array.isArray(cp.judicialRecord)) cp.judicialRecord = [];
    if (cp.investigatorTier == null) cp.investigatorTier = 0;
    if (cp.assignedInvestigatorId === undefined) cp.assignedInvestigatorId = null;
    if (cp.lastAuditSimMs == null) cp.lastAuditSimMs = 0;
    if (cp.auditCount == null) cp.auditCount = 0;
    if (st.player && st.player.acumen == null) st.player.acumen = 10;
    if (!Array.isArray(st.companies)) st.companies = [];
  }
  if ((st.meta.version || 0) < 25) {
    st.meta.version = 25;
    if (st.player) {
      if (st.player.worldSeed === undefined) st.player.worldSeed = null;
      if (!Array.isArray(st.player.exploredDistricts)) st.player.exploredDistricts = [1];
    }
    if (st.districtManifest === undefined) st.districtManifest = null;
  }
  if ((st.meta.version || 0) < 26) {
    st.meta.version = 26;
    if (!Array.isArray(st.newsRegistry)) st.newsRegistry = [];
  }
  if ((st.meta.version || 0) < 27) {
    st.meta.version = 27;
    st.flags = st.flags || {};
    if (st.flags.darkWebReferralUnlocked === undefined) st.flags.darkWebReferralUnlocked = false;
  }
  if ((st.meta.version || 0) < 28) {
    st.meta.version = 28;
    if (!Array.isArray(st.rivalCompanies)) st.rivalCompanies = [];
    if (!Array.isArray(st.rivalProducts)) st.rivalProducts = [];
  }
  if ((st.meta.version || 0) < 29) {
    st.meta.version = 29;
    if (!st.warehouse) st.warehouse = { units: [], liquidation: [] };
    if (!Array.isArray(st.warehouse.properties)) st.warehouse.properties = [];
    if (!st.warehouse.insurance || typeof st.warehouse.insurance !== 'object') st.warehouse.insurance = {};
    if (!Array.isArray(st.warehouse.transfers)) st.warehouse.transfers = [];
    if (st.warehouse.lastVaultAuctionSimMs == null) st.warehouse.lastVaultAuctionSimMs = 0;
    if (!st.playerInventory) st.playerInventory = { items: [], manifest: [], totalValue: 0 };
    if (!Array.isArray(st.playerInventory.items)) st.playerInventory.items = [];
    if (!Array.isArray(st.playerInventory.manifest)) st.playerInventory.manifest = [];
    const WATG_TIERS = {
      small: { id: 'watg-small', maxValueUsd: 5000, maxItems: 10, rent: 6, label: '5×5 Locker' },
      medium: { id: 'watg-medium', maxValueUsd: 20000, maxItems: 30, rent: 14, label: '10×10 Standard' },
      large: { id: 'watg-large', maxValueUsd: 75000, maxItems: 75, rent: 28, label: '10×20 Large Bay' },
      xlarge: { id: 'watg-xlarge', maxValueUsd: 200000, maxItems: 150, rent: 50, label: '10×30 Full Unit' }
    };
    for (const u of st.warehouse.units || []) {
      if (u.providerId) continue;
      u.providerId = 'whereallthingsgo';
      u.providerName = u.providerName || 'WhereAllThingsGo.net';
      const t = u.sizeTier ? WATG_TIERS[u.sizeTier] : WATG_TIERS.small;
      if (t) {
        u.tierUnitId = t.id;
        u.maxValueUsd = u.maxValueUsd != null ? u.maxValueUsd : t.maxValueUsd;
        u.maxItems = u.maxItems != null ? u.maxItems : t.maxItems;
        u.rentPerDay = u.rentPerDay != null ? u.rentPerDay : t.rent;
        u.label = u.label || t.label;
        u.climateControlled = u.climateControlled != null ? u.climateControlled : false;
        u.insured = !!u.insured;
      }
    }
    const carried = (st.playerInventory?.items || []).reduce(
      (a, it) => a + (it.unitValue || 0) * (it.quantity || 1),
      0
    );
    const wr = (st.warehouse?.units || [])
      .flatMap((unit) => unit.items || [])
      .reduce((a, it) => a + (it.unitValue || 0) * (it.quantity || 1), 0);
    st.playerInventory.totalValue = Math.round(carried + wr);
  }
  if ((st.meta.version || 0) < 30) {
    st.meta.version = 30;
    if (!st.economy) {
      st.economy = {
        inflationRate: 0.031,
        unemploymentRate: 0.04,
        gdpIndex: 100,
        consumerConfidence: 72,
        dotComBubble: 'peak',
        hargroveGdp: 2_400_000_000,
        totalTransactionVolume: 0,
        transactionLog: [],
        lastInflationAdjustMs: 0,
        npcPurchaseLog: [],
        priceIndex: {}
      };
    }
    st.software = st.software || { installedAppIds: [], activeInstalls: [] };
    st.software.installedAppIds = Array.isArray(st.software.installedAppIds) ? st.software.installedAppIds : [];
  }
  if ((st.meta.version || 0) < 31) {
    st.meta.version = 31;
    const defaults = createDefaultWorldNetState();
    const w = st.worldnet && typeof st.worldnet === 'object' ? st.worldnet : {};
    st.worldnet = {
      ...defaults,
      ...w,
      knownSites: { ...defaults.knownSites, ...(w.knownSites || {}) },
      formSubmissions: { ...defaults.formSubmissions, ...(w.formSubmissions || {}) },
      pollVotes: { ...defaults.pollVotes, ...(w.pollVotes || {}) },
      petitions: { ...defaults.petitions, ...(w.petitions || {}) },
      complaintLog: Array.isArray(w.complaintLog) ? w.complaintLog : defaults.complaintLog,
      counters: { ...defaults.counters, ...(w.counters || {}) }
    };
  }
  if ((st.meta.version || 0) < 32) {
    st.meta.version = 32;
    if (!st.publicPulse || typeof st.publicPulse !== 'object') {
      st.publicPulse = { products: {}, herald: { articles: {}, playerVote: {} }, syndicatedComments: [] };
    }
    if (!st.publicPulse.products || typeof st.publicPulse.products !== 'object') st.publicPulse.products = {};
    if (!st.publicPulse.herald || typeof st.publicPulse.herald !== 'object') {
      st.publicPulse.herald = { articles: {}, playerVote: {} };
    }
    if (!st.publicPulse.herald.articles) st.publicPulse.herald.articles = {};
    if (!st.publicPulse.herald.playerVote) st.publicPulse.herald.playerVote = {};
    if (!Array.isArray(st.publicPulse.syndicatedComments)) st.publicPulse.syndicatedComments = [];
    // Backfill player taglets if missing so affinity code has something to work with
    if (!Array.isArray(st.player?.taglets) || st.player.taglets.length === 0) {
      if (st.player) st.player.taglets = ['casual_speaker', 'civic_minded'];
    }
  }
  if ((st.meta.version || 0) < 33) {
    st.meta.version = 33;
    if (st.player) {
      if (!Array.isArray(st.player.assetDiscardDays)) st.player.assetDiscardDays = [];
      if (st.player.assetLitterNewsDayIndex == null) st.player.assetLitterNewsDayIndex = null;
      if (st.player.assetLitterSevereDayIndex == null) st.player.assetLitterSevereDayIndex = null;
    }
  }
  if ((st.meta.version || 0) < 34) {
    st.meta.version = 34;
    st.software = st.software || { installedAppIds: [], activeInstalls: [] };
    st.software.installedAppIds = Array.isArray(st.software.installedAppIds) ? st.software.installedAppIds : [];
    st.software.installedAppIds = st.software.installedAppIds.filter((id) => id !== 'player-inventory');
  }
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

function levyFineFromAccounts(st, amount, fineDescription) {
  let due = Math.round(amount);
  const order = ['fncb', 'meridian', 'harbor', 'pacific', 'darkweb', 'davidmitchell'];
  const desc =
    typeof fineDescription === 'string' && fineDescription.trim()
      ? fineDescription.trim()
      : 'Administrative penalty';
  for (const id of order) {
    if (due < 1) break;
    const a = st.accounts.find((x) => x.id === id);
    if (!a) continue;
    const bal = Math.max(0, a.balance || 0);
    const take = Math.min(bal, due);
    a.balance = bal - take;
    due -= take;
    if (take > 0) {
      appendBankingTransaction(st, {
        bankName: a.name,
        accountNumber: a.accountNumber ?? '',
        type: 'regulatory_fine',
        amount: take,
        description: desc
      });
    }
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
      const title = p.violation === 'misrepresentation' ? 'Misrepresentation' : 'False Identification';
      levyFineFromAccounts(st, amt, `Federal penalty — ${title}`);
      st.regulatory.identityFineCount = (st.regulatory.identityFineCount || 0) + 1;
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
  const id = String(appId || '');
  const ids = stateObj.software?.installedAppIds || [];
  if (ids.includes(id)) return true;
  const v2 = `${id}-v2`;
  const v3 = `${id}-v3`;
  if (!id.includes('-v') && (ids.includes(v2) || ids.includes(v3))) return true;
  return false;
}

/** Gate purchases / downloads for tiered combat apps (requires chain + referral flag). */
export function canInstallApp(appId) {
  const app = getInstallableApp(appId);
  if (!app) return { ok: false, reason: 'App not found.' };
  const st = state;
  const installed = st.software?.installedAppIds || [];
  if (app.requires && !installed.includes(app.requires)) {
    const req = getInstallableApp(app.requires);
    return {
      ok: false,
      reason: `Requires ${req?.label || app.requires} to be installed first.`
    };
  }
  if (app.requiresFlag && !st.flags?.[app.requiresFlag]) {
    return {
      ok: false,
      reason: 'Requires a dark web referral code. Find it in the network.'
    };
  }
  return { ok: true };
}

function pruneCombatUpgradeChain(st, newlyInstalledId) {
  const app = getInstallableApp(newlyInstalledId);
  if (!app?.baseId || !app.version || app.version === '1.0') return;
  const base = app.baseId;
  const rm = [];
  if (app.version === '2.0') rm.push(base);
  if (app.version === '3.0') rm.push(base, `${base}-v2`);
  if (!rm.length) return;
  st.software.installedAppIds = st.software.installedAppIds.filter((x) => !rm.includes(x));
}

function randomDurationMs(minSeconds, maxSeconds) {
  const min = Math.max(1, Math.floor(Number(minSeconds) || 1));
  const max = Math.max(min, Math.floor(Number(maxSeconds) || min));
  const seconds = Math.floor(Math.random() * (max - min + 1)) + min;
  return seconds * 1000;
}

/** Normalize install job timeline (handles NaN / missing ms fields after save round-trips). */
function installJobEnds(queued) {
  const queuedAt = Number(queued.queuedAtSimMs) || 0;
  const downloadTotal = Math.max(1, Number(queued.downloadDurationMs) || 1);
  const installTotal = Math.max(1, Number(queued.installDurationMs) || 1);
  let downloadEnd = Number(queued.downloadCompleteAtSimMs);
  let installEnd = Number(queued.installCompleteAtSimMs);
  if (!Number.isFinite(downloadEnd)) downloadEnd = queuedAt + downloadTotal;
  if (!Number.isFinite(installEnd)) installEnd = downloadEnd + installTotal;
  return { queuedAt, downloadTotal, installTotal, downloadEnd, installEnd };
}

export function getInstallStatus(appId, stateObj = state) {
  const id = String(appId || '');
  if (!isInstallableApp(id)) return { state: 'unknown', appId: id };
  if (isAppInstalled(id, stateObj)) return { state: 'installed', appId: id };
  const queued = stateObj.software?.activeInstalls?.find((x) => x.appId === id);
  if (queued) {
    const now = stateObj.sim?.elapsedMs ?? 0;
    const { queuedAt, downloadTotal, installTotal, downloadEnd, installEnd } = installJobEnds(queued);
    let phase;
    if (queued.phase === 'aborting') phase = 'aborting';
    else if (now < downloadEnd) phase = 'downloading';
    else phase = 'installing';
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
  const gate = canInstallApp(appId);
  if (!gate.ok) {
    return { ok: false, reason: 'requirements', message: gate.reason };
  }
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
          description: `${app.sourceHost || 'devtools.net'} — ${app.label}`
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
  try {
    const host = app.sourceHost || 'WorldNet';
    const priceStr = price > 0 ? `$${price.toFixed(2)}` : '$0.00';
    window.ActivityLog?.log?.('APP_INSTALL_START', `Download initiated: ${app.label} from ${host} — ${priceStr}`, {
          suspicious: app.trustLevel === 'unverified' || app.trustLevel === 'dark'
        });
  } catch {
    /* ignore */
  }
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
    const tid = `install:${job.appId}`;
    return {
      id: tid,
      taskId: tid,
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
  const repairs = (stateObj.activeTasks || [])
    .filter((t) => t.type === 'site_repair' && t.status === 'in_progress')
    .map((t) => {
      const denom = Math.max(1, (t.dueSimMs || 0) - (t.startSimMs || 0));
      const elapsed = now - (t.startSimMs || 0);
      const progress = Math.min(100, Math.max(0, Math.round((elapsed / denom) * 100)));
      return {
        id: `repair:${t.id}`,
        taskId: `repair:${t.id}`,
        taskType: 'site_repair',
        targetId: t.id,
        icon: t.icon || '🔧',
        label: t.label || 'Site repair',
        category: 'Site Maintenance',
        status: 'Repairing',
        progress,
        detail: t.pageId || '',
        canEnd: true,
        canKill: true
      };
    });
  const websiteContracts = (stateObj.activeTasks || [])
    .filter((t) => t.type === 'website_contract' && t.status === 'in_progress')
    .map((t) => {
      const denom = Math.max(1, (t.dueSimMs || 0) - (t.startSimMs || 0));
      const elapsed = now - (t.startSimMs || 0);
      const progress = Math.min(100, Math.max(0, Math.round((elapsed / denom) * 100)));
      return {
        id: `contract:${t.id}`,
        taskId: `contract:${t.id}`,
        taskType: 'website_contract',
        targetId: t.id,
        icon: t.icon || '🌐',
        label: t.label || 'Website contract',
        category: 'Contracts',
        status: 'In progress',
        progress,
        detail: t.companyName || '',
        canEnd: false,
        canKill: true
      };
    });
  const marketplaceSettlements = (stateObj.activeTasks || [])
    .filter((t) => t.type === 'marketplace_settlement' && t.status === 'in_progress')
    .map((t) => {
      const totalMs = 24 * 3600000;
      const due = t.dueSimMs || 0;
      const start = due - totalMs;
      const p =
        due <= now ? 100 : Math.min(100, Math.max(0, Math.round(((now - start) / totalMs) * 100)));
      return {
        id: `mps:${t.id}`,
        taskId: `mps:${t.id}`,
        taskType: 'settlement',
        targetId: t.id,
        icon: t.icon || '💰',
        label: t.label || 'Marketplace sale',
        category: 'ETradeBay',
        status: due <= now ? 'Releasing' : 'Settlement pending',
        progress: p,
        detail: t.amount != null ? `$${Number(t.amount).toFixed(2)}` : '',
        canEnd: false,
        canKill: false
      };
    });
  return [...installs, ...deliveries, ...repairs, ...websiteContracts, ...marketplaceSettlements];
}

/**
 * Completes due site_repair tasks. Returns completed task objects for toast/SMS in caller.
 * @returns {object[]}
 */
export function processSiteRepairsIfNeeded() {
  const now = state.sim?.elapsedMs ?? 0;
  /** @type {object[]} */
  const completed = [];
  patchState((st) => {
    if (!Array.isArray(st.activeTasks)) st.activeTasks = [];
    const keep = [];
    for (const t of st.activeTasks) {
      if (t.type !== 'site_repair' || t.status !== 'in_progress') {
        keep.push(t);
        continue;
      }
      if ((t.dueSimMs || 0) > now) {
        keep.push(t);
        continue;
      }
      const page = (st.contentRegistry?.pages || []).find((p) => p.pageId === t.pageId);
      if (page?.stats) {
        page.stats.health = 100;
        page.stats.uptime = 100;
        page.stats.lastAttacked = null;
        page.stats.traffic = Math.min(100, (page.stats.traffic || 0) + 20);
        page.stats.security = Math.min(100, (page.stats.security || 0) + 10);
      }
      completed.push(t);
    }
    st.activeTasks = keep;
    return st;
  });
  return completed;
}

/**
 * Deposits ETradeBay (inventory) marketplace sale proceeds to FNCB when due.
 * @returns {object[]}
 */
export function processMarketplaceSettlementsIfNeeded() {
  const now = state.sim?.elapsedMs ?? 0;
  /** @type {object[]} */
  const done = [];
  patchState((st) => {
    if (!Array.isArray(st.activeTasks)) st.activeTasks = [];
    const keep = [];
    for (const t of st.activeTasks) {
      if (t.type !== 'marketplace_settlement' || t.status !== 'in_progress') {
        keep.push(t);
        continue;
      }
      if ((t.dueSimMs || 0) > now) {
        keep.push(t);
        continue;
      }
      const amt = Number(t.amount || 0) || 0;
      if (amt > 0) {
        const fncb = (st.accounts || []).find((a) => a.id === 'fncb');
        if (fncb) fncb.balance = (fncb.balance || 0) + amt;
      }
      done.push(t);
    }
    st.activeTasks = keep;
    return st;
  });
  return done;
}

export function cancelSiteRepairTask(taskId) {
  patchState((st) => {
    if (!Array.isArray(st.activeTasks)) st.activeTasks = [];
    st.activeTasks = st.activeTasks.filter((t) => t.id !== taskId);
    return st;
  });
  return { ok: true, message: 'Repair task cancelled.' };
}

export function processSoftwareInstallsIfNeeded() {
  const completed = [];
  const now = state.sim?.elapsedMs ?? 0;
  const pending = state.software?.activeInstalls;
  if (
    !pending?.some((job) => {
      if (job.phase === 'aborting') return (Number(job.abortCompleteAtSimMs) || 0) <= now;
      const { downloadEnd, installEnd } = installJobEnds(job);
      return downloadEnd <= now || installEnd <= now;
    })
  ) {
    return completed;
  }
  patchState((st) => {
    const software = st.software;
    if (!software?.activeInstalls?.length) return st;
    const keep = [];
    for (const job of software.activeInstalls) {
      if (job.phase === 'aborting') {
        if ((Number(job.abortCompleteAtSimMs) || 0) > now) {
          keep.push(job);
        }
        continue;
      }
      const { downloadEnd, installEnd } = installJobEnds(job);
      if (downloadEnd <= now && job.phase === 'downloading') {
        job.phase = 'installing';
      }
      if (installEnd > now) {
        keep.push(job);
        continue;
      }
      const app = getInstallableApp(job.appId);
      if (app && !software.installedAppIds.includes(app.id)) {
        pruneCombatUpgradeChain(st, app.id);
        software.installedAppIds.push(app.id);
        completed.push(app);
      }
    }
    software.activeInstalls = keep;
    return st;
  });
  return completed;
}

/* ── CCR (Contacts, Contracts & Relations) helpers ───────── */

export function ccrListContracts(filterFn) {
  const list = state.ccr?.contracts || [];
  return filterFn ? list.filter(filterFn) : [...list];
}

export function ccrActiveForNpc(issuerActorId) {
  return (state.ccr?.contracts || []).filter(
    (c) => c.issuerActorId === issuerActorId && c.status === 'active'
  );
}

export function ccrHasActiveContract(issuerActorId) {
  return ccrActiveForNpc(issuerActorId).length > 0;
}

export function ccrGetNewsFeed(limit = 50) {
  const feed = state.ccr?.newsFeed || [];
  return feed.slice(-limit).reverse();
}

function ccrPushNews(st, kind, headline, refs = {}) {
  st.ccr.newsFeed.push({
    atSimMs: st.sim?.elapsedMs ?? 0,
    kind,
    headline,
    contractId: refs.contractId || null,
    actorId: refs.actorId || null
  });
  if (st.ccr.newsFeed.length > 200) {
    st.ccr.newsFeed = st.ccr.newsFeed.slice(-200);
  }
}

export function ccrCreateContract({ issuerActorId, contractorId, mainRequirement, moduleIds, basePriceUsd, modulePriceUsd, deadlineSimMs }) {
  let created = null;
  patchState((st) => {
    const ccr = st.ccr;
    if (ccr.contracts.some((c) => c.issuerActorId === issuerActorId && c.contractorId === (contractorId || 'player') && c.status === 'active')) {
      return st;
    }
    const id = `ccr-${ccr.nextSeq++}`;
    created = {
      id,
      issuerActorId,
      contractorId: contractorId || 'player',
      mainRequirement,
      moduleIds: [...moduleIds],
      basePriceUsd,
      modulePriceUsd: { ...modulePriceUsd },
      status: 'active',
      deadlineSimMs: deadlineSimMs || null,
      acknowledged: false,
      negotiationLog: [],
      createdAtMs: st.sim?.elapsedMs ?? 0,
      completedAtMs: null
    };
    ccr.contracts.push(created);
    const issuerName = window.AXIS?.resolveContact?.(issuerActorId)?.name || issuerActorId;
    ccrPushNews(st, 'contract_created', `New contract awarded: ${issuerName} seeks services.`, { contractId: id, actorId: issuerActorId });
    return st;
  });
  if (created) window.ActivityLog?.log?.('CCR_CONTRACT_CREATE', `Contract ${created.id} created for ${issuerActorId}`);
  return created;
}

export function ccrCompleteContract(contractId) {
  let found = false;
  patchState((st) => {
    const c = st.ccr.contracts.find((x) => x.id === contractId && x.status === 'active');
    if (!c) return st;
    c.status = 'completed';
    c.completedAtMs = st.sim?.elapsedMs ?? 0;
    found = true;
    const issuerName = window.AXIS?.resolveContact?.(c.issuerActorId)?.name || c.issuerActorId;
    ccrPushNews(st, 'contract_completed', `Contract completed: ${issuerName} deal finalized.`, { contractId, actorId: c.issuerActorId });
    return st;
  });
  if (found) window.ActivityLog?.log?.('CCR_CONTRACT_COMPLETE', `Contract ${contractId} completed`);
  return found;
}

export function ccrCancelContract(contractId) {
  let found = false;
  patchState((st) => {
    const c = st.ccr.contracts.find((x) => x.id === contractId && x.status === 'active');
    if (!c) return st;
    c.status = 'cancelled';
    found = true;
    const issuerName = window.AXIS?.resolveContact?.(c.issuerActorId)?.name || c.issuerActorId;
    ccrPushNews(st, 'contract_cancelled', `Contract cancelled: ${issuerName} deal voided.`, { contractId, actorId: c.issuerActorId });
    return st;
  });
  if (found) window.ActivityLog?.log?.('CCR_CONTRACT_CANCEL', `Contract ${contractId} cancelled`);
  return found;
}

export function ccrAcknowledgeContract(contractId) {
  patchState((st) => {
    const c = st.ccr.contracts.find((x) => x.id === contractId);
    if (c) c.acknowledged = true;
    return st;
  });
}

export function ccrNegotiate(contractId, changes, relationshipDelta = 0) {
  let ok = false;
  patchState((st) => {
    const c = st.ccr.contracts.find((x) => x.id === contractId && (x.status === 'active' || x.status === 'negotiating'));
    if (!c) return st;
    if (changes.moduleIds) c.moduleIds = [...changes.moduleIds];
    if (changes.basePriceUsd != null) c.basePriceUsd = changes.basePriceUsd;
    if (changes.modulePriceUsd) c.modulePriceUsd = { ...changes.modulePriceUsd };
    if (changes.deadlineSimMs != null) c.deadlineSimMs = changes.deadlineSimMs;
    c.negotiationLog.push({
      atSimMs: st.sim?.elapsedMs ?? 0,
      changes: { ...changes },
      relationshipDelta
    });
    const issuerName = window.AXIS?.resolveContact?.(c.issuerActorId)?.name || c.issuerActorId;
    ccrPushNews(st, 'negotiation', `Deal revised: terms renegotiated with ${issuerName}.`, { contractId, actorId: c.issuerActorId });
    ok = true;
    return st;
  });
  if (ok) window.ActivityLog?.log?.('CCR_NEGOTIATE', `Contract ${contractId} renegotiated (delta: ${relationshipDelta})`);
  if (ok && relationshipDelta !== 0) {
    const c = (state.ccr?.contracts || []).find((x) => x.id === contractId);
    if (c) window.AXIS?.updateScore?.(c.issuerActorId, relationshipDelta, 'Contract renegotiation');
  }
  return ok;
}

export function ccrContractTotal(contract) {
  const base = Number(contract.basePriceUsd) || 0;
  const modSum = Object.values(contract.modulePriceUsd || {}).reduce((s, v) => s + (Number(v) || 0), 0);
  return base + modSum;
}
