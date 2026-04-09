import { ensureContentRegistry } from '../content-registry-defaults.js';

function newId() {
  return `npc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultNpc(overrides = {}) {
  return {
    id: newId(),
    type: 'person',
    fullName: '',
    age: 0,
    dateOfBirth: '',
    gender: '',
    profession: '',
    employer: '',
    employerType: 'unemployed',
    homeAddress: '',
    phone: '',
    email: '',
    socialSecurityNumber: '',
    annualIncome: 0,
    netWorth: 0,
    lifestyle: 'middle',
    socialWeight: 0,
    socialWeightSource: '',
    perceptionStats: { public: 50, corporate: 50, government: 50 },
    opinionProfile: {
      playerOpinion: 0,
      corporateOpinion: 0,
      governmentOpinion: 0,
      corposOpinion: 0,
      rapidemartOpinion: 0
    },
    vulnerabilities: [],
    connectionNetwork: [],
    criminalRecord: [],
    contactAvailability: 'always',
    unlockRequirement: null,
    unlockCondition: '',
    blackCherryHandle: '',
    role: 'neutral',
    investigatorTier: null,
    modifiers: {},
    dialogueTags: [],
    loreNotes: '',
    isKeyCharacter: false,
    ...overrides
  };
}

/**
 * @param {{ getState: () => object, patchState: (fn: Function) => void, persistNpcs?: (npcs: object[]) => Promise<void> }} ctx
 */
export function createNpcCreatorApi(ctx) {
  function list() {
    const st = ctx.getState();
    ensureContentRegistry(st);
    return st.contentRegistry.npcs;
  }

  function writeNpcs(nextList) {
    ctx.patchState((st) => {
      ensureContentRegistry(st);
      st.contentRegistry.npcs = nextList;
      return st;
    });
    if (ctx.persistNpcs) {
      return ctx.persistNpcs(nextList);
    }
    return Promise.resolve();
  }

  return {
    create(npcData) {
      const npc = defaultNpc(npcData);
      if (npcData?.id) npc.id = npcData.id;
      const npcs = [...list(), npc];
      writeNpcs(npcs);
      return npc;
    },

    update(npcId, changes) {
      const npcs = list().map((n) => (n.id === npcId ? { ...n, ...changes, id: npcId } : n));
      if (!npcs.some((n) => n.id === npcId)) return null;
      writeNpcs(npcs);
      return npcs.find((n) => n.id === npcId);
    },

    delete(npcId) {
      const npcs = list().filter((n) => n.id !== npcId);
      const removed = npcs.length !== list().length;
      if (removed) {
        const cleaned = npcs.map((n) => ({
          ...n,
          connectionNetwork: (n.connectionNetwork || []).filter((c) => c.connectedId !== npcId)
        }));
        writeNpcs(cleaned);
      }
      return removed;
    },

    get(npcId) {
      return list().find((n) => n.id === npcId) || null;
    },

    getAll() {
      return [...list()];
    },

    getByRole(role) {
      return list().filter((n) => n.role === role);
    },

    getByAvailability(availability) {
      return list().filter((n) => n.contactAvailability === availability);
    },

    linkNPCs(npcId1, npcId2, relationshipType, strength = 5) {
      const npcs = list();
      const a = npcs.find((n) => n.id === npcId1);
      if (!a) return false;
      const conn = {
        connectedId: npcId2,
        relationshipType: relationshipType || 'unknown',
        strength: Math.min(10, Math.max(1, Number(strength) || 5))
      };
      const net = [...(a.connectionNetwork || []).filter((c) => c.connectedId !== npcId2), conn];
      return this.update(npcId1, { connectionNetwork: net }) != null;
    }
  };
}
