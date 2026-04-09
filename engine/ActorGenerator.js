import { TagletEngine } from './TagletEngine.js';
import { Validator } from './Validator.js';

function pickWeighted(pool) {
  if (!Array.isArray(pool) || pool.length === 0) return '';
  const total = pool.reduce((s, p) => s + Number(p.weight || 0), 0);
  let r = Math.random() * (total || pool.length);
  for (const item of pool) {
    r -= Number(item.weight || 1);
    if (r <= 0) return item.value;
  }
  return pool[pool.length - 1].value;
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = 'ACT-';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function calcAgeFromDob(dobString) {
  const dob = new Date(dobString);
  if (Number.isNaN(dob.getTime())) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}

export const ActorGenerator = {
  _ctx: {
    pools: {},
    isUnique: () => true,
    getAllActors: () => []
  },

  configure(ctx = {}) {
    this._ctx = { ...this._ctx, ...ctx };
  },

  generate(count, options = {}) {
    const records = [];
    for (let i = 0; i < count; i++) {
      const rec = this.generateOne({
        role: this._pickRole(options.roles),
        ageRange: options.age_range,
        lifestyleDistribution: options.lifestyle_distribution
      });
      records.push(rec);
    }
    return records;
  },

  _pickRole(rolesMap = {}) {
    const entries = Object.entries(rolesMap || {});
    if (!entries.length) return 'civilian';
    const total = entries.reduce((s, [, c]) => s + Number(c || 0), 0);
    let r = Math.random() * total;
    for (const [role, n] of entries) {
      r -= Number(n || 0);
      if (r <= 0) return role;
    }
    return entries[entries.length - 1][0];
  },

  _pickLifestyle(distribution = {}) {
    const entries = Object.entries(distribution || {});
    if (!entries.length) return 'middle';
    let r = Math.random();
    for (const [tier, w] of entries) {
      r -= Number(w || 0);
      if (r <= 0) return tier;
    }
    return entries[entries.length - 1][0];
  },

  generateOne(overrides = {}) {
    const pools = this._ctx.pools;
    const firstName = overrides.first_name || pickWeighted(pools.first_names);
    const lastName = overrides.last_name || pickWeighted(pools.last_names);
    const fullName = `${firstName} ${lastName}`.trim();
    const ageMin = overrides.ageRange?.min || 22;
    const ageMax = overrides.ageRange?.max || 65;
    const age = overrides.age || rand(ageMin, ageMax);
    const year = new Date().getFullYear() - age;
    const month = rand(1, 12);
    const day = rand(1, 28);
    const dob = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const professionPool = pools.profession_tiers || [];
    const professionEntry = professionPool[rand(0, Math.max(0, professionPool.length - 1))] || {};
    const profession = overrides.profession || professionEntry.profession || 'Office Administrator';
    const lifestyle = overrides.lifestyle_tier || professionEntry.lifestyle_tier || this._pickLifestyle(overrides.lifestyleDistribution);
    const email = this.generateEmail(firstName, lastName);
    const ssn = this.generateSSN();
    const phone = this.generatePhone();
    let homeAddress;
    let hargrove_address_id = null;
    const hargroveAddrs = (typeof window !== 'undefined' && window.MoogleMaps?.getAllAddresses?.()) || [];
    if (hargroveAddrs.length) {
      const ha = hargroveAddrs.filter(a => a.type === 'residential' || a.type === 'mixed');
      const pick = ha[rand(0, ha.length - 1)] || hargroveAddrs[rand(0, hargroveAddrs.length - 1)];
      homeAddress = { street: `${pick.number} ${pick.street}`, city: pick.city, state: pick.state, zip: pick.zip };
      hargrove_address_id = pick.id;
    } else {
      const addr = pools.address_pools || {};
      homeAddress = {
        street: `${rand(10, 999)} ${addr.streets?.[rand(0, (addr.streets || []).length - 1)] || 'Main St'}`,
        city: addr.cities?.[rand(0, (addr.cities || []).length - 1)] || 'Suburbia',
        state: addr.states?.[rand(0, (addr.states || []).length - 1)] || 'CA',
        zip: addr.zips?.[rand(0, (addr.zips || []).length - 1)] || '90210'
      };
    }
    const record = {
      actor_id: overrides.actor_id || randomId(),
      full_legal_name: fullName,
      first_name: firstName,
      last_name: lastName,
      aliases: overrides.aliases || [`${firstName.toLowerCase()}_${lastName.toLowerCase()}${rand(1, 999)}`],
      ssn,
      phone_numbers: [phone],
      emails: [email],
      home_address: homeAddress,
      hargrove_address_id,
      dob,
      age: calcAgeFromDob(dob),
      household_id: null,
      employer_id: null,
      profession,
      lifestyle_tier: lifestyle || 'middle',
      taglets: [],
      social_weight: rand(0, 100),
      opinion_profile: {
        player: rand(-20, 20),
        government: rand(-20, 20),
        corpos: rand(-20, 20),
        rapidemart: rand(-20, 20),
        corporations_general: rand(-20, 20)
      },
      relationships: [],
      current_state: {
        location: 'home',
        activity: 'offline',
        mood: 'neutral',
        last_event: null
      },
      memory: [],
      activity_schedule: {
        platforms: ['social', 'forum'],
        peak_hours: [rand(7, 11), rand(18, 23)],
        frequency: ['high', 'medium', 'low', 'lurker'][rand(0, 3)]
      },
      site_visibility: {
        social: 'public',
        forum: 'alias',
        news: 'public',
        email: 'private',
        corporate: 'public',
        anonymous: 'masked',
        banking: 'legal',
        government: 'legal'
      },
      public_profile: {
        display_name: fullName,
        bio: '',
        occupation: profession,
        avatar_description: 'default portrait'
      },
      private_profile: {
        notes: '',
        risk_flags: []
      },
      role: overrides.role || 'civilian',
      investigator_tier: overrides.investigator_tier ?? null,
      is_player: !!overrides.is_player,
      is_key_character: !!overrides.is_key_character,
      created_at: new Date().toISOString(),
      active: true
    };
    TagletEngine.assign(record, rand(1, 3));
    record.dcProfile = this.calculateDCProfile(record);
    const consistency = this.validateLogicalConsistency(record);
    if (!consistency.valid) {
      record.private_profile.risk_flags.push('generation_review_needed');
    }
    const merged = { ...record, ...overrides, age };
    if (!merged.dcProfile) merged.dcProfile = this.calculateDCProfile(merged);
    return merged;
  },

  generateSSN() {
    const rules = this._ctx.pools.ssn_rules || {};
    let attempts = 0;
    while (attempts < 1000) {
      attempts += 1;
      const area = rand(Number(rules.area_min || 100), Number(rules.area_max || 899));
      const group = rand(Number(rules.group_min || 10), Number(rules.group_max || 99));
      const serial = rand(Number(rules.serial_min || 1000), Number(rules.serial_max || 9999));
      const ssn = `${String(area).padStart(3, '0')}-${String(group).padStart(2, '0')}-${String(serial).padStart(4, '0')}`;
      if (this._ctx.isUnique('ssn', ssn)) return ssn;
    }
    throw new Error('Failed to generate unique SSN');
  },

  generatePhone() {
    const rules = this._ctx.pools.phone_rules || {};
    const area = (rules.area_codes || ['555'])[0];
    let attempts = 0;
    while (attempts < 1000) {
      attempts += 1;
      const exchange = rand(Number(rules.exchange_min || 100), Number(rules.exchange_max || 999));
      const line = rand(1000, 9999);
      const phone = `${area}-${exchange}-${line}`;
      if (this._ctx.isUnique('phone', phone)) return phone;
    }
    throw new Error('Failed to generate unique phone');
  },

  generateEmail(firstName, lastName) {
    const domains = this._ctx.pools.email_domains || ['wahoo.net'];
    let attempts = 0;
    while (attempts < 1000) {
      attempts += 1;
      const variant = `${firstName}.${lastName}${rand(1, 999)}`.toLowerCase().replace(/\s+/g, '');
      const domain = domains[rand(0, domains.length - 1)];
      const email = `${variant}@${domain}`;
      if (this._ctx.isUnique('email', email)) return email;
    }
    throw new Error('Failed to generate unique email');
  },

  calculateDCProfile(actor) {
    const base = {
      affinity_check: 10,
      gossip_check: 12,
      info_check: 13,
      favor_check: 14,
      bribe_check: 14,
      intimidation_check: 14,
      trust_check: 15,
    };
    const tags = actor.taglets || [];
    if (tags.includes('vocal')) base.gossip_check -= 2;
    if (tags.includes('lurker')) base.gossip_check += 3;
    if (tags.includes('cautious')) base.trust_check += 3;
    if (tags.includes('loyal')) base.bribe_check += 4;
    if (tags.includes('transactional')) base.bribe_check -= 3;
    if (tags.includes('generous')) base.favor_check -= 3;
    if (tags.includes('financially_exposed')) base.bribe_check -= 4;
    if (tags.includes('information_broker')) base.info_check -= 3;
    if (tags.includes('paranoid_poster')) base.trust_check += 4;
    if (tags.includes('formal_speaker')) base.affinity_check += 2;
    if (tags.includes('optimistic_voice')) base.affinity_check -= 2;
    if (tags.includes('confrontational')) base.affinity_check += 3;
    if (tags.includes('grudge_holder')) base.bribe_check += 5;
    if (actor.role === 'investigator') { base.bribe_check += 4; base.trust_check += 6; }
    if (actor.role === 'story') { base.info_check -= 2; }
    const swMod = Math.floor((actor.social_weight || 0) / 20);
    base.affinity_check += swMod;
    base.favor_check += swMod;
    for (const k of Object.keys(base)) {
      base[k] = Math.max(4, Math.min(20, base[k]));
    }
    return base;
  },

  validateLogicalConsistency(actorRecord) {
    const out = Validator.checkLogicalConsistency(actorRecord);
    return { valid: out.errors.length === 0, errors: [...out.errors, ...out.warnings] };
  },

  generateHousehold(actorIds) {
    const householdId = `HH-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    return { household_id: householdId, members: Array.isArray(actorIds) ? actorIds : [] };
  }
};

