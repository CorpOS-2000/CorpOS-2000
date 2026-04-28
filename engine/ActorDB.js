import { SiteLens } from './SiteLens.js';
import { Validator } from './Validator.js';
import { TagletEngine } from './TagletEngine.js';
import { ActorGenerator, deriveWorkSchedule } from './ActorGenerator.js';

/** @type {Map<number, object[]>} */
const _warmTierByDistrict = new Map();
/** @type {object | null} */
let _coldManifest = null;
/** @type {Set<number>} */
const _warmLoadedDistricts = new Set();

function deriveWorkScheduleFromProfession(prof) {
  return deriveWorkSchedule(prof || 'Office Administrator', 'civilian');
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateWarmActor(seed, districtId) {
  const rng = mulberry32(seed >>> 0);
  const PROFESSIONS = [
    'Retail Worker',
    'Teacher',
    'Attorney',
    'Accountant',
    'Server',
    'Nurse',
    'Engineer',
    'Freelancer',
    'Cook',
    'Security Guard',
    'Financial Advisor',
    'Artist',
    'Journalist',
    'Government Worker',
    'Truck Driver',
    'Unemployed',
    'Factory Worker',
    'Pharmacist'
  ];
  const ALL_TAGLETS = [
    'vocal',
    'cautious',
    'transactional',
    'information_broker',
    'community_hub',
    'generous',
    'ambitious',
    'reclusive',
    'loyal'
  ];

  const profIdx = Math.floor(rng() * PROFESSIONS.length);
  const prof = PROFESSIONS[profIdx];
  const numTags = Math.floor(rng() * 3) + 1;
  const taglets = [];
  for (let i = 0; i < numTags; i++) {
    const t = ALL_TAGLETS[Math.floor(rng() * ALL_TAGLETS.length)];
    if (!taglets.includes(t)) taglets.push(t);
  }

  const schedule = deriveWorkScheduleFromProfession(prof);

  return {
    actor_id: `WARM-${districtId}-${seed.toString(36)}`,
    districtId,
    profession: prof,
    taglets,
    work_schedule: schedule,
    opinion_profile: {},
    active: true,
    role: 'civilian',
    _tier: 'warm'
  };
}

function isActiveAtTime(actor, hour, dayOfWeek) {
  const s = actor.work_schedule;
  if (!s) return Math.random() < 0.2;
  const days = s.days || [];
  const off = s.off_hours || [];
  const peak = s.peak_hours || [];
  if (!days.includes(dayOfWeek)) return Math.random() < 0.08;
  if (off.includes(hour)) return Math.random() < 0.05;
  if (peak.includes(hour)) return Math.random() < 0.75;
  return Math.random() < 0.3;
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

export const ActorDB = {
  _actors: [],
  _households: [],
  _relationships: [],
  _loadJson: async () => [],
  _saveJson: async () => {},
  _indexes: {
    ssn: new Map(),
    email: new Map(),
    phone: new Map(),
    alias: new Map()
  },

  async init({ loadJson, saveJson } = {}) {
    if (typeof loadJson === 'function') this._loadJson = loadJson;
    if (typeof saveJson === 'function') this._saveJson = saveJson;
    this._actors = safeArray(await this._loadJson('actors/actors.json'));
    this._households = safeArray(await this._loadJson('actors/households.json'));
    this._relationships = safeArray(await this._loadJson('actors/relationships.json'));

    const lensDefs = await this._loadJson('lenses/lens_definitions.json').catch(() => null);
    if (lensDefs) SiteLens.setDefinitions(lensDefs);

    const firstNames = await this._loadJson('generation/first_names.json').catch(() => []);
    const lastNames = await this._loadJson('generation/last_names.json').catch(() => []);
    const addressPools = await this._loadJson('generation/address_pools.json').catch(() => ({}));
    const phoneRules = await this._loadJson('generation/phone_rules.json').catch(() => ({}));
    const emailDomains = await this._loadJson('generation/email_domains.json').catch(() => []);
    const ssnRules = await this._loadJson('generation/ssn_rules.json').catch(() => ({}));
    const taglets = await this._loadJson('generation/taglet_definitions.json').catch(() => []);
    const professionTiers = await this._loadJson('generation/profession_tiers.json').catch(() => []);
    const firstNames1940sFemale = await this._loadJson('generation/first_names_1940s_female.json').catch(() => []);

    TagletEngine.setDefinitions(taglets);
    TagletEngine.setActorGetter((actorId) => this.getRaw(actorId));

    Validator.setContext({
      getActors: () => this.getAllRaw(),
      getProfessionTiers: () => professionTiers,
      getTagletDefinitions: () => taglets,
      getHouseholds: () => this._households
    });
    ActorGenerator.configure({
      pools: {
        first_names: firstNames,
        last_names: lastNames,
        address_pools: addressPools,
        phone_rules: phoneRules,
        email_domains: emailDomains,
        ssn_rules: ssnRules,
        profession_tiers: professionTiers,
        first_names_1940s_female: firstNames1940sFemale
      },
      isUnique: (field, value) => Validator.checkUniqueness(field, value),
      getAllActors: () => this.getAllRaw()
    });

    this._rebuildIndexes();
    this._backfillDCProfiles();
    for (const a of this._actors) {
      if (!a.work_schedule) {
        a.work_schedule = deriveWorkSchedule(a.profession, a.role);
      }
    }
    if (typeof window !== 'undefined') window.ActorDB = this;
    return this;
  },

  _rebuildIndexes() {
    this._indexes.ssn.clear();
    this._indexes.email.clear();
    this._indexes.phone.clear();
    this._indexes.alias.clear();
    for (const actor of this._actors) {
      if (actor.ssn) this._indexes.ssn.set(actor.ssn, actor.actor_id);
      for (const email of actor.emails || []) this._indexes.email.set(String(email).toLowerCase(), actor.actor_id);
      for (const phone of actor.phone_numbers || []) this._indexes.phone.set(phone, actor.actor_id);
      for (const alias of actor.aliases || []) this._indexes.alias.set(String(alias).toLowerCase(), actor.actor_id);
    }
  },

  getRaw(actorId) {
    return this._actors.find((a) => a.actor_id === actorId) || null;
  },

  get(actorId, lens = 'social') {
    const actor = this.getRaw(actorId);
    if (!actor || actor.active === false) return null;
    return SiteLens.apply(actor, lens);
  },

  query(lens = 'social', filters = {}) {
    let rows = this._actors.filter((a) => a.active !== false);
    if (filters.role) rows = rows.filter((a) => a.role === filters.role);
    if (filters.lifestyle_tier) rows = rows.filter((a) => a.lifestyle_tier === filters.lifestyle_tier);
    if (filters.employer_id) rows = rows.filter((a) => a.employer_id === filters.employer_id);
    if (filters.household_id) rows = rows.filter((a) => a.household_id === filters.household_id);
    if (Array.isArray(filters.taglets) && filters.taglets.length > 0) {
      rows = rows.filter((a) => filters.taglets.every((t) => (a.taglets || []).includes(t)));
    }
    const offset = Math.max(0, Number(filters.offset || 0));
    const limit = Math.max(1, Number(filters.limit || rows.length));
    return rows.slice(offset, offset + limit).map((a) => SiteLens.apply(a, lens));
  },

  getBySSN(ssn) {
    const id = this._indexes.ssn.get(ssn);
    return id ? this.get(id, 'banking') : null;
  },

  getByEmail(email) {
    const id = this._indexes.email.get(String(email || '').toLowerCase());
    return id ? this.get(id, 'email') : null;
  },

  getByPhone(phone) {
    const id = this._indexes.phone.get(phone);
    return id ? this.get(id, 'email') : null;
  },

  getByAlias(alias) {
    const id = this._indexes.alias.get(String(alias || '').toLowerCase());
    return id ? this.get(id, 'forum') : null;
  },

  getRelationships(actorId) {
    return clone(this.getRaw(actorId)?.relationships || []);
  },

  getHousehold(householdId, lens = 'social') {
    return this._actors
      .filter((a) => a.household_id === householdId && a.active !== false)
      .map((a) => SiteLens.apply(a, lens));
  },

  search(query) {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return [];
    return this._actors
      .filter((a) => a.active !== false)
      .filter((a) => {
        const name = a.public_profile?.display_name || a.full_legal_name || '';
        const aliases = (a.aliases || []).join(' ');
        const prof = a.profession || '';
        const hay = `${name} ${aliases} ${prof}`.toLowerCase();
        return hay.includes(q);
      })
      .map((a) => SiteLens.apply(a, 'social'));
  },

  /**
   * Import or replace a full actor record from save (merge discovered NPCs after world bootstrap).
   */
  importActorRecord(actorData) {
    const copy = clone(actorData);
    const id = copy.actor_id;
    if (!id) return null;
    const i = this._actors.findIndex((a) => a.actor_id === id);
    if (i >= 0) {
      this._actors[i] = copy;
    } else {
      this._actors.push(copy);
    }
    this._rebuildIndexes();
    this._backfillDCProfiles();
    return copy;
  },

  create(actorData) {
    if (!Validator.checkUniqueness('ssn', actorData.ssn)) {
      throw new Error('Duplicate SSN');
    }
    for (const phone of actorData.phone_numbers || []) {
      if (!Validator.checkUniqueness('phone', phone)) throw new Error('Duplicate phone');
    }
    for (const email of actorData.emails || []) {
      if (!Validator.checkUniqueness('email', email)) throw new Error('Duplicate email');
    }
    this._actors.push(clone(actorData));
    this._rebuildIndexes();
    return this.export();
  },

  update(actorId, changes) {
    const i = this._actors.findIndex((a) => a.actor_id === actorId);
    if (i < 0) return null;
    const next = { ...this._actors[i], ...clone(changes), actor_id: actorId };
    if (next.ssn && !Validator.checkUniqueness('ssn', next.ssn, actorId)) throw new Error('Duplicate SSN');
    for (const phone of next.phone_numbers || []) {
      if (!Validator.checkUniqueness('phone', phone, actorId)) throw new Error('Duplicate phone');
    }
    for (const email of next.emails || []) {
      if (!Validator.checkUniqueness('email', email, actorId)) throw new Error('Duplicate email');
    }
    this._actors[i] = next;
    this._rebuildIndexes();
    return this.export();
  },

  addMemory(actorId, eventObject) {
    const actor = this.getRaw(actorId);
    if (!actor) return null;
    actor.memory = safeArray(actor.memory);
    actor.memory.push(clone(eventObject));
    return this.export();
  },

  updateState(actorId, stateObject) {
    const actor = this.getRaw(actorId);
    if (!actor) return null;
    actor.current_state = { ...(actor.current_state || {}), ...clone(stateObject) };
    return this.export();
  },

  updateOpinion(actorId, target, delta) {
    const actor = this.getRaw(actorId);
    if (!actor) return null;
    if (!actor.opinion_profile || typeof actor.opinion_profile !== 'object') actor.opinion_profile = {};
    actor.opinion_profile[target] = Number(actor.opinion_profile[target] || 0) + Number(delta || 0);
    actor.opinion_profile[target] = Math.max(-100, Math.min(100, actor.opinion_profile[target]));
    return this.export();
  },

  getAll(lens = 'social') {
    return this._actors.filter((a) => a.active !== false).map((a) => SiteLens.apply(a, lens));
  },

  getAllRaw() {
    return clone(this._actors);
  },

  loadColdManifest(manifest) {
    _coldManifest = manifest;
    this.warmLoadDistrict(1);
  },

  warmLoadDistrict(districtId) {
    const id = Number(districtId);
    if (_warmLoadedDistricts.has(id)) return;

    const block = _coldManifest?.districts?.[id] ?? _coldManifest?.districts?.[String(id)];
    if (!block?.seeds?.length) return;

    const warmActors = block.seeds.map((seed) => generateWarmActor(seed, id));
    _warmTierByDistrict.set(id, warmActors);
    _warmLoadedDistricts.add(id);
    console.log(`[ActorDB] Warm-loaded district ${id}: ${warmActors.length} actors.`);
  },

  /**
   * Actors statistically active at this game hour / day (hot + warm tiers), capped at 500.
   * @param {number} gameHour UTC hour 0–23
   * @param {number} gameDayOfWeek UTC day 0–6
   * @param {number[] | null} districtIds null = all warm-loaded districts
   */
  getActiveNow(gameHour, gameDayOfWeek, districtIds = null) {
    const hour = Number(gameHour);
    const dow = Number(gameDayOfWeek);
    const result = [];

    for (const actor of this._actors) {
      if (actor.active === false) continue;
      if (isActiveAtTime(actor, hour, dow)) {
        result.push(actor);
      }
      if (result.length >= 500) return result;
    }

    const districtsToCheck =
      districtIds != null && districtIds.length
        ? districtIds.map(Number)
        : [..._warmLoadedDistricts];

    for (const did of districtsToCheck) {
      const warmActors = _warmTierByDistrict.get(did) || [];
      for (const actor of warmActors) {
        if (isActiveAtTime(actor, hour, dow)) {
          result.push(actor);
          if (result.length >= 500) return result;
        }
      }
    }

    return result;
  },

  hydrateToHot(actorId) {
    const idStr = String(actorId || '');
    const parts = idStr.split('-');
    if (parts[0] !== 'WARM' || parts.length < 3) return null;

    const districtId = Number(parts[1]);
    const seed = parseInt(parts[2], 36);
    if (!Number.isFinite(seed)) return null;

    const list = _warmTierByDistrict.get(districtId);
    if (!Array.isArray(list)) return null;
    const idx = list.findIndex((a) => a.actor_id === idStr);
    if (idx < 0) return null;

    const warmActor = list[idx];
    const fullActor = ActorGenerator.generateFromSeed(seed, districtId, warmActor);
    let nid = `ACT-HYD-${districtId}-${seed.toString(36)}`;
    let guard = 0;
    while (this.getRaw(nid) && guard < 500) {
      guard += 1;
      nid = `ACT-HYD-${districtId}-${seed.toString(36)}-${guard}`;
    }
    fullActor.actor_id = nid;

    list.splice(idx, 1);
    this._actors.push(fullActor);
    this._rebuildIndexes();
    return fullActor;
  },

  getByAddress(addressId) {
    if (!addressId) return [];
    return clone(this._actors.filter(a => a.hargrove_address_id === addressId && a.active !== false));
  },

  count() {
    return this._actors.filter((a) => a.active !== false).length;
  },

  getAllPhones() {
    return this._actors.flatMap((a) => a.phone_numbers || []);
  },

  getAllSSNs() {
    return this._actors.map((a) => a.ssn).filter(Boolean);
  },

  getByRole(role) {
    return this._actors.filter((a) => a.role === role && a.active !== false);
  },

  setPlayerActor(actor) {
    const idx = this._actors.findIndex((a) => a.actor_id === 'PLAYER_PRIMARY');
    if (idx >= 0) {
      this._actors[idx] = clone(actor);
    } else {
      this._actors.push(clone(actor));
    }
    this._rebuildIndexes();
  },

  getCompanyName(employerId) {
    if (!employerId) return null;
    if (typeof window !== 'undefined') {
      const reg = window.__gameState?.()?.registry;
      const biz = reg?.businesses?.find?.((b) => b.id === employerId);
      if (biz) return biz.tradingName || biz.name || employerId;
    }
    return employerId;
  },

  validate() {
    return Validator.runFull();
  },

  async export() {
    await this._saveJson('actors/actors.json', this._actors);
    await this._saveJson('actors/households.json', this._households);
    await this._saveJson('actors/relationships.json', this._relationships);
    return true;
  },

  _backfillDCProfiles() {
    for (const actor of this._actors) {
      if (!actor.dcProfile) {
        actor.dcProfile = ActorGenerator.calculateDCProfile(actor);
      }
    }
  },

  _assignHouseholdAddresses() {
    const byHousehold = new Map();
    for (const a of this._actors) {
      if (!a.household_id) continue;
      if (!byHousehold.has(a.household_id)) byHousehold.set(a.household_id, []);
      byHousehold.get(a.household_id).push(a);
    }
    for (const members of byHousehold.values()) {
      const leader = members.find(m => m.hargrove_address_id) || members[0];
      if (leader?.hargrove_address_id) {
        for (const m of members) {
          if (m !== leader) {
            m.hargrove_address_id = leader.hargrove_address_id;
            m.home_address = { ...leader.home_address };
          }
        }
      }
    }
  },

  async bootstrapPopulationIfEmpty() {
    if (this._actors.length > 0) return { generated: 0, valid: true };
    return this.bootstrapPopulationAsync();
  },

  async bootstrapPopulationAsync() {
    if (this._actors.some((a) => a.role && a.role !== 'player')) return { generated: 0, valid: true };
    const generated = await ActorGenerator.generateAsync(500, {
      roles: {
        civilian: 450,
        contact: 30,
        investigator: 6,
        story: 10,
        rival: 4
      },
      lifestyle_distribution: {
        low: 0.15,
        middle: 0.5,
        'upper-middle': 0.25,
        wealthy: 0.08,
        elite: 0.02
      },
      age_range: { min: 22, max: 65 }
    }, {
      batchSize: 50,
      onBatch: (rec) => {
        this._actors.push(rec);
        this._rebuildIndexes();
      }
    });
    this._assignHouseholdAddresses();
    this._rebuildIndexes();
    this._backfillDCProfiles();
    const report = this.validate();
    await this.export();
    return { generated: generated.length, ...report };
  }
};

