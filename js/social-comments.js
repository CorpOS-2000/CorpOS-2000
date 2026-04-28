/**
 * Modular combinatorial social comments — no network, no AI.
 * Feeds on JSON fragments + optional ActorDB display names and taglet tone hints.
 */

/** @type {object | null} */
let fragments = null;

/** Player/NPC composer personalities map to existing tone styling. */
const FORCED_PERSONALITY_TONES = Object.freeze({
  casual: 'casual_speaker',
  ranter: 'aggressive_poster',
  expert: 'formal_speaker',
  troll: 'chaos_agent',
  supporter: 'optimistic_voice',
  worried: 'anxious_poster',
  skeptic: 'contrarian',
  corporate: 'corporate_speak',
  deadpan: 'dry_wit',
  hype: 'hype_poster'
});

/** Player-facing voice keys for UIs (MyTube, Review Bomber, pipeline composer). */
export const SOCIAL_COMMENT_VOICE_KEYS = Object.freeze([
  'casual',
  'ranter',
  'expert',
  'troll',
  'supporter',
  'worried',
  'skeptic',
  'corporate',
  'deadpan',
  'hype'
]);

const TONE_TAGLETS = new Set([
  'formal_speaker',
  'casual_speaker',
  'aggressive_poster',
  'dry_wit',
  'anxious_poster',
  'corporate_speak',
  'paranoid_poster',
  'optimistic_voice',
  'contrarian',
  'chaos_agent'
]);

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

function displayNameFromActor(actor) {
  if (!actor) return '';
  const pub = actor.public_profile?.display_name;
  if (pub && String(pub).trim()) return shortHandle(pub);
  const full = actor.full_legal_name;
  if (full && String(full).trim()) {
    const parts = String(full).trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    return `${parts[0]} ${last.slice(0, 1)}.`;
  }
  const alias = (actor.aliases || [])[0];
  if (alias) return shortHandle(alias);
  return '';
}

function shortHandle(s) {
  const t = String(s).trim();
  if (t.length <= 18) return t;
  return `${t.slice(0, 16)}…`;
}

function randomActorDisplayName(rng) {
  try {
    const raw = typeof window !== 'undefined' && window.ActorDB?.getAllRaw?.();
    const list = Array.isArray(raw) ? raw.filter((a) => a?.active !== false && a?.actor_id) : [];
    if (!list.length) return null;
    const a = list[Math.floor(rng() * list.length)];
    return displayNameFromActor(a) || null;
  } catch {
    return null;
  }
}

/** @param {string[]} taglets */
function firstToneTaglet(taglets) {
  for (const t of taglets || []) {
    if (TONE_TAGLETS.has(t)) return t;
  }
  return null;
}

/** @param {string} sentence
 * @param {string | null} tone
 * @param {() => number} rng */
function applyToneStyle(sentence, tone, rng) {
  let s = sentence;
  if (!tone) return s;
  switch (tone) {
    case 'aggressive_poster':
      return s.toUpperCase().replace(/\.$/, '') + '!';
    case 'casual_speaker':
      return s.charAt(0).toLowerCase() + s.slice(1);
    case 'formal_speaker':
      if (!/[.!?]$/.test(s)) s += '.';
      return s;
    case 'anxious_poster':
      return rng() < 0.5 ? `I think ${s.charAt(0).toLowerCase() + s.slice(1)}` : `Maybe ${s.charAt(0).toLowerCase() + s.slice(1)}`;
    case 'paranoid_poster':
      return `They say ${s.charAt(0).toLowerCase() + s.slice(1)}`;
    case 'optimistic_voice':
      return s.endsWith('.') ? s.slice(0, -1) + ' — honestly a good sign.' : `${s} Not bad at all.`;
    case 'contrarian':
      return rng() < 0.6 ? `Actually, ${s.charAt(0).toLowerCase() + s.slice(1)}` : s;
    case 'dry_wit':
      return s.endsWith('.') ? s : `${s}. Obviously.`;
    case 'corporate_speak':
      return `Going forward, ${s.charAt(0).toLowerCase() + s.slice(1)}`;
    case 'chaos_agent':
      return rng() < 0.5 ? s : `${s} (or not.)`;
    case 'hype_poster':
      return rng() < 0.45
        ? (s.endsWith('.') ? `${s.slice(0, -1)} — huge if true.` : `${s} Huge if true.`)
        : (s.endsWith('.') ? `${s.slice(0, -1)}. We're so back.` : `${s} We're so back.`);
    default:
      return s;
  }
}

/**
 * @param {(name: string) => Promise<unknown>} [loadJson] returns text or parsed object
 */
export async function initSocialComments(loadJson) {
  if (fragments) return;
  try {
    if (loadJson) {
      const raw = await loadJson('social-comment-fragments.json');
      fragments = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  } catch {
    fragments = null;
  }
  if (!fragments || typeof fragments !== 'object') {
    fragments = {
      openers: [],
      middles_snack: [],
      closers_snack: [],
      middles_generic: [],
      closers_generic: [],
      middles_buttertoes: [],
      closers_buttertoes: [],
      handles_fallback: []
    };
  }
  if (typeof window !== 'undefined') {
    window.WorldNet = { ...(window.WorldNet || {}), socialComments: { generateSocialComment } };
  }
}

/**
 * @param {{
 *   flavor?: 'snack' | 'generic' | 'auto',
 *   context?: 'buttertoes' | 'snack' | 'generic' | 'auto',
 *   seed: number,
 *   actor_id?: string,
 *   forcedPersonality?: string,
 *   personality?: string
 * }} opts
 */
export function generateSocialComment(opts) {
  const seed = Number(opts?.seed) || 1;
  const rng = mulberry32(seed >>> 0);
  const ctx = opts?.context === 'buttertoes' ? 'buttertoes' : opts?.context === 'snack' ? 'snack' : opts?.context === 'generic' ? 'generic' : 'auto';

  const flavor =
    opts?.flavor === 'snack' || opts?.flavor === 'generic'
      ? opts?.flavor
      : rng() < 0.45
        ? 'snack'
        : 'generic';

  const op = pick(rng, fragments.openers);
  let mid = '';
  let cl = '';

  if (ctx === 'buttertoes') {
    mid =
      pick(rng, fragments.middles_buttertoes) ||
      pick(rng, fragments.middles_snack) ||
      loadPairFallback(rng, flavor).mid;
    cl =
      pick(rng, fragments.closers_buttertoes) ||
      pick(rng, fragments.closers_snack) ||
      loadPairFallback(rng, flavor).cl;
  } else {
    const pair = loadPairFallback(rng, flavor);
    mid = pair.mid;
    cl = pair.cl;
  }

  let sentence = [op, mid, cl].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const forcedRaw = opts?.forcedPersonality ?? opts?.personality;
  const forcedKey =
    forcedRaw != null && String(forcedRaw).trim()
      ? String(forcedRaw).trim().toLowerCase()
      : '';

  let tone = null;
  if (forcedKey && FORCED_PERSONALITY_TONES[forcedKey]) {
    tone = FORCED_PERSONALITY_TONES[forcedKey];
    sentence = applyToneStyle(sentence, tone, rng);
  } else if (opts?.actor_id && typeof window !== 'undefined' && window.ActorDB?.getRaw) {
    const rawAct = window.ActorDB.getRaw(opts.actor_id);
    tone = firstToneTaglet(rawAct?.taglets);
    sentence = applyToneStyle(sentence, tone, rng);
  }

  if (
    opts?.aboutPlayer &&
    opts?.actor_id &&
    typeof window !== 'undefined' &&
    window.AXIS?.getTier
  ) {
    const tier = window.AXIS.getTier(opts.actor_id);
    const label = tier?.label || '';
    if (label === 'Hostile' || label === 'Enemy') {
      tone = 'aggressive_poster';
      sentence = applyToneStyle(sentence, tone, rng);
    } else if (label === 'Trusted Ally' || label === 'Favorable' || label === 'Acquainted') {
      tone = 'optimistic_voice';
      sentence = applyToneStyle(sentence, tone, rng);
    } else if (label === 'Cool') {
      if (rng() < 0.7) {
        tone = 'contrarian';
        sentence = applyToneStyle(sentence, tone, rng);
      }
    }
  }

  let author = '';
  if (opts?.actor_id && typeof window !== 'undefined' && window.ActorDB?.getRaw) {
    author = displayNameFromActor(window.ActorDB.getRaw(opts.actor_id));
  }
  if (!author) {
    const fromDb = randomActorDisplayName(rng);
    author =
      fromDb ||
      pick(rng, fragments.handles_fallback) ||
      pick(rng, fragments.openers) ||
      'Guest';
  }

  return { author, text: sentence, flavor, tone: tone || undefined };
}

function loadPairFallback(rng, flavor) {
  if (flavor === 'snack') {
    return {
      mid:
        pick(rng, fragments.middles_snack) ||
        pick(rng, fragments.middles_generic) ||
        pick(rng, fragments.middles_buttertoes),
      cl:
        pick(rng, fragments.closers_snack) ||
        pick(rng, fragments.closers_generic) ||
        pick(rng, fragments.closers_buttertoes)
    };
  }
  return {
    mid:
      pick(rng, fragments.middles_generic) ||
      pick(rng, fragments.middles_snack) ||
      pick(rng, fragments.middles_buttertoes),
    cl:
      pick(rng, fragments.closers_generic) ||
      pick(rng, fragments.closers_snack) ||
      pick(rng, fragments.closers_buttertoes)
  };
}
