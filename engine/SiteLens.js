const DEFAULT_LENS_DEFINITIONS = {
  social: {
    fields: ['actor_id', 'public_profile', 'aliases', 'relationships', 'taglets', 'social_weight', 'opinion_profile'],
    alias_mode: 'display_name',
    relationship_depth: 1
  },
  forum: {
    fields: ['actor_id', 'aliases', 'taglets', 'activity_schedule'],
    alias_mode: 'alias',
    relationship_depth: 0
  },
  news: {
    fields: ['actor_id', 'public_profile', 'profession', 'employer_id', 'reputation', 'memory'],
    alias_mode: 'display_name',
    relationship_depth: 0
  },
  email: {
    fields: ['actor_id', 'full_legal_name', 'emails', 'public_profile'],
    alias_mode: 'full_legal_name',
    relationship_depth: 0
  },
  corporate: {
    fields: ['actor_id', 'full_legal_name', 'profession', 'employer_id', 'public_profile'],
    alias_mode: 'full_legal_name',
    relationship_depth: 1
  },
  anonymous: {
    fields: ['actor_id', 'aliases', 'taglets'],
    alias_mode: 'alias',
    relationship_depth: 0,
    mask_actor_id: true
  },
  banking: {
    fields: ['actor_id', 'full_legal_name', 'ssn', 'phone_numbers', 'emails', 'home_address', 'dob', 'age', 'profession', 'employer_id', 'lifestyle_tier'],
    alias_mode: 'full_legal_name',
    relationship_depth: 0
  },
  government: {
    fields: '*',
    alias_mode: 'full_legal_name',
    relationship_depth: 2
  }
};

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function pickFields(actorRecord, fields) {
  if (fields === '*') return deepClone(actorRecord);
  const out = {};
  for (const key of fields || []) {
    if (Object.prototype.hasOwnProperty.call(actorRecord, key)) {
      out[key] = deepClone(actorRecord[key]);
    }
  }
  return out;
}

export const SiteLens = {
  definitions: deepClone(DEFAULT_LENS_DEFINITIONS),

  setDefinitions(defs) {
    if (defs && typeof defs === 'object' && !Array.isArray(defs)) {
      this.definitions = deepClone(defs);
    }
  },

  getDefinition(lensType) {
    return this.definitions[lensType] || this.definitions.social;
  },

  apply(actorRecord, lensType = 'social') {
    if (!actorRecord || typeof actorRecord !== 'object') return null;
    const lens = this.getDefinition(lensType);
    const copy = pickFields(actorRecord, lens.fields);
    const aliasMode = lens.alias_mode || 'display_name';
    if (!copy.public_profile || typeof copy.public_profile !== 'object') {
      copy.public_profile = {};
    }
    if (aliasMode === 'display_name') {
      copy.public_profile.display_name =
        actorRecord.public_profile?.display_name || actorRecord.full_legal_name || '';
    } else if (aliasMode === 'full_legal_name') {
      copy.public_profile.display_name = actorRecord.full_legal_name || '';
    } else if (aliasMode === 'alias') {
      copy.public_profile.display_name = actorRecord.aliases?.[0] || actorRecord.actor_id || '';
    }
    if (lens.mask_actor_id && copy.actor_id) {
      copy.actor_id = `MASK-${String(copy.actor_id).slice(-4)}`;
    }
    const depth = Number(lens.relationship_depth || 0);
    if (depth === 0 && Array.isArray(copy.relationships)) {
      delete copy.relationships;
    } else if (depth > 0 && Array.isArray(copy.relationships)) {
      copy.relationships = copy.relationships.slice(0, 12);
    }
    return copy;
  }
};

