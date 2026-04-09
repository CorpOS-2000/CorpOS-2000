const REQUIRED_FIELDS = [
  'actor_id',
  'full_legal_name',
  'first_name',
  'last_name',
  'aliases',
  'ssn',
  'phone_numbers',
  'emails',
  'home_address',
  'dob',
  'age',
  'household_id',
  'employer_id',
  'profession',
  'lifestyle_tier',
  'taglets',
  'social_weight',
  'opinion_profile',
  'relationships',
  'current_state',
  'memory',
  'activity_schedule',
  'site_visibility',
  'public_profile',
  'private_profile',
  'role',
  'investigator_tier',
  'is_player',
  'is_key_character',
  'created_at'
];

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export const Validator = {
  _ctx: {
    getActors: () => [],
    getProfessionTiers: () => [],
    getTagletDefinitions: () => [],
    getHouseholds: () => []
  },

  setContext(ctx = {}) {
    this._ctx = { ...this._ctx, ...ctx };
  },

  runFull() {
    const actors = this._ctx.getActors();
    const errors = [];
    const warnings = [];
    const actorIds = new Set();
    for (const actor of actors) {
      for (const key of REQUIRED_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(actor, key)) {
          errors.push(`${actor.actor_id || 'unknown'} missing required field: ${key}`);
        }
      }
      if (actorIds.has(actor.actor_id)) errors.push(`duplicate actor_id: ${actor.actor_id}`);
      actorIds.add(actor.actor_id);
      if (!isObj(actor.home_address)) errors.push(`${actor.actor_id} has invalid home_address`);
      if (!isObj(actor.opinion_profile)) errors.push(`${actor.actor_id} has invalid opinion_profile`);
      if (!Array.isArray(actor.relationships)) errors.push(`${actor.actor_id} has invalid relationships`);
      if (!Array.isArray(actor.phone_numbers)) errors.push(`${actor.actor_id} has invalid phone_numbers`);
      if (!Array.isArray(actor.emails)) errors.push(`${actor.actor_id} has invalid emails`);
      const logic = this.checkLogicalConsistency(actor);
      warnings.push(...logic.warnings.map((w) => `${actor.actor_id}: ${w}`));
      errors.push(...logic.errors.map((e) => `${actor.actor_id}: ${e}`));
    }
    const uniqFields = ['ssn'];
    for (const field of uniqFields) {
      const seen = new Set();
      for (const actor of actors) {
        const value = actor[field];
        if (!value) continue;
        if (seen.has(value)) errors.push(`duplicate ${field}: ${value}`);
        seen.add(value);
      }
    }
    for (const field of ['phone_numbers', 'emails']) {
      const seen = new Set();
      for (const actor of actors) {
        for (const value of actor[field] || []) {
          if (seen.has(value)) errors.push(`duplicate ${field === 'emails' ? 'email' : 'phone'}: ${value}`);
          seen.add(value);
        }
      }
    }
    errors.push(...this.checkRelationshipIntegrity());
    warnings.push(...this.checkHouseholdIntegrity());
    return { valid: errors.length === 0, errors, warnings };
  },

  checkUniqueness(field, value, excludeId = null) {
    const actors = this._ctx.getActors();
    for (const actor of actors) {
      if (excludeId && actor.actor_id === excludeId) continue;
      if (field === 'phone' && (actor.phone_numbers || []).includes(value)) return false;
      else if (field === 'email' && (actor.emails || []).includes(value)) return false;
      else if (actor[field] === value) return false;
    }
    return true;
  },

  checkLogicalConsistency(actorRecord) {
    const errors = [];
    const warnings = [];
    const tiers = this._ctx.getProfessionTiers();
    const match = tiers.find((t) => t.profession === actorRecord.profession);
    if (match) {
      if (actorRecord.age < Number(match.min_age || 0)) {
        warnings.push(`age below expected min for profession ${match.profession}`);
      }
      if (match.lifestyle_tier && actorRecord.lifestyle_tier !== match.lifestyle_tier) {
        warnings.push(`lifestyle_tier mismatch for profession ${match.profession}`);
      }
    }
    const defs = this._ctx.getTagletDefinitions();
    const assigned = actorRecord.taglets || [];
    for (const tagId of assigned) {
      const def = defs.find((d) => d.taglet_id === tagId);
      if (!def) continue;
      for (const conflict of def.conflicts_with || []) {
        if (assigned.includes(conflict)) errors.push(`taglet conflict ${tagId} <> ${conflict}`);
      }
    }
    return { errors, warnings };
  },

  checkRelationshipIntegrity() {
    const actors = this._ctx.getActors();
    const ids = new Set(actors.map((a) => a.actor_id));
    const errors = [];
    for (const actor of actors) {
      for (const rel of actor.relationships || []) {
        if (!ids.has(rel.actor_id)) {
          errors.push(`${actor.actor_id} references unknown relationship actor_id ${rel.actor_id}`);
        }
      }
    }
    return errors;
  },

  checkHouseholdIntegrity() {
    const actors = this._ctx.getActors();
    const byHousehold = new Map();
    for (const actor of actors) {
      if (!actor.household_id) continue;
      if (!byHousehold.has(actor.household_id)) byHousehold.set(actor.household_id, []);
      byHousehold.get(actor.household_id).push(actor);
    }
    const warnings = [];
    for (const [householdId, members] of byHousehold.entries()) {
      const firstAddr = JSON.stringify(members[0]?.home_address || {});
      if (!members.every((m) => JSON.stringify(m.home_address || {}) === firstAddr)) {
        warnings.push(`household ${householdId} has inconsistent addresses`);
      }
    }
    return warnings;
  }
};

