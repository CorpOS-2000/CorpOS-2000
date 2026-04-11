import {
  getState, getGameEpochMs, formatMoney,
  ccrGetNewsFeed, ccrListContracts, ccrContractTotal
} from './gameState.js';
import { escapeHtml } from './identity.js';
import { getRequirement, getModuleById } from './ccr-catalog.js';
import { on } from './events.js';

/** One in-game day in simulation ms (matches gameState billing). */
const SIM_DAY_MS = 86400000;
/** Rolling archive: headlines from the last ~two months of in-game time. */
const HERALD_ARCHIVE_WINDOW_MS = 60 * SIM_DAY_MS;

/**
 * Lore & world headlines (GDD v2). Each `atSimMs` is the sim time when the story “ran”
 * (negative = before / at campaign start Jan 1, 2000).
 */
const HERALD_LORE = Object.freeze([
  { atSimMs: -58 * SIM_DAY_MS, headline: 'RapidGate: One Year Later — How Sanderson Became a Cautionary Verb', summary: 'Investigative follow-up: Derek Sanderson has kept a low profile since his records became public. Insiders say he consults under a pseudonym.' },
  { atSimMs: -56 * SIM_DAY_MS, headline: 'Moseng Publishes Abroad: “The Data Didn’t Lie — The Invoice Did”', summary: 'Reporter Barbara Moseng, now filing from overseas, released a lengthy essay on behavioral forecasting and the RapidEMart vendor network.' },
  { atSimMs: -54 * SIM_DAY_MS, headline: 'RapidEMart Rebrands Quietly; Subsidiaries Spread Like Fog', summary: 'The former e-commerce giant insists it welcomes the CorpOS era. Competitors whisper that its infrastructure never left the stack — it only changed jackets.' },
  { atSimMs: -52 * SIM_DAY_MS, headline: 'Hargrove Chamber: “Dot-Com Leases Up 40% — We’re Running Out of Garages”', summary: 'Commercial landlords report a gold rush for strip-mall office space as startups chase the millennium boom.' },
  { atSimMs: -50 * SIM_DAY_MS, headline: 'Black Cherry Handsets Fly Off Shelves in Hargrove Metro', summary: 'Retailers can’t keep the keyboard phones in stock. “It’s the status symbol for anyone who returns a page before lunch,” one manager said.' },
  { atSimMs: -48 * SIM_DAY_MS, headline: 'Wahoo Portal Signs Ad Deal; “Portal Wars” Heat Up', summary: 'The homepage battle between Wahoo, Goggle, and AOE landing pages is squeezing smaller portals out of the banner-ad market.' },
  { atSimMs: -46 * SIM_DAY_MS, headline: 'MicroCorp Stock Split Rumors Swirl Ahead of Y2K Patch Bundle', summary: 'Analysts say enterprise upgrade cycles could mirror the 1999 licensing surge — if data centers stay online.' },
  { atSimMs: -44 * SIM_DAY_MS, headline: 'Federal Mandate 2000-CR7: What Businesses Must Log Starting January', summary: 'The Federal Bureau of Commerce Enforcement issued a plain-language guide to auditable transactions under the new CorpOS certification rules.' },
  { atSimMs: -42 * SIM_DAY_MS, headline: 'eTrade Bay Sellers Brace for Holiday Chargeback Storm', summary: 'The auction giant’s trust-and-safety team is hiring temp moderators by the hundred.' },
  { atSimMs: -40 * SIM_DAY_MS, headline: 'Amazone Opens Fulfillment Annex Near Fresno; Trucks Rumored Overnight', summary: 'Logistics watchers say the “one-letter” retailer is building the spine of next-day dreams — on dial-up budgets.' },
  { atSimMs: -38 * SIM_DAY_MS, headline: 'AOE Dial-Up Nodes Jammed; Customers Hear Busy Signal of Destiny', summary: 'America Online Express subscribers in California report peak-hour queues. Spokesperson: “Try again after Letterman.”' },
  { atSimMs: -36 * SIM_DAY_MS, headline: 'Op-Ed: Three Perceptions — Why Public, Corporate, and Government Can’t Be Faked Separately', summary: 'Syndicated columnist argues that charity photo-ops won’t fix a Judicial Record that glows in the dark.' },
  { atSimMs: -34 * SIM_DAY_MS, headline: 'ValuMart Tests “Supercenter Web Kiosk” — Analysts Skeptical', summary: 'Brick-and-mortar tries to bridge to e-commerce without angering RapidEMart-aligned suppliers.' },
  { atSimMs: -32 * SIM_DAY_MS, headline: 'Goggle Index Hits New Milestone; “Search Quality” Becomes Marketing Speak', summary: 'Early SEO consultants promise top ten placement. Regulators promise nothing.' },
  { atSimMs: -30 * SIM_DAY_MS, headline: 'Napstar Hearing Delayed Again; Labels Demand Blood, Bandwidth', summary: 'Courts struggle to define “sharing” when everyone’s ripping at 56k.' },
  { atSimMs: -28 * SIM_DAY_MS, headline: 'PayPass Pilots Small-Business Invoicing; Paper Checks Sneer', summary: 'Digital payments still fight chargeback anxiety in the trades.' },
  { atSimMs: -26 * SIM_DAY_MS, headline: 'Sysco Systems Routers Back-Order Crisis Hits Campus Networks', summary: 'Universities delaying spring LAN upgrades; students blame “the backbone guys.”' },
  { atSimMs: -24 * SIM_DAY_MS, headline: 'From $12,500 to Lease Signed: Garage Founders Share Y2K Survival Tips', summary: 'Profile series on Hargrove entrepreneurs juggling mom’s Wi-Fi-less garage and their first Articles of Organization.' },
  { atSimMs: -22 * SIM_DAY_MS, headline: 'Corporate Espionage Insurance Policies Enter Market — Premiums Stun CFOs', summary: 'Underwriters pitch riders for Social, Sabotage, Cyber, Legal, and “miscellaneous rival drama.”' },
  { atSimMs: -20 * SIM_DAY_MS, headline: 'Editorial: The River and the Dam — What RapidEMart Left Inside CorpOS', summary: 'Guest essay argues the mandate didn’t erase the old stack; it nationalized the lesson. Federal officials call it “speculation.”' },
  { atSimMs: -18 * SIM_DAY_MS, headline: 'Dell-Tech Ships Millennium Desktop Bundles; CRTs Still King', summary: 'Consumer line targets first-time business owners who want a tower that doubles as a space heater.' },
  { atSimMs: -16 * SIM_DAY_MS, headline: 'Motarola StarTac Knockoffs Flood Gray Market; Carriers Wink', summary: 'Hargrove mall kiosks sell “import” handsets with questionable firmware. Black Cherry distances itself from clones.' },
  { atSimMs: -14 * SIM_DAY_MS, headline: 'Federal Revenue Authority Reminds Filers: “Y2K Isn’t a Deduction”', summary: 'Annual tax guidance warns that buying a new fax machine for “panic reasons” is still just capital equipment.' },
  { atSimMs: -12 * SIM_DAY_MS, headline: 'WorldNet Traffic Spikes: “Everyone’s Online and Nobody’s Productive”', summary: 'ISPs report record sessions as employees test CorporateNet Explorer bookmarks on company time.' },
  { atSimMs: -10 * SIM_DAY_MS, headline: 'JeeMail: Privacy Notice Says Mail May Be Monitored — Users Click “OK” Without Reading', summary: 'Legal experts note Federal Mandate 2000-CR7 language mirrors earlier RapidEMart-era disclosure fights.' },
  { atSimMs: -8 * SIM_DAY_MS, headline: 'Rival CEOs Trade Barbs at Hargrove Rotary — “Social Combat” Quip Goes Viral', summary: 'Chamber dinner roast turns into a lesson on corporate combat types: Social, Espionage, Sabotage, Cyber, Legal.' },
  { atSimMs: -6 * SIM_DAY_MS, headline: 'Notoriety Watch: Street Talk Column Debuts — “Who’s One Audit Away?”', summary: 'Anonymous tipsheet tracks whispers of FBCE interest, hostile takeovers, and who still owes favors downtown.' },
  { atSimMs: -4 * SIM_DAY_MS, headline: 'New Year’s Eve: CorpOS Installers Book Overtime Through Midnight', summary: 'Certified technicians race to bring small businesses online before the mandate clock strikes.' },
  { atSimMs: -2 * SIM_DAY_MS, headline: 'Countdown: 48 Hours Until Every U.S. Company Runs Through CorpOS', summary: 'Restaurants, garages, and LLCs face the same deadline. Skeptics say the cage is here — supporters say it’s just compliance.' },
  { atSimMs: 0, headline: 'Midnight — CorpOS Mandate Live: “The Cage Has Wi-Fi,” Says Treasury Secretary', summary: 'Government-certified OS now required for registered entities. RapidEMart shares tick up on the first trading day of 2000.' }
]);

function inHeraldArchiveWindow(pubSimMs, nowSimMs) {
  return pubSimMs <= nowSimMs && pubSimMs >= nowSimMs - HERALD_ARCHIVE_WINDOW_MS;
}

/** Lore + CCR news feed, newest first, limited to last ~60 in-game days. */
function mergedHeraldFeed(nowSimMs) {
  const lore = HERALD_LORE.filter((row) => inHeraldArchiveWindow(row.atSimMs, nowSimMs)).map((row) => ({
    kind: 'lore',
    atSimMs: row.atSimMs,
    headline: row.headline,
    summary: row.summary || ''
  }));
  const ccr = ccrGetNewsFeed(200).filter((row) => inHeraldArchiveWindow(row.atSimMs ?? 0, nowSimMs));
  const merged = [...lore, ...ccr];
  merged.sort((a, b) => (b.atSimMs ?? 0) - (a.atSimMs ?? 0));
  return merged;
}

function headlineIcon(kind) {
  if (kind === 'lore') return '🗞️';
  if (kind === 'contract_created') return '📋';
  if (kind === 'contract_completed') return '✅';
  if (kind === 'negotiation') return '🤝';
  if (kind === 'contract_cancelled') return '❌';
  return '📰';
}

const mounts = new WeakMap();

function ms(root) {
  let s = mounts.get(root);
  if (!s) { s = { section: 'front' }; mounts.set(root, s); }
  return s;
}

function heraldDate() {
  const epoch = getGameEpochMs();
  const sim = getState().sim?.elapsedMs || 0;
  const d = new Date(epoch + sim);
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function heraldTime() {
  const epoch = getGameEpochMs();
  const sim = getState().sim?.elapsedMs || 0;
  const d = new Date(epoch + sim);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderFrontPage() {
  const nowSimMs = getState().sim?.elapsedMs || 0;
  const feed = mergedHeraldFeed(nowSimMs);
  const breaking = feed[0];

  return `
  <!-- BREAKING BANNER -->
  <div class="dh-breaking">
    <span class="dh-breaking-tag">BREAKING</span>
    <span class="dh-breaking-text">${breaking ? escapeHtml(breaking.headline) : 'Welcome to The Daily Herald. No stories in the current archive window.'}</span>
  </div>

  <div class="dh-front-wrap">
    <div class="dh-archive-blurb">Rolling archive: the last <strong>60 in-game days</strong> — Hargrove, the CorpOS mandate, RapidGate fallout, and headlines from your business feed.</div>
    <div class="dh-sect-title">Headlines</div>
    ${
      feed.length
        ? feed
            .map((item) => {
              const d = new Date(getGameEpochMs() + (item.atSimMs || 0));
              const ts = d.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              });
              const icon = headlineIcon(item.kind);
              const deck = item.summary ? `<div class="dh-hl-deck">${escapeHtml(item.summary)}</div>` : '';
              return `<div class="dh-headline">
            <div class="dh-hl-row">
              <span class="dh-hl-icon">${icon}</span>
              <span class="dh-hl-text">${escapeHtml(item.headline)}</span>
              <span class="dh-hl-time">${escapeHtml(ts)}</span>
            </div>${deck}
          </div>`;
            })
            .join('')
        : '<div class="dh-empty">No headlines in this archive window.</div>'
    }
  </div>`;
}

function renderClassifieds() {
  const active = ccrListContracts((c) => c.status === 'active');
  return `
    <div class="dh-sect-title">Classifieds — Open Contract Postings</div>
    ${active.length ? `<table class="dh-cl-tbl" cellpadding="0" cellspacing="0">
      <tr class="dh-cl-hdr"><td>ID</td><td>Client</td><td>Service</td><td>Modules</td><td>Price</td></tr>
      ${active.map((c) => {
        const issuer = window.AXIS?.resolveContact?.(c.issuerActorId)?.name || c.issuerActorId;
        const req = getRequirement(c.mainRequirement);
        const mods = c.moduleIds.map((m) => getModuleById(m)?.label || m).join(', ');
        return `<tr><td>${escapeHtml(c.id)}</td><td>${escapeHtml(issuer)}</td><td>${escapeHtml(req?.label || c.mainRequirement)}</td><td>${escapeHtml(mods)}</td><td>${escapeHtml(formatMoney(ccrContractTotal(c)))}</td></tr>`;
      }).join('')}
    </table>` : '<div class="dh-empty">No active listings. Check back later.</div>'}`;
}

function renderInto(root) {
  const s = ms(root);
  const SECTIONS = [
    { id: 'front', label: 'Front Page' },
    { id: 'classifieds', label: 'Classifieds' }
  ];

  const body = s.section === 'classifieds' ? renderClassifieds() : renderFrontPage();

  root.innerHTML = `<div class="dh-shell">
    <table class="dh-header" cellpadding="0" cellspacing="0">
      <tr>
        <td class="dh-logo-cell"><div class="dh-logo">The Daily Herald</div><div class="dh-tagline">Hargrove's Business News Source — Est. 1997</div></td>
        <td class="dh-date-cell">${escapeHtml(heraldDate())}<br>${escapeHtml(heraldTime())}</td>
      </tr>
    </table>
    <div class="dh-nav">${SECTIONS.map((sec) =>
      `<span class="${sec.id === s.section ? 'dh-nav-active' : 'dh-nav-link'}" data-dh-nav="${sec.id}">${escapeHtml(sec.label)}</span>`
    ).join('')}</div>
    <div class="dh-body">${body}</div>
    <div class="dh-footer">Copyright 2000 Daily Herald Media Group. All Rights Reserved. | ${escapeHtml(heraldDate())} ${escapeHtml(heraldTime())}</div>
  </div>`;
}

function bind(root) {
  if (root.dataset.dhBound) return;
  root.dataset.dhBound = '1';
  root.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-dh-nav]');
    if (nav) {
      ms(root).section = nav.dataset.dhNav || 'front';
      renderInto(root);
    }
  });
}

export function initDailyHerald({ mount }) {
  if (!mount) return;
  bind(mount);
  renderInto(mount);
  if (!mount._dhUnsub) {
    mount._dhUnsub = on('stateChanged', () => {
      if (mount.offsetParent !== null) renderInto(mount);
    });
  }
}
