/**
 * mom-actor.js — Generates a "Mom" actor after player enrollment.
 * Links to player via family relationship, adds to AXIS and contacts.
 */
import { getState, patchState } from './gameState.js';
import { ActorGenerator } from '../engine/ActorGenerator.js';

const MOM_PROFESSIONS = ['Homemaker', 'Teacher', 'Nurse', 'Retired', 'Secretary', 'Librarian'];

export function generateMomActor() {
  const state = getState();
  if (state.player?.momActorId) return state.player.momActorId;

  const playerLastName = state.player?.lastName || 'Smith';
  const profession = MOM_PROFESSIONS[Math.floor(Math.random() * MOM_PROFESSIONS.length)];

  const momData = ActorGenerator.generateOne({
    role: 'contact',
    profession,
    lifestyle_tier: 'middle',
    last_name: playerLastName,
    relationship_to_player: 'mother',
    is_key_character: false,
    taglets: ['pro_government', 'status_quo', 'vocal', 'optimistic_voice', 'community_first'],
  });

  momData.dcProfile = {
    affinity_check: 6,
    gossip_check: 12,
    info_check: 14,
    favor_check: 10,
    bribe_check: 18,
    intimidation_check: 20,
    trust_check: 8,
  };

  momData.relationships = [
    { actorId: state.player.actor_id, type: 'family', label: 'child', strength: 10 },
  ];

  momData.relationship_to_player = 'mother';

  if (window.ActorDB?.create) {
    try {
      window.ActorDB.create(momData);
    } catch {
      window.ActorDB._actors?.push?.(momData);
      window.ActorDB._rebuildIndexes?.();
    }
  }

  if (window.AXIS?.discover) {
    window.AXIS.discover(momData.actor_id, { source: 'family', note: 'Your mother.' });
  }
  if (window.AXIS?.updateScore) {
    window.AXIS.updateScore(momData.actor_id, 50, 'Family bond — Mom');
  }

  const momName = momData.public_profile?.display_name || momData.full_legal_name || 'Mom';
  const momPhone = momData.phone_numbers?.[0] || '—';

  patchState(s => {
    s.player.momActorId = momData.actor_id;

    if (!s.player.blackCherryContacts) s.player.blackCherryContacts = [];
    const existing = s.player.blackCherryContacts.find(c => c.actorId === momData.actor_id);
    if (!existing) {
      s.player.blackCherryContacts.unshift({
        actorId: momData.actor_id,
        displayName: '❤ Mom',
        phone: momPhone,
      });
    }

    if (!s.player.relationships) s.player.relationships = [];
    s.player.relationships.push({
      actorId: momData.actor_id,
      type: 'family',
      label: 'mother',
      strength: 10,
    });

    return s;
  });

  return momData.actor_id;
}

export function ensureMomExists() {
  const state = getState();
  if (!state.player?.corposEnrollmentComplete) return;
  if (state.player?.momActorId) return;
  generateMomActor();
}
