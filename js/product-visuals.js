/**
 * Deterministic SVG “catalog photo” thumbnails for products (shops, Assets, WebEx).
 * No binary assets — encoded data URIs, Y2K gadget aesthetic.
 */

function fnv1a(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escXml(t) {
  return String(t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function glyphType(categoryId, title, key) {
  const cat = String(categoryId || '').toLowerCase();
  const ttl = String(title || '').toLowerCase();
  const k = String(key || '').toLowerCase();
  if (ttl.includes('modem') || k.includes('modem') || ttl.includes('dial')) return 'modem';
  if (ttl.includes('mouse') || ttl.includes('ballmouse')) return 'mouse';
  if (ttl.includes('book') || ttl.includes('java') || cat.includes('home')) return 'book';
  if (ttl.includes('player') || ttl.includes('mp3') || ttl.includes('clip') || ttl.includes('portable'))
    return 'gadget';
  if (cat.includes('electron') || cat.includes('hardware') || cat.includes('computer')) return 'hardware';
  return 'generic';
}

function glyphSvg(type, seed) {
  const r = (seed % 7) + 3;
  switch (type) {
    case 'modem':
      return `<rect x="36" y="38" width="108" height="44" rx="3" fill="#c8d4e8" stroke="#334155" stroke-width="2"/>
        <rect x="48" y="52" width="10" height="7" fill="#166534"/><rect x="64" y="52" width="10" height="7" fill="#15803d"/>
        <rect x="108" y="46" width="32" height="28" fill="#1e293b" rx="2"/>
        <text x="124" y="64" text-anchor="middle" fill="#4ade80" font-size="9" font-family="Consolas,monospace">56k</text>`;
    case 'book':
      return `<rect x="52" y="36" width="76" height="54" fill="#fde68a" stroke="#92400e" stroke-width="2"/>
        <line x1="58" y1="46" x2="118" y2="46" stroke="#92400e"/><line x1="58" y1="56" x2="114" y2="56" stroke="#92400e"/>
        <line x1="58" y1="66" x2="110" y2="66" stroke="#92400e"/><rect x="50" y="34" width="8" height="58" fill="#fbbf24" stroke="#78350f"/>`;
    case 'mouse':
      return `<ellipse cx="90" cy="62" rx="40" ry="26" fill="#d4d4d8" stroke="#52525b" stroke-width="2"/>
        <ellipse cx="90" cy="56" rx="24" ry="14" fill="#a1a1aa" stroke="#71717a"/><circle cx="90" cy="52" r="5" fill="#27272a"/>`;
    case 'gadget':
      return `<rect x="56" y="38" width="68" height="50" rx="7" fill="#18181b" stroke="#71717a" stroke-width="2"/>
        <rect x="62" y="44" width="56" height="30" fill="#2563eb" stroke="#1e3a8a"/><circle cx="74" cy="82" r="3" fill="#71717a"/><circle cx="106" cy="82" r="3" fill="#71717a"/>`;
    case 'hardware':
      return `<rect x="44" y="42" width="92" height="46" rx="4" fill="#e2e8f0" stroke="#475569" stroke-width="2"/>
        <rect x="54" y="52" width="72" height="8" fill="#94a3b8"/><rect x="54" y="66" width="48" height="6" fill="#64748b"/>
        <circle cx="${78 + (r % 20)}" cy="54" r="4" fill="#f59e0b"/>`;
    default:
      return `<rect x="54" y="42" width="72" height="46" rx="5" fill="#e8eef7" stroke="#64748b" stroke-width="2"/>
        <circle cx="90" cy="64" r="16" fill="#93c5fd" stroke="#1d4ed8"/><rect x="82" y="56" width="16" height="16" rx="2" fill="#fff" opacity="0.5"/>`;
  }
}

/**
 * @param {{ id?: string, productKey?: string, title?: string, categoryId?: string, category?: string }} opts
 * @returns {string} data:image/svg+xml URI
 */
export function productVisualDataUri(opts = {}) {
  const key = String(opts.id || opts.productKey || opts.title || 'product').slice(0, 80);
  const title = String(opts.title || 'Product').slice(0, 36);
  const cat = opts.categoryId || opts.category || '';
  const h = fnv1a(key + '|' + title);
  const hue = h % 360;
  const hue2 = (hue + 47 + (h % 50)) % 360;
  const sat = 38 + (h % 28);
  const light = 86 - (h % 14);
  const bg1 = `hsl(${hue},${sat}%,${light}%)`;
  const bg2 = `hsl(${hue2},${Math.min(52, sat + 12)}%,${Math.max(68, light - 10)}%)`;
  const g = glyphSvg(glyphType(cat, title, key), h);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="160" viewBox="0 0 180 160">
<defs>
  <linearGradient id="pvbg" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style="stop-color:${bg1}"/><stop offset="100%" style="stop-color:${bg2}"/>
  </linearGradient>
  <filter id="pvsh"><feDropShadow dx="1" dy="2" stdDeviation="1.2" flood-opacity=".28"/></filter>
</defs>
<rect width="180" height="160" fill="url(#pvbg)"/>
<rect x="10" y="10" width="160" height="108" rx="5" fill="#fafafa" stroke="#555" stroke-width="2" filter="url(#pvsh)"/>
${g}
<text x="90" y="138" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="8.5" fill="#111">${escXml(title)}</text>
<text x="90" y="152" text-anchor="middle" font-family="Tahoma,Arial,sans-serif" font-size="7" fill="#555">CorpOS Trade Visual™</text>
</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * CSS background value: prefer small data URI; optional gradient swatch string fallback.
 * @param {{ id?: string, title?: string, categoryId?: string, swatch?: string }} p
 */
export function productVisualBackgroundOrSwatch(p) {
  if (!p) return '#dde6ff';
  try {
    return `url("${productVisualDataUri({
      id: p.id,
      title: p.title,
      categoryId: p.categoryId
    })}") center/cover no-repeat`;
  } catch {
    return p.swatch || '#dde6ff';
  }
}
