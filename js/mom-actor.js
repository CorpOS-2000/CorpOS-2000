/**
 * mom-actor.js — Legacy shim. Mom generation now handled by world-generation.js.
 * ensureMomExists delegates to the new pipeline for backward compatibility.
 */
import { getState } from './gameState.js';
import { generatePlayerAndMomAfterEnrollment } from './world-generation.js';

export function generateMomActor() {
  const state = getState();
  if (state.player?.momActorId) return state.player.momActorId;
  generatePlayerAndMomAfterEnrollment();
  return getState().player?.momActorId || null;
}

export function ensureMomExists() {
  const state = getState();
  if (!state.player?.corposEnrollmentComplete) return;
  if (state.player?.momActorId) return;
  generatePlayerAndMomAfterEnrollment();
}
