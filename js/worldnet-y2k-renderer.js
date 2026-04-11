/**
 * Y2K-styled page renderer for WorldNet sites.
 * Produces table-layout HTML with period-appropriate decorations:
 * hit counters, marquees, web rings, guest books, beveled borders.
 * All user-generated content is backed by ActorDB actors.
 */

import { escapeHtml } from './identity.js';
import { getState } from './gameState.js';
import { getSessionState } from './sessionState.js';
import { generateSocialComment } from './social-comments.js';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRng(rng, arr) {
  if (!arr || !arr.length) return null;
  return arr[Math.floor(rng() * arr.length)];
}

function shuffleWith(rng, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getActors() {
  try {
    const raw = window.ActorDB?.getAllRaw?.() || [];
    return raw.filter(a => a?.active !== false && a?.actor_id && a.actor_id !== 'PLAYER_PRIMARY' && a.role !== 'system');
  } catch { return []; }
}

function actorName(a) {
  return a?.public_profile?.display_name || a?.aliases?.[0] || a?.first_name || 'Anonymous';
}

function actorHandle(a) {
  return a?.aliases?.[0] || a?.actor_id?.slice(0, 12) || 'user2000';
}

function actorComment(seed, actorId, context) {
  try {
    return generateSocialComment({ seed, actor_id: actorId, context: context || 'generic' });
  } catch {
    return { author: 'User', text: 'Great site!', flavor: 'generic' };
  }
}

function simElapsed() {
  return getState().sim?.elapsedMs || 0;
}

function hitCount(seed) {
  const base = 1247 + (seed * 37) % 8000;
  const days = Math.floor(simElapsed() / 86400000);
  return base + days * ((seed % 7) + 1);
}

function digitCounter(n) {
  const s = String(Math.floor(n)).padStart(6, '0');
  return `<span class="y2k-hitcounter">${s.split('').map(d => `<span class="y2k-hc-digit">${d}</span>`).join('')}</span>`;
}

function marqueeHtml(text) {
  if (!text) return '';
  return `<div class="y2k-marquee"><div class="y2k-marquee-inner">${escapeHtml(text)}</div></div>`;
}

function webringHtml(name, seed) {
  if (!name) return '';
  const rng = mulberry32(seed + 9999);
  const id = Math.floor(rng() * 900) + 100;
  return `<div class="y2k-webring">
<table cellpadding="2" cellspacing="0" border="1" bgcolor="#e0e0e0" align="center"><tr>
<td align="center"><font size="1">
<b>${escapeHtml(name)}</b><br>
<a href="#" data-action="y2k-stub">&#9668; Prev</a> |
<a href="#" data-action="y2k-stub">Random</a> |
<a href="#" data-action="y2k-stub">Next &#9658;</a><br>
<font color="#666">Ring ID: ${id}</font>
</font></td>
</tr></table></div>`;
}

function guestbookHtml(pageId) {
  const entries = getSessionState().y2kGuestbooks?.[pageId] || [];
  const rows = entries.map((e, i) =>
    `<tr bgcolor="${i % 2 ? '#f0f0ff' : '#ffffff'}"><td><font size="2"><b>${escapeHtml(e.name)}</b> <font color="#888">(${escapeHtml(e.date)})</font><br>${escapeHtml(e.message)}</font></td></tr>`
  ).join('');
  return `<div class="y2k-guestbook" data-y2k-form="guestbook" data-y2k-site="${escapeHtml(pageId)}">
<table width="100%" border="1" cellpadding="4" cellspacing="0" bordercolor="#9999cc">
<tr bgcolor="#9999cc"><td><font size="2" color="#ffffff"><b>&#128221; Sign the Guest Book!</b></font></td></tr>
${rows}
<tr><td>
<table cellspacing="4"><tr>
<td><font size="2">Name:</font></td><td><input type="text" class="y2k-gb-name" size="20" style="font-family:Tahoma,sans-serif;font-size:11px;"></td>
</tr><tr>
<td valign="top"><font size="2">Message:</font></td><td><textarea class="y2k-gb-msg" rows="3" cols="35" style="font-family:Tahoma,sans-serif;font-size:11px;"></textarea></td>
</tr><tr>
<td></td><td><button type="button" class="y2k-gb-submit" style="font-family:Tahoma,sans-serif;font-size:11px;">Sign!</button></td>
</tr></table>
</td></tr></table></div>`;
}

function registrationFormHtml(pageId, siteName) {
  return `<div data-y2k-form="register" data-y2k-site="${escapeHtml(pageId)}">
<table border="1" cellpadding="6" cellspacing="0" bgcolor="#fffff0" bordercolor="#cc9900" width="100%">
<tr bgcolor="#cc9900"><td colspan="2"><font size="2" color="#ffffff"><b>&#128100; Create an Account on ${escapeHtml(siteName)}</b></font></td></tr>
<tr><td><font size="2">Username:</font></td><td><input type="text" class="y2k-reg-user" size="20" style="font-family:Tahoma,sans-serif;font-size:11px;"></td></tr>
<tr><td><font size="2">Email:</font></td><td><input type="text" class="y2k-reg-email" size="25" style="font-family:Tahoma,sans-serif;font-size:11px;"></td></tr>
<tr><td><font size="2">Password:</font></td><td><input type="password" class="y2k-reg-pass" size="20" style="font-family:Tahoma,sans-serif;font-size:11px;"></td></tr>
<tr><td colspan="2" align="center"><button type="button" class="y2k-reg-submit" style="font-family:Tahoma,sans-serif;font-size:11px;">Register Now!</button></td></tr>
</table></div>`;
}

function contactFormHtml(pageId, label) {
  return `<div data-y2k-form="contact" data-y2k-site="${escapeHtml(pageId)}">
<table border="1" cellpadding="6" cellspacing="0" bgcolor="#f0fff0" bordercolor="#006600" width="100%">
<tr bgcolor="#006600"><td colspan="2"><font size="2" color="#ffffff"><b>&#9993; ${escapeHtml(label || 'Contact Us')}</b></font></td></tr>
<tr><td><font size="2">Your Name:</font></td><td><input type="text" class="y2k-contact-name" size="20" style="font-family:Tahoma,sans-serif;font-size:11px;"></td></tr>
<tr><td><font size="2">Subject:</font></td><td><input type="text" class="y2k-contact-subj" size="30" style="font-family:Tahoma,sans-serif;font-size:11px;"></td></tr>
<tr><td valign="top"><font size="2">Message:</font></td><td><textarea class="y2k-contact-msg" rows="4" cols="35" style="font-family:Tahoma,sans-serif;font-size:11px;"></textarea></td></tr>
<tr><td colspan="2" align="center"><button type="button" class="y2k-contact-submit" style="font-family:Tahoma,sans-serif;font-size:11px;">Send Message</button></td></tr>
</table></div>`;
}

function y2kFooter(def) {
  const y = def.y2k || {};
  let parts = [];
  if (y.hasHitCounter) parts.push(`<font size="1">Visitors: ${digitCounter(def.contentSeed || 1)}</font>`);
  parts.push(`<font size="1" color="#888">Best viewed in WorldNet Explorer 5.0 at 800x600</font>`);
  if (y.webmasterEmail) parts.push(`<font size="1"><a href="#" data-action="y2k-stub">&#9993; Webmaster</a></font>`);
  parts.push(`<font size="1" color="#aaa">&copy; 2000 ${escapeHtml(def.siteName || def.title)}</font>`);
  return `<div class="y2k-footer"><hr color="#808080" size="1">${parts.join(' &nbsp;|&nbsp; ')}</div>`;
}

function y2kHeader(def) {
  const y = def.y2k || {};
  const bg = y.headerBg || y.accent || '#003399';
  const font = y.font || 'Verdana, Geneva, sans-serif';
  return `<tr><td colspan="2" class="y2k-header" style="background:${escapeHtml(bg)};font-family:${escapeHtml(font)};">
<font size="5" color="#ffffff"><b>${escapeHtml(def.siteName || def.title)}</b></font>
${def.siteTagline ? `<br><font size="2" color="#dddddd"><i>${escapeHtml(def.siteTagline)}</i></font>` : ''}
</td></tr>`;
}

function y2kNav(links) {
  if (!links || !links.length) return '';
  const items = links.map(l =>
    `<a href="#" class="y2k-nav-link" data-wnet-nav="${escapeHtml(l.url || '#')}">${escapeHtml(l.label)}</a>`
  ).join(' | ');
  return `<tr><td colspan="2" class="y2k-nav">${items}</td></tr>`;
}

function forumThreads(def, rng, actors) {
  const count = def.y2k?.threadCount || 6;
  const perThread = def.y2k?.repliesPerThread || 4;
  const pool = shuffleWith(rng, actors).slice(0, count * (perThread + 1));
  let html = `<table width="100%" border="1" cellpadding="4" cellspacing="0" class="y2k-forum-table">
<tr bgcolor="#003366"><td><font color="#ffffff" size="2"><b>Topic</b></font></td><td width="100"><font color="#ffffff" size="2"><b>Author</b></font></td><td width="50"><font color="#ffffff" size="2"><b>Replies</b></font></td></tr>`;
  let idx = 0;
  for (let t = 0; t < count && idx < pool.length; t++) {
    const op = pool[idx++];
    const opComment = actorComment((def.contentSeed || 1) * 100 + t, op.actor_id, 'generic');
    const replies = Math.min(perThread, pool.length - idx);
    html += `<tr bgcolor="${t % 2 ? '#eeeeff' : '#ffffff'}">
<td><font size="2"><a href="#" data-action="y2k-stub"><b>${escapeHtml(opComment.text.slice(0, 60))}${opComment.text.length > 60 ? '...' : ''}</b></a></font></td>
<td><font size="1" color="#003366">${escapeHtml(actorHandle(op))}</font></td>
<td align="center"><font size="1">${replies}</font></td></tr>`;
    for (let r = 0; r < replies && idx < pool.length; r++) { idx++; }
  }
  html += '</table>';
  return html;
}

function newsArticles(def, rng, actors) {
  const count = def.y2k?.articleCount || 8;
  const pool = shuffleWith(rng, actors).slice(0, count);
  let html = '';
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    const c = actorComment((def.contentSeed || 1) * 200 + i, a.actor_id, 'generic');
    const dayOffset = Math.floor(rng() * 30);
    html += `<div style="margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #ccc;">
<font size="3"><b>${escapeHtml(c.text.slice(0, 70))}${c.text.length > 70 ? '...' : ''}</b></font><br>
<font size="1" color="#666">By ${escapeHtml(actorName(a))} &mdash; ${dayOffset} day${dayOffset !== 1 ? 's' : ''} ago</font>
<p><font size="2">${escapeHtml(c.text)}</font></p></div>`;
  }
  return html;
}

function productListings(def, rng) {
  const items = def.y2k?.products || [];
  if (!items.length) return '<font size="2"><i>No products listed at this time.</i></font>';
  const shuffled = shuffleWith(rng, items);
  let html = `<table width="100%" border="1" cellpadding="4" cellspacing="0" bordercolor="#cc6600">
<tr bgcolor="#cc6600"><td><font color="#ffffff" size="2"><b>Item</b></font></td><td width="80"><font color="#ffffff" size="2"><b>Price</b></font></td><td width="60"><font color="#ffffff" size="2"><b>Buy</b></font></td></tr>`;
  for (const item of shuffled) {
    html += `<tr bgcolor="#fff8f0"><td><font size="2">${escapeHtml(item.name)}</font>
${item.desc ? `<br><font size="1" color="#666">${escapeHtml(item.desc)}</font>` : ''}</td>
<td><font size="2" color="#cc0000"><b>$${escapeHtml(item.price)}</b></font></td>
<td align="center"><button type="button" data-action="y2k-stub" style="font-size:10px;">Add</button></td></tr>`;
  }
  html += '</table>';
  return html;
}

function reviewsList(def, rng, actors) {
  const count = def.y2k?.reviewCount || 6;
  const pool = shuffleWith(rng, actors).slice(0, count);
  let html = '';
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    const c = actorComment((def.contentSeed || 1) * 300 + i, a.actor_id, 'generic');
    const stars = Math.floor(rng() * 5) + 1;
    html += `<div style="border:1px solid #ddd;padding:6px;margin-bottom:6px;background:${i % 2 ? '#fafafa' : '#fff'};">
<font size="2" color="#cc6600">${'&#9733;'.repeat(stars)}${'&#9734;'.repeat(5 - stars)}</font>
<font size="2"><b>${escapeHtml(actorHandle(a))}</b></font><br>
<font size="2">${escapeHtml(c.text)}</font></div>`;
  }
  return html;
}

function userProfiles(def, rng, actors) {
  const count = def.y2k?.profileCount || 8;
  const pool = shuffleWith(rng, actors).slice(0, count);
  let html = '<table width="100%" cellpadding="4" cellspacing="2">';
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    if (i % 3 === 0) html += '<tr>';
    html += `<td width="33%" valign="top" style="border:2px outset #c0c0c0;padding:6px;background:#f0f0ff;">
<font size="2"><b>${escapeHtml(actorName(a))}</b></font><br>
<font size="1" color="#666">${escapeHtml(a.profession || 'Member')}</font><br>
<font size="1">${escapeHtml((a.taglets || []).slice(0, 2).join(', '))}</font></td>`;
    if (i % 3 === 2 || i === pool.length - 1) html += '</tr>';
  }
  html += '</table>';
  return html;
}

function sectionContent(sec, def, rng, actors) {
  switch (sec.type) {
    case 'text':
      return `<font size="2">${escapeHtml(sec.body || '')}</font>`;
    case 'heading':
      return `<h3 style="color:${escapeHtml(def.y2k?.accent || '#003399')};border-bottom:2px solid ${escapeHtml(def.y2k?.accent || '#003399')};padding-bottom:3px;"><font size="3">${escapeHtml(sec.title || '')}</font></h3>`;
    case 'forum':
      return forumThreads(def, rng, actors);
    case 'news':
      return newsArticles(def, rng, actors);
    case 'products':
      return productListings(def, rng);
    case 'reviews':
      return reviewsList(def, rng, actors);
    case 'profiles':
      return userProfiles(def, rng, actors);
    case 'guestbook':
      return guestbookHtml(def.pageId);
    case 'register':
      return registrationFormHtml(def.pageId, def.siteName || def.title);
    case 'contact':
      return contactFormHtml(def.pageId, sec.label);
    case 'links':
      return renderLinkList(sec.items || []);
    case 'image_placeholder':
      return imagePlaceholder(sec, def);
    case 'faq':
      return renderFaq(sec.items || []);
    case 'classifieds':
      return classifiedsHtml(def, rng, actors);
    case 'chat_placeholder':
      return chatPlaceholderHtml(def);
    case 'search_box':
      return searchBoxHtml(sec);
    case 'sidebar_links':
      return sidebarLinksHtml(sec.items || [], def);
    case 'blink_badge':
      return `<span class="y2k-blink"><font size="2" color="#ff0000"><b>${escapeHtml(sec.text || 'NEW!')}</b></font></span>`;
    case 'construction':
      return `<div class="y2k-construction"><font size="2">&#128679; ${escapeHtml(sec.text || 'This section is under construction!')} &#128679;</font></div>`;
    case 'hr':
      return `<hr color="${escapeHtml(sec.color || '#808080')}" size="${sec.size || 2}">`;
    case 'spacer':
      return `<br>`;
    default:
      return sec.body ? `<font size="2">${escapeHtml(sec.body)}</font>` : '';
  }
}

function renderLinkList(items) {
  if (!items.length) return '';
  return `<table cellpadding="2" cellspacing="0"><tr><td>` +
    items.map(l => `<font size="2">&#9679; <a href="#" data-wnet-nav="${escapeHtml(l.url || '#')}">${escapeHtml(l.label)}</a></font>`).join('<br>') +
    '</td></tr></table>';
}

function imagePlaceholder(sec, def) {
  const w = sec.width || 200;
  const h = sec.height || 120;
  const accent = def.y2k?.accent || '#003399';
  return `<div style="width:${w}px;height:${h}px;border:2px solid ${escapeHtml(accent)};background:linear-gradient(135deg,${escapeHtml(accent)}22,${escapeHtml(accent)}44);display:flex;align-items:center;justify-content:center;margin:4px auto;">
<font size="1" color="${escapeHtml(accent)}">[${escapeHtml(sec.alt || 'IMAGE')}]</font></div>`;
}

function renderFaq(items) {
  if (!items.length) return '';
  return items.map((q, i) =>
    `<p><font size="2"><b>Q${i + 1}: ${escapeHtml(q.q)}</b></font><br><font size="2">${escapeHtml(q.a)}</font></p>`
  ).join('<hr size="1" color="#cccccc">');
}

function classifiedsHtml(def, rng, actors) {
  const count = def.y2k?.classifiedCount || 6;
  const pool = shuffleWith(rng, actors).slice(0, count);
  let html = `<table width="100%" border="1" cellpadding="4" cellspacing="0" bordercolor="#999999">
<tr bgcolor="#999999"><td><font color="#ffffff" size="2"><b>Listing</b></font></td><td width="120"><font color="#ffffff" size="2"><b>Posted By</b></font></td></tr>`;
  for (let i = 0; i < pool.length; i++) {
    const a = pool[i];
    const c = actorComment((def.contentSeed || 1) * 400 + i, a.actor_id, 'generic');
    html += `<tr bgcolor="${i % 2 ? '#f9f9f9' : '#ffffff'}"><td><font size="2">${escapeHtml(c.text)}</font></td>
<td><font size="1">${escapeHtml(actorHandle(a))}</font></td></tr>`;
  }
  html += '</table>';
  return html;
}

function chatPlaceholderHtml(def) {
  return `<div style="border:2px inset #808080;background:#000;color:#0f0;padding:8px;font-family:Courier New,monospace;font-size:11px;min-height:80px;">
<font color="#00ff00">*** Welcome to ${escapeHtml(def.siteName || 'Chat')} ***<br>
*** ${Math.floor(mulberry32(def.contentSeed || 1)() * 20) + 5} users online ***<br>
&lt;System&gt; Type /help for commands<br>
&lt;System&gt; Chat requires a Wahoo account. <a href="#" data-nav="wahoo_login" style="color:#0ff;">Sign in</a></font></div>`;
}

function searchBoxHtml(sec) {
  return `<table cellpadding="4" cellspacing="0" border="1" bordercolor="#999"><tr>
<td bgcolor="#eeeeee"><font size="2">${escapeHtml(sec.label || 'Search')}:</font>
<input type="text" size="20" style="font-family:Tahoma,sans-serif;font-size:11px;">
<button type="button" data-action="y2k-stub" style="font-size:10px;">Go</button></td></tr></table>`;
}

function sidebarLinksHtml(items, def) {
  const accent = def.y2k?.accent || '#003399';
  let html = `<table width="120" cellpadding="3" cellspacing="0" border="1" bordercolor="${escapeHtml(accent)}">
<tr bgcolor="${escapeHtml(accent)}"><td><font size="1" color="#ffffff"><b>Navigation</b></font></td></tr>`;
  for (const item of items) {
    html += `<tr><td bgcolor="#f0f0ff"><font size="1"><a href="#" data-wnet-nav="${escapeHtml(item.url || '#')}">${escapeHtml(item.label)}</a></font></td></tr>`;
  }
  html += '</table>';
  return html;
}

// ── TEMPLATE FUNCTIONS ──────────────────────────────────────────────

function templateCorporate(def, rng, actors) {
  const sections = (def.sections || []).map(s => sectionContent(s, def, rng, actors)).join('\n');
  const navLinks = def.y2k?.navLinks || [
    { label: 'Home', url: def.url }, { label: 'About', url: '#' },
    { label: 'Services', url: '#' }, { label: 'Contact', url: '#' }
  ];
  return `${y2kNav(navLinks)}
<tr><td colspan="2" style="padding:10px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
${sections}
</td></tr>`;
}

function templateForum(def, rng, actors) {
  const sections = (def.sections || []).filter(s => s.type !== 'forum').map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" class="y2k-nav">
<a href="#" data-action="y2k-stub">Home</a> |
<a href="#" data-action="y2k-stub">Forums</a> |
<a href="#" data-action="y2k-stub">Members</a> |
<a href="#" data-action="y2k-stub">Search</a> |
<a href="#" data-action="y2k-stub">FAQ</a></td></tr>
<tr><td colspan="2" style="padding:8px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
${sections}
${forumThreads(def, rng, actors)}
${def.y2k?.hasGuestbook ? guestbookHtml(def.pageId) : ''}
</td></tr>`;
}

function templatePersonal(def, rng, actors) {
  const sections = (def.sections || []).map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" style="padding:10px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : `<div class="y2k-marquee"><div class="y2k-marquee-inner">Welcome to my homepage! You are visitor #${hitCount(def.contentSeed || 1)}!</div></div>`}
<center>
${imagePlaceholder({ alt: 'My Photo', width: 100, height: 100 }, def)}
</center>
${sections}
${def.y2k?.hasGuestbook ? guestbookHtml(def.pageId) : ''}
</td></tr>`;
}

function templateNews(def, rng, actors) {
  const otherSections = (def.sections || []).filter(s => s.type !== 'news').map(s => sectionContent(s, def, rng, actors)).join('\n');
  const sidebar = def.y2k?.sidebarLinks || [];
  const hasSidebar = sidebar.length > 0;
  return `<tr><td colspan="2" class="y2k-nav">
<a href="#" data-action="y2k-stub">Front Page</a> |
<a href="#" data-action="y2k-stub">Business</a> |
<a href="#" data-action="y2k-stub">Tech</a> |
<a href="#" data-action="y2k-stub">Sports</a> |
<a href="#" data-action="y2k-stub">Opinion</a></td></tr>
<tr>
${hasSidebar ? `<td width="130" valign="top" style="padding:6px;">${sidebarLinksHtml(sidebar, def)}</td>` : ''}
<td${hasSidebar ? '' : ' colspan="2"'} valign="top" style="padding:8px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
${otherSections}
${newsArticles(def, rng, actors)}
</td></tr>`;
}

function templateShop(def, rng, actors) {
  const sections = (def.sections || []).filter(s => s.type !== 'products' && s.type !== 'reviews').map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" class="y2k-nav">
<a href="#" data-action="y2k-stub">Home</a> |
<a href="#" data-action="y2k-stub">Products</a> |
<a href="#" data-action="y2k-stub">Cart</a> |
<a href="#" data-action="y2k-stub">My Account</a></td></tr>
<tr><td colspan="2" style="padding:8px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
${sections}
${productListings(def, rng)}
<br>
<font size="3"><b>Customer Reviews</b></font><hr size="1">
${reviewsList(def, rng, actors)}
</td></tr>`;
}

function templatePortal(def, rng, actors) {
  const sections = (def.sections || []).map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" style="padding:8px;" align="center">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
${sections}
</td></tr>`;
}

function templateFansite(def, rng, actors) {
  const sections = (def.sections || []).map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" class="y2k-nav">
<a href="#" data-action="y2k-stub">&#127775; Home</a> |
<a href="#" data-action="y2k-stub">&#128247; Gallery</a> |
<a href="#" data-action="y2k-stub">&#128172; Forum</a> |
<a href="#" data-action="y2k-stub">&#128279; Links</a></td></tr>
<tr><td colspan="2" style="padding:10px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
<center><span class="y2k-blink"><font size="2" color="#ff0000"><b>&#9733; UPDATED! &#9733;</b></font></span></center><br>
${sections}
${def.y2k?.hasGuestbook ? guestbookHtml(def.pageId) : ''}
</td></tr>`;
}

function templateGov(def, rng, actors) {
  const sections = (def.sections || []).map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" bgcolor="#003366" style="padding:4px;">
<font size="1" color="#ffffff">Official Government Portal &mdash; CorpOS Certified</font></td></tr>
<tr><td colspan="2" class="y2k-nav">
<a href="#" data-action="y2k-stub">Home</a> |
<a href="#" data-action="y2k-stub">Forms</a> |
<a href="#" data-action="y2k-stub">FAQ</a> |
<a href="#" data-action="y2k-stub">Contact</a></td></tr>
<tr><td colspan="2" style="padding:10px;">
${sections}
</td></tr>`;
}

function templateEducation(def, rng, actors) {
  const sections = (def.sections || []).map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" class="y2k-nav">
<a href="#" data-action="y2k-stub">Home</a> |
<a href="#" data-action="y2k-stub">Courses</a> |
<a href="#" data-action="y2k-stub">Admissions</a> |
<a href="#" data-action="y2k-stub">Library</a></td></tr>
<tr><td colspan="2" style="padding:10px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
${sections}
${def.y2k?.hasGuestbook ? guestbookHtml(def.pageId) : ''}
</td></tr>`;
}

function templateCommunity(def, rng, actors) {
  const sections = (def.sections || []).filter(s => s.type !== 'profiles' && s.type !== 'forum').map(s => sectionContent(s, def, rng, actors)).join('\n');
  return `<tr><td colspan="2" class="y2k-nav">
<a href="#" data-action="y2k-stub">Home</a> |
<a href="#" data-action="y2k-stub">Members</a> |
<a href="#" data-action="y2k-stub">Activity</a> |
<a href="#" data-action="y2k-stub">Rules</a></td></tr>
<tr><td colspan="2" style="padding:8px;">
${def.y2k?.marquee ? marqueeHtml(def.y2k.marquee) : ''}
${sections}
${userProfiles(def, rng, actors)}
<br>
${forumThreads(def, rng, actors)}
${def.y2k?.hasGuestbook ? guestbookHtml(def.pageId) : ''}
</td></tr>`;
}

const TEMPLATES = {
  corporate: templateCorporate,
  forum: templateForum,
  personal: templatePersonal,
  news: templateNews,
  shop: templateShop,
  portal: templatePortal,
  fansite: templateFansite,
  gov: templateGov,
  education: templateEducation,
  community: templateCommunity
};

// ── MAIN EXPORT ──────────────────────────────────────────────────

export function renderY2kSiteHtml(pageDef, _ctx) {
  const y = pageDef.y2k || {};
  const bg = y.bg || '#ffffff';
  const textColor = y.textColor || '#000000';
  const linkColor = y.linkColor || '#0000ff';
  const font = y.font || 'Verdana, Geneva, sans-serif';
  const seed = (pageDef.contentSeed || 1) + Math.floor(simElapsed() / 86400000);
  const rng = mulberry32(seed >>> 0);
  const actors = getActors();
  const templateFn = TEMPLATES[pageDef.y2kTemplate] || templateCorporate;

  const bodyContent = templateFn(pageDef, rng, actors);

  return `<div class="iebody y2k-page" data-page-id="${escapeHtml(pageDef.pageId)}" style="background:${escapeHtml(bg)};color:${escapeHtml(textColor)};font-family:${escapeHtml(font)};font-size:12px;">
<style scoped>.y2k-page a{color:${escapeHtml(linkColor)};}.y2k-page a:visited{color:${escapeHtml(y.vlinkColor || '#800080')};}</style>
<table width="100%" border="0" cellpadding="0" cellspacing="0">
${y2kHeader(pageDef)}
${bodyContent}
<tr><td colspan="2" style="padding:8px;">
${y.webring ? webringHtml(y.webring, pageDef.contentSeed || 1) : ''}
${y2kFooter(pageDef)}
</td></tr>
</table></div>`;
}
