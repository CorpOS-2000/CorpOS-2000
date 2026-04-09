function weightedPick(defs) {
  const total = defs.reduce((s, d) => s + Number(d.weight || 0), 0);
  if (total <= 0) return defs[Math.floor(Math.random() * defs.length)] || null;
  let r = Math.random() * total;
  for (const d of defs) {
    r -= Number(d.weight || 0);
    if (r <= 0) return d;
  }
  return defs[defs.length - 1] || null;
}

export const TagletEngine = {
  _definitions: [],
  _getActorById: () => null,

  setDefinitions(defs) {
    this._definitions = Array.isArray(defs) ? defs : [];
  },

  setActorGetter(getter) {
    if (typeof getter === 'function') this._getActorById = getter;
  },

  assign(actorRecord, count = 2) {
    const assigned = new Set(actorRecord.taglets || []);
    const pool = this._definitions.slice();
    while (assigned.size < count && pool.length > 0) {
      const pick = weightedPick(pool);
      if (!pick) break;
      const hasConflict = [...assigned].some((tagId) => (pick.conflicts_with || []).includes(tagId));
      if (!hasConflict) assigned.add(pick.taglet_id);
      const idx = pool.findIndex((x) => x.taglet_id === pick.taglet_id);
      if (idx >= 0) pool.splice(idx, 1);
    }
    actorRecord.taglets = [...assigned];
    return actorRecord.taglets;
  },

  resolve(actorId, context) {
    const actor = this._getActorById(actorId);
    if (!actor) return null;
    const defs = (actor.taglets || [])
      .map((id) => this._definitions.find((d) => d.taglet_id === id))
      .filter(Boolean);
    const behavior = defs.map((d) => d.platform_behavior?.[context]).filter(Boolean);
    const tone = defs.map((d) => d.tone_modifier).filter(Boolean);
    return {
      actor_id: actorId,
      context,
      behavior: behavior.join(', ') || 'neutral_activity',
      tone: tone.join(', ') || 'neutral'
    };
  },

  getContentTendency(actorId) {
    const actor = this._getActorById(actorId);
    if (!actor) return '';
    return (actor.taglets || [])
      .map((id) => this._definitions.find((d) => d.taglet_id === id)?.content_tendency)
      .filter(Boolean)
      .join('; ');
  },

  getOpinionModifiers(actorId) {
    const actor = this._getActorById(actorId);
    const out = { player: 0, government: 0, corpos: 0, rapidemart: 0, corporations_general: 0 };
    if (!actor) return out;
    for (const tagId of actor.taglets || []) {
      const mods = this._definitions.find((d) => d.taglet_id === tagId)?.opinion_modifiers || {};
      for (const [k, v] of Object.entries(mods)) {
        out[k] = (out[k] || 0) + Number(v || 0);
      }
    }
    return out;
  }
};

