/**
 * Live HTML for WebEx-Publisher widget sections (type: webex_widget).
 */
import { escapeHtml } from './identity.js';

/**
 * @param {object} sec
 * @param {object} pageDef
 * @param {{ getShopById?: (id: string) => object | null }} ctx
 */
export function renderWebexWidgetSection(sec, pageDef, ctx) {
  const w = sec.widget || sec.kind || '';
  const shopId = sec.shopId || pageDef.shopId;
  const store = shopId && ctx.getShopById ? ctx.getShopById(shopId) : null;
  const prods = store ? Object.values(store.productsById || {}) : [];

  switch (w) {
    case 'featured_carousel':
      return renderCarousel(store, prods, sec.title || 'Featured picks');
    case 'discount_coupon':
      return `<div style="border:2px dashed #c60;background:#fff8e8;padding:8px;margin:4px 0;text-align:center;">
        <div style="font-weight:bold;color:#a40;">${escapeHtml(sec.headline || 'SAVE 15%')}</div>
        <div style="font-size:10px;margin:4px 0;">Code: <b>${escapeHtml(sec.code || 'WEBEX15')}</b> · ${escapeHtml(sec.finePrint || 'Exclusions apply.')}</div>
        <button type="button" data-action="stub" style="font-size:10px;">Apply coupon</button></div>`;
    case 'flash_sale_timer':
      return `<div style="background:#a00;color:#fff;padding:8px;margin:4px 0;text-align:center;font-weight:bold;">
        ${escapeHtml(sec.headline || 'FLASH SALE')}</div>
        <div style="text-align:center;font-size:18px;font-family:monospace;margin:6px 0;">00:14:59</div>
        <div style="font-size:9px;color:#666;text-align:center;">Simulated countdown — ends at random o'clock.</div>`;
    case 'subscription_membership':
      return `<div style="border:1px solid #0a246a;padding:8px;margin:4px 0;background:#f3f7ff;">
        <b>${escapeHtml(sec.title || 'Join the club')}</b>
        <div style="font-size:10px;margin:6px 0;">${escapeHtml(sec.blurb || 'Members get early drops and free-ish shipping vibes.')}</div>
        <input type="email" placeholder="email@corp.net" style="width:100%;font-size:10px;margin-bottom:4px;">
        <button type="button" data-action="stub" style="font-size:10px;">Subscribe</button></div>`;
    case 'bundle_deals':
      return `<div style="border:1px solid #999;padding:6px;margin:4px 0;background:#fafafa;">
        <b>${escapeHtml(sec.title || 'Bundle deals')}</b>
        <ul style="margin:6px 0;padding-left:18px;font-size:10px;">
          <li>${escapeHtml(sec.b1 || 'Starter pack — 3 items')}</li>
          <li>${escapeHtml(sec.b2 || 'Pro pack — save sim dollars')}</li>
        </ul></div>`;
    case 'forum_board':
      return `<div style="border:1px solid #999;background:#fff;margin:4px 0;">
        <div style="background:#eee;padding:6px;font-weight:bold;">${escapeHtml(sec.title || 'Community forum')}</div>
        <div style="padding:6px;font-size:10px;border-bottom:1px solid #ddd;"><b>mod_01</b> · Welcome — post your hauls.</div>
        <div style="padding:6px;font-size:10px;border-bottom:1px solid #ddd;"><b>guest42</b> · Is this site legit?</div>
        <button type="button" data-action="stub" style="margin:6px;font-size:10px;">New thread</button></div>`;
    case 'polls_surveys':
      return `<div style="border:1px inset #888;padding:8px;margin:4px 0;">
        <b>${escapeHtml(sec.question || 'How did we do?')}</b>
        <form style="margin-top:6px;font-size:10px;">
          <label><input type="radio" name="wxpoll"> Great</label><br>
          <label><input type="radio" name="wxpoll"> OK</label><br>
          <label><input type="radio" name="wxpoll"> 56k died</label><br>
          <button type="button" data-action="stub" style="margin-top:6px;">Vote</button>
        </form></div>`;
    case 'newsletter_signup':
      return `<div style="background:#e8e8e8;padding:8px;margin:4px 0;border:1px solid #bbb;">
        <b>${escapeHtml(sec.title || 'Newsletter')}</b>
        <div style="display:flex;gap:4px;margin-top:6px;">
          <input type="text" placeholder="Email" style="flex:1;font-size:10px;">
          <button type="button" data-action="stub" style="font-size:10px;">Sign up</button>
        </div></div>`;
    case 'announcement_banner':
      return `<div style="background:${escapeHtml(sec.bg || '#0a246a')};color:#fff;padding:6px 8px;margin:4px 0;font-size:11px;font-weight:bold;text-align:center;">
        ${escapeHtml(sec.text || 'Announcement: same-day sim delivery in select zones.')}</div>`;
    case 'faq_section':
      return `<div style="margin:4px 0;font-size:10px;">
        <b style="font-size:11px;">${escapeHtml(sec.title || 'FAQ')}</b>
        <details style="margin-top:6px;"><summary>${escapeHtml(sec.q1 || 'Shipping?')}</summary><p>${escapeHtml(sec.a1 || 'We ship when the packet gods allow.')}</p></details>
        <details style="margin-top:4px;"><summary>${escapeHtml(sec.q2 || 'Returns?')}</summary><p>${escapeHtml(sec.a2 || 'See return policy module below.')}</p></details>
      </div>`;
    case 'verified_seller_badge':
      return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;padding:6px;border:1px solid #6a9a50;background:#f0fff0;font-size:10px;">
        <span style="font-size:20px;">✓</span><div><b>Verified seller</b><br><span style="color:#666;">Identity checks passed (simulated).</span></div></div>`;
    case 'security_badge':
      return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0;font-size:9px;color:#333;">
        <span style="border:1px solid #999;padding:2px 6px;background:#fff;">🔒 SSL-ish</span>
        <span style="border:1px solid #999;padding:2px 6px;background:#fff;">🛡️ Fraud filter</span>
        <span style="border:1px solid #999;padding:2px 6px;background:#fff;">📋 PCI cosplay</span>
      </div>`;
    case 'testimonials':
      return `<div style="border:1px solid #ccc;padding:8px;margin:4px 0;background:#fafafa;font-size:10px;">
        <b>${escapeHtml(sec.title || 'Testimonials')}</b>
        <blockquote style="margin:8px 0 0 12px;border-left:3px solid #0a246a;padding-left:8px;">“${escapeHtml(sec.quote || 'Arrived before my dial-up finished.')}" — ${escapeHtml(sec.author || 'Pat M.')}</blockquote>
      </div>`;
    case 'return_policy':
      return `<div style="font-size:9px;color:#555;margin:4px 0;line-height:1.4;border-top:1px solid #ccc;padding-top:6px;">
        <b>${escapeHtml(sec.title || 'Returns & terms')}</b><br>
        ${escapeHtml(sec.body || '30-sim-day returns on unopened SKUs. Restocking fee may apply. This is not legal advice.')}
      </div>`;
    case 'search_bar':
      return `<div style="margin:4px 0;display:flex;gap:4px;">
        <input type="search" placeholder="${escapeHtml(sec.placeholder || 'Search this site…')}" style="flex:1;font-size:11px;padding:3px;">
        <button type="button" data-action="stub" style="font-size:10px;">Go</button>
      </div>`;
    case 'filters_sort':
      return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin:4px 0;align-items:center;font-size:10px;">
        <label>Sort <select style="font-size:10px;"><option>Featured</option><option>Price</option><option>New</option></select></label>
        <label>Filter <select style="font-size:10px;"><option>All</option><option>In stock</option></select></label>
      </div>`;
    case 'pagination':
      return `<div style="margin:6px 0;font-size:10px;display:flex;gap:4px;align-items:center;">
        <button type="button" data-action="stub" style="font-size:9px;">« Prev</button>
        <span style="border:1px solid #999;padding:2px 6px;background:#fff;">1</span>
        <a href="#" data-action="stub" style="padding:2px 6px;">2</a>
        <a href="#" data-action="stub" style="padding:2px 6px;">3</a>
        <button type="button" data-action="stub" style="font-size:9px;">Next »</button>
      </div>`;
    case 'breadcrumb':
      return `<div style="font-size:10px;color:#666;margin:4px 0;">
        <a href="#" data-action="stub">Home</a> &gt; <a href="#" data-action="stub">${escapeHtml(sec.mid || 'Shop')}</a> &gt; <span>${escapeHtml(sec.here || 'Here')}</span>
      </div>`;
    case 'dark_mode_toggle':
      return `<div style="margin:4px 0;">
        <button type="button" data-action="stub" style="font-size:10px;padding:4px 8px;border:2px outset #fff;background:#d4d0c8;">
          ${escapeHtml(sec.label || 'Toggle contrast (demo)')}
        </button>
        <span style="font-size:9px;color:#888;margin-left:6px;">Does not persist — Y2K authenticity.</span>
      </div>`;
    case 'popup_ad':
      return `<div style="position:relative;margin:4px 0;min-height:24px;">
        <div style="position:absolute;right:0;top:0;z-index:2;width:120px;border:2px solid #f00;background:#ff0;padding:6px;font-size:9px;box-shadow:4px 4px 0 #000;">
          <b>AD</b><br>${escapeHtml(sec.adText || 'Buy now!!!1')}
          <button type="button" data-action="stub" style="font-size:8px;margin-top:4px;">Close</button>
        </div>
      </div>`;
    case 'data_tracker':
      return `<div style="font-size:9px;color:#888;border:1px dotted #999;padding:4px 6px;margin:4px 0;background:#f5f5f5;">
        📊 ${escapeHtml(sec.text || 'Analytics pixel active — improves funnels, may reduce trust.')}
      </div>`;
    default:
      return `<div class="ad" style="font-size:10px;">WebEx widget: ${escapeHtml(w)}</div>`;
  }
}

function renderCarousel(store, prods, title) {
  const slice = prods.slice(0, Math.min(6, prods.length));
  if (!store || !slice.length) {
    return `<div style="padding:8px;font-size:10px;color:#666;border:1px dashed #aaa;">Featured carousel — list products in Website Inventory.</div>`;
  }
  const sid = store.id;
  const cards = slice
    .map(
      (p) => `
    <div style="flex:0 0 100px;border:1px solid #999;background:#fff;padding:4px;">
      <div style="height:48px;background:${escapeHtml(p.swatch || '#dde6ff')}"></div>
      <div style="font-size:9px;font-weight:bold;margin-top:4px;">${escapeHtml(p.title)}</div>
      <a href="#" data-nav="wn_shop" data-wnet-subpath="${escapeHtml(`${sid}/product/${p.id}`)}" style="font-size:9px;">View</a>
    </div>`
    )
    .join('');
  return `<div style="margin:4px 0;">
    <div style="font-weight:bold;font-size:11px;margin-bottom:4px;">${escapeHtml(title)}</div>
    <div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;">${cards}</div>
  </div>`;
}
