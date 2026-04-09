/**
 * Moogle — in-world Google parody (WorldNet). Cow theme: minimal, spec-locked.
 */
import { escapeHtml } from './identity.js';
import { getState } from './gameState.js';
import { getWorldNetSiteDirectoryLinks } from './worldnet-routes.js';

const FILLER_RESULTS = [
  {
    title: 'DotCom-Now — IPO Readiness Checklist',
    url: 'www.dotcom-now.com/ipoready.html',
    desc: 'Free white paper: burn rate, runway, and surviving the NASDAQ bell. Updated weekly for pre-profit ventures.'
  },
  {
    title: 'Federal Compliance Digest — Mandate 2000-CR7 FAQ',
    url: 'www.fedcompliance.gov/net/faq.htm',
    desc: 'Plain-language overview of commercial internet monitoring rules. Bookmark for audit season.'
  },
  {
    title: 'Silicon Prairie Ventures — Seed Forum',
    url: 'www.siliconprairie.net/forum/',
    desc: 'Message boards for Midwest startup founders. Intro threads and IPO rumor roundups (archived).'
  },
  {
    title: 'RapidMart B2B — Bulk Office Supply Ordering',
    url: 'www.rapidmart1999.net/b2b/',
    desc: 'Wholesale pricing on chairs, CRT monitor arms, and Y2K rollover supplies. CorpOS buyer accounts welcome.'
  },
  {
    title: 'Intek Corporation — Enterprise Workstation Drivers',
    url: 'www.intek-corp.com/support/drivers/',
    desc: 'Download updated video and NIC drivers for CorpOS 2000 certified workstations.'
  },
  {
    title: 'Rec.Business.General Archive Mirror',
    url: 'ftp.archive.org/rbg-mirror/',
    desc: 'Read-only mirror of popular Usenet business threads from 1998–1999. Search by author or subject line.'
  },
  {
    title: 'First National Corp — Online Banking Demo',
    url: 'www.firstnationalcorp.com/demo/',
    desc: 'Tour our secure ledger view and bill pay pilot. Java applet required.'
  },
  {
    title: 'Y2K Bunker Supply Co.',
    url: 'www.y2kbunkersupply.net/',
    desc: 'Generators, MREs, and backup tape vacuums. “When the lights flicker, we’re open.”'
  },
  {
    title: 'OpenDirectory volunteer-appreciation.org',
    url: 'www.dmoz-clone.org/thanks/',
    desc: 'Thank-you page for editors of the human-reviewed web directory. Apply to edit the Shopping branch.'
  },
  {
    title: 'ALTavista Cache: best search engine (1999)',
    url: 'www.altavista.digital.com/cgi-bin/cache?q=best+search',
    desc: 'Cached page snapshot. Historical interest only; links may be stale.'
  },
  {
    title: 'Webmaster World — “Is meta keywords still a thing?”',
    url: 'www.webmasterworld.com/forum21/thread88421.htm',
    desc: '127 replies. Consensus: yes, for now. Flames moderated.'
  },
  {
    title: 'GeoCities — Neighborhood: WallStreet',
    url: 'www.geocities.com/WallStreet/Lobby/4821/',
    desc: 'Personal page on penny stocks and “one weird trick” banner ads. Under construction GIF.'
  }
];

function hashQuery(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function parseMoogleResultsSub(sub) {
  const raw = decodeURIComponent(String(sub || '').replace(/\+/g, '%20'));
  const nl = raw.indexOf('\n');
  if (nl === -1) return { query: raw.trim(), page: 1 };
  const query = raw.slice(0, nl).trim();
  const page = Math.max(1, parseInt(raw.slice(nl + 1).trim(), 10) || 1);
  return { query, page };
}

export function formatMoogleResultsSub(query, page = 1) {
  const q = String(query || '').trim();
  if (page <= 1) return encodeURIComponent(q);
  return encodeURIComponent(`${q}\n${page}`);
}

function didYouMeanLine(query) {
  const q = String(query || '').trim().toLowerCase();
  if (/\bwahoo\b/.test(q) && !/\bwahoo!\b/.test(q)) {
    return `<p class="moogle-did-you-mean">Did you mean: <a data-nav="moogle_results" data-wnet-subpath="${escapeHtml(formatMoogleResultsSub('Wahoo portal home'))}">Wahoo portal home</a>?</p>`;
  }
  if (q.includes('googl')) {
    return `<p class="moogle-did-you-mean">Did you mean: <a data-nav="moogle_results" data-wnet-subpath="${escapeHtml(formatMoogleResultsSub('Moogle search'))}">Moogle search</a>?</p>`;
  }
  return '';
}

function collectResults(query) {
  const q = String(query || '').trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  /** @type {{ title: string, desc: string, url: string, nav?: string, sub?: string }[]} */
  const out = [];
  const seen = new Set();

  const add = (item) => {
    const key = `${item.title}|${item.url}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };

  if (tokens.length) {
    const st = getState();
    for (const c of st.registry?.citizens || []) {
      const name = String(c.displayName || '').toLowerCase();
      if (tokens.some((t) => name.includes(t))) {
        add({
          title: `${c.displayName} — CorpOS profile`,
          desc: `Citizen record on file. ${c.kind === 'player' ? 'Player' : 'Registered person'} in federal systems.`,
          url: 'www.corpos.local/profile',
          nav: 'personal',
          sub: ''
        });
      }
    }
    for (const co of st.companies || []) {
      const name = String(co.name || '').toLowerCase();
      if (tokens.some((t) => name.includes(t))) {
        add({
          title: `${co.name} — company listing`,
          desc: `${co.industry || 'Business'} · Registered ${co.registered || ''}.`,
          url: 'www.fedbizreg.gov/lookup',
          nav: 'bizreg',
          sub: ''
        });
      }
    }
    const cr = st.contentRegistry;
    for (const npc of cr?.npcs || []) {
      const name = String(npc.displayName || npc.name || '').toLowerCase();
      if (name && tokens.some((t) => name.includes(t))) {
        add({
          title: `${npc.displayName || npc.name} — directory mention`,
          desc: 'Listed in federal NPC registry datasets mirrored on WorldNet.',
          url: 'www.worldwidewebregistry.net/',
          nav: 'web_registry',
          sub: ''
        });
      }
    }
    for (const co of cr?.companies || []) {
      const name = String(co.name || '').toLowerCase();
      if (name && tokens.some((t) => name.includes(t))) {
        add({
          title: `${co.name} — registry entry`,
          desc: 'Commercial entity record (content pipeline).',
          url: 'www.fedbizreg.gov/',
          nav: 'bizreg',
          sub: ''
        });
      }
    }
    for (const p of cr?.pages || []) {
      const title = String(p.title || p.siteName || '').toLowerCase();
      const site = String(p.siteName || '').toLowerCase();
      if (tokens.some((t) => title.includes(t) || site.includes(t))) {
        add({
          title: `${p.title || p.siteName || 'WorldNet site'}`,
          desc: String(p.siteTagline || p.category || 'Indexed WorldNet page via content registry.'),
          url: String(p.url || 'pipeline.local').replace(/^https?:\/\//i, ''),
          nav: 'pipeline_page',
          sub: String(p.pageId || '')
        });
      }
    }

    for (const link of getWorldNetSiteDirectoryLinks()) {
      const blob = `${link.title} ${link.url}`.toLowerCase();
      if (tokens.some((t) => blob.includes(t))) {
        add({
          title: link.title,
          desc: 'Listed in the WorldNet site directory (99669 mirror).',
          url: String(link.url || '').replace(/^https?:\/\//i, ''),
          nav: link.pageKey,
          sub: link.subPath || ''
        });
      }
    }
  }

  const seed = hashQuery(q || 'moogle');
  const fillerOrder = [...FILLER_RESULTS];
  for (let i = fillerOrder.length - 1; i > 0; i--) {
    const j = (seed + i * 17) % (i + 1);
    [fillerOrder[i], fillerOrder[j]] = [fillerOrder[j], fillerOrder[i]];
  }
  for (const f of fillerOrder) {
    if (out.length >= 24) break;
    add({
      title: f.title,
      desc: f.desc,
      url: f.url
    });
  }

  return out;
}

function escSubAttr(raw) {
  return escapeHtml(encodeURIComponent(raw ?? ''));
}

function resultRow(r) {
  const subAttr = escSubAttr(r.sub || '');
  const titleInner = r.nav
    ? `<a data-nav="${escapeHtml(r.nav)}" data-wnet-subpath="${subAttr}">${escapeHtml(r.title)}</a>`
    : `<span>${escapeHtml(r.title)}</span>`;
  const showUrl = r.url.startsWith('http') ? r.url : `http://${r.url}`;
  return `<div class="moogle-result">
  <div class="moogle-result-title">${titleInner}</div>
  <p class="moogle-result-desc">${escapeHtml(r.desc)}</p>
  <p class="moogle-result-url">${escapeHtml(showUrl)}</p>
  <p class="moogle-result-meta"><a data-nav="stub">Cached</a> - <a data-nav="stub">Similar pages</a> - <a data-nav="stub">Note this</a></p>
</div>`;
}

function pagerHtml(query) {
  const nums = [];
  for (let n = 1; n <= 10; n++) {
    nums.push(
      `<a data-nav="moogle_results" data-wnet-subpath="${escapeHtml(formatMoogleResultsSub(query, n))}">${n}</a>`
    );
  }
  const L = (ch, cls, pageNum) =>
    `<a data-nav="moogle_results" data-wnet-subpath="${escapeHtml(formatMoogleResultsSub(query, pageNum))}" href="#" class="moogle-pager-letter ${cls}">${escapeHtml(ch)}</a>`;
  const lineLetters =
    L('M', 'm-letter', 3) +
    L('o', 'o-letter-1', 7) +
    L('o', 'o-letter-2', 2) +
    L('g', 'g-letter', 9) +
    L('l', 'l-letter', 4) +
    L('e', 'e-letter', 8);
  return `<div class="moogle-pager">
  <div class="moogle-pager-letters moogle-logo moogle-logo--sm" style="font-size:22px">${lineLetters}</div>
  <div class="moogle-pager-row">${nums.join(' ')}</div>
</div>`;
}

const MOOGLE_SPOTS_SVG = `<div class="moogle-spots" aria-hidden="true"><svg viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
<ellipse cx="28" cy="32" rx="22" ry="18" fill="#111"/>
<ellipse cx="78" cy="48" rx="18" ry="22" fill="#111"/>
<ellipse cx="52" cy="68" rx="14" ry="12" fill="#111"/>
</svg></div>`;

function topNav() {
  return `<div class="moogle-top-nav">
<a data-nav="moogle_results" data-wnet-subpath="${escapeHtml(formatMoogleResultsSub('web'))}">Web</a> &nbsp;|&nbsp;
<a data-nav="moogle_images">Images</a> &nbsp;|&nbsp;
<a data-nav="moogle_groups">Groups</a> &nbsp;|&nbsp;
<a data-nav="moogle_directory">Directory</a> &nbsp;|&nbsp;
<a data-nav="stub">News</a> &nbsp;|&nbsp;
Moogle.com in: English
</div>`;
}

export function renderMoogleHome() {
  return `<div class="iebody moogle-page">${MOOGLE_SPOTS_SVG}
${topNav()}
<div class="moogle-home-main">
  <div class="moogle-logo" aria-label="Moogle"><span class="m-letter">M</span><span class="o-letter-1">o</span><span class="o-letter-2">o</span><span class="g-letter">g</span><span class="l-letter">l</span><span class="e-letter">e</span></div>
  <p class="moogle-beta">Beta</p>
  <p class="moogle-tagline"><b>The Whole Herd of the Web</b></p>
  <p class="moogle-subtag">Searching 1,240,000,000 web pages</p>
  <div class="moogle-search-wrap">
    <input type="text" id="moogle-q-home" class="moogle-input" maxlength="200" autocomplete="off" aria-label="Search">
    <span class="moogle-input-hint">Moogle Search</span>
  </div>
  <div class="moogle-btn-row">
    <button type="button" class="moogle-btn" data-action="moogle-search">Moogle Search</button>
    <button type="button" class="moogle-btn" data-action="moogle-feeling-moody">I'm Feeling Moody</button>
  </div>
  <p class="moogle-fine-print">Moogle offered in: Español &nbsp; Français &nbsp; Deutsch &nbsp; 日本語</p>
  <p class="moogle-fine-print">🐄 New! Moogle Groups BETA — <a data-nav="moogle_groups">Join the herd.</a></p>
</div>
<p class="moogle-footer-note">Moogle is not affiliated with any dairy or livestock operations.</p>
<p class="moogle-footer">©2000 Moogle Inc. &nbsp;|&nbsp; <a data-nav="moogle_about">About Moogle</a> &nbsp;|&nbsp; <a data-nav="stub">Advertise with Us</a> &nbsp;|&nbsp; <a data-nav="stub">Moogle Store</a> &nbsp;|&nbsp; <a data-nav="stub">Search Solutions</a> &nbsp;|&nbsp; <a data-nav="stub">Jobs, Press, &amp; Help</a></p>
</div>`;
}

export function renderMoogleSearchResults(sub) {
  const { query, page } = parseMoogleResultsSub(sub);
  const qEsc = escapeHtml(query);
  const all = collectResults(query);
  const perPage = 10;
  const start = (page - 1) * perPage;
  const slice = all.slice(start, start + perPage);
  const total = Math.max(4820000, all.length * 9100);
  const pseudoSec = (0.28 + (hashQuery(query) % 7) / 100).toFixed(2);

  const sponsored = `<div class="moogle-sponsored">
  <div class="moogle-sponsored-header">Sponsored Links</div>
  <div><a data-nav="wn_shop" data-wnet-subpath="rapidmart/home">RapidMart — bulk supplies for growing offices</a></div>
  <div style="margin-top:6px;"><a data-nav="devtools">devtools.net — CorpOS certified downloads</a></div>
  <div style="margin-top:6px;color:#555;">Text ads only. No banners. We're old-fashioned.</div>
</div>`;

  const rows = slice.map(resultRow).join('');
  const didMean = didYouMeanLine(query);

  return `<div class="iebody moogle-page">
${topNav()}
<div class="moogle-results-bar">
  <div class="moogle-logo moogle-logo--sm"><a data-nav="moogle_home" style="text-decoration:none"><span class="m-letter">M</span><span class="o-letter-1">o</span><span class="o-letter-2">o</span><span class="g-letter">g</span><span class="l-letter">l</span><span class="e-letter">e</span></a></div>
  <div class="moogle-search-wrap moogle-search-wrap--wide">
    <input type="text" id="moogle-q-results" class="moogle-input moogle-input--results" value="${qEsc}" maxlength="200" autocomplete="off" aria-label="Search">
  </div>
  <button type="button" class="moogle-btn" data-action="moogle-search">Moogle Search</button>
</div>
<div class="moogle-tabs">
<a data-nav="moogle_results" data-wnet-subpath="${escapeHtml(formatMoogleResultsSub(query, page))}"><b>Web</b></a> &nbsp;|&nbsp;
<a data-nav="moogle_images">Images</a> &nbsp;|&nbsp;
<a data-nav="moogle_groups">Groups</a> &nbsp;|&nbsp;
<a data-nav="moogle_directory">Directory</a> &nbsp;|&nbsp;
<a data-nav="stub">News</a>
</div>
<div class="moogle-results-body">
  ${sponsored}
  <div class="moogle-results-inner">
    ${didMean}
    <p class="moogle-count-line">Results ${start + 1} - ${start + slice.length} of about ${total.toLocaleString()} for <b>${qEsc}</b>. (${pseudoSec} seconds)</p>
    ${rows}
    ${pagerHtml(query)}
  </div>
</div>
</div>`;
}

export function renderMoogleImages() {
  return `<div class="iebody moogle-page">
${topNav()}
<div class="moogle-stub">
  <h1>Moogle Images BETA</h1>
  <p>Image search is coming soon. The herd is working on it.</p>
  <p><a data-nav="moogle_home">Back to Moogle</a></p>
</div>
</div>`;
}

export function renderMoogleGroups() {
  const rows = [
    ['alt.internet.startups', '4,821'],
    ['comp.software.reviews', '12,442'],
    ['rec.business.general', '8,039'],
    ['misc.invest.marketplace', '15,220'],
    ['sci.crypt.y2k-panic', '3,104'],
    ['alt.culture.dotcom', '9,876'],
    ['gov.us.federal.regs', '2,410'],
    ['microsoft.public.windows.memphis.beta', '18,903'],
    ['linux.dev.kernel', '22,118'],
    ['ne.ws.internal.buzzwords', '1,992']
  ]
    .map(
      ([name, n]) =>
        `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(n)}</td></tr>`
    )
    .join('');
  return `<div class="iebody moogle-page">
${topNav()}
<div class="moogle-stub">
  <h1>Moogle Groups BETA — Join the Discussion</h1>
  <table class="moogle-groups-table">
    <tr><th>Group</th><th>Members (approx.)</th></tr>
    ${rows}
  </table>
  <p style="margin-top:20px;"><a data-nav="moogle_home">Back to Moogle</a></p>
</div>
</div>`;
}

export function renderMoogleDirectory() {
  const cats = [
    ['Arts', 'Fine art, literature, and design resources.'],
    ['Business', 'Companies, finance, employment, industry news.'],
    ['Computers', 'Hardware, software, internet, programming.'],
    ['Games', 'Video games, RPGs, and entertainment software.'],
    ['Health', 'Medicine, fitness, and wellness information.'],
    ['Home', 'Family, consumers, daily life, home improvement.'],
    ['News', 'Current events, media, and wire services.'],
    ['Recreation', 'Hobbies, travel, food, and outdoor activities.'],
    ['Reference', 'Libraries, dictionaries, maps, and FAQs.'],
    ['Regional', 'Geographic and local interest sites.'],
    ['Science', 'Research institutions, space, biology, physics.'],
    ['Shopping', 'Retailers, auctions, and product listings.'],
    ['Society', 'People, issues, activism, religion.'],
    ['Sports', 'Professional and amateur athletics coverage.'],
    ['World', 'International resources and multilingual pages.']
  ];
  const sub = (name) =>
    `<ul class="moogle-dir-sub"><li><a data-nav="stub">${name} — highlights</a></li><li><a data-nav="stub">Complete ${name} listings</a></li></ul>`;
  const list = cats
    .map(
      ([name, blurb]) =>
        `<li><a data-nav="stub"><b>${escapeHtml(name)}</b></a><br>${escapeHtml(blurb)}${sub(name)}</li>`
    )
    .join('');
  return `<div class="iebody moogle-page">
${topNav()}
<div class="moogle-stub">
  <h1>Moogle Directory</h1>
  <p style="color:#666;font-size:12px;">Open Directory–style index. Editors welcome.</p>
  <ul class="moogle-dir-list">${list}</ul>
  <p style="margin-top:20px;"><a data-nav="moogle_home">Moogle Home</a></p>
</div>
</div>`;
}

export function renderMoogleAbout() {
  return `<div class="iebody moogle-page">
${topNav()}
<div class="moogle-about">
  <h1 style="font-size:20px;font-weight:normal;">About Moogle</h1>
  <p>Moogle's mission is to organize the world's information and make it universally accessible and useful.</p>
  <p>Moogle launched in 2000 with a simple idea: find what you're looking for, fast. No clutter. No distractions. Just results.</p>
  <p>The name? We liked cows. Don't read too much into it.</p>
  <p>Moogle is headquartered in [city redacted], and is operated by a small team that believes the web should work for everyone — not just people who already know where to look.</p>
  <p>Questions? <a href="mailto:moogle-info@moogle.com">moogle-info@moogle.com</a></p>
  <p><a data-nav="moogle_home">← Moogle Home</a></p>
</div>
</div>`;
}

/** @param { (key: string, sub: string, opts?: { pushHistory?: boolean }) => void } navigate */
export function runMoogleSearch(navigate, rootEl) {
  const doc = rootEl?.ownerDocument || document;
  const q =
    (doc.getElementById('moogle-q-results')?.value ||
      doc.getElementById('moogle-q-home')?.value ||
      '').trim();
  if (!q) return;
  navigate('moogle_results', formatMoogleResultsSub(q), { pushHistory: true });
}

/** @param { (key: string, sub: string, opts?: { pushHistory?: boolean }) => void } navigate */
export function runMoogleFeelingMoody(navigate) {
  const picks = [
    'dot-com burn rate calculator',
    'organic search engine feed',
    'Y2K compliance checklist',
    'venture capital herd mentality',
    'best meta keywords 2000',
    'how to install CorpOS font pack'
  ];
  const q = picks[Math.floor(Math.random() * picks.length)];
  navigate('moogle_results', formatMoogleResultsSub(q), { pushHistory: true });
}
