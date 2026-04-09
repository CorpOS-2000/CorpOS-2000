import { getGameEpochMs, getState } from './gameState.js';
import { toast } from './toast.js';

export const RELATIONSHIP_TIERS = Object.freeze([
  { min: 81, max: 100, label: 'Trusted Ally', color: '#006600', bg: '#ccffcc' },
  { min: 51, max: 80, label: 'Favorable', color: '#004400', bg: '#88ff88' },
  { min: 21, max: 50, label: 'Acquainted', color: '#0a246a', bg: '#ccd6ff' },
  { min: -20, max: 20, label: 'Neutral', color: '#666666', bg: '#eeeeee' },
  { min: -50, max: -21, label: 'Cool', color: '#cc6600', bg: '#ffe0cc' },
  { min: -80, max: -51, label: 'Hostile', color: '#990000', bg: '#ffcccc' },
  { min: -100, max: -81, label: 'Enemy', color: '#660000', bg: '#ff8888' }
]);

const DECAY_RATES = Object.freeze({
  patient: 0.2,
  normal: 0.5,
  demanding: 1.0,
  volatile: 1.5
});

const FILTER_LABELS = Object.freeze([
  'All',
  'Trusted Ally',
  'Favorable',
  'Acquainted',
  'Neutral',
  'Cool',
  'Hostile',
  'Enemy'
]);

const state = {
  ready: false,
  entries: Object.create(null),
  selectedActorId: '',
  filterTier: 'All',
  search: '',
  activeTab: 'profile',
  persistTimer: null
};

function clampScore(value) {
  return Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
}

function nowSimMs() {
  return getState().sim?.elapsedMs ?? 0;
}

function nowIso() {
  return new Date(getGameEpochMs() + nowSimMs()).toISOString();
}

function formatGameDate(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function daysSince(iso) {
  if (!iso) return 'Unknown';
  const then = new Date(iso).getTime();
  const diff = Math.max(0, getGameEpochMs() + nowSimMs() - then);
  return Math.floor(diff / 86400000);
}

function queuePersist() {
  clearTimeout(state.persistTimer);
  state.persistTimer = setTimeout(saveAxisStore, 100);
}

async function saveAxisStore() {
  clearTimeout(state.persistTimer);
  state.persistTimer = null;
  if (!window.corpOS?.saveDataFile) return;
  try {
    await window.corpOS.saveDataFile(
      'axis/relationships.json',
      JSON.stringify(exportRelationships(), null, 2)
    );
  } catch {
    /* ignore persistence failures */
  }
}

function getEntry(actorId) {
  return state.entries[String(actorId || '')] || null;
}

function ensureEntry(actorId) {
  const id = String(actorId || '');
  if (!id) return null;
  if (!state.entries[id]) {
    state.entries[id] = {
      actor_id: id,
      relationship_score: 0,
      favor_balance: 0,
      discovered_date: nowIso(),
      last_contact_date: null,
      agenda_known: false,
      intel_level: 0,
      memory: []
    };
  }
  return state.entries[id];
}

function pushHistory(entry, description, delta = 0) {
  const score = clampScore(entry.relationship_score);
  entry.memory = Array.isArray(entry.memory) ? entry.memory : [];
  entry.memory.unshift({
    at: nowIso(),
    description,
    delta,
    score,
    tier: tierForScore(score).label
  });
  entry.memory = entry.memory.slice(0, 120);
}

function tierForScore(score) {
  return RELATIONSHIP_TIERS.find((tier) => score >= tier.min && score <= tier.max) || RELATIONSHIP_TIERS[3];
}

function actorLens(actorId, lens) {
  try {
    return window.ActorDB?.get ? window.ActorDB.get(actorId, lens) : null;
  } catch {
    return null;
  }
}

function actorName(actorId) {
  const email = actorLens(actorId, 'email');
  const forum = actorLens(actorId, 'forum');
  return (
    email?.public_profile?.display_name ||
    email?.full_legal_name ||
    forum?.public_profile?.display_name ||
    forum?.aliases?.[0] ||
    actorId
  );
}

function actorAlias(actorId) {
  const forum = actorLens(actorId, 'forum');
  return forum?.aliases?.[0] || '';
}

function actorEmployer(actorId) {
  const corp = actorLens(actorId, 'corporate');
  return {
    profession: corp?.profession || 'Unknown profession',
    employer: corp?.employer_id || 'Independent'
  };
}

function actorTaglets(actorId) {
  return actorLens(actorId, 'social')?.taglets || actorLens(actorId, 'forum')?.taglets || [];
}

function actorInitials(actorId) {
  const name = actorName(actorId);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'AX';
}

function resolveContact(actorId) {
  const entry = getEntry(actorId);
  if (!entry) return null;
  const tier = tierForScore(entry.relationship_score);
  const work = actorEmployer(actorId);
  return {
    actorId,
    entry,
    tier,
    name: actorName(actorId),
    alias: actorAlias(actorId),
    initials: actorInitials(actorId),
    profession: work.profession,
    employer: work.employer
  };
}

function filteredContacts() {
  const contacts = Object.keys(state.entries)
    .map(resolveContact)
    .filter(Boolean)
    .filter((contact) => {
      if (state.filterTier !== 'All' && contact.tier.label !== state.filterTier) return false;
      if (!state.search) return true;
      const hay = `${contact.name} ${contact.alias} ${contact.profession} ${contact.employer}`.toLowerCase();
      return hay.includes(state.search.toLowerCase());
    })
    .sort((a, b) => b.entry.relationship_score - a.entry.relationship_score || a.name.localeCompare(b.name));
  if (!state.selectedActorId && contacts[0]) state.selectedActorId = contacts[0].actorId;
  if (state.selectedActorId && !contacts.some((contact) => contact.actorId === state.selectedActorId)) {
    state.selectedActorId = contacts[0]?.actorId || '';
  }
  return contacts;
}

function drawNetworkMap() {
  const root = document.getElementById('axis-network-map');
  if (!root) return;
  const contacts = filteredContacts();
  if (contacts.length < 3) {
    root.innerHTML = '<div class="axis-network-placeholder">Network map populates as you build relationships.</div>';
    return;
  }
  const nodes = contacts.slice(0, 8);
  const centerX = 86;
  const centerY = 78;
  const radius = 54;
  const edges = [];
  nodes.forEach((contact) => {
    const rels = window.ActorDB?.getRelationships?.(contact.actorId) || [];
    rels.forEach((rel) => {
      if (nodes.some((node) => node.actorId === rel.actor_id)) {
        edges.push([contact.actorId, rel.actor_id, Number(rel.strength || rel.connection_strength || 1)]);
      }
    });
  });
  const positions = Object.fromEntries(
    nodes.map((contact, idx) => {
      const angle = (Math.PI * 2 * idx) / nodes.length;
      return [
        contact.actorId,
        {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        }
      ];
    })
  );
  root.innerHTML = `
    <svg viewBox="0 0 180 160" class="axis-network-svg">
      ${edges
        .map(([from, to, strength]) => {
          const a = positions[from];
          const b = positions[to];
          if (!a || !b) return '';
          return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke-width="${Math.max(
            1,
            Math.min(3, strength)
          )}" />`;
        })
        .join('')}
      ${nodes
        .map((contact) => {
          const pos = positions[contact.actorId];
          return `<g class="axis-network-node" data-axis-network-actor="${contact.actorId}">
            <circle cx="${pos.x}" cy="${pos.y}" r="8" fill="${contact.tier.color}"></circle>
            <text x="${pos.x}" y="${pos.y + 18}" text-anchor="middle">${escapeHtml(contact.name)}</text>
          </g>`;
        })
        .join('')}
    </svg>
  `;
}

function favorLabel(entry) {
  if (entry.favor_balance > 0) return `Contact owes you: ${entry.favor_balance} favor${entry.favor_balance === 1 ? '' : 's'}`;
  if (entry.favor_balance < 0) return `You owe: ${Math.abs(entry.favor_balance)} favor${Math.abs(entry.favor_balance) === 1 ? '' : 's'}`;
  return 'No favors';
}

function tabBody(contact) {
  if (!contact) return '<div class="axis-empty">No contact selected.</div>';
  const { entry } = contact;
  if (state.activeTab === 'profile') {
    const last = entry.memory?.[0];
    return `<div class="axis-profile">
      <div class="axis-profile-head">
        <div class="axis-avatar" style="background:${contact.tier.color};">${escapeHtml(contact.initials)}</div>
        <div>
          <div class="axis-contact-name">${escapeHtml(contact.name)}</div>
          <div class="axis-contact-alias">${escapeHtml(contact.alias || 'No alias on record')}</div>
          <div class="axis-contact-meta">${escapeHtml(contact.profession)} | ${escapeHtml(contact.employer)}</div>
        </div>
      </div>
      <div class="axis-tier-line">
        <span class="axis-tier-badge" style="background:${contact.tier.bg};color:${contact.tier.color};border-color:${contact.tier.color};">${escapeHtml(contact.tier.label)}</span>
        <div class="axis-rel-bar"><div class="axis-rel-fill" style="width:${Math.round(((entry.relationship_score + 100) / 200) * 100)}%;background:${contact.tier.color};"></div></div>
      </div>
      <div class="axis-kv"><span>Favor balance</span><span>${escapeHtml(favorLabel(entry))}</span></div>
      <div class="axis-kv"><span>Days since last contact</span><span>${escapeHtml(String(daysSince(entry.last_contact_date || entry.discovered_date)))}</span></div>
      <div class="axis-kv"><span>Last interaction</span><span>${escapeHtml(last?.description || 'Newly discovered contact')}</span></div>
      <div class="axis-actions">
        <button type="button" class="wbtn" data-axis-action="send-message">📱 Send Message</button>
        <button type="button" class="wbtn" data-axis-action="view-worldnet">📋 View on WorldNet</button>
        <button type="button" class="wbtn" data-axis-action="mark-hostile">⚠️ Mark Hostile</button>
      </div>
    </div>`;
  }
  if (state.activeTab === 'agenda') {
    if ((entry.intel_level || 0) < 1 && entry.relationship_score < 21) {
      return '<div class="axis-empty">Agenda unknown. Build the relationship or gather intel.</div>';
    }
    const surface = `${contact.name} appears focused on protecting their current position and improving their standing.`;
    const full = `${contact.name} is pursuing leverage, access, and insulation from public risk.`;
    const leverage = `${contact.name} is vulnerable to reputation pressure and favors tied to employer visibility.`;
    return `<div class="axis-rich-copy">
      <p>${escapeHtml(surface)}</p>
      ${(entry.intel_level || 0) >= 2 || entry.relationship_score >= 51 ? `<p>${escapeHtml(full)}</p>` : ''}
      ${(entry.intel_level || 0) >= 3 ? `<p><b>Leverage:</b> ${escapeHtml(leverage)}</p>` : ''}
    </div>`;
  }
  if (state.activeTab === 'connections') {
    const rels = window.ActorDB?.getRelationships?.(contact.actorId) || [];
    if (!rels.length) return '<div class="axis-empty">No known connections on record.</div>';
    return `<div class="axis-list">${rels
      .slice(0, 12)
      .map((rel) => {
        const known = getEntry(rel.actor_id);
        const name = known ? actorName(rel.actor_id) : 'Unknown contact';
        const strength = Math.max(1, Math.min(100, Number(rel.strength || rel.connection_strength || 25)));
        return `<div class="axis-list-row">
          <div>${escapeHtml(name)}</div>
          <div>${escapeHtml(rel.relationship_type || rel.type || 'Association')}</div>
          <div class="axis-conn-bar"><div style="width:${strength}%;"></div></div>
        </div>`;
      })
      .join('')}</div><div class="axis-note">More connections may be discoverable through intel operations.</div>`;
  }
  if (state.activeTab === 'intel') {
    const entries = entry.intel_entries || [];
    if (!entries.length) {
      return '<div class="axis-empty">No intel gathered on this contact.</div><div class="axis-actions"><button type="button" class="wbtn" disabled>🔍 Commission Intel</button></div>';
    }
    return `<div class="axis-list">${entries
      .map(
        (intel) => `<div class="axis-list-row"><div>${escapeHtml(intel.type || 'Intel')}</div><div>${escapeHtml(
          formatGameDate(intel.at)
        )}</div><div>${escapeHtml(intel.description || '')}</div></div>`
      )
      .join('')}</div>`;
  }
  const history = Array.isArray(entry.memory) ? entry.memory : [];
  if (!history.length) return '<div class="axis-empty">No relationship history on file.</div>';
  return `<div class="axis-history">${history
    .map((item) => {
      const tone = item.delta > 0 ? 'axis-delta-pos' : item.delta < 0 ? 'axis-delta-neg' : 'axis-delta-zero';
      const delta = item.delta > 0 ? `+${item.delta}` : String(item.delta || 0);
      return `<div class="axis-history-row">
        <div class="axis-history-date">${escapeHtml(formatGameDate(item.at))}</div>
        <div class="axis-history-copy">${escapeHtml(item.description)}</div>
        <div class="${tone}">${escapeHtml(delta)} → ${escapeHtml(String(item.score))} (${escapeHtml(item.tier)})</div>
      </div>`;
    })
    .join('')}</div>`;
}

function renderAxisUi() {
  const root = document.getElementById('axis-root');
  if (!root) return;
  const contacts = filteredContacts();
  const selected = resolveContact(state.selectedActorId);
  root.innerHTML = `
    <div class="axis-shell">
      <div class="axis-left">
        <div class="axis-search">
          <input id="axis-search" type="text" value="${escapeHtml(state.search)}" placeholder="Search contacts">
          <select id="axis-filter">${FILTER_LABELS.map((label) => `<option value="${escapeHtml(label)}" ${label === state.filterTier ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>
        </div>
        <div class="axis-contact-list">
          ${
            contacts.length
              ? contacts
                  .map(
                    (contact) => `<button type="button" class="axis-contact-row ${contact.actorId === state.selectedActorId ? 'is-selected' : ''}" data-axis-contact="${escapeHtml(contact.actorId)}">
                <div class="axis-contact-avatar" style="background:${contact.tier.color};">${escapeHtml(contact.initials)}</div>
                <div class="axis-contact-copy">
                  <div class="axis-contact-row-name">${escapeHtml(contact.name)}</div>
                  <div class="axis-contact-row-tier" style="color:${contact.tier.color};">${escapeHtml(contact.tier.label)}</div>
                  <div class="axis-mini-bar"><div style="width:${Math.round(((contact.entry.relationship_score + 100) / 200) * 100)}%;background:${contact.tier.color};"></div></div>
                </div>
              </button>`
                  )
                  .join('')
              : '<div class="axis-empty">No contacts discovered yet. New contacts appear here as you meet them.</div>'
          }
        </div>
      </div>
      <div class="axis-center">
        <div class="axis-tabs">
          ${['profile', 'agenda', 'connections', 'intel', 'history']
            .map(
              (tab) =>
                `<button type="button" class="axis-tab ${tab === state.activeTab ? 'is-active' : ''}" data-axis-tab="${tab}">${escapeHtml(tab[0].toUpperCase() + tab.slice(1))}</button>`
            )
            .join('')}
        </div>
        <div class="axis-panel">${tabBody(selected)}</div>
      </div>
      <div class="axis-right">
        <div class="axis-network-title">Network Map</div>
        <div id="axis-network-map" class="axis-network-wrap"></div>
      </div>
    </div>
  `;
  drawNetworkMap();
}

function bindAxisUi() {
  const root = document.getElementById('axis-root');
  if (!root || root.dataset.axisBound) return;
  root.dataset.axisBound = '1';
  root.addEventListener('click', (event) => {
    const contact = event.target.closest('[data-axis-contact]');
    if (contact) {
      state.selectedActorId = contact.getAttribute('data-axis-contact') || '';
      renderAxisUi();
      return;
    }
    const tab = event.target.closest('[data-axis-tab]');
    if (tab) {
      state.activeTab = tab.getAttribute('data-axis-tab') || 'profile';
      renderAxisUi();
      return;
    }
    const network = event.target.closest('[data-axis-network-actor]');
    if (network) {
      state.selectedActorId = network.getAttribute('data-axis-network-actor') || '';
      renderAxisUi();
      return;
    }
    const action = event.target.closest('[data-axis-action]')?.getAttribute('data-axis-action');
    if (!action || !state.selectedActorId) return;
    if (action === 'send-message') {
      window.openW?.('cherry');
      updateScore(state.selectedActorId, 1, 'Player initiated contact via Black Cherry');
      toast(`Black Cherry opened for ${actorName(state.selectedActorId)}.`);
      return;
    }
    if (action === 'view-worldnet') {
      window.openW?.('worldnet');
      window.wnetGo?.('home');
      toast(`WorldNet opened for ${actorName(state.selectedActorId)}.`);
      return;
    }
    if (action === 'mark-hostile') {
      const entry = ensureEntry(state.selectedActorId);
      const delta = Math.min(-1, -55 - Number(entry.relationship_score || 0));
      updateScore(state.selectedActorId, delta, 'Manual hostile override applied');
    }
  });
  root.addEventListener('input', (event) => {
    if (event.target.id === 'axis-search') {
      state.search = event.target.value || '';
      renderAxisUi();
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.id === 'axis-filter') {
      state.filterTier = event.target.value || 'All';
      renderAxisUi();
    }
  });
}

function discover(actorId, discoveryContext = {}) {
  const existing = getEntry(actorId);
  if (existing) return existing;
  const entry = ensureEntry(actorId);
  if (!entry) return null;
  if (!state.selectedActorId) state.selectedActorId = actorId;
  pushHistory(
    entry,
    discoveryContext?.note || `Discovered through ${String(discoveryContext?.source || 'unknown').replace(/_/g, ' ')}.`,
    0
  );
  queuePersist();
  toast({
    key: 'contact_discovered',
    title: 'New Contact',
    message: `${actorName(actorId)} added to AXIS`,
    icon: '👤',
    autoDismiss: 5000
  });
  renderAxisUi();
  return entry;
}

function updateScore(actorId, delta, reason) {
  const entry = ensureEntry(actorId);
  if (!entry) return 0;
  const prevTier = tierForScore(entry.relationship_score).label;
  entry.relationship_score = clampScore(entry.relationship_score + Number(delta || 0));
  entry.last_contact_date = nowIso();
  pushHistory(entry, reason || 'Relationship updated', Number(delta || 0));
  queuePersist();
  renderAxisUi();
  const nextTier = tierForScore(entry.relationship_score).label;
  if (prevTier !== nextTier) {
    toast({
      key: `axis_tier_${actorId}`,
      title: 'Relationship Updated',
      message: `${actorName(actorId)} is now ${nextTier}`,
      icon: '📇',
      autoDismiss: 4500
    });
  }
  return entry.relationship_score;
}

function getScore(actorId) {
  return getEntry(actorId)?.relationship_score ?? 0;
}

function getTier(actorId) {
  return tierForScore(getScore(actorId));
}

function grantFavor(actorId) {
  const entry = ensureEntry(actorId);
  if (!entry) return null;
  entry.favor_balance += 1;
  pushHistory(entry, 'Favor granted', 10);
  queuePersist();
  renderAxisUi();
  return entry.favor_balance;
}

function callFavor(actorId) {
  const entry = ensureEntry(actorId);
  if (!entry || entry.favor_balance <= 0) {
    return { ok: false, message: 'No favor is currently owed by this contact.' };
  }
  entry.favor_balance -= 1;
  pushHistory(entry, 'Favor called in by player', -5);
  queuePersist();
  renderAxisUi();
  return {
    ok: true,
    favor: 'One-time intel disclosure'
  };
}

function oweFavor(actorId) {
  const entry = ensureEntry(actorId);
  if (!entry) return null;
  entry.favor_balance -= 1;
  pushHistory(entry, 'Player now owes this contact a favor', 0);
  queuePersist();
  renderAxisUi();
  return entry.favor_balance;
}

function getContacts(filterTier = 'All') {
  const prev = state.filterTier;
  state.filterTier = filterTier || 'All';
  const rows = filteredContacts();
  state.filterTier = prev;
  return rows;
}

function getHistory(actorId) {
  return [...(getEntry(actorId)?.memory || [])];
}

function personalityDecayRate(actorId) {
  const tags = actorTaglets(actorId);
  if (tags.includes('patient')) return DECAY_RATES.patient;
  if (tags.includes('demanding')) return DECAY_RATES.demanding;
  if (tags.includes('volatile')) return DECAY_RATES.volatile;
  return DECAY_RATES.normal;
}

function processDecay() {
  Object.values(state.entries).forEach((entry) => {
    const score = Number(entry.relationship_score || 0);
    if (!score) return;
    const before = tierForScore(score).label;
    const rate = personalityDecayRate(entry.actor_id);
    const next = score > 0 ? Math.max(0, score - rate) : Math.min(0, score + rate);
    entry.relationship_score = clampScore(next);
    if (before !== tierForScore(entry.relationship_score).label) {
      toast({
        key: `relationship_decay_${entry.actor_id}`,
        title: 'Relationship Cooling',
        message: `${actorName(entry.actor_id)} has become ${tierForScore(entry.relationship_score).label}`,
        icon: '📱',
        autoDismiss: 5000
      });
    }
  });
  queuePersist();
  renderAxisUi();
}

function getNetworkMap() {
  return filteredContacts().map((contact) => ({
    actor_id: contact.actorId,
    name: contact.name,
    tier: contact.tier.label,
    relationships: window.ActorDB?.getRelationships?.(contact.actorId) || []
  }));
}

function exportRelationships() {
  return Object.values(state.entries).map((entry) => ({
    actor_id: entry.actor_id,
    relationship_score: entry.relationship_score,
    favor_balance: entry.favor_balance,
    discovered_date: entry.discovered_date,
    last_contact_date: entry.last_contact_date,
    agenda_known: !!entry.agenda_known,
    intel_level: Number(entry.intel_level || 0),
    memory: Array.isArray(entry.memory) ? entry.memory : []
  }));
}

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exposeAxis() {
  const api = {
    discover,
    updateScore,
    getScore,
    getTier,
    grantFavor,
    callFavor,
    oweFavor,
    getContacts,
    getHistory,
    processDecay,
    getNetworkMap,
    exportRelationships,
    render: renderAxisUi
  };
  window.WorldNet = {
    ...(window.WorldNet || {}),
    axis: api
  };
  window.AXIS = api;
}

export async function initAxis(loadJson) {
  if (state.ready) {
    exposeAxis();
    bindAxisUi();
    renderAxisUi();
    return;
  }
  let rows = [];
  try {
    const loaded = await loadJson('axis/relationships.json');
    rows = Array.isArray(loaded) ? loaded : [];
  } catch {
    rows = [];
  }
  rows.forEach((row) => {
    if (!row?.actor_id) return;
    state.entries[row.actor_id] = {
      actor_id: row.actor_id,
      relationship_score: clampScore(row.relationship_score),
      favor_balance: Number(row.favor_balance || 0),
      discovered_date: row.discovered_date || nowIso(),
      last_contact_date: row.last_contact_date || null,
      agenda_known: !!row.agenda_known,
      intel_level: Number(row.intel_level || 0),
      memory: Array.isArray(row.memory) ? row.memory : []
    };
  });
  state.ready = true;
  exposeAxis();
  bindAxisUi();
  window.addEventListener('corpos:window-state-changed', renderAxisUi);
  renderAxisUi();
}

