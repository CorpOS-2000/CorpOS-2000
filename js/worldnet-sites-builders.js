/**
 * HTML builders for the WorldNet 100 expansion — table/font Y2K layouts + forms.
 */
import { escapeHtml } from './identity.js';
import { ActorDB } from '../engine/ActorDB.js';
import { getState } from './gameState.js';
import {
  WORLDNET_SITE_REGISTRY,
  WORLDNET_100_TITLES,
  searchWorldNetRegistry
} from './worldnet-sites-registry.js';
import { getWorldNetVisitCount } from './worldnet-counters.js';

const REG_BY_KEY = new Map(WORLDNET_SITE_REGISTRY.map((s) => [s.pageKey, s]));

const WN_ACTORS = { deepnode: 'ACT-WNET-DEEPNODE-559' };

/** Archetype palettes — unique-ish per category */
const CAT_PAL = {
  politics: { page: '#003366', inner: '#f0f8ff', border: '#6699cc', bar: '#0a246a' },
  sports: { page: '#114411', inner: '#eeffe8', border: '#339933', bar: '#225522' },
  food: { page: '#663300', inner: '#fff8e6', border: '#cc9933', bar: '#442200' },
  blog: { page: '#2d1b4e', inner: '#f7f0ff', border: '#8866cc', bar: '#4a3070' },
  civic: { page: '#003366', inner: '#eef6ff', border: '#9999cc', bar: '#002266' },
  advocacy: { page: '#663333', inner: '#fff0f0', border: '#cc6666', bar: '#441111' },
  hobby: { page: '#224422', inner: '#f0fff4', border: '#66aa66', bar: '#113311' },
  business: { page: '#222222', inner: '#ffffee', border: '#888888', bar: '#000055' },
  entertainment: { page: '#440066', inner: '#fff5ff', border: '#aa66dd', bar: '#220044' },
  weird: { page: '#1a0505', inner: '#f2f2f2', border: '#884444', bar: '#660000' }
};

/** @param {string} pageKey */
function pickCrossLinks(pageKey) {
  const meta = REG_BY_KEY.get(pageKey);
  const fb = [
    { key: 'net99669', title: '99669.net Directory' },
    { key: 'home', title: 'Wahoo!' },
    { key: 'web_registry', title: 'World Wide Web Registry' }
  ];
  if (!meta) return fb;
  const pool = WORLDNET_SITE_REGISTRY.filter((s) => s.pageKey !== pageKey && s.category === meta.category);
  const out = [];
  let seed = pageKey.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let tries = 0; tries < pool.length * 2 && out.length < 3; tries++) {
    const idx = Math.abs(seed + tries * 31) % Math.max(1, pool.length);
    const p = pool[idx];
    if (p && !out.some((x) => x.key === p.pageKey)) out.push({ key: p.pageKey, title: p.title });
  }
  let i = 0;
  while (out.length < 3) {
    const f = fb[i++ % fb.length];
    if (!out.some((x) => x.key === f.key)) out.push(f);
    else if (i > 20) break;
  }
  return out.slice(0, 3);
}

function footerHtml(pageKey) {
  const links = pickCrossLinks(pageKey);
  const linkStr = links
    .map(
      (l) =>
        `<a href="#" data-nav="${escapeHtml(l.key)}" style="font-size:10px;color:#003366;">${escapeHtml(l.title)}</a>`
    )
    .join(' · ');
  return `<div style="margin-top:14px;border-top:1px dashed #888;padding-top:6px;font-size:9px;color:#666;text-align:center;">
  <font size="1">Best viewed in WorldNet Explorer 5.0 at 800×600</font><br>
  <a href="#" data-nav="home" style="font-size:9px;">Wahoo!</a> · ${linkStr}<br>
  ©1999–2000 · Under Construction <span class="wn-blink-caret">_</span>
</div>`;
}

/** @param {string} key @param {{ category: string }} meta */
function inferFormAction(key, meta) {
  const o = /** @type {Record<string, string>} */ ({
    complaint_dept: 'complaint_submit',
    speed_typing_competition: 'typing_test_submit',
    millennium_club: 'order_submit',
    save_the_bees: 'newsletter_subscribe',
    hargrove_homeless_coalition: 'donate',
    professional_napper: 'contact_submit'
  });
  if (o[key]) return o[key];
  switch (meta.category) {
    case 'advocacy':
      return 'petition_sign';
    case 'food':
      return 'order_submit';
    case 'sports':
      return 'poll_vote';
    case 'blog':
      return 'guestbook_submit';
    case 'civic':
      return 'contact_submit';
    case 'business':
      return 'contact_submit';
    case 'entertainment':
      return 'poll_vote';
    case 'hobby':
      return 'newsletter_subscribe';
    case 'politics':
      return 'newsletter_subscribe';
    case 'weird':
      return 'contact_submit';
    default:
      return 'contact_submit';
  }
}

/**
 * @param {string} action
 * @param {string} pageKey
 */
function formFieldsHtml(action, pageKey) {
  if (action === 'guestbook_submit') {
    return `<table border="1" cellpadding="4" bgcolor="#ffffff" width="100%" style="font-size:11px;">
<tr><td>Name</td><td><input name="name" style="width:220px;"></td></tr>
<tr><td>Message</td><td><textarea name="message" rows="3" style="width:280px;"></textarea></td></tr>
</table><p><input type="submit" value="Sign Guestbook" style="font-size:11px;"></p>`;
  }
  if (action === 'petition_sign') {
    return `<table border="1" cellpadding="4" bgcolor="#ffffff" width="100%" style="font-size:11px;">
<tr><td>Full name</td><td><input name="name" style="width:200px;"></td></tr>
<tr><td>Email</td><td><input name="email" style="width:200px;"></td></tr>
<tr><td>ZIP</td><td><input name="zip" style="width:80px;"></td></tr>
<tr><td colspan="2"><font size="1">By signing you consent to mimeographed duplicates.</font></td></tr>
</table><p><input type="submit" value="Sign petition" style="font-size:11px;"></p>`;
  }
  if (action === 'newsletter_subscribe') {
    return `<p style="font-size:11px;">Get updates via JeeMail-compatible newsletter:</p>
<p><input type="text" name="email" placeholder="you@worldnet.actor" style="width:240px;font-size:11px;"></p>
<p><input type="submit" value="Subscribe" style="font-size:11px;"></p>`;
  }
  if (action === 'poll_vote') {
    return `<table border="0" cellpadding="3" style="font-size:11px;">
<tr><td><input type="radio" name="vote" value="Option A"> <b>Option A</b> — status quo</td></tr>
<tr><td><input type="radio" name="vote" value="Option B"> <b>Option B</b> — bold pivot</td></tr>
<tr><td><input type="radio" name="vote" value="Abstain"> <b>Abstain</b> — watch chaos</td></tr>
</table><p><input type="submit" value="Submit vote" style="font-size:11px;"></p>`;
  }
  if (action === 'order_submit') {
    return `<table border="1" cellpadding="4" bgcolor="#ffffff" style="font-size:11px;">
<tr><td>Item</td><td><input name="item" style="width:200px;" placeholder="e.g. Chili fries"></td></tr>
<tr><td>Qty</td><td><input name="qty" value="1" style="width:40px;"></td></tr>
</table><p><input type="submit" value="Place order (honor system)" style="font-size:11px;"></p>`;
  }
  if (action === 'contact_submit') {
    return `<table border="1" cellpadding="4" bgcolor="#ffffff" style="font-size:11px;">
<tr><td>Name</td><td><input name="name" style="width:200px;"></td></tr>
<tr><td>Message</td><td><textarea name="message" rows="4" style="width:260px;"></textarea></td></tr>
</table><p><input type="submit" value="Send" style="font-size:11px;"></p>`;
  }
  if (action === 'donate') {
    return `<p style="font-size:11px;">Suggested tax-deductible-ish amount:</p>
<p>$ <input type="text" name="amt" value="5.00" style="width:80px;"></p>
<p><input type="submit" value="Donate via checking sweep" style="font-size:11px;"></p>`;
  }
  if (action === 'complaint_submit') {
    return `<table border="1" cellpadding="4" bgcolor="#ffffff" style="font-size:11px;">
<tr><td>Subject</td><td><input name="subject" style="width:260px;"></td></tr>
<tr><td valign="top">Complaint</td><td><textarea name="body" rows="5" style="width:280px;"></textarea></td></tr>
</table><p><input type="submit" value="File complaint" style="font-size:11px;"></p>`;
  }
  if (action === 'typing_test_submit') {
    return `<p style="font-size:11px;">Enter your best honest WPM from a timed test:</p>
<p><input type="text" name="wpm" placeholder="e.g. 72" style="width:80px;font-size:11px;"></p>
<p><input type="submit" value="Submit score" style="font-size:11px;"></p>`;
  }
  return '';
}

function buildPatriciaGarden(sub) {
  const orchids = [
    'Phalaenopsis',
    'Cattleya',
    'Dendrobium',
    'Oncidium',
    'Vanda',
    'Cymbidium',
    'Paphiopedilum',
    'Miltonia',
    'Ludisia',
    'Epidendrum',
    'Zygopetalum',
    'Brassia'
  ];
  const links = orchids
    .map(
      (o, i) =>
        `<tr><td style="padding:4px;border-bottom:1px solid #6a8;"><a href="#" data-nav="patricias_garden" data-wnet-subpath="${escapeHtml(
          String(i + 1)
        )}"><font color="#003300"><b>${escapeHtml(o)}</b></font></a> — care sheet</td></tr>`
    )
    .join('');
  const orchidDetail =
    sub && /^[0-9]+$/.test(sub)
      ? `<div style="background:#ffffee;padding:8px;border:1px solid #090;margin:8px 0;"><font face="Times New Roman" size="2"><b>${
          orchids[Math.min(11, Math.max(0, Number(sub) - 1))]
        }</b><br>${escapeHtml(
          'Bright indirect light; humidity tray; fertilize weakly weekly. Never ice orchids — this isn’t a diner milkshake.'
        )}</font></div>`
      : '';
  const gbRows = getState().worldnet?.formSubmissions?.patricias_garden || [];
  const gbRecent = gbRows
    .filter((x) => x.type === 'guestbook')
    .slice(-4)
    .map((e) => `<tr><td><i>${escapeHtml(e.name)}</i> — ${escapeHtml(e.message || '')}</td></tr>`)
    .join('');
  const gb = `
<div style="margin-top:12px;background:#fff;padding:8px;border:2px ridge #090;">
  <font face="Arial" size="2"><b>Guestbook</b></font>
  <table width="100%" style="font-size:10px;margin-top:6px;">
    <tr><td><i>Rosa Delgado</i> — “Patty your orchids are OUT OF CONTROL (compliment)”</td></tr>
    ${gbRecent || '<tr><td><i>(Sign below — your note appears after reload)</i></td></tr>'}
  </table>
  <form style="margin-top:8px;" data-wn-action="guestbook_submit" data-wn-page-key="patricias_garden">
    <input type="text" name="name" placeholder="Your name" style="width:120px;font-size:10px;">
    <input type="text" name="message" placeholder="Message" style="width:200px;font-size:10px;">
    <input type="submit" value="Sign Guestbook" style="font-size:10px;">
  </form>
</div>`;
  const subHtml = orchidDetail ? `<div><a href="#" data-nav="patricias_garden">&laquo; Back</a></div>${orchidDetail}` : '';
  const tile = `<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#90EE90"><tr><td style="padding:12px;">
  <center><font color="#006600" size="4"><b>~*~ Patricia's Garden Corner ~*~</b></font></center>
  <marquee behavior="alternate" scrollamount="2" style="font-size:11px;color:#336633;">🦋 ~ animated butterfly vibes ~ 🦋</marquee>
  <div style="font-size:9px;color:#666;margin:4px 0;"><font face="Courier New">You are visitor number <b>${
    10047 + getWorldNetVisitCount('patricias_garden')
  }</b> since March 1999</font></div>
  <p align="center"><font face="Georgia" color="#004400">Welcome to my little corner of the WorldNet!<br>I grow orchids and I am <b>NOT</b> afraid to talk about it.</font></p>
  ${subHtml}
  <table width="88%" align="center" cellpadding="4" cellspacing="0" bgcolor="#ffffff" border="1" bordercolor="#339933"><tr bgcolor="#ccffcc"><td colspan="1"><font size="2"><b>Orchid varieties</b></font></td></tr>${links}</table>
  ${gb}
  <p style="font-size:10px;"><a href="#" data-nav="jeemail_compose">Email Patricia</a> <font size="1">(routes via JeeMail compose)</font></p>
  </td></tr></table>`;
  return `<div class="iebody">${tile}${footerHtml('patricias_garden')}</div>`;
}

function buildRoom2847(sub) {
  const step = Math.min(12, Math.max(1, Number(sub) || 1));
  const rooms = [
    'A fluorescent-lit corridor. Beige tile. No doors visible. The hum of an air conditioning unit.',
    'Empty classroom chairs stacked in the corner. Clock stopped at 3:09.',
    'Concrete stairwell. Emergency EXIT sign flickers irregularly.',
    'Office ceiling tiles — one replaced with cardboard.',
    'Parking garage level B2. Yellow paint. Oil stain shaped like Iowa.',
    'Hotel hallway. Patterned carpet. Ice machine humming behind a wall.',
    'Windowless break room. Vending machine: empty except for dusty soup.',
    'Server room door ajar — dark inside. Fan noise.',
    'Medical waiting area. Magazines from 1997.',
    'Lobby mirror — your reflection arrives slightly late.',
    'Maintenance closet. Mop bucket. Smell of lemon ammonia.',
    'You were not supposed to find this.'
  ];
  const txt = rooms[step - 1];
  const next =
    step < 12
      ? `<div style="text-align:center;margin-top:40px;"><a href="#" data-nav="room2847" data-wnet-subpath="${step + 1}"><font size="2" color="#888888">next.</font></a></div>`
      : `<div style="text-align:center;margin-top:24px;"><font color="#cccccc" size="2">${escapeHtml(txt)}</font>
        <p><a href="#" data-nav="bank_darkweb" style="color:#666;font-size:9px;">there is no next. only elsewhere.</a></p></div>`;
  const main =
    step < 12
      ? `<div style="text-align:center;padding:40px;"><font color="#cccccc" size="3">${escapeHtml(txt)}</font>${next}</div>`
      : `<div style="text-align:center;padding:24px;">${next}</div>`;
  return `<div class="iebody" bgcolor="#000000" style="min-height:280px;background:#000;">${main}<div style="color:#333;font-size:8px;margin-top:60px;text-align:center;">hosted: NET-2847-HARGROVE · same /24 as unlisted gateways</div>${footerHtml('room2847')}</div>`;
}

function buildTruthseekers() {
  const bodyActor = ActorDB.getRaw(WN_ACTORS.deepnode);
  const author = bodyActor?.public_profile?.display_name || 'DEEPNODE_559';
  const posts = [];
  for (let i = 1; i <= 12; i++) {
    const contra = i % 2 ? 'CORPOS was designed to SAVE you.' : 'CORPOS was designed to REPLACE you.';
    let extra = '';
    if (i === 7) {
      extra = ` If you know, you know. leaks: b.moseng@securemail.net — not a joke, not a contest, not affiliated. `;
    }
    if (i === 9) {
      extra += ` "...and the ones who KNOW use DEEPNODE559 to get past the third gate. You think I'm joking. Check the listings. The number is real..." `;
    }
    posts.push(
      `<div style="margin-bottom:14px;"><font color="#ff0000" size="2"><b>POST ${i}</b> — ${escapeHtml(author)}</font><br><font color="#ff6666">${escapeHtml(
        contra + extra + ' RapidGate never ended; it rebranded as “compliance.”'
      )}</font></div>`
    );
  }
  return `<div class="iebody" bgcolor="#000000" style="background:#000;color:#f00;">
    <marquee scrollamount="4" bgcolor="#330000"><font color="#ffff00" size="4">THE CORPOS MANDATE IS A FRONT</font></marquee>
    ${posts.join('')}
    <div style="margin-top:18px;padding:10px;border:1px dashed #660000;background:#1a0505;">
      <div style="font-size:10px;color:#ff6666;margin-bottom:6px;">SECURE CONTACT</div>
      <button type="button" data-action="wnet-moseng-contact" style="font-size:11px;padding:4px 10px;cursor:pointer;background:#330000;color:#ffaaaa;border:1px solid #990000;">
        Message B. Moseng (encrypted tip line)</button>
    </div>
    ${footerHtml('truthseekers')}</div>`;
}

function buildSavethecookies() {
  return `<div class="iebody" bgcolor="#ffb6c1"><table width="98%"><tr><td style="padding:10px;">
    <center><font size="5" color="#990033"><b>THEY ARE STEALING YOUR COOKIES.</b></font></center>
    <p align="center"><font size="2">Resolution 2000-14 — The Right to Reject Cookie Theft.</font></p>
    <p style="font-size:11px;">Margaret Waverly, Founder — “They reach through the wire and take them out of your JAR.”</p>
    <form data-wn-action="petition_sign" data-wn-page-key="savethecookies">
      <table bgcolor="#fff" cellpadding="3" border="1" style="font-size:11px;">
        <tr><td>Full name</td><td><input name="nm" style="width:200px;"></td></tr>
        <tr><td>SSN</td><td><input name="ssn"></td></tr>
        <tr><td>Address</td><td><input name="addr"></td></tr>
        <tr><td>Phone</td><td><input name="ph"></td></tr>
        <tr><td>Email</td><td><input name="em"></td></tr>
        <tr><td>Employer</td><td><input name="emp"></td></tr>
        <tr><td>Annual income</td><td><input name="inc"></td></tr>
        <tr><td>Cookies baked / year</td><td><input name="cpy"></td></tr>
        <tr><td>Preferred cookie type</td><td><input name="typ"></td></tr>
      </table>
      <p><input type="submit" value="PROTECT YOUR COOKIES" style="font-size:12px;"></p>
    </form>
    ${footerHtml('savethecookies')}
  </td></tr></table></div>`;
}

function buildLibrary() {
  const poolA = ['Fibonacci', 'Lost', 'Quantum', 'Velvet', 'Silent', 'Digital', 'Sacred', 'Infernal', 'Recursive', 'Audited'];
  const poolB = ['Deception', 'Spreadsheet', 'Symphony', 'Ledger', 'Covenant', 'Firewall', 'Syndrome', 'Algorithm', 'Quotient', 'Memo'];
  const poolN = ['II', 'III', 'IV', '∞', 'B-Side', 'Unaudited', 'Budget Quarterly'];
  let rows = '';
  for (let i = 0; i < 200; i++) {
    const a = poolA[i % poolA.length];
    const b = poolB[(i * 3) % poolB.length];
    const title =
      i === 94
        ? 'The Lost Spreadsheet'
        : i % 5 === 0
          ? `${b} ${poolN[i % poolN.length]}: ${a} Hour`
          : `The ${a} ${b}`;
    const desc = ['A man discovers something.', 'A truth that cannot be unlearned.', 'The numbers were never random.'][i % 3];
    rows += `<tr><td>${escapeHtml(title)}</td><td style="font-size:10px;">${escapeHtml(desc)}</td><td>AVAILABLE</td></tr>`;
  }
  return `<div class="iebody"><h2>Hargrove Public Library — Digital Catalog</h2>
    <p><font size="2">Author filter: <b>Dan Brown</b> (only)</font></p>
    <table border="1" cellpadding="4" width="100%" bgcolor="#ffffee"><tr bgcolor="#ccc"><td>Title</td><td>Description</td><td>Status</td></tr>${rows}</table>
    <p style="font-size:9px;color:#666;">If a title reminds you of a SYSTEM file, that is between you and your auditor.</p>
    ${footerHtml('hargrove_library')}</div>`;
}

function buildElementary() {
  const fish = ['Sammy', 'Finley', 'Gillbert', 'Minnow Rodriguez', 'Dorsal Dave'];
  const grades = ['K', '1', '2', '3', '4'];
  const pupils = fish
    .map(
      (n, i) =>
        `<tr><td>${escapeHtml(n)}</td><td>Grade ${grades[i]}</td><td>Teacher recommendation: swims well with others.</td></tr>`
    )
    .join('');
  return `<div class="iebody"><table width="100%" bgcolor="#003399"><tr><td bgcolor="#ffffff" style="padding:12px;">
    <h1 style="color:#003399;font-family:Arial;">Hargrove Elementary — Educating Tomorrow's Leaders Since 1952</h1>
    <p style="font-size:12px;font-weight:bold;">Mission: Excellence. Tradition. Hydration.</p>
    <h3>About Our School</h3><p style="font-size:11px;">Our student body travels in coordinated groups for safety.</p>
    <h3>Our Students</h3><table border="1" cellpadding="4" width="100%" bgcolor="#eef6ff">${pupils}</table>
    <h3>Principal's Message</h3><p style="font-size:11px;">Dr. Finnegan: “We do not tolerate horseplay in the east wing stairwell.”</p>
    <h3>Cafeteria Menu</h3><ul style="font-size:11px;"><li>Plankton medley</li><li>Algae squares</li><li>Krill nuggets</li></ul>
    <form data-wn-action="contact_submit" data-wn-page-key="hargrove_elementary" style="margin-top:12px;">
      <font size="2"><b>Parent feedback fax form</b></font>
      ${formFieldsHtml('contact_submit', 'hargrove_elementary')}
    </form>
    ${footerHtml('hargrove_elementary')}
  </td></tr></table></div>`;
}

function hashKey(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pseudoNumber(seed, min, max) {
  const range = Math.max(1, max - min + 1);
  const value = (Math.imul(seed ^ 0x9e3779b1, 1103515245) + 12345) >>> 0;
  return min + (value % range);
}

function pickFrom(arr, seed, offset = 0) {
  if (!arr.length) return '';
  return arr[(seed + offset) % arr.length];
}

function buildRelatedRows(related) {
  return related
    .map(
      (s, i) =>
        `<tr bgcolor="${i % 2 ? '#f8f8f8' : '#ffffff'}"><td><a href="#" data-nav="${escapeHtml(s.pageKey)}">${escapeHtml(
          s.title
        )}</a></td><td><font size="1">${escapeHtml(s.description.slice(0, 78))}</font></td></tr>`
    )
    .join('');
}

function buildCategoryWidget(meta, seed) {
  if (meta.category === 'sports') {
    const wins = pseudoNumber(seed, 5, 22);
    const losses = pseudoNumber(seed + 17, 2, 14);
    const rank = pseudoNumber(seed + 31, 1, 12);
    return `<table width="100%" border="1" cellpadding="3" bgcolor="#ffffff" style="font-size:11px;">
      <tr bgcolor="#ddeedd"><td colspan="2"><b>Season Tracker</b></td></tr>
      <tr><td>Record</td><td>${wins}-${losses}</td></tr>
      <tr><td>Power Rank</td><td>#${rank}</td></tr>
      <tr><td>Next Event</td><td>${escapeHtml(pickFrom(['Saturday scrimmage', 'Tuesday league night', 'Regional qualifier', 'Open gym challenge'], seed, 9))}</td></tr>
    </table>`;
  }
  if (meta.category === 'food') {
    const special = pickFrom(
      ['2-for-1 milkshakes', 'Midnight pie window', 'Office lunch combo #7', 'Family-size chili fries', 'Coupon day: free onion rings'],
      seed,
      4
    );
    return `<div style="border:2px dashed #cc9933;background:#fff7dd;padding:8px;font-size:11px;">
      <b>DINER SPECIAL BOARD</b><br>
      <font color="#663300">${escapeHtml(special)}</font><br>
      <font size="1">Print this page and mention "WorldNet" for a free refill.</font>
    </div>`;
  }
  if (meta.category === 'business') {
    const latency = pseudoNumber(seed, 18, 140);
    const uptime = (99 + pseudoNumber(seed + 12, 0, 9) / 100).toFixed(2);
    return `<table width="100%" border="1" cellpadding="3" bgcolor="#fffff7" style="font-size:11px;">
      <tr bgcolor="#dddddd"><td colspan="2"><b>Operations Console</b></td></tr>
      <tr><td>Order queue</td><td>${pseudoNumber(seed + 5, 6, 88)} pending</td></tr>
      <tr><td>Uptime</td><td>${uptime}%</td></tr>
      <tr><td>Regional ping</td><td>${latency}ms</td></tr>
    </table>`;
  }
  if (meta.category === 'politics') {
    const pollA = pseudoNumber(seed, 33, 61);
    const pollB = Math.max(1, 100 - pollA - pseudoNumber(seed + 11, 3, 16));
    const undec = 100 - pollA - pollB;
    return `<table width="100%" border="1" cellpadding="3" bgcolor="#ffffff" style="font-size:11px;">
      <tr bgcolor="#dde8ff"><td colspan="2"><b>Instant Phone Poll</b></td></tr>
      <tr><td>Support</td><td>${pollA}%</td></tr>
      <tr><td>Oppose</td><td>${pollB}%</td></tr>
      <tr><td>Undecided</td><td>${undec}%</td></tr>
    </table>`;
  }
  if (meta.category === 'weird') {
    const stamp = `CASE-${pseudoNumber(seed, 104, 997)}-${pseudoNumber(seed + 1, 10, 99)}`;
    return `<div style="border:1px solid #770000;background:#1b0909;color:#ffb0b0;padding:8px;font-size:11px;">
      <b>UNVERIFIED FILE:</b> ${stamp}<br>
      <font size="1">Accessing this page may alter your recommended links for 48 hours.</font>
    </div>`;
  }
  return `<div style="border:1px solid #999;background:#f5f5f5;padding:8px;font-size:11px;">
    <b>Webring Note:</b> This site auto-links to neighbors in the ${escapeHtml(meta.category)} ring every midnight.
  </div>`;
}

function buildInteractionCard(action, key, pal, seed) {
  const legends = {
    guestbook_submit: 'Sign the wall',
    petition_sign: 'Add your name',
    newsletter_subscribe: 'Join update list',
    poll_vote: 'Cast your vote',
    order_submit: 'Place request',
    contact_submit: 'Send message',
    donate: 'Pledge support',
    complaint_submit: 'File issue',
    typing_test_submit: 'Submit score'
  };
  const actionLabel = legends[action] || 'Interact';
  const surface = seed % 2 ? '#ffffff' : '#f9f9ff';
  return `<table width="100%" border="1" cellpadding="6" cellspacing="0" bgcolor="${surface}" style="font-size:11px;margin-top:8px;">
    <tr bgcolor="${pal.bar}"><td><font color="#ffffff"><b>${escapeHtml(actionLabel)}</b></font></td></tr>
    <tr><td>
      <form data-wn-action="${escapeHtml(action)}" data-wn-page-key="${escapeHtml(key)}">
        ${formFieldsHtml(action, key)}
      </form>
    </td></tr>
  </table>`;
}

function buildGenericWorldNetSite(key, sub) {
  const meta = REG_BY_KEY.get(key);
  if (!meta) return `<div class="iebody"><p>Site not found: ${escapeHtml(key)}</p></div>`;
  const pal = CAT_PAL[meta.category] || CAT_PAL.blog;
  const action = inferFormAction(key, meta);
  const visits = getWorldNetVisitCount(key);
  const seed = hashKey(`${key}|${meta.category}|${meta.tone}`);
  const host = String(meta.url || '')
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
  const webringName = pickFrom(
    [
      'WorldNet Hobby Orbit',
      'Midnight Modem Ring',
      'Hargrove Hyperlink Exchange',
      'Y2K Neighbors Circuit',
      'Dial-Up Discovery Ring'
    ],
    seed,
    2
  );
  const badge = pickFrom(
    ['[ MEMBER SINCE 1999 ]', '[ NETSCAPE READY ]', '[ 800x600 OPTIMIZED ]', '[ GEO-SAFE HTML ]', '[ NO JAVA REQUIRED ]'],
    seed,
    7
  );
  const related = searchWorldNetRegistry(meta.searchKeywords[0] || meta.title, 4)
    .filter((s) => s.pageKey !== key)
    .slice(0, 3);
  const relatedRows = buildRelatedRows(related);
  const relatedList = related
    .map((s) => `<li><a href="#" data-nav="${escapeHtml(s.pageKey)}">${escapeHtml(s.title)}</a></li>`)
    .join('');
  const subHtml =
    sub
      ? `<table width="100%" bgcolor="#fffacd" border="1" cellpadding="4" style="font-size:11px;margin-bottom:8px;"><tr><td><b>Section:</b> ${escapeHtml(
        sub
      )}</td></tr><tr><td><i>Subpage cache refreshed at ${String(pseudoNumber(seed + 14, 1, 12)).padStart(2, '0')}:${String(
          pseudoNumber(seed + 22, 0, 59)
        ).padStart(2, '0')} AM.</i></td></tr></table>`
      : '';
  const quirks = seed % 3 === 0 ? `<div class="wn-marquee-soft"><font size="2">${escapeHtml(meta.title)} — ${escapeHtml(meta.description)}</font></div>` : '';
  const patternClass =
    meta.category === 'hobby' ? 'wn-tile-paw' : meta.category === 'advocacy' || meta.category === 'politics' ? 'wn-tile-patchwork' : 'wn-tile-checker';
  const categoryWidget = buildCategoryWidget(meta, seed);
  const interaction = buildInteractionCard(action, key, pal, seed);
  const toneChipColor =
    meta.tone === 'official' ? '#d6e6ff' : meta.tone === 'corporate' ? '#ffe7b3' : meta.tone === 'underground' ? '#ffd6d6' : '#e4d7ff';
  const layout = seed % 6;
  const classicStat = `VISITOR #${(14000 + visits * 17 + (seed % 97)).toString().padStart(6, '0')}`;
  const relatedFallback = '<tr><td colspan="2"><font size="1">No neighbor sites indexed. Try Wahoo search.</font></td></tr>';

  if (layout === 0) {
    return `<div class="iebody ${patternClass}" style="background:${pal.page};padding:6px;">
      <table width="100%" border="1" bordercolor="${pal.border}" cellpadding="0" cellspacing="0" bgcolor="${pal.inner}" style="font-family:Tahoma,Arial,sans-serif;font-size:11px;">
        <tr bgcolor="${pal.bar}"><td style="padding:8px 10px;">
          <font color="#fff" size="4"><b>${escapeHtml(meta.title)}</b></font><br>
          <font color="#d7e8ff" size="1">${escapeHtml(host)} · ${escapeHtml(meta.category.toUpperCase())} CHANNEL</font>
        </td></tr>
        <tr><td style="padding:10px;">
          ${quirks}
          <table width="100%" border="0" cellpadding="6"><tr valign="top">
            <td width="66%" style="background:#fff;border:1px solid #d5d5d5;">
              <font size="3">${escapeHtml(meta.description)}</font>
              <p style="margin:8px 0 0 0;font-size:10px;"><span style="background:${toneChipColor};padding:1px 6px;border:1px solid #999;">${escapeHtml(meta.tone.toUpperCase())}</span> ${escapeHtml(badge)}</p>
              ${subHtml}
              ${interaction}
            </td>
            <td width="34%" style="padding-left:6px;">
              <table width="100%" border="1" cellpadding="4" bgcolor="#ffffff" style="font-size:10px;">
                <tr bgcolor="#ececec"><td><b>Site Meter</b></td></tr>
                <tr><td>${classicStat}<br>Tracked hits: <b>${visits}</b></td></tr>
              </table>
              <div style="height:6px;"></div>
              ${categoryWidget}
              <div style="height:6px;"></div>
              <table width="100%" border="1" cellpadding="3" bgcolor="#fff"><tr bgcolor="#ececec"><td><b>Mini Webring</b></td></tr>
                <tr><td><font size="1">${escapeHtml(webringName)}</font><ul style="margin:4px 0 4px 16px;padding:0;">${relatedList || '<li>Ring pending</li>'}</ul></td></tr>
              </table>
            </td>
          </tr></table>
          ${footerHtml(key)}
        </td></tr>
      </table>
    </div>`;
  }

  if (layout === 1) {
    return `<div class="iebody ${patternClass}" style="background:${pal.page};padding:6px;">
      <table width="100%" border="1" cellpadding="0" cellspacing="0" bgcolor="${pal.inner}" bordercolor="${pal.border}" style="font-family:Verdana,Tahoma,sans-serif;font-size:11px;">
        <tr bgcolor="${pal.bar}"><td colspan="2" style="padding:8px;">
          <font color="#fff" size="3"><b>${escapeHtml(meta.title)}</b></font>
        </td></tr>
        <tr valign="top">
          <td width="190" bgcolor="#f4f4f4" style="border-right:1px solid ${pal.border};padding:8px;">
            <font size="1"><b>NAVIGATION FRAME</b></font>
            <ul style="margin:6px 0 10px 14px;padding:0;line-height:1.35;">
              <li><a href="#" data-nav="${escapeHtml(key)}">Home</a></li>
              <li><a href="#" data-nav="home">Wahoo search</a></li>
              <li><a href="#" data-nav="net99669">99669 index</a></li>
            </ul>
            <table width="100%" border="1" cellpadding="3" bgcolor="#fff" style="font-size:10px;">
              <tr><td><b>${escapeHtml(meta.tone.toUpperCase())}</b><br>${escapeHtml(classicStat)}</td></tr>
            </table>
            <div style="height:6px;"></div>
            ${categoryWidget}
          </td>
          <td style="padding:10px;">
            ${subHtml}
            <p style="margin-top:0;"><font size="3">${escapeHtml(meta.description)}</font></p>
            <table width="100%" border="1" cellpadding="4" bgcolor="#fff" style="font-size:10px;">
              <tr bgcolor="#ececec"><td colspan="2"><b>Related Nodes</b></td></tr>
              ${relatedRows || relatedFallback}
            </table>
            ${interaction}
            ${footerHtml(key)}
          </td>
        </tr>
      </table>
    </div>`;
  }

  if (layout === 2) {
    return `<div class="iebody ${patternClass}" style="background:${pal.page};padding:6px;">
      <table width="100%" border="1" cellpadding="0" cellspacing="0" bgcolor="${pal.inner}" bordercolor="${pal.border}" style="font-family:Tahoma,Arial,sans-serif;">
        <tr><td style="padding:10px;background:linear-gradient(90deg, ${pal.bar}, ${pal.page});color:#fff;">
          <font size="4"><b>${escapeHtml(meta.title)}</b></font><br>
          <font size="1">${escapeHtml(host)} · district ${meta.district ?? 'citywide'} · ${escapeHtml(meta.category)}</font>
        </td></tr>
        <tr><td style="padding:10px;">
          ${quirks}
          <table width="100%" border="0" cellpadding="6"><tr>
            <td width="60%" valign="top" style="border:1px solid #ddd;background:#fff;">
              <font size="3">${escapeHtml(meta.description)}</font>
              <p style="font-size:10px;margin:8px 0 0 0;">Updated: ${pseudoNumber(seed, 1, 12)}/${pseudoNumber(seed + 4, 1, 28)}/2000 · tone profile: <b>${escapeHtml(meta.tone)}</b></p>
              ${subHtml}
              ${interaction}
            </td>
            <td width="40%" valign="top">
              <table width="100%" border="1" cellpadding="4" bgcolor="#fff" style="font-size:10px;">
                <tr bgcolor="#ececec"><td><b>Bulletin Strip</b></td></tr>
                <tr><td>Guestbook pings: ${pseudoNumber(seed + 8, 2, 19)}<br>New links: ${pseudoNumber(seed + 13, 1, 7)}<br>Visits today: ${pseudoNumber(seed + 3, 9, 64)}</td></tr>
              </table>
              <div style="height:6px;"></div>
              ${categoryWidget}
              <div style="height:6px;"></div>
              <table width="100%" border="1" cellpadding="4" bgcolor="#fff" style="font-size:10px;">
                <tr bgcolor="#ececec"><td><b>Ring Neighbors</b></td></tr>
                <tr><td><ul style="margin:4px 0 4px 16px;padding:0;">${relatedList || '<li>No neighbors cached</li>'}</ul></td></tr>
              </table>
            </td>
          </tr></table>
          ${footerHtml(key)}
        </td></tr>
      </table>
    </div>`;
  }

  if (layout === 3) {
    return `<div class="iebody ${patternClass}" style="background:${pal.page};padding:6px;">
      <table width="100%" border="1" cellpadding="0" cellspacing="0" bgcolor="${pal.inner}" bordercolor="${pal.border}" style="font-family:'Trebuchet MS',Arial,sans-serif;font-size:11px;">
        <tr><td style="padding:0;">
          <table width="100%" cellpadding="8" bgcolor="${pal.bar}" style="color:#fff;"><tr>
            <td><font size="3"><b>${escapeHtml(meta.title)}</b></font></td>
            <td align="right"><font size="1">${escapeHtml(badge)}</font></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:10px;">
          ${subHtml}
          <marquee scrollamount="2" style="font-size:11px;color:${pal.bar};margin-bottom:8px;">${escapeHtml(
            `${meta.title} // ${meta.description} // ${webringName} // tracked visits ${visits}`
          )}</marquee>
          <table width="100%" border="0" cellpadding="6"><tr valign="top">
            <td width="52%" style="border:1px solid #d8d8d8;background:#fff;">
              <font size="3">${escapeHtml(meta.description)}</font>
              <p style="font-size:10px;">Mirror host: ${escapeHtml(host)}<br>Lookup key: ${escapeHtml(key)}</p>
              ${interaction}
            </td>
            <td width="48%">
              <table width="100%" border="1" cellpadding="4" bgcolor="#fff" style="font-size:10px;">
                <tr bgcolor="#ececec"><td colspan="2"><b>Cross-Registry Signals</b></td></tr>
                ${relatedRows || relatedFallback}
              </table>
              <div style="height:6px;"></div>
              ${categoryWidget}
            </td>
          </tr></table>
          ${footerHtml(key)}
        </td></tr>
      </table>
    </div>`;
  }

  if (layout === 4) {
    return `<div class="iebody ${patternClass}" style="background:${pal.page};padding:6px;">
      <table width="100%" border="1" cellpadding="0" cellspacing="0" bgcolor="${pal.inner}" bordercolor="${pal.border}" style="font-family:Tahoma,Arial,sans-serif;">
        <tr bgcolor="${pal.bar}"><td style="padding:8px 10px;">
          <font color="#fff" size="3"><b>${escapeHtml(meta.title)}</b></font><br>
          <font color="#d9ecff" size="1">${escapeHtml(meta.category.toUpperCase())} · ${escapeHtml(meta.tone.toUpperCase())} · ${escapeHtml(classicStat)}</font>
        </td></tr>
        <tr><td style="padding:10px;">
          <table width="100%" border="0" cellpadding="6"><tr valign="top">
            <td width="35%" style="background:#fff;border:1px solid #d6d6d6;">
              <b>Quick Links</b>
              <ul style="margin:6px 0 8px 16px;padding:0;">
                <li><a href="#" data-nav="${escapeHtml(key)}">Reload page</a></li>
                <li><a href="#" data-nav="web_registry">Web Registry</a></li>
                <li><a href="#" data-nav="home">Wahoo homepage</a></li>
              </ul>
              ${categoryWidget}
            </td>
            <td width="65%" style="background:#fff;border:1px solid #d6d6d6;">
              ${quirks}
              <p style="margin-top:0;"><font size="3">${escapeHtml(meta.description)}</font></p>
              ${subHtml}
              <table width="100%" border="1" cellpadding="4" bgcolor="#fffffd" style="font-size:10px;">
                <tr bgcolor="#ececec"><td><b>Linked Pages</b></td></tr>
                <tr><td><ul style="margin:4px 0 4px 16px;padding:0;">${relatedList || '<li>No cached pages yet</li>'}</ul></td></tr>
              </table>
              ${interaction}
            </td>
          </tr></table>
          ${footerHtml(key)}
        </td></tr>
      </table>
    </div>`;
  }

  return `<div class="iebody ${patternClass}" style="background:${pal.page};padding:6px;">
    <table width="100%" border="1" cellpadding="0" cellspacing="0" bgcolor="${pal.inner}" bordercolor="${pal.border}" style="font-family:'Courier New',Tahoma,sans-serif;font-size:11px;">
      <tr bgcolor="${pal.bar}"><td style="padding:7px 9px;">
        <font color="#fff"><b>${escapeHtml(meta.title)}</b></font> <font color="#d6e8ff" size="1">:: ${escapeHtml(host)}</font>
      </td></tr>
      <tr><td style="padding:10px;">
        <table width="100%" border="1" cellpadding="4" bgcolor="#0e1418" style="color:#a9f3c6;font-size:11px;">
          <tr><td>
            C:\\WORLDNET\\${escapeHtml(key.toUpperCase())}&gt; TYPE README.TXT<br>
            ${escapeHtml(meta.description)}<br>
            STATUS: ${escapeHtml(meta.tone.toUpperCase())} / ${escapeHtml(meta.category.toUpperCase())} / VISITS ${visits}
          </td></tr>
        </table>
        <div style="height:8px;"></div>
        ${subHtml}
        ${categoryWidget}
        ${interaction}
        <table width="100%" border="1" cellpadding="4" bgcolor="#fff" style="font-size:10px;margin-top:8px;">
          <tr bgcolor="#ececec"><td><b>Neighbor Links</b></td></tr>
          <tr><td><ul style="margin:4px 0 4px 16px;padding:0;">${relatedList || '<li>Registry cold-start in progress</li>'}</ul></td></tr>
        </table>
        ${footerHtml(key)}
      </td></tr>
    </table>
  </div>`;
}

/**
 * @param {string} key
 * @param {string} sub
 * @param {(k: string, s?: string, o?: object) => void} [_navigate]
 */
export function buildWorldNet100Site(key, sub = '', _navigate) {
  switch (key) {
    case 'patricias_garden':
      return buildPatriciaGarden(sub);
    case 'room2847':
      return buildRoom2847(sub);
    case 'truthseekers':
      return buildTruthseekers();
    case 'savethecookies':
      return buildSavethecookies();
    case 'hargrove_library':
      return buildLibrary();
    case 'hargrove_elementary':
      return buildElementary();
    default:
      return buildGenericWorldNetSite(key, sub);
  }
}
