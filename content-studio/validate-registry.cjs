const fs = require('fs');
const path = require('path');

function normalizeUrlKey(u) {
  try {
    const x = new URL(String(u || '').includes('://') ? u : `http://${u}`);
    return `${x.hostname}${x.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return String(u || '').toLowerCase();
  }
}

function validateContentRegistry(reg, dataDir) {
  const errors = [];
  const warnings = [];
  const structuredErrors = [];
  const baseDir = dataDir || '';

  function addError(engine, recordId, field, message) {
    errors.push(message);
    structuredErrors.push({ engine, recordId: recordId || null, field: field || null, message });
  }
  function addWarn(engine, recordId, field, message) {
    warnings.push(message);
    structuredErrors.push({ engine, recordId: recordId || null, field: field || null, message, level: 'warning' });
  }

  const cr = reg || {};
  const npcs = Array.isArray(cr.npcs) ? cr.npcs : [];
  const companies = Array.isArray(cr.companies) ? cr.companies : [];
  const pages = Array.isArray(cr.pages) ? cr.pages : [];
  const ads = cr.ads;
  const shops = cr.shops;

  const npcIds = new Set();
  for (const n of npcs) {
    if (!n?.id) {
      addError('npc', null, 'id', 'NPC missing id');
      continue;
    }
    if (npcIds.has(n.id)) addError('npc', n.id, 'id', `Duplicate NPC id: ${n.id}`);
    npcIds.add(n.id);
    if (n.type !== 'person') addWarn('npc', n.id, 'type', `NPC ${n.id}: type should be "person"`);
  }

  const companyIds = new Set();
  for (const c of companies) {
    if (!c?.id) {
      addError('company', null, 'id', 'Company missing id');
      continue;
    }
    if (companyIds.has(c.id)) addError('company', c.id, 'id', `Duplicate company id: ${c.id}`);
    companyIds.add(c.id);
    if (c.type !== 'company') addWarn('company', c.id, 'type', `Company ${c.id}: type should be "company"`);
  }

  for (const n of npcs) {
    if (!n?.id) continue;
    const net = n.connectionNetwork || [];
    for (const conn of net) {
      const tid = conn?.connectedId;
      if (tid && !npcIds.has(tid)) addError('npc', n.id, 'connectionNetwork', `NPC ${n.id}: connection references missing NPC "${tid}"`);
    }
  }

  for (const c of companies) {
    if (!c?.id) continue;
    const subs = c.subsidiaries || [];
    for (const sid of subs) {
      if (sid && !companyIds.has(sid)) addError('company', c.id, 'subsidiaries', `Company ${c.id}: subsidiary "${sid}" not found`);
    }
    if (c.parentHolding && !companyIds.has(c.parentHolding)) {
      addError('company', c.id, 'parentHolding', `Company ${c.id}: parentHolding "${c.parentHolding}" not found`);
    }
  }

  const pageUrls = new Set(pages.map((p) => normalizeUrlKey(p?.url)));
  const pageIds = new Set(pages.map((p) => p?.pageId).filter(Boolean));

  if (ads && Array.isArray(ads.slots)) {
    for (const slot of ads.slots) {
      const pid = slot?.pageId;
      if (pid && !pages.some((p) => p.pageId === pid) && !pageUrls.has(normalizeUrlKey(String(pid)))) {
        addWarn('ads', null, 'slots', `Ad slot references unknown page: ${pid}`);
      }
    }
  }
  if (ads && typeof ads === 'object' && !Array.isArray(ads) && ads.byPage) {
    for (const k of Object.keys(ads.byPage || {})) {
      if (!pages.some((p) => p.pageId === k || normalizeUrlKey(p.url) === normalizeUrlKey(k))) {
        addWarn('ads', k, 'byPage', `ads.byPage key may be orphaned: ${k}`);
      }
    }
  }

  const adList = ads && Array.isArray(ads.ads) ? ads.ads : [];
  for (const ad of adList) {
    if (!ad?.id) {
      addError('ads', null, 'id', 'Ad missing id');
      continue;
    }
    const src = ad.src;
    if (src && typeof src === 'string' && src.startsWith('ad-assets/') && baseDir) {
      const full = path.join(baseDir, ...src.split('/'));
      if (!fs.existsSync(full)) addError('ads', ad.id, 'src', `Ad ${ad.id}: asset file missing: ${src}`);
    }
    const lk = ad.link || ad.pageKey;
    if (lk && !pageIds.has(lk) && !pages.some((p) => normalizeUrlKey(p.url) === normalizeUrlKey(String(lk)))) {
      addWarn('ads', ad.id, 'link', `Ad ${ad.id}: link/pageKey may be unknown: ${lk}`);
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
          addError('shops', p?.id || '?', 'shopId', `Product ${p?.id || '?'}: shopId "${p.shopId}" not found`);
        }
      }
    }
  }

  for (const p of pages) {
    if (p?.hasShop && p.shopId && Array.isArray(shops)) {
      if (!shops.some((s) => s.id === p.shopId)) {
        addWarn('web', p.pageId, 'shopId', `Page ${p.pageId}: shopId "${p.shopId}" not in shops.json`);
      }
    }
  }

  return { errors, warnings, structuredErrors };
}

module.exports = { validateContentRegistry };
