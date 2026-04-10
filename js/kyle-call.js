/**
 * kyle-call.js — Kyle Hargrove's scripted incoming call 10 seconds after desktop boot.
 * Ring loop, live transcript with typewriter effect, follow-up SMS, and AXIS hooks.
 */
import { PeekManager } from './peek-manager.js';
import { NotificationSound } from './notification-sound.js';
import { showLiveTranscript, triggerIncomingCall } from './black-cherry.js';
import { SMS } from './bc-sms.js';
import { getState } from './gameState.js';

const KYLE_ID = 'ACT-KYLE-HARGROVE';
let ringInterval = null;

function clearRing() {
  if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
}

const TRANSCRIPT = [
  { speaker: 'kyle',   text: "Hey! Congratulations on the new purchase.",                                            delay: 800  },
  { speaker: 'kyle',   text: "Glad to see you got everything set up.",                                               delay: 2400 },
  { speaker: 'kyle',   text: "Getting CorpOS running is half the battle — you're already ahead of the curve.",       delay: 3200 },
  { speaker: 'kyle',   text: "I just wanted to personally check in.",                                                delay: 2000 },
  { speaker: 'kyle',   text: "If you run into any issues, any at all, do not hesitate to reach out.",                delay: 3800 },
  { speaker: 'kyle',   text: "I'm going to send you a link to the official CorpOS portal right now.",                delay: 3000 },
  { speaker: 'kyle',   text: "They have a full orientation video on there — I'd recommend watching it.",             delay: 3200 },
  { speaker: 'kyle',   text: "Plus a welcome packet should be hitting your JeeMail today as well.",                  delay: 2800 },
  { speaker: 'kyle',   text: "Everything you need to get started.",                                                  delay: 2000 },
  { speaker: 'kyle',   text: "I wish I could talk longer but I've got three other accounts I'm juggling right now.", delay: 3600 },
  { speaker: 'kyle',   text: "You know how it is.",                                                                  delay: 1800 },
  { speaker: 'kyle',   text: "Alright — good luck out there. Talk soon.",                                            delay: 2400 },
  { speaker: 'player', text: "[Call ended]",                                                                         delay: 1200, isEnd: true },
];

function afterKyleCall() {
  setTimeout(() => {
    SMS.receive(
      KYLE_ID,
      "Here's that link I mentioned: http://www.corpos.gov.net/operators — check out the Orientation section. Good luck out there.",
      getState().sim?.elapsedMs || 0
    );
    PeekManager.show({
      sender: 'Kyle Hargrove',
      preview: "Here's that link I mentioned…",
      type: 'sms',
      targetId: KYLE_ID,
      icon: '💬',
    });
  }, 2000);

  if (window.AXIS?.discover) {
    window.AXIS.discover(KYLE_ID, {
      source: 'call_incoming',
      note: 'Kyle called on first day — CorpOS account manager.',
    });
  }
  if (window.AXIS?.updateScore) {
    window.AXIS.updateScore(KYLE_ID, 8, 'First call — professional and helpful');
  }
}

function handleKyleDecline() {
  clearRing();
  setTimeout(() => {
    SMS.receive(
      KYLE_ID,
      "Hey, it's Kyle from CorpOS. Tried to call — no worries. Just wanted to welcome you and share a link: http://www.corpos.gov.net/operators. Reach out if you need anything.",
      getState().sim?.elapsedMs || 0
    );
    PeekManager.show({
      sender: 'Kyle Hargrove',
      preview: "Hey, it's Kyle from CorpOS…",
      type: 'sms',
      targetId: KYLE_ID,
      icon: '💬',
    });
  }, 60000);

  if (window.AXIS?.discover) {
    window.AXIS.discover(KYLE_ID, {
      source: 'call_missed',
      note: 'Missed call from Kyle — CorpOS account manager.',
    });
  }
}

function handleKyleAnswer() {
  clearRing();
  showLiveTranscript({
    actorId: KYLE_ID,
    displayName: 'Kyle Hargrove',
    transcript: TRANSCRIPT,
    onComplete: afterKyleCall,
  });
}

export function triggerKyleCall() {
  const kyle = window.ActorDB?.getRaw?.(KYLE_ID);
  if (!kyle) return;

  const phone = kyle.phone_numbers?.[0] || '';
  const phoneFmt = phone.length >= 8 ? `(559) ${phone.slice(-8)}` : phone;

  PeekManager.show({
    sender: 'Kyle Hargrove is calling',
    preview: `CorpOS Account Manager · ${phoneFmt}`,
    type: 'call_incoming',
    targetId: KYLE_ID,
    icon: '📞',
  });

  triggerIncomingCall(KYLE_ID, {
    onAnswer: handleKyleAnswer,
    onDecline: handleKyleDecline,
  });

  NotificationSound.playRing();
  ringInterval = setInterval(() => NotificationSound.playRing(), 2500);
}
