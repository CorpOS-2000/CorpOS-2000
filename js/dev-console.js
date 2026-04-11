/**
 * Developer console — hidden dial-in character and cheats.
 */
import { ActorDB } from '../engine/ActorDB.js';
import { BANK_RULES } from './bank-config.js';
import { getState, patchState, appendBankingTransaction, generateBankAccountNumber } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { deliverCorpOSWelcomePacket, simpleHash } from './jeemail-corpos.js';
import {
  showOutgoingCall,
  onOutgoingCallConnected,
  showLiveTranscript,
  appendToTranscript,
  showTranscriptOptions,
  clearTranscriptOptions,
  endTranscriptSession
} from './black-cherry.js';
import { FederalAuditSequence } from './federal-audit-sequence.js';
import { ToastManager } from './toast.js';
import { TOAST_KEYS } from './toast.js';

const ACTOR_ID = 'ACT-DEV-INTERNAL';

function buildDevActor() {
  return {
    actor_id: ACTOR_ID,
    full_legal_name: 'System Administrator',
    first_name: 'Dev',
    last_name: 'Console',
    aliases: ['The Developer'],
    ssn: '900-00-0001',
    phone_numbers: ['(320) 460-0561'],
    emails: ['dev.internal@corpos.sys'],
    home_address: {
      street: '0 Internal Ln',
      city: 'Hargrove',
      state: 'CA',
      zip: '00000'
    },
    dob: '1970-01-01',
    age: 30,
    household_id: null,
    employer_id: null,
    profession: 'System Administrator',
    lifestyle_tier: 'elite',
    taglets: [],
    social_weight: 0,
    opinion_profile: {},
    relationships: [],
    current_state: {
      location: 'system',
      activity: 'online',
      mood: 'neutral',
      last_event: null
    },
    memory: [],
    activity_schedule: { platforms: [], peak_hours: [], frequency: 'low' },
    site_visibility: {
      social: 'private',
      forum: 'private',
      news: 'private',
      email: 'private',
      corporate: 'private',
      anonymous: 'private',
      banking: 'private',
      government: 'legal'
    },
    public_profile: {
      display_name: 'Internal',
      bio: '',
      occupation: 'System Administrator',
      avatar_description: 'default portrait'
    },
    private_profile: { notes: '', risk_flags: [] },
    role: 'system',
    investigator_tier: null,
    is_player: false,
    is_key_character: false,
    created_at: '2000-01-01T00:00:00.000Z',
    active: true
  };
}

function hasRegisteredBankAccount(st) {
  return (st.accounts || []).some((a) => a.onlineRegistered);
}

function pickDepositAccount(st) {
  const registered = (st.accounts || []).filter((a) => a.onlineRegistered);
  if (!registered.length) return null;
  return [...registered].sort((a, b) => (b.balance || 0) - (a.balance || 0))[0];
}

function devRegisterFncb() {
  patchState((st) => {
    const p = st.player;
    const a = st.accounts?.find((x) => x.id === 'fncb');
    if (!a || a.onlineRegistered) return st;
    const rules = BANK_RULES.fncb;
    a.accountNumber = generateBankAccountNumber(rules.accountPrefix);
    a.onlineRegistered = true;
    a.enrolledUserId = (p.username || 'OPERATOR').toUpperCase();
    a.enrolledPin = '0000';
    a.enrolledPassword = '0000';
    a.accountType = 'personal_checking';
    a.memberSinceElapsedMs = st.sim?.elapsedMs ?? 0;
    if (typeof a.loanBalance !== 'number') a.loanBalance = 0;
    if (!Array.isArray(a.transactions)) a.transactions = [];
    a.loanDetail = null;
    a.meridianInterestWeekIndex = -1;
    const digits = String(p.ssnFull || '').replace(/\D/g, '');
    a.enrolledProfile = {
      legalName: p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim(),
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
      enrolledAtElapsedMs: st.sim?.elapsedMs ?? 0
    };
    return st;
  });
}

function seedJeeMailInboxDev(email) {
  return [
    { from: 'team@jeemail.net', to: email, subject: 'Welcome to JeeMail!', body: 'Thanks for joining JeeMail. Your inbox is ready.', date: 'Jan 1, 2000' },
    { from: 'offers@rapidemart.net', to: email, subject: 'Limited-time modem deals', body: 'Get blazing 56k accessories.', date: 'Jan 1, 2000' },
    { from: 'alerts@corptools.biz', to: email, subject: 'Newsletter: Quarter 1 Trends', body: 'Business updates for growth-minded operators.', date: 'Jan 2, 2000' },
    { from: 'promo@an0n-ledger.tor.parody', to: email, subject: 'Private wealth opportunity', body: 'Open a discreet account today.', date: 'Jan 2, 2000' }
  ];
}

function randomSsnCandidate() {
  const area = String(Math.floor(100 + Math.random() * 800)).padStart(3, '0');
  const group = String(Math.floor(10 + Math.random() * 89)).padStart(2, '0');
  const serial = String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
  return `${area}-${group}-${serial}`;
}

function devAssignUniquePlayerSsn(preferredRaw) {
  const cleaned = String(preferredRaw || '').replace(/\D/g, '');
  const candidates = [];
  if (cleaned.length === 9) {
    candidates.push(`${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5, 9)}`);
  }
  for (let i = 0; i < 80; i++) candidates.push(randomSsnCandidate());

  const raw = ActorDB.getRaw('PLAYER_PRIMARY');
  if (!raw) return null;

  for (const ssn of candidates) {
    try {
      ActorDB.update('PLAYER_PRIMARY', { ssn });
      patchState((st) => {
        st.player.ssnFull = ssn;
        st.player.ssnSuffix = ssn.slice(-4);
        const cit = st.registry?.citizens?.find((c) => c.kind === 'player');
        if (cit) cit.ssnFull = ssn;
        const digits = String(st.player.ssnFull || '').replace(/\D/g, '');
        if (digits.length === 9) {
          for (const acc of st.accounts || []) {
            if (acc.onlineRegistered && acc.enrolledProfile) acc.enrolledProfile.ssnDigits = digits;
          }
        }
        return st;
      });
      return ssn;
    } catch {
      /* duplicate SSN */
    }
  }
  return null;
}

function devApplyNameChange(firstName, lastName) {
  const f = String(firstName || '').trim();
  const l = String(lastName || '').trim();
  if (!f || !l) return false;
  const display = `${f} ${l}`;

  patchState((s) => {
    s.player.firstName = f;
    s.player.lastName = l;
    s.player.displayName = display;
    const cit = s.registry?.citizens?.find((c) => c.kind === 'player');
    if (cit) cit.displayName = display;
    const contacts = s.player.blackCherryContacts || [];
    const self = contacts.find((c) => c.actorId === 'PLAYER_PRIMARY');
    if (self) {
      self.displayName = `${f} - Me`;
      self.officialName = display;
    }
    return s;
  });

  const ply = ActorDB.getRaw('PLAYER_PRIMARY');
  if (ply) {
    ActorDB.update('PLAYER_PRIMARY', {
      first_name: f,
      last_name: l,
      full_legal_name: display,
      public_profile: { ...ply.public_profile, display_name: display }
    });
  }

  const momId = getState().player.momActorId;
  const mom = momId ? ActorDB.getRaw(momId) : null;
  if (mom) {
    const momFirst = mom.first_name;
    const momDisplay = `${momFirst} ${l}`;
    ActorDB.update(momId, {
      last_name: l,
      full_legal_name: momDisplay,
      public_profile: { ...mom.public_profile, display_name: momDisplay }
    });
    patchState((s) => {
      const contacts = s.player.blackCherryContacts || [];
      const row = contacts.find((c) => c.actorId === momId);
      if (row) row.officialName = momDisplay;
      return s;
    });
  }
  return true;
}

export const DevConsole = {
  ACTOR_ID,

  init() {
    if (!ActorDB.getRaw(ACTOR_ID)) {
      try {
        ActorDB.create(buildDevActor());
      } catch (e) {
        console.warn('[DevConsole] Could not register dev actor:', e?.message || e);
      }
    }
    window.DevConsole = DevConsole;
  },

  triggerCall() {
    showOutgoingCall({
      actorId: ACTOR_ID,
      displayName: '(320) 460-0561',
      subLabel: 'Connecting…',
      onConnect: () => {
        onOutgoingCallConnected(ACTOR_ID);
        this.startSession();
      }
    });
  },

  startSession() {
    const intro = [
      { speaker: 'dev', text: '…', delay: 800 },
      { speaker: 'dev', text: 'Yeah. You reached internal.', delay: 1600 },
      { speaker: 'dev', text: 'Go ahead.', delay: 1200 },
      { speaker: 'dev', text: 'What do you need?', delay: 1000 }
    ];

    showLiveTranscript({
      actorId: ACTOR_ID,
      displayName: 'Internal',
      transcript: intro,
      onComplete: () => this.showMenu()
    });
  },

  showMenu() {
    appendToTranscript(ACTOR_ID, [
      { speaker: 'dev', text: 'Options:', delay: 600 },
      { speaker: 'dev', text: '1 — Deposit $1,000,000 (marked as Lottery Win)', delay: 800 },
      { speaker: 'dev', text: '2 — Trigger Federal Authority Level 1 audit', delay: 800 },
      { speaker: 'dev', text: '3 — Set me up with a JeeMail account', delay: 800 },
      { speaker: 'dev', text: '4 — Change my name (updates Mom\'s surname too)', delay: 800 },
      { speaker: 'dev', text: '5 — Change my Social Security number', delay: 800 },
      { speaker: 'dev', text: '6 — Wipe my criminal record', delay: 800 },
      { speaker: 'dev', text: '7 — Force fire a world event by ID', delay: 800 },
      { speaker: 'dev', text: '9 — End call', delay: 600 }
    ]);

    showTranscriptOptions([
      { label: '1 — Lottery Deposit', action: () => this.option_LotteryDeposit() },
      { label: '2 — Federal Audit Level 1', action: () => this.option_FederalAudit() },
      { label: '3 — JeeMail account', action: () => this.option_JeeMailSetup() },
      { label: '4 — Change name', action: () => this.option_ChangeName() },
      { label: '5 — Change SSN', action: () => this.option_ChangeSsn() },
      { label: '6 — Wipe criminal record', action: () => this.option_WipeRecord() },
      { label: '7 — Force fire event', action: () => this.option_ForceEvent() },
      { label: '9 — End Call', action: () => this.endCall() }
    ]);
  },

  option_LotteryDeposit() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'player', text: 'Option 1.', delay: 400 },
      { speaker: 'dev', text: 'Got it.', delay: 800 },
      { speaker: 'dev', text: 'Processing now.', delay: 600 },
      { speaker: 'dev', text: 'Give it a second.', delay: 400 }
    ]);

    setTimeout(() => {
      const st = getState();
      if (!hasRegisteredBankAccount(st)) {
        this._offerBankSetupForLottery();
        return;
      }
      this._doLotteryDeposit();
    }, 1200);
  },

  _offerBankSetupForLottery() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'dev', text: "Hold up — you don't have a bank account on file.", delay: 1000 },
      { speaker: 'dev', text: 'Want me to set you up with First National Corp. Bank checking?', delay: 1400 }
    ]);
    setTimeout(() => {
      showTranscriptOptions([
        {
          label: 'Yes — open an account',
          action: () => {
            clearTranscriptOptions();
            devRegisterFncb();
            appendToTranscript(ACTOR_ID, [
              { speaker: 'dev', text: "Done. You're enrolled — First National checking.", delay: 1000 },
              { speaker: 'dev', text: 'Running the lottery deposit…', delay: 900 }
            ]);
            setTimeout(() => this._doLotteryDeposit(), 2800);
          }
        },
        {
          label: 'No thanks',
          action: () => {
            clearTranscriptOptions();
            appendToTranscript(ACTOR_ID, [
              { speaker: 'dev', text: 'Fair enough. Open a bank account in WorldNet first, then hit me up.', delay: 1200 }
            ]);
            setTimeout(() => this.showMenu(), 3200);
          }
        }
      ]);
    }, 3200);
  },

  _doLotteryDeposit() {
    const st = getState();
    const target = pickDepositAccount(st);

    if (!target) {
      appendToTranscript(ACTOR_ID, [
        { speaker: 'dev', text: "Still no enrolled account. Something's wrong on my end.", delay: 800 }
      ]);
      setTimeout(() => this.showMenu(), 2200);
      return;
    }

    const amount = 1_000_000;
    patchState((s) => {
      const a = s.accounts?.find((x) => x.id === target.id);
      if (!a) return s;
      a.balance = (a.balance || 0) + amount;
      if (!Array.isArray(a.transactions)) a.transactions = [];
      a.transactions.unshift({
        simElapsedMs: s.sim?.elapsedMs ?? 0,
        type: 'deposit',
        amount,
        balanceAfter: a.balance,
        description: 'Lottery Winnings — State of California Lottery Commission',
        complianceFlag: false
      });
      a.transactions = a.transactions.slice(0, 10);
      appendBankingTransaction(s, {
        bankName: a.name,
        accountNumber: a.accountNumber,
        type: 'deposit',
        amount,
        complianceFlag: false,
        description: 'Lottery Winnings — State of California Lottery Commission (dev)'
      });
      return s;
    });

    appendToTranscript(ACTOR_ID, [
      { speaker: 'dev', text: `Done. $1,000,000 deposited to ${target.name}.`, delay: 1200 },
      { speaker: 'dev', text: 'Transaction code: LOTTERY. Clean. No flags.', delay: 1600 },
      { speaker: 'dev', text: 'FRA will log it as taxable income. That\'s on you.', delay: 2000 }
    ]);

    setTimeout(() => {
      ToastManager.fire({
        key: TOAST_KEYS.DEV_LOTTERY_DEPOSIT,
        title: 'Lottery Deposit',
        message: '$1,000,000 deposited — marked as California Lottery Win',
        icon: '💵'
      });
    }, 1000);

    setTimeout(() => this.showMenu(), 4500);
  },

  option_FederalAudit() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'player', text: 'Option 2.', delay: 400 },
      { speaker: 'dev', text: 'Level 1 audit. Understood.', delay: 800 },
      { speaker: 'dev', text: 'Initiating sequence.', delay: 800 },
      { speaker: 'dev', text: 'Stand by.', delay: 400 }
    ]);

    setTimeout(() => {
      FederalAuditSequence.trigger(1);
      setTimeout(() => this.endCall(), 1500);
    }, 2000);
  },

  option_JeeMailSetup() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'player', text: 'Option 3. I need JeeMail.', delay: 500 },
      { speaker: 'dev', text: 'Copy that. Provisioning a mailbox…', delay: 900 }
    ]);

    setTimeout(() => {
      const p = getState().player;
      const base =
        `${(p.firstName || 'op').toLowerCase().replace(/[^a-z0-9]/g, '') || 'op'}.${(p.lastName || 'erator').toLowerCase().replace(/[^a-z0-9]/g, '') || 'erator'}`.slice(0, 28);
      let local = base;
      const accounts = getSessionState().jeemail?.accounts || {};
      let n = 0;
      while (accounts[`${local}@jeemail.net`]) {
        n += 1;
        local = `${base}${n}`;
      }
      const fullEmail = `${local}@jeemail.net`;
      const pass = 'internal';
      const hashed = simpleHash(pass);

      patchSession((s) => {
        if (!s.jeemail) s.jeemail = { accounts: {}, currentUser: null };
        if (!s.jeemail.accounts) s.jeemail.accounts = {};
        s.jeemail.accounts[fullEmail] = {
          email: fullEmail,
          password: pass,
          passwordHash: hashed,
          inbox: seedJeeMailInboxDev(fullEmail),
          sent: [],
          trash: []
        };
        s.jeemail.currentUser = fullEmail;
        return s;
      });

      const isFirst = !p.firstJeemailAccount;
      patchState((s) => {
        if (isFirst) {
          s.player.firstJeemailAccount = fullEmail;
          s.player.email = fullEmail;
        }
        return s;
      });

      const raw = ActorDB.getRaw('PLAYER_PRIMARY');
      if (raw && !raw.emails.includes(fullEmail)) {
        try {
          ActorDB.update('PLAYER_PRIMARY', { emails: [...raw.emails, fullEmail] });
        } catch {
          /* ignore */
        }
      }

      setTimeout(() => deliverCorpOSWelcomePacket(fullEmail, local), 600);

      appendToTranscript(ACTOR_ID, [
        { speaker: 'dev', text: `You're live at ${fullEmail}.`, delay: 1200 },
        { speaker: 'dev', text: `Password for now: ${pass} — change it in JeeMail when you can.`, delay: 1800 }
      ]);

      ToastManager.fire({
        key: TOAST_KEYS.GENERIC,
        title: 'JeeMail',
        message: `Mailbox created: ${fullEmail}`,
        icon: '✉'
      });

      setTimeout(() => this.showMenu(), 4500);
    }, 1400);
  },

  option_ChangeName() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'player', text: 'Option 4. I need to change my legal name.', delay: 500 },
      { speaker: 'dev', text: "Say the word in the dialog. I'll sync Registry and your mother's surname.", delay: 1200 }
    ]);

    setTimeout(() => {
      const first = window.prompt('New first name:', getState().player.firstName || '');
      if (first == null) {
        appendToTranscript(ACTOR_ID, [{ speaker: 'dev', text: 'Cancelled.', delay: 600 }]);
        setTimeout(() => this.showMenu(), 1200);
        return;
      }
      const last = window.prompt('New last name:', getState().player.lastName || '');
      if (last == null) {
        appendToTranscript(ACTOR_ID, [{ speaker: 'dev', text: 'Cancelled.', delay: 600 }]);
        setTimeout(() => this.showMenu(), 1200);
        return;
      }
      const ok = devApplyNameChange(first, last);
      if (!ok) {
        appendToTranscript(ACTOR_ID, [
          { speaker: 'dev', text: "That didn't stick — first and last name can't be empty.", delay: 1000 }
        ]);
        setTimeout(() => this.showMenu(), 2200);
        return;
      }
      appendToTranscript(ACTOR_ID, [
        {
          speaker: 'dev',
          text: `Updated to ${getState().player.displayName}. Mom's last name matches now.`,
          delay: 1400
        }
      ]);
      ToastManager.fire({
        key: TOAST_KEYS.GENERIC,
        title: 'Identity',
        message: `Legal name: ${getState().player.displayName}`,
        icon: '👤'
      });
      setTimeout(() => this.showMenu(), 3200);
    }, 1600);
  },

  option_ChangeSsn() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'player', text: 'Option 5. New Social Security number.', delay: 500 },
      { speaker: 'dev', text: "Enter nine digits, or leave blank and I'll assign one.", delay: 1100 }
    ]);

    setTimeout(() => {
      const raw = window.prompt('New SSN (###-##-#### or 9 digits), or OK empty for auto:', '');
      if (raw == null) {
        appendToTranscript(ACTOR_ID, [{ speaker: 'dev', text: 'Cancelled.', delay: 600 }]);
        setTimeout(() => this.showMenu(), 1200);
        return;
      }
      const ssn = devAssignUniquePlayerSsn(raw);
      if (!ssn) {
        appendToTranscript(ACTOR_ID, [
          { speaker: 'dev', text: "Couldn't assign a unique SSN. Try again with different digits.", delay: 1200 }
        ]);
        setTimeout(() => this.showMenu(), 2400);
        return;
      }
      appendToTranscript(ACTOR_ID, [
        { speaker: 'dev', text: `File shows ${ssn}. Don't lose that card again.`, delay: 1400 }
      ]);
      ToastManager.fire({
        key: TOAST_KEYS.GENERIC,
        title: 'SSN',
        message: `Updated to ${ssn}`,
        icon: '🪪'
      });
      setTimeout(() => this.showMenu(), 2800);
    }, 1500);
  },

  option_WipeRecord() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'player', text: 'Option 6. Wipe my criminal record.', delay: 500 },
      { speaker: 'dev', text: 'Purging state and federal flags on your file…', delay: 1000 }
    ]);

    setTimeout(() => {
      const raw = ActorDB.getRaw('PLAYER_PRIMARY');
      if (raw) {
        try {
          ActorDB.update('PLAYER_PRIMARY', { criminalRecord: [] });
        } catch {
          /* ignore */
        }
      }
      appendToTranscript(ACTOR_ID, [
        { speaker: 'dev', text: "Done. As far as anyone's concerned, you've never seen the inside of a cell.", delay: 1600 }
      ]);
      ToastManager.fire({
        key: TOAST_KEYS.GENERIC,
        title: 'Record',
        message: 'Criminal record cleared (dev)',
        icon: '📋'
      });
      setTimeout(() => this.showMenu(), 3200);
    }, 1400);
  },

  option_ForceEvent() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'player', text: 'Option 7. Fire an event.', delay: 400 },
      { speaker: 'dev', text: 'Which event ID?', delay: 800 }
    ]);

    const registry = window.EventSystem?.getRegistry?.() || [];
    if (!registry.length) {
      appendToTranscript(ACTOR_ID, [
        { speaker: 'dev', text: 'No event definitions loaded. Nothing to fire.', delay: 1200 }
      ]);
      setTimeout(() => this.showMenu(), 2400);
      return;
    }

    const options = registry.map(def => ({
      label: `${def.id} — ${def.title || '(untitled)'}`,
      action: () => {
        clearTranscriptOptions();
        window.EventSystem.forceEvent(def.id);
        appendToTranscript(ACTOR_ID, [
          { speaker: 'dev', text: `Fired: ${def.id}`, delay: 600 }
        ]);
        ToastManager.fire({
          key: TOAST_KEYS.GENERIC,
          title: 'Event Fired',
          message: def.title || def.id,
          icon: '⚡'
        });
        setTimeout(() => this.showMenu(), 2200);
      }
    }));
    options.push({ label: 'Cancel', action: () => this.showMenu() });
    showTranscriptOptions(options);
  },

  endCall() {
    clearTranscriptOptions();
    appendToTranscript(ACTOR_ID, [
      { speaker: 'dev', text: "That's it.", delay: 600 },
      { speaker: 'player', text: '[Call ended]', delay: 800, isEnd: true }
    ]);
    setTimeout(() => endTranscriptSession(), 1200);
  }
};
