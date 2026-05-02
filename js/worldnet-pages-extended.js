/**
 * Extended Y2K WorldNet sites — lore, mechanics, ActorDB-backed NPCs.
 */
import { escapeHtml } from './identity.js';
import { getState, patchState } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { ActorDB } from '../engine/ActorDB.js';
import { generateSocialComment } from './social-comments.js';
import { recordHashtagEvent, recordPurchase } from './market-dynamics.js';
import { applyAffinityDelta, affinityTargetKey } from './social-affinity.js';
import { toast } from './toast.js';
import {
  buildWhereAllThingsGoPage,
  buildHargroveVaultPage,
  buildStorItPage
} from './worldnet-warehouse-pages.js';
import { buildETradeBayPage } from './worldnet-etradebay.js';
import {
  WORLDNET_100_ROOT_URLS,
  WORLDNET_100_TITLES,
  WORLDNET_100_KEYS,
  buildWorldNet100HostAliases
} from './worldnet-sites-registry.js';
import { buildWorldNet100Site } from './worldnet-sites-builders.js';
import { bumpWorldNetVisit } from './worldnet-counters.js';
import { ensureAmazoneRivalProducts } from './amazone-rival-catalog.js';

// ── Routes (merged in worldnet-routes.js) — legacy extended sites
const EXT_BASE_ROOT_URLS = Object.freeze({
  patricias_garden: 'http://www.patricias-garden-corner.net/',
  onlyflans: 'http://www.onlyflans.com/',
  room2847: 'http://www.room2847.net/',
  hargrove_careers: 'http://www.hargrove-careers.net/',
  hargrovebiz_corp: 'http://www.hargrovebiz-corp.net/',
  truthseekers: 'http://www.truthseekers2000.net/',
  hargrove_elementary: 'http://www.hargrove-elementary.edu.net/',
  cubscouts: 'http://www.hargrovecubscouts.org/',
  bearscouts: 'http://www.hargrovebearscouts.org/',
  savethecookies: 'http://www.savethecookies.org/',
  rocksalive: 'http://www.rocksalive.com/',
  quarryhearts: 'http://www.quarry-hearts.org/',
  kittenorg: 'http://www.kitten.org/',
  hargrove_hotels: 'http://www.hargrove-hospitality-guide.net/',
  hargrove_library: 'http://www.hargrove-public-library.net/catalog',
  /** Warehouse / storage (see worldnet-warehouse-pages.js) */
  warehouse: 'http://www.whereallthingsgo.net/',
  hargrove_vault: 'http://www.hargrove-vault.com/',
  stor_it: 'http://www.stor-it-hargrove.com/',
  etrade_bay: 'http://www.etradebay.com/'
});

/** Rival corporate sites (see data/rival-companies.json) */
export const RIVAL_CORP_ROOT_URLS = Object.freeze({
  moogle_corp: 'http://www.moogle-corp.net/',
  amazone_corp: 'http://www.amazone.com/',
  rapidmart_corp: 'http://www.rapid-e-mart.com/',
  intek_corp: 'http://www.intek-corp.net/',
  microcorp_corp: 'http://www.microcorp.net/',
  pacific_rim_corp: 'http://www.pacific-rim-corp.com/',
  netcomm_corp: 'http://www.netcomm.net/',
  seatech_corp: 'http://www.seatech-ind.net/',
  corpnet_corp: 'http://www.corpnet-media.net/',
  dotboom_corp: 'http://www.dotboom-vc.com/'
});

const RIVAL_CORP_HOSTS = [
  ['www.moogle-corp.net', 'moogle_corp'],
  ['moogle-corp.net', 'moogle_corp'],
  ['www.rapid-e-mart.com', 'rapidmart_corp'],
  ['rapid-e-mart.com', 'rapidmart_corp'],
  ['www.intek-corp.net', 'intek_corp'],
  ['intek-corp.net', 'intek_corp'],
  ['www.microcorp.net', 'microcorp_corp'],
  ['microcorp.net', 'microcorp_corp'],
  ['www.pacific-rim-corp.com', 'pacific_rim_corp'],
  ['pacific-rim-corp.com', 'pacific_rim_corp'],
  ['www.netcomm.net', 'netcomm_corp'],
  ['netcomm.net', 'netcomm_corp'],
  ['www.seatech-ind.net', 'seatech_corp'],
  ['seatech-ind.net', 'seatech_corp'],
  ['www.corpnet-media.net', 'corpnet_corp'],
  ['corpnet-media.net', 'corpnet_corp'],
  ['www.dotboom-vc.com', 'dotboom_corp'],
  ['dotboom-vc.com', 'dotboom_corp']
];

export const EXTENDED_ROOT_URLS = Object.freeze({
  ...EXT_BASE_ROOT_URLS,
  ...WORLDNET_100_ROOT_URLS,
  ...RIVAL_CORP_ROOT_URLS
});

export const EXTENDED_HOST_ALIASES = Object.freeze([
  ['www.patricias-garden-corner.net', 'patricias_garden'],
  ['patricias-garden-corner.net', 'patricias_garden'],
  ['www.onlyflans.com', 'onlyflans'],
  ['onlyflans.com', 'onlyflans'],
  ['www.room2847.net', 'room2847'],
  ['room2847.net', 'room2847'],
  ['www.hargrove-careers.net', 'hargrove_careers'],
  ['hargrove-careers.net', 'hargrove_careers'],
  ['www.hargrovebiz-corp.net', 'hargrovebiz_corp'],
  ['hargrovebiz-corp.net', 'hargrovebiz_corp'],
  ['www.truthseekers2000.net', 'truthseekers'],
  ['truthseekers2000.net', 'truthseekers'],
  ['www.hargrove-elementary.edu.net', 'hargrove_elementary'],
  ['hargrove-elementary.edu.net', 'hargrove_elementary'],
  ['www.hargrovecubscouts.org', 'cubscouts'],
  ['hargrovecubscouts.org', 'cubscouts'],
  ['www.hargrovebearscouts.org', 'bearscouts'],
  ['hargrovebearscouts.org', 'bearscouts'],
  ['www.savethecookies.org', 'savethecookies'],
  ['savethecookies.org', 'savethecookies'],
  ['www.rocksalive.com', 'rocksalive'],
  ['rocksalive.com', 'rocksalive'],
  ['www.quarry-hearts.org', 'quarryhearts'],
  ['quarry-hearts.org', 'quarryhearts'],
  ['www.kitten.org', 'kittenorg'],
  ['kitten.org', 'kittenorg'],
  ['www.hargrove-hospitality-guide.net', 'hargrove_hotels'],
  ['hargrove-hospitality-guide.net', 'hargrove_hotels'],
  ['www.hargrove-public-library.net', 'hargrove_library'],
  ['hargrove-public-library.net', 'hargrove_library'],
  ...RIVAL_CORP_HOSTS,
  ['www.hargrove-vault.com', 'hargrove_vault'],
  ['hargrove-vault.com', 'hargrove_vault'],
  ['www.stor-it-hargrove.com', 'stor_it'],
  ['stor-it-hargrove.com', 'stor_it'],
  ['www.etradebay.com', 'etrade_bay'],
  ['etradebay.com', 'etrade_bay'],
  ...buildWorldNet100HostAliases()
]);

export const EXTENDED_PAGE_TITLES = Object.freeze({
  patricias_garden: "Patricia's Garden Corner",
  onlyflans: 'ONLY FLANS — Flan Appreciation',
  room2847: 'Room 2847',
  hargrove_careers: 'Hargrove Careers',
  hargrovebiz_corp: 'HargroveBiz Corp — Hiring',
  truthseekers: 'Truth Seekers 2000',
  hargrove_elementary: 'Hargrove Elementary',
  cubscouts: 'Hargrove Cub Scouts',
  bearscouts: 'Hargrove Bear Scouts',
  savethecookies: 'Save The Cookies Coalition',
  rocksalive: 'Rocks Alive — Pet Rocks',
  quarryhearts: 'Quarry Hearts International',
  kittenorg: 'Financial Felines — kitten.org',
  hargrove_hotels: 'Hargrove Hospitality Guide',
  hargrove_library: 'Hargrove Public Library Catalog',
  warehouse: 'WhereAllThingsGo.net',
  hargrove_vault: 'HargroveVault — Secured Storage',
  stor_it: 'StorIt Hargrove',
  moogle_corp: 'Moogle Inc.',
  amazone_corp: 'Amazone.com — Earth\'s Biggest Selection',
  rapidmart_corp: 'RapidE-Mart',
  intek_corp: 'Intek Systems',
  microcorp_corp: 'MicroCorp',
  pacific_rim_corp: 'Pacific Rim Financial',
  netcomm_corp: 'NetComm Solutions',
  seatech_corp: 'Seatech Industries',
  corpnet_corp: 'CorpNet Media',
  dotboom_corp: 'DotBoom Ventures',
  etrade_bay: 'ETradeBay 2000 — Hargrove Exchange',
  ...WORLDNET_100_TITLES
});

export const EXTENDED_PAGE_KEYS = new Set(Object.keys(EXTENDED_ROOT_URLS));

/** Discoverable via links only — omit from 99669.net master list. */
export const HIDDEN_FROM_99669_DIRECTORY = new Set(['room2847', 'truthseekers']);

/** Canonical NPC ids for these sites (seeded once). */
export const WN_ACTORS = Object.freeze({
  patricia: 'ACT-WNET-PATRICIA-DELGADO',
  sister: 'ACT-WNET-PATRICIA-SISTER',
  margaret: 'ACT-WNET-MARGARET-WAVERLY',
  inspectorPaws: 'ACT-WNET-INSPECTOR-PAWS',
  scoutGrifter: 'ACT-WNET-SCOUT-DUAL',
  deepnode: 'ACT-WNET-DEEPNODE-559',
  fishTeacher: 'ACT-WNET-FISH-EDUCATOR',
  quarryDir: 'ACT-WNET-QUARRY-DIRECTOR'
});

const Y2K_FOOTER = `<div style="margin-top:14px;border-top:1px dashed #888;padding-top:6px;font-size:9px;color:#666;text-align:center;">
  <font size="1">Best viewed in WorldNet Explorer 5.0 at 800×600</font><br>
  <a href="#" data-nav="home" style="font-size:9px;">Wahoo!</a> · WebRing: <font color="#808080">[PREV]</font> <font color="#808080">[RAND]</font> <font color="#808080">[NEXT]</font><br>
  ©1999–2000 · Under Construction <blink>_</blink>
</div>`;

function buildAmazoneCorpLandingPage(company) {
  ensureAmazoneRivalProducts();
  const co = company || {};
  const dept = (catId, label) =>
    `<a data-nav="wn_shop" data-wnet-subpath="amazone/category/${escapeHtml(catId)}" href="#" style="color:#ffeb99;margin:0 6px;text-decoration:none;">${escapeHtml(
      label
    )}</a>`;
  return `<div class="iebody amazone-y2k-store" data-wn-ad-page="amazone_corp" style="font-family:Tahoma,Verdana,Arial,sans-serif;background:#e8dcc8;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2B4C7E"><tr><td style="padding:10px 14px;">
  <font size="5" color="#FFCC66" face="Times New Roman, Times, serif"><b>Amazone</b></font><font size="4" color="#ffffff">.com</font>
  <div style="font-size:10px;color:#bcd4ff;margin-top:4px;">${escapeHtml(co.tagline || "Earth's Biggest Selection — Hargrove Edition")}</div>
</td></tr></table>
<table width="100%" cellpadding="10" cellspacing="0" border="0" bgcolor="#003893"><tr><td align="center" style="font-size:11px;color:#fff;">
  <b>Cart · checkout · standard / premium shipping</b> — Super Saver fiction™ included
</td></tr>
<tr bgcolor="#0054a8"><td align="center" style="padding:8px;font-size:10px;">
  ${dept('books', 'Books')}<font color="#6699cc">|</font>${dept('music', 'Music')}<font color="#6699cc">|</font>${dept('dvd_video', 'DVD / Video')}<font color="#6699cc">|</font>${dept('electronics', 'Electronics')}<font color="#6699cc">|</font>${dept('auctions', 'Auctions')}<font color="#6699cc">|</font>${dept('zshops', 'zShops')}
</td></tr></table>
<div style="padding:16px;background:#e8dcc8;font-size:12px;color:#222;line-height:1.45;">
  <p style="margin-bottom:10px;">Browse every department, add to cart, pay from FNCB or cash on hand, and receive SMS order confirmation — same flow as RapidMart WorldNet Commerce.</p>
  <p style="margin-bottom:14px;">
    <a data-nav="wn_shop" data-wnet-subpath="amazone/home" href="#" style="font-weight:bold;color:#039;font-size:13px;">Enter full storefront →</a>
    &nbsp;·&nbsp;
    <a data-nav="wn_shop" data-wnet-subpath="amazone/cart" href="#" style="color:#039;">Shopping cart</a>
    &nbsp;·&nbsp;
    <a href="#" data-nav="home" style="color:#039;">Wahoo!</a>
    &nbsp;·&nbsp;
    <a href="#" data-nav="web_registry" style="color:#039;">WWW Registry</a>
  </p>
  <p style="font-size:10px;color:#555;">Tip: type <b>www.amazone.com</b> in the address bar for the live catalog.</p>
</div>
${Y2K_FOOTER}
</div>`;
}

function buildRivalCorporationPage(company, products) {
  const prows = (products || [])
    .slice(0, 20)
    .map(
      (p) =>
        `<tr><td><b>${escapeHtml(p.name)}</b><br><span style="font-size:9px;color:#666;">${escapeHtml(
          p.category || ''
        )}</span></td><td align="right">$${Number(p.priceUsd) || 0}</td><td align="center">${p.quality}</td><td style="font-size:10px;">${escapeHtml(
          p.description || ''
        )}</td></tr>`
    )
    .join('');
  return `<div class="iebody" style="font-family:Tahoma,Arial,sans-serif;max-width:720px;">
<h1 style="color:#003399;">${escapeHtml(company.tradingName)}</h1>
<p><i>${escapeHtml(company.tagline || '')}</i></p>
<p style="font-size:12px;">${escapeHtml(company.description || '')}</p>
<p style="font-size:11px;">${escapeHtml(company.headquarters || '')} · Ticker: <b>${escapeHtml(company.ticker || '')}</b> ·
Public sentiment: <b>${Number(company.publicSentiment) || 0}</b>/100</p>
<table border="1" cellpadding="4" width="100%" bgcolor="#ffffee" style="font-size:11px;">
<tr bgcolor="#ccccdd"><th>Product</th><th>Price</th><th>Q</th><th>Description</th></tr>
${prows || '<tr><td colspan="4">No catalog data.</td></tr>'}
</table>
${Y2K_FOOTER}
</div>`;
}

function tileTable(inner) {
  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#90EE90"><tr><td style="padding:12px;">${inner}</td></tr></table>`;
}

/** @param {(k: string, s?: string) => void} navigate */
export function buildExtendedPage(key, sub = '', navigate) {
  const st = getState();
  if (WORLDNET_100_KEYS.has(key)) {
    return buildWorldNet100Site(key, sub, navigate);
  }
  switch (key) {
    case 'onlyflans': {
      const actors = pickFlanActors();
      const threads = [
        { title: 'DOMINICAN vs MEXICAN — SETTLE THIS NOW', slug: 'dommx', brand: 'Dominican Republic' },
        { title: 'cream cheese is NOT optional (@ the haters)', slug: 'cream', brand: 'Puerto Rico' },
        { title: "my abuela's recipe vs your abuela's recipe", slug: 'abuela', brand: 'Mexico' }
      ];
      let body = `<div class="iebody" bgcolor="#FFFF99" style="background:#ffff99;"><table width="100%" bgcolor="#FFFF99"><tr><td style="border:4px ridge #cc0000;padding:10px;">`;
      body += `<center><font size="5" color="#cc0000"><b>ONLY FLANS</b></font><br><font size="2">The World's Premier Flan Appreciation Community</font></center>`;
      for (const th of threads) {
        body += `<table width="100%" bgcolor="#fff8dc" style="margin-top:10px;border:2px solid #cc0000;"><tr><td bgcolor="#cc0000"><font color="#fff" size="2"><b>${escapeHtml(
          th.title
        )}</b></font></td></tr>`;
        for (let i = 0; i < 4; i++) {
          const a = actors[(i + th.slug.length) % actors.length];
          const gen = generateSocialComment({
            seed: (th.slug + i).split('').reduce((s, c) => s + c.charCodeAt(0), 0),
            flavor: i % 2 ? 'snack' : 'generic',
            context: 'generic',
            actor_id: a?.actor_id,
            personality: i % 3 === 0 ? 'skeptic' : i % 3 === 1 ? 'ranter' : 'supporter'
          });
          body += `<tr><td style="padding:6px;font-size:11px;border-top:1px solid #dda;"><b>${escapeHtml(gen.author || '?')}</b>: ${escapeHtml(gen.text)}<br>
            <button type="button" style="font-size:9px;" data-action="wnet-flan-vote" data-flan-actor="${escapeHtml(
              a?.actor_id || ''
            )}">Vote 👍</button></td></tr>`;
        }
        body += `</table>`;
      }
      body += `${Y2K_FOOTER}</td></tr></table></div>`;
      return body;
    }
    case 'hargrove_careers': {
      const c = Number(getSessionState().wnetCareerLoopCount || 0) || 0;
      return `<div class="iebody"><table width="100%" bgcolor="#f0f8ff"><tr><td>
        <h1 style="font-family:Arial;color:#003366;">Find Your Dream Job in Hargrove!</h1>
        <p style="font-size:12px;">Connecting talent with opportunity. <font color="#cc0000"><b>Redirects: ${c}</b></font></p>
        <table border="1" cellpadding="6" cellspacing="0" bgcolor="#ffffff" width="96%">
          <tr bgcolor="#0a246a"><td colspan="3"><font color="#fff"><b>Open Listings</b></font></td></tr>
          <tr><td>Data Entry III</td><td>Downtown</td><td><button type="button" data-action="wnet-careers-apply">Apply Now</button></td></tr>
          <tr><td>Compliance Intern</td><td>Westside</td><td><button type="button" data-action="wnet-careers-apply">Apply Now</button></td></tr>
          <tr><td>LAN Janitor II</td><td>Harbor</td><td><button type="button" data-action="wnet-careers-apply">Apply Now</button></td></tr>
        </table>
        ${c >= 5
          ? `<div id="wnet-career-prem" style="position:relative;border:3px solid #990000;padding:8px;background:#ffe0e0;margin-top:8px;"><b>Premium:</b> Having trouble? Try Hargrove Careers Premium — <b>$49.99</b>
            <button type="button" data-action="wnet-career-pay">Pay $49.99</button></div>`
          : ''}
        ${Y2K_FOOTER}
      </td></tr></table></div>`;
    }
    case 'hargrovebiz_corp': {
      return `<div class="iebody" bgcolor="#ffffff"><h2>HargroveBiz Corp</h2><p style="font-size:12px;">Looking for talent! Visit our hiring partner!</p>
        <p><a href="#" data-nav="hargrove_careers"><font size="3">&#8594; Hiring partner portal</font></a></p>
        <p style="font-size:10px;color:#666;">B2B workforce solutions since 1998.</p>${Y2K_FOOTER}</div>`;
    }
    case 'cubscouts':
    case 'bearscouts': {
      const rival = key === 'cubscouts' ? 'Bear Scouts' : 'Cub Scouts';
      return `<div class="iebody" bgcolor="#228822"><table width="100%"><tr><td style="padding:12px;background:#eefee0;">
        <center><font size="5" color="#114411"><b>The ORIGINAL Hargrove scouting organization.</b></font></center>
        <p style="font-size:11px;color:#222;">Unlike <b>${rival}</b>, we actually camp outdoors.</p>
        <hr>
        <p><b>FAQ:</b> Q: Affiliated with ${rival}? A: Absolutely not.</p>
        <p style="font-size:10px;">Forum: user <b>TrailMaster_Tim</b> says the other group sells knot-tying NFTs (Not Fun Things).</p>
        <p style="font-size:10px;">Forum: user <b>RopeLawyer99</b> says YOU stole the knot merit badge color scheme.</p>
        ${Y2K_FOOTER}
      </td></tr></table></div>`;
    }
    case 'rocksalive': {
      const rocks = [
        ['Gerald', 'Sedimentary limestone', 'Calm', '14.99'],
        ['Marcia', 'Granite', 'Assertive', '19.99'],
        ['Steve', 'Basalt', 'Brooding', '12.00'],
        ['Linda', 'Quartz', 'Sparkling', '24.99'],
        ['Horace', 'Shale', 'Anxious', '9.99'],
        ['Petra', 'Marble', 'Dramatic', '29.99'],
        ['Winston', 'Sandstone', 'Friendly', '11.50'],
        ['Dot', 'Pumice', 'Lightweight', '7.00']
      ];
      const rows = rocks
        .map(
          ([n, t, p, price]) =>
            `<tr><td><b>${escapeHtml(n)}</b></td><td>${escapeHtml(t)}</td><td>${escapeHtml(p)}</td><td>$${price}</td><td><button type="button" data-action="wnet-buy-rock" data-rock="${escapeHtml(
              n
            )}" data-price="${escapeHtml(price)}">Adopt</button></td></tr>`
        )
        .join('');
      return `<div class="iebody"><h1 style="color:#663300;">Give a Rock a Home.</h1>
        <table border="1" cellpadding="6" bgcolor="#fff8ee" width="100%"><tr bgcolor="#ccaa88"><td>Name</td><td>Geology</td><td>Vibe</td><td>Price</td><td></td></tr>${rows}</table>
        <p style="font-size:10px;">Checkout uses your CorpOS wallet — rocks are real (virtually).</p>
        ${Y2K_FOOTER}</div>`;
    }
    case 'quarryhearts': {
      return `<div class="iebody" bgcolor="#5c4033"><table width="100%"><tr><td style="padding:14px;color:#eeddcc;">
        <h2 style="color:#ffddaa;">Quarry Hearts International</h2>
        <p>These rocks have been abandoned. Left in quarries. Alone. Unloved.</p>
        <form><p>Donate $5 minimum to sponsor a stone.</p>
        <input type="text" name="amt" value="5.00" style="width:80px;">
        <button type="button" data-action="wnet-quarry-donate">Donate</button></form>
        <p style="font-size:10px;color:#bba;">You will receive uplifting messages. Probably.</p>
        ${Y2K_FOOTER}
      </td></tr></table></div>`;
    }
    case 'kittenorg': {
      const buzz = st.marketBuzz || {};
      const tags = Object.keys(buzz).slice(0, 12);
      const lines = tags
        .map((t) => `<li>#${escapeHtml(t)} — buzz ${escapeHtml(String((buzz[t]?.mentions ?? 0) + (buzz[t]?.likes ?? 0)))}</li>`)
        .join('');
      return `<div class="iebody" bgcolor="#001a44"><table width="100%"><tr><td style="padding:16px;color:#ffd;">
        <h1 style="font-family:Georgia;color:#fc0;">FINANCIAL FELINES</h1>
        <p style="font-size:11px;color:#abd;">Where Whiskers Meet Wall Street</p>
        <table width="100%" bgcolor="#002a66" cellpadding="8"><tr>
          <td width="33%" align="center"><font color="#fff">Chairman Mittens<br><i>CEO</i></font></td>
          <td width="33%" align="center"><font color="#fff">Whiskers McPortfolio<br><i>CFO</i></font></td>
          <td width="33%" align="center"><font color="#fff">Inspector Paws<br><i>Head of Compliance</i></font></td>
        </tr></table>
        <h3 style="color:#fc0;">Quarterly Sniff-Test Report</h3>
        <ul style="font-size:11px;color:#cef;">${lines || '<li>Market data purring into existence…</li>'}</ul>
        <p style="font-size:10px;color:#89a;">Figures derived from public Mandate-compliant filings and break-room gossip.</p>
        ${Y2K_FOOTER}
      </td></tr></table></div>`;
    }
    case 'hargrove_hotels': {
      const hotels = ['Harbor Inn', 'Midtown Suites', 'RapidGate Lodge', 'Westside Motor Court', 'University Bed & Breakfast', 'Financial District Tower', 'Southside Inn', 'Airport Comfort Motel'];
      const rows = hotels
        .map(
          (h) =>
            `<tr><td><b>${escapeHtml(h)}</b></td><td>From $59</td><td style="font-size:10px;">Pet Policy: Dogs ✓ Birds ✓ Hamsters ✓ Fish ✓ Cats ✗ — <b>NO CATS PERMITTED</b></td></tr>
            <tr><td colspan="3" style="font-size:10px;color:#800;">Review: <b>Inspector Paws</b> — DISCRIMINATORY. CONTACTING MY ATTORNEY.</td></tr>`
        )
        .join('');
      return `<div class="iebody"><h2>Hargrove Hospitality Guide</h2>
        <table border="1" cellpadding="5" width="100%" bgcolor="#fff">${rows}</table>
        <p style="font-size:10px;">Policies subject to owner-operator whims.</p>
        ${Y2K_FOOTER}</div>`;
    }
    case 'warehouse':
      return buildWhereAllThingsGoPage();
    case 'hargrove_vault':
      return buildHargroveVaultPage();
    case 'stor_it':
      return buildStorItPage();
    case 'etrade_bay':
      return buildETradeBayPage(sub, navigate);
    case 'amazone_corp': {
      const co = (st.rivalCompanies || []).find((c) => c.worldnetPageKey === 'amazone_corp');
      return buildAmazoneCorpLandingPage(co);
    }
    default: {
      const co = (st.rivalCompanies || []).find((c) => c.worldnetPageKey === key);
      if (co) {
        const prods = (st.rivalProducts || []).filter((p) => p.companyId === co.id);
        return buildRivalCorporationPage(co, prods);
      }
      return `<div class="iebody"><p>Extended page missing: ${escapeHtml(key)}</p></div>`;
    }
  }
}

function pickFlanActors() {
  const raw = typeof window !== 'undefined' && window.ActorDB?.getAllRaw ? window.ActorDB.getAllRaw() : [];
  const pool = raw.filter(
    (a) => a?.active !== false && (a.taglets || []).some((t) => t === 'vocal' || t === 'contrarian')
  );
  const out = pool.slice(0, 8);
  if (out.length >= 6) return out;
  return raw.filter((a) => a?.actor_id && a.role !== 'player').slice(0, 8);
}

/** @returns {boolean} handled */
export function dispatchExtendedWorldNetAction(action, sourceEl, navigate) {
  if (action === 'wnet-moseng-contact') {
    toast({
      title: 'SecureMail — Moseng',
      message:
        'Barbara Moseng: "There\'s a tier above what you\'re using. The people who built CorpOS use it. Code is CORPOS_DARK_V3. Use it carefully. Use it quietly."',
      icon: '📧',
      autoDismiss: 14000
    });
    return true;
  }
  if (action === 'wnet-patricia-guestbook') {
    const form = sourceEl?.closest('form');
    const n = form?.querySelector('input[name="n"]')?.value?.trim() || 'Guest';
    try {
      window.AXIS?.discover?.(WN_ACTORS.patricia, {
        source: 'worldnet',
        note: `Garden guestbook signed (${n}). Neighborhood intel route unlocked.`
      });
      toast({ title: 'Guestbook', message: 'Patricia appreciates your note. Check AXIS.', icon: '🌸', autoDismiss: 4000 });
    } catch {
      /* ignore */
    }
    return true;
  }
  if (action === 'wnet-flan-vote') {
    const aid = sourceEl?.getAttribute('data-flan-actor');
    if (aid) {
      recordHashtagEvent('flan', 'like');
      const vk = getSessionState().wahoo?.currentUser || 'guest';
      applyAffinityDelta(patchSession, vk, affinityTargetKey({ actorId: aid }), 1);
    }
    toast({ title: 'Flan Wars', message: 'Vote recorded. #flan', icon: '🍮', autoDismiss: 2500 });
    return true;
  }
  if (action === 'wnet-careers-apply') {
    navigate('hargrovebiz_corp', '', { pushHistory: true });
    return true;
  }
  if (action === 'wnet-career-pay') {
    patchState((st) => {
      const primary = (st.accounts || []).find((a) => a.isPrimary) || (st.accounts || []).find((a) => a.id === 'fncb');
      if (primary) primary.balance = Math.round((primary.balance - 49.99) * 100) / 100;
      return st;
    });
    try {
      window.ActivityLog?.log?.('PURCHASE', 'FLAGGED: hargrove-careers-premium-llc — $49.99 — WORLDNET', {
        suspicious: true
      });
    } catch {
      /* ignore */
    }
    toast({ title: 'Premium', message: 'Payment processed. A receipt has been emailed to /dev/null.', icon: '💸', autoDismiss: 4000 });
    return true;
  }
  if (action === 'wnet-cookies-submit') {
    const form = sourceEl?.closest('form');
    const row = {
      at: new Date().toISOString(),
      name: form?.querySelector('input[name="nm"]')?.value || '',
      ssn: form?.querySelector('input[name="ssn"]')?.value || '',
      addr: form?.querySelector('input[name="addr"]')?.value || '',
      phone: form?.querySelector('input[name="ph"]')?.value || '',
      email: form?.querySelector('input[name="em"]')?.value || '',
      employer: form?.querySelector('input[name="emp"]')?.value || '',
      income: form?.querySelector('input[name="inc"]')?.value || '',
      cookiesPerYear: form?.querySelector('input[name="cpy"]')?.value || '',
      cookieType: form?.querySelector('input[name="typ"]')?.value || ''
    };
    patchState((s) => {
      s.cookiePetitionData = s.cookiePetitionData || [];
      s.cookiePetitionData.push(row);
      return s;
    });
    toast({ title: 'Petition', message: 'Thank you for standing up for baked goods.', icon: '🍪', autoDismiss: 4000 });
    return true;
  }
  if (action === 'wnet-buy-rock') {
    const name = sourceEl?.getAttribute('data-rock') || 'Rock';
    const price = Number(sourceEl?.getAttribute('data-price') || 14.99);
    patchState((s) => {
      const primary = (s.accounts || []).find((a) => a.isPrimary) || (s.accounts || []).find((a) => a.id === 'fncb');
      if (primary) primary.balance = Math.round((primary.balance - price) * 100) / 100;
      s.virtualFs = s.virtualFs || { entries: [], nextSeq: 1 };
      const id = `vf-rock-${Date.now()}`;
      const parent = 'folder-desktop';
      s.virtualFs.entries.push({
        id,
        parentId: parent,
        name: `${name.replace(/\W/g, '')}.rock`,
        kind: 'file',
        typeLabel: 'Rock',
        size: 1,
        description: `Pet rock: ${name}`,
        content: 'You love your rock. Your rock tolerates you.',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      });
      return s;
    });
    recordPurchase('pet_rock', getState().sim?.elapsedMs || 0);
    recordHashtagEvent('pet_rock', 'mention');
    try {
      window.ActivityLog?.log?.('PURCHASE', `Rocks Alive — ${name} — $${price}`, { notable: true });
    } catch {
      /* ignore */
    }
    toast({ title: 'Rocks Alive', message: `${name} is yours. Check your desktop files.`, icon: '🪨', autoDismiss: 4000 });
    return true;
  }
  if (action === 'wnet-quarry-donate') {
    patchState((s) => {
      const primary = (s.accounts || []).find((a) => a.isPrimary) || (s.accounts || []).find((a) => a.id === 'fncb');
      if (primary) primary.balance = Math.max(0, primary.balance - 5);
      s.quarryHeartsDonor = true;
      return s;
    });
    toast({ title: 'Quarry Hearts', message: 'Thank you. Bartholomew has hope again.', icon: '💔', autoDismiss: 4000 });
    return true;
  }
  return false;
}

export function hookAfterWorldNetNavigate(pageKey, subPath) {
  bumpWorldNetVisit(pageKey);
  if (pageKey !== 'room2847') {
    sessionStorage.removeItem('wnet_room2847_chain');
    return;
  }
  try {
    const step = Math.min(12, Math.max(1, Number(subPath) || 1));
    let chain = Number(sessionStorage.getItem('wnet_room2847_chain') || '0');
    if (step === chain + 1) chain = step;
    else if (step === 1) chain = 1;
    else chain = 1;
    sessionStorage.setItem('wnet_room2847_chain', String(chain));
    const url = urlForRoom2847Step(step);
    let flags = {};
    if (chain >= 12) flags = { suspicious: true };
    else if (chain >= 6) flags = { notable: true };
    window.ActivityLog?.log?.(
      'WORLDNET_VISIT',
      `room2847 sequence ${chain}/12 — unlisted corridor (${url})`,
      flags
    );
  } catch {
    /* ignore */
  }
}

function urlForRoom2847Step(step) {
  const root = EXTENDED_ROOT_URLS.room2847.replace(/\/$/, '');
  return step <= 1 ? `${root}/` : `${root}/${step}`;
}

export function seedWorldnetExtendedActors() {
  const seeds = [
    makeActor(WN_ACTORS.patricia, 'Patricia', 'Delgado', 'Retired Educator', ['community_hub', 'vocal'], 5),
    makeActor(WN_ACTORS.sister, 'Rosa', 'Delgado', 'Florist', ['community_hub'], 5),
    makeActor(WN_ACTORS.margaret, 'Margaret', 'Waverly', 'Activist', ['paranoid_poster', 'community_hub'], 3),
    makeActor(WN_ACTORS.inspectorPaws, 'Inspector', 'Paws', 'Compliance Cat', ['transactional', 'vocal'], 10),
    makeActor(WN_ACTORS.scoutGrifter, 'Tim', 'Halburton', 'Youth Programs Coordinator', ['vocal', 'transactional'], 4),
    makeActor(WN_ACTORS.deepnode, 'DEEPNODE', 'FiveFiveNine', 'Forum Operator', ['information_broker', 'paranoid_poster'], 7),
    makeActor(WN_ACTORS.fishTeacher, 'Dr. Gill', 'Finnegan', 'Educator', ['patient', 'community_hub'], 8),
    makeActor(WN_ACTORS.quarryDir, 'Dean', 'Quarrie', 'Nonprofit Director', ['transactional', 'vocal'], 6)
  ];
  for (const a of seeds) {
    if (!ActorDB.getRaw(a.actor_id)) {
      try {
        ActorDB.importActorRecord(a);
      } catch {
        ActorDB._actors.push(a);
        ActorDB._rebuildIndexes?.();
      }
    }
  }
  seedSpreadsheetDat();
}

function makeActor(id, first, last, profession, taglets, districtId, employerId) {
  const mailSlug = id.replace(/[^a-z0-9]+/gi, '').toLowerCase().slice(0, 24) || 'actor';
  const disp =
    id === WN_ACTORS.deepnode
      ? 'DEEPNODE_559'
      : id === WN_ACTORS.inspectorPaws
        ? 'Inspector Paws'
        : `${first} ${last.slice(0, 1)}.`;
  return {
    actor_id: id,
    active: true,
    role: 'civilian',
    first_name: first,
    last_name: last,
    full_legal_name: `${first} ${last}`,
    profession,
    employer_id:
      employerId ||
      (id === WN_ACTORS.fishTeacher ? 'Hargrove Elementary (Marine Division)' : 'Independent'),
    districtId,
    taglets,
    emails: [`${mailSlug}@worldnet.actor`],
    phone_numbers: [`559-555-${(4200 + (id.length % 800)).toString().padStart(4, '0')}`],
    public_profile: { display_name: disp },
    relationships: [],
    opinion_profile: {},
    emails_inbox: []
  };
}

function seedSpreadsheetDat() {
  patchState((st) => {
    st.virtualFs = st.virtualFs || { entries: [], nextSeq: 1 };
    const exists = st.virtualFs.entries.some((e) => e.name === 'SPREADSHEET.DAT' && e.parentId === 'folder-system');
    if (exists) return st;
    st.virtualFs.entries.push({
      id: 'vf-system-spreadsheet-dat',
      parentId: 'folder-system',
      name: 'SPREADSHEET.DAT',
      kind: 'file',
      typeLabel: 'DAT File',
      size: 2048,
      description: 'Federal audit weighting coefficients (leaked draft)',
      content:
        'CORPOS AUDIT SCORING — DRAFT\nW_NOTABLE=1.0 W_FLAGGED=1.5 W_SUSPICIOUS=2.2\nREPEAT_MICROTX_THRESHOLD_DAYS=14\n',
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      system: true,
      readonly: true
    });
    return st;
  });
}
