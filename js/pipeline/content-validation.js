import {
  getPageLayoutTemplate,
  deriveTemplateSlots,
  validateAdConfig
} from '../worldnet-ad-schema.js';

/**
 * Validates content registry files / in-memory snapshots.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateContentRegistry(reg) {
  const errors = [];
  const warnings = [];
  const cr = reg || {};
  const npcs = Array.isArray(cr.npcs) ? cr.npcs : [];
  const companies = Array.isArray(cr.companies) ? cr.companies : [];
  const pages = Array.isArray(cr.pages) ? cr.pages : [];
  const ads = cr.ads;
  const shops = cr.shops;

  const npcIds = new Set();
  for (const n of npcs) {
    if (!n?.id) {
      errors.push('NPC missing id');
      continue;
    }
    if (npcIds.has(n.id)) errors.push(`Duplicate NPC id: ${n.id}`);
    npcIds.add(n.id);
    if (n.type !== 'person') warnings.push(`NPC ${n.id}: type should be "person"`);
  }

  const companyIds = new Set();
  for (const c of companies) {
    if (!c?.id) {
      errors.push('Company missing id');
      continue;
    }
    if (companyIds.has(c.id)) errors.push(`Duplicate company id: ${c.id}`);
    companyIds.add(c.id);
    if (c.type !== 'company') warnings.push(`Company ${c.id}: type should be "company"`);
  }

  for (const n of npcs) {
    const net = n.connectionNetwork || [];
    for (const conn of net) {
      const tid = conn?.connectedId;
      if (tid && !npcIds.has(tid)) {
        errors.push(`NPC ${n.id}: connection references missing NPC "${tid}"`);
      }
    }
  }

  for (const c of companies) {
    const subs = c.subsidiaries || [];
    for (const sid of subs) {
      if (sid && !companyIds.has(sid)) {
        errors.push(`Company ${c.id}: subsidiary "${sid}" not found`);
      }
    }
    if (c.parentHolding && !companyIds.has(c.parentHolding)) {
      errors.push(`Company ${c.id}: parentHolding "${c.parentHolding}" not found`);
    }
  }

  const pageUrls = new Set(pages.map((p) => normalizeUrlKey(p?.url)));

  if (ads && Array.isArray(ads.slots)) {
    for (const slot of ads.slots) {
      const pid = slot?.pageId;
      if (pid && !pages.some((p) => p.pageId === pid) && !pageUrls.has(normalizeUrlKey(String(pid)))) {
        warnings.push(`Ad slot references unknown page: ${pid}`);
      }
    }
  }
  if (ads && typeof ads === 'object' && !Array.isArray(ads) && ads.byPage) {
    for (const k of Object.keys(ads.byPage || {})) {
      if (!pages.some((p) => p.pageId === k || normalizeUrlKey(p.url) === normalizeUrlKey(k))) {
        warnings.push(`ads.byPage key may be orphaned: ${k}`);
      }
    }
  }

  const shopIds = new Set();
  if (Array.isArray(shops)) {
    for (const s of shops) {
      if (s?.id) shopIds.add(s.id);
    }
    for (const s of shops) {
      for (const p of s?.products || []) {
        if (p?.shopId && !shopIds.has(p.shopId)) {
          errors.push(`Product ${p?.id || '?'}: shopId "${p.shopId}" not found`);
        }
      }
    }
  }

  for (const p of pages) {
    const layoutTemplate = p?.layoutTemplate || null;
    if (layoutTemplate && !getPageLayoutTemplate(layoutTemplate)) {
      errors.push(`Page ${p.pageId}: unknown layoutTemplate "${layoutTemplate}"`);
    }
    if (p?.hasAdSlots && layoutTemplate) {
      const validSlotIds = new Set(deriveTemplateSlots(layoutTemplate).map((s) => s.slotId));
      for (const slotId of p.adSlotPositions || []) {
        if (!validSlotIds.has(slotId)) {
          warnings.push(`Page ${p.pageId}: ad slot "${slotId}" is not in layout template "${layoutTemplate}"`);
        }
      }
    }
    if (p?.hasShop && p.shopId && Array.isArray(shops)) {
      if (!shops.some((s) => s.id === p.shopId)) {
        warnings.push(`Page ${p.pageId}: shopId "${p.shopId}" not in shops.json`);
      }
    }
  }

  if (ads && Array.isArray(ads.ads)) {
    for (const ad of ads.ads) {
      const { errors: adErrors } = validateAdConfig(ad);
      for (const err of adErrors) errors.push(`${ad?.id || 'unknown-ad'}: ${err}`);
    }
  }

  return { errors, warnings };
}

function normalizeUrlKey(u) {
  try {
    const x = new URL(String(u || '').includes('://') ? u : `http://${u}`);
    return `${x.hostname}${x.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return String(u || '').toLowerCase();
  }
}
