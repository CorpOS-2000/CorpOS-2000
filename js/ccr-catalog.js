import { getState, isAppInstalled } from './gameState.js';

export const MAIN_REQUIREMENTS = [
  { id: 'website_dev',     label: 'Website Development',  baseMinUsd: 200 },
  { id: 'email_marketing', label: 'Email Marketing',      baseMinUsd: 120 },
  { id: 'data_entry',      label: 'Data Entry',           baseMinUsd: 80 },
  { id: 'tech_support',    label: 'Tech Support',         baseMinUsd: 100 },
  { id: 'consulting',      label: 'Business Consulting',  baseMinUsd: 150 }
];

export const MODULES = [
  // Website Development
  { id: 'web_dev',       label: 'Web Developer Module',  minIncrementUsd: 150, requiresAppId: 'webex-publisher', forRequirement: 'website_dev' },
  { id: 'web_publisher', label: 'Web Publisher Module',  minIncrementUsd: 100, requiresAppId: 'webex-publisher', forRequirement: 'website_dev' },
  { id: 'ui_theme',      label: 'UI Theme Module',       minIncrementUsd: 75,  requiresAppId: 'webex-publisher', forRequirement: 'website_dev' },
  { id: 'database',      label: 'Database Module',       minIncrementUsd: 120, requiresAppId: null,              forRequirement: 'website_dev' },
  { id: 'analytics',     label: 'Analytics Module',      minIncrementUsd: 90,  requiresAppId: null,              forRequirement: 'website_dev' },
  // Email Marketing
  { id: 'newsletter',    label: 'Newsletter Setup',      minIncrementUsd: 80,  requiresAppId: null, forRequirement: 'email_marketing' },
  { id: 'mailing_list',  label: 'Mailing List Manager',  minIncrementUsd: 60,  requiresAppId: null, forRequirement: 'email_marketing' },
  // Data Entry
  { id: 'spreadsheet',   label: 'Spreadsheet Entry',     minIncrementUsd: 40,  requiresAppId: null, forRequirement: 'data_entry' },
  { id: 'database_upd',  label: 'Database Update',       minIncrementUsd: 55,  requiresAppId: null, forRequirement: 'data_entry' },
  // Tech Support
  { id: 'remote_diag',   label: 'Remote Diagnostic',     minIncrementUsd: 50,  requiresAppId: null, forRequirement: 'tech_support' },
  { id: 'virus_scan',    label: 'Virus Scan',            minIncrementUsd: 35,  requiresAppId: null, forRequirement: 'tech_support' },
  // Consulting (no gated modules)
  { id: 'market_study',  label: 'Market Study',          minIncrementUsd: 100, requiresAppId: null, forRequirement: 'consulting' },
  { id: 'audit_prep',    label: 'Audit Preparation',     minIncrementUsd: 70,  requiresAppId: null, forRequirement: 'consulting' }
];

export function getRequirement(id) {
  return MAIN_REQUIREMENTS.find((r) => r.id === id) || null;
}

export function getUnlockedModules(requirementId) {
  const st = getState();
  return MODULES.filter((m) => {
    if (m.forRequirement !== requirementId) return false;
    if (m.requiresAppId && !isAppInstalled(m.requiresAppId, st)) return false;
    return true;
  });
}

export function getModuleById(id) {
  return MODULES.find((m) => m.id === id) || null;
}

export function computeMinTotal(requirementId, moduleIds) {
  const req = getRequirement(requirementId);
  const base = req?.baseMinUsd || 0;
  let modSum = 0;
  for (const mid of moduleIds) {
    const mod = MODULES.find((m) => m.id === mid);
    if (mod) modSum += mod.minIncrementUsd;
  }
  return base + modSum;
}
