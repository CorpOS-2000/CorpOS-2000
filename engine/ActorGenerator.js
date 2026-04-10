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

  generatePhone(excludePhones = []) {
    const rules = this._ctx.pools.phone_rules || {};
    const area = (rules.area_codes || ['559'])[0];
    const fallback = (rules.fallback_area_codes || ['209'])[0];
    const exMin = Number(rules.exchange_min || 200);
    const exMax = Number(rules.exchange_max || 999);
    let attempts = 0;
    while (attempts < 2000) {
      attempts += 1;
      const ac = attempts > 1000 ? fallback : area;
      const exchange = rand(exMin, exMax);
      const line = rand(1000, 9999);
      const phone = `(${ac}) ${exchange}-${line}`;
      if (excludePhones.includes(phone)) continue;
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
  },

  async generateAsync(count, options = {}, { batchSize = 50, onBatch } = {}) {
    const records = [];
    for (let i = 0; i < count; i += batchSize) {
      const n = Math.min(batchSize, count - i);
      for (let j = 0; j < n; j++) {
        const rec = this.generateOne({
          role: this._pickRole(options.roles),
          ageRange: options.age_range,
          lifestyleDistribution: options.lifestyle_distribution
        });
        records.push(rec);
        if (typeof onBatch === 'function') onBatch(rec);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return records;
  },

  generatePlayer(playerConfig = {}) {
    const firstName = playerConfig.firstName || pickWeighted(this._ctx.pools.first_names);
    const lastName = playerConfig.lastName || pickWeighted(this._ctx.pools.last_names);
    const phone = this.generatePhone();
    const ssn = playerConfig.ssnFull || this.generateSSN();
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@jeemail.net`;
    const dob = playerConfig.dob || `${2000 - rand(22, 35)}-${String(rand(1, 12)).padStart(2, '0')}-${String(rand(1, 28)).padStart(2, '0')}`;
    const age = calcAgeFromDob(dob);
    const address = playerConfig.address || null;
    const hargroveAddressId = playerConfig.hargroveAddressId || null;
    const homeAddress = address && typeof address === 'object'
      ? address
      : { street: String(address || ''), city: 'Hargrove', state: 'CA', zip: '93720' };

    return {
      actor_id: 'PLAYER_PRIMARY',
      full_legal_name: `${firstName} ${lastName}`,
      first_name: firstName,
      last_name: lastName,
      aliases: [`${firstName.toLowerCase()}${lastName.toLowerCase()}`],
      ssn,
      phone_numbers: [phone],
      emails: [email],
      home_address: homeAddress,
      hargrove_address_id: hargroveAddressId,
      dob,
      age,
      household_id: 'HH_PLAYER',
      employer_id: null,
      profession: 'Entrepreneur',
      lifestyle_tier: 'low',
      taglets: ['business_builder', 'ambitious', 'casual_speaker'],
      social_weight: 5,
      opinion_profile: { player: 0, government: 0, corpos: 0, rapidemart: -5, corporations_general: 0 },
      relationships: [],
      current_state: { location: 'home', activity: 'working', mood: 'determined', last_event: null },
      memory: [],
      activity_schedule: { platforms: ['jeemail', 'worldnet'], peak_hours: [8, 22], frequency: 'medium' },
      site_visibility: { social: 'public', forum: 'alias', banking: 'legal', government: 'legal' },
      public_profile: { display_name: `${firstName} ${lastName}`, bio: 'Entrepreneur.', occupation: 'Business Operator', avatar_description: 'Young professional' },
      private_profile: { notes: 'Player character', risk_flags: [] },
      role: 'player',
      investigator_tier: null,
      is_player: true,
      is_key_character: true,
      created_at: '2000-01-01T06:00:00',
      active: true,
      dcProfile: { affinity_check: 10, gossip_check: 12, info_check: 13, favor_check: 14, bribe_check: 14, intimidation_check: 14, trust_check: 15 }
    };
  },

  generateMom(playerActor) {
    const lastName = playerActor.last_name;
    const pools = this._ctx.pools;
    const momPool = pools.first_names_1940s_female;
    const firstName = (Array.isArray(momPool) && momPool.length) ? pickWeighted(momPool) : 'Linda';
    const maidenName = pickWeighted(pools.last_names) || 'Johnson';
    const phone = this.generatePhone([...(playerActor.phone_numbers || [])]);
    const ssn = this.generateSSN();
    const email = this.generateEmail(firstName, lastName);
    const dob = `${2000 - rand(48, 65)}-${String(rand(1, 12)).padStart(2, '0')}-${String(rand(1, 28)).padStart(2, '0')}`;

    const hargroveAddrs = (typeof window !== 'undefined' && window.MoogleMaps?.getAllAddresses?.()) || [];
    let homeAddress, hargrove_address_id = null;
    if (hargroveAddrs.length) {
      const ha = hargroveAddrs.filter(a => a.type === 'residential' || a.type === 'mixed');
      const pick = ha[rand(0, ha.length - 1)] || hargroveAddrs[rand(0, hargroveAddrs.length - 1)];
      homeAddress = { street: `${pick.number} ${pick.street}`, city: pick.city, state: pick.state, zip: pick.zip };
      hargrove_address_id = pick.id;
    } else {
      homeAddress = { street: `${rand(100, 999)} Oak Lane`, city: 'Hargrove', state: 'CA', zip: '93720' };
    }

    const playerFirstName = playerActor.first_name;
    const welcomeMessages = [
      `${playerFirstName}, it's Mom. I just wanted to say I'm proud of you for starting your own business. Call me when you get a chance. Love you.`,
      `Hi honey! Just checking in on your first day. I made your favorite last night - there's some in the freezer if you want it. Good luck today. Love, Mom`,
      `${playerFirstName} it's Mom. Your father says good luck. I say don't forget to eat. Call me tonight. xoxo`,
      `Hi sweetheart. Big day! I know you're going to do great. The garage is all yours for as long as you need it. Call me. Love you.`,
      `${playerFirstName}! It's Mom. How's everything going? I'm thinking of you on your first day. Be smart, be safe. Love Mom`,
    ];
    const welcomeMessage = welcomeMessages[rand(0, welcomeMessages.length - 1)];

    const profession = ['Homemaker', 'Retired Teacher', 'School Secretary', 'Retired Nurse', 'Part-time Librarian', 'Church Volunteer Coordinator'][rand(0, 5)];

    const momRecord = {
      actor_id: `ACT-MOM-${randomId().slice(4)}`,
      full_legal_name: `${firstName} ${lastName}`,
      first_name: firstName,
      last_name: lastName,
      maiden_name: maidenName,
      aliases: ['Mom'],
      ssn,
      phone_numbers: [phone],
      emails: [email],
      home_address: homeAddress,
      hargrove_address_id,
      dob,
      age: calcAgeFromDob(dob),
      household_id: 'HH_MOM',
      employer_id: null,
      profession,
      lifestyle_tier: 'middle',
      taglets: ['pro_government', 'status_quo', 'vocal', 'optimistic_voice', 'community_first', 'casual_speaker'],
      social_weight: 12,
      opinion_profile: { player: 95, government: 20, corpos: 5, rapidemart: -10, corporations_general: 0 },
      relationships: [{ actor_id: 'PLAYER_PRIMARY', type: 'family', subtype: 'child', strength: 10 }],
      current_state: { location: 'home', activity: 'household', mood: 'warm', last_event: null },
      memory: [],
      activity_schedule: { platforms: [], peak_hours: [9, 20], frequency: 'low' },
      site_visibility: { social: 'public', forum: 'alias', banking: 'legal', government: 'legal' },
      public_profile: { display_name: `${firstName} ${lastName}`, bio: '', occupation: profession, avatar_description: 'Warm middle-aged woman' },
      private_profile: { notes: '', risk_flags: [] },
      dcProfile: {
        affinity_check: 6,
        gossip_check: 12,
        info_check: 14,
        favor_check: 10,
        bribe_check: 18,
        intimidation_check: 20,
        trust_check: 4,
      },
      welcomeMessage,
      moneyGivenCount: 0,
      rudeness_count: 0,
      rudeness_sms_sent: 0,
      role: 'contact',
      investigator_tier: null,
      is_player: false,
      is_key_character: false,
      created_at: '2000-01-01T06:00:00',
      active: true,
      contactDisplayName: 'Mom',
      relationToPlayer: 'Mother',
    };
    return momRecord;
  },

  generateKyleHargrove(existingPhones = []) {
    const phone = this.generatePhone(existingPhones);
    const ssn = this.generateSSN();
    return {
      actor_id: 'ACT-KYLE-HARGROVE',
      full_legal_name: 'Kyle Hargrove',
      first_name: 'Kyle',
      last_name: 'Hargrove',
      aliases: ['KyleH'],
      ssn,
      phone_numbers: [phone],
      emails: ['k.hargrove@corpossales.gov.net'],
      home_address: { street: '440 Federal Plaza', city: 'Hargrove', state: 'CA', zip: '93720' },
      hargrove_address_id: null,
      dob: '1971-06-14',
      age: 28,
      household_id: null,
      employer_id: 'CORPOS_SALES_DIVISION',
      profession: 'Account Manager',
      lifestyle_tier: 'middle',
      taglets: ['corporate_climber', 'vocal', 'formal_speaker', 'transactional', 'pro_government'],
      social_weight: 18,
      opinion_profile: { player: 40, government: 60, corpos: 55, rapidemart: -5 },
      relationships: [],
      current_state: { location: 'office', activity: 'working', mood: 'upbeat', last_event: null },
      memory: [],
      activity_schedule: { platforms: ['jeemail'], peak_hours: [8, 18], frequency: 'low' },
      site_visibility: { social: 'public', forum: 'none', banking: 'legal', government: 'legal' },
      public_profile: { display_name: 'Kyle Hargrove', bio: 'CorpOS Sales Division — Account Manager', occupation: 'Account Manager', avatar_description: 'Young professional in a suit' },
      private_profile: { notes: '', risk_flags: [] },
      dcProfile: {
        affinity_check: 10,
        gossip_check: 16,
        info_check: 14,
        favor_check: 14,
        bribe_check: 14,
        intimidation_check: 14,
        trust_check: 14,
      },
      role: 'contact',
      investigator_tier: null,
      is_player: false,
      is_key_character: true,
      created_at: '2000-01-01T06:00:00',
      active: true,
      contactDisplayName: 'Kyle Hargrove',
      relationToPlayer: 'CorpOS Account Manager',
    };
  }
};

