export const INSTALLABLE_APPS = Object.freeze({
  'media-player': {
    id: 'media-player',
    label: 'Media Player',
    icon: '🎵',
    sourceHost: 'devtools.net',
    downloadDurationMs: 45 * 60 * 1000,
    installDurationMs: 30 * 60 * 1000,
    trustLevel: 'verified',
    description: 'Win2K-style audio library, playlists, and system override playback for CorpOS 2000.',
    priceUsd: 39.99
  },
  'player-inventory': {
    id: 'player-inventory',
    label: 'Assets',
    icon: '🔢',
    sourceHost: 'corpos.com',
    downloadDurationMs: 20 * 60 * 1000,
    installDurationMs: 15 * 60 * 1000,
    trustLevel: 'verified',
    description:
      'Unified Assets desk: carried goods with visuals, websites, property, rentals, sales channels, and WebEx shop handoff.',
    priceUsd: 200
  },
  'admin-web': {
    id: 'admin-web',
    label: 'Web Editor',
    icon: '📝',
    sourceHost: 'devtools.net',
    downloadDurationMs: 1 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'verified',
    description: 'Build and edit WorldNet websites from inside CorpOS.',
    priceUsd: 149.99
  },
  'admin-company': {
    id: 'admin-company',
    label: 'Company Editor',
    icon: '🏭',
    sourceHost: 'devtools.net',
    downloadDurationMs: 1 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'verified',
    description: 'Create companies, update corporate records, and tune business data.',
    priceUsd: 179.99
  },
  'admin-npc': {
    id: 'admin-npc',
    label: 'NPC Creator',
    icon: '👤',
    sourceHost: 'devtools.net',
    downloadDurationMs: 1 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'verified',
    description: 'Generate and edit actors for the CorpOS registry.',
    priceUsd: 119.99
  },
  'admin-gov': {
    id: 'admin-gov',
    label: 'Government System',
    icon: '⚖️',
    sourceHost: 'devtools.net',
    downloadDurationMs: 1 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'verified',
    description: 'Manage government datasets, mandates, and regulatory content.',
    priceUsd: 229.99
  },
  'admin-axis': {
    id: 'admin-axis',
    label: 'Contacts & Relations',
    icon: '📇',
    sourceHost: 'devtools.net',
    downloadDurationMs: 1 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'verified',
    description: 'Manage contacts, contracts, and business relations through CCR.',
    priceUsd: 159.99
  },
  'webex-publisher': {
    id: 'webex-publisher',
    label: 'WebEx-Publisher',
    icon: '🌐',
    sourceHost: 'devtools.net',
    downloadDurationMs: 1 * 3600000,
    installDurationMs: 45 * 60 * 1000,
    trustLevel: 'verified',
    description: 'Build and publish e-commerce websites with drag-and-drop modules.',
    priceUsd: 199.99
  },
  'webexploiter': {
    id: 'webexploiter',
    label: 'WebExploiter v1.0',
    icon: '⚡',
    sourceHost: 'backrooms.hck',
    downloadDurationMs: 2 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'unverified',
    description: 'Cyber operations console. Target and degrade rival website statistics.',
    priceUsd: 899.99
  },

  'phantom-press': {
    id: 'phantom-press',
    label: 'Phantom Press v1.0',
    icon: '📰',
    sourceHost: '99669.net/tools',
    downloadDurationMs: 2 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'unverified',
    description:
      'Reputation warfare console. Plant stories, coordinate review campaigns, suppress coverage. Leaves significant trace.',
    priceUsd: 1299.99,
    warningText: 'Unverified source. Installation will be logged by CorpOS.',
    version: '1.0',
    baseId: 'phantom-press',
    requires: null
  },
  'phantom-press-v2': {
    id: 'phantom-press-v2',
    label: 'Phantom Press v2.0',
    icon: '📰',
    sourceHost: 'darkweb',
    downloadDurationMs: 2.5 * 3600000,
    installDurationMs: 1.5 * 3600000,
    trustLevel: 'dark',
    description:
      'Refined reputation warfare. +3 DC bonus on all operations. 65% notoriety cost. 30% reduced cooldowns. Partial trace only.',
    priceUsd: 2499.99,
    warningText: 'Dark web source. Upgrade replaces v1.0.',
    version: '2.0',
    baseId: 'phantom-press',
    requires: 'phantom-press',
    upgradeNote: 'Replaces v1.0. Requires Phantom Press v1.0 installed.'
  },
  'phantom-press-v3': {
    id: 'phantom-press-v3',
    label: 'Phantom Press v3.0',
    icon: '📰',
    sourceHost: 'darkweb',
    downloadDurationMs: 3 * 3600000,
    installDurationMs: 2 * 3600000,
    trustLevel: 'dark',
    description:
      'Surgical reputation system. +6 DC bonus. 35% notoriety cost. 55% reduced cooldowns. Zero trace — operations produce no Activity Log entries.',
    priceUsd: 4999.99,
    warningText: 'Requires referral unlock.',
    version: '3.0',
    baseId: 'phantom-press',
    requires: 'phantom-press-v2',
    requiresFlag: 'darkWebReferralUnlocked',
    upgradeNote: 'Requires Phantom Press v2.0 and a dark web referral code.'
  },

  'market-force': {
    id: 'market-force',
    label: 'MarketForce 2000 v1.0',
    icon: '📉',
    sourceHost: '99669.net/tools',
    downloadDurationMs: 2 * 3600000,
    installDurationMs: 1.5 * 3600000,
    trustLevel: 'unverified',
    description:
      'Financial market warfare. Engineer shortages, squeeze prices, attack supply chains. High notoriety trace.',
    priceUsd: 2499.99,
    warningText: 'Unverified source. Financial manipulation carries significant compliance risk.',
    version: '1.0',
    baseId: 'market-force',
    requires: null
  },
  'market-force-v2': {
    id: 'market-force-v2',
    label: 'MarketForce 2000 v2.0',
    icon: '📉',
    sourceHost: 'darkweb',
    downloadDurationMs: 3 * 3600000,
    installDurationMs: 2 * 3600000,
    trustLevel: 'dark',
    description:
      'Refined financial warfare. +3 DC. 65% notoriety cost. 30% faster cooldowns. Market manipulations harder to trace.',
    priceUsd: 4499.99,
    warningText: 'Dark web upgrade.',
    version: '2.0',
    baseId: 'market-force',
    requires: 'market-force',
    upgradeNote: 'Requires MarketForce v1.0 installed.'
  },
  'market-force-v3': {
    id: 'market-force-v3',
    label: 'MarketForce 2000 v3.0',
    icon: '📉',
    sourceHost: 'darkweb',
    downloadDurationMs: 4 * 3600000,
    installDurationMs: 3 * 3600000,
    trustLevel: 'dark',
    description:
      'Ghost-tier financial operations. +6 DC. 35% notoriety. 55% faster. Zero Activity Log trace. FRA cannot attribute operations to your account.',
    priceUsd: 8999.99,
    warningText: 'Requires referral unlock.',
    version: '3.0',
    baseId: 'market-force',
    requires: 'market-force-v2',
    requiresFlag: 'darkWebReferralUnlocked'
  },

  'ghost-corp': {
    id: 'ghost-corp',
    label: 'GhostCorp Suite v1.0',
    icon: '👻',
    sourceHost: 'darkweb',
    downloadDurationMs: 4 * 3600000,
    installDurationMs: 2 * 3600000,
    trustLevel: 'dark',
    description:
      'Anonymous corporate entity creation. Shell companies, proxy acquisitions, asset concealment. High federal exposure risk.',
    priceUsd: 3999.99,
    warningText: 'Dark web source. Installation logged as suspicious. Use at your own risk.',
    version: '1.0',
    baseId: 'ghost-corp',
    requires: null
  },
  'ghost-corp-v2': {
    id: 'ghost-corp-v2',
    label: 'GhostCorp Suite v2.0',
    icon: '👻',
    sourceHost: 'darkweb',
    downloadDurationMs: 5 * 3600000,
    installDurationMs: 3 * 3600000,
    trustLevel: 'dark',
    description:
      'Multi-layer shell architecture. +3 DC. 65% notoriety cost. Ownership chains are two levels deep — harder to unwind in Business Registry.',
    priceUsd: 6999.99,
    warningText: 'Dark web upgrade.',
    version: '2.0',
    baseId: 'ghost-corp',
    requires: 'ghost-corp',
    upgradeNote: 'Requires GhostCorp v1.0 installed.'
  },
  'ghost-corp-v3': {
    id: 'ghost-corp-v3',
    label: 'GhostCorp Suite v3.0',
    icon: '👻',
    sourceHost: 'darkweb',
    downloadDurationMs: 6 * 3600000,
    installDurationMs: 4 * 3600000,
    trustLevel: 'dark',
    description:
      'Twelve-layer shell architecture. +6 DC. 35% notoriety. Shells registered through three jurisdictions. FBCE forensic audit required to pierce ownership — buys significant time.',
    priceUsd: 12999.99,
    warningText: 'Requires referral unlock.',
    version: '3.0',
    baseId: 'ghost-corp',
    requires: 'ghost-corp-v2',
    requiresFlag: 'darkWebReferralUnlocked'
  },

  'dataminer-pro': {
    id: 'dataminer-pro',
    label: 'DataMiner Pro v1.0',
    icon: '🔬',
    sourceHost: '99669.net/tools',
    downloadDurationMs: 1.5 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'unverified',
    description:
      'Open-source intelligence aggregation. Actor dossiers, company mapping, banking pattern analysis. Operations noted in Activity Log.',
    priceUsd: 649.99,
    warningText: 'Unverified source. Data collection activities are monitored under Mandate 2000-CR7.',
    version: '1.0',
    baseId: 'dataminer-pro',
    requires: null
  },
  'dataminer-pro-v2': {
    id: 'dataminer-pro-v2',
    label: 'DataMiner Pro v2.0',
    icon: '🔬',
    sourceHost: '99669.net/tools',
    downloadDurationMs: 2 * 3600000,
    installDurationMs: 1.5 * 3600000,
    trustLevel: 'unverified',
    description:
      'Professional OSINT suite. +3 DC. 65% notoriety. Dossiers reveal 2 levels of relationship depth. Operations logged as generic system processes.',
    priceUsd: 1299.99,
    warningText: 'Upgrade replaces v1.0.',
    version: '2.0',
    baseId: 'dataminer-pro',
    requires: 'dataminer-pro',
    upgradeNote: 'Requires DataMiner Pro v1.0 installed.'
  },
  'dataminer-pro-v3': {
    id: 'dataminer-pro-v3',
    label: 'DataMiner Pro v3.0',
    icon: '🔬',
    sourceHost: 'darkweb',
    downloadDurationMs: 3 * 3600000,
    installDurationMs: 2 * 3600000,
    trustLevel: 'dark',
    description:
      'Classified OSINT capability. +6 DC. 35% notoriety. Full 3-level relationship mapping. Shell company piercing. Zero Activity Log trace.',
    priceUsd: 2999.99,
    warningText: 'Requires referral unlock.',
    version: '3.0',
    baseId: 'dataminer-pro',
    requires: 'dataminer-pro-v2',
    requiresFlag: 'darkWebReferralUnlocked'
  },

  'compliance-cannon': {
    id: 'compliance-cannon',
    label: 'Compliance Cannon v1.0',
    icon: '⚖',
    sourceHost: 'darkweb',
    downloadDurationMs: 3 * 3600000,
    installDurationMs: 2 * 3600000,
    trustLevel: 'dark',
    description:
      'Legal warfare. Anonymous FRA/FBCE complaints, fabricated audit triggers. Catastrophic blowback if traced — Class I felony exposure.',
    priceUsd: 1799.99,
    warningText: 'Dark web source. Submitting false federal reports is a Class I felony under Mandate 2000-CR7.',
    version: '1.0',
    baseId: 'compliance-cannon',
    requires: null
  },
  'compliance-cannon-v2': {
    id: 'compliance-cannon-v2',
    label: 'Compliance Cannon v2.0',
    icon: '⚖',
    sourceHost: 'darkweb',
    downloadDurationMs: 4 * 3600000,
    installDurationMs: 3 * 3600000,
    trustLevel: 'dark',
    description:
      'Hardened legal warfare. +3 DC. 65% notoriety. Complaints routed through two proxy operators — harder to trace back. Discovery risk halved.',
    priceUsd: 3499.99,
    warningText: 'Dark web upgrade.',
    version: '2.0',
    baseId: 'compliance-cannon',
    requires: 'compliance-cannon',
    upgradeNote: 'Requires Compliance Cannon v1.0 installed.'
  },
  'compliance-cannon-v3': {
    id: 'compliance-cannon-v3',
    label: 'Compliance Cannon v3.0',
    icon: '⚖',
    sourceHost: 'darkweb',
    downloadDurationMs: 5 * 3600000,
    installDurationMs: 4 * 3600000,
    trustLevel: 'dark',
    description:
      'Ghost-routed legal warfare. +6 DC. 35% notoriety. Complaints filed through foreign jurisdictions. Near-zero attribution.',
    priceUsd: 6999.99,
    warningText: 'Requires referral unlock.',
    version: '3.0',
    baseId: 'compliance-cannon',
    requires: 'compliance-cannon-v2',
    requiresFlag: 'darkWebReferralUnlocked'
  },

  'signal-scrub': {
    id: 'signal-scrub',
    label: 'SignalScrub v1.0',
    icon: '🔇',
    sourceHost: '99669.net/tools',
    downloadDurationMs: 1 * 3600000,
    installDurationMs: 45 * 60 * 1000,
    trustLevel: 'unverified',
    description:
      'Counter-surveillance. Degrade log entries, slow investigator escalation, noise bursts. Using this tool is itself suspicious.',
    priceUsd: 449.99,
    warningText: 'Unverified source. Counter-surveillance software is itself a compliance flag if discovered.',
    version: '1.0',
    baseId: 'signal-scrub',
    requires: null
  },
  'signal-scrub-v2': {
    id: 'signal-scrub-v2',
    label: 'SignalScrub v2.0',
    icon: '🔇',
    sourceHost: '99669.net/tools',
    downloadDurationMs: 1.5 * 3600000,
    installDurationMs: 1 * 3600000,
    trustLevel: 'unverified',
    description:
      'Refined counter-surveillance. +3 DC on all scrub operations. 65% notoriety cost. Scrub operations logged as routine system maintenance — not suspicious.',
    priceUsd: 899.99,
    warningText: 'Upgrade replaces v1.0.',
    version: '2.0',
    baseId: 'signal-scrub',
    requires: 'signal-scrub',
    upgradeNote: 'Requires SignalScrub v1.0 installed.'
  },
  'signal-scrub-v3': {
    id: 'signal-scrub-v3',
    label: 'SignalScrub v3.0',
    icon: '🔇',
    sourceHost: 'darkweb',
    downloadDurationMs: 2 * 3600000,
    installDurationMs: 1.5 * 3600000,
    trustLevel: 'dark',
    description:
      'Military-grade counter-surveillance. +6 DC. 35% notoriety. SignalScrub operations produce no Activity Log entry of any kind. Investigators lose 72h of tracking on each use.',
    priceUsd: 1999.99,
    warningText: 'Requires referral unlock.',
    version: '3.0',
    baseId: 'signal-scrub',
    requires: 'signal-scrub-v2',
    requiresFlag: 'darkWebReferralUnlocked'
  }
});

export function listInstallableApps() {
  return Object.values(INSTALLABLE_APPS);
}

export function getInstallableApp(appId) {
  return INSTALLABLE_APPS[String(appId || '')] || null;
}

export function isInstallableApp(appId) {
  return !!getInstallableApp(appId);
}

export function getSoftwarePurchasePriceUsd(appOrId) {
  const app = typeof appOrId === 'string' ? getInstallableApp(appOrId) : appOrId;
  const n = Number(app?.priceUsd);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

export function formatSoftwarePurchasePrice(appOrId) {
  const p = getSoftwarePurchasePriceUsd(appOrId);
  if (p <= 0) return 'Free';
  return `$${p.toFixed(2)}`;
}
