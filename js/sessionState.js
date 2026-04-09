import { emit } from './events.js';

const state = {
  browser: {
    favorites: []
  },
  desktop: {
    wallpaper: '#008080',
    customIcons: [],
    positions: {}
  },
  jeemail: {
    accounts: {},
    currentUser: null
  },
  wahoo: {
    accounts: {},
    currentUser: null
  },
  clipboard: {
    text: ''
  },
  banking: {
    /** Set by companion apps (e.g. Black Cherry) for dark-web onboarding. */
    darkWebReferralCode: null
  },
  /** David & Mitchell Banking — WorldNet session (not persisted beyond session). */
  dmb: {
    browserSessionUser: null,
    lastConfirmedAccount: null
  },
  /** Black Cherry™ handset — session-only state. */
  blackCherry: {
    inbox: [],
    recentCalls: [],
    pendingRudenessEvents: [],
  },
  /** Review Bomber — votes and live comments (session-only; not in save games). */
  reviewBomber: {
    /** postId -> { up, down } display counts (initialized from post stats, then mutated) */
    counts: {},
    /** postId -> 'up' | 'down' — current user's vote */
    userVote: {},
    /** postId -> { author, text, ts, postedGameDay?, source?, personality? }[] */
    liveComments: {},
    /** postId -> first-visit sim day (seeds + thread anchor for drip expiry) */
    postBaseDay: {},
    /** Sim-time ms deadline for next NPC comment batch (1d4 sim hours after each batch). */
    nextNpcDueSimMs: 0
  },
  /** yourspace.net — RTC feed / sim boundaries (session-only). */
  yourspace: {
    /** { id, actorId?, author, text, simMs, timeLabel }[] */
    rtcFeed: [],
    /** Last processed 2×sim-hour boundary (legacy; unused with rtcNextDueSimMs). */
    lastRtcBoundarySimMs: 0,
    /** Next sim-time ms when RTC batch runs; after each batch, advance by 1d4 sim hours. */
    rtcNextDueSimMs: 0,
    /** rtcPostId -> { up, down } */
    rtcCounts: {},
    /** rtcPostId -> 'up' | 'down' */
    rtcVote: {}
  },
  /** mytube.net — votes, comments, uploads (session-only). */
  mytube: {
    /** videoId -> { up, down } */
    videoCounts: {},
    /** videoId -> 'up' | 'down' */
    videoVote: {},
    /** `${videoId}:${commentId}` -> 'up' | 'down' */
    commentVote: {},
    /** videoId -> { id, author, text, up, down, source?, personality?, postedGameDay? }[] */
    comments: {},
    /** Player-uploaded catalog rows */
    uploads: [],
    /** Sim-time ms deadline for next NPC comment batch. */
    nextNpcDueSimMs: 0
  },
  /** Pipeline pages — live comment threads (session-only). */
  pipelineLive: {
    /** pageId -> { nextDueSimMs } */
    byPage: {},
    /** `${pageId}:${sectionId}` -> { comments: object[] } */
    threads: {}
  },
  /** Pending NPC replies to player posts (delivered after simMs delay). */
  pendingPlayerReplies: [],
  /** viewer username -> targetKey -> score (see social-affinity.js). */
  socialAffinity: {},
  /** Media Player — imported tracks (object URLs; session-only, not in save games). */
  mediaPlayer: {
    importedTracks: []
  },
  /** CorpOS Explorer — Cut/Copy clipboard for virtual files. */
  explorerClipboard: {
    mode: null,
    items: []
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getSessionState() {
  return state;
}

export function patchSession(mutator) {
  if (typeof mutator !== 'function') return;
  const draft = clone(state);
  mutator(draft);
  Object.assign(state, draft);
  emit('sessionChanged', state);
}

export function setClipboardText(text) {
  patchSession((s) => {
    s.clipboard.text = String(text || '');
  });
}
