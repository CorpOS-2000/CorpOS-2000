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
  if (ActorDB.count() > 0) {
    report = { generated: 0, valid: true };
  } else {
    report = await ActorDB.bootstrapPopulationAsync();
    console.log(`[WorldGen] NPC generation complete: ${report.generated} actors.`);
  }
  try {
    SaveManager.applyPendingDiscoveredActors();
  } catch (e) {
    console.warn('[WorldGen] applyPendingDiscoveredActors:', e);
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
  if (_playerGenComplete) return;
  if (st.player?.momActorId && ActorDB.getRaw('PLAYER_PRIMARY')) {
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
    .slice(0, 3);

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
