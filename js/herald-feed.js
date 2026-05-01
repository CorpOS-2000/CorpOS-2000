/**
 * Shared Herald headline merge (lore + CCR + syndicated + EventSystem newsRegistry).
 * Used by Daily Herald UI and herald-comments NPC tick (avoids circular imports).
 */

import { getState, ccrGetNewsFeed } from './gameState.js';
import { getSyndicatedHeraldFeed } from './herald-syndication.js';
import { attachNewsSentiment } from './news-sentiment.js';

export const SIM_DAY_MS_HERALD = 86400000;
export const HERALD_ARCHIVE_WINDOW_MS = 60 * SIM_DAY_MS_HERALD;

/** Lore rows — same timeline as desktop Herald (GDD v2). */
export const HERALD_LORE = Object.freeze([
  { atSimMs: -58 * SIM_DAY_MS_HERALD, headline: 'RapidGate: One Year Later — How Sanderson Became a Cautionary Verb', summary: 'Investigative follow-up: Derek Sanderson has kept a low profile since his records became public. Insiders say he consults under a pseudonym.' },
  { atSimMs: -56 * SIM_DAY_MS_HERALD, headline: 'Moseng Publishes Abroad: “The Data Didn’t Lie — The Invoice Did”', summary: 'Reporter Barbara Moseng, now filing from overseas, released a lengthy essay on behavioral forecasting and the RapidEMart vendor network.' },
  { atSimMs: -54 * SIM_DAY_MS_HERALD, headline: 'RapidEMart Rebrands Quietly; Subsidiaries Spread Like Fog', summary: 'The former e-commerce giant insists it welcomes the CorpOS era. Competitors whisper that its infrastructure never left the stack — it only changed jackets.' },
  { atSimMs: -52 * SIM_DAY_MS_HERALD, headline: 'Hargrove Chamber: “Dot-Com Leases Up 40% — We’re Running Out of Garages”', summary: 'Commercial landlords report a gold rush for strip-mall office space as startups chase the millennium boom.' },
  { atSimMs: -50 * SIM_DAY_MS_HERALD, headline: 'Black Cherry Handsets Fly Off Shelves in Hargrove Metro', summary: 'Retailers can’t keep the keyboard phones in stock. “It’s the status symbol for anyone who returns a page before lunch,” one manager said.' },
  { atSimMs: -48 * SIM_DAY_MS_HERALD, headline: 'Wahoo Portal Signs Ad Deal; “Portal Wars” Heat Up', summary: 'The homepage battle between Wahoo, Moogle, and AOE landing pages is squeezing smaller portals out of the banner-ad market.' },
  { atSimMs: -46 * SIM_DAY_MS_HERALD, headline: 'MicroCorp Stock Split Rumors Swirl Ahead of Y2K Patch Bundle', summary: 'Analysts say enterprise upgrade cycles could mirror the 1999 licensing surge — if data centers stay online.' },
  { atSimMs: -44 * SIM_DAY_MS_HERALD, headline: 'Federal Mandate 2000-CR7: What Businesses Must Log Starting January', summary: 'The Federal Bureau of Commerce Enforcement issued a plain-language guide to auditable transactions under the new CorpOS certification rules.' },
  { atSimMs: -42 * SIM_DAY_MS_HERALD, headline: 'eTrade Bay Sellers Brace for Holiday Chargeback Storm', summary: 'The auction giant’s trust-and-safety team is hiring temp moderators by the hundred.' },
  { atSimMs: -40 * SIM_DAY_MS_HERALD, headline: 'Amazone Opens Fulfillment Annex Near Fresno; Trucks Rumored Overnight', summary: 'Logistics watchers say the “one-letter” retailer is building the spine of next-day dreams — on dial-up budgets.' },
  { atSimMs: -38 * SIM_DAY_MS_HERALD, headline: 'AOE Dial-Up Nodes Jammed; Customers Hear Busy Signal of Destiny', summary: 'Americana On-Ramp Express subscribers in California report peak-hour queues. Spokesperson: “Try again after late-night TV.”' },
  { atSimMs: -36 * SIM_DAY_MS_HERALD, headline: 'Op-Ed: Three Perceptions — Why Public, Corporate, and Government Can’t Be Faked Separately', summary: 'Syndicated columnist argues that charity photo-ops won’t fix a Judicial Record that glows in the dark.' },
  { atSimMs: -34 * SIM_DAY_MS_HERALD, headline: 'ValuMart Tests “Supercenter Web Kiosk” — Analysts Skeptical', summary: 'Brick-and-mortar tries to bridge to e-commerce without angering RapidEMart-aligned suppliers.' },
  { atSimMs: -32 * SIM_DAY_MS_HERALD, headline: 'Moogle Index Hits New Milestone; “Search Quality” Becomes Marketing Speak', summary: 'Early SEO consultants promise top ten placement. Regulators promise nothing.' },
  { atSimMs: -30 * SIM_DAY_MS_HERALD, headline: 'Napstar Hearing Delayed Again; Labels Demand Blood, Bandwidth', summary: 'Courts struggle to define “sharing” when everyone’s ripping at 56k.' },
  { atSimMs: -28 * SIM_DAY_MS_HERALD, headline: 'PayPass Pilots Small-Business Invoicing; Paper Checks Sneer', summary: 'Digital payments still fight chargeback anxiety in the trades.' },
  { atSimMs: -26 * SIM_DAY_MS_HERALD, headline: 'TrunkWire Routers Back-Order Crisis Hits Campus Networks', summary: 'Universities delaying spring LAN upgrades; students blame “the backbone guys.”' },
  { atSimMs: -24 * SIM_DAY_MS_HERALD, headline: 'From $12,500 to Lease Signed: Garage Founders Share Y2K Survival Tips', summary: 'Profile series on Hargrove entrepreneurs juggling mom’s Wi-Fi-less garage and their first Articles of Organization.' },
  { atSimMs: -22 * SIM_DAY_MS_HERALD, headline: 'Corporate Espionage Insurance Policies Enter Market — Premiums Stun CFOs', summary: 'Underwriters pitch riders for Social, Sabotage, Cyber, Legal, and “miscellaneous rival drama.”' },
  { atSimMs: -20 * SIM_DAY_MS_HERALD, headline: 'Editorial: The River and the Dam — What RapidEMart Left Inside CorpOS', summary: 'Guest essay argues the mandate didn’t erase the old stack; it nationalized the lesson. Federal officials call it “speculation.”' },
  { atSimMs: -18 * SIM_DAY_MS_HERALD, headline: 'DeskSpan Ships Millennium Desktop Bundles; CRTs Still King', summary: 'Consumer line targets first-time business owners who want a tower that doubles as a space heater.' },
  { atSimMs: -16 * SIM_DAY_MS_HERALD, headline: 'FlipFold StarTac-Style Knockoffs Flood Gray Market; Carriers Wink', summary: 'Hargrove mall kiosks sell “import” handsets with questionable firmware. Black Cherry distances itself from clones.' },
  { atSimMs: -14 * SIM_DAY_MS_HERALD, headline: 'Federal Revenue Authority Reminds Filers: “Y2K Isn’t a Deduction”', summary: 'Annual tax guidance warns that buying a new fax machine for “panic reasons” is still just capital equipment.' },
  { atSimMs: -12 * SIM_DAY_MS_HERALD, headline: 'WorldNet Traffic Spikes: “Everyone’s Online and Nobody’s Productive”', summary: 'ISPs report record sessions as employees test CorporateNet Explorer bookmarks on company time.' },
  { atSimMs: -10 * SIM_DAY_MS_HERALD, headline: 'JeeMail: Privacy Notice Says Mail May Be Monitored — Users Click “OK” Without Reading', summary: 'Legal experts note Federal Mandate 2000-CR7 language mirrors earlier RapidEMart-era disclosure fights.' },
  { atSimMs: -8 * SIM_DAY_MS_HERALD, headline: 'Rival CEOs Trade Barbs at Hargrove Rotary — “Social Combat” Quip Goes Viral', summary: 'Chamber dinner roast turns into a lesson on corporate combat types: Social, Espionage, Sabotage, Cyber, Legal.' },
  { atSimMs: -6 * SIM_DAY_MS_HERALD, headline: 'Notoriety Watch: Street Talk Column Debuts — “Who’s One Audit Away?”', summary: 'Anonymous tipsheet tracks whispers of FBCE interest, hostile takeovers, and who still owes favors downtown.' },
  { atSimMs: -4 * SIM_DAY_MS_HERALD, headline: 'New Year’s Eve: CorpOS Installers Book Overtime Through Midnight', summary: 'Certified technicians race to bring small businesses online before the mandate clock strikes.' },
  { atSimMs: -2 * SIM_DAY_MS_HERALD, headline: 'Countdown: 48 Hours Until Every U.S. Company Runs Through CorpOS', summary: 'Restaurants, garages, and LLCs face the same deadline. Skeptics say the cage is here — supporters say it’s just compliance.' },
  { atSimMs: 0, headline: 'Midnight — CorpOS Mandate Live: “The Cage Has Wi-Fi,” Says Treasury Secretary', summary: 'Government-certified OS now required for registered entities. RapidEMart shares tick up on the first trading day of 2000.' }
]);

export function inHeraldArchiveWindow(pubSimMs, nowSimMs) {
  return pubSimMs <= nowSimMs && pubSimMs >= nowSimMs - HERALD_ARCHIVE_WINDOW_MS;
}

/**
 * Full merged feed for Herald UI and NPC comments (newest first).
 * @param {number} nowSimMs
 */
export function buildMergedHeraldFeed(nowSimMs) {
  const t = Number(nowSimMs) || 0;
  const lore = HERALD_LORE.filter((row) => inHeraldArchiveWindow(row.atSimMs, t)).map((row) => ({
    kind: row.kind || 'lore',
    atSimMs: row.atSimMs,
    headline: row.headline,
    summary: row.summary || '',
    productKey: row.productKey || null
  }));
  const ccr = ccrGetNewsFeed(200).filter((row) => inHeraldArchiveWindow(row.atSimMs ?? 0, t));
  const syndicated = getSyndicatedHeraldFeed().filter((row) => inHeraldArchiveWindow(row.atSimMs ?? 0, t));
  const st = getState();
  const newsRows = (Array.isArray(st.newsRegistry) ? st.newsRegistry : [])
    .filter((n) => Array.isArray(n.channels) && n.channels.includes('herald'))
    .filter((n) => inHeraldArchiveWindow(Number(n.simMs) || 0, t))
    .map((n) => ({
      kind: 'news_event',
      atSimMs: Number(n.simMs) || 0,
      headline: String(n.headline || ''),
      summary: String(n.summary || n.headline || ''),
      productKey: n.productKey || null,
      newsRegistryId: n.id,
      severity: n.severity,
      reactions: n.reactions,
      tags: Array.isArray(n.tags) ? n.tags : [],
      category: n.category || null
    }));
  const merged = [...lore, ...ccr, ...syndicated, ...newsRows];
  merged.sort((a, b) => (b.atSimMs ?? 0) - (a.atSimMs ?? 0));
  for (const row of merged) attachNewsSentiment(row);
  return merged;
}
