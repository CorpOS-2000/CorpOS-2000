/** Per-bank rules for WorldNet banking (parody institutions). */

export const SIM_DAY_MS = 86400000;
export const SIM_WEEK_MS = 7 * SIM_DAY_MS;

export const PACIFIC_UNLOCK_DAYS = 90;
export const PACIFIC_UNLOCK_NET_WORTH = 500000;

export const DARKWEB_MIN_OPEN = 50000;
/** Valid referral codes for dark-web registration (Black Cherry can set session). */
export const DARKWEB_REFERRAL_CODES = ['BLACKCHERRY', 'MOONLIGHT', 'DEVREF'];

export const LARGE_TRANSFER_COMPLIANCE = 10000;

/** @typedef {'fncb'|'meridian'|'harbor'|'pacific'|'darkweb'} BankId */

/**
 * @type {Record<string, {
 *   pageKey: string,
 *   scrutinyComplianceAbove: number | null,
 *   loanTiers: number[],
 *   loanAprPercent: number,
 *   accountPrefix: string,
 *   federalMandateFooter: boolean,
 *   minOpeningDeposit: number,
 *   offersLoans: boolean,
 *   savingsApyPercent: number | null
 * }>}
 */
export const BANK_RULES = {
  fncb: {
    pageKey: 'bank',
    scrutinyComplianceAbove: 5000,
    loanTiers: [5000, 15000, 50000],
    loanAprPercent: 8,
    accountPrefix: 'FNCB',
    federalMandateFooter: true,
    minOpeningDeposit: 0,
    offersLoans: true,
    savingsApyPercent: null
  },
  meridian: {
    pageKey: 'bank_meridian',
    scrutinyComplianceAbove: 15000,
    loanTiers: [3000, 10000, 35000],
    loanAprPercent: 10,
    accountPrefix: 'MER',
    federalMandateFooter: true,
    minOpeningDeposit: 0,
    offersLoans: true,
    savingsApyPercent: 3.2
  },
  harbor: {
    pageKey: 'bank_harbor',
    scrutinyComplianceAbove: 25000,
    loanTiers: [1000, 5000, 15000],
    loanAprPercent: 13,
    accountPrefix: 'HCU',
    federalMandateFooter: true,
    minOpeningDeposit: 0,
    offersLoans: true,
    savingsApyPercent: null
  },
  pacific: {
    pageKey: 'bank_pacific',
    scrutinyComplianceAbove: null,
    loanTiers: [25000, 100000, 500000],
    loanAprPercent: 15,
    accountPrefix: 'PRF',
    federalMandateFooter: false,
    minOpeningDeposit: 10000,
    offersLoans: true,
    savingsApyPercent: null
  },
  darkweb: {
    pageKey: 'bank_darkweb',
    scrutinyComplianceAbove: null,
    loanTiers: [],
    loanAprPercent: 0,
    accountPrefix: 'DWB',
    federalMandateFooter: false,
    minOpeningDeposit: DARKWEB_MIN_OPEN,
    offersLoans: false,
    savingsApyPercent: null
  },
  davidmitchell: {
    pageKey: 'dmb',
    scrutinyComplianceAbove: 8000,
    loanTiers: [2500, 8000, 20000],
    loanAprPercent: 9,
    accountPrefix: 'DMB',
    federalMandateFooter: true,
    minOpeningDeposit: 0,
    offersLoans: false,
    savingsApyPercent: null
  }
};

export function rulesForBankId(bankId) {
  return BANK_RULES[bankId] || null;
}

export function complianceNoticeAmount(bankId, amount) {
  const r = rulesForBankId(bankId);
  if (!r || r.scrutinyComplianceAbove == null) return false;
  return amount > r.scrutinyComplianceAbove;
}
