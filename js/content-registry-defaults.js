/** Default government config — matches content pipeline schema (CONTEXT + design spec). */

export const PIPELINE_PAGES_FILE = 'pages-pipeline.json';

export function createDefaultGovernment() {
  return {
    jurisdiction: 'United States — Federal',
    mandateId: '2000-CR7',
    mandateName: 'Federal Business Compliance Mandate',
    effectiveDate: 'January 1, 2000',
    taxSystem: {
      corporateTaxRate: 0.35,
      personalIncomeTaxRate: 0.28,
      capitalGainsTaxRate: 0.2,
      taxFilingFrequency: 'quarterly',
      taxDeadlineWeek: 12,
      penaltyForLateFiling: 2500,
      penaltyForNonFiling: 10000,
      fraAuditThreshold: 10000
    },
    regulatoryThresholds: {
      cashTransactionReportingThreshold: 10000,
      suspiciousActivityReportThreshold_harbor: 3000,
      suspiciousActivityReportThreshold_pacificrim: 5000,
      structuringPatternWindow: 7,
      structuringPatternCount: 3
    },
    complianceValues: {
      corposBaseScrutinyLevel: 1.0,
      auditFrequencyModifier: 1.0,
      investigatorAssignmentSpeed: 1.0,
      fineMultiplier: 1.0,
      dismissalDCModifier: 0
    },
    hiddenGovernmentValues: {
      taxComplianceWeight: 3.0,
      charitableActivityWeight: 1.5,
      judicialRecordWeight: 2.5,
      crimeSeverityWeight: 2.5,
      corporateAggressionWeight: 1.5
    },
    investigatorFineRanges: {
      tier1Min: 15000,
      tier1Max: 50000,
      tier2Min: 40000,
      tier2Max: 150000,
      tier3Min: 100000,
      tier3Max: 500000,
      tier1FrequencyMin: 5,
      tier1FrequencyMax: 10,
      tier2FrequencyMin: 3,
      tier2FrequencyMax: 7,
      tier3FrequencyMin: 2,
      tier3FrequencyMax: 5
    },
    notorietyThresholds: {
      minorIrregularities: 25,
      nonCompliant: 50,
      underReview: 75,
      underInvestigation: 100,
      highRisk: 125,
      federalInterest: 150,
      priorityTarget: 175,
      federalTarget: 200
    },
    exposureThresholds: {
      onRecord: 11,
      flagged: 26,
      monitored: 41,
      formalInquiry: 56,
      underAudit: 71,
      activeInvestigation: 86,
      regulatorySeizure: 100
    },
    seizureRules: {
      emergencyAppealDC: 20,
      seizureClockDays: 30,
      reducedClockDays: 30
    },
    governmentPersonnel: [],
    activeAgencies: [],
    loreNotes: ''
  };
}

export function createEmptyContentRegistry() {
  return {
    npcs: [],
    companies: [],
    government: createDefaultGovernment(),
    pages: []
  };
}

function deepFill(defaults, obj) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) return defaults;
  const out = { ...defaults };
  for (const k of Object.keys(defaults)) {
    if (obj[k] != null && typeof obj[k] === 'object' && !Array.isArray(obj[k]) && typeof defaults[k] === 'object' && !Array.isArray(defaults[k])) {
      out[k] = deepFill(defaults[k], obj[k]);
    } else if (obj[k] !== undefined) {
      out[k] = obj[k];
    }
  }
  return out;
}

export function ensureContentRegistry(st) {
  if (!st.contentRegistry || typeof st.contentRegistry !== 'object') {
    st.contentRegistry = createEmptyContentRegistry();
    return st;
  }
  const cr = st.contentRegistry;
  if (!Array.isArray(cr.npcs)) cr.npcs = [];
  if (!Array.isArray(cr.companies)) cr.companies = [];
  if (!cr.government || typeof cr.government !== 'object') {
    cr.government = createDefaultGovernment();
  } else {
    cr.government = deepFill(createDefaultGovernment(), cr.government);
  }
  if (!Array.isArray(cr.pages)) cr.pages = [];
  return st;
}
