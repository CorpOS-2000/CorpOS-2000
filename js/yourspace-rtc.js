/**
 * Modular Real-Time Chat lines for yourspace.net (parody brands + life + CorpOS lore).
 */

/** @type {object | null} */
let fragments = null;
/** @type {{ brands: object[] } | null} */
let brandsPayload = null;

/**
 * @param {(name: string) => Promise<unknown>} loadJson
 */
export async function initYourspaceRtc(loadJson) {
  if (typeof loadJson !== 'function') return;
  try {
    const rawF = await loadJson('yourspace-rtc-fragments.json');
    fragments = typeof rawF === 'string' ? JSON.parse(rawF) : rawF;
  } catch {
    fragments = null;
  }
  try {
    const rawB = await loadJson('parody-brands.json');
    brandsPayload = typeof rawB === 'string' ? JSON.parse(rawB) : rawB;
  } catch {
    brandsPayload = null;
  }
  if (!fragments || typeof fragments !== 'object') {
    fragments = { openers: [], middles_brand: [], middles_life: [], closers: [] };
  }
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rng, arr) {
  if (!arr?.length) return '';
  return arr[Math.floor(rng() * arr.length)];
}

function subTemplates(s, vars) {
  let o = String(s || '');
  for (const [k, v] of Object.entries(vars || {})) {
    o = o.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return o;
}

/**
 * @param {{ seed: number, authorDisplay: string }} opts
 */
export function generateYourspaceRtcPost(opts) {
  const seed = Number(opts?.seed) || 1;
  const rng = mulberry32(seed >>> 0);
  const brands = brandsPayload?.brands || [];
  const brand = brands.length ? brands[Math.floor(rng() * brands.length)] : { name: 'Buttertoes Labs', offerings: [] };
  const off = brand.offerings?.length
    ? brand.offerings[Math.floor(rng() * brand.offerings.length)]
    : { name: 'Giant Value Bar' };
  const product = off?.name || 'snack unit';

  const useLife = rng() < 0.38;
  const op = pick(rng, fragments.openers) || 'Anyway,';
  const mid = useLife
    ? pick(rng, fragments.middles_life) || 'living off ramen and Regulation 12b hopes.'
    : pick(rng, fragments.middles_brand) || '{brand} changed my whole week.';
  const cl = pick(rng, fragments.closers) || '— YourSpace out.';
  const midF = subTemplates(mid, { brand: brand.name, product });

  let sentence = [op, midF, cl].join(' ').replace(/\s+/g, ' ').trim();
  if (opts?.authorDisplay && rng() < 0.22) {
    sentence = `${opts.authorDisplay.split(' ')[0]} says: ${sentence}`;
  }
  return sentence;
}
