/**
 * bc-conversation.js — Conversation engine for Black Cherry calls.
 * D20 rolls, option system with cooldowns, transcript rendering.
 */
import { getState } from './gameState.js';
import { rollD20 } from './d20.js';
import { SMS } from './bc-sms.js';

const SIM_DAY_MS = 86400000;

let convoState = null;

function getActorDC(actor, key) {
  return actor?.dcProfile?.[key] ?? 14;
}

function getAxisTier(actorId) {
  const score = window.AXIS?.getScore?.(actorId);
  if (score == null) return 'neutral';
  if (score >= 81) return 'trusted';
  if (score >= 51) return 'favorable';
  if (score >= 21) return 'acquainted';
  return 'neutral';
}

function checkCooldown(actorId, optionId, cooldownDays) {
  if (!cooldownDays || !window.ActorDB) return false;
  const actor = window.ActorDB.getRaw?.(actorId);
  if (!actor) return false;
  const simMs = getState().sim?.elapsedMs || 0;
  const mem = (actor.memory || []).find(m =>
    m.event === 'conversation_option' && m.optionId === optionId
  );
  if (!mem) return false;
  return (simMs - (mem.usedAtSimMs || 0)) < cooldownDays * SIM_DAY_MS;
}

function recordOptionUsed(actorId, optionId) {
  if (!window.ActorDB) return;
  const simMs = getState().sim?.elapsedMs || 0;
  const actor = window.ActorDB.getRaw?.(actorId);
  if (!actor) return;
  const existing = (actor.memory || []).find(m =>
    m.event === 'conversation_option' && m.optionId === optionId
  );
  if (existing) {
    existing.usedAtSimMs = simMs;
    existing.useCount = (existing.useCount || 0) + 1;
  } else {
    window.ActorDB.addMemory?.(actorId, {
      event: 'conversation_option',
      optionId,
      usedAtSimMs: simMs,
      useCount: 1,
    });
  }
}

function getMoneyUseCount(actorId) {
  const actor = window.ActorDB?.getRaw?.(actorId);
  if (!actor) return 0;
  const mem = (actor.memory || []).find(m =>
    m.event === 'conversation_option' && m.optionId === 'ask_money'
  );
  return mem?.useCount || 0;
}

function narrateRoll(roll, dc) {
  const margin = roll - dc;
  if (margin >= 8) return 'The conversation flows effortlessly.';
  if (margin >= 4) return 'Things go well — they warm to the topic.';
  if (margin >= 0) return 'It takes some coaxing, but you get through.';
  if (margin >= -4) return 'They try, but can\'t quite help right now.';
  return 'The conversation doesn\'t go where you hoped.';
}

function buildMomOptions(actorId) {
  const actor = window.ActorDB?.getRaw?.(actorId);
  return [
    {
      id: 'ask_how',
      label: 'Ask how she is',
      dcKey: 'affinity_check',
      dc: getActorDC(actor, 'affinity_check'),
      cooldownDays: 3,
      maxUses: null,
      onPass(roll) {
        window.AXIS?.updateScore?.(actorId, 4, 'Warm conversation with Mom');
        return { playerText: 'Hey Mom, how are you doing?', npcText: "Oh sweetheart! I'm doing just fine. Your father and I went to that new restaurant on Main Street last week. How's everything with you?", narrative: narrateRoll(roll, this.dc) };
      },
      onFail(roll) {
        return { playerText: 'Hey Mom, how are you?', npcText: "Oh honey, I'm actually right in the middle of something. Can I call you back?", narrative: narrateRoll(roll, this.dc) };
      }
    },
    {
      id: 'ask_gossip',
      label: 'Ask about CEO gossip',
      dcKey: 'gossip_check',
      dc: getActorDC(actor, 'gossip_check'),
      cooldownDays: 5,
      maxUses: null,
      onPass(roll) {
        const rumors = [
          "My friend Carol says that Gerald Hicks at First National is under some kind of review...",
          "I heard from someone at church that there's a company downtown having trouble with their suppliers.",
          "Patricia's husband works at the Commerce Department. She says they've been pulling files on somebody big.",
          "You know that new tech company in the Innovation Corridor? Word is they're about to get a big contract.",
        ];
        const rumor = rumors[Math.floor(Math.random() * rumors.length)];
        return { playerText: 'Mom, have you heard anything interesting about business around town?', npcText: `Well, you didn't hear this from me, but... ${rumor}`, narrative: narrateRoll(roll, this.dc) };
      },
      onFail(roll) {
        return { playerText: 'Mom, heard any business gossip?', npcText: "I don't really follow that sort of thing, dear. You know I don't pay attention to all that corporate nonsense.", narrative: narrateRoll(roll, this.dc) };
      }
    },
    {
      id: 'ask_stocks',
      label: 'Ask where to invest',
      dcKey: 'info_check',
      dc: 14,
      cooldownDays: 7,
      maxUses: null,
      onPass(roll) {
        const tips = [
          "Your Aunt Patricia's husband works at Hargrove Manufacturing and she says they've been very busy lately.",
          "I was talking to Mrs. Chen from next door — her son works at Valley Tech and says they just landed a big government contract.",
          "The ladies at the salon were all talking about that new shipping company down by the harbor. Apparently business is booming.",
        ];
        const tip = tips[Math.floor(Math.random() * tips.length)];
        return { playerText: 'Mom, any ideas about where to invest?', npcText: `Oh, well I'm not really one for stocks, but... ${tip}`, narrative: narrateRoll(roll, this.dc) };
      },
      onFail(roll) {
        if (roll <= 3) {
          return { playerText: 'Got any stock tips, Mom?', npcText: "Actually, yes! I think you should look into that company — oh what's it called — the one near the old mill. They seem to be doing wonderfully!", narrative: 'Her confidence is compelling, but something feels off about this advice.' };
        }
        return { playerText: 'Any investment advice?', npcText: "Oh honey, I just keep my money in savings. You should ask someone who actually knows about these things.", narrative: narrateRoll(roll, this.dc) };
      }
    },
    {
      id: 'ask_money',
      label: 'Ask for money',
      dcKey: 'favor_check',
      dc: 10,
      cooldownDays: 14,
      maxUses: 6,
      onPass(roll) {
        const amount = 1000 + Math.floor(Math.random() * 4) * 1000;
        const simMs = getState().sim?.elapsedMs || 0;
        import('./gameState.js').then(({ patchState }) => {
          patchState(s => {
            const newCash = Math.min(9999, (s.player.hardCash || 0) + amount);
            s.player.hardCash = newCash;
            if (!s.player.cashUpTransactions) s.player.cashUpTransactions = [];
            s.player.cashUpTransactions.unshift({ amount, description: 'Mom sent you cash', simMs });
            s.player.cashUpTransactions = s.player.cashUpTransactions.slice(0, 8);
            return s;
          });
        });
        setTimeout(() => {
          SMS.receive(actorId, "I put a little something in the mail for you. Don't tell your father.", simMs + 8 * 3600000);
        }, 200);
        return { playerText: 'Mom, I hate to ask, but... could you help me out a little?', npcText: `Oh sweetheart, of course. I'll send you $${amount.toLocaleString()}. Just... be careful with it, okay?`, narrative: narrateRoll(roll, this.dc) };
      },
      onFail(roll) {
        window.AXIS?.updateScore?.(actorId, -1, 'Awkward money request');
        return { playerText: 'Mom, I could really use some help financially...', npcText: "I'm sorry honey, things are a little tight for us right now too. I wish I could help more.", narrative: narrateRoll(roll, this.dc) };
      }
    },
    {
      id: 'goodbye',
      label: 'Goodbye',
      dcKey: null,
      dc: 0,
      cooldownDays: 0,
      maxUses: null,
      onPass() {
        window.AXIS?.updateScore?.(actorId, 1, 'Said goodbye politely');
        return { playerText: 'Alright Mom, I should get going. Love you.', npcText: "Love you too, sweetheart. Take care of yourself!", narrative: null, endsCall: true };
      },
      onFail() { return this.onPass(); }
    },
  ];
}

function buildGenericOptions(actorId) {
  const actor = window.ActorDB?.getRaw?.(actorId);
  return [
    {
      id: 'generic_chat',
      label: 'Small talk',
      dcKey: 'affinity_check',
      dc: getActorDC(actor, 'affinity_check'),
      cooldownDays: 1,
      maxUses: null,
      onPass(roll) {
        window.AXIS?.updateScore?.(actorId, 2, 'Pleasant conversation');
        return { playerText: 'So, how have things been?', npcText: "Pretty good, actually. Keeping busy.", narrative: narrateRoll(roll, this.dc) };
      },
      onFail(roll) {
        return { playerText: "What's new?", npcText: "Not much. Listen, I'm kind of busy right now.", narrative: narrateRoll(roll, this.dc) };
      }
    },
    {
      id: 'ask_info',
      label: 'Ask for information',
      dcKey: 'info_check',
      dc: getActorDC(actor, 'info_check'),
      cooldownDays: 3,
      maxUses: null,
      onPass(roll) {
        return { playerText: 'I was wondering if you could tell me something...', npcText: "Sure, what do you need to know?", narrative: narrateRoll(roll, this.dc) };
      },
      onFail(roll) {
        return { playerText: 'Got any information for me?', npcText: "I don't really know anything about that, sorry.", narrative: narrateRoll(roll, this.dc) };
      }
    },
    {
      id: 'goodbye',
      label: 'Goodbye',
      dcKey: null, dc: 0, cooldownDays: 0, maxUses: null,
      onPass() {
        window.AXIS?.updateScore?.(actorId, 1, 'Polite goodbye');
        return { playerText: 'Alright, talk to you later.', npcText: "Yeah, take care.", narrative: null, endsCall: true };
      },
      onFail() { return this.onPass(); }
    },
  ];
}

export function startConversation(actorId) {
  const actor = window.ActorDB?.getRaw?.(actorId);
  const name = actor?.public_profile?.display_name || actor?.full_legal_name || 'Unknown';
  const initial = name[0]?.toUpperCase() || '?';

  const isMom = actor?.relationship_to_player === 'mother' ||
    (actor?.relationships || []).some(r => r.type === 'family' && r.label === 'mother');
  const options = isMom ? buildMomOptions(actorId) : buildGenericOptions(actorId);

  const optionsWithCooldown = options.map(opt => ({
    ...opt,
    onCooldown: opt.cooldownDays > 0 && checkCooldown(actorId, opt.id, opt.cooldownDays),
    maxedOut: opt.maxUses != null && getMoneyUseCount(actorId) >= opt.maxUses && opt.id === 'ask_money',
  }));

  convoState = {
    actorId,
    actorName: name,
    actorInitial: initial,
    inCall: true,
    waitingForResponse: false,
    transcript: [
      { speaker: 'system', text: '…connected' },
    ],
    options: optionsWithCooldown,
  };

  return convoState;
}

export function selectConversationOption(optIndex) {
  if (!convoState || !convoState.inCall) return null;
  const opt = convoState.options[optIndex];
  if (!opt || opt.onCooldown || opt.maxedOut) return null;

  convoState.waitingForResponse = true;

  let result;
  if (opt.dcKey === null) {
    result = opt.onPass(20);
  } else {
    let dc = opt.dc;
    if (opt.id === 'ask_money') {
      const tier = getAxisTier(convoState.actorId);
      if (tier === 'trusted') dc = 6;
      else if (tier === 'favorable') dc = 10;
      else if (tier === 'acquainted') dc = 14;
      else dc = 18;

      if (opt.maxUses != null) {
        const uses = getMoneyUseCount(convoState.actorId);
        if (uses >= opt.maxUses) {
          convoState.transcript.push({ speaker: 'player', text: 'Mom, I could really use some help...' });
          convoState.transcript.push({ speaker: 'npc', text: "Honey, I've given you everything I can. You're going to have to figure this one out yourself." });
          convoState.waitingForResponse = false;
          return { endsCall: false };
        }
      }
    }

    const roll = rollD20();
    const success = roll >= dc;
    result = success ? opt.onPass(roll) : opt.onFail(roll);
  }

  convoState.transcript.push({ speaker: 'player', text: result.playerText });

  if (result.narrative) {
    convoState.transcript.push({ speaker: 'system', text: result.narrative });
  }

  setTimeout(() => {
    if (!convoState) return;
    convoState.transcript.push({ speaker: 'npc', text: result.npcText });
    convoState.waitingForResponse = false;
  }, 1000);

  if (opt.cooldownDays > 0) recordOptionUsed(convoState.actorId, opt.id);

  if (result.endsCall) {
    setTimeout(() => {
      if (convoState) convoState.inCall = false;
    }, 1500);
    return { endsCall: true };
  }

  return { endsCall: false };
}

export function endConversation() {
  convoState = null;
}

export function getConversationState() {
  return convoState;
}
