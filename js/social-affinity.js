/**
 * Session-only viewer → target scores (actors or MyTube channel keys).
 * Used for how "warm" the player feels toward someone after likes/comments.
 */

/** @param {string} s */
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 48);
}

/** @param {{ actorId?: string, channel?: string }} ref */
export function affinityTargetKey(ref) {
  if (ref?.actorId) return `actor:${ref.actorId}`;
  const ch = ref?.channel;
  if (ch) return `npc:${slug(ch)}`;
  return '';
}

/** Display-name NPCs (MyTube / comments) — stable key per parody name. */
export function affinityNpcNameKey(displayName) {
  const s = slug(displayName);
  return s ? `npc:${s}` : '';
}

/**
 * @param {(fn: (d: object) => void) => void} patchSession
 * @param {string} viewerKey wahoo username or 'guest'
 * @param {string} targetKey from affinityTargetKey
 * @param {number} delta
 */
export function applyAffinityDelta(patchSession, viewerKey, targetKey, delta) {
  if (!targetKey || !delta) return;
  const v = String(viewerKey || 'guest').trim() || 'guest';
  patchSession((s) => {
    if (!s.socialAffinity) s.socialAffinity = {};
    if (!s.socialAffinity[v]) s.socialAffinity[v] = {};
    const cur = Number(s.socialAffinity[v][targetKey]) || 0;
    s.socialAffinity[v][targetKey] = Math.max(-999, Math.min(999, cur + delta));
  });
}

/**
 * @param {object} session
 * @param {string} viewerKey
 * @param {string} targetKey
 */
export function getAffinityScore(session, viewerKey, targetKey) {
  const v = String(viewerKey || 'guest').trim() || 'guest';
  return Number(session?.socialAffinity?.[v]?.[targetKey]) || 0;
}

/** @param {number} score */
export function affinityLabel(score) {
  if (score >= 12) return { label: 'Huge fan', tone: 'hot' };
  if (score >= 5) return { label: 'Friendly', tone: 'warm' };
  if (score <= -12) return { label: 'Blocked energy', tone: 'cold' };
  if (score <= -5) return { label: 'Side-eye', tone: 'cool' };
  return { label: 'Neutral', tone: 'mid' };
}
