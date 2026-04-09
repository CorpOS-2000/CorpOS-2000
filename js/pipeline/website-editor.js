import { ensureContentRegistry, PIPELINE_PAGES_FILE } from '../content-registry-defaults.js';
import {
  listPageLayoutTemplates,
  getPageLayoutTemplate,
  deriveTemplateSlots,
  layoutTemplateForCategory
} from '../worldnet-ad-schema.js';

export function newPageId() {
  return `page-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultPageDef(overrides = {}) {
  const guessedTemplate = overrides.layoutTemplate || layoutTemplateForCategory(overrides.category);
  return {
    pageId: newPageId(),
    url: 'http://www.example.com/',
    title: 'Untitled Page',
    category: 'corporate',
    unlockRequirement: null,
    unlockCondition: '',
    aestheticTheme: 'year2000-corporate',
    primaryColor: '#cc0000',
    secondaryColor: '#0a246a',
    backgroundColor: '#ffffff',
    siteName: '',
    siteTagline: '',
    logoText: '',
    layoutTemplate: guessedTemplate,
    hasAdSlots: true,
    adSlotPositions: deriveTemplateSlots(guessedTemplate).map((s) => s.slotId),
    hasShop: false,
    shopId: null,
    requiresLogin: false,
    loginSystemId: null,
    sections: [],
    navLinks: [],
    footerText: '',
    metaTags: {},
    gameStateReaders: [],
    gameStateWriters: [],
    eventTriggers: [],
    ...overrides
  };
}

/**
 * @param {{ getState: () => object, patchState: (fn: Function) => void, persistPages?: (pages: object[]) => Promise<void>, renderPageDefinition?: (def: object, el: HTMLElement) => void }} ctx
 */
export function createWebsiteEditorApi(ctx) {
  function list() {
    const st = ctx.getState();
    ensureContentRegistry(st);
    return st.contentRegistry.pages;
  }

  function writePages(pages) {
    ctx.patchState((st) => {
      ensureContentRegistry(st);
      st.contentRegistry.pages = pages;
      return st;
    });
    if (ctx.persistPages) return ctx.persistPages(pages);
    return Promise.resolve();
  }

  const api = {
    createPage(pageData) {
      const p = defaultPageDef(pageData);
      if (pageData?.pageId) p.pageId = pageData.pageId;
      writePages([...list(), p]);
      return p;
    },

    updatePage(pageId, changes) {
      const pages = list().map((x) => (x.pageId === pageId ? { ...x, ...changes, pageId } : x));
      if (!pages.some((x) => x.pageId === pageId)) return null;
      writePages(pages);
      return pages.find((x) => x.pageId === pageId);
    },

    deletePage(pageId) {
      const next = list().filter((x) => x.pageId !== pageId);
      if (next.length === list().length) return false;
      writePages(next);
      return true;
    },

    getPage(pageId) {
      return list().find((x) => x.pageId === pageId) || null;
    },

    getAllPages() {
      return [...list()];
    },

    getPagesByCategory(category) {
      return list().filter((x) => x.category === category);
    },

    addSection(pageId, sectionData) {
      const p = api.getPage(pageId);
      if (!p) return null;
      const sid = sectionData?.sectionId || `sec-${Date.now()}`;
      const sections = [...(p.sections || []), { sectionId: sid, ...sectionData }];
      return api.updatePage(pageId, { sections });
    },

    removeSection(pageId, sectionId) {
      const p = api.getPage(pageId);
      if (!p) return null;
      const sections = (p.sections || []).filter((s) => s.sectionId !== sectionId);
      return api.updatePage(pageId, { sections });
    },

    reorderSections(pageId, newOrder) {
      const p = api.getPage(pageId);
      if (!p) return null;
      const byId = new Map((p.sections || []).map((s) => [s.sectionId, s]));
      const sections = newOrder.map((id) => byId.get(id)).filter(Boolean);
      return api.updatePage(pageId, { sections });
    },

    setUnlockRequirement(pageId, requirement) {
      return api.updatePage(pageId, { unlockRequirement: requirement });
    },

    exportToRegistry() {
      return api.getAllPages();
    },

    importFromRegistry(arr) {
      if (!Array.isArray(arr)) return;
      writePages(arr);
    },

    renderPage(pageId, containerElement) {
      const p = api.getPage(pageId);
      if (!p || !containerElement) return null;
      if (ctx.renderPageDefinition) {
        ctx.renderPageDefinition(p, containerElement);
        return true;
      }
      return null;
    },

    pipelineFileName() {
      return PIPELINE_PAGES_FILE;
    },

    getLayoutTemplates() {
      return listPageLayoutTemplates();
    },

    getLayoutTemplate(id) {
      return getPageLayoutTemplate(id);
    },

    getResolvedAdSlots(pageOrTemplate) {
      const templateId =
        typeof pageOrTemplate === 'string'
          ? pageOrTemplate
          : pageOrTemplate?.layoutTemplate || layoutTemplateForCategory(pageOrTemplate?.category);
      return deriveTemplateSlots(templateId);
    }
  };

  return api;
}
