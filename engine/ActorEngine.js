import { ActorDB } from './ActorDB.js';
import { TagletEngine } from './TagletEngine.js';

function hourNow(gameTime) {
  if (typeof gameTime === 'number') return ((Math.floor(gameTime) % 24) + 24) % 24;
  if (gameTime instanceof Date) return gameTime.getHours();
  return new Date().getHours();
}

export const ActorEngine = {
  _activeIds: new Set(),
  _suspended: new Set(),
  _queue: [],

  init() {
    this._activeIds.clear();
    for (const actor of ActorDB.getAllRaw()) {
      if (actor.active !== false) this._activeIds.add(actor.actor_id);
    }
  },

  tick(gameTime) {
    const h = hourNow(gameTime);
    for (const actorId of this._activeIds) {
      if (this._suspended.has(actorId)) continue;
      const actor = ActorDB.getRaw(actorId);
      if (!actor) continue;
      const peaks = actor.activity_schedule?.peak_hours || [];
      if (!peaks.includes(h)) continue;
      const platforms = actor.activity_schedule?.platforms || [];
      const platform = platforms[Math.floor(Math.random() * Math.max(1, platforms.length))] || 'social';
      this.fireActivityEvent(actorId, platform);
    }
  },

  fireActivityEvent(actorId, platform) {
    const tendency = TagletEngine.getContentTendency(actorId) || 'general chatter';
    const descriptor = {
      actor_id: actorId,
      platform,
      tendency,
      behavior: TagletEngine.resolve(actorId, platform),
      created_at: new Date().toISOString()
    };
    this._queue.push(descriptor);
    return descriptor;
  },

  processEvent(eventObject) {
    const relevant = this.getRelevantActors(eventObject);
    for (const actorId of relevant) {
      ActorDB.addMemory(actorId, {
        type: eventObject?.type || 'world_event',
        payload: eventObject || null,
        at: new Date().toISOString()
      });
      ActorDB.updateOpinion(actorId, 'player', Number(eventObject?.playerImpact || 0));
    }
    return relevant;
  },

  getRelevantActors(eventObject) {
    const taglets = Array.isArray(eventObject?.taglets) ? eventObject.taglets : [];
    if (!taglets.length) return ActorDB.getAllRaw().slice(0, 20).map((a) => a.actor_id);
    return ActorDB.getAllRaw()
      .filter((a) => (a.taglets || []).some((t) => taglets.includes(t)))
      .map((a) => a.actor_id);
  },

  suspend(actorId) {
    this._suspended.add(actorId);
    return true;
  },

  resume(actorId) {
    this._suspended.delete(actorId);
    return true;
  },

  dequeueActivity() {
    return this._queue.shift() || null;
  }
};

