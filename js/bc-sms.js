/**
 * bc-sms.js — Threaded SMS system for Black Cherry.
 * Manages threads keyed by senderId, government sender registry, and unread counts.
 */
import { getState, patchState } from './gameState.js';

export const GOVERNMENT_SENDERS = {
  CORPOS_SYSTEM: { name: 'CORPOS SYSTEM', avatarColor: '#0a246a', avatarLabel: 'COS', number: 'CORPOS-2000', official: true },
  FRA: { name: 'Fed. Revenue Authority', avatarColor: '#333300', avatarLabel: 'FRA', number: 'FRA-GOV', official: true },
  FBCE: { name: 'Fed. Bureau Commerce', avatarColor: '#1a0066', avatarLabel: 'FBCE', number: 'FBCE-GOV', official: true },
  COMPLIANCE_MONITOR: { name: 'Compliance Monitor', avatarColor: '#003322', avatarLabel: 'MON', number: 'CORPOS-MON', official: true },
  INVESTIGATOR_T1: { name: null, avatarColor: '#442200', avatarLabel: 'INV', official: true },
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function ensureThreads() {
  const st = getState();
  if (!st.smsThreads || typeof st.smsThreads !== 'object') {
    patchState(s => { s.smsThreads = {}; return s; });
  }
}

function getOrCreateThread(senderId, senderName, official, avatarColor, avatarLabel) {
  ensureThreads();
  const st = getState();
  if (!st.smsThreads[senderId]) {
    patchState(s => {
      s.smsThreads[senderId] = {
        senderId,
        senderName: senderName || senderId,
        official: !!official,
        avatarColor: avatarColor || '#5a8a5a',
        avatarLabel: avatarLabel || (senderName || senderId)[0],
        messages: [],
        unreadCount: 0,
      };
      return s;
    });
  }
  return getState().smsThreads[senderId];
}

export const SMS = {
  send({ from, message, gameTime, actorId = null, actorName = null }) {
    const gov = GOVERNMENT_SENDERS[from];
    let senderId, senderName, official, avatarColor, avatarLabel;

    if (gov) {
      senderId = from;
      senderName = gov.name || actorName || from;
      if (from === 'INVESTIGATOR_T1' && actorName) senderName = actorName;
      official = true;
      avatarColor = gov.avatarColor;
      avatarLabel = gov.avatarLabel;
    } else if (actorId) {
      senderId = actorId;
      const actor = window.ActorDB?.getRaw?.(actorId);
      senderName = actorName || actor?.public_profile?.display_name || actor?.full_legal_name || actorId;
      official = false;
      avatarColor = '#5a8a5a';
      avatarLabel = (senderName || '?')[0];
    } else {
      senderId = from || 'SYSTEM';
      senderName = from || 'System';
      official = false;
      avatarColor = '#666';
      avatarLabel = '?';
    }

    getOrCreateThread(senderId, senderName, official, avatarColor, avatarLabel);

    patchState(s => {
      const thread = s.smsThreads[senderId];
      if (!thread) return s;
      thread.messages.push({
        id: uid(),
        text: message,
        simMs: gameTime || 0,
        direction: 'in',
        read: false,
      });
      thread.unreadCount = (thread.unreadCount || 0) + 1;
      return s;
    });
  },

  receive(actorId, message, gameTime) {
    const actor = window.ActorDB?.getRaw?.(actorId);
    const name = actor?.public_profile?.display_name || actor?.full_legal_name || actorId;
    this.send({ from: actorId, message, gameTime, actorId, actorName: name });
  },

  sendPlayerReply(senderId, message, gameTime) {
    ensureThreads();
    patchState(s => {
      const thread = s.smsThreads[senderId];
      if (!thread) return s;
      thread.messages.push({
        id: uid(),
        text: message,
        simMs: gameTime || 0,
        direction: 'out',
        read: true,
      });
      return s;
    });
  },

  getThread(senderId) {
    ensureThreads();
    return getState().smsThreads[senderId] || null;
  },

  getInbox() {
    ensureThreads();
    const threads = getState().smsThreads || {};
    return Object.values(threads)
      .filter(t => t.messages && t.messages.length > 0)
      .map(t => {
        const last = t.messages[t.messages.length - 1];
        return {
          senderId: t.senderId,
          senderName: t.senderName,
          official: t.official,
          avatarColor: t.avatarColor,
          avatarLabel: t.avatarLabel,
          lastMessage: last?.text || '',
          lastTime: last?.simMs || 0,
          unreadCount: t.unreadCount || 0,
        };
      })
      .sort((a, b) => b.lastTime - a.lastTime);
  },

  markRead(senderId) {
    ensureThreads();
    patchState(s => {
      const thread = s.smsThreads[senderId];
      if (!thread) return s;
      for (const m of thread.messages) m.read = true;
      thread.unreadCount = 0;
      return s;
    });
  },

  getUnreadCount() {
    ensureThreads();
    const threads = getState().smsThreads || {};
    let total = 0;
    for (const t of Object.values(threads)) total += (t.unreadCount || 0);
    return total;
  },

  searchMessages(query) {
    ensureThreads();
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    const threads = getState().smsThreads || {};
    const results = [];
    for (const t of Object.values(threads)) {
      for (const m of t.messages || []) {
        if (m.text.toLowerCase().includes(q)) {
          results.push({ senderId: t.senderId, senderName: t.senderName, message: m });
        }
      }
    }
    return results;
  },

  /** Display label for thread header / list (includes virtual system senders). */
  getDisplayName(actorId) {
    const systemSenders = {
      CORPOS_SYSTEM: 'CORPOS SYSTEM',
      FRA: 'Federal Revenue Authority',
      FBCE: 'Fed. Bureau of Commerce',
      COMPLIANCE_MONITOR: 'Compliance Monitor',
      CA_LOTTERY: 'CA Lottery Commission'
    };
    if (systemSenders[actorId]) return systemSenders[actorId];
    const actor = window.ActorDB?.get?.(actorId, 'social');
    if (actor) {
      return actor.public_profile?.display_name || actor.full_legal_name || actorId;
    }
    return actorId;
  },

  isGovernmentSender(actorId) {
    return ['CORPOS_SYSTEM', 'FRA', 'FBCE', 'COMPLIANCE_MONITOR'].includes(actorId);
  }
};
