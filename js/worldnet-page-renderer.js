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
import { renderWebexRtcModuleInner } from './webex-site-rtc.js';

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

/**
 * @param {object} pageDef
 * @returns {object} view model for WebEx public site
 */
function buildWebExSiteView(pageDef) {
  return {
    siteName: pageDef.siteName || pageDef.title || 'Site',
    siteTagline: pageDef.siteTagline || 'Welcome to our site',
    colorPrimary: pageDef.colorPrimary || '#0a246a',
    colorSecondary: pageDef.colorSecondary || '#1a3a8f',
    colorBackground: pageDef.colorBackground || '#ffffff',
    colorText: pageDef.colorText || '#222222',
    titleFontStack: pageDef.webExTitleFontStack || 'Arial,Helvetica,sans-serif',
    titleSizePx: Math.min(32, Math.max(10, Number(pageDef.webExTitleSizePx) || 12)),
    textBlockContent: pageDef.textBlockContent || 'About us — content coming soon.',
    aboutContent: pageDef.aboutContent || 'We are a Hargrove-based business.',
    publishedPageId: pageDef.pageId || '',
    faqItems: Array.isArray(pageDef.faqItems) ? pageDef.faqItems : null
  };
}

/**
 * @param {object} [cell] layout cell { slotId, w, h, x, y, moduleId }
 * @param {string} modId
 * @param {ReturnType<typeof buildWebExSiteView>} proj
 * @param {object} pageDef
 * @param {object} ctx
 */
function renderWebExModule(modId, proj, pageDef, ctx, cell = null) {
  if (!modId) return '';
  const id = modId;
  const label = String(modId).replace(/_/g, ' ');
  const slotD = cell?.slotId && pageDef.webExSlotModuleData ? pageDef.webExSlotModuleData[cell.slotId] : null;
  const inGrid = !!cell;
  const pad = inGrid ? '10px 12px' : '32px 40px';
  const textMaxW = inGrid ? '100%' : '760px';
  const heroPad = inGrid ? '20px 16px' : '60px 40px';
  const h1Size = inGrid ? Math.max(10, Math.min(28, Number(proj.titleSizePx) * 0.9)) : proj.titleSizePx;
  const tagSize = inGrid ? '12px' : '15px';
  const heroName = (slotD?.headline && String(slotD.headline).trim()) ? String(slotD.headline).trim() : (proj.siteName || '');
  const heroTag = (slotD?.body && String(slotD.body).trim()) ? String(slotD.body).trim() : (proj.siteTagline || 'Welcome to our site');
  const textFromSlot =
    slotD && (slotD.body != null && String(slotD.body).trim())
      ? String(slotD.body)
      : (slotD?.headline && String(slotD.headline).trim() ? String(slotD.headline) : '');
  const textBlockBody =
    (id === 'text_block' || id === 'custom_text_box') && textFromSlot
      ? textFromSlot
      : proj.textBlockContent || 'About us — content coming soon.';
  const aboutBody =
    id === 'about_section' && slotD && (slotD.body != null && String(slotD.body).trim())
      ? String(slotD.body)
      : (id === 'about_section' && slotD?.headline)
        ? String(slotD.headline)
        : proj.aboutContent || 'We are a Hargrove-based business.';

  switch (id) {
    case 'hero_banner':
      return `<div class="wx-site-hero" style="background:linear-gradient(135deg, ${escapeHtml(
        proj.colorPrimary
      )} 0%, ${escapeHtml(proj.colorSecondary)} 100%);padding:${heroPad};text-align:center;color:#fff;min-height:0;box-sizing:border-box;">
        <h1 style="font-family:${escapeHtml(proj.titleFontStack)};font-size:${h1Size}px;margin:0 0 8px;word-wrap:break-word;">
          ${escapeHtml(heroName || '')}
        </h1>
        <p style="font-size:${tagSize};opacity:0.85;margin:0;word-wrap:break-word;">
          ${escapeHtml(heroTag)}
        </p>
      </div>`;

    case 'text_block':
    case 'custom_text_box':
      return `<div class="wx-site-text" style="padding:${pad};max-width:${textMaxW};margin:0 auto;line-height:1.6;color:#222;box-sizing:border-box;">
        <p style="margin:0;font-size:12px;">${escapeHtml(textBlockBody)}</p>
      </div>`;

    case 'about_section':
      return `<div class="wx-site-about" style="padding:${pad};background:#f8f8f8;border:1px solid #ddd;box-sizing:border-box;">
        <h2 style="font-size:15px;margin:0 0 6px;color:#333">About</h2>
        <p style="color:#555;line-height:1.5;margin:0;font-size:12px;">${escapeHtml(aboutBody)}</p>
      </div>`;

    case 'contact_form': {
      const cpad = inGrid ? '10px 12px' : '32px 40px';
      return `<div class="wx-site-contact" style="padding:${cpad};box-sizing:border-box;">
        <h2 style="font-size:18px;margin:0 0 16px;color:#333">Contact Us</h2>
        <form class="wx-contact-form" data-wx-contact-form>
          <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;margin-bottom:4px">Name</label>
            <input type="text" name="name" style="width:100%;max-width:360px;padding:6px 8px;border:1px solid #ccc;font-size:13px"></div>
          <div style="margin-bottom:10px"><label style="display:block;font-size:12px;color:#555;margin-bottom:4px">Email</label>
            <input type="email" name="email" style="width:100%;max-width:360px;padding:6px 8px;border:1px solid #ccc;font-size:13px"></div>
          <div style="margin-bottom:14px"><label style="display:block;font-size:12px;color:#555;margin-bottom:4px">Message</label>
            <textarea name="message" rows="4" style="width:100%;max-width:360px;padding:6px 8px;border:1px solid #ccc;font-size:13px"></textarea></div>
          <button type="submit" style="padding:8px 20px;background:${escapeHtml(
            proj.colorPrimary
          )};color:#fff;border:none;font-size:13px;cursor:pointer">Send Message</button>
        </form>
      </div>`;
    }

    case 'guestbook': {
      const pid = escapeHtml(proj.publishedPageId || '');
      return `<div class="wx-site-guestbook" style="padding:32px 40px;" data-wx-guestbook data-page-id="${pid}">
        <h2 style="font-size:18px;margin:0 0 16px;color:#333">Guestbook</h2>
        <div class="wx-guestbook-entries" id="guestbook-${escapeHtml(
          String(proj.publishedPageId || '').replace(/[^a-zA-Z0-9_-]/g, '_')
        )}" style="margin-bottom:16px;max-height:320px;overflow-y:auto;">
          <div class="wx-gb-empty" style="color:#888;font-size:13px;font-style:italic">No entries yet. Be the first to sign!</div>
        </div>
        <div class="wx-gb-form" style="border-top:1px solid #eee;padding-top:14px">
          <input type="text" placeholder="Your name" data-wx-gb-name style="padding:5px 8px;font-size:13px;border:1px solid #ccc;margin-right:8px;width:160px">
          <input type="text" placeholder="Leave a message..." data-wx-gb-msg style="padding:5px 8px;font-size:13px;border:1px solid #ccc;width:280px;margin-right:8px">
          <button type="button" data-wx-gb-submit style="padding:5px 14px;background:${escapeHtml(
            proj.colorPrimary
          )};color:#fff;border:none;cursor:pointer;font-size:13px">Sign</button>
        </div>
      </div>`;
    }

    case 'shop':
    case 'product_listing': {
      const pid = escapeHtml(proj.publishedPageId || '');
      const store = pageDef.shopId && ctx.getShopById ? ctx.getShopById(pageDef.shopId) : null;
      const grid =
        store && pageDef.hasShop
          ? renderShopProductGridHtml(store, { maxItems: 12 })
          : `<div style="color:#888;font-size:13px;font-style:italic">Products coming soon.</div>`;
      return `<div class="wx-site-shop" style="padding:32px 40px;" data-wx-shop data-page-id="${pid}">
        <h2 style="font-size:18px;margin:0 0 16px;color:#333">Shop</h2>
        <div class="wx-product-grid" style="display:flex;flex-wrap:wrap;gap:16px;" id="shop-${escapeHtml(
          String(proj.publishedPageId || '').replace(/[^a-zA-Z0-9_-]/g, '_')
        )}">
          ${grid}
        </div>
      </div>`;
    }

    case 'newsletter_signup':
      return `<div class="wx-site-newsletter" style="padding:24px 40px;background:#f0f4ff;border-top:1px solid #dde8f0;text-align:center;">
        <h3 style="margin:0 0 8px;font-size:16px;color:${escapeHtml(proj.colorPrimary)}">Stay Updated</h3>
        <p style="font-size:12px;color:#666;margin:0 0 12px">Sign up for our newsletter</p>
        <input type="email" placeholder="your@email.com" style="padding:6px 10px;font-size:13px;border:1px solid #ccc;width:220px;margin-right:8px">
        <button type="button" style="padding:6px 16px;background:${escapeHtml(
          proj.colorPrimary
        )};color:#fff;border:none;font-size:13px;cursor:pointer">Subscribe</button>
      </div>`;

    case 'footer':
      return `<div class="wx-site-footer" style="padding:20px 40px;background:#222;color:#aaa;font-size:12px;text-align:center;margin-top:auto;">
        &copy; 2000 ${escapeHtml(proj.siteName || '')} &middot; Built with WebEx-Publisher&trade; &middot; Hargrove, CA
      </div>`;

    case 'banner_ad_slot': {
      const pid = escapeHtml(proj.publishedPageId || '');
      return `<div class="wx-site-ad" style="padding:10px 40px;text-align:center;" data-wx-ad-slot data-page-id="${pid}">
        <div style="width:468px;height:60px;background:#f0f0f0;border:1px solid #ccc;margin:0 auto;display:flex;align-items:center;justify-content:center;">
          <span style="color:#999;font-size:11px">Advertisement</span>
        </div>
      </div>`;
    }

    case 'faq_block': {
      const items = proj.faqItems || [
        { q: 'What are your hours?', a: 'We are open Monday through Friday, 9AM to 5PM.' },
        { q: 'How do I contact you?', a: 'Use the contact form above or call us directly.' }
      ];
      return `<div class="wx-site-faq" style="padding:32px 40px;">
        <h2 style="font-size:18px;margin:0 0 16px;color:#333">FAQ</h2>
        ${items
          .map(
            (item) => `
          <div style="margin-bottom:14px;border-bottom:1px solid #eee;padding-bottom:12px">
            <div style="font-weight:bold;color:#333;font-size:13px;margin-bottom:4px">${escapeHtml(item.q)}</div>
            <div style="color:#555;font-size:13px">${escapeHtml(item.a)}</div>
          </div>`
          )
          .join('')}
      </div>`;
    }

    case 'live_chat': {
      const pid = String(pageDef.pageId || proj.publishedPageId || '');
      return renderWebexRtcModuleInner(
        pid,
        { colorPrimary: proj.colorPrimary, colorText: pageDef.colorText || proj.colorText || '#222' },
        { compact: inGrid }
      );
    }

    default: {
      const dpad = inGrid ? '10px' : '24px 40px';
      return `<div class="wx-site-module" style="padding:${dpad};border-top:1px solid #eee;box-sizing:border-box;">
        <div style="color:#888;font-size:11px">${escapeHtml(label)}</div>
      </div>`;
    }
  }
}

function renderWebExMirrorPage(pageDef, ctx) {
  const L = pageDef.webExLayout;
  const cells = (L && L.cells) || [];
  const modSequence = cells.filter((c) => c.moduleId).map((c) => c.moduleId);
  const view = buildWebExSiteView(pageDef);
  const navShowShop = modSequence.some((m) => m === 'shop' || m === 'product_listing');
  const navShowAbout = modSequence.includes('about_section');
  const navShowContact = modSequence.includes('contact_form');
  const pageIdAttr = escapeHtml(pageDef.pageId || '');
  const colCount = L?.columns != null ? Math.max(1, Number(L.columns) || 1) : 3;
  const rowCount = L?.rows != null ? Math.max(1, Number(L.rows) || 1) : 1;
  const gap = L?.gapPx != null ? Math.max(0, Number(L.gapPx) || 0) : 4;
  const rowMin = L?.rowMinPx != null ? Math.max(40, Number(L.rowMinPx) || 80) : 80;
  const gridItems = (cells || [])
    .map((cell) => {
      const gcol = `${cell.x + 1} / span ${cell.w || 1}`;
      const grow = `${cell.y + 1} / span ${cell.h || 1}`;
      const modInner = !cell.moduleId
        ? `<div class="wx-site-cell wx-site-cell--empty" style="min-height:40px;flex:1;background:linear-gradient(135deg,#f5f5f5 0%,#ebebeb 100%);border:1px dashed #c8c8c8;box-sizing:border-box;"></div>`
        : `<div class="wx-site-cell wx-site-cell--mod" data-wx-cell-slot="${escapeHtml(
            cell.slotId || ''
          )}" style="flex:1;min-height:0;display:flex;flex-direction:column;border:1px solid #d8d8d8;background:#fff;box-shadow:0 1px 0 rgba(0,0,0,0.04);box-sizing:border-box;overflow:hidden;">${renderWebExModule(
            cell.moduleId,
            view,
            pageDef,
            ctx,
            cell
          )}</div>`;
      return `<div class="wx-site-grid-item" style="grid-column:${gcol};grid-row:${grow};min-width:0;min-height:0;display:flex;flex-direction:column;align-content:stretch;">${modInner}</div>`;
    })
    .join('');

  const modHtml = `<div class="wx-site-grid" style="display:grid;box-sizing:border-box;grid-template-columns:repeat(${colCount}, minmax(0, 1fr));grid-template-rows:repeat(${rowCount}, minmax(${rowMin}px, auto));grid-auto-rows:minmax(${rowMin}px, auto);gap:${gap}px;padding:10px;flex:1;min-height:0;align-content:start;">
${gridItems}
</div>`;

  return `<div class="iebody wnet-webex-mirror wx-site-fragment" data-page-id="${pageIdAttr}" style="font-family:Tahoma,Arial,sans-serif;font-size:11px;padding:0;box-sizing:border-box;">
  <div class="wx-site-wrap" style="min-height:100%;display:flex;flex-direction:column;background:${escapeHtml(
    view.colorBackground
  )};color:${escapeHtml(view.colorText)};">
    <nav class="wx-nav" style="background:${escapeHtml(view.colorPrimary)};color:#fff;padding:10px 40px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
      <div class="wx-nav-title" style="font-size:18px;font-weight:bold;letter-spacing:1px;">${escapeHtml(
        view.siteName
      )}</div>
      <div class="wx-nav-links" style="display:flex;gap:20px;">
        <a href="#" data-action="webex_site_nav_stub" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">Home</a>
        ${navShowShop ? '<a href="#" data-action="webex_site_nav_stub" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">Shop</a>' : ''}
        ${navShowAbout ? '<a href="#" data-action="webex_site_nav_stub" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">About</a>' : ''}
        ${navShowContact ? '<a href="#" data-action="webex_site_nav_stub" style="color:rgba(255,255,255,0.8);text-decoration:none;font-size:13px;">Contact</a>' : ''}
      </div>
    </nav>
    ${modHtml}
  </div>
</div>`;
}

/**
 * Fill guestbook entries in the WorldNet content root for a published page.
 * @param {ParentNode} container
 * @param {string} pageId
 */
export function hydrateWebExGuestbook(container, pageId) {
  if (!container || !pageId) return;
  const st = getState();
  const page = (st.contentRegistry?.pages || []).find((p) => p.pageId === pageId);
  const entries = page?.guestbook || [];
  const wrap = Array.from(container.querySelectorAll('[data-wx-guestbook]')).find(
    (w) => w.getAttribute('data-page-id') === pageId
  );
  if (!wrap) return;
  const gbEl = wrap.querySelector('.wx-guestbook-entries');
  if (!gbEl) return;
  if (!entries.length) {
    gbEl.innerHTML =
      '<div class="wx-gb-empty" style="color:#888;font-size:13px;font-style:italic">No entries yet. Be the first to sign!</div>';
    return;
  }
  gbEl.innerHTML = entries
    .slice(-20)
    .reverse()
    .map(
      (e) => `<div style="border-bottom:1px solid #f0f0f0;padding:10px 0;">
  <div style="font-weight:bold;font-size:13px;color:#333;margin-bottom:2px">
    ${escapeHtml(e.actorName || 'Anonymous')}
    <span style="font-size:10px;color:#999;font-weight:normal;margin-left:8px">${escapeHtml(e.timeLabel || '')}</span>
  </div>
  <div style="font-size:13px;color:#555">${escapeHtml(e.message || '')}</div>
</div>`
    )
    .join('');
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
