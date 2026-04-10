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
