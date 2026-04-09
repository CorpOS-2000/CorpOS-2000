import { defaultNpc } from './pipeline/npc-creator.js';
import { defaultCompany, computeAdjustedValuation, judicialRecordDcModifier, reputationBonusFromPerception } from './pipeline/company-creator.js';
import { PIPELINE_PAGES_FILE } from './content-registry-defaults.js';
import { renderPageDefinitionHtml } from './worldnet-page-renderer.js';
import { getStoreById } from './worldnet-shop.js';
import { refreshPipelineRoutes } from './init-content-pipeline.js';
import { toast } from './toast.js';
import { layoutTemplateForCategory } from './worldnet-ad-schema.js';

const INDUSTRIES = [
  'Technology',
  'Retail & E-Commerce',
  'Manufacturing',
  'Transportation & Logistics',
  'Media & Entertainment',
  'Telecommunications',
  'Advertising & Marketing',
  'Data & Analytics',
  'Security & Cyber Operations',
  'Finance & Markets'
];

function $(sel, root = document) {
  return root.querySelector(sel);
}

function val(id, root) {
  const el = $(`#${id}`, root);
  return el ? el.value : '';
}

function num(id, root) {
  const n = Number(val(id, root));
  return Number.isFinite(n) ? n : 0;
}

function chk(id, root) {
  const el = $(`#${id}`, root);
  return !!(el && el.checked);
}

export function initAdminEditors() {
  mountNpcCreator();
  mountCompanyCreator();
  mountGovEditor();
  mountWebEditor();
}

function mountNpcCreator() {
  const root = document.getElementById('admin-npc-root');
  if (!root) return;
  const api = window.WorldNet?.npcs;
  if (!api) return;

  let editingId = null;

  function refreshSelect() {
    const sel = $('#npc-pick', root);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">— New NPC —</option>' + api.getAll().map((n) => `<option value="${n.id}">${n.fullName || n.id}</option>`).join('');
    sel.value = cur;
  }

  function loadNpc(id) {
    const n = id ? api.get(id) : defaultNpc({ id: '' });
    editingId = id || null;
    $('#npc-id', root).value = n.id || '';
    $('#npc-name', root).value = n.fullName || '';
    $('#npc-age', root).value = n.age ?? 0;
    $('#npc-dob', root).value = n.dateOfBirth || '';
    $('#npc-gender', root).value = n.gender || '';
    $('#npc-prof', root).value = n.profession || '';
    $('#npc-employer', root).value = n.employer || '';
    $('#npc-emptype', root).value = n.employerType || 'unemployed';
    $('#npc-addr', root).value = n.homeAddress || '';
    $('#npc-phone', root).value = n.phone || '';
    $('#npc-email', root).value = n.email || '';
    $('#npc-ssn', root).value = n.socialSecurityNumber || '';
    $('#npc-income', root).value = n.annualIncome ?? 0;
    $('#npc-worth', root).value = n.netWorth ?? 0;
    $('#npc-life', root).value = n.lifestyle || 'middle';
    $('#npc-sw', root).value = n.socialWeight ?? 0;
    $('#npc-swsrc', root).value = n.socialWeightSource || '';
    $('#npc-pp', root).value = n.perceptionStats?.public ?? 50;
    $('#npc-pc', root).value = n.perceptionStats?.corporate ?? 50;
    $('#npc-pg', root).value = n.perceptionStats?.government ?? 50;
    $('#npc-op-p', root).value = n.opinionProfile?.playerOpinion ?? 0;
    $('#npc-op-c', root).value = n.opinionProfile?.corporateOpinion ?? 0;
    $('#npc-op-g', root).value = n.opinionProfile?.governmentOpinion ?? 0;
    $('#npc-op-co', root).value = n.opinionProfile?.corposOpinion ?? 0;
    $('#npc-op-rm', root).value = n.opinionProfile?.rapidemartOpinion ?? 0;
    $('#npc-vuln', root).value = (n.vulnerabilities || []).join('\n');
    $('#npc-crime', root).value = JSON.stringify(n.criminalRecord || [], null, 0);
    $('#npc-avail', root).value = n.contactAvailability || 'always';
    $('#npc-unlock-req', root).value = n.unlockRequirement ?? '';
    $('#npc-unlock-cond', root).value = n.unlockCondition || '';
    $('#npc-bc', root).value = n.blackCherryHandle || '';
    $('#npc-role', root).value = n.role || 'neutral';
    $('#npc-inv-tier', root).value = n.investigatorTier ?? '';
    $('#npc-mods', root).value = JSON.stringify(n.modifiers || {}, null, 0);
    $('#npc-tags', root).value = (n.dialogueTags || []).join(', ');
    $('#npc-lore', root).value = n.loreNotes || '';
    $('#npc-key', root).checked = !!n.isKeyCharacter;
    renderConnRows(n.connectionNetwork || []);
    previewNpc();
    $('#npc-inv-wrap', root).style.display = n.role === 'investigator' ? 'block' : 'none';
  }

  function renderConnRows(conns) {
    const wrap = $('#npc-conn-list', root);
    if (!wrap) return;
    const others = api.getAll().filter((x) => x.id !== editingId && x.id !== $('#npc-id', root).value);
    wrap.innerHTML = (conns.length ? conns : [{}])
      .map(
        (c, i) => `<div class="ca-row" data-idx="${i}">
      <select class="nc-conn-id" style="flex:1">${others.map((o) => `<option value="${o.id}" ${c.connectedId === o.id ? 'selected' : ''}>${o.fullName || o.id}</option>`).join('')}</select>
      <select class="nc-conn-rel"><option>ally</option><option>rival</option><option>employer</option><option>employee</option><option>family</option><option>romantic</option><option>informant</option><option>unknown</option></select>
      <input class="nc-conn-str" type="number" min="1" max="10" value="${c.strength || 5}" style="width:48px">
      <button type="button" data-rm-conn="${i}">✕</button>
    </div>`
      )
      .join('');
    wrap.querySelectorAll('.nc-conn-rel').forEach((s, i) => {
      const rel = conns[i]?.relationshipType || 'unknown';
      if ([...s.options].some((o) => o.value === rel)) s.value = rel;
    });
    wrap.querySelectorAll('[data-rm-conn]').forEach((b) =>
      b.addEventListener('click', () => {
        const idx = Number(b.getAttribute('data-rm-conn'));
        const list = readConns();
        list.splice(idx, 1);
        renderConnRows(list);
      })
    );
  }

  function readConns() {
    const wrap = $('#npc-conn-list', root);
    const rows = [...wrap.querySelectorAll('.ca-row')];
    return rows
      .map((r) => ({
        connectedId: r.querySelector('.nc-conn-id')?.value || '',
        relationshipType: r.querySelector('.nc-conn-rel')?.value || 'unknown',
        strength: Number(r.querySelector('.nc-conn-str')?.value) || 5
      }))
      .filter((c) => c.connectedId);
  }

  function collect() {
    const id = val('npc-id', root).trim() || undefined;
    const base = editingId ? api.get(editingId) : defaultNpc({});
    return {
      ...base,
      ...(id ? { id } : {}),
      fullName: val('npc-name', root),
      age: num('npc-age', root),
      dateOfBirth: val('npc-dob', root),
      gender: val('npc-gender', root),
      profession: val('npc-prof', root),
      employer: val('npc-employer', root),
      employerType: val('npc-emptype', root),
      homeAddress: val('npc-addr', root),
      phone: val('npc-phone', root),
      email: val('npc-email', root),
      socialSecurityNumber: val('npc-ssn', root),
      annualIncome: num('npc-income', root),
      netWorth: num('npc-worth', root),
      lifestyle: val('npc-life', root),
      socialWeight: num('npc-sw', root),
      socialWeightSource: val('npc-swsrc', root),
      perceptionStats: { public: num('npc-pp', root), corporate: num('npc-pc', root), government: num('npc-pg', root) },
      opinionProfile: {
        playerOpinion: num('npc-op-p', root),
        corporateOpinion: num('npc-op-c', root),
        governmentOpinion: num('npc-op-g', root),
        corposOpinion: num('npc-op-co', root),
        rapidemartOpinion: num('npc-op-rm', root)
      },
      vulnerabilities: val('npc-vuln', root)
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      connectionNetwork: readConns(),
      criminalRecord: (() => {
        try {
          return JSON.parse(val('npc-crime', root) || '[]');
        } catch {
          return [];
        }
      })(),
      contactAvailability: val('npc-avail', root),
      unlockRequirement: val('npc-unlock-req', root) ? val('npc-unlock-req', root) : null,
      unlockCondition: val('npc-unlock-cond', root),
      blackCherryHandle: val('npc-bc', root),
      role: val('npc-role', root),
      investigatorTier: val('npc-inv-tier', root) ? val('npc-inv-tier', root) : null,
      modifiers: (() => {
        try {
          return JSON.parse(val('npc-mods', root) || '{}');
        } catch {
          return {};
        }
      })(),
      dialogueTags: val('npc-tags', root)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      loreNotes: val('npc-lore', root),
      isKeyCharacter: chk('npc-key', root)
    };
  }

  function fixInvTier(o) {
    const t = val('npc-inv-tier', root);
    o.investigatorTier = t ? t : null;
    if (val('npc-role', root) !== 'investigator') o.investigatorTier = null;
    return o;
  }

  function previewNpc() {
    const p = $('#npc-preview', root);
    if (!p) return;
    const n = collect();
    fixInvTier(n);
    const ps = n.perceptionStats || { public: 50, corporate: 50, government: 50 };
    p.innerHTML = `<div style="border:2px solid #333;padding:8px;background:#f5f5f5;font-size:11px;">
      <div style="font-weight:bold;color:#0a246a;">${n.blackCherryHandle || n.fullName || 'Contact'}</div>
      <div>${n.fullName || '—'}</div>
      <div><span style="background:#0a246a;color:#fff;padding:1px 6px;font-size:10px;">${n.role}</span> · ${n.contactAvailability}</div>
      <div style="margin-top:6px;font-size:10px;color:#444;">Perception — Pub ${ps.public} · Corp ${ps.corporate} · Gov ${ps.government}</div>
      <div class="ca-bar" style="margin-top:4px;"><span style="width:${ps.public}%"></span></div>
    </div>`;
  }

  root.innerHTML = `<div class="ca-toolbar">
    <select id="npc-pick"></select>
    <button type="button" id="npc-new">New</button>
    <button type="button" id="npc-save">Save to registry</button>
    <button type="button" id="npc-export">Export JSON</button>
    <label style="cursor:pointer"><input type="file" id="npc-import" accept="application/json" style="display:none">Import</label>
    <button type="button" id="npc-del">Delete</button>
  </div>
  <fieldset class="ca-fieldset"><legend>Identity</legend>
    <input type="hidden" id="npc-id">
    <div class="ca-row"><label>Name</label><input type="text" id="npc-name"></div>
    <div class="ca-row"><label>Age / DOB</label><input type="number" id="npc-age" style="width:60px"><input type="text" id="npc-dob" placeholder="Jan 1, 1970"></div>
    <div class="ca-row"><label>Gender</label><input type="text" id="npc-gender"></div>
    <div class="ca-row"><label>Profession</label><input type="text" id="npc-prof"></div>
    <div class="ca-row"><label>Employer</label><input type="text" id="npc-employer"></div>
    <div class="ca-row"><label>Employer type</label><select id="npc-emptype"><option>company</option><option>institution</option><option>self-employed</option><option>unemployed</option></select></div>
    <div class="ca-row"><label>Address</label><input type="text" id="npc-addr"></div>
    <div class="ca-row"><label>Phone</label><input type="text" id="npc-phone"></div>
    <div class="ca-row"><label>Email</label><input type="email" id="npc-email"></div>
    <div class="ca-row"><label>SSN</label><input type="text" id="npc-ssn"></div>
    <div class="ca-row"><label>Income / Net worth</label><input type="number" id="npc-income"><input type="number" id="npc-worth"></div>
    <div class="ca-row"><label>Lifestyle</label><select id="npc-life"><option>low</option><option>middle</option><option>upper-middle</option><option>wealthy</option><option>elite</option></select></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Social</legend>
    <div class="ca-row"><label>Social weight (0–100)</label><input type="range" id="npc-sw" min="0" max="100"> influence reach</div>
    <div class="ca-row"><label>Weight source</label><input type="text" id="npc-swsrc" placeholder="Publication, office, network…"></div>
    <div class="ca-row"><label>Perception P/C/G</label><input type="number" id="npc-pp" min="0" max="100"><input type="number" id="npc-pc" min="0" max="100"><input type="number" id="npc-pg" min="0" max="100"></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Opinions (−100…100)</legend>
    <div class="ca-row"><label>Player / Corp / Gov</label><input type="number" id="npc-op-p" min="-100" max="100"><input type="number" id="npc-op-c" min="-100" max="100"><input type="number" id="npc-op-g" min="-100" max="100"></div>
    <div class="ca-row"><label>CorpOS / RapidEMart</label><input type="number" id="npc-op-co" min="-100" max="100"><input type="number" id="npc-op-rm" min="-100" max="100"></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Vulnerabilities (one per line)</legend><textarea id="npc-vuln"></textarea></fieldset>
  <fieldset class="ca-fieldset"><legend>Connections</legend><div id="npc-conn-list"></div><button type="button" id="npc-conn-add">Add connection</button></fieldset>
  <fieldset class="ca-fieldset"><legend>Criminal record (JSON array)</legend><textarea id="npc-crime" rows="3">[]</textarea></fieldset>
  <fieldset class="ca-fieldset"><legend>Contact / role</legend>
    <div class="ca-row"><label>Availability</label><select id="npc-avail"><option>always</option><option>unlocked</option><option>hidden</option><option>dark-web-only</option></select></div>
    <div class="ca-row"><label>Unlock req / cond</label><input type="text" id="npc-unlock-req"><input type="text" id="npc-unlock-cond"></div>
    <div class="ca-row"><label>Black Cherry</label><input type="text" id="npc-bc"></div>
    <div class="ca-row"><label>Role</label><select id="npc-role"><option>contact</option><option>rival</option><option>investigator</option><option>neutral</option><option>story</option></select></div>
    <div id="npc-inv-wrap" class="ca-row" style="display:none"><label>Inv. tier</label><select id="npc-inv-tier"><option value="">—</option><option>Tier 1</option><option>Tier 2</option><option>Tier 3</option></select></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Modifiers (JSON object)</legend><textarea id="npc-mods" rows="2">{}</textarea></fieldset>
  <fieldset class="ca-fieldset"><legend>Lore & tags</legend>
    <div class="ca-row"><label>Dialogue tags</label><input type="text" id="npc-tags" placeholder="tag1, tag2"></div>
    <textarea id="npc-lore" placeholder="Designer notes"></textarea>
    <div class="ca-row"><label><input type="checkbox" id="npc-key"> Key character</label></div>
  </fieldset>
  <div class="ca-preview" id="npc-preview"></div>`;

  refreshSelect();
  loadNpc(null);

  $('#npc-pick', root).addEventListener('change', () => loadNpc($('#npc-pick', root).value || null));
  $('#npc-new', root).addEventListener('click', () => {
    $('#npc-pick', root).value = '';
    loadNpc(null);
  });
  $('#npc-save', root).addEventListener('click', () => {
    const o = collect();
    fixInvTier(o);
    if (!o.fullName) {
      toast('Name required');
      return;
    }
    if (editingId) api.update(editingId, o);
    else {
      delete o.id;
      api.create(o);
    }
    refreshSelect();
    toast('NPC saved');
  });
  $('#npc-export', root).addEventListener('click', () => {
    const o = collect();
    fixInvTier(o);
    const blob = new Blob([JSON.stringify(o, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${o.fullName.replace(/\W+/g, '_') || 'npc'}.json`;
    a.click();
  });
  $('#npc-import', root).addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const j = JSON.parse(r.result);
        editingId = null;
        $('#npc-pick', root).value = '';
        Object.assign(j, { id: j.id || '' });
        loadNpc(null);
        $('#npc-id', root).value = j.id || '';
        $('#npc-name', root).value = j.fullName || '';
        /* simplified: re-open load by assigning fields */
        loadNpc(null);
        $('#npc-name', root).value = j.fullName || '';
        previewNpc();
        toast('Imported — review and Save');
      } catch {
        toast('Invalid JSON');
      }
    };
    r.readAsText(f);
  });
  $('#npc-del', root).addEventListener('click', () => {
    if (editingId && confirm('Delete NPC?')) {
      api.delete(editingId);
      refreshSelect();
      loadNpc(null);
    }
  });
  $('#npc-conn-add', root).addEventListener('click', () => renderConnRows([...readConns(), {}]));
  $('#npc-role', root).addEventListener('change', () => {
    $('#npc-inv-wrap', root).style.display = val('npc-role', root) === 'investigator' ? 'block' : 'none';
    previewNpc();
  });
  root.addEventListener('input', (e) => {
    if (e.target && e.target.id && e.target.id.startsWith('npc-')) previewNpc();
  });
}

function mountCompanyCreator() {
  const root = document.getElementById('admin-company-root');
  if (!root || !window.WorldNet?.companies) return;
  const api = window.WorldNet.companies;
  let editingId = null;

  function refreshPick() {
    const sel = $('#co-pick', root);
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">— New Company —</option>' +
      api.getAll().map((c) => `<option value="${c.id}">${c.tradingName || c.legalName || c.id}</option>`).join('');
    sel.value = cur;
  }

  function loadCo(id) {
    const c = id ? api.get(id) : defaultCompany({ id: '' });
    editingId = id || null;
    $('#co-id', root).value = c.id || '';
    $('#co-legal', root).value = c.legalName || '';
    $('#co-trade', root).value = c.tradingName || '';
    $('#co-entity', root).value = c.entityType || 'LLC';
    $('#co-ind', root).value = c.industry || '';
    $('#co-reg', root).value = c.registrationNumber || '';
    $('#co-regd', root).value = c.registrationDate || '';
    $('#co-hq', root).value = c.hqLocation || '';
    $('#co-rev', root).value = c.weeklyRevenue ?? 0;
    $('#co-exp', root).value = c.weeklyExpenses ?? 0;
    $('#co-assets', root).value = c.totalAssets ?? 0;
    $('#co-debt', root).value = c.totalDebt ?? 0;
    $('#co-liab', root).value = c.totalLiabilities ?? 0;
    $('#co-emp', root).value = c.employeeCount ?? 0;
    $('#co-tier', root).value = c.tier ?? 1;
    $('#co-pp', root).value = c.perceptionStats?.public ?? 50;
    $('#co-pc', root).value = c.perceptionStats?.corporate ?? 50;
    $('#co-pg', root).value = c.perceptionStats?.government ?? 50;
    $('#co-not', root).value = c.notoriety ?? 0;
    $('#co-ce', root).value = c.corporateExposure ?? 0;
    $('#co-law', root).value = c.activeLawyer || 'none';
    $('#co-inv', root).value = c.activeInvestigator ?? '';
    $('#co-jr', root).value = JSON.stringify(c.judicialRecord || [], null, 0);
    $('#co-owner', root).value = c.ownerType || 'npc';
    $('#co-ownerid', root).value = c.ownerId ?? '';
    $('#co-player', root).checked = !!c.isPlayerCompany;
    $('#co-slot', root).value = c.companySlot ?? '';
    $('#co-parent', root).value = c.parentHolding ?? '';
    $('#co-subs', root).value = (c.subsidiaries || []).join(', ');
    ['soc', 'esp', 'sab', 'cyb', 'leg'].forEach((k, i) => {
      const keys = ['social', 'espionage', 'sabotage', 'cyber', 'legal'];
      $(`#co-cap-${k}`, root).checked = !!(c.combatCapabilities && c.combatCapabilities[keys[i]]);
    });
    $('#co-personality', root).value = c.personalityType || 'balanced';
    $('#co-r-aw', root).value = c.rivalBehavior?.awarenessThreshold ?? 0;
    $('#co-r-ds', root).value = c.rivalBehavior?.decisionStyle || 'reactive';
    $('#co-r-mem', root).value = c.rivalBehavior?.memoryDuration ?? 0;
    $('#co-r-all', root).checked = !!c.rivalBehavior?.allianceCapable;
    $('#co-r-scale', root).value = c.rivalBehavior?.scalingType || 'player-tied';
    $('#co-lore', root).value = c.loreNotes || '';
    $('#co-key', root).checked = !!c.isKeyCompany;
    $('#co-rival-wrap', root).style.display = c.ownerType === 'rival' ? 'block' : 'none';
    const v = computeAdjustedValuation(c);
    $('#co-val-ro', root).textContent = v.toLocaleString();
    $('#co-rep-ro', root).textContent = reputationBonusFromPerception(c.perceptionStats).toLocaleString();
    $('#co-jr-dc', root).textContent = String(judicialRecordDcModifier((c.judicialRecord || []).length));
    const fresh = c.id ? api.get(c.id) : null;
    $('#co-led-ro', root).textContent = fresh ? `${fresh.ledgerRanking} · Contract tier ${fresh.contractTier}` : '—';
    previewCo(c);
  }

  function readCo() {
    const caps = {
      social: chk('co-cap-soc', root),
      espionage: chk('co-cap-esp', root),
      sabotage: chk('co-cap-sab', root),
      cyber: chk('co-cap-cyb', root),
      legal: chk('co-cap-leg', root)
    };
    const base = editingId ? api.get(editingId) : defaultCompany({});
    return {
      ...base,
      legalName: val('co-legal', root),
      tradingName: val('co-trade', root),
      entityType: val('co-entity', root),
      industry: val('co-ind', root),
      registrationNumber: val('co-reg', root),
      registrationDate: val('co-regd', root),
      hqLocation: val('co-hq', root),
      weeklyRevenue: num('co-rev', root),
      weeklyExpenses: num('co-exp', root),
      totalAssets: num('co-assets', root),
      totalDebt: num('co-debt', root),
      totalLiabilities: num('co-liab', root),
      employeeCount: num('co-emp', root),
      tier: num('co-tier', root),
      perceptionStats: { public: num('co-pp', root), corporate: num('co-pc', root), government: num('co-pg', root) },
      notoriety: num('co-not', root),
      corporateExposure: num('co-ce', root),
      activeLawyer: val('co-law', root),
      activeInvestigator: val('co-inv', root) || null,
      judicialRecord: (() => {
        try {
          return JSON.parse(val('co-jr', root) || '[]');
        } catch {
          return [];
        }
      })(),
      ownerType: val('co-owner', root),
      ownerId: val('co-ownerid', root) || null,
      isPlayerCompany: chk('co-player', root),
      companySlot: (() => {
        const s = val('co-slot', root).trim();
        if (!s) return null;
        const n = Number(s);
        return Number.isFinite(n) ? n : null;
      })(),
      parentHolding: val('co-parent', root) || null,
      subsidiaries: val('co-subs', root)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      combatCapabilities: caps,
      personalityType: val('co-personality', root),
      rivalBehavior: {
        awarenessThreshold: num('co-r-aw', root),
        decisionStyle: val('co-r-ds', root),
        memoryDuration: num('co-r-mem', root),
        allianceCapable: chk('co-r-all', root),
        scalingType: val('co-r-scale', root)
      },
      loreNotes: val('co-lore', root),
      isKeyCompany: chk('co-key', root)
    };
  }

  function previewCo(c) {
    const p = $('#co-preview', root);
    if (!p) return;
    p.innerHTML = `<div style="border:2px inset #808080;padding:8px;background:#fff;">
      <div style="font-weight:bold;">${c.tradingName || c.legalName || 'Company'}</div>
      <div>${c.industry || ''} · Tier ${c.tier}</div>
      <div style="margin:6px 0;font-size:10px;">Notoriety ${c.notoriety || 0}% · CE ${c.corporateExposure || 0}%</div>
      <div class="nbar" style="height:10px;background:#eee;border:1px solid #666;"><div class="nbar-fill" style="width:${Math.min(100, (c.notoriety || 0) / 2)}%"></div></div>
      <div style="font-size:10px;margin-top:4px;">JR entries: ${(c.judicialRecord || []).length} · Lawyer: ${c.activeLawyer}</div>
    </div>`;
  }

  root.innerHTML = `<div class="ca-toolbar">
    <select id="co-pick"></select><button type="button" id="co-new">New</button>
    <button type="button" id="co-save">Save</button><button type="button" id="co-recalc">Recalc valuations</button>
  </div>
  <fieldset class="ca-fieldset"><legend>Identity</legend>
    <input type="hidden" id="co-id">
    <div class="ca-row"><label>Legal name</label><input type="text" id="co-legal"></div>
    <div class="ca-row"><label>Trading name</label><input type="text" id="co-trade"></div>
    <div class="ca-row"><label>Entity</label><select id="co-entity"><option>sole-proprietor</option><option>LLC</option><option>corporation</option><option>holding-company</option></select></div>
    <div class="ca-row"><label>Industry</label><select id="co-ind">${INDUSTRIES.map((i) => `<option>${i}</option>`).join('')}</select></div>
    <div class="ca-row"><label>Reg # / date</label><input type="text" id="co-reg"><input type="text" id="co-regd"></div>
    <div class="ca-row"><label>HQ</label><input type="text" id="co-hq"></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Financial</legend>
    <div class="ca-row"><label>Weekly rev / exp</label><input type="number" id="co-rev"><input type="number" id="co-exp"></div>
    <div class="ca-row"><label>Assets / Debt / Liab</label><input type="number" id="co-assets"><input type="number" id="co-debt"><input type="number" id="co-liab"></div>
    <div class="ca-row"><label>Employees</label><input type="number" id="co-emp"></div>
    <div class="ca-row"><label>Business tier 1–5</label><input type="number" id="co-tier" min="1" max="5"></div>
    <div class="ca-row"><label>Adj. valuation</label><span id="co-val-ro">0</span> &nbsp; Rep bonus <span id="co-rep-ro">0</span></div>
    <div class="ca-row"><label>Ledger / contract</label><span id="co-led-ro">—</span></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Perception & risk</legend>
    <div class="ca-row"><label>P / C / G</label><input type="number" id="co-pp" min="0" max="100"><input type="number" id="co-pc" min="0" max="100"><input type="number" id="co-pg" min="0" max="100"></div>
    <div class="ca-row"><label>Notoriety 0–200</label><input type="number" id="co-not" min="0" max="200"></div>
    <div class="ca-row"><label>Corp. exposure 0–100</label><input type="number" id="co-ce" min="0" max="100"></div>
    <div class="ca-row"><label>Lawyer / Investigator</label><select id="co-law"><option>none</option><option>basic</option><option>mid</option><option>top</option><option>elite</option></select>
    <select id="co-inv"><option value="">—</option><option>Tier 1</option><option>Tier 2</option><option>Tier 3</option></select></div>
    <div class="ca-row"><label>JR → DC mod</label><span id="co-jr-dc">0</span></div>
    <div class="ca-row"><label>Judicial JSON</label><textarea id="co-jr" rows="2"></textarea></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Ownership</legend>
    <div class="ca-row"><label>Owner type</label><select id="co-owner"><option>player</option><option>rival</option><option>npc</option><option>government</option><option>institution</option></select></div>
    <div class="ca-row"><label>Owner ID / slot</label><input type="text" id="co-ownerid"><input type="number" id="co-slot" placeholder="1–3"></div>
    <div class="ca-row"><label><input type="checkbox" id="co-player"> Player company</label></div>
    <div class="ca-row"><label>Parent / subs IDs</label><input type="text" id="co-parent" placeholder="parent id"><input type="text" id="co-subs" placeholder="id1, id2"></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Combat capabilities</legend>
    <div class="ca-row"><label><input type="checkbox" id="co-cap-soc"> Social</label><label><input type="checkbox" id="co-cap-esp"> Espionage</label><label><input type="checkbox" id="co-cap-sab"> Sabotage</label><label><input type="checkbox" id="co-cap-cyb"> Cyber</label><label><input type="checkbox" id="co-cap-leg"> Legal</label></div>
  </fieldset>
  <div id="co-rival-wrap" style="display:none;">
  <fieldset class="ca-fieldset"><legend>Rival AI</legend>
    <div class="ca-row"><label>Personality</label><select id="co-personality"><option>aggressive</option><option>subtle</option><option>defensive</option><option>balanced</option><option>corrupt</option></select></div>
    <div class="ca-row"><label>Awareness th.</label><input type="number" id="co-r-aw"></div>
    <div class="ca-row"><label>Decision</label><select id="co-r-ds"><option>scheduled</option><option>reactive</option></select></div>
    <div class="ca-row"><label>Memory days</label><input type="number" id="co-r-mem"></div>
    <div class="ca-row"><label><input type="checkbox" id="co-r-all"> Alliance capable</label></div>
    <div class="ca-row"><label>Scaling</label><select id="co-r-scale"><option>player-tied</option><option>independent</option></select></div>
  </fieldset></div>
  <fieldset class="ca-fieldset"><legend>Lore</legend><textarea id="co-lore"></textarea><div class="ca-row"><label><input type="checkbox" id="co-key"> Key company</label></div></fieldset>
  <div class="ca-preview" id="co-preview"></div>`;

  refreshPick();
  loadCo(null);

  $('#co-pick', root).addEventListener('change', () => loadCo($('#co-pick', root).value || null));
  $('#co-new', root).addEventListener('click', () => {
    $('#co-pick', root).value = '';
    loadCo(null);
  });
  $('#co-save', root).addEventListener('click', () => {
    const o = readCo();
    o.adjustedValuation = computeAdjustedValuation(o);
    if (!o.legalName && !o.tradingName) {
      toast('Company name required');
      return;
    }
    if (editingId) api.update(editingId, o);
    else api.create(o);
    refreshPick();
    toast('Company saved');
  });
  $('#co-recalc', root).addEventListener('click', () => {
    if (editingId) api.recalculateValuation(editingId);
    api.updateLedgerRankings();
    loadCo($('#co-pick', root).value || editingId);
    toast('Ledger recalculated');
  });
  $('#co-owner', root).addEventListener('change', () => {
    $('#co-rival-wrap', root).style.display = val('co-owner', root) === 'rival' ? 'block' : 'none';
  });
  root.addEventListener('input', () => {
    const c = readCo();
    previewCo(c);
    $('#co-val-ro', root).textContent = computeAdjustedValuation(c).toLocaleString();
    $('#co-rep-ro', root).textContent = reputationBonusFromPerception(c.perceptionStats).toLocaleString();
    $('#co-jr-dc', root).textContent = String(judicialRecordDcModifier((c.judicialRecord || []).length));
  });
}

function govField(path, label, type = 'number', step = '0.01') {
  const id = `gv-${path.replace(/[^a-z0-9]/gi, '-')}`;
  return `<div class="ca-row"><label>${label}</label><input type="${type}" data-gov-path="${path}" id="${id}" step="${step}"></div>`;
}

function mountGovEditor() {
  const root = document.getElementById('admin-gov-root');
  if (!root || !window.WorldNet?.government) return;
  const g = window.WorldNet.government;

  function pull() {
    const o = g.get();
    root.querySelectorAll('[data-gov-path]').forEach((el) => {
      const p = el.getAttribute('data-gov-path');
      const parts = p.split('.');
      let cur = o;
      for (const x of parts) cur = cur?.[x];
      if (el.type === 'checkbox') el.checked = !!cur;
      else el.value = cur != null ? cur : '';
    });
    $('#gv-mandate-name', root).value = o.mandateName || '';
    $('#gv-mandate-id', root).value = o.mandateId || '';
    $('#gv-lore', root).value = o.loreNotes || '';
    runImpact();
  }

  function push() {
    root.querySelectorAll('[data-gov-path]').forEach((el) => {
      const p = el.getAttribute('data-gov-path');
      let v =
        el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
      if (el.type === 'number' && Number.isNaN(v)) v = 0;
      g.update(p, v);
    });
    g.update('mandateName', val('gv-mandate-name', root));
    g.update('mandateId', val('gv-mandate-id', root));
    g.update('loreNotes', val('gv-lore', root));
    toast('Government config saved');
  }

  function runImpact() {
    const out = $('#gv-impact', root);
    if (!out) return;
    const n = num('gv-sim-not', root);
    const ce = num('gv-sim-ce', root);
    const jr = num('gv-sim-jr', root);
    const law = val('gv-sim-law', root);
    const go = g.get();
    const nt = go.notorietyThresholds || {};
    const ex = go.exposureThresholds || {};
    const notLabel = Object.entries(nt).find(([, v]) => n < v)?.[0] || 'federalTarget';
    const ceLabel = Object.entries(ex).find(([, v]) => ce < v)?.[0] || 'regulatorySeizure';
    let inv = '—';
    if (ce >= 86) inv = 'Tier 3';
    else if (ce >= 71) inv = 'Tier 2';
    else if (ce >= 56) inv = 'Tier 1';
    const fr = g.getFineRange(inv === '—' ? 1 : inv.includes('3') ? 3 : inv.includes('2') ? 2 : 1);
    const jrMod = [0, 2, 4, 7, 11, 16][Math.min(5, jr)] ?? 16;
    const dismissBase = ce >= 86 ? 19 : ce >= 71 ? 16 : ce >= 56 ? 12 : 10;
    const lawyerOff = { none: 0, basic: 2, mid: 5, top: 9, elite: 14 }[law] || 0;
    out.innerHTML = `<b>Simulated impact</b><br>Notoriety tier gate: ${notLabel}<br>CE tier: ${ceLabel}<br>Investigator: ${inv}<br>Fine range (approx): $${fr.min}–$${fr.max}<br>Dismissal DC (base+mod−law): ${dismissBase + jrMod - lawyerOff}<br>Seizure clock: ${go.seizureRules?.seizureClockDays ?? 30} days at 100% CE`;
  }

  root.innerHTML = `<div class="ca-toolbar">
    <button type="button" id="gv-save">Save all</button>
    <button type="button" id="gv-reset">Reset defaults</button>
    <button type="button" id="gv-export">Export JSON</button>
  </div>
  <div class="ca-row" style="padding:6px;"><label>Mandate ID</label><input type="text" id="gv-mandate-id"><label>Name</label><input type="text" id="gv-mandate-name" style="flex:2"></div>
  <fieldset class="ca-fieldset"><legend>Tax</legend>
    ${govField('taxSystem.corporateTaxRate', 'Corp rate', 'number', '0.01')}
    ${govField('taxSystem.personalIncomeTaxRate', 'Personal', 'number', '0.01')}
    ${govField('taxSystem.capitalGainsTaxRate', 'Cap gains', 'number', '0.01')}
    ${govField('taxSystem.taxDeadlineWeek', 'Deadline week', 'number', '1')}
    ${govField('taxSystem.penaltyForLateFiling', 'Late penalty', 'number', '1')}
    ${govField('taxSystem.penaltyForNonFiling', 'Non-file', 'number', '1')}
    <div class="ca-row" id="gv-tax-preview"></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Regulatory thresholds</legend>
    ${govField('regulatoryThresholds.cashTransactionReportingThreshold', 'Cash report $')}
    ${govField('regulatoryThresholds.suspiciousActivityReportThreshold_harbor', 'SAR Harbor')}
    ${govField('regulatoryThresholds.suspiciousActivityReportThreshold_pacificrim', 'SAR Pacific')}
    ${govField('regulatoryThresholds.structuringPatternWindow', 'Struct window')}
    ${govField('regulatoryThresholds.structuringPatternCount', 'Struct count')}
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Compliance multipliers</legend>
    ${govField('complianceValues.corposBaseScrutinyLevel', 'Scrutiny', 'number', '0.1')}
    ${govField('complianceValues.auditFrequencyModifier', 'Audit freq', 'number', '0.1')}
    ${govField('complianceValues.investigatorAssignmentSpeed', 'Inv. speed', 'number', '0.1')}
    ${govField('complianceValues.fineMultiplier', 'Fines', 'number', '0.1')}
    ${govField('complianceValues.dismissalDCModifier', 'Dismiss DC mod', 'number', '1')}
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Hidden gov weights</legend>
    ${govField('hiddenGovernmentValues.taxComplianceWeight', 'Tax compl.', 'number', '0.1')}
    ${govField('hiddenGovernmentValues.charitableActivityWeight', 'Charity', 'number', '0.1')}
    ${govField('hiddenGovernmentValues.judicialRecordWeight', 'Judicial', 'number', '0.1')}
    ${govField('hiddenGovernmentValues.crimeSeverityWeight', 'Crime', 'number', '0.1')}
    ${govField('hiddenGovernmentValues.corporateAggressionWeight', 'Aggression', 'number', '0.1')}
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Investigator fines</legend>
    ${govField('investigatorFineRanges.tier1Min', 'T1 min')} ${govField('investigatorFineRanges.tier1Max', 'T1 max')}
    ${govField('investigatorFineRanges.tier2Min', 'T2 min')} ${govField('investigatorFineRanges.tier2Max', 'T2 max')}
    ${govField('investigatorFineRanges.tier3Min', 'T3 min')} ${govField('investigatorFineRanges.tier3Max', 'T3 max')}
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Seizure</legend>
    ${govField('seizureRules.emergencyAppealDC', 'Appeal DC')}
    ${govField('seizureRules.seizureClockDays', 'Clock days')}
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Live impact preview</legend>
    <div class="ca-row"><label>Notoriety %</label><input type="number" id="gv-sim-not" value="40"></div>
    <div class="ca-row"><label>CE %</label><input type="number" id="gv-sim-ce" value="60"></div>
    <div class="ca-row"><label>JR count</label><input type="number" id="gv-sim-jr" value="0"></div>
    <div class="ca-row"><label>Lawyer</label><select id="gv-sim-law"><option>none</option><option>basic</option><option>mid</option><option>top</option><option>elite</option></select></div>
    <div class="ca-preview" id="gv-impact"></div>
  </fieldset>
  <fieldset class="ca-fieldset"><legend>Lore</legend><textarea id="gv-lore" rows="2"></textarea></fieldset>`;

  pull();
  $('#gv-save', root).addEventListener('click', push);
  $('#gv-reset', root).addEventListener('click', () => {
    g.reset();
    pull();
  });
  $('#gv-export', root).addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(g.exportConfig(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'government.json';
    a.click();
  });
  ['gv-sim-not', 'gv-sim-ce', 'gv-sim-jr', 'gv-sim-law'].forEach((id) =>
    $(`#${id}`, root)?.addEventListener('input', runImpact)
  );
  root.addEventListener('input', () => {
    const o = g.get();
    const inc = 100000;
    const r = o.taxSystem || {};
    const corp = inc * (r.corporateTaxRate || 0);
    const per = inc * (r.personalIncomeTaxRate || 0);
    const el = $('#gv-tax-preview', root);
    if (el) el.textContent = `On $100k example: corp ~$${corp.toFixed(0)} · personal ~$${per.toFixed(0)}`;
  });
}

function mountWebEditor() {
  const root = document.getElementById('admin-web-root');
  if (!root || !window.WorldNet?.pages) return;
  const api = window.WorldNet.pages;
  let editingPageId = null;

  function refreshPick() {
    const sel = $('#web-pick', root);
    const cur = sel?.value;
    sel.innerHTML =
      '<option value="">— New page —</option>' +
      api.getAllPages().map((p) => `<option value="${p.pageId}">${p.title || p.pageId}</option>`).join('');
    if (cur) sel.value = cur;
  }

  function loadPage(id) {
    const p = id ? api.getPage(id) : null;
    editingPageId = id;
    const d = p || {
      pageId: `page-${Date.now()}`,
      url: 'http://www.example.com/',
      title: 'New Page',
      category: 'corporate',
      sections: []
    };
    $('#web-pid', root).value = d.pageId;
    $('#web-url', root).value = d.url || '';
    $('#web-title', root).value = d.title || '';
    $('#web-cat', root).value = d.category || 'corporate';
    $('#web-pri', root).value = d.primaryColor || '#cc0000';
    $('#web-sec', root).value = d.secondaryColor || '#0a246a';
    $('#web-bg', root).value = d.backgroundColor || '#ffffff';
    $('#web-site', root).value = d.siteName || '';
    $('#web-tag', root).value = d.siteTagline || '';
    $('#web-layout', root).value = d.layoutTemplate || layoutTemplateForCategory(d.category);
    $('#web-secs', root).value = JSON.stringify(d.sections || [], null, 2);
    syncLayoutSlotsPreview();
    previewWeb();
  }

  function readPage() {
    let sections = [];
    try {
      sections = JSON.parse(val('web-secs', root) || '[]');
    } catch {
      sections = [];
    }
    return {
      pageId: val('web-pid', root),
      url: val('web-url', root),
      title: val('web-title', root),
      category: val('web-cat', root),
      primaryColor: val('web-pri', root),
      secondaryColor: val('web-sec', root),
      backgroundColor: val('web-bg', root),
      siteName: val('web-site', root),
      siteTagline: val('web-tag', root),
      layoutTemplate: val('web-layout', root) || layoutTemplateForCategory(val('web-cat', root)),
      aestheticTheme: 'year2000-corporate',
      unlockRequirement: null,
      unlockCondition: '',
      logoText: '',
      hasAdSlots: true,
      adSlotPositions: api
        .getResolvedAdSlots(val('web-layout', root) || layoutTemplateForCategory(val('web-cat', root)))
        .map((s) => s.slotId),
      hasShop: false,
      shopId: null,
      requiresLogin: false,
      loginSystemId: null,
      sections,
      navLinks: [],
      footerText: '',
      metaTags: {},
      gameStateReaders: [],
      gameStateWriters: [],
      eventTriggers: []
    };
  }

  function previewWeb() {
    const pv = $('#web-preview', root);
    if (!pv) return;
    const html = renderPageDefinitionHtml(readPage(), {
      newsItems: window.__wnetNewsHeadlines || [],
      getShopById: getStoreById
    });
    pv.innerHTML = html;
  }

  function syncLayoutSlotsPreview() {
    const el = $('#web-layout-slots', root);
    if (!el) return;
    const templateId = val('web-layout', root) || layoutTemplateForCategory(val('web-cat', root));
    const template = api.getLayoutTemplate(templateId);
    const slots = api.getResolvedAdSlots(templateId);
    el.innerHTML = template
      ? `<b>${template.label}</b><br>${slots
          .map((s) => `${s.slotId} (${s.placement} / ${s.size})`)
          .join('<br>')}`
      : 'No layout template selected.';
  }

  root.innerHTML = `<div class="ca-toolbar">
    <select id="web-pick"></select>
    <button type="button" id="web-new">New</button>
    <button type="button" id="web-save">Save (${PIPELINE_PAGES_FILE})</button>
    <button type="button" id="web-dup">Duplicate</button>
    <button type="button" id="web-del">Delete</button>
  </div>
  <div class="ca-row"><label>Page ID</label><input type="text" id="web-pid"></div>
  <div class="ca-row"><label>URL</label><input type="text" id="web-url"></div>
  <div class="ca-row"><label>Title</label><input type="text" id="web-title"></div>
  <div class="ca-row"><label>Category</label><select id="web-cat"><option>banking</option><option>shopping</option><option>news</option><option>government</option><option>social</option><option>entertainment</option><option>dark-web</option><option>corporate</option><option>search</option></select></div>
  <div class="ca-row"><label>Layout template</label><select id="web-layout">${api
    .getLayoutTemplates()
    .map((t) => `<option value="${t.id}">${t.label}</option>`)
    .join('')}</select></div>
  <div class="ca-row"><label>Colors</label><input type="color" id="web-pri"><input type="color" id="web-sec"><input type="color" id="web-bg"></div>
  <div class="ca-row"><label>Site / tagline</label><input type="text" id="web-site"><input type="text" id="web-tag"></div>
  <fieldset class="ca-fieldset"><legend>Template ad slots</legend><div id="web-layout-slots" style="font-size:10px;line-height:1.5;"></div></fieldset>
  <fieldset class="ca-fieldset"><legend>Sections (JSON array)</legend>
  <textarea id="web-secs" rows="12" style="max-width:100%;font-family:Consolas,monospace;">[]</textarea>
  <p style="font-size:10px;color:#555;margin:4px 0;">Types: hero, text, newsFeed, productGrid, table, form, ad, login, profile, links, divider, ticker, forum_thread (add "live":true), live_thread</p>
  </fieldset>
  <div class="ca-preview" id="web-preview" style="max-height:220px;"></div>`;

  refreshPick();
  loadPage(null);

  $('#web-pick', root).addEventListener('change', () => loadPage($('#web-pick', root).value || null));
  $('#web-new', root).addEventListener('click', () => {
    $('#web-pick', root).value = '';
    loadPage(null);
  });
  $('#web-cat', root).addEventListener('change', () => {
    $('#web-layout', root).value = layoutTemplateForCategory($('#web-cat', root).value || '');
    syncLayoutSlotsPreview();
    previewWeb();
  });
  $('#web-layout', root).addEventListener('change', () => {
    syncLayoutSlotsPreview();
    previewWeb();
  });
  $('#web-save', root).addEventListener('click', () => {
    const o = readPage();
    if (!o.url || !o.title) {
      toast('URL and title required');
      return;
    }
    if (editingPageId) api.updatePage(editingPageId, o);
    else api.createPage(o);
    refreshPipelineRoutes();
    refreshPick();
    toast('Page saved');
  });
  $('#web-dup', root).addEventListener('click', () => {
    const o = readPage();
    o.pageId = `page-${Date.now().toString(36)}`;
    try {
      const u = new URL(o.url.includes('://') ? o.url : `http://${o.url}`);
      o.url = u.toString().replace(/\/$/, '') + '-copy/';
    } catch {
      o.url += '-copy';
    }
    api.createPage(o);
    refreshPipelineRoutes();
    refreshPick();
    toast('Duplicated');
  });
  $('#web-del', root).addEventListener('click', () => {
    if (editingPageId && confirm('Delete page?')) {
      api.deletePage(editingPageId);
      refreshPipelineRoutes();
      refreshPick();
      loadPage(null);
    }
  });
  root.addEventListener('input', previewWeb);
}