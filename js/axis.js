import {
  getGameEpochMs, getState, patchState, formatMoney,
  ccrListContracts, ccrActiveForNpc, ccrHasActiveContract,
  ccrCreateContract, ccrCompleteContract, ccrCancelContract,
  ccrAcknowledgeContract, ccrNegotiate, ccrContractTotal
} from './gameState.js';
import { saveAfterMutation } from '../engine/SaveManager.js';
import { toast, ToastManager } from './toast.js';
import { patchSession } from './sessionState.js';
import { openBlackCherryDialPreset } from './black-cherry.js';
import { SMS } from './bc-sms.js';
import { PeekManager } from './peek-manager.js';
import {
  MAIN_REQUIREMENTS, getRequirement, getUnlockedModules,
  getModuleById, computeMinTotal
} from './ccr-catalog.js';

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
  persistTimer: null,
  contractBuilder: null,
  msgMenuOpen: false
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
      intel_entries: [],
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

/** Actor IDs in the cell phone book (excluding the player) — canonical "people you know". */
function knownContactActorIds() {
  const ids = new Set();
  for (const row of getState().player?.blackCherryContacts || []) {
    const id = row?.actorId;
    if (id && id !== 'PLAYER_PRIMARY') ids.add(String(id));
  }
  return ids;
}

function filteredContacts() {
  const known = knownContactActorIds();
  const contacts = Object.keys(state.entries)
    .map(resolveContact)
    .filter(Boolean)
    .filter((contact) => known.has(String(contact.actorId)))
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

function buildProfileActions(actorId, entry) {
  const score = Number(entry.relationship_score || 0);
  const isHostile = score <= -55;
  const isFavorable = score >= 21;
  const canGather = score >= -20 && !isHostile;
  const owedFavors = (entry.favor_balance || 0) > 0;
  const actor = window.ActorDB?.getRaw?.(actorId);
  const hasPhone = !!(actor?.phone_numbers?.[0]);
  const dis = isHostile ? ' data-axis-disabled="1" title="Not available for hostile contacts"' : '';

  return `<div class="axis-actions">
    <button type="button" class="axis-action-btn"${isHostile ? ' data-axis-disabled="1" title="Cannot message hostile contacts"' : ''} data-axis-action="send-message">📱 Send Message</button>
    <button type="button" class="axis-action-btn" data-axis-action="msg-email">📧 Email</button>
    ${
  hasPhone
    ? `<button type="button" class="axis-action-btn" data-axis-action="call-contact"${dis}>📞 Call</button>`
    : ''
}
    <button type="button" class="axis-action-btn" data-axis-action="view-worldnet">🌐 View on YourSpace</button>
    ${isFavorable ? '<button type="button" class="axis-action-btn axis-action-btn--positive" data-axis-action="grant-favor">🤝 Offer Favor</button>' : ''}
    ${
  owedFavors
    ? `<button type="button" class="axis-action-btn axis-action-btn--positive" data-axis-action="call-favor">📋 Call In Favor (${entry.favor_balance} owed)</button>`
    : ''
}
    ${canGather ? '<button type="button" class="axis-action-btn" data-axis-action="gather-intel">🔍 Gather Intel</button>' : ''}
    ${
  !isHostile
    ? '<button type="button" class="axis-action-btn axis-action-btn--danger" data-axis-action="mark-hostile">⚠ Mark Hostile</button>'
    : '<button type="button" class="axis-action-btn axis-action-btn--warning" data-axis-action="reconcile">🕊 Attempt Reconcile ($500)</button>'
}
  </div>`;
}

function buildAgendaSurface(taglets, profession, employer, shift) {
  const lines = [];
  if (taglets.includes('vocal')) {
    lines.push(
      `${profession} at ${employer}. Frequently voices opinions publicly. Will engage on any topic.`
    );
  }
  if (taglets.includes('transactional')) {
    lines.push('Driven by value and practical outcomes. Decision-making is primarily transactional.');
  }
  if (taglets.includes('ambitious')) {
    lines.push('Career advancement is a primary motivator. Always working an angle.');
  }
  if (taglets.includes('cautious')) {
    lines.push('Risk-averse. Prefers to observe before committing. Hard to win over quickly.');
  }
  if (taglets.includes('community_hub')) {
    lines.push('Deeply invested in the community. Motivated by connections and mutual benefit.');
  }
  if (taglets.includes('generous')) {
    lines.push('Will help others when asked. Motivated by reciprocity and goodwill.');
  }
  if (taglets.includes('reclusive')) {
    lines.push('Private individual. Limited public engagement. Hard to read.');
  }
  if (taglets.includes('loyal')) {
    lines.push('Loyalty-driven. Once committed, reliable. Values long-term relationships.');
  }
  if (taglets.includes('information_broker')) {
    lines.push('Trades in information. Knows more than they share. Motivated by intelligence advantage.');
  }
  if (taglets.includes('contrarian')) {
    lines.push('Challenges established positions. Motivated by disruption and debate.');
  }
  if (!lines.length) lines.push(`${profession} at ${employer}. Motivations not yet apparent.`);
  if (shift === 'night') lines.push('Works nights — daytime contact attempts may go unanswered.');
  if (shift === 'evening') lines.push('Evening shift worker — early morning contact unlikely.');
  return lines;
}

function buildAgendaDeep(taglets, profession, employer, _actor) {
  const lines = [];
  if (taglets.includes('ambitious')) {
    lines.push(
      'Actively seeking advancement. May be willing to undermine colleagues if it benefits their trajectory.'
    );
  }
  if (taglets.includes('information_broker')) {
    lines.push("Gathering intelligence on multiple operators simultaneously. You are likely not their only contact.");
  }
  if (taglets.includes('transactional')) {
    lines.push(
      'Currently evaluating their financial position. Will respond well to offers that improve their net standing.'
    );
  }
  if (taglets.includes('cautious')) {
    lines.push('Has significant risk exposure they are protecting. Pressure points relate to public perception.');
  }
  if (taglets.includes('vocal')) {
    lines.push('Wants recognition and an audience. Providing a platform creates strong loyalty.');
  }
  if (taglets.includes('loyal')) {
    lines.push(
      'Has deep ties to a small circle. Access to that circle is the primary value of this relationship.'
    );
  }
  if (!lines.length) lines.push('Deeper profile requires additional intel operations.');
  return lines;
}

function buildAgendaLeverage(taglets, _actorId, entry) {
  const lines = [];
  if (taglets.includes('cautious')) {
    lines.push(
      'Vulnerability: reputation. Public pressure or visibility threats will cause immediate behavioral change.'
    );
  }
  if (taglets.includes('transactional')) {
    lines.push('Leverage point: financial offer or loss. They will respond to direct economic incentive or threat.');
  }
  if (taglets.includes('ambitious')) {
    lines.push('Leverage point: career threat. Anything that jeopardizes their advancement is a pressure point.');
  }
  if (taglets.includes('information_broker')) {
    lines.push('Leverage point: information reciprocity. They will trade intel for intel — they want what you know.');
  }
  if (taglets.includes('loyal')) {
    lines.push('Leverage point: their inner circle. A threat or offer involving their close contacts will move them.');
  }
  if ((entry.favor_balance || 0) > 0) {
    const n = entry.favor_balance;
    lines.push(`Active leverage: they owe you ${n} favor${n === 1 ? '' : 's'}. Call them in.`);
  }
  if (!lines.length) lines.push('No specific leverage identified at current intel level.');
  return lines;
}

function renderActorAgendaPanel(contact) {
  const { entry, actorId } = contact;
  const actor = window.ActorDB?.getRaw?.(actorId);
  const taglets = actor?.taglets || [];
  const intelLevel = entry.intel_level || 0;
  const relScore = entry.relationship_score || 0;
  const profession = actor?.profession || contact.profession || 'Unknown';
  const employer = actor?.employer_name || actor?.employer_id || contact.employer || 'unknown employer';
  const shift = actor?.work_schedule?.shift || 'day';
  const isLocked = intelLevel < 1 && relScore < 21;

  if (isLocked) {
    return `
<div class="axis-empty">Agenda unknown.</div>
<div class="axis-note">Build the relationship to Favorable (21+) or gather intel to unlock.</div>
<div class="axis-actions">
  <button type="button" class="axis-action-btn" data-axis-action="gather-intel">🔍 Gather Intel to Unlock</button>
</div>`;
  }

  const surfaceLines = buildAgendaSurface(taglets, profession, String(employer), shift);
  const deepLines = intelLevel >= 2 || relScore >= 51 ? buildAgendaDeep(taglets, profession, String(employer), actor) : null;
  const leverageLines = intelLevel >= 3 ? buildAgendaLeverage(taglets, actorId, entry) : null;

  return `
<div class="axis-agenda-wrap">
  <div class="axis-agenda-section">
    <div class="axis-agenda-label">Known Motivations</div>
    <div class="axis-agenda-body">${surfaceLines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
  </div>
  ${
  deepLines
    ? `
  <div class="axis-agenda-section">
    <div class="axis-agenda-label">Deeper Objectives <span class="axis-intel-badge">Intel ${intelLevel}</span></div>
    <div class="axis-agenda-body">${deepLines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
  </div>`
    : `
  <div class="axis-agenda-locked">
    <div class="axis-agenda-label">Deeper Objectives</div>
    <div class="axis-note">Requires Intel Level 2 or a Trusted (51+) relationship.</div>
    <button type="button" class="axis-action-btn" data-axis-action="gather-intel">🔍 Gather Intel</button>
  </div>`
}
  ${
  leverageLines
    ? `
  <div class="axis-agenda-section axis-agenda-leverage">
    <div class="axis-agenda-label">⚡ Leverage Points <span class="axis-intel-badge">Intel ${intelLevel}</span></div>
    <div class="axis-agenda-body">${leverageLines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
  </div>`
    : ''
}
  <div class="axis-actions">
    <button type="button" class="axis-action-btn" data-axis-action="gather-intel">🔍 Gather More Intel</button>
  </div>
</div>`;
}

function tabBody(contact) {
  if (state.activeTab === 'contracts') {
    return renderContractsModule();
  }
  if (state.activeTab === 'agenda') {
    if (!contact) {
      return '<div class="axis-empty">Select a contact to view their agenda.</div>';
    }
    return renderActorAgendaPanel(contact);
  }
  if (!contact) return '<div class="axis-empty">No contact selected.</div>';
  const { entry, actorId } = contact;
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
      ${buildProfileActions(actorId, entry)}
    </div>`;
  }
  if (state.activeTab === 'connections') {
    const rels = window.ActorDB?.getRelationships?.(actorId) || [];
    if (!rels.length) {
      return `
<div class="axis-empty">No known connections on record.</div>
<div class="axis-note">Intel operations may reveal additional connections.</div>
<div class="axis-actions">
  <button type="button" class="axis-action-btn" data-axis-action="gather-intel">🔍 Gather Intel to Find Connections</button>
</div>`;
    }
    return `
<div class="axis-connections-wrap">
  ${rels
    .slice(0, 12)
    .map((rel) => {
      const otherId = rel.actor_id || rel.actorId;
      const relActor = window.ActorDB?.getRaw?.(otherId);
      const relName = relActor?.public_profile?.display_name || relActor?.full_legal_name || otherId;
      const known = getEntry(otherId);
      const knownTier = known ? tierForScore(known.relationship_score) : null;
      const strength = Math.max(1, Math.min(100, Number(rel.strength || rel.connection_strength || 25)));
      const relType = rel.relationship_type || rel.type || 'Association';
      return `
<div class="axis-conn-row" data-axis-conn-actor="${escapeHtml(otherId)}">
  <div class="axis-conn-avatar" style="background:${knownTier?.color || '#888'}">
    ${(String(relName).charAt(0) || '?').toUpperCase()}
  </div>
  <div class="axis-conn-info">
    <div class="axis-conn-name">${escapeHtml(relName)}</div>
    <div class="axis-conn-type">${escapeHtml(relType)}${
  known
    ? ` · ${escapeHtml(knownTier?.label || 'Known')}`
    : ' · Unknown'}</div>
    <div class="axis-conn-bar-wrap">
      <div class="axis-conn-bar"><div style="width:${strength}%;background:#4488cc"></div></div>
    </div>
  </div>
  <div class="axis-conn-actions">
    ${
  known
    ? `<button type="button" class="axis-action-btn-sm" data-axis-jump="${escapeHtml(otherId)}">View</button>`
    : `<button type="button" class="axis-action-btn-sm axis-btn-discover" data-axis-discover="${escapeHtml(otherId)}">Discover</button>`
}
  </div>
</div>`;
    })
    .join('')}
</div>
<div class="axis-note">${rels.length > 12 ? `Showing 12 of ${rels.length} connections. ` : ''}Intel operations may reveal more.</div>`;
  }
  if (state.activeTab === 'intel') {
    const intelList = entry.intel_entries || [];
    const canGather = (entry.relationship_score || 0) >= -20;
    return `
<div class="axis-intel-wrap">
  ${
  intelList.length
    ? `<div class="axis-list">
        ${intelList
    .map(
      (intel) => `
        <div class="axis-intel-row">
          <div class="axis-intel-type">${escapeHtml(intel.type || 'Intel')}</div>
          <div class="axis-intel-desc">${escapeHtml(intel.description || '')}</div>
          <div class="axis-intel-date">${escapeHtml(formatGameDate(intel.at))}</div>
          <div class="axis-intel-source">via ${escapeHtml(intel.source || 'unknown')}</div>
        </div>`
    )
    .join('')}
       </div>`
    : '<div class="axis-empty">No intel gathered on this contact yet.</div>'
}
  <div class="axis-actions">
    ${
  canGather
    ? `<button type="button" class="axis-action-btn" data-axis-action="gather-intel">
           🔍 Gather Intel (D20 check)
         </button>`
    : `<button type="button" class="axis-action-btn" disabled title="Relationship too damaged to gather intel">
           🔍 Gather Intel (unavailable)
         </button>`
}
    <div class="axis-intel-note">
      Intel level: ${entry.intel_level || 0}/5 ·
      ${
  entry.intel_level >= 3
    ? 'Leverage identified'
    : entry.intel_level >= 1
      ? 'Partial profile'
      : 'No intel on file'
}
    </div>
  </div>
</div>`;
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

/* ── Contracts module rendering ──────────────────────── */

function contractRowHtml(c) {
  const req = getRequirement(c.mainRequirement);
  const issuer = window.AXIS?.resolveContact?.(c.issuerActorId)?.name || c.issuerActorId;
  const total = ccrContractTotal(c);
  const mods = c.moduleIds.map((m) => getModuleById(m)?.label || m).join(', ') || 'None';
  const statusCls = c.status === 'active' ? 'ccr-row-active' : c.status === 'completed' ? 'ccr-row-done' : 'ccr-row-cancelled';
  const ack = !c.acknowledged && c.status === 'active' ? ' <span class="ccr-unack">NEW</span>' : '';
  return `<tr class="${statusCls}">
    <td>${escapeHtml(c.id)}${ack}</td>
    <td>${escapeHtml(issuer)}</td>
    <td>${escapeHtml(req?.label || c.mainRequirement)}</td>
    <td>${escapeHtml(mods)}</td>
    <td>${escapeHtml(formatMoney(total))}</td>
    <td>${escapeHtml(c.status)}</td>
    <td>${c.status === 'active'
      ? `<button class="wbtn ccr-btn-sm" data-ccr-complete="${escapeHtml(c.id)}">Complete</button>
         <button class="wbtn ccr-btn-sm" data-ccr-cancel="${escapeHtml(c.id)}">Cancel</button>`
      : ''}</td>
  </tr>`;
}

function renderContractsModule() {
  const all = ccrListContracts();
  const active = all.filter((c) => c.status === 'active');
  const other = all.filter((c) => c.status !== 'active');
  const bld = state.contractBuilder;
  const showBuilder = !!bld;
  return `
    <div class="ccr-module">
      <div class="ccr-toolbar">
        <button class="wbtn" data-ccr-action="new-contract">+ Create Contract</button>
      </div>
      ${showBuilder ? renderContractBuilder() : ''}
      <div class="ccr-section-head">Active Contracts (${active.length})</div>
      ${active.length ? `<table class="ccr-tbl" cellpadding="0" cellspacing="0">
        <tr class="ccr-tbl-hdr"><td>ID</td><td>Issuer</td><td>Requirement</td><td>Modules</td><td>Price</td><td>Status</td><td></td></tr>
        ${active.map(contractRowHtml).join('')}
      </table>` : '<div class="axis-empty">No active contracts.</div>'}
      ${other.length ? `<div class="ccr-section-head" style="margin-top:10px;">Past Contracts (${other.length})</div>
        <table class="ccr-tbl" cellpadding="0" cellspacing="0">
        <tr class="ccr-tbl-hdr"><td>ID</td><td>Issuer</td><td>Requirement</td><td>Modules</td><td>Price</td><td>Status</td><td></td></tr>
        ${other.map(contractRowHtml).join('')}
      </table>` : ''}
    </div>`;
}

function resetBuilder() {
  state.contractBuilder = {
    issuerActorId: state.selectedActorId || '',
    mainRequirement: MAIN_REQUIREMENTS[0]?.id || '',
    moduleIds: [],
    basePriceInput: '',
    modulePrices: {},
    pickerOpen: false
  };
}

function renderContractBuilder() {
  const b = state.contractBuilder;
  if (!b) return '';
  const contacts = filteredContacts();
  const unlocked = getUnlockedModules(b.mainRequirement);
  const req = getRequirement(b.mainRequirement);
  const baseMin = req?.baseMinUsd || 0;
  const minTotal = computeMinTotal(b.mainRequirement, b.moduleIds);
  const baseNum = parseFloat(b.basePriceInput) || 0;
  const modTotal = b.moduleIds.reduce((s, mid) => s + (parseFloat(b.modulePrices[mid]) || 0), 0);
  const total = baseNum + modTotal;
  const hasActive = b.issuerActorId ? ccrHasActiveContract(b.issuerActorId) : false;
  const valid = baseNum >= baseMin && total >= minTotal && b.moduleIds.length > 0 && b.issuerActorId && !hasActive;

  return `<div class="ccr-builder">
    <div class="ccr-section-head">New Contract</div>
    <table class="ccr-form" cellpadding="0" cellspacing="0">
      <tr><td class="ccr-label">Issuer (Client):</td><td>
        <select data-ccr-field="issuer">${contacts.map((c) =>
          `<option value="${escapeHtml(c.actorId)}" ${c.actorId === b.issuerActorId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
        ).join('')}${!contacts.length ? '<option value="">No contacts</option>' : ''}</select>
        ${hasActive ? '<div class="ccr-warn">Contract already in progress with this client.</div>' : ''}
      </td></tr>
      <tr><td class="ccr-label">Main Requirement:</td><td>
        <select data-ccr-field="requirement">${MAIN_REQUIREMENTS.map((r) =>
          `<option value="${escapeHtml(r.id)}" ${r.id === b.mainRequirement ? 'selected' : ''}>${escapeHtml(r.label)} (min ${escapeHtml(formatMoney(r.baseMinUsd))})</option>`
        ).join('')}</select>
      </td></tr>
      <tr><td class="ccr-label">Base Price ($):</td><td>
        <input type="text" data-ccr-field="base-price" value="${escapeHtml(b.basePriceInput)}" placeholder="Min: ${baseMin}">
        ${baseNum > 0 && baseNum < baseMin ? '<span class="ccr-err">Below minimum</span>' : ''}
      </td></tr>
      <tr><td class="ccr-label">Modules:</td><td>
        <button class="wbtn" data-ccr-action="toggle-picker">+ Select Modules</button>
        ${b.moduleIds.length ? `<div class="ccr-chips">${b.moduleIds.map((mid) => {
          const mod = getModuleById(mid);
          return `<span class="ccr-chip">${escapeHtml(mod?.label || mid)} <span class="ccr-chip-x" data-ccr-rm-mod="${escapeHtml(mid)}">x</span></span>`;
        }).join('')}</div>` : '<div class="axis-empty" style="margin-top:4px;">No modules selected.</div>'}
      </td></tr>
      ${b.pickerOpen ? `<tr><td colspan="2">
        <div class="ccr-picker">
          ${unlocked.length ? `<table class="ccr-tbl" cellpadding="0" cellspacing="0">
            <tr class="ccr-tbl-hdr"><td></td><td>Module</td><td>Min. Cost</td><td>Your Price</td></tr>
            ${unlocked.map((m) => {
              const chk = b.moduleIds.includes(m.id);
              return `<tr><td><input type="checkbox" data-ccr-mod-chk="${escapeHtml(m.id)}" ${chk ? 'checked' : ''}></td>
                <td>${escapeHtml(m.label)}</td><td>${escapeHtml(formatMoney(m.minIncrementUsd))}</td>
                <td>${chk ? `<input type="text" class="ccr-mod-price" data-ccr-mod-price="${escapeHtml(m.id)}" value="${escapeHtml(String(b.modulePrices[m.id] ?? ''))}" placeholder="${m.minIncrementUsd}">` : '-'}</td></tr>`;
            }).join('')}
          </table>` : '<div class="axis-empty">No modules available. Install required software to unlock.</div>'}
          <button class="wbtn" data-ccr-action="toggle-picker">Done</button>
        </div>
      </td></tr>` : ''}
      <tr><td class="ccr-label">Total:</td><td>
        <b>${escapeHtml(formatMoney(total))}</b> (minimum: ${escapeHtml(formatMoney(minTotal))})
        ${total > 0 && total < minTotal ? ' <span class="ccr-err">Below minimum</span>' : ''}
        ${valid ? ' <span class="ccr-ok">Valid</span>' : ''}
      </td></tr>
      <tr><td colspan="2" style="text-align:right;padding-top:6px;">
        <button class="wbtn" data-ccr-action="cancel-builder">Cancel</button>
        <button class="wbtn ccr-btn-submit" data-ccr-action="submit-contract" ${!valid ? 'disabled' : ''}>Submit Contract</button>
      </td></tr>
    </table>
  </div>`;
}

/* ── Main render ────────────────────────────────────── */

function renderAxisUi() {
  const root = document.getElementById('axis-root');
  if (!root) return;

  const contacts = filteredContacts();
  const selected = resolveContact(state.selectedActorId);

  const contactContracts = state.selectedActorId
    ? ccrListContracts((c) => c.issuerActorId === state.selectedActorId || c.contractorId === state.selectedActorId)
    : [];
  const contactRole = contactContracts.some((c) => c.issuerActorId === state.selectedActorId && c.status === 'active')
    ? 'Issuer (Client)' : contactContracts.some((c) => c.contractorId === state.selectedActorId && c.status === 'active')
    ? 'Contractor' : 'Neutral';

  const CENTER_TABS = ['profile', 'contracts', 'agenda', 'connections', 'intel', 'history'];

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
          ${CENTER_TABS.map((tab) => {
            const label =
              tab === 'contracts' ? 'Contracts' : tab === 'agenda' ? 'Agenda' : tab[0].toUpperCase() + tab.slice(1);
            return `<button type="button" class="axis-tab ${tab === state.activeTab ? 'is-active' : ''}" data-axis-tab="${tab}">${escapeHtml(label)}</button>`;
          }).join('')}
        </div>
        <div class="axis-panel">
          ${selected ? `<div class="ccr-contact-role">Role: <b>${escapeHtml(contactRole)}</b> | Active contracts: ${contactContracts.filter((c) => c.status === 'active').length}</div>` : ''}
          ${tabBody(selected)}
          ${selected && contactContracts.length ? `<div class="ccr-section-head" style="margin-top:10px;">Contracts with ${escapeHtml(selected.name)}</div>
            <table class="ccr-tbl" cellpadding="0" cellspacing="0">
              <tr class="ccr-tbl-hdr"><td>ID</td><td>Requirement</td><td>Price</td><td>Status</td></tr>
              ${contactContracts.map((c) => {
                const req = getRequirement(c.mainRequirement);
                const total = ccrContractTotal(c);
                const cls = c.status === 'active' ? 'ccr-row-active' : c.status === 'completed' ? 'ccr-row-done' : '';
                return `<tr class="${cls}"><td>${escapeHtml(c.id)}</td><td>${escapeHtml(req?.label || c.mainRequirement)}</td><td>${escapeHtml(formatMoney(total))}</td><td>${escapeHtml(c.status)}</td></tr>`;
              }).join('')}
            </table>` : ''}
        </div>
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
    const topBtn = event.target.closest('[data-ccr-top]');
    if (topBtn) {
      state.topModule = topBtn.dataset.ccrTop || 'contacts';
      state.contractBuilder = null;
      renderAxisUi();
      return;
    }
    const contactEl = event.target.closest('[data-axis-contact]');
    if (contactEl) {
      state.selectedActorId = contactEl.getAttribute('data-axis-contact') || '';
      state.msgMenuOpen = false;
      state.activeTab = 'profile';
      renderAxisUi();
      return;
    }
    const tab = event.target.closest('[data-axis-tab]');
    if (tab) {
      state.activeTab = tab.getAttribute('data-axis-tab') || 'profile';
      state.msgMenuOpen = false;
      renderAxisUi();
      return;
    }
    const network = event.target.closest('[data-axis-network-actor]');
    if (network) {
      state.selectedActorId = network.getAttribute('data-axis-network-actor') || '';
      state.msgMenuOpen = false;
      state.activeTab = 'profile';
      renderAxisUi();
      return;
    }

    /* CCR contract actions */
    const ccrAction = event.target.closest('[data-ccr-action]')?.dataset.ccrAction;
    if (ccrAction === 'new-contract') {
      resetBuilder();
      state.activeTab = 'contracts';
      state.msgMenuOpen = false;
      renderAxisUi();
      return;
    }
    if (ccrAction === 'cancel-builder') { state.contractBuilder = null; renderAxisUi(); return; }
    if (ccrAction === 'toggle-picker' && state.contractBuilder) {
      state.contractBuilder.pickerOpen = !state.contractBuilder.pickerOpen;
      renderAxisUi();
      return;
    }
    if (ccrAction === 'submit-contract' && state.contractBuilder) {
      const b = state.contractBuilder;
      const baseNum = parseFloat(b.basePriceInput) || 0;
      const modPrices = {};
      b.moduleIds.forEach((mid) => {
        const mod = getModuleById(mid);
        modPrices[mid] = Math.max(parseFloat(b.modulePrices[mid]) || 0, mod?.minIncrementUsd || 0);
      });
      const c = ccrCreateContract({
        issuerActorId: b.issuerActorId,
        contractorId: 'player',
        mainRequirement: b.mainRequirement,
        moduleIds: b.moduleIds,
        basePriceUsd: baseNum,
        modulePriceUsd: modPrices
      });
      if (c) {
        toast({ title: 'Contract Created', message: `Contract ${c.id} submitted.`, icon: '📇', autoDismiss: 4000 });
        state.contractBuilder = null;
      }
      renderAxisUi();
      return;
    }

    const completeId = event.target.closest('[data-ccr-complete]')?.dataset.ccrComplete;
    if (completeId) {
      if (ccrCompleteContract(completeId)) {
        toast({ title: 'Contract Completed', message: `${completeId} marked complete.`, icon: '📇', autoDismiss: 4000 });
      }
      renderAxisUi();
      return;
    }
    const cancelId = event.target.closest('[data-ccr-cancel]')?.dataset.ccrCancel;
    if (cancelId) {
      if (ccrCancelContract(cancelId)) {
        toast({ title: 'Contract Cancelled', message: `${cancelId} cancelled.`, icon: '📇', autoDismiss: 4000 });
      }
      renderAxisUi();
      return;
    }
    const ackId = event.target.closest('[data-ccr-ack]')?.dataset.ccrAck;
    if (ackId) {
      ccrAcknowledgeContract(ackId);
      renderAxisUi();
      return;
    }
    const rmMod = event.target.closest('[data-ccr-rm-mod]')?.dataset.ccrRmMod;
    if (rmMod && state.contractBuilder) {
      state.contractBuilder.moduleIds = state.contractBuilder.moduleIds.filter((id) => id !== rmMod);
      delete state.contractBuilder.modulePrices[rmMod];
      renderAxisUi();
      return;
    }

    const jumpBtn = event.target.closest('[data-axis-jump]');
    if (jumpBtn) {
      state.selectedActorId = jumpBtn.getAttribute('data-axis-jump') || '';
      state.activeTab = 'profile';
      state.msgMenuOpen = false;
      renderAxisUi();
      return;
    }
    const discoverBtn = event.target.closest('[data-axis-discover]');
    if (discoverBtn) {
      const targetId = discoverBtn.getAttribute('data-axis-discover') || '';
      if (targetId && !getEntry(targetId)) {
        discover(targetId, {
          source: 'introduction',
          note: `Introduced through ${actorName(state.selectedActorId)}`
        });
        state.selectedActorId = targetId;
        state.activeTab = 'profile';
        renderAxisUi();
      } else {
        state.selectedActorId = targetId;
        state.activeTab = 'profile';
        renderAxisUi();
      }
      return;
    }

    const action = event.target.closest('[data-axis-action]')?.getAttribute('data-axis-action');
    const actionEl = event.target.closest('[data-axis-action]');
    if (actionEl?.hasAttribute('data-axis-disabled')) return;

    if (action === 'msg-email') {
      if (!state.selectedActorId) return;
      state.msgMenuOpen = false;
      const raw = window.ActorDB?.getRaw?.(state.selectedActorId);
      const email = raw?.emails?.[0] || '';
      if (!email) {
        toast({ title: 'No email', message: 'No email address on file for this contact.', icon: '📧', autoDismiss: 4000 });
        renderAxisUi();
        return;
      }
      patchSession((s) => {
        if (!s.jeemail) s.jeemail = { accounts: {}, currentUser: null, openMessage: null, composePrefill: null };
        s.jeemail.composePrefill = { to: email, subject: '', body: '' };
      });
      window.openW?.('worldnet');
      window.wnetGo?.('jeemail_compose');
      updateScore(state.selectedActorId, 1, 'Opened JeeMail compose from CCR');
      return;
    }
    if (action === 'send-message') {
      if (!state.selectedActorId) return;
      const aid = state.selectedActorId;
      window.openW?.('cherry');
      setTimeout(() => {
        if (window.bcPushView) window.bcPushView('messaging');
        setTimeout(() => {
          if (window.bcOpenThread) window.bcOpenThread(aid);
        }, 120);
      }, 220);
      updateScore(aid, 1, 'Player opened conversation via Black Cherry');
      toast({
        key: `axis_msg_${aid}`,
        title: 'Messaging',
        message: `Opening conversation with ${actorName(aid)}…`,
        icon: '📱',
        autoDismiss: 3000
      });
      return;
    }
    if (!action || !state.selectedActorId) return;
    const actorId = state.selectedActorId;
    const name = actorName(actorId);

    if (action === 'view-worldnet') {
      window.openW?.('worldnet');
      setTimeout(() => {
        window.wnetGo?.('yourspace', `profile/${actorId}`);
      }, 220);
      updateScore(actorId, 1, 'Player viewed profile on WorldNet');
      toast({
        key: `axis_view_${actorId}`,
        title: 'WorldNet',
        message: `Opening ${name}'s YourSpace profile…`,
        icon: '🌐',
        autoDismiss: 3000
      });
      return;
    }

    if (action === 'call-contact') {
      const actor = window.ActorDB?.getRaw?.(actorId);
      const phone = actor?.phone_numbers?.[0];
      if (!phone) {
        toast({ key: 'axis_no_phone', title: 'No Phone', message: 'No phone number on file for this contact.', icon: '📵', autoDismiss: 4000 });
        return;
      }
      window.openW?.('cherry');
      setTimeout(() => openBlackCherryDialPreset(phone), 200);
      updateScore(actorId, 1, 'Player called via Black Cherry');
      toast({ key: `axis_call_${actorId}`, title: 'Calling', message: `Dialing ${name}…`, icon: '📞', autoDismiss: 3000 });
      return;
    }

    if (action === 'grant-favor') {
      const result = grantFavor(actorId);
      if (result == null) {
        toast({ key: 'cant_grant', title: 'Cannot Offer', message: 'Relationship not strong enough to offer a favor.', icon: '🤝', autoDismiss: 4000 });
        return;
      }
      updateScore(actorId, 3, `Player offered a favor to ${name}`);
      setTimeout(() => {
        const ackPool = [
          `I appreciate that. I won't forget it.`,
          `You didn't have to do that. Consider it noted.`,
          `That's good to know. I owe you one.`,
          `Noted. When the time comes, I'll remember.`
        ];
        SMS.receive(actorId, ackPool[Math.floor(Math.random() * ackPool.length)], (getState().sim?.elapsedMs || 0) + 2000);
      }, 2000 + Math.random() * 3000);
      try {
        window.ActivityLog?.log?.('AXIS_FAVOR_GRANT', `Offered favor to ${name} (${actorId})`, { notable: true });
      } catch {
        /* ignore */
      }
      toast({
        key: `axis_favor_${actorId}`,
        title: 'Favor Offered',
        message: `${name} now owes you ${result} favor${result === 1 ? '' : 's'}.`,
        icon: '🤝',
        autoDismiss: 5000
      });
      renderAxisUi();
      return;
    }

    if (action === 'call-favor') {
      const result = callFavor(actorId);
      if (!result.ok) {
        toast({ key: 'axis_no_favor', title: 'No Favors', message: result.message, icon: '📋', autoDismiss: 4000 });
        return;
      }
      const entry = getEntry(actorId);
      let intel = { type: 'Network', description: '' };
      if (entry) {
        entry.intel_entries = Array.isArray(entry.intel_entries) ? entry.intel_entries : [];
        const intelTypes = [
          { type: 'Network', description: `${name} revealed two previously unknown contacts in their immediate circle.` },
          { type: 'Financial', description: `${name} disclosed irregular financial patterns at their employer.` },
          { type: 'Schedule', description: `${name} shared their daily routine and regular locations.` },
          { type: 'Compliance', description: `${name} hinted at unreported compliance issues in their workplace.` },
          { type: 'Leverage', description: `${name} shared a personal vulnerability that could be useful.` },
          {
            type: 'Employer',
            description: `${name} confirmed internal conflicts at ${
              window.ActorDB?.getRaw?.(actorId)?.employer_name || 'their employer'
            }.`
          }
        ];
        intel = intelTypes[Math.floor(Math.random() * intelTypes.length)];
        entry.intel_entries.push({
          ...intel,
          at: nowIso(),
          source: 'favor_called'
        });
        entry.intel_level = Math.min(5, (entry.intel_level || 0) + 1);
        queuePersist();
      }
      updateScore(actorId, -5, `Favor called in — ${name} may feel the relationship is strained`);
      setTimeout(() => {
        const deliverPool = [
          `Consider us even. Here's what I have.`,
          `Fine. I'm sending you what I know. We're square after this.`,
          `Alright. Here's the information. Don't ask how I got it.`,
          `I'm sending you something. Use it carefully.`
        ];
        const pre = deliverPool[Math.floor(Math.random() * deliverPool.length)];
        SMS.receive(
          actorId,
          `${pre} [${intel.type}: ${intel.description}]`,
          getState().sim?.elapsedMs || 0
        );
      }, 1500 + Math.random() * 4000);
      try {
        window.ActivityLog?.log?.(
          'AXIS_FAVOR_CALLED',
          `Favor called from ${name} — intel received: ${intel.type}`,
          { notable: true }
        );
      } catch {
        /* ignore */
      }
      toast({
        key: `axis_called_${actorId}`,
        title: 'Favor Delivered',
        message: `${name} came through. New intel in their file.`,
        icon: '📋',
        autoDismiss: 5000
      });
      renderAxisUi();
      return;
    }

    if (action === 'gather-intel') {
      const entry = ensureEntry(actorId);
      if (!entry) return;
      const confirmed = window.confirm(
        `Gather intel on ${name}?\n\n` +
          `• DC 12 check (Acumen modifier applies)\n` +
          `• +2 Notoriety regardless\n` +
          `• Failure: contact discovers — −5 relationship\n` +
          `• Success: new intel entry + level increase\n\n` +
          `Proceed?`
      );
      if (!confirmed) return;
      const acumen = Number(getState().player?.acumen || 10);
      const modifier = Math.floor((acumen - 10) / 2);
      const roll = Math.floor(Math.random() * 20) + 1 + modifier;
      const success = roll >= 12;
      patchState((st) => {
        st.corporateProfile = st.corporateProfile || {};
        st.corporateProfile.notoriety = Math.min(200, (st.corporateProfile.notoriety || 0) + 2);
        return st;
      });
      const rawActor = window.ActorDB?.getRaw?.(actorId);
      try {
        window.ActivityLog?.log?.('AXIS_INTEL_OP', `Intel operation on ${name} (${actorId}) — roll ${roll} — ${success ? 'SUCCESS' : 'DISCOVERED'}`, {
          suspicious: !success,
          notable: success
        });
      } catch {
        /* ignore */
      }
      if (success) {
        entry.intel_entries = Array.isArray(entry.intel_entries) ? entry.intel_entries : [];
        const peakHrs = rawActor?.work_schedule?.peak_hours;
        const peakStr = Array.isArray(peakHrs) ? peakHrs.slice(0, 3).map((h) => `${h}:00`).join(', ') : '—';
        const relLen = (rawActor?.relationships || []).length;
        const intelPool = [
          {
            type: 'Employment',
            description: `Confirmed: ${name} works ${rawActor?.work_schedule?.shift || 'day'} shift. Profession: ${rawActor?.profession || 'Unknown'}.`
          },
          { type: 'Taglets', description: `Behavioral profile: ${(rawActor?.taglets || []).join(', ') || 'No tags identified'}.` },
          { type: 'Schedule', description: `${name} is most active: ${peakStr}.` },
          { type: 'Connections', description: `${name} has ${relLen} known connections in the area.` },
          { type: 'District', description: `${name} is based in District ${rawActor?.districtId ?? 'Unknown'}.` },
          {
            type: 'Employer',
            description: `${name} is employed at: ${rawActor?.employer_name || 'Self-employed or unknown'}.`
          }
        ];
        const intel = intelPool[Math.floor(Math.random() * intelPool.length)];
        entry.intel_entries.push({ ...intel, at: nowIso(), source: 'investigation' });
        entry.intel_level = Math.min(5, (entry.intel_level || 0) + 1);
        updateScore(actorId, 0, 'Intel gathered');
        const desc = intel.description || '';
        toast({
          key: `axis_intel_${actorId}`,
          title: 'Intel Gathered',
          message: `${intel.type}: ${desc.slice(0, 70)}${desc.length > 70 ? '…' : ''}`,
          icon: '🔍',
          autoDismiss: 7000
        });
      } else {
        updateScore(actorId, -5, 'Contact discovered intel operation — trust damaged');
        const angryPool = [
          `I know what you're doing. Back off.`,
          `You're asking questions you shouldn't be asking. We're done.`,
          `Someone's been looking into my business. I know it's you.`
        ];
        setTimeout(() => {
          SMS.receive(actorId, angryPool[Math.floor(Math.random() * angryPool.length)], getState().sim?.elapsedMs || 0);
        }, 2000 + Math.random() * 3000);
        toast({
          key: `axis_intel_fail_${actorId}`,
          title: 'Discovered',
          message: `${name} found out. Relationship damaged. Check SMS.`,
          icon: '⚠',
          autoDismiss: 6000
        });
      }
      queuePersist();
      renderAxisUi();
      return;
    }

    if (action === 'reconcile') {
      const confirmed = window.confirm(
        `Attempt to reconcile with ${name}?\n\n` +
          `• Costs $500\n` +
          `• DC 15 roll — may fail\n` +
          `• Success: Hostile → Cold (−25 score)\n` +
          `• Failure: $500 lost, no change\n\n` +
          `Proceed?`
      );
      if (!confirmed) return;
      const st0 = getState();
      const bal = (st0.player?.hardCash || 0) + (st0.accounts || []).reduce((s, a) => s + Math.max(0, a.balance || 0), 0);
      if (bal < 500) {
        toast({ key: 'axis_no_funds', title: 'Insufficient Funds', message: 'Reconciliation costs $500.', icon: '💰', autoDismiss: 4000 });
        return;
      }
      patchState((st) => {
        const COST = 500;
        st.player = st.player || {};
        const hard = st.player.hardCash || 0;
        if (hard >= COST) {
          st.player.hardCash = hard - COST;
        } else {
          const remainder = COST - hard;
          st.player.hardCash = 0;
          const primary = (st.accounts || []).find((a) => a.isPrimary) || (st.accounts || []).find((a) => a.id === 'fncb');
          if (primary) primary.balance = (primary.balance || 0) - remainder;
        }
        return st;
      });
      const roll = Math.floor(Math.random() * 20) + 1;
      const success = roll >= 15;
      try {
        window.ActivityLog?.log?.('AXIS_RECONCILE', `Reconciliation attempt with ${name} — roll ${roll} — ${success ? 'ACCEPTED' : 'REJECTED'} — $500 spent`, { notable: true });
      } catch {
        /* ignore */
      }
      if (success) {
        const entry2 = ensureEntry(actorId);
        entry2.relationship_score = clampScore(-25);
        pushHistory(entry2, 'Reconciliation accepted — relationship partially restored', 0);
        try {
          const act = window.ActorDB?.getRaw?.(actorId);
          const playerId = getState().player?.actor_id || 'PLAYER_PRIMARY';
          if (act?.opinion_profile) act.opinion_profile[playerId] = -20;
        } catch {
          /* ignore */
        }
        const truePool = [
          `Fine. We can talk. Don't expect me to forget though.`,
          `Okay. Truce. For now.`,
          `Alright. I'm willing to move on. Slowly.`,
          `I appreciate that. It doesn't fix everything but it helps.`
        ];
        setTimeout(() => {
          SMS.receive(actorId, truePool[Math.floor(Math.random() * truePool.length)], getState().sim?.elapsedMs || 0);
        }, 2000 + Math.random() * 5000);
        toast({
          key: `axis_reconcile_${actorId}`,
          title: 'Reconciliation Accepted',
          message: `${name} has agreed to a truce. Relationship moved to Cold.`,
          icon: '🕊',
          autoDismiss: 6000
        });
      } else {
        toast({
          key: `axis_reconcile_fail_${actorId}`,
          title: 'Rejected',
          message: `${name} turned down your offer. $500 lost.`,
          icon: '❌',
          autoDismiss: 5000
        });
      }
      queuePersist();
      renderAxisUi();
      return;
    }

    if (action === 'mark-hostile') {
      const confirmed = window.confirm(
        `Mark ${name} as Hostile?\n\n` +
          `• Relationship drops to Hostile tier\n` +
          `• They may retaliate publicly\n` +
          `• Information brokers may report you\n` +
          `• +5 Notoriety\n\n` +
          `This cannot be easily undone.`
      );
      if (!confirmed) return;
      const entry = ensureEntry(actorId);
      const prevScore = entry.relationship_score;
      const delta = Math.min(-1, -55 - Number(prevScore || 0));
      updateScore(actorId, delta, 'Operator marked contact as hostile');

      try {
        const actor = window.ActorDB?.getRaw?.(actorId);
        const playerId = getState().player?.actor_id || 'PLAYER_PRIMARY';
        if (actor) {
          if (!actor.opinion_profile) actor.opinion_profile = {};
          const prevOp = actor.opinion_profile[playerId];
          actor.opinion_profile[playerId] = Math.min(prevOp != null ? prevOp : -50, -50);
        }
      } catch {
        /* ignore */
      }

      patchState((st) => {
        st.corporateProfile = st.corporateProfile || {};
        st.corporateProfile.notoriety = Math.min(200, (st.corporateProfile.notoriety || 0) + 5);
        return st;
      });

      try {
        window.ActivityLog?.log?.('AXIS_HOSTILE', `Contact ${name} (${actorId}) marked hostile — relationship terminated`, { notable: true });
      } catch {
        /* ignore */
      }

      const reactionPool = [
        `I heard what you did. Don't expect any help from me.`,
        `You think you can just cut people off? Fine. Remember this.`,
        `I know people. Now they'll know about you.`,
        `We're done. And I won't be quiet about it.`,
        `Interesting choice. Let's see how that works out for you.`,
        `I don't forget things like this.`
      ];
      setTimeout(() => {
        SMS.receive(
          actorId,
          reactionPool[Math.floor(Math.random() * reactionPool.length)],
          getState().sim?.elapsedMs || 0
        );
      }, 3000 + Math.random() * 5000);

      const tags = window.ActorDB?.getRaw?.(actorId)?.taglets || [];
      if (tags.includes('information_broker')) {
        ToastManager.fire({
          key: `broker_hostile_${actorId}`,
          title: 'Intel Risk',
          message: `${name} has information broker connections. They may share what they know with investigators.`,
          icon: '🕵',
          autoDismiss: 8000
        });
      }

      PeekManager.show({
        sender: name,
        preview: 'Relationship terminated — marked hostile',
        type: 'system',
        targetId: actorId,
        icon: '⚠'
      });

      try {
        window.dispatchEvent(new CustomEvent('axis:operator-hostile-mark', { detail: { actorId } }));
      } catch {
        /* ignore */
      }
      queuePersist();
      renderAxisUi();
      return;
    }
  });
  root.addEventListener('input', (event) => {
    if (event.target.id === 'axis-search') {
      state.search = event.target.value || '';
      renderAxisUi();
      return;
    }
    if (event.target.dataset.ccrField === 'base-price' && state.contractBuilder) {
      state.contractBuilder.basePriceInput = event.target.value;
      return;
    }
    const modPrice = event.target.dataset.ccrModPrice;
    if (modPrice && state.contractBuilder) {
      state.contractBuilder.modulePrices[modPrice] = event.target.value;
      return;
    }
  });
  root.addEventListener('change', (event) => {
    if (event.target.id === 'axis-filter') {
      state.filterTier = event.target.value || 'All';
      renderAxisUi();
      return;
    }
    if (event.target.dataset.ccrField === 'issuer' && state.contractBuilder) {
      state.contractBuilder.issuerActorId = event.target.value;
      renderAxisUi();
      return;
    }
    if (event.target.dataset.ccrField === 'requirement' && state.contractBuilder) {
      state.contractBuilder.mainRequirement = event.target.value;
      state.contractBuilder.moduleIds = [];
      state.contractBuilder.modulePrices = {};
      renderAxisUi();
      return;
    }
    const modChk = event.target.dataset.ccrModChk;
    if (modChk && state.contractBuilder) {
      if (event.target.checked) {
        if (!state.contractBuilder.moduleIds.includes(modChk)) state.contractBuilder.moduleIds.push(modChk);
      } else {
        state.contractBuilder.moduleIds = state.contractBuilder.moduleIds.filter((id) => id !== modChk);
        delete state.contractBuilder.modulePrices[modChk];
      }
      renderAxisUi();
    }
  });
}

const DISCOVERY_RELATION_MAP = {
  black_cherry: 'Contact',
  herald: 'Public Figure',
  worldnet: 'Online Contact',
  espionage: 'Intel Source',
  introduction: 'Introduction',
  contract: 'Business Contact',
  family: 'Family',
};

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

  addToBlackCherryContacts(actorId, discoveryContext);

  toast({
    key: 'contact_discovered',
    title: 'New Contact',
    message: `${actorName(actorId)} added to AXIS`,
    icon: '👤',
    autoDismiss: 5000
  });
  renderAxisUi();
  saveAfterMutation();
  return entry;
}

function addToBlackCherryContacts(actorId, discoveryContext = {}) {
  const actor = window.ActorDB?.getRaw?.(actorId);
  if (!actor) return;
  const st = getState();
  const bcContacts = st.player?.blackCherryContacts || [];
  if (bcContacts.some((c) => c.actorId === actorId)) return;

  const source = String(discoveryContext?.source || 'unknown');
  const relation = DISCOVERY_RELATION_MAP[source] || 'Contact';

  patchState((s) => {
    if (!Array.isArray(s.player.blackCherryContacts)) s.player.blackCherryContacts = [];
    s.player.blackCherryContacts.push({
      actorId,
      displayName: actor.contactDisplayName || actor.first_name || actor.full_legal_name,
      officialName: actor.full_legal_name,
      relationToPlayer: actor.relationToPlayer || relation,
      jobTitle: actor.profession || '',
      company: actor.employer_id ? (window.ActorDB?.getCompanyName?.(actor.employer_id) || null) : null,
      phone: actor.phone_numbers?.[0] || '—',
      isPlayer: false,
      sortOrder: s.player.blackCherryContacts.length,
      discoveredVia: source,
      discoveredDate: nowIso(),
    });
    return s;
  });
}

function recordIntel(actorId, row) {
  const entry = ensureEntry(actorId);
  if (!entry) return null;
  entry.intel_entries = Array.isArray(entry.intel_entries) ? entry.intel_entries : [];
  entry.intel_entries.push({
    type: row?.type || 'Intel',
    description: String(row?.description || ''),
    at: nowIso(),
    source: row?.source || 'dataminer'
  });
  entry.intel_level = Math.min(5, (entry.intel_level || 0) + 2);
  entry.agenda_known = true;
  pushHistory(entry, row?.description || 'Intelligence compiled', 0);
  queuePersist();
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
  if (!entry || (entry.relationship_score || 0) < 21) return null;
  entry.favor_balance += 1;
  queuePersist();
  return entry.favor_balance;
}

function callFavor(actorId) {
  const entry = ensureEntry(actorId);
  if (!entry || entry.favor_balance <= 0) {
    return { ok: false, message: 'No favor is currently owed by this contact.' };
  }
  entry.favor_balance -= 1;
  queuePersist();
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

export function hydrateAxisFromSave(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  state.entries = Object.create(null);
  for (const row of rows) {
    if (!row?.actor_id) continue;
    const id = String(row.actor_id);
    state.entries[id] = {
      actor_id: id,
      relationship_score: clampScore(row.relationship_score),
      favor_balance: Number(row.favor_balance || 0),
      discovered_date: row.discovered_date || nowIso(),
      last_contact_date: row.last_contact_date || null,
      agenda_known: !!row.agenda_known,
      intel_level: Number(row.intel_level || 0),
      intel_entries: Array.isArray(row.intel_entries) ? row.intel_entries : [],
      memory: Array.isArray(row.memory) ? row.memory : []
    };
  }
  queuePersist();
  renderAxisUi();
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
    intel_entries: Array.isArray(entry.intel_entries) ? entry.intel_entries : [],
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

function getSelectedActorId() {
  return state.selectedActorId || '';
}

function setSelectedActorId(actorId) {
  const id = String(actorId || '');
  if (id && getEntry(id)) {
    state.selectedActorId = id;
    renderAxisUi();
  }
}

/** Ensure AXIS entries exist for everyone in the phone book (no duplicate toasts per person). */
function syncPhoneBookToCcr() {
  const rows = getState().player?.blackCherryContacts || [];
  let added = 0;
  for (const row of rows) {
    if (!row?.actorId || row.actorId === 'PLAYER_PRIMARY') continue;
    if (getEntry(row.actorId)) continue;
    const entry = ensureEntry(row.actorId);
    if (!entry) continue;
    pushHistory(entry, 'Synced from your phone book.', 0);
    added++;
  }
  if (added > 0) {
    queuePersist();
    toast({
      title: 'CCR',
      message: `${added} contact${added === 1 ? '' : 's'} synced from your phone book.`,
      icon: '📇',
      autoDismiss: 4500
    });
  }
}

function _rivalCompanyName(st) {
  const rivals = st.rivalCompanies || [];
  if (!rivals.length) return 'a local company';
  const r = rivals[Math.floor(Math.random() * rivals.length)];
  return r?.tradingName || r?.name || 'a local company';
}

function _rivalNewsTip(st) {
  const news = st.newsRegistry || [];
  if (!news.length) return 'things are shifting in the market';
  const recent = news[news.length - 1];
  const h = recent?.headline || recent?.title || '';
  return h ? `"${h.slice(0, 60)}${h.length > 60 ? '…' : ''}"` : 'things are shifting in the market';
}

/** Nightly-ish outreach from contacts (invoked on a 6-hour in-game cadence from app). */
export function tickAxisNpcInitiatedContact(simMs) {
  const st = getState();
  const entries = Object.entries(state.entries || {});
  if (!entries.length) return;
  const sim = typeof simMs === 'number' ? simMs : st.sim?.elapsedMs || 0;

  for (const [actorId, entry] of entries) {
    const score = entry.relationship_score || 0;
    if (score < -10) continue;
    if (!knownContactActorIds().has(String(actorId))) continue;

    const baseChance = 0.03;
    const chance = baseChance + score / 200;
    if (Math.random() > chance) continue;

    const actor = window.ActorDB?.getRaw?.(actorId);
    if (!actor) continue;

    const taglets = actor.taglets || [];
    const name = actor.public_profile?.display_name || actor.full_legal_name?.split(' ')[0] || 'Your contact';
    let message = null;
    let scoreEffect = 0;

    if (taglets.includes('information_broker') && score >= 20) {
      const intelTips = [
        `Heard something you should know. ${_rivalNewsTip(st)}`,
        `Word in the market: there's unusual activity near District ${1 + Math.floor(Math.random() * 12)}.`,
        `Someone's asking questions about your business. Just so you know.`,
        'I picked up some chatter. Might be useful. Let\'s talk.'
      ];
      message = intelTips[Math.floor(Math.random() * intelTips.length)];
      scoreEffect = 1;
    } else if (taglets.includes('community_hub') && score >= 10) {
      const communityPool = [
        'Hey — there\'s something happening in the district you should know about.',
        'Checking in. Haven\'t heard from you in a while.',
        'Saw something that reminded me of our last conversation. Stay sharp out there.'
      ];
      message = communityPool[Math.floor(Math.random() * communityPool.length)];
      scoreEffect = 1;
    } else if (taglets.includes('vocal')) {
      const vocalPool = [
        'Just wanted to say — some people are talking about you. Not all of it\'s bad.',
        `Saw what happened with ${_rivalCompanyName(st)}. What do you think about that?`,
        'People in the district are curious about what you\'re building.'
      ];
      message = vocalPool[Math.floor(Math.random() * vocalPool.length)];
      scoreEffect = 0;
    } else if (score >= 50) {
      const trustedPool = [
        'Just checking in. How are things going on your end?',
        'Haven\'t heard from you. Everything alright?',
        'Had a thought about our last conversation. When you have a moment.'
      ];
      message = trustedPool[Math.floor(Math.random() * trustedPool.length)];
      scoreEffect = 2;
    }

    if (!message) continue;
    SMS.receive(actorId, message, sim);
    if (scoreEffect) {
      updateScore(actorId, scoreEffect, `${name} reached out proactively`);
    } else {
      entry.last_contact_date = nowIso();
      queuePersist();
    }
  }
}

function exposeAxis() {
  const api = {
    discover,
    updateScore,
    recordIntel,
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
    getSelectedActorId,
    setSelectedActorId,
    resolveContact,
    render: renderAxisUi,
    syncFromPhoneBook: syncPhoneBookToCcr,
    tickAxisNpcInitiatedContact
  };
  window.WorldNet = {
    ...(window.WorldNet || {}),
    axis: api
  };
  window.AXIS = api;
  window.CCR = api;
}

export async function initAxis(loadJson) {
  if (state.ready) {
    exposeAxis();
    bindAxisUi();
    syncPhoneBookToCcr();
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
      intel_entries: Array.isArray(row.intel_entries) ? row.intel_entries : [],
      memory: Array.isArray(row.memory) ? row.memory : []
    };
  });
  state.ready = true;
  exposeAxis();
  bindAxisUi();
  syncPhoneBookToCcr();
  window.addEventListener('corpos:window-state-changed', renderAxisUi);
  renderAxisUi();
}

