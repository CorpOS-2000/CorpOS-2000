/**
 * world-generation.js — Orchestrates actor world generation.
 * Phase 1 (BIOS): 500 NPC actors, async batched.
 * Phase 2 (post-enrollment): Player actor, Mom, initial contacts, JeeMail seed, Mom SMS queue.
 */
import { ActorDB } from '../engine/ActorDB.js';
import { ActorGenerator } from '../engine/ActorGenerator.js';
import { SaveManager } from '../engine/SaveManager.js';
import { getState, patchState } from './gameState.js';
import { SMS } from './bc-sms.js';
import { toast, TOAST_KEYS } from './toast.js';
import { PeekManager } from './peek-manager.js';

function districtBucket(actor) {
  if (actor?.districtId != null && actor.districtId !== '') return Number(actor.districtId);
  let h = 0;
  const id = String(actor?.actor_id || '');
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 12) + 1;
}

/** One to four outbound connections per NPC for AXIS Connections tab (in-memory + actors.json export). */
function generateActorRelationships(allActors) {
  const actors = allActors.filter((a) => a?.actor_id && a.role !== 'player');
  for (const actor of actors) {
    const d = districtBucket(actor);
    const sameDistrict = actors.filter(
      (a) => a.actor_id !== actor.actor_id && districtBucket(a) === d
    );
    const pool = sameDistrict.length > 3 ? sameDistrict : actors.filter((a) => a.actor_id !== actor.actor_id);
    const numRels = Math.min(pool.length, 1 + Math.floor(Math.random() * 4));
    const relationships = [];
    for (let i = 0; i < numRels; i++) {
      const target = pool[Math.floor(Math.random() * pool.length)];
      if (!target || relationships.some((r) => r.actor_id === target.actor_id)) continue;
      const types = ['Colleague', 'Neighbor', 'Associate', 'Acquaintance', 'Former classmate', 'Friend'];
      relationships.push({
        actor_id: target.actor_id,
        relationship_type: types[Math.floor(Math.random() * types.length)],
        connection_strength: 10 + Math.floor(Math.random() * 60)
      });
    }
    actor.relationships = relationships;
  }
}

const DISTRICT_POPULATIONS = {
  1: 8400,
  2: 12200,
  3: 6800,
  4: 9100,
  5: 7400,
  6: 5200,
  7: 11300,
  8: 4800,
  9: 6600,
  10: 8900,
  11: 5100,
  12: 4200
};

/**
 * Cold-tier seed manifest (~90k seeds). Runs during BIOS after hot NPC generation.
 */
export function generateColdManifest() {
  patchState((st) => {
    if (st.player.worldSeed == null) {
      st.player.worldSeed = (Date.now() ^ (Number(st.sim?.elapsedMs) || 0)) >>> 0;
    }
    return st;
  });

  const gameSeed = getState().player?.worldSeed ?? Date.now();
  const manifest = { districts: {}, totalColdActors: 0 };

  for (const [districtIdStr, population] of Object.entries(DISTRICT_POPULATIONS)) {
    const districtId = Number(districtIdStr);
    const distSeed = (gameSeed ^ (districtId * 2654435761)) >>> 0;
    const seeds = [];
    let s = distSeed;
    for (let i = 0; i < population; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      seeds.push(s);
    }
    manifest.districts[districtId] = {
      population,
      seeds,
      warmLoaded: false
    };
    manifest.totalColdActors += population;
  }

  patchState((st) => {
    st.districtManifest = manifest;
    return st;
  });

  ActorDB.loadColdManifest(manifest);
  console.log(`[WorldGen] Cold manifest generated: ${manifest.totalColdActors} cold actors across 12 districts.`);
  return manifest;
}

let _npcGenComplete = false;
let _playerGenComplete = false;

export function isNpcGenerationComplete() { return _npcGenComplete; }
export function isPlayerGenerationComplete() { return _playerGenComplete; }

/**
 * Phase 1: Generate 500 world NPCs during the BIOS sequence.
 * Async-batched so the BIOS animation stays smooth.
 * Skips if actors already exist (saved game).
 */
export async function generateWorldNpcsDuringBios() {
  let report;
  let didBootstrap = false;
  if (ActorDB.count() > 0) {
    report = { generated: 0, valid: true };
  } else {
    report = await ActorDB.bootstrapPopulationAsync();
    didBootstrap = true;
    console.log(`[WorldGen] NPC generation complete: ${report.generated} actors.`);
  }
  try {
    SaveManager.applyPendingDiscoveredActors();
  } catch (e) {
    console.warn('[WorldGen] applyPendingDiscoveredActors:', e);
  }

  if (didBootstrap && report.generated > 0) {
    generateActorRelationships(ActorDB._actors || ActorDB.getAllRaw?.() || []);
    try {
      await ActorDB.export();
    } catch (e) {
      console.warn('[WorldGen] ActorDB.export after relationships:', e);
    }
  }

  const st = getState();
  if (!st.districtManifest) {
    generateColdManifest();
  } else {
    ActorDB.loadColdManifest(st.districtManifest);
  }

  _npcGenComplete = true;
  return report;
}

/**
 * Phase 2: After CorpOS enrollment, create the player actor and Mom.
 * Idempotent — safe to call multiple times.
 */
export function generatePlayerAndMomAfterEnrollment() {
  const st = getState();
  if (!st.player?.corposEnrollmentComplete) return;
  if (_playerGenComplete) return;
  // One mother per operator — persisted on player. Do not require ActorDB to be
  // hydrated yet (cold boot can race PLAYER_PRIMARY); regenerating creates duplicates.
  if (st.player?.momActorId) {
    _playerGenComplete = true;
    return;
  }

  const p = st.player;
  if (!p.firstName || !p.lastName) return;

  const playerActor = ActorGenerator.generatePlayer({
    firstName: p.firstName,
    lastName: p.lastName,
    dob: p.dob || undefined,
    ssnFull: p.ssnFull || undefined,
    address: p.address
      ? { street: p.address, city: 'Hargrove', state: 'CA', zip: '93720' }
      : undefined,
    hargroveAddressId: p.hargroveAddressId || undefined,
  });

  ActorDB.setPlayerActor(playerActor);

  const momActor = ActorGenerator.generateMom(playerActor);
  try {
    ActorDB.create(momActor);
  } catch {
    ActorDB._actors.push(JSON.parse(JSON.stringify(momActor)));
    ActorDB._rebuildIndexes();
  }

  const existingPhones = [
    ...(playerActor.phone_numbers || []),
    ...(momActor.phone_numbers || []),
  ];
  let kyleActor = ActorDB.getRaw('ACT-KYLE-HARGROVE');
  if (!kyleActor) {
    kyleActor = ActorGenerator.generateKyleHargrove(existingPhones);
    try {
      ActorDB.create(kyleActor);
    } catch {
      ActorDB._actors.push(JSON.parse(JSON.stringify(kyleActor)));
      ActorDB._rebuildIndexes();
    }
  }

  playerActor.relationships = [
    { actor_id: momActor.actor_id, type: 'family', subtype: 'mother', strength: 10 }
  ];
  ActorDB.setPlayerActor(playerActor);

  buildInitialContactList(playerActor, momActor, kyleActor);

  patchState((s) => {
    s.player.momActorId = momActor.actor_id;
    s.player.phone = playerActor.phone_numbers[0];
    s.player.email = playerActor.emails[0];
    s.player.actor_id = 'PLAYER_PRIMARY';

    if (!s.player.relationships) s.player.relationships = [];
    const hasMomRel = s.player.relationships.some(
      (r) => r.actorId === momActor.actor_id || r.actor_id === momActor.actor_id
    );
    if (!hasMomRel) {
      s.player.relationships.push({
        actorId: momActor.actor_id,
        actor_id: momActor.actor_id,
        type: 'family',
        label: 'mother',
        strength: 10,
      });
    }

    if (!Array.isArray(s.player.pendingSmsEvents)) s.player.pendingSmsEvents = [];
    s.player.pendingSmsEvents.push({
      type: 'sms_receive',
      delayMs: 3000,
      actorId: momActor.actor_id,
      message: momActor.welcomeMessage,
    });

    return s;
  });

  if (window.AXIS?.discover) {
    window.AXIS.discover(momActor.actor_id, { source: 'family', note: 'Your mother.' });
  }
  if (window.AXIS?.updateScore) {
    window.AXIS.updateScore(momActor.actor_id, 50, 'Family bond — Mom');
  }

  ActorDB.export().catch(() => {});

  _playerGenComplete = true;
  console.log(`[WorldGen] Player + Mom generated. Mom: ${momActor.actor_id}`);
}

/**
 * Call when the player discovers a district (business reg, maps, narrative, etc.).
 * Warm-loads that district's cold NPC seeds off the main thread slice.
 */
export function onPlayerExploresDistrict(districtId) {
  const id = Number(districtId);
  if (!Number.isFinite(id)) return;
  patchState((st) => {
    if (!st.player.exploredDistricts) st.player.exploredDistricts = [1];
    if (!st.player.exploredDistricts.includes(id)) {
      st.player.exploredDistricts.push(id);
    }
    return st;
  });
  setTimeout(() => {
    try {
      ActorDB.warmLoadDistrict(id);
    } catch (e) {
      console.warn('[WorldGen] warmLoadDistrict:', e);
    }
  }, 0);
}

const FRIEND_RELATIONS = ['Friend', 'Former Coworker', 'Old Classmate', 'Neighbor'];

function buildInitialContactList(playerActor, momActor, kyleActor) {
  const contacts = [
    {
      actorId: 'PLAYER_PRIMARY',
      displayName: `${playerActor.first_name} - Me`,
      officialName: playerActor.full_legal_name,
      relationToPlayer: 'Self',
      jobTitle: 'Entrepreneur',
      company: null,
      phone: playerActor.phone_numbers[0],
      isPlayer: true,
      sortOrder: 0,
    },
    {
      actorId: momActor.actor_id,
      displayName: 'Mom',
      officialName: momActor.full_legal_name,
      relationToPlayer: 'Mother',
      jobTitle: momActor.profession,
      company: null,
      phone: momActor.phone_numbers[0],
      isPlayer: false,
      sortOrder: 1,
    },
  ];

  if (kyleActor) {
    contacts.push({
      actorId: kyleActor.actor_id,
      displayName: kyleActor.contactDisplayName,
      officialName: kyleActor.full_legal_name,
      relationToPlayer: kyleActor.relationToPlayer,
      jobTitle: kyleActor.profession,
      company: 'CorpOS Sales Division',
      phone: kyleActor.phone_numbers[0],
      isPlayer: false,
      sortOrder: 1.5,
    });
  }

  const starterPool = ActorDB.getByRole('contact')
    .filter((a) => ['low', 'middle'].includes(a.lifestyle_tier))
    .slice(0, 10);

  starterPool.forEach((actor, idx) => {
    contacts.push({
      actorId: actor.actor_id,
      displayName: actor.first_name,
      officialName: actor.full_legal_name,
      relationToPlayer: FRIEND_RELATIONS[idx % FRIEND_RELATIONS.length],
      jobTitle: actor.profession,
      company: actor.employer_id ? ActorDB.getCompanyName(actor.employer_id) : null,
      phone: actor.phone_numbers[0],
      isPlayer: false,
      sortOrder: idx + 2,
    });
  });

  patchState((s) => {
    s.player.blackCherryContacts = contacts;
    return s;
  });

  try {
    window.CCR?.syncFromPhoneBook?.();
  } catch (e) {
    console.warn('[WorldGen] CCR syncFromPhoneBook:', e);
  }
}

/**
 * Fire queued SMS events (Mom's welcome message).
 * Call from bootDesktop after a short delay.
 */
export function fireQueuedSmsEvents() {
  const pending = getState().player?.pendingSmsEvents;
  if (!Array.isArray(pending) || !pending.length) return;

  for (const ev of pending) {
    const delay = Number(ev.delayMs) || 0;
    setTimeout(() => {
      if (ev.type === 'sms_receive' && ev.actorId && ev.message) {
        SMS.receive(ev.actorId, ev.message, getState().sim?.elapsedMs || 0);
        const actor = ActorDB.getRaw(ev.actorId);
        const name = actor?.contactDisplayName || actor?.first_name || 'Unknown';
        const preview = String(ev.message).slice(0, 55);
        PeekManager.show({
          sender: name,
          preview,
          type: 'sms',
          targetId: ev.actorId,
          icon: '💬',
        });
      }
    }, delay);
  }

  patchState((s) => {
    s.player.pendingSmsEvents = [];
    return s;
  });
}
