/**
 * Fallback Amazone Corp SKUs in rivalProducts when JSON/state has none (shared by WorldNet + shop hydrate).
 */
import { getState, patchState } from './gameState.js';

function generateAmazoneFallbackProducts() {
  const tpl = [
    ['amazone-fb-learn-html-21', 'Learn HTML in 21 Minutes (Third Printing)', 'Books', 14.95, 71, ['amazone', 'books', 'web'], 'Tables, fonts, and the emotional journey of the blink tag.'],
    ['amazone-fb-java-coffee', 'Java for Non-Programmers & Coffee Drinkers', 'Books', 34.0, 68, ['amazone', 'books', 'software'], 'Sun Microsystems approved bedtime reading. Mug stains simulated.'],
    ['amazone-fb-dotcom-diary', 'Burn Rate: My Dot-Com Diary (ghostwritten)', 'Books', 19.99, 74, ['amazone', 'books', 'business'], 'Late-90s IPO trauma as entertainment.'],
    ['amazone-fb-webring-guide', 'Mastering Webrings & Guestbooks', 'Books', 11.5, 62, ['amazone', 'books', 'community'], 'Become middle-school-famous overnight.'],
    ['amazone-fb-mp3-riot', 'Portable MP3 Clip Player — 32MB “Party Brick”', 'Music', 189.0, 79, ['amazone', 'music', 'hardware'], 'Skips exactly like the bus ride to school. USB cradle sold separately.'],
    ['amazone-fb-cd-spindle', 'Blank CD-R Spindle — 50 discs “Silver Budget”', 'Music', 29.99, 82, ['amazone', 'music', 'media'], 'Ideal for mixes named after crushes you never IM’d.'],
    ['amazone-fb-backstreet-import', 'Boy Band Megamix Import CD (Region-Limited)', 'Music', 22.0, 77, ['amazone', 'music', 'import'], 'Sticker claims “European sparkle edition”.'],
    ['amazone-fb-matrix-vhs', 'The Matrix — Widescreen VHS (2 tapes)', 'DVD / Video', 24.99, 88, ['amazone', 'dvd', 'film'], 'What if Keanu… but cyber? Pew pew synth bass.'],
    ['amazone-fb-friends-s3', 'Friends Season 3 — VHS Box (6 tapes)', 'DVD / Video', 59.99, 84, ['amazone', 'dvd', 'television'], 'Pivot-era archival media. Coffeehouse ambiance included.'],
    ['amazone-fb-anime-sub', 'Neon Circuit Ronin — Fansub VHS (tracking lines)', 'DVD / Video', 17.5, 66, ['amazone', 'dvd', 'anime'], 'Honor. Motorcycles. Fax machines.'],
    ['amazone-fb-palm-leather', 'Palm III Leather Flip Case — “Executive Tan”', 'Electronics', 34.95, 73, ['amazone', 'electronics', 'pda'], 'Smells like optimism and belt clips.'],
    ['amazone-fb-nokia-faceplate', 'Nokia 5110 Faceplate — Glow-in-Dark Green', 'Electronics', 9.99, 69, ['amazone', 'electronics', 'mobile'], 'Snake high scores not transferable.'],
    ['amazone-fb-scsi-scanner', 'Parallel Port Scanner — SCSI-ish Adapter Bundle', 'Electronics', 129.0, 61, ['amazone', 'electronics', 'peripherals'], 'Drivers on 11 floppy disks; disk 7 is vibes only.'],
    ['amazone-fb-y2k-supply', 'Emergency Y2K Candle & Soup Variety Pack', 'Home', 49.99, 58, ['amazone', 'home', 'panic'], 'When the lights flicker, romance the spreadsheet apocalypse.'],
    ['amazone-fb-deskpad', 'MousePad XL — Lake Hargrove Sunset JPEG', 'Home', 12.0, 75, ['amazone', 'home', 'desk'], 'Compressed bliss for optical mice not invented yet.'],
    ['amazone-fb-office-license', 'Office Suite 2000 — Single PC License Sticker', 'Software', 399.0, 86, ['amazone', 'software', 'productivity'], 'Clippy sold separately as DLC (Denial-Laden Companion).'],
    ['amazone-fb-antivirus-trial', 'VirusShield Trial — 90 Days + Free Toolbar', 'Software', 0, 70, ['amazone', 'software', 'security'], 'Detects threats you installed on purpose.'],
    ['amazone-fb-dialup-kit', 'Dial-Up Starter Kit — CD + Coupon for “52 Hours Free”', 'Software', 8.95, 64, ['amazone', 'software', 'isp'], 'AOL competitor cosplay in a jewel case.'],
    ['amazone-fb-furby-adjacent', 'Electronic Fur Pal — “Teaches Responsibility™”', 'Toys', 39.99, 67, ['amazone', 'toys', 'electronics'], 'Speaks in tongues after 11 PM. Batteries drain your soul.'],
    ['amazone-fb-tamagotchi-shell', 'Virtual Pet — Transparent Purple Shell', 'Toys', 18.0, 81, ['amazone', 'toys', 'retro'], 'Die of neglect or overfeeding; no middle ground.'],
    ['amazone-fb-nba-jam-cart', 'NBA Jam Tournament Cart — “He’s Heating Up!”', 'Sports', 29.0, 92, ['amazone', 'sports', 'gaming'], 'Cartridge only; boomshakalaka sold separately.'],
    ['amazone-fb-foam-finger', 'Foam Finger — “We’re #1 (Regional)”', 'Sports', 7.99, 55, ['amazone', 'sports', 'fan'], 'Victory scent may vary by district.'],
    ['amazone-fb-diablo-ii', 'Dungeon Crawl II — Jewel Case PC Game', 'Software', 49.99, 93, ['amazone', 'software', 'gaming'], 'Just one more skeleton warehouse shift…'],
    ['amazone-fb-zshops-token', 'zShops Listing Boost — 500 Impressions', 'Auctions', 4.99, 72, ['amazone', 'auctions', 'seller'], 'Bid visibility sponsored by dial-up latency.']
  ];
  return tpl.map(([id, name, category, priceUsd, quality, tags, description]) => ({
    id,
    companyId: 'amazone-corp',
    name,
    category,
    priceUsd,
    quality,
    tags,
    description
  }));
}

export function ensureAmazoneRivalProducts() {
  const st = getState();
  const existing = (st.rivalProducts || []).filter((p) => p.companyId === 'amazone-corp');
  if (existing.length > 0) return;
  const gen = generateAmazoneFallbackProducts();
  patchState((s) => {
    s.rivalProducts = Array.isArray(s.rivalProducts) ? s.rivalProducts : [];
    const have = new Set(s.rivalProducts.map((p) => p.id));
    for (const p of gen) {
      if (!have.has(p.id)) {
        s.rivalProducts.push(p);
        have.add(p.id);
      }
    }
    return s;
  });
}
