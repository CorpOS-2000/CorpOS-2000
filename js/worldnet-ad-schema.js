/** WorldNet ad schema — historically accurate 1999-2000 size, placement, and page layout rules. */

export const AD_SIZES = Object.freeze({
  FULL_BANNER: {
    id: 'full_banner',
    label: 'Full Banner',
    width: 468,
    height: 60,
    era: 'primary-2000',
    placement: ['below-header', 'above-footer', 'content-break'],
    notes: 'The standard banner of 1996-2001.'
  },
  HALF_BANNER: {
    id: 'half_banner',
    label: 'Half Banner',
    width: 234,
    height: 60,
    era: 'primary-2000',
    placement: ['above-footer', 'content-break', 'paired-half-banners'],
    notes: 'Frequently sold in pairs.'
  },
  VERTICAL_BANNER: {
    id: 'vertical_banner',
    label: 'Vertical Banner',
    width: 120,
    height: 240,
    era: 'primary-2000',
    placement: ['right-rail', 'left-rail'],
    notes: 'Dominant sidebar format in 2000.'
  },
  BUTTON_1: {
    id: 'button_1',
    label: 'Button 1',
    width: 120,
    height: 90,
    era: 'primary-2000',
    placement: ['right-rail', 'left-rail', 'content-sidebar'],
    notes: 'Stacked in sidebar rails.'
  },
  BUTTON_2: {
    id: 'button_2',
    label: 'Button 2',
    width: 120,
    height: 60,
    era: 'primary-2000',
    placement: ['right-rail', 'content-sidebar'],
    notes: 'Slim button unit.'
  },
  SQUARE_BUTTON: {
    id: 'square_button',
    label: 'Square Button',
    width: 125,
    height: 125,
    era: 'primary-2000',
    placement: ['right-rail', 'content-sidebar', 'footer-badges'],
    notes: 'Common on portal and news pages.'
  },
  MICRO_BUTTON: {
    id: 'micro_button',
    label: 'Micro Button',
    width: 88,
    height: 31,
    era: 'primary-2000',
    placement: ['footer-badges', 'right-rail', 'content-sidebar'],
    notes: 'Link exchange / browser badge standard.'
  },
  RECTANGLE: {
    id: 'rectangle',
    label: 'Rectangle',
    width: 180,
    height: 150,
    era: 'secondary-2000',
    placement: ['content-sidebar', 'right-rail'],
    notes: 'Mid-size rectangle.'
  },
  SQUARE_POPUP: {
    id: 'square_popup',
    label: 'Square (Inline)',
    width: 250,
    height: 250,
    era: 'secondary-2000',
    placement: ['content-sidebar', 'right-rail'],
    notes: 'Inline content square.'
  },
  RECTANGLE_3x1: {
    id: 'rectangle_3x1',
    label: '3:1 Rectangle',
    width: 300,
    height: 100,
    era: 'secondary-2000',
    placement: ['below-header', 'content-break'],
    notes: 'Short content strip.'
  }
});

const SIZE_BY_ID = Object.freeze(
  Object.fromEntries(Object.values(AD_SIZES).map((x) => [x.id, x]))
);

export const AD_PLACEMENTS = Object.freeze({
  'below-header': {
    label: 'Below Header',
    description: 'Directly below site logo and navigation.',
    compatible_sizes: ['full_banner', 'rectangle_3x1'],
    primary_size: 'full_banner',
    css_position: 'width:468px;margin:4px auto;display:block;',
    container: 'centered horizontal strip below nav'
  },
  'right-rail': {
    label: 'Right Rail',
    description: 'Vertical right-side stack.',
    compatible_sizes: ['vertical_banner', 'button_1', 'button_2', 'square_button', 'rectangle', 'micro_button'],
    primary_size: 'vertical_banner',
    css_position: 'max-width:126px;width:120px;margin:0 auto;display:block;',
    container: 'right column stacked vertically'
  },
  'left-rail': {
    label: 'Left Rail',
    description: 'Left-side auxiliary stack.',
    compatible_sizes: ['vertical_banner', 'button_1', 'square_button'],
    primary_size: 'button_1',
    css_position: 'max-width:126px;width:120px;margin:0 auto;display:block;',
    container: 'left column below navigation'
  },
  'content-break': {
    label: 'Content Break',
    description: 'Horizontal ad between sections.',
    compatible_sizes: ['full_banner', 'half_banner', 'rectangle_3x1'],
    primary_size: 'full_banner',
    css_position: 'display:block;margin:8px auto;clear:both;',
    container: 'centered strip between sections'
  },
  'paired-half-banners': {
    label: 'Paired Half Banners',
    description: 'Two half banners side by side.',
    compatible_sizes: ['half_banner'],
    primary_size: 'half_banner',
    css_position: 'display:flex;gap:4px;justify-content:center;margin:4px 0;',
    container: 'horizontal pair'
  },
  'above-footer': {
    label: 'Above Footer',
    description: 'Strip placed above the footer.',
    compatible_sizes: ['full_banner', 'half_banner'],
    primary_size: 'full_banner',
    css_position: 'display:block;margin:8px auto;clear:both;',
    container: 'centered strip above footer'
  },
  'footer-badges': {
    label: 'Footer Badge Row',
    description: 'Cluster of 88x31 badges at page bottom.',
    compatible_sizes: ['micro_button'],
    primary_size: 'micro_button',
    css_position: 'display:flex;flex-wrap:wrap;gap:2px;justify-content:center;padding:4px;',
    container: 'horizontal row at page bottom'
  },
  'content-sidebar': {
    label: 'Content Sidebar',
    description: 'Floated unit inside article or content body.',
    compatible_sizes: ['button_1', 'square_button', 'square_popup', 'rectangle'],
    primary_size: 'square_button',
    css_position: 'float:right;margin:0 0 8px 10px;',
    container: 'floated within content'
  }
});

const PLACEMENT_BY_ID = AD_PLACEMENTS;

export const AD_RENDER_RULES = Object.freeze({
  container_styles: {
    border: '1px solid #000080',
    backgroundColor: '#ffffff',
    display: 'inline-block',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'pointer',
    borderRadius: '0'
  },
  label_rules: {
    text: 'advertisement',
    fontSize: '9px',
    color: '#888888',
    textAlign: 'center',
    display: 'block',
    marginBottom: '1px',
    fontFamily: 'Arial, sans-serif',
    letterSpacing: '0.5px'
  },
  gif_rules: {
    imageRendering: 'pixelated',
    maxWidth: '100%',
    display: 'block'
  },
  css_animation_rules: {
    typical_patterns: ['CLICK HERE!', 'FREE OFFER!', 'LIMITED TIME!', 'ACT NOW!', 'YOU WON!']
  },
  right_rail_stacking: {
    gap: '6px',
    separatorColor: '#cccccc',
    separatorHeight: '1px',
    maxWidth: '120px'
  },
  footer_badge_cluster: {
    gap: '2px',
    padding: '4px 8px',
    backgroundColor: '#f0f0f0',
    borderTop: '1px solid #cccccc',
    showLabel: false
  }
});

export const PAGE_LAYOUT_TEMPLATES = Object.freeze({
  portal: {
    label: 'Portal / Search',
    slots: [
      { slotId: 'below-header', placement: 'below-header', size: 'full_banner', required: true },
      { slotId: 'right-rail-primary', placement: 'right-rail', size: 'vertical_banner', required: true },
      { slotId: 'right-rail-secondary', placement: 'right-rail', size: 'button_1', required: false },
      { slotId: 'right-rail-tertiary', placement: 'right-rail', size: 'button_1', required: false },
      { slotId: 'content-break', placement: 'content-break', size: 'full_banner', required: false },
      { slotId: 'above-footer', placement: 'above-footer', size: 'full_banner', required: false },
      { slotId: 'footer-badges-1', placement: 'footer-badges', size: 'micro_button', required: true },
      { slotId: 'footer-badges-2', placement: 'footer-badges', size: 'micro_button', required: true },
      { slotId: 'footer-badges-3', placement: 'footer-badges', size: 'micro_button', required: true },
      { slotId: 'footer-badges-4', placement: 'footer-badges', size: 'micro_button', required: true },
      { slotId: 'footer-badges-5', placement: 'footer-badges', size: 'micro_button', required: true },
      { slotId: 'footer-badges-6', placement: 'footer-badges', size: 'micro_button', required: true }
    ],
    layout: 'table-based three-column'
  },
  news: {
    label: 'News / Editorial',
    slots: [
      { slotId: 'below-header', placement: 'below-header', size: 'full_banner', required: true },
      { slotId: 'right-rail-primary', placement: 'right-rail', size: 'vertical_banner', required: true },
      { slotId: 'right-rail-secondary', placement: 'right-rail', size: 'button_1', required: false },
      { slotId: 'content-break', placement: 'content-break', size: 'full_banner', required: false },
      { slotId: 'content-sidebar', placement: 'content-sidebar', size: 'square_button', required: false },
      { slotId: 'footer-badges-1', placement: 'footer-badges', size: 'micro_button', required: false },
      { slotId: 'footer-badges-2', placement: 'footer-badges', size: 'micro_button', required: false },
      { slotId: 'footer-badges-3', placement: 'footer-badges', size: 'micro_button', required: false },
      { slotId: 'footer-badges-4', placement: 'footer-badges', size: 'micro_button', required: false }
    ],
    layout: 'two-column'
  },
  commerce: {
    label: 'E-Commerce',
    slots: [
      { slotId: 'below-header', placement: 'below-header', size: 'full_banner', required: true },
      { slotId: 'right-rail-primary', placement: 'right-rail', size: 'button_1', required: true },
      { slotId: 'right-rail-secondary', placement: 'right-rail', size: 'button_1', required: false },
      { slotId: 'paired-half-banners-left', placement: 'paired-half-banners', size: 'half_banner', required: false },
      { slotId: 'paired-half-banners-right', placement: 'paired-half-banners', size: 'half_banner', required: false },
      { slotId: 'footer-badges-1', placement: 'footer-badges', size: 'micro_button', required: false },
      { slotId: 'footer-badges-2', placement: 'footer-badges', size: 'micro_button', required: false },
      { slotId: 'footer-badges-3', placement: 'footer-badges', size: 'micro_button', required: false }
    ],
    layout: 'two-column'
  },
  banking: {
    label: 'Banking / Finance',
    slots: [
      { slotId: 'below-header', placement: 'below-header', size: 'full_banner', required: false },
      { slotId: 'right-rail-primary', placement: 'right-rail', size: 'button_1', required: true },
      { slotId: 'above-footer', placement: 'above-footer', size: 'half_banner', required: false }
    ],
    layout: 'two-column'
  },
  government: {
    label: 'Government / Institutional',
    slots: [{ slotId: 'below-header', placement: 'below-header', size: 'full_banner', required: false }],
    layout: 'single-column'
  },
  email: {
    label: 'Web Email',
    slots: [
      { slotId: 'below-header', placement: 'below-header', size: 'full_banner', required: true },
      { slotId: 'right-rail-primary', placement: 'right-rail', size: 'vertical_banner', required: true },
      { slotId: 'right-rail-secondary', placement: 'right-rail', size: 'square_button', required: false },
      { slotId: 'above-footer', placement: 'above-footer', size: 'full_banner', required: false }
    ],
    layout: 'mail three-column'
  },
  dark: {
    label: 'Dark / Anonymous',
    slots: [],
    layout: 'terminal single-column'
  }
});

const TEMPLATE_BY_ID = PAGE_LAYOUT_TEMPLATES;

const LEGACY_PLACEMENT_ALIASES = Object.freeze({
  'banner-top': 'below-header',
  'banner-bottom': 'above-footer',
  'sidebar-right': 'right-rail',
  'sidebar-left': 'left-rail',
  inline: 'content-break',
  'inline-product': 'content-break'
});

export function listAdSizes() {
  return Object.values(AD_SIZES);
}

export function listAdPlacements() {
  return Object.entries(AD_PLACEMENTS).map(([id, v]) => ({ id, ...v }));
}

export function listPageLayoutTemplates() {
  return Object.entries(PAGE_LAYOUT_TEMPLATES).map(([id, v]) => ({ id, ...v }));
}

export function getAdSizeById(id) {
  return SIZE_BY_ID[String(id || '').toLowerCase()] || null;
}

export function normalizePlacementId(raw) {
  const id = String(raw || '').trim().toLowerCase();
  return LEGACY_PLACEMENT_ALIASES[id] || id;
}

export function getAdPlacementById(id) {
  return PLACEMENT_BY_ID[normalizePlacementId(id)] || null;
}

export function getPageLayoutTemplate(templateId) {
  return TEMPLATE_BY_ID[String(templateId || '').trim().toLowerCase()] || null;
}

export function getCompatibleSizeIdsForPlacement(placementId) {
  return getAdPlacementById(placementId)?.compatible_sizes || [];
}

export function isPlacementCompatibleWithSize(placementId, sizeId) {
  const placement = getAdPlacementById(placementId);
  return !!placement && placement.compatible_sizes.includes(String(sizeId || '').toLowerCase());
}

export function deriveTemplateSlots(templateId) {
  return [...(getPageLayoutTemplate(templateId)?.slots || [])];
}

export function normalizeAdConfig(ad) {
  if (!ad || typeof ad !== 'object') return null;
  const sizeId = ad.size ? String(ad.size).toLowerCase() : '';
  const sizeDef = getAdSizeById(sizeId);
  const placementId = normalizePlacementId(ad.placement || ad.region || '');
  const next = { ...ad };
  if (sizeDef) {
    next.size = sizeDef.id;
    if (next.width == null) next.width = sizeDef.width;
    if (next.height == null) next.height = sizeDef.height;
  }
  if (placementId) next.placement = placementId;
  return next;
}

export function validateAdConfig(ad) {
  const errors = [];
  const normalized = normalizeAdConfig(ad) || {};
  if (!normalized.id) errors.push('Ad missing id');
  if (normalized.size && !getAdSizeById(normalized.size)) {
    errors.push(`Unknown ad size: ${normalized.size}`);
  }
  if (normalized.placement && !getAdPlacementById(normalized.placement)) {
    errors.push(`Unknown ad placement: ${normalized.placement}`);
  }
  if (
    normalized.placement &&
    normalized.size &&
    !isPlacementCompatibleWithSize(normalized.placement, normalized.size)
  ) {
    errors.push(`Placement ${normalized.placement} is incompatible with size ${normalized.size}`);
  }
  return { errors, normalized };
}

export function layoutTemplateForCategory(category) {
  const c = String(category || '').toLowerCase();
  if (c === 'search' || c === 'portal' || c === 'corporate') return 'portal';
  if (c === 'news') return 'news';
  if (c === 'shopping' || c === 'commerce') return 'commerce';
  if (c === 'banking' || c === 'finance') return 'banking';
  if (c === 'government') return 'government';
  if (c === 'email') return 'email';
  if (c === 'dark-web' || c === 'dark') return 'dark';
  return 'portal';
}
