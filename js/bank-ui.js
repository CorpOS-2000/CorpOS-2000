import { TOAST_KEYS, toast } from './toast.js';
import {
  patchState,
  getState,
  scheduleEnrollmentViolation,
  appendBankingTransaction,
  findAccountByFullNumber,
  generateBankAccountNumber
} from './gameState.js';
import { BANK_META, buildBankPageHtml } from './bank-pages.js';
import {
  classifyBankEnrollment,
  IDENTITY_FINE_DELAY_DAYS,
  normalizeSsnDigits
} from './identity.js';
import {
  rulesForBankId,
  complianceNoticeAmount,
  DARKWEB_MIN_OPEN,
  DARKWEB_REFERRAL_CODES
} from './bank-config.js';
import { getSessionState } from './sessionState.js';
import { SMS } from './bc-sms.js';

const viewByBank = {};
const sessionByBank = {};

function maskAcct(num) {
  const s = String(num || '').replace(/\s/g, '');
  if (s.length < 4) return '****';
  return `****${s.slice(-4)}`;
}

function logAct(type, detail, flags) {
  try {
    window.ActivityLog?.log?.(type, detail, flags || {});
  } catch {
    /* ignore */
  }
}

let rerenderWnet = () => {};
let bankNavigate = (pageKey, sub = '') => {
  if (typeof window !== 'undefined' && typeof window.wnetGo === 'function') {
    window.wnetGo(pageKey, sub);
  }
};

export function setBankRerender(fn) {
  rerenderWnet = typeof fn === 'function' ? fn : () => {};
}

export function setBankNavigate(fn) {
  bankNavigate = typeof fn === 'function' ? fn : () => {};
}

export function getBankUiState(bankId) {
  return {
    view: viewByBank[bankId] || 'landing',
    session: !!sessionByBank[bankId]
  };
}

export function resolveBankMetaFromSite(site) {
  const bankId = site?.getAttribute?.('data-bank-site');
  if (!bankId) return null;
  const pkAttr = site.getAttribute('data-bank-page');
  let meta = pkAttr ? BANK_META[pkAttr] : null;
  if (!meta || meta.id !== bankId) {
    const pair = Object.entries(BANK_META).find(([, m]) => m.id === bankId);
    if (!pair) return null;
    meta = pair[1];
  }
  return { bankId, meta };
}

export function handleBankNavIntent(hostEl, nav) {
  const resolved = resolveBankMetaFromSite(hostEl);
  if (!resolved) return;
  const { bankId } = resolved;
  const pageKey = hostEl.getAttribute('data-bank-page');
  if (!pageKey) return;
  const accNow = getState().accounts.find((a) => a.id === bankId);
  if (nav === 'register') {
    if (accNow?.onlineRegistered) {
      toast('You already have online access here — use Home / Log In to sign in.');
      bankNavigate(pageKey, '');
      return;
    }
    bankNavigate(pageKey, 'register');
    return;
  }
  if (nav === 'landing') {
    bankNavigate(pageKey, '');
  }
}

let bankGlobalsInstalled = false;

export function installBankWindowGlobals() {
  if (bankGlobalsInstalled || typeof window === 'undefined') return;
  bankGlobalsInstalled = true;
  window.corpBankNavClick = (el) => {
    if (!el || typeof el.closest !== 'function') return;
    const host = el.closest('[data-bank-site]');
    const nav = el.getAttribute('data-bank-nav');
    if (host && nav) handleBankNavIntent(host, nav);
  };
  window.corpBankActionClick = (el) => {
    if (!el || typeof el.closest !== 'function') return;
    const host = el.closest('[data-bank-site]');
    const action = el.getAttribute('data-bank-action');
    if (host && action) runBankAction(host, action);
  };
}

export function attachWorldNetBankDelegation() {
  installBankWindowGlobals();
}

function q(host, sel) {
  return host.querySelector(sel);
}

function enrolledSecret(acc) {
  return acc.enrolledPassword != null && acc.enrolledPassword !== ''
    ? acc.enrolledPassword
    : acc.enrolledPin;
}

function verifyTxnPin(host, acc) {
  const pin = q(host, '[data-bank-field="txn-pin"]')?.value ?? '';
  const expected = enrolledSecret(acc) ?? '';
  if (pin !== expected) {
    toast('Enter your PIN in “Authorize (PIN)” to confirm this transaction.');
    return false;
  }
  return true;
}

function requireOnlineSession(bankId) {
  if (!sessionByBank[bankId]) {
    toast('Sign in to online banking first.');
    return false;
  }
  return true;
}

function pushAccountTx(st, a, entry) {
  if (!a) return;
  const txs = Array.isArray(a.transactions) ? a.transactions : [];
  txs.unshift({
    simElapsedMs: st.sim.elapsedMs,
    type: entry.type,
    amount: entry.amount,
    balanceAfter: entry.balanceAfter,
    description: entry.description || entry.type,
    complianceFlag: !!entry.complianceFlag
  });
  a.transactions = txs.slice(0, 10);
}

function rebuildLoanDetail(a, st) {
  const rules = rulesForBankId(a.id);
  const lb = Number(a.loanBalance || 0);
  if (lb < 1) {
    a.loanDetail = null;
    return;
  }
  const prev = a.loanDetail;
  a.loanDetail = {
    principal: prev?.principal ?? lb,
    aprPercent: rules?.loanAprPercent ?? 10,
    totalOwed: lb,
    minWeeklyPayment: Math.max(25, Math.ceil(lb * 0.02)),
    createdElapsedMs: prev?.createdElapsedMs ?? st.sim.elapsedMs
  };
}

function primaryChecking(st) {
  return st.accounts.find((x) => x.id === 'fncb');
}

function runBankAction(host, action) {
  const resolved = resolveBankMetaFromSite(host);
  if (!resolved) return;
  const { bankId, meta } = resolved;

  if (action === 'login') {
    const acc = getState().accounts.find((a) => a.id === bankId);
    const pass = q(host, '[data-bank-field="pass"]')?.value ?? '';
    const uidRaw = q(host, '[data-bank-field="user"]')?.value?.trim() || '';

    if (!acc?.onlineRegistered) {
      const pk = host.getAttribute('data-bank-page');
      toast('Online enrollment required — opening enrollment page.');
      if (pk) bankNavigate(pk, 'register');
      else rerenderWnet();
      return;
    }

    const enrolledUid = acc.enrolledUserId != null ? String(acc.enrolledUserId).trim() : '';
    if (enrolledUid.length > 0 && uidRaw.toUpperCase() !== enrolledUid.toUpperCase()) {
      toast('Online User ID does not match this enrollment.');
      return;
    }
    if (enrolledUid.length === 0 && uidRaw.length < 1) {
      toast('Enter your Online User ID.');
      return;
    }

    const secret = enrolledSecret(acc) ?? '';
    if (secret === '' && pass.length < 1) {
      toast('Enter your password or PIN to continue.');
      return;
    }
    if (secret !== '' && pass !== secret) {
      toast('PIN does not match enrollment.');
      return;
    }

    sessionByBank[bankId] = true;
    viewByBank[bankId] = 'landing';
    toast(`Signed in to ${meta.title} online banking.`);
    logAct(
      'BANK_LOGIN',
      `Login to ${meta.title} — account ${maskAcct(acc.accountNumber)}`
    );
    rerenderWnet();
    return;
  }

  if (action === 'forgot') {
    toast('Password reset requires visiting a branch with photo ID. (Simulation.)');
    return;
  }

  if (action === 'cancel-register') {
    viewByBank[bankId] = 'landing';
    const pk = host.getAttribute('data-bank-page');
    if (pk) bankNavigate(pk, '');
    else rerenderWnet();
    return;
  }

  if (action === 'prefill-profile') {
    const p = getState().player;
    const setVal = (field, val) => {
      const inp = q(host, `[data-bank-field="${field}"]`);
      if (inp) inp.value = val ?? '';
    };
    setVal('reg-legal', p.displayName || '');
    setVal('reg-dob', p.dob || '');
    setVal('reg-ssn-full', p.ssnFull || '');
    setVal('reg-addr', p.address || '');
    setVal('reg-phone', p.phone || '');
    setVal('reg-email', p.email || '');
    setVal('reg-employment', '');
    setVal('reg-employer', '');
    setVal('reg-income', '');
    setVal('reg-id-type', '');
    setVal('reg-id-num', '');
    toast('Form filled from CorpOS Personal Profile. Review every field before submitting.');
    return;
  }

  if (action === 'submit-register') {
    const accBefore = getState().accounts.find((a) => a.id === bankId);
    if (accBefore?.onlineRegistered) {
      toast('Already enrolled at this institution.');
      return;
    }

    const pin = q(host, '[data-bank-field="reg-pin"]')?.value || '';
    const pin2v = q(host, '[data-bank-field="reg-pin2"]')?.value || '';
    const ssnRaw = q(host, '[data-bank-field="reg-ssn-full"]')?.value || '';
    const maiden = q(host, '[data-bank-field="reg-maiden"]')?.value?.trim() || '';
    const user = q(host, '[data-bank-field="reg-user"]')?.value?.trim() || '';
    const legal = q(host, '[data-bank-field="reg-legal"]')?.value?.trim() || '';
    const dob = q(host, '[data-bank-field="reg-dob"]')?.value?.trim() || '';
    const addr = q(host, '[data-bank-field="reg-addr"]')?.value?.trim() || '';
    const phone = q(host, '[data-bank-field="reg-phone"]')?.value?.trim() || '';
    const email = q(host, '[data-bank-field="reg-email"]')?.value?.trim() || '';
    const employment = q(host, '[data-bank-field="reg-employment"]')?.value?.trim() || '';
    const employer = q(host, '[data-bank-field="reg-employer"]')?.value?.trim() || '';
    const incomeRaw = q(host, '[data-bank-field="reg-income"]')?.value;
    const annualIncome = Math.max(0, Math.floor(Number(incomeRaw) || 0));
    const idType = q(host, '[data-bank-field="reg-id-type"]')?.value?.trim() || '';
    const idNumber = q(host, '[data-bank-field="reg-id-num"]')?.value?.trim() || '';
    const acctTypeSel = q(host, '[data-bank-field="reg-acct-type"]');
    const accountType = (acctTypeSel?.value || 'personal_checking').trim();

    if (legal.length < 3) {
      toast('Enter your full legal name (at least 3 characters).');
      return;
    }
    if (user.length < 3) {
      toast('Choose a User ID at least 3 characters.');
      return;
    }
    if (!/^\d{4,8}$/.test(pin)) {
      toast('PIN must be 4–8 digits.');
      return;
    }
    if (pin !== pin2v) {
      toast('PIN and confirmation do not match.');
      return;
    }
    if (maiden.length < 2) {
      toast('Enter a secret phrase for verification.');
      return;
    }

    const phoneDigitsOnly = phone.replace(/\D/g, '');
    if (phoneDigitsOnly.length < 10) {
      toast('A valid 10-digit mobile or day phone number is required for online banking enrollment.');
      return;
    }

    const st0 = getState();
    const profileDigits = normalizeSsnDigits(st0.player?.ssnFull);
    const submittedDigits = normalizeSsnDigits(ssnRaw);
    const actorBySsn = window.ActorDB?.getBySSN ? window.ActorDB.getBySSN(ssnRaw) : null;
    const actorDigits = normalizeSsnDigits(actorBySsn?.ssn);
    if (!profileDigits || !submittedDigits || profileDigits !== submittedDigits) {
      toast('SSN must match your CorpOS Personal Profile exactly.');
      return;
    }
    if (actorBySsn) {
      const legalMatch = String(actorBySsn.full_legal_name || '').trim().toLowerCase() === legal.toLowerCase();
      const dobMatch = !dob || !actorBySsn.dob || String(actorBySsn.dob).trim() === String(dob).trim();
      if (!legalMatch || !dobMatch || (actorDigits && actorDigits !== submittedDigits)) {
        toast('SSA verification failed for this SSN and legal identity.');
        return;
      }
    }

    if (bankId === 'fncb' && accountType === 'business_checking') {
      const hasLlc = (st0.companies || []).some((c) => /LLC|L\.L\.C\./i.test(c.name || ''));
      if (!hasLlc) {
        toast('Business checking requires a registered LLC on file (Federal Business Registry).');
        return;
      }
    }

    const rules = rulesForBankId(bankId);
    let openingDeposit = 0;
    if (bankId === 'pacific') {
      openingDeposit = Math.floor(Number(q(host, '[data-bank-field="reg-open-dep"]')?.value) || 0);
      const minP = rules?.minOpeningDeposit ?? 10000;
      if (openingDeposit < minP) {
        toast(`Pacific Rim requires at least ${minP.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} opening deposit from First National checking.`);
        return;
      }
      const fncb = st0.accounts.find((x) => x.id === 'fncb');
      if (!fncb || (fncb.balance || 0) < openingDeposit) {
        toast('Insufficient First National checking balance for the opening deposit.');
        return;
      }
    }

    if (bankId === 'darkweb') {
      const refForm = q(host, '[data-bank-field="reg-referral"]')?.value?.trim().toUpperCase() || '';
      const refSess = String(getSessionState().banking?.darkWebReferralCode || '')
        .trim()
        .toUpperCase();
      const ref = refForm || refSess;
      if (!DARKWEB_REFERRAL_CODES.includes(ref)) {
        toast('Valid referral code required (check Black Cherry handoff or use DEVREF in development).');
        return;
      }
      openingDeposit = Math.floor(Number(q(host, '[data-bank-field="reg-open-dep"]')?.value) || 0);
      if (openingDeposit < DARKWEB_MIN_OPEN) {
        toast(`Minimum opening ledger credit is ${DARKWEB_MIN_OPEN.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} from checking.`);
        return;
      }
      const fncb = st0.accounts.find((x) => x.id === 'fncb');
      if (!fncb || (fncb.balance || 0) < openingDeposit) {
        toast('Insufficient First National checking balance for the onion ledger credit.');
        return;
      }
    }

    const verdict = classifyBankEnrollment(st0, { legalName: legal, dob, ssnRaw });

    patchState((st) => {
      const a = st.accounts.find((x) => x.id === bankId);
      if (!a) return st;
      const prefix = rules?.accountPrefix || 'ACC';
      a.accountNumber = generateBankAccountNumber(prefix);
      a.onlineRegistered = true;
      if (typeof a.loanBalance !== 'number') a.loanBalance = 0;
      a.enrolledUserId = user.toUpperCase();
      a.enrolledPin = pin;
      a.enrolledPassword = pin;
      a.accountType = accountType;
      a.memberSinceElapsedMs = st.sim.elapsedMs;
      if (!Array.isArray(a.transactions)) a.transactions = [];
      a.loanDetail = null;
      a.meridianInterestWeekIndex = -1;

      const digits = submittedDigits;
      a.enrolledProfile = {
        legalName: legal,
        dob,
        ssnDigits: digits,
        address: addr,
        phone,
        email,
        employmentStatus: employment,
        employerName: employer,
        annualIncome,
        idType,
        idNumber,
        motherMaiden: maiden,
        enrolledAtElapsedMs: st.sim.elapsedMs
      };

      if (openingDeposit > 0) {
        const fncb = primaryChecking(st);
        if (fncb) {
          fncb.balance = (fncb.balance || 0) - openingDeposit;
          pushAccountTx(st, fncb, {
            type: 'transfer_out',
            amount: -openingDeposit,
            balanceAfter: fncb.balance,
            description: `Funding for ${a.name} (${a.accountNumber})`,
            complianceFlag: complianceNoticeAmount('fncb', openingDeposit)
          });
        }
        a.balance = (a.balance || 0) + openingDeposit;
        pushAccountTx(st, a, {
          type: 'transfer_in',
          amount: openingDeposit,
          balanceAfter: a.balance,
          description: 'Initial deposit from First National checking',
          complianceFlag: complianceNoticeAmount(bankId, openingDeposit)
        });
        appendBankingTransaction(st, {
          bankName: a.name,
          accountNumber: a.accountNumber,
          type: 'open_deposit',
          amount: openingDeposit,
          destinationAccountNumber: a.accountNumber,
          destinationBank: a.name,
          complianceFlag:
            complianceNoticeAmount('fncb', openingDeposit) ||
            complianceNoticeAmount(bankId, openingDeposit),
          description: 'Account opening transfer'
        });
      }

      if (!verdict.ok) {
        scheduleEnrollmentViolation(st, bankId, verdict.violation, IDENTITY_FINE_DELAY_DAYS);
      }
      return st;
    });

    viewByBank[bankId] = 'landing';
    const accAfter = getState().accounts.find((x) => x.id === bankId);
    if (verdict.ok) {
      toast(
        `Enrollment accepted — account ${accAfter?.accountNumber || ''}. Sign in with your User ID and PIN.`
      );
    } else {
      toast(
        `Enrollment submitted for ${meta.title}. A ${IDENTITY_FINE_DELAY_DAYS}-day verification window applies; discrepancies may result in penalties.`
      );
    }
    try {
      const simMs = getState().sim?.elapsedMs ?? 0;
      SMS.send({
        from: 'CORPOS_SYSTEM',
        message: `${meta.title}: Online banking enrollment for User ID ${user}. Account ${accAfter?.accountNumber || 'pending'}. If you did not enroll, contact the branch.`,
        gameTime: simMs
      });
    } catch {
      /* ignore */
    }
    const pk = host.getAttribute('data-bank-page');
    if (pk) bankNavigate(pk, '');
    else rerenderWnet();
    return;
  }

  if (action === 'logout') {
    sessionByBank[bankId] = false;
    viewByBank[bankId] = 'landing';
    toast('Session ended.');
    rerenderWnet();
    return;
  }

  const acc = getState().accounts.find((x) => x.id === bankId);
  if (
    action === 'deposit' ||
    action === 'withdraw' ||
    action === 'loan-take' ||
    action === 'loan-pay' ||
    action === 'transfer'
  ) {
    if (!requireOnlineSession(bankId)) return;
    if (!acc || !verifyTxnPin(host, acc)) return;
  }

  if (action === 'deposit') {
    const raw = q(host, '[data-bank-field="dep-amt"]')?.value;
    const amt = Math.floor(Number(raw));
    if (!Number.isFinite(amt) || amt < 1) {
      toast('Enter a valid deposit amount.');
      return;
    }
    const rules = rulesForBankId(bankId);
    const flagged = complianceNoticeAmount(bankId, amt);
    patchState((st) => {
      const a = st.accounts.find((x) => x.id === bankId);
      if (!a) return st;
      a.balance = (a.balance || 0) + amt;
      pushAccountTx(st, a, {
        type: 'deposit',
        amount: amt,
        balanceAfter: a.balance,
        description: 'Deposit (simulated ACH)',
        complianceFlag: flagged
      });
      appendBankingTransaction(st, {
        bankName: a.name,
        accountNumber: a.accountNumber,
        type: 'deposit',
        amount: amt,
        complianceFlag: flagged,
        description: 'Deposit'
      });
      return st;
    });
    toast({
      key: TOAST_KEYS.BANK_DEPOSIT,
      title: 'Deposit Posted',
      message: `Deposited ${amt.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} (simulated settlement).`,
      icon: '🏦'
    });
    if (flagged) {
      const simMs = getState().sim?.elapsedMs || 0;
      SMS.send({ from: 'FRA', message: `NOTICE: A deposit on your account in the amount of ${amt.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} has been flagged for standard compliance review per Federal Mandate 2000-CR7. No action is required at this time.`, gameTime: simMs });
    }
    const ref = `SIM-${String(getState().sim?.elapsedMs ?? 0).slice(-8)}`;
    logAct(
      'BANK_DEPOSIT',
      `$${amt} deposited to ${acc?.name || meta.title} — ref ${ref}`
    );
    rerenderWnet();
    return;
  }

  if (action === 'withdraw') {
    const raw = q(host, '[data-bank-field="wd-amt"]')?.value;
    const amt = Math.floor(Number(raw));
    if (!Number.isFinite(amt) || amt < 1) {
      toast('Enter a valid withdrawal amount.');
      return;
    }
    if (!acc || acc.balance < amt) {
      toast('Insufficient available balance.');
      return;
    }
    const flagged = complianceNoticeAmount(bankId, amt);
    patchState((st) => {
      const a = st.accounts.find((x) => x.id === bankId);
      if (!a) return st;
      a.balance = (a.balance || 0) - amt;
      pushAccountTx(st, a, {
        type: 'withdraw',
        amount: -amt,
        balanceAfter: a.balance,
        description: 'Withdrawal',
        complianceFlag: flagged
      });
      appendBankingTransaction(st, {
        bankName: a.name,
        accountNumber: a.accountNumber,
        type: 'withdraw',
        amount: amt,
        complianceFlag: flagged,
        description: 'Withdrawal'
      });
      return st;
    });
    toast({
      key: TOAST_KEYS.BANK_WITHDRAWAL,
      title: 'Withdrawal Posted',
      message: 'Withdrawal posted. (Funds simulated.)',
      icon: '🏦'
    });
    if (flagged) {
      const simMs = getState().sim?.elapsedMs || 0;
      SMS.send({ from: 'FRA', message: `NOTICE: A withdrawal on your account has been flagged for standard compliance review per Federal Mandate 2000-CR7. No action is required at this time.`, gameTime: simMs });
    }
    logAct(
      'BANK_WITHDRAWAL',
      `$${amt} withdrawn from ${acc?.name || meta.title}`,
      { suspicious: amt > 5000 }
    );
    rerenderWnet();
    return;
  }

  if (action === 'loan-take') {
    const rules = rulesForBankId(bankId);
    if (!rules?.offersLoans) {
      toast('This institution does not offer simulated installment credit.');
      return;
    }
    const raw = q(host, '[data-bank-field="loan-take-amt"]')?.value;
    const amt = Math.floor(Number(raw));
    if (!Number.isFinite(amt) || amt < 500) {
      toast('Enter a valid loan amount (minimum $500).');
      return;
    }
    const tiers = rules.loanTiers || [];
    if (tiers.length && !tiers.includes(amt)) {
      toast(`Loan amount must match an advertised tier: ${tiers.join(', ')}.`);
      return;
    }
    const flagged = complianceNoticeAmount(bankId, amt);
    patchState((st) => {
      const a = st.accounts.find((x) => x.id === bankId);
      if (!a) return st;
      a.balance = (a.balance || 0) + amt;
      a.loanBalance = (a.loanBalance || 0) + amt;
      rebuildLoanDetail(a, st);
      pushAccountTx(st, a, {
        type: 'loan_disburse',
        amount: amt,
        balanceAfter: a.balance,
        description: `Installment disbursement @ ${rules.loanAprPercent}% APR`,
        complianceFlag: flagged
      });
      appendBankingTransaction(st, {
        bankName: a.name,
        accountNumber: a.accountNumber,
        type: 'loan_disburse',
        amount: amt,
        complianceFlag: flagged,
        description: 'Loan disbursement'
      });
      return st;
    });
    toast({
      key: TOAST_KEYS.BANK_LOAN_APPROVED,
      title: 'Loan Approved',
      message: 'Loan proceeds credited. Principal and APR recorded on file.',
      icon: '💼'
    });
    rerenderWnet();
    return;
  }

  if (action === 'loan-pay') {
    const raw = q(host, '[data-bank-field="loan-pay-amt"]')?.value;
    const amt = Math.floor(Number(raw));
    if (!Number.isFinite(amt) || amt < 1) {
      toast('Enter a payment amount.');
      return;
    }
    const loan = acc?.loanBalance || 0;
    const bal = acc?.balance || 0;
    if (loan < 1) {
      toast('No loan balance at this institution.');
      return;
    }
    if (bal < 1) {
      toast('No available balance to apply to the loan.');
      return;
    }
    const pay = Math.min(amt, loan, bal);
    if (pay < 1) {
      toast('Payment amount is too small given your balance and loan.');
      return;
    }
    patchState((st) => {
      const a = st.accounts.find((x) => x.id === bankId);
      if (!a) return st;
      const L = a.loanBalance || 0;
      const B = a.balance || 0;
      const p = Math.min(amt, L, B);
      if (p < 1) return st;
      a.balance = B - p;
      a.loanBalance = L - p;
      rebuildLoanDetail(a, st);
      pushAccountTx(st, a, {
        type: 'loan_payment',
        amount: -p,
        balanceAfter: a.balance,
        description: 'Loan principal payment',
        complianceFlag: false
      });
      appendBankingTransaction(st, {
        bankName: a.name,
        accountNumber: a.accountNumber,
        type: 'loan_payment',
        amount: p,
        complianceFlag: false,
        description: 'Loan payment'
      });
      return st;
    });
    toast('Loan payment applied from available balance.');
    rerenderWnet();
    return;
  }

  if (action === 'transfer') {
    const destRaw = q(host, '[data-bank-field="xfer-to"]')?.value || '';
    const rawAmt = q(host, '[data-bank-field="xfer-amt"]')?.value;
    const amt = Math.floor(Number(rawAmt));
    if (!Number.isFinite(amt) || amt < 1) {
      toast('Enter a valid transfer amount.');
      return;
    }
    if (!acc || (acc.balance || 0) < amt) {
      toast('Insufficient available balance for this transfer.');
      return;
    }

    const dstCheck = findAccountByFullNumber(getState(), destRaw);
    if (!dstCheck) {
      toast('Unknown destination account number. Use PREFIX-###### format.');
      return;
    }
    if (
      acc.accountNumber &&
      dstCheck.accountNumber &&
      acc.accountNumber === dstCheck.accountNumber
    ) {
      toast('Cannot transfer to the same account.');
      return;
    }

    const tier3Stub = bankId === 'darkweb' && amt >= 100000;

    patchState((st) => {
      const src = st.accounts.find((x) => x.id === bankId);
      const dst = findAccountByFullNumber(st, destRaw);
      if (!src || !dst) return st;
      if (src.accountNumber && dst.accountNumber && src.accountNumber === dst.accountNumber) {
        return st;
      }
      if ((src.balance || 0) < amt) return st;

      const dstRules = rulesForBankId(dst.id);
      let complianceFlag =
        complianceNoticeAmount(bankId, amt) || complianceNoticeAmount(dst.id, amt);
      if (bankId === 'pacific' && dstRules?.accountPrefix !== 'PRF') {
        complianceFlag = true;
      }

      src.balance = (src.balance || 0) - amt;
      dst.balance = (dst.balance || 0) + amt;

      pushAccountTx(st, src, {
        type: 'transfer_out',
        amount: -amt,
        balanceAfter: src.balance,
        description: `Outbound to ${dst.accountNumber}`,
        complianceFlag
      });
      pushAccountTx(st, dst, {
        type: 'transfer_in',
        amount: amt,
        balanceAfter: dst.balance,
        description: `Inbound from ${src.accountNumber}`,
        complianceFlag
      });

      appendBankingTransaction(st, {
        bankName: src.name,
        accountNumber: src.accountNumber,
        type: 'transfer',
        amount: amt,
        destinationAccountNumber: dst.accountNumber,
        destinationBank: dst.name,
        complianceFlag,
        description: 'Interbank transfer'
      });

      return st;
    });

    if (tier3Stub) {
      toast('Tier-3 agent routing (stub): large onion transfer mirrored to federal watchlist.');
    }
    toast({
      key: TOAST_KEYS.BANK_TRANSFER,
      title: 'Transfer Completed',
      message: 'Transfer completed.',
      icon: '⇄'
    });
    const dst = findAccountByFullNumber(getState(), destRaw);
    logAct(
      'BANK_TRANSFER',
      `$${amt} transferred to account ${dst?.accountNumber || destRaw}`,
      { suspicious: amt > 9000 }
    );
    rerenderWnet();
    return;
  }
}

export function wireBankInteractions(container) {
  const host =
    container?.matches?.('[data-bank-site]') ? container : container?.querySelector?.('[data-bank-site]');
  if (!host) return;

  host.querySelectorAll('[data-bank-nav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const nav = el.getAttribute('data-bank-nav');
      if (nav) handleBankNavIntent(host, nav);
    });
  });

  host.querySelectorAll('[data-bank-action]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = el.getAttribute('data-bank-action');
      if (action) runBankAction(host, action);
    });
  });

  host.querySelectorAll('[data-bank-subpath]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pk = host.getAttribute('data-bank-page');
      const sub = el.getAttribute('data-bank-subpath') || '';
      if (pk) bankNavigate(pk, sub);
    });
  });
}

export function bindBankRoot(root) {
  wireBankInteractions(root);
}

export function bankHtmlForPageKey(pageKey, state, subPath = '') {
  const meta = BANK_META[pageKey];
  if (!meta) return null;
  const ui = getBankUiState(meta.id);
  return buildBankPageHtml(pageKey, state, ui, subPath);
}
