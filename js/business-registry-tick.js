/**
 * Business Registry — approval processor, provisioning, and submission handler.
 * Runs inside the sim tick (dayChanged) to approve pending applications once
 * three business days have elapsed, then auto-generates a storefront website.
 */

import { getState, patchState } from './gameState.js';
import { getCurrentGameDate, getGameDayIndex, addBusinessDaysUtc, simMsForDate } from './clock.js';
import { createStore } from './worldnet-shop.js';
import { defaultPageDef, newPageId } from './pipeline/website-editor.js';
import { refreshPipelineRoutes } from './init-content-pipeline.js';
import { ActorDB } from '../engine/ActorDB.js';
import { toast } from './toast.js';

const MAX_FILINGS_PER_DAY = 3;
const APPROVAL_BUSINESS_DAYS = 3;

function slug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

function hashColor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = ((h >>> 0) % 360);
  return `hsl(${hue}, 55%, 38%)`;
}

const INDUSTRY_SKUS = {
  technology: [
    { title: 'CyberConnect USB Hub', price: 29.99 },
    { title: '128 MB Flash Drive', price: 49.99 },
    { title: 'Y2K Firewall Suite', price: 89.99 },
    { title: 'NetBoost Ethernet Card', price: 44.99 },
    { title: 'Laser Precision Mouse', price: 19.99 }
  ],
  retail: [
    { title: 'Deluxe Gift Basket', price: 34.99 },
    { title: 'Premium Notebook Set', price: 12.99 },
    { title: 'Everyday Carry Kit', price: 24.99 },
    { title: 'Travel Mug — 16 oz', price: 9.99 },
    { title: 'Desk Organizer Pro', price: 18.99 }
  ],
  food: [
    { title: 'Artisan Coffee Blend (1 lb)', price: 14.99 },
    { title: 'Gourmet Cookie Box', price: 22.99 },
    { title: 'Lunch Combo Voucher', price: 8.99 },
    { title: 'Seasonal Spice Kit', price: 11.99 },
    { title: 'Party Snack Platter', price: 29.99 }
  ],
  finance: [
    { title: 'Financial Planning Guide', price: 39.99 },
    { title: 'Tax Organizer Binder', price: 24.99 },
    { title: 'Investment Starter Kit', price: 59.99 }
  ],
  healthcare: [
    { title: 'First Aid Essentials', price: 19.99 },
    { title: 'Vitamin D-3000 (90ct)', price: 14.99 },
    { title: 'Digital Thermometer', price: 12.99 },
    { title: 'Wellness Journal', price: 9.99 }
  ],
  default: [
    { title: 'Company Branded Mug', price: 12.99 },
    { title: 'Service Voucher — 1 hr', price: 45.00 },
    { title: 'Premium Consultation', price: 99.00 },
    { title: 'Starter Package', price: 149.99 },
    { title: 'Custom Order (small)', price: 29.99 }
  ]
};

function generateProducts(industry, tradingName) {
  const pool = INDUSTRY_SKUS[industry?.toLowerCase()] || INDUSTRY_SKUS.default;
  const count = 3 + Math.floor(Math.random() * Math.min(pool.length, 5));
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  return shuffled.map((base, i) => ({
    id: `prod-${slug(tradingName)}-${i}`,
    title: base.title,
    price: base.price,
    salePrice: null,
    swatch: hashColor(tradingName + i),
    description: `Quality product from ${tradingName}.`,
    stockCount: 10 + Math.floor(Math.random() * 40),
    category: 'general'
  }));
}

/**
 * Submit a new business registration application.
 * Returns `{ ok, message }`.
 */
export function submitBusinessRegistration({ actorId, tradingName, legalName, entityType, industry, offeringsSummary, priorNames, naics, ein, mailingAddress, phone, fax, email, agent, agentAddr, employees, fiscalYearEnd, addressId, addressLabel }) {
  const st = getState();
  const dayIdx = getGameDayIndex();
  const reg = st.businessRegistry;

  if (reg.lastFilingDayIndex === dayIdx && reg.filingsCountOnThatDay >= MAX_FILINGS_PER_DAY) {
    return { ok: false, message: `Daily filing limit reached (${MAX_FILINGS_PER_DAY} per day). Try again tomorrow.` };
  }

  if (!tradingName?.trim()) return { ok: false, message: 'Trading name is required.' };
  if (!actorId) return { ok: false, message: 'A registrant must be selected.' };

  const now = getCurrentGameDate();
  const dueDate = addBusinessDaysUtc(now, APPROVAL_BUSINESS_DAYS);
  const approvalDueSimMs = simMsForDate(dueDate);
  const id = `biz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const s = slug(tradingName);
  const publicHost = `www.${s}.corp-biz.net`;

  patchState((draft) => {
    const br = draft.businessRegistry;
    if (br.lastFilingDayIndex !== dayIdx) {
      br.lastFilingDayIndex = dayIdx;
      br.filingsCountOnThatDay = 0;
    }
    br.filingsCountOnThatDay++;
    br.applications.push({
      id,
      submittedSimMs: draft.sim.elapsedMs,
      submittedDayIndex: dayIdx,
      actorId,
      tradingName: tradingName.trim(),
      legalName: (legalName || tradingName).trim(),
      entityType: entityType || 'LLC',
      industry: (industry || 'general').trim(),
      offeringsSummary: (offeringsSummary || '').trim(),
      priorNames: (priorNames || '').trim(),
      naics: (naics || '').trim(),
      ein: (ein || '').trim(),
      addressId: addressId || null,
      addressLabel: (addressLabel || '').trim(),
      mailingAddress: (mailingAddress || '').trim(),
      phone: (phone || '').trim(),
      fax: (fax || '').trim(),
      email: (email || '').trim(),
      agent: (agent || '').trim(),
      agentAddr: (agentAddr || '').trim(),
      employees: employees || '1',
      fiscalYearEnd: fiscalYearEnd || 'dec',
      approvalDueSimMs,
      status: 'pending',
      publicHost,
      storeId: null,
      pageId: null
    });
    return draft;
  });

  return { ok: true, message: `Application submitted. Expected approval: ${dueDate.toUTCString().slice(0, 16)}.`, id };
}

/**
 * Called from dayChanged handler. Approves applications whose due date has passed
 * and provisions their storefront + pipeline page.
 */
export function processBusinessRegistryApprovals() {
  const st = getState();
  const elapsed = st.sim?.elapsedMs ?? 0;
  const pending = (st.businessRegistry?.applications || []).filter(
    (a) => a.status === 'pending' && elapsed >= a.approvalDueSimMs
  );
  if (!pending.length) return;

  for (const app of pending) {
    provisionApprovedBusiness(app);
  }
}

function provisionApprovedBusiness(app) {
  const s = slug(app.tradingName);
  const storeId = `store-${s}`;
  const pageId = newPageId();
  const products = generateProducts(app.industry, app.tradingName);

  createStore({
    id: storeId,
    name: app.tradingName,
    tagline: app.offeringsSummary || `${app.industry} services`,
    publicHost: app.publicHost,
    freeShippingThreshold: 50,
    shippingTiers: [
      { id: 'standard', name: 'Standard', baseCost: 4.99, etaSimHours: 24 },
      { id: 'express', name: 'Express', baseCost: 9.99, etaSimHours: 8 }
    ],
    categories: [{ id: 'general', name: 'All Products' }],
    featuredProductIds: products.slice(0, 4).map((p) => p.id),
    products,
    adSlots: ['below-header', 'right-rail-primary', 'above-footer']
  });

  const primaryColor = hashColor(app.tradingName);
  const pageDef = defaultPageDef({
    pageId,
    url: `http://${app.publicHost}/`,
    title: `${app.tradingName} — Official Site`,
    category: 'corporate',
    aestheticTheme: 'year2000-corporate',
    primaryColor,
    secondaryColor: '#0a246a',
    backgroundColor: '#ffffff',
    siteName: app.tradingName,
    siteTagline: app.offeringsSummary || `${app.industry} solutions`,
    logoText: app.tradingName,
    hasShop: true,
    shopId: storeId,
    sections: [
      { type: 'hero', title: `Welcome to ${app.tradingName}`, subtitle: app.offeringsSummary || `Your trusted ${app.industry} partner.` },
      { type: 'text', title: 'About Us', body: `${app.tradingName} (${app.legalName}) is a registered ${app.entityType} operating in the ${app.industry} sector. We are committed to providing quality products and services to our customers.` },
      { type: 'productGrid', title: 'Shop Our Products', shopId: storeId },
      { type: 'live_thread', title: 'Customer Reviews', threadId: `${pageId}-reviews` }
    ],
    navLinks: [
      { label: 'Home', href: '#home' },
      { label: 'Shop', href: '#shop' },
      { label: 'About', href: '#about' }
    ],
    footerText: `© 2000 ${app.tradingName}. All rights reserved.`
  });

  patchState((draft) => {
    const brApp = draft.businessRegistry.applications.find((a) => a.id === app.id);
    if (brApp) {
      brApp.status = 'approved';
      brApp.storeId = storeId;
      brApp.pageId = pageId;
    }

    draft.contentRegistry.pages.push(pageDef);

    if (!draft.companies) draft.companies = [];
    draft.companies.push({
      id: storeId,
      legalName: app.legalName || app.tradingName,
      tradingName: app.tradingName,
      entityType: app.entityType,
      industry: app.industry
    });

    return draft;
  });

  if (window.WorldNet?.companies?.create) {
    try {
      window.WorldNet.companies.create({
        legalName: app.legalName || app.tradingName,
        tradingName: app.tradingName,
        entityType: app.entityType,
        industry: app.industry,
        ownerType: 'npc',
        ownerId: app.actorId,
        isPlayerCompany: false
      });
    } catch { /* non-critical */ }
  }

  refreshPipelineRoutes();

  const actor = ActorDB.getRaw(app.actorId);
  const ownerName = actor?.public_profile?.display_name || app.actorId;
  toast({
    key: `biz-approved-${app.id}`,
    title: 'Business Approved',
    message: `${app.tradingName} (${ownerName}) is now live at ${app.publicHost}`,
    icon: '🏢',
    autoDismiss: 6000
  });
}
