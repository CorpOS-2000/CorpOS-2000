/**
 * WorldNet URL mapping, address-bar sync, and the “World Wide Web Registry” catalog.
 * Public Wahoo links only point at root URLs; banks also expose hidden paths (/register, /about).
 */

import { BANK_META } from './bank-pages.js';
import { getState } from './gameState.js';

/** Root URLs keyed by worldnet page id (shown on Wahoo / typed in address bar). */
export const ROOT_URL_BY_PAGE = {
  home: 'http://www.wahoo.net/',
  wahoo_results: 'http://www.wahoo.net/search',
  wahoo_register: 'http://www.wahoo.net/register',
  wahoo_login: 'http://www.wahoo.net/login',
  wahoo_account: 'http://www.wahoo.net/myaccount',
  jeemail_login: 'http://mail.jeemail.net/',
  jeemail_register: 'http://mail.jeemail.net/register',
  jeemail_inbox: 'http://mail.jeemail.net/inbox',
  jeemail_sent: 'http://mail.jeemail.net/sent',
  jeemail_trash: 'http://mail.jeemail.net/trash',
  jeemail_compose: 'http://mail.jeemail.net/compose',
  jeemail_read: 'http://mail.jeemail.net/read',
  bank: 'http://www.firstnationalcorp.com/',
  bank_meridian: 'http://www.meridiansavings.com/',
  bank_harbor: 'http://www.harborcu.org/',
  bank_pacific: 'http://www.pacificrimfinancial.com/',
  bank_darkweb: 'http://firsttrust.onion.net/',
  web_registry: 'http://www.worldwidewebregistry.net/',
  bizreg: 'http://www.fedbizreg.gov/register',
  stocks: 'http://market.worldnet.com/',
  hiring: 'http://www.staffingplus.net/',
  ssa: 'http://www.ssa.gov.net/',
  fra: 'http://www.fra.gov.net/',
  devtools: 'http://www.devtools.net/',
  backrooms: 'http://www.backrooms.hck/',
  dmb: 'http://www.davidmitchellbanking.com/',
  net99669: 'http://www.99669.net/',
  reviewbomber: 'http://www.reviewbomber.net/',
  yourspace: 'http://www.yourspace.net/',
  mytube: 'http://www.mytube.net/',
  moogle_home: 'http://www.moogle.com/',
  moogle_results: 'http://www.moogle.com/search',
  moogle_images: 'http://www.moogle.com/imghp',
  moogle_groups: 'http://www.moogle.com/groups',
  moogle_directory: 'http://www.moogle.com/dir',
  moogle_about: 'http://www.moogle.com/about',
  moogle_maps: 'http://maps.moogle.com/',
  herald: 'http://www.dailyherald.net/',
  warehouse: 'http://www.whereallthingsgo.net/',
  market_pulse: 'http://www.marketpulse.net/',
  focs_mandate: 'http://www.focs.gov.net/mandate/2000-cr7',
  corpos_portal: 'http://www.corpos.gov.net/operators',
  /** Fallback when no shop host is resolved; real bar URL comes from store JSON. */
  wn_shop: 'http://www.rapidmart1999.net/'
};

/** Normalized hostname+path → pipeline pageId */
const pipelineUrlToPageId = new Map();

/**
 * @param {string} rawUrl full URL or host/path
 * @returns {string} host+path lowercase, no trailing slash on path except root
 */
export function normalizeWorldNetLocationUrl(rawUrl) {
  try {
    const href = String(rawUrl || '').includes('://') ? String(rawUrl) : `http://${rawUrl}`;
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    let path = u.pathname || '/';
    if (path.length > 1) path = path.replace(/\/$/, '');
    return `${host}${path === '/' ? '/' : path}`;
  } catch {
    return String(rawUrl || '').toLowerCase();
  }
}

/** @param {{ url?: string, pageId?: string }[]} pages */
export function setPipelinePageRoutes(pages) {
  pipelineUrlToPageId.clear();
  for (const p of pages || []) {
    if (!p?.url || !p.pageId) continue;
    const norm = normalizeWorldNetLocationUrl(p.url);
    pipelineUrlToPageId.set(norm, p.pageId);
    const noWww = norm.replace(/^www\./, '');
    if (noWww !== norm) pipelineUrlToPageId.set(noWww, p.pageId);
    else pipelineUrlToPageId.set(`www.${noWww}`, p.pageId);
  }
}

/** @param {string} raw user-typed address */
export function resolvePipelinePageIdFromAddress(raw) {
  try {
    const href = String(raw || '').trim();
    if (!href) return null;
    const u = new URL(href.includes('://') ? href : `http://${href}`);
    const host = u.hostname.toLowerCase();
    let path = u.pathname || '/';
    if (path.length > 1) path = path.replace(/\/$/, '');
    const norm = `${host}${path === '/' ? '/' : path}`;
    const tryKeys = [norm, norm.replace(/^www\./, ''), `www.${norm.replace(/^www\./, '')}`];
    for (const k of tryKeys) {
      const id = pipelineUrlToPageId.get(k);
      if (id) return id;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Hostname (lowercase) → internal shop store id — populated by WorldNet.shop.createStore */
const SHOP_HOST_TO_STORE_ID = {};

/**
 * Register a storefront hostname for address-bar resolution.
 * @param {string} hostname e.g. www.rapidmart1999.net
 * @param {string} storeId e.g. rapidmart
 */
export function registerWorldNetShopHost(hostname, storeId) {
  SHOP_HOST_TO_STORE_ID[String(hostname || '').toLowerCase().replace(/^www\./, '')] = storeId;
  SHOP_HOST_TO_STORE_ID[`www.${String(hostname || '').toLowerCase().replace(/^www\./, '')}`] = storeId;
}

/** @param {string} host */
export function resolveShopStoreIdFromHost(host) {
  const h = String(host || '').toLowerCase();
  return SHOP_HOST_TO_STORE_ID[h] || null;
}

/** @returns {string[]} */
export function getRegisteredShopHosts() {
  return [...new Set(Object.keys(SHOP_HOST_TO_STORE_ID))];
}

const HOST_ALIASES = [
  ['www.wahoo.net', 'home'],
  ['wahoo.net', 'home'],
  ['www.firstnationalcorp.com', 'bank'],
  ['firstnationalcorp.com', 'bank'],
  ['www.meridiansavings.com', 'bank_meridian'],
  ['meridiansavings.com', 'bank_meridian'],
  ['www.harborcu.org', 'bank_harbor'],
  ['harborcu.org', 'bank_harbor'],
  ['www.pacificrimfinancial.com', 'bank_pacific'],
  ['pacificrimfinancial.com', 'bank_pacific'],
  ['firsttrust.onion.net', 'bank_darkweb'],
  ['www.firsttrust.onion.net', 'bank_darkweb'],
  ['www.worldwidewebregistry.net', 'web_registry'],
  ['worldwidewebregistry.net', 'web_registry'],
  ['www.fedbizreg.gov', 'bizreg'],
  ['fedbizreg.gov', 'bizreg'],
  ['market.worldnet.com', 'stocks'],
  ['www.staffingplus.net', 'hiring'],
  ['staffingplus.net', 'hiring'],
  ['www.ssa.gov.net', 'ssa'],
  ['ssa.gov.net', 'ssa'],
  ['www.fra.gov.net', 'fra'],
  ['fra.gov.net', 'fra'],
  ['www.devtools.net', 'devtools'],
  ['devtools.net', 'devtools'],
  ['www.backrooms.hck', 'backrooms'],
  ['backrooms.hck', 'backrooms'],
  ['mail.jeemail.net', 'jeemail_login'],
  ['www.davidmitchellbanking.com', 'dmb'],
  ['davidmitchellbanking.com', 'dmb'],
  ['legacy.meridiantrust.net', 'bank_meridian'],
  ['meridiantrust.net', 'bank_meridian'],
  ['www.meridiantrust.net', 'bank_meridian'],
  ['an0n-ledger.tor.parody', 'bank_darkweb'],
  ['www.an0n-ledger.tor.parody', 'bank_darkweb'],
  ['www.99669.net', 'net99669'],
  ['99669.net', 'net99669'],
  ['www.reviewbomber.net', 'reviewbomber'],
  ['reviewbomber.net', 'reviewbomber'],
  ['www.yourspace.net', 'yourspace'],
  ['yourspace.net', 'yourspace'],
  ['www.mytube.net', 'mytube'],
  ['mytube.net', 'mytube'],
  ['www.moogle.com', 'moogle_home'],
  ['moogle.com', 'moogle_home'],
  ['maps.moogle.com', 'moogle_maps'],
  ['www.maps.moogle.com', 'moogle_maps'],
  ['dailyherald.net', 'herald'],
  ['www.dailyherald.net', 'herald'],
  ['whereallthingsgo.net', 'warehouse'],
  ['www.whereallthingsgo.net', 'warehouse'],
  ['marketpulse.net', 'market_pulse'],
  ['www.marketpulse.net', 'market_pulse'],
  ['focs.gov.net', 'focs_mandate'],
  ['www.focs.gov.net', 'focs_mandate'],
  ['corpos.gov.net', 'corpos_portal'],
  ['www.corpos.gov.net', 'corpos_portal']
];

const HOST_TO_PAGE = Object.fromEntries(HOST_ALIASES);

/** Human-facing titles for registry rows (non-bank pages). */
const EXTRA_PAGE_TITLES = {
  home: 'Wahoo! — WorldNet Portal',
  web_registry: 'World Wide Web Registry',
  bizreg: 'Federal Business Registry',
  stocks: 'WorldNet Market Center',
  hiring: 'Staffing Plus — Job Listings',
  ssa: 'Social Security Administration (SSA.NET)',
  fra: 'Federal Revenue Authority (FRA.NET)',
  devtools: 'devtools.net',
  backrooms: 'backrooms.hck — Underground Software',
  dmb: 'David & Mitchell Banking',
  net99669: '99669.net — WorldNet Master Directory',
  reviewbomber: 'Review Bomber — Consumer Buzz',
  yourspace: 'YourSpace — A Place for Friends',
  mytube: 'MyTube — Broadcast Yourself',
  moogle_maps: 'Moogle Maps — Hargrove, CA',
  herald: 'The Daily Herald — Hargrove Business News',
  warehouse: 'WhereAllThingsGo.net — Self-Storage & Liquidation',
  market_pulse: 'Market Pulse — Hargrove Analytics',
  focs_mandate: 'FOCS.GOV.NET — Federal Mandate 2000-CR7',
  corpos_portal: 'CorpOS.GOV.NET — Operator Portal'
};

/** Display title for any registered WorldNet page key (directory, registry, etc.). */
export function titleForWorldNetPage(key) {
  if (BANK_META[key]) return BANK_META[key].title;
  if (EXTRA_PAGE_TITLES[key]) return EXTRA_PAGE_TITLES[key];
  const wahooPages = {
    wahoo_results: 'Wahoo! — Search results',
    wahoo_register: 'Wahoo! — New user registration',
    wahoo_login: 'Wahoo! — Member sign in',
    wahoo_account: 'Wahoo! — My account'
  };
  if (wahooPages[key]) return wahooPages[key];
  const jeemailPages = {
    jeemail_login: 'JeeMail — Sign in',
    jeemail_register: 'JeeMail — New account',
    jeemail_inbox: 'JeeMail — Inbox',
    jeemail_sent: 'JeeMail — Sent',
    jeemail_trash: 'JeeMail — Trash',
    jeemail_compose: 'JeeMail — Compose',
    jeemail_read: 'JeeMail — Message',
    jeemail_confirm: 'JeeMail — Message sent'
  };
  if (jeemailPages[key]) return jeemailPages[key];
  if (key === 'wn_shop') return 'WorldNet Shopping';
  return key.replace(/_/g, ' ');
}

/**
 * Sorted clickable entries for 99669.net (excludes the portal itself).
 * @returns {{ pageKey: string, title: string, url: string, subPath?: string }[]}
 */
export function getWorldNetSiteDirectoryLinks() {
  const base = Object.keys(ROOT_URL_BY_PAGE)
    .filter((k) => k !== 'net99669')
    .map((pageKey) => ({
      pageKey,
      title: titleForWorldNetPage(pageKey),
      url: urlForPage(pageKey, '')
    }));
  const pipe = (getState().contentRegistry?.pages || [])
    .filter((p) => p?.pageId && String(p.url || '').trim())
    .map((p) => {
      let u = String(p.url || '').trim();
      try {
        const x = new URL(u.includes('://') ? u : `http://${u}`);
        u = x.href;
      } catch {
        /* keep raw */
      }
      return {
        pageKey: 'pipeline_page',
        subPath: String(p.pageId),
        title: String(p.title || p.siteName || 'WorldNet site'),
        url: u
      };
    });
  return [...base, ...pipe].sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Canonical URL for a page id and optional sub-path (banks only).
 * @param {string} pageKey
 * @param {string} [subPath] e.g. register, about — no leading slash
 */
export function urlForPage(pageKey, subPath = '') {
  const root = ROOT_URL_BY_PAGE[pageKey];
  if (!root) return '';
  const u = root.replace(/\/$/, '');
  if (!subPath) return root.endsWith('/') ? root : `${u}/`;
  const clean = String(subPath).replace(/^\/+/, '').replace(/\/+$/, '');
  return `${u}/${clean}`;
}

/**
 * Bank-only: map URL path to internal subpage id.
 * @param {string} pageKey
 * @param {string} pathname URL pathname e.g. /register /about
 */
export function subPathFromUrl(pageKey, pathname) {
  if (pageKey === 'dmb') {
    const p = (pathname || '/').replace(/\\/g, '/');
    const seg = (p.split('/').filter(Boolean)[0] || '').toLowerCase();
    if (!seg) return '';
    if (['register', 'enroll', 'enrollment', 'signup'].includes(seg)) return 'register';
    if (['about', 'about-us'].includes(seg)) return 'about';
    if (seg === 'confirm') return 'confirm';
    if (/^[a-z0-9_-]+$/.test(seg)) return seg;
    return '';
  }
  if (pageKey === 'yourspace') {
    const p = (pathname || '/').replace(/\\/g, '/');
    let clean = p.replace(/^\/+/, '');
    if (clean.length > 1) clean = clean.replace(/\/$/, '');
    const segs = clean.split('/').filter(Boolean);
    if (segs[0]?.toLowerCase() === 'profile' && segs[1]) return `profile/${segs[1]}`;
    return '';
  }
  if (pageKey === 'mytube') {
    const p = (pathname || '/').replace(/\\/g, '/');
    let clean = p.replace(/^\/+/, '');
    if (clean.length > 1) clean = clean.replace(/\/$/, '');
    return clean;
  }
  if (!BANK_META[pageKey]) return '';
  const p = (pathname || '/').replace(/\\/g, '/');
  const seg = (p.split('/').filter(Boolean)[0] || '').toLowerCase();
  if (!seg) return '';
  if (['register', 'enroll', 'enrollment', 'signup'].includes(seg)) return 'register';
  if (/^[a-z0-9_-]+$/.test(seg)) return seg;
  return '';
}

/**
 * Resolve typed/pasted address to { pageKey, subPath }.
 * @param {string} raw
 */
export function resolveLocationFromAddress(raw) {
  const t = raw.trim();
  if (!t) return { pageKey: 'moogle_home', subPath: '' };

  const pipeId = resolvePipelinePageIdFromAddress(t);
  if (pipeId) return { pageKey: 'pipeline_page', subPath: pipeId };

  try {
    const href = t.includes('://') ? t : `http://${t}`;
    const u = new URL(href);
    const host = u.hostname.toLowerCase();
    const pageKey = HOST_TO_PAGE[host];
    if (pageKey) {
      const sub = subPathFromUrl(pageKey, u.pathname);
      return { pageKey, subPath: sub };
    }
  } catch {
    /* fall through */
  }

  const low = t.toLowerCase();
  if (low.includes('worldwidewebregistry') || low.includes('www-registry')) {
    return { pageKey: 'web_registry', subPath: '' };
  }
  if (low.includes('wahoo')) return { pageKey: 'home', subPath: '' };
  if (low.includes('jeemail') || low.includes('mail.jeemail')) return { pageKey: 'jeemail_login', subPath: '' };
  if (low.includes('firstnational') || (low.includes('bank') && low.includes('first')))
    return { pageKey: 'bank', subPath: '' };
  if (low.includes('meridian') && (low.includes('saving') || low.includes('trust')))
    return { pageKey: 'bank_meridian', subPath: '' };
  if (low.includes('harbor') && (low.includes('cu') || low.includes('credit')))
    return { pageKey: 'bank_harbor', subPath: '' };
  if (low.includes('pacific') && low.includes('rim')) return { pageKey: 'bank_pacific', subPath: '' };
  if (
    low.includes('firsttrust') ||
    low.includes('onion.net') ||
    low.includes('darkweb') ||
    low.includes('an0n') ||
    (low.includes('tor') && low.includes('ledger'))
  )
    return { pageKey: 'bank_darkweb', subPath: '' };
  if (low.includes('bizreg') || (low.includes('fedbizreg') && !low.includes('worldwideweb')))
    return { pageKey: 'bizreg', subPath: '' };
  if (low.includes('stock') || low.includes('market')) return { pageKey: 'stocks', subPath: '' };
  if (low.includes('hiring') || low.includes('staffing')) return { pageKey: 'hiring', subPath: '' };
  if (low.includes('ssa') || low.includes('social')) return { pageKey: 'ssa', subPath: '' };
  if (low.includes('fra') || (low.includes('federal') && low.includes('revenue'))) return { pageKey: 'fra', subPath: '' };
  if (low.includes('focs.gov') || low.includes('mandate') || low.includes('2000-cr7'))
    return { pageKey: 'focs_mandate', subPath: '' };
  if (low.includes('corpos.gov') && low.includes('operator'))
    return { pageKey: 'corpos_portal', subPath: '' };
  if (low.includes('davidmitchell') || low.includes('david') && low.includes('mitchell'))
    return { pageKey: 'dmb', subPath: '' };
  if (low.includes('99669')) return { pageKey: 'net99669', subPath: '' };
  if (low.includes('rapidmart')) return { pageKey: 'wn_shop', subPath: 'rapidmart/home' };
  if (low.includes('reviewbomber')) return { pageKey: 'reviewbomber', subPath: '' };
  if (low.includes('yourspace')) return { pageKey: 'yourspace', subPath: '' };
  if (low.includes('mytube')) return { pageKey: 'mytube', subPath: '' };
  if (low.includes('moogle')) return { pageKey: 'moogle_home', subPath: '' };

  return { pageKey: 'home', subPath: '' };
}

/** Sites whose root link appears on the Wahoo directory. */
export const WAHOO_LISTED_PAGE_KEYS = new Set([
  'home',
  'jeemail_login',
  'wahoo_register',
  'wahoo_login',
  'bank',
  'bank_meridian',
  'bank_harbor',
  'bank_pacific',
  'bizreg',
  'stocks',
  'hiring',
  'ssa',
  'web_registry',
  'net99669'
]);

/**
 * Rows for the World Wide Web Registry page.
 * @returns {{ title: string, url: string, onWahoo: string, note: string }[]}
 */
export function getWorldWideWebRegistryRows() {
  const rows = [];

  for (const key of Object.keys(ROOT_URL_BY_PAGE).sort()) {
    const url = ROOT_URL_BY_PAGE[key];
    const onY = WAHOO_LISTED_PAGE_KEYS.has(key) ? 'Yes' : 'No';
    let title = EXTRA_PAGE_TITLES[key] || '';
    if (BANK_META[key]) {
      title = `${BANK_META[key].title} (main site)`;
    }
    if (!title) title = key;
    rows.push({
      title,
      url,
      onWahoo: onY,
      note: 'Public entry point'
    });

    if (BANK_META[key]) {
      const b = BANK_META[key];
      rows.push({
        title: `${b.title} — online enrollment`,
        url: urlForPage(key, 'register'),
        onWahoo: 'No',
        note: 'Hidden path — not linked on Wahoo'
      });
      rows.push({
        title: `${b.title} — about us`,
        url: urlForPage(key, 'about'),
        onWahoo: 'No',
        note: 'Hidden path — intrasite navigation only'
      });
    }
  }

  const dmbRoot = ROOT_URL_BY_PAGE.dmb;
  if (dmbRoot) {
    rows.push({
      title: 'David & Mitchell Banking — online enrollment',
      url: urlForPage('dmb', 'register'),
      onWahoo: 'No',
      note: 'Hidden path — not linked on Wahoo directory'
    });
    rows.push({
      title: 'David & Mitchell Banking — about (disclosures)',
      url: urlForPage('dmb', 'about'),
      onWahoo: 'No',
      note: 'Hidden path — footer link on site only'
    });
  }

  const pipePages = getState().contentRegistry?.pages || [];
  for (const p of pipePages) {
    if (!p?.pageId) continue;
    let url = String(p.url || '').trim();
    if (!url) continue;
    try {
      const x = new URL(url.includes('://') ? url : `http://${url}`);
      url = x.href;
    } catch {
      /* keep */
    }
    rows.push({
      title: String(p.title || p.siteName || 'Content pipeline site'),
      url,
      onWahoo: 'No',
      note: 'Content pipeline site'
    });
  }

  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

export function renderWorldWideWebRegistryHtml() {
  const rows = getWorldWideWebRegistryRows();
  const body = rows
    .map(
      (r) =>
        `<tr>
<td style="padding:5px 8px;border:1px solid #ccc;font-size:11px;vertical-align:top;">${r.title}</td>
<td style="padding:5px 8px;border:1px solid #ccc;font-size:10px;font-family:Consolas,monospace;word-break:break-all;color:#006600;">${r.url}</td>
<td style="padding:5px 8px;border:1px solid #ccc;font-size:11px;text-align:center;">${r.onWahoo}</td>
<td style="padding:5px 8px;border:1px solid #ccc;font-size:10px;color:#555;">${r.note}</td>
</tr>`
    )
    .join('');

  return `<div class="iebody">
<h1 style="font-size:18px;color:#0a246a;font-family:'Times New Roman',serif;margin-bottom:4px;">World Wide Web Registry</h1>
<div style="font-size:10px;color:#666;margin-bottom:12px;">Authoritative index of WorldNet hostnames — maintained for federal interoperability (Mandate 2000-CR7). <b>Includes unpublished paths</b> used for enrollment and intrasite pages.</div>
<div style="border:2px solid #999;background:#f9f9f9;padding:8px;margin-bottom:8px;font-size:10px;">
<b>Notice:</b> Listings here are <i>not</i> endorsements. “Hidden” URLs are omitted from the Wahoo! portal but remain reachable by direct address or links from within each site.
</div>
<table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;">
<tr style="background:#0a246a;color:#fff;">
<th style="text-align:left;padding:6px 8px;border:1px solid #003;">Site / resource</th>
<th style="text-align:left;padding:6px 8px;border:1px solid #003;">URL</th>
<th style="padding:6px 8px;border:1px solid #003;">On Wahoo</th>
<th style="text-align:left;padding:6px 8px;border:1px solid #003;">Notes</th>
</tr>
${body}
</table>
<p style="margin-top:14px;font-size:9px;color:#888;">© 2000 Federal Office of Commercial Systems — Registry division · Last bulk import: Jan 1, 2000</p>
</div>`;
}
