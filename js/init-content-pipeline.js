import { getState, patchState, migrateStateIfNeeded, ensureWebsiteStats } from './gameState.js';
import { ensureContentRegistry, PIPELINE_PAGES_FILE } from './content-registry-defaults.js';
import { createNpcCreatorApi } from './pipeline/npc-creator.js';
import { createCompanyCreatorApi } from './pipeline/company-creator.js';
import { createGovernmentSystemApi } from './pipeline/government-system.js';
import { createWebsiteEditorApi } from './pipeline/website-editor.js';
import { setPipelinePageRoutes } from './worldnet-routes.js';
import { mountPageDefinition } from './worldnet-page-renderer.js';
import { getStoreById } from './worldnet-shop.js';

async function persistJson(filename, data) {
  if (window.corpOS?.saveDataFile) {
    await window.corpOS.saveDataFile(filename, JSON.stringify(data, null, 2));
  }
}

/**
 * @param {(name: string) => Promise<any>} loadJsonFile
 */
export async function initContentPipeline(loadJsonFile) {
  patchState((s) => migrateStateIfNeeded(s));

  let disk = null;
  if (window.corpOS?.loadContentRegistryDisk) {
    try {
      disk = await window.corpOS.loadContentRegistryDisk();
    } catch (e) {
      console.warn('[CorpOS] loadContentRegistryDisk:', e?.message || e);
    }
  }

  if (!disk && loadJsonFile) {
    try {
      let npcs = [];
      let companies = [];
      let govRaw = null;
      let pages = [];
      try {
        npcs = await loadJsonFile('npcs.json');
      } catch {
        npcs = [];
      }
      try {
        companies = await loadJsonFile('companies.json');
      } catch {
        companies = [];
      }
      try {
        govRaw = await loadJsonFile('government.json');
      } catch {
        govRaw = null;
      }
      try {
        pages = await loadJsonFile(PIPELINE_PAGES_FILE);
      } catch {
        pages = [];
      }
      disk = {
        npcs: Array.isArray(npcs) ? npcs : [],
        companies: Array.isArray(companies) ? companies : [],
        government: govRaw && typeof govRaw === 'object' && !Array.isArray(govRaw) ? govRaw : null,
        pages: Array.isArray(pages) ? pages : []
      };
    } catch {
      disk = null;
    }
  }

  if (disk && loadJsonFile) {
    let y2kSites = [];
    try { y2kSites = await loadJsonFile('worldnet-y2k-sites.json'); } catch { /* optional */ }
    if (Array.isArray(y2kSites) && y2kSites.length) {
      const existing = Array.isArray(disk.pages) ? disk.pages : [];
      const existingIds = new Set(existing.map(p => p?.pageId));
      const merged = [...existing, ...y2kSites.filter(s => s?.pageId && !existingIds.has(s.pageId))];
      disk.pages = merged;
    }
  }

  patchState((st) => {
    migrateStateIfNeeded(st);
    ensureContentRegistry(st);
    if (disk) {
      if (Array.isArray(disk.npcs)) st.contentRegistry.npcs = disk.npcs;
      if (Array.isArray(disk.companies)) st.contentRegistry.companies = disk.companies;
      if (disk.government && typeof disk.government === 'object' && !Array.isArray(disk.government)) {
        st.contentRegistry.government = disk.government;
      }
      if (Array.isArray(disk.pages)) st.contentRegistry.pages = disk.pages;
    }
    ensureContentRegistry(st);
    for (const p of st.contentRegistry.pages) ensureWebsiteStats(p);
    return st;
  });

  const stNow = getState();
  setPipelinePageRoutes(stNow.contentRegistry.pages || []);

  const persistNpcs = (npcs) => persistJson('npcs.json', npcs);
  const persistCompanies = (companies) => persistJson('companies.json', companies);
  const persistGovernment = (g) => persistJson('government.json', g);
  const persistPages = (pages) => persistJson(PIPELINE_PAGES_FILE, pages);

  const npcApi = createNpcCreatorApi({
    getState,
    patchState,
    persistNpcs
  });

  const companyApi = createCompanyCreatorApi({
    getState,
    patchState,
    persistCompanies
  });

  companyApi.updateLedgerRankings();

  const govApi = createGovernmentSystemApi({
    getState,
    patchState,
    persistGovernment
  });

  const websiteApi = createWebsiteEditorApi({
    getState,
    patchState,
    persistPages,
    renderPageDefinition: (def, el) => {
      const headlines = window.__wnetNewsHeadlines || [];
      mountPageDefinition(el, def, {
        newsItems: headlines,
        getShopById,
        onNavigateToUrl: (url) => {
          if (window.wnetNav) window.wnetNav('addr', '', {});
          const addr = document.getElementById('wnet-addr');
          if (addr) addr.value = url;
        }
      });
    }
  });

  window.WorldNet = {
    ...(window.WorldNet || {}),
    npcs: npcApi,
    companies: companyApi,
    government: govApi,
    pages: websiteApi
  };

  return { npcApi, companyApi, govApi, websiteApi };
}

export function refreshPipelineRoutes() {
  setPipelinePageRoutes(getState().contentRegistry?.pages || []);
}

/**
 * Hot-reload one category from disk (Electron file watch).
 * @param {string} category npcs | companies | government | pages | ads | shops
 * @param {(name: string) => Promise<any>} loadJsonFile
 */
export async function reloadContentCategoryFromDisk(category, loadJsonFile) {
  try {
    if (category === 'npcs') {
      const j = await loadJsonFile('npcs.json');
      patchState((st) => {
        ensureContentRegistry(st);
        st.contentRegistry.npcs = Array.isArray(j) ? j : [];
        return st;
      });
    } else if (category === 'companies') {
      const j = await loadJsonFile('companies.json');
      patchState((st) => {
        ensureContentRegistry(st);
        st.contentRegistry.companies = Array.isArray(j) ? j : [];
        return st;
      });
      window.WorldNet?.companies?.updateLedgerRankings?.();
    } else if (category === 'government') {
      const j = await loadJsonFile('government.json');
      patchState((st) => {
        ensureContentRegistry(st);
        if (j && typeof j === 'object' && !Array.isArray(j)) st.contentRegistry.government = j;
        ensureContentRegistry(st);
        return st;
      });
    } else if (category === 'pages') {
      let j = [];
      try {
        j = await loadJsonFile(PIPELINE_PAGES_FILE);
      } catch {
        j = [];
      }
      patchState((st) => {
        ensureContentRegistry(st);
        st.contentRegistry.pages = Array.isArray(j) ? j : [];
        for (const p of st.contentRegistry.pages) ensureWebsiteStats(p);
        return st;
      });
      refreshPipelineRoutes();
    }
  } catch (e) {
    console.warn('[CorpOS] hot-reload', category, e?.message || e);
  }
}
