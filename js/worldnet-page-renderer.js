/**
 * Renders JSON page definitions for WorldNet (Y2K aesthetic).
 */
import { escapeHtml } from './identity.js';
import { getState } from './gameState.js';
import { renderShopProductGridHtml } from './worldnet-shop.js';
import { renderWebexWidgetSection } from './webex-widgets.js';
import { deriveTemplateSlots, getAdPlacementById, layoutTemplateForCategory } from './worldnet-ad-schema.js';
import { renderLiveThreadHtml } from './pipeline-live-comments.js';
import { renderY2kSiteHtml } from './worldnet-y2k-renderer.js';

/**
 * @param {object} pageDef
 * @param {{ navigate?: (key: string, sub?: string, opts?: object) => void, newsItems?: string[], getShopById?: (id: string) => object | null }} ctx
 */
export function renderPageDefinitionHtml(pageDef, ctx = {}) {
  if (!pageDef) return '<div class="iebody"><p>Missing page.</p></div>';
  if (pageDef.style === 'y2k') return renderY2kSiteHtml(pageDef, ctx);
  if (pageDef.webExLayout?.cells?.length) {
    return renderWebExMirrorPage(pageDef, ctx);
  }
  const parts = (pageDef.sections || []).map((s) => renderSection(s, pageDef, ctx)).join('');
  const layoutTemplate = pageDef.layoutTemplate || layoutTemplateForCategory(pageDef.category);
  const slots = deriveTemplateSlots(layoutTemplate);
  const navBar =
    (pageDef.navLinks || []).length > 0
      ? `<div style="background:${escapeHtml(pageDef.secondaryColor || '#0a246a')};color:#fff;padding:4px 8px;font-size:11px;margin-bottom:8px;">${(pageDef.navLinks || [])
          .map((l) => {
            if (l.navKey) {
              return `<a href="#" data-nav="${escapeHtml(l.navKey)}" data-wnet-subpath="${escapeHtml(
                l.navSub || ''
              )}" style="color:#fff;margin-right:12px;">${escapeHtml(l.label || '')}</a>`;
            }
            return `<a href="#" data-wnet-nav="${escapeHtml(l.targetUrl || l.url || '#')}" style="color:#fff;margin-right:12px;">${escapeHtml(
              l.label || ''
            )}</a>`;
          })
          .join('')}</div>`
      : '';
  const foot = pageDef.footerText
    ? `<div style="margin-top:12px;font-size:10px;color:#888;border-top:1px solid #ccc;padding-top:6px;">${escapeHtml(pageDef.footerText)}</div>`
    : '';
  return renderTemplateLayout(pageDef, { navBar, parts, foot, slots });
}

function renderWebExMirrorPage(pageDef, ctx) {
  const L = pageDef.webExLayout;
  const bg = escapeHtml(pageDef.backgroundColor || '#fff');
  const cols = L.columns || 3;
  const rows = L.rows || 3;
  const gap = L.gapPx ?? 4;
  const rowPx = L.rowMinPx ?? 80;
  const siteName = pageDef.siteName || pageDef.title || 'Site';
  const titleFont = escapeHtml(pageDef.webExTitleFontStack || 'Tahoma, Geneva, sans-serif');
  const titleSize = Math.min(32, Math.max(10, Number(pageDef.webExTitleSizePx) || 12));
  const ux =
    pageDef.uxScore != null
      ? `<span style="font-weight:bold;font-size:10px;background:#0a246a;color:#fff;padding:2px 8px;border-radius:2px;">UX: ${escapeHtml(
          String(pageDef.uxScore)
        )}</span>`
      : '';

  let grid = `<div class="wx-live-grid" style="display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},minmax(${rowPx}px,auto));gap:${gap}px;width:100%;box-sizing:border-box;">`;
  for (const c of L.cells) {
    const empty = !c.moduleId;
    const border = empty
      ? 'border:2px dashed #a0a0a0;background:#f8f4ec;'
      : 'border:2px solid #6a9a50;background:#e0f0d8;';
    const inner = (c.sections || []).map((s) => renderSection(s, pageDef, ctx)).join('');
    const placeholder = empty
      ? '<span class="wx-live-slot-plus" style="font-size:22px;color:#a0a0a0;line-height:1;">+</span>'
      : '';
    grid += `<div class="wx-live-slot${empty ? ' wx-live-slot-empty' : ''}" style="grid-column:${c.x + 1}/span ${c.w};grid-row:${c.y + 1}/span ${c.h};${border}box-sizing:border-box;display:flex;flex-direction:column;align-items:stretch;justify-content:${empty ? 'center' : 'flex-start'};min-height:0;padding:2px;overflow:auto;text-align:${empty ? 'center' : 'left'};">
      <div class="wx-live-slot-inner" style="width:100%;min-height:0;flex:1;font-size:11px;">${inner || placeholder}</div>
    </div>`;
  }
  grid += '</div>';

  const foot = pageDef.footerText
    ? `<div style="margin-top:6px;font-size:10px;color:#888;border-top:1px solid #ccc;padding-top:6px;">${escapeHtml(pageDef.footerText)}</div>`
    : '';

  return `<div class="iebody wnet-webex-mirror" data-page-id="${escapeHtml(
    pageDef.pageId || ''
  )}" style="background:${bg};font-family:Tahoma,Arial,sans-serif;font-size:11px;padding:6px;box-sizing:border-box;">
<div class="wx-live-canvas-header" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
  <div style="flex:1;font-weight:bold;font-size:${titleSize}px;border:2px inset #c0c0c0;padding:3px 5px;background:#fff;font-family:${titleFont};line-height:1.2;">${escapeHtml(siteName)}</div>
  ${ux}
</div>
${grid}
${foot}
</div>`;
}

function renderSection(sec, pageDef, ctx) {
  const t = sec.type || sec.sectionType || 'text';
  switch (t) {
    case 'hero':
      return renderHero(sec, pageDef);
    case 'text':
      return renderText(sec, pageDef);
    case 'newsFeed':
      return renderNewsFeed(sec, ctx);
    case 'productGrid':
      return renderProductGrid(sec, pageDef, ctx);
    case 'table':
      return renderTable(sec, pageDef, ctx);
    case 'form':
      return renderForm(sec, pageDef);
    case 'ad':
      return `<div data-wnet-ad-slot="${escapeHtml(
        sec.slot || sec.placement || 'content-break'
      )}" data-wnet-ad-region="${escapeHtml(sec.placement || 'content-break')}" style="margin:8px 0;"></div>`;
    case 'login':
      return renderLogin(sec, pageDef);
    case 'profile':
      return renderProfile(sec, ctx);
    case 'links':
      return renderLinks(sec);
    case 'divider':
      return `<div style="margin:12px 0;border-top:1px solid #999;position:relative;"><span style="position:absolute;left:8px;top:-8px;background:${escapeHtml(pageDef.backgroundColor || '#fff')};padding:0 4px;font-size:10px;color:#666;">${escapeHtml(sec.label || '')}</span></div>`;
    case 'ticker':
      return renderTicker(sec, ctx);
    case 'actor_feed':
      return renderActorFeed(sec);
    case 'social_profile':
      return renderSocialProfile(sec);
    case 'forum_thread':
      if (sec.live) return renderLiveThreadHtml(sec, pageDef);
      return renderForumThread(sec);
    case 'live_thread':
      return renderLiveThreadHtml(sec, pageDef);
    case 'news_byline':
      return renderNewsByline(sec);
    case 'shop_nav':
      return renderShopNav(sec, pageDef);
    case 'video_embed':
      return renderVideoEmbed(sec);
    case 'image_gallery':
      return renderImageGallery(sec, pageDef);
    case 'reviews_block':
      return renderReviewsBlock(sec, pageDef);
    case 'webex_widget':
      return renderWebexWidgetSection(sec, pageDef, ctx);
    case 'webex_empty':
      return '';
    default:
      return `<div class="ad">${escapeHtml(t)} section</div>`;
  }
}

function slotHost(slot) {
  const placement = getAdPlacementById(slot.placement);
  if (!placement) return '';
  return `<div data-wnet-ad-slot="${escapeHtml(slot.slotId)}" data-wnet-ad-region="${escapeHtml(
    slot.placement
  )}"></div>`;
}

function renderTemplateLayout(pageDef, { navBar, parts, foot, slots }) {
  const bg = escapeHtml(pageDef.backgroundColor || '#fff');
  const top = slots.filter((s) => s.placement === 'below-header');
  const right = slots.filter((s) => s.placement === 'right-rail');
  const left = slots.filter((s) => s.placement === 'left-rail');
  const inline = slots.filter((s) => s.placement === 'content-sidebar');
  const breaks = slots.filter((s) => s.placement === 'content-break');
  const aboveFooter = slots.filter(
    (s) => s.placement === 'above-footer' || s.placement === 'paired-half-banners'
  );
  const badges = slots.filter((s) => s.placement === 'footer-badges');
  const hasRails = left.length || right.length;
  const contentSidebar = inline[0] ? slotHost(inline[0]) : '';
  const contentBreak = breaks[0] ? `<div style="margin:8px 0;">${slotHost(breaks[0])}</div>` : '';

  return `<div class="iebody wnet-page-def" data-page-id="${escapeHtml(
    pageDef.pageId || ''
  )}" style="background:${bg};font-family:Tahoma,Arial,sans-serif;font-size:11px;">
${navBar}
${top.map(slotHost).join('')}
<div style="display:flex;gap:10px;align-items:flex-start;">
  ${left.length ? `<aside style="width:126px;flex-shrink:0;">${left.map(slotHost).join('')}</aside>` : ''}
  <main style="flex:1;min-width:0;">
    ${contentSidebar}
    ${parts}
    ${contentBreak}
    ${foot}
  </main>
  ${right.length ? `<aside style="width:126px;flex-shrink:0;">${right.map(slotHost).join('')}</aside>` : ''}
</div>
${aboveFooter.length ? `<div style="margin-top:8px;">${aboveFooter.map(slotHost).join('')}</div>` : ''}
${badges.length ? `<div style="margin-top:6px;">${badges.map(slotHost).join('')}</div>` : ''}
</div>`;
}

function renderHero(sec, pageDef) {
  const title = sec.siteNameOverride || pageDef.siteName || pageDef.title;
  const tag = sec.taglineOverride || pageDef.siteTagline || '';
  const banner = sec.showBannerAd
    ? `<div data-wnet-ad-slot="hero-banner" data-wnet-ad-region="banner-top" style="margin:6px 0;"></div>`
    : '';
  return `<div style="background:${escapeHtml(sec.bgColor || pageDef.primaryColor || '#0a246a')};color:#fff;padding:16px;margin-bottom:8px;">
  <div style="font-size:22px;font-weight:bold;">${escapeHtml(title)}</div>
  <div style="font-size:11px;opacity:0.95;">${escapeHtml(tag)}</div>
  ${banner}</div>`;
}

function renderText(sec, pageDef) {
  const body = escapeHtml(sec.body || '');
  const links = sec.links || [];
  let html = body;
  for (const l of links) {
    html += ` <a href="#" data-wnet-nav="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a>`;
  }
  if (sec.imageUrl) {
    html += `<div style="margin-top:6px;"><img src="${escapeHtml(sec.imageUrl)}" alt="" style="max-width:100%;border:1px solid #ccc;"></div>`;
  }
  const plain = !!sec.webexPlain;
  const h2Sz = plain ? '12px' : '14px';
  const h2 = sec.headline
    ? `<h2 style="color:${escapeHtml(pageDef.secondaryColor || '#0a246a')};font-size:${h2Sz};margin:0 0 4px;">${escapeHtml(sec.headline)}</h2>`
    : '';
  const pSz = plain ? '11px' : '';
  return `<div style="margin-bottom:10px;">${h2}<p style="line-height:1.35;${pSz ? `font-size:${pSz};` : ''}margin:0;">${html}</p></div>`;
}

function renderNewsFeed(sec, ctx) {
  const n = Math.min(50, Math.max(1, Number(sec.count) || 5));
  const items = ctx.newsItems || [];
  const lines = items.slice(-n).reverse();
  const rows = lines
    .map(
      (h, i) =>
        `<li style="margin:4px 0;"><a href="#" data-action="stub">${escapeHtml(String(h))}</a> <span style="color:#888;font-size:10px;">#${i + 1}</span></li>`
    )
    .join('');
  return `<div style="border:1px solid #ccc;padding:8px;background:#fafafa;margin-bottom:10px;"><b>News</b><ul style="margin:6px 0;padding-left:20px;">${rows || '<li>No headlines.</li>'}</ul></div>`;
}

function renderProductGrid(sec, pageDef, ctx) {
  const shopId = sec.shopId || pageDef.shopId;
  if (!shopId) return '<div class="ad">Product grid: set shopId</div>';
  if (ctx.getShopById) {
    const store = ctx.getShopById(shopId);
    if (store) {
      return renderShopProductGridHtml(store, { maxItems: sec.maxItems || 12 });
    }
  }
  return `<div class="ad">Shop "${escapeHtml(shopId)}" not loaded.</div>`;
}

function renderTable(sec, pageDef, ctx) {
  const headers = sec.headers || [];
  let rows = sec.rows;
  if (sec.gameStatePath) {
    try {
      const st = getState();
      const path = String(sec.gameStatePath).split('.');
      let cur = st;
      for (const p of path) cur = cur?.[p];
      if (Array.isArray(cur)) rows = cur.map((x) => (Array.isArray(x) ? x : Object.values(x)));
    } catch {
      rows = rows || [];
    }
  }
  rows = rows || [];
  const th = headers.map((h) => `<th style="border:1px solid #999;padding:4px;background:#eee;">${escapeHtml(h)}</th>`).join('');
  const tr = rows
    .map(
      (r) =>
        `<tr>${(Array.isArray(r) ? r : []).map((c) => `<td style="border:1px solid #ccc;padding:4px;">${escapeHtml(String(c))}</td>`).join('')}</tr>`
    )
    .join('');
  return `<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px;"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function renderForm(sec) {
  const fields = sec.fields || [];
  const rows = fields
    .map(
      (f) =>
        `<tr><td style="padding:3px;">${escapeHtml(f.label || '')}</td><td><input type="${escapeHtml(f.inputType || 'text')}" name="${escapeHtml(f.name || '')}" style="width:100%"></td></tr>`
    )
    .join('');
  return `<form data-wnet-form="${escapeHtml(sec.formId || 'form')}" style="border:1px inset #808080;padding:8px;background:#fff;margin-bottom:10px;"><table style="width:100%;">${rows}</table><button type="button" data-action="stub">${escapeHtml(sec.submitLabel || 'Submit')}</button></form>`;
}

function renderLogin(sec) {
  const sys = sec.systemType || 'wahoo';
  return `<div style="border:2px solid #999;padding:10px;max-width:400px;margin-bottom:10px;"><b>${escapeHtml(sec.headline || 'Sign In')}</b> (${escapeHtml(sys)})
<table style="width:100%;margin-top:8px;"><tr><td>User</td><td><input id="wnet-login-u" type="text" style="width:100%"></td></tr>
<tr><td>Pass</td><td><input id="wnet-login-p" type="password" style="width:100%"></td></tr></table>
<button type="button" data-action="stub">${escapeHtml(sec.buttonLabel || 'Log In')}</button></div>`;
}

function renderProfile(sec, ctx) {
  const st = getState();
  const player = st.player || {};
  const fields = sec.fields || ['displayName', 'email', 'phone'];
  const lines = fields.map((f) => `<tr><td style="padding:2px 8px 2px 0;">${escapeHtml(f)}</td><td>${escapeHtml(String(player[f] ?? '—'))}</td></tr>`).join('');
  return `<div style="border:1px solid #0a246a;padding:8px;margin-bottom:10px;"><b>Profile</b><table style="margin-top:6px;">${lines}</table></div>`;
}

function renderLinks(sec) {
  const items = sec.items || [];
  const grid = items
    .map(
      (it) =>
        `<a href="#" data-wnet-nav="${escapeHtml(it.url)}" style="display:inline-block;margin:4px 8px 4px 0;padding:6px 10px;border:2px outset #fff;background:#d4d0c8;color:#00c;text-decoration:underline;">${escapeHtml(it.label)}</a>`
    )
    .join('');
  return `<div style="margin-bottom:10px;">${grid}</div>`;
}

function renderTicker(sec, ctx) {
  const text =
    sec.inlineText ||
    (ctx.newsItems || []).slice(-3).join('  |  ') ||
    'CorpOS 2000 — Live ticker';
  return `<div class="ntbar" style="margin-bottom:8px;overflow:hidden;"><div style="white-space:nowrap;animation:wnet-marquee 20s linear infinite;">${escapeHtml(text)}</div></div>`;
}

function queryActorsFromSection(sec, fallbackLens) {
  try {
    const lens = sec.lens || fallbackLens || 'social';
    const filters = sec.filters && typeof sec.filters === 'object' ? sec.filters : {};
    return window.ActorDB?.query ? window.ActorDB.query(lens, filters) : [];
  } catch {
    return [];
  }
}

function renderActorFeed(sec) {
  const rows = queryActorsFromSection(sec, 'social');
  if (!rows.length) return '<div class="ad">Actor feed unavailable.</div>';
  const items = rows
    .map((a) => `<li><b>${escapeHtml(a.public_profile?.display_name || a.actor_id || 'Unknown')}</b> · ${escapeHtml((a.taglets || []).join(', ') || 'no tags')}</li>`)
    .join('');
  return `<div style="border:1px solid #bbb;padding:8px;margin-bottom:10px;background:#fafafa;"><b>${escapeHtml(sec.title || 'Actor feed')}</b><ul style="margin:6px 0;padding-left:18px;">${items}</ul></div>`;
}

function renderSocialProfile(sec) {
  const row = queryActorsFromSection(sec, 'social')[0];
  if (!row) return '<div class="ad">Social profile unavailable.</div>';
  const relCount = Array.isArray(row.relationships) ? row.relationships.length : 0;
  return `<div style="border:1px solid #0a246a;padding:8px;margin-bottom:10px;"><b>${escapeHtml(row.public_profile?.display_name || row.actor_id)}</b><div style="font-size:10px;color:#666;">Aliases: ${escapeHtml((row.aliases || []).join(', ') || 'none')}</div><div style="font-size:10px;color:#666;">Taglets: ${escapeHtml((row.taglets || []).join(', ') || 'none')}</div><div style="font-size:10px;color:#666;">Relationships: ${relCount}</div></div>`;
}

function renderForumThread(sec) {
  const rows = queryActorsFromSection(sec, 'forum').slice(0, 8);
  if (!rows.length) return '<div class="ad">Forum thread unavailable.</div>';
  const posts = rows
    .map((a, i) => `<div style="padding:6px;border-bottom:1px solid #ddd;"><b>${escapeHtml(a.aliases?.[0] || `user${i + 1}`)}</b>: ${escapeHtml((a.taglets || []).join(' / ') || 'general discussion')}</div>`)
    .join('');
  return `<div style="border:1px solid #999;background:#fff;margin-bottom:10px;"><div style="background:#eee;padding:6px;"><b>${escapeHtml(sec.title || 'Forum thread')}</b></div>${posts}</div>`;
}

function renderNewsByline(sec) {
  const row = queryActorsFromSection(sec, 'news')[0];
  if (!row) return '<div class="ad">Byline unavailable.</div>';
  const actorName = row.public_profile?.display_name || row.actor_id || 'Unknown Reporter';
  const actorRole = row.profession || 'staff writer';
  const template = String(sec.template || '{{actor_name}} — {{actor_role}}');
  const text = template
    .replace(/\{\{actor_name\}\}/g, actorName)
    .replace(/\{\{actor_role\}\}/g, actorRole);
  return `<div style="font-size:10px;color:#666;margin-bottom:10px;">${escapeHtml(text)}</div>`;
}

/** RapidMart-style checkout shortcuts (data-nav → wn_shop). */
function renderShopNav(sec, pageDef) {
  const sid = sec.shopId || pageDef.shopId;
  if (!sid) return '';
  const em = sec.emphasis || 'all';
  const btnStyle =
    'height:22px;padding:0 10px;font-size:10px;cursor:pointer;background:#0a246a;color:#fff;border:1px solid #061a4a;font-family:Tahoma,sans-serif;';
  const parts = [];
  if (em === 'all' || em === 'home') {
    parts.push(
      `<button type="button" data-nav="wn_shop" data-wnet-subpath="${escapeHtml(sid)}/home" style="${btnStyle}">Storefront</button>`
    );
  }
  if (em === 'all' || em === 'cart' || em === 'checkout') {
    parts.push(
      `<button type="button" data-nav="wn_shop" data-wnet-subpath="${escapeHtml(sid)}/cart" style="${btnStyle}">Cart</button>`
    );
    parts.push(
      `<button type="button" data-nav="wn_shop" data-wnet-subpath="${escapeHtml(sid)}/checkout" style="${btnStyle}">Checkout</button>`
    );
  }
  return `<div style="margin:8px 0;padding:8px;border:1px solid #aab4cc;background:#f3f7ff;">
  <div style="font-weight:bold;color:#0a246a;font-size:11px;margin-bottom:6px;">${escapeHtml(sec.title || 'Shopping')}</div>
  <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;">${parts.join('')}
  <span style="font-size:9px;color:#666;margin-left:4px;">Powered by WorldNet Commerce (same engine as RapidMart).</span></div></div>`;
}

function renderVideoEmbed(sec) {
  const promo = sec.autoplayPromo
    ? `<div style="background:#a60;color:#fff;font-size:9px;padding:4px;text-align:center;margin-bottom:6px;">AUTO-PLAY · Engagement boost · UX penalty</div>`
    : '';
  return `<div style="border:2px inset #888;background:#1a1a1a;color:#9cf;padding:10px;margin-bottom:10px;font-family:Tahoma,sans-serif;font-size:11px;">
  ${promo}
  <div style="font-weight:bold;margin-bottom:6px;">${escapeHtml(sec.title || 'Video')}</div>
  <div style="max-width:280px;margin:0 auto;aspect-ratio:4/3;background:#000;border:2px solid #333;display:flex;align-items:center;justify-content:center;font-size:36px;color:#6cf;">▶</div>
  <div style="font-size:9px;color:#888;margin-top:6px;text-align:center;">${escapeHtml(
    sec.caption || 'CorpMedia Player 2000 — 56k optimized stream'
  )}</div></div>`;
}

function renderImageGallery(sec, pageDef) {
  const raw = Array.isArray(sec.images) ? sec.images : [];
  const items =
    raw.length > 0
      ? raw
      : [
          { caption: 'Floor display' },
          { caption: 'Receiving' },
          { caption: 'Customer pick-up' }
        ];
  const c1 = escapeHtml(pageDef.primaryColor || '#0a246a');
  const c2 = escapeHtml(pageDef.secondaryColor || '#cc6600');
  const cells = items
    .map((im, i) => {
      const cap = escapeHtml(im.caption || `Image ${i + 1}`);
      const bg = im.src
        ? `background:url(${escapeHtml(im.src)}) center/cover no-repeat`
        : `background:linear-gradient(135deg,${c1}22,${c2}33)`;
      return `<div style="flex:1;min-width:72px;max-width:120px;">
        <div style="height:64px;border:1px solid #ccc;${bg};"></div>
        <div style="font-size:9px;color:#555;margin-top:2px;text-align:center;">${cap}</div>
      </div>`;
    })
    .join('');
  return `<div style="margin-bottom:10px;border:1px solid #ccc;padding:8px;background:#fafafa;">
  <div style="font-weight:bold;color:${c1};font-size:12px;margin-bottom:6px;">${escapeHtml(sec.title || 'Gallery')}</div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;">${cells}</div></div>`;
}

function renderReviewsBlock(sec, pageDef) {
  const site = escapeHtml(pageDef.siteName || pageDef.title || 'This site');
  const samples = [
    { who: 'Verified Buyer — Hargrove', stars: '★★★★☆', text: `Solid experience shopping at ${site}.` },
    { who: 'OfficeManager_99', stars: '★★★★★', text: 'Arrived in two sim-days. Packaging survived the truck.' },
    { who: 'dialup_king', stars: '★★★☆☆', text: 'Good value. Site loaded fine on my CorpOS rig.' }
  ];
  const rows = samples
    .map(
      (r) =>
        `<div style="padding:6px;border-bottom:1px solid #e0e0e0;"><span style="color:#a60;">${escapeHtml(
          r.stars
        )}</span> <b>${escapeHtml(r.who)}</b><div style="font-size:10px;color:#444;margin-top:2px;">${escapeHtml(
          r.text
        )}</div></div>`
    )
    .join('');
  return `<div style="border:1px solid #999;background:#fff;margin-bottom:10px;">
  <div style="background:#eee;padding:6px;font-weight:bold;">${escapeHtml(sec.title || 'Reviews')}</div>
  ${rows}</div>`;
}

/**
 * Mount HTML and bind delegated nav for data-wnet-nav inside root.
 * @param {HTMLElement} container
 * @param {typeof renderPageDefinitionHtml} htmlFactory
 */
export function mountPageDefinition(container, pageDef, ctx) {
  if (!container) return;
  container.innerHTML = renderPageDefinitionHtml(pageDef, ctx);
  const navHandler = (e) => {
    const a = e.target.closest('[data-wnet-nav]');
    if (!a || !container.contains(a)) return;
    e.preventDefault();
    const url = a.getAttribute('data-wnet-nav');
    if (ctx.onNavigateToUrl) ctx.onNavigateToUrl(url);
  };
  container.addEventListener('click', navHandler);
  container._wnetNavCleanup = () => container.removeEventListener('click', navHandler);
}
