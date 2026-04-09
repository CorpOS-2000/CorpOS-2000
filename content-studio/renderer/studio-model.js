/** Shared data shapes — mirrors game js/pipeline (pure). */
(function (global) {
  function newNpcId() {
    return `npc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function newCoId() {
    return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  function newPageId() {
    return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  function newAdId() {
    return `ad-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }

  function judicialRecordDcModifier(entryCount) {
    const n = Number(entryCount) || 0;
    if (n <= 0) return 0;
    if (n === 1) return 2;
    if (n === 2) return 4;
    if (n === 3) return 7;
    if (n === 4) return 11;
    return 16;
  }

  function reputationBonusFromPerception(perceptionStats) {
    const p = perceptionStats || { public: 50, corporate: 50, government: 50 };
    return Math.round(((Number(p.public) || 0) + (Number(p.corporate) || 0) + (Number(p.government) || 0)) / 3) * 100;
  }

  function computeAdjustedValuation(c) {
    const rev = Number(c.weeklyRevenue) || 0;
    const assets = Number(c.totalAssets) || 0;
    const debt = Number(c.totalDebt) || 0;
    const liab = Number(c.totalLiabilities) || 0;
    const rep = reputationBonusFromPerception(c.perceptionStats);
    return rev * 4 + assets + rep - debt - liab;
  }

  function contractTierForRank(rank, total) {
    const r = Number(rank) || 999;
    const t = Math.max(1, Number(total) || 1);
    if (r <= 5 && t >= 5) return 4;
    if (r <= Math.max(8, Math.ceil(t * 0.25))) return 3;
    if (r <= Math.ceil(t * 0.6)) return 2;
    return 1;
  }

  function updateCompaniesLedger(companies) {
    const list = Array.isArray(companies) ? companies.map((c) => ({ ...c })) : [];
    list.forEach((c) => {
      c.adjustedValuation = computeAdjustedValuation(c);
    });
    list.sort((a, b) => (b.adjustedValuation || 0) - (a.adjustedValuation || 0));
    const total = list.length;
    let rank = 1;
    return list.map((c) => {
      const r = rank++;
      return {
        ...c,
        adjustedValuation: computeAdjustedValuation(c),
        ledgerRanking: r,
        contractTier: contractTierForRank(r, total)
      };
    });
  }

  function defaultNpc(overrides) {
    const o = overrides || {};
    return {
      id: o.id || newNpcId(),
      type: 'person',
      fullName: '',
      age: 0,
      dateOfBirth: '',
      gender: '',
      profession: '',
      employer: '',
      employerType: 'unemployed',
      homeAddress: '',
      phone: '',
      email: '',
      socialSecurityNumber: '',
      annualIncome: 0,
      netWorth: 0,
      lifestyle: 'middle',
      socialWeight: 0,
      socialWeightSource: '',
      perceptionStats: { public: 50, corporate: 50, government: 50 },
      opinionProfile: {
        playerOpinion: 0,
        corporateOpinion: 0,
        governmentOpinion: 0,
        corposOpinion: 0,
        rapidemartOpinion: 0
      },
      vulnerabilities: [],
      connectionNetwork: [],
      criminalRecord: [],
      contactAvailability: 'always',
      unlockRequirement: null,
      unlockCondition: '',
      blackCherryHandle: '',
      role: 'neutral',
      investigatorTier: null,
      modifiers: {},
      dialogueTags: [],
      loreNotes: '',
      isKeyCharacter: false,
      ...o
    };
  }

  function defaultCompany(overrides) {
    const o = overrides || {};
    return {
      id: o.id || newCoId(),
      type: 'company',
      legalName: '',
      tradingName: '',
      entityType: 'LLC',
      industry: '',
      registrationNumber: '',
      registrationDate: '',
      tier: 1,
      hqLocation: '',
      employeeCount: 0,
      weeklyRevenue: 0,
      weeklyExpenses: 0,
      totalAssets: 0,
      totalDebt: 0,
      totalLiabilities: 0,
      adjustedValuation: 0,
      perceptionStats: { public: 50, corporate: 50, government: 50 },
      notoriety: 0,
      corporateExposure: 0,
      judicialRecord: [],
      activeLawyer: 'none',
      activeInvestigator: null,
      activeLoans: [],
      bankAccounts: [],
      ownedAssets: [],
      ownerType: 'npc',
      ownerId: null,
      isPlayerCompany: false,
      companySlot: null,
      parentHolding: null,
      subsidiaries: [],
      combatCapabilities: {
        social: false,
        espionage: false,
        sabotage: false,
        cyber: false,
        legal: false
      },
      personalityType: 'balanced',
      rivalBehavior: {
        awarenessThreshold: 0,
        decisionStyle: 'reactive',
        memoryDuration: 0,
        allianceCapable: false,
        scalingType: 'player-tied'
      },
      ledgerRanking: 0,
      contractTier: 1,
      loreNotes: '',
      isKeyCompany: false,
      ...o
    };
  }

  function defaultPage(overrides) {
    const o = overrides || {};
    return {
      pageId: o.pageId || newPageId(),
      url: '',
      title: '',
      category: 'general',
      unlockRequirement: null,
      aestheticTheme: 'year2000-corporate',
      primaryColor: '#0a246a',
      secondaryColor: '#a6b5e7',
      backgroundColor: '#ffffff',
      siteName: '',
      siteTagline: '',
      logoText: '',
      navLinks: [],
      sections: [],
      footerText: '',
      hasShop: false,
      shopId: null,
      loginEnabled: false,
      loginConfig: {},
      eventTriggers: [],
      ...o
    };
  }

  function defaultAd(overrides) {
    const o = overrides || {};
    return {
      id: o.id || newAdId(),
      pageKey: 'home',
      position: 'banner-top',
      width: 468,
      height: 60,
      type: 'css-animation',
      src: null,
      animation: 'pulse',
      content: '',
      link: null,
      bgColor: '#ffffcc',
      borderColor: '#cc9900',
      label: 'ADVERTISEMENT',
      unlockRequirement: null,
      weight: 1,
      ...o
    };
  }

  function defaultAdsFile() {
    return { defaultRotationMs: 8000, ads: [] };
  }

  const INDUSTRIES = [
    'Technology',
    'Retail & E-Commerce',
    'Manufacturing',
    'Transportation & Logistics',
    'Media & Entertainment',
    'Telecommunications',
    'Advertising & Marketing',
    'Data & Analytics',
    'Security & Cyber Operations',
    'Finance & Markets'
  ];

  const ROLL_TYPES = [
    'negotiation',
    'legal',
    'finance',
    'reputation',
    'investigation',
    'contract',
    'compliance',
    'cyber',
    'operations',
    'generic'
  ];

  const CSS_ANIMATIONS = ['flash', 'pulse', 'slide-in', 'scroll-text', 'color-cycle', 'shake', 'typewriter', 'fade-loop', 'bounce', 'glitch'];

  const SECTION_TYPES = [
    'hero',
    'text',
    'newsFeed',
    'productGrid',
    'table',
    'form',
    'ad',
    'login',
    'profile',
    'links',
    'divider',
    'ticker'
  ];

  function socialWeightLabel(v) {
    const n = Number(v) || 0;
    if (n <= 20) return 'anonymous';
    if (n <= 40) return 'local presence';
    if (n <= 60) return 'regional influence';
    if (n <= 80) return 'national reach';
    return 'international authority';
  }

  function perceptionLabel(v) {
    const n = Number(v) || 0;
    if (n > 60) return 'trusted';
    if (n >= 30) return 'neutral';
    return 'distrusted';
  }

  function perceptionColor(v) {
    const n = Number(v) || 0;
    if (n > 60) return '#006600';
    if (n >= 30) return '#cc6600';
    return '#cc0000';
  }

  function opinionLabel(v) {
    const n = Number(v) || 0;
    if (n > 40) return 'strongly favorable';
    if (n > 10) return 'favorable';
    if (n >= -10) return 'neutral';
    if (n >= -40) return 'hostile';
    return 'strongly hostile';
  }

  function modifiersToList(modObj) {
    const o = modObj && typeof modObj === 'object' ? modObj : {};
    return Object.keys(o).map((k) => ({ rollType: k, value: o[k] }));
  }

  function listToModifiers(list) {
    const out = {};
    for (const row of list || []) {
      if (row.rollType) out[row.rollType] = Number(row.value) || 0;
    }
    return out;
  }

  function autoBlackCherryHandle(fullName) {
    const parts = String(fullName || '')
      .trim()
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return '';
    const last = parts[parts.length - 1].replace(/[^A-Z]/g, '');
    const initial = (parts[0][0] || '').replace(/[^A-Z]/g, '');
    return `${last}_${initial}`.replace(/^_+|_+$/g, '') || last || 'CONTACT';
  }

  global.StudioModel = {
    newNpcId,
    newCoId,
    newPageId,
    newAdId,
    judicialRecordDcModifier,
    reputationBonusFromPerception,
    computeAdjustedValuation,
    contractTierForRank,
    updateCompaniesLedger,
    defaultNpc,
    defaultCompany,
    defaultPage,
    defaultAd,
    defaultAdsFile,
    INDUSTRIES,
    ROLL_TYPES,
    CSS_ANIMATIONS,
    SECTION_TYPES,
    socialWeightLabel,
    perceptionLabel,
    perceptionColor,
    opinionLabel,
    modifiersToList,
    listToModifiers,
    autoBlackCherryHandle
  };
})(typeof window !== 'undefined' ? window : globalThis);
