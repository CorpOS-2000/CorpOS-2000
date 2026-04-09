/* global corpStudio, StudioModel */
(function () {
  const M = window.StudioModel;

  const ENGINES = [
    { id: 'npc', label: 'NPC Creator', icon: '\uD83D\uDC64' },
    { id: 'company', label: 'Companies', icon: '\uD83C\uDFE2' },
    { id: 'gov', label: 'Government', icon: '\u2696\uFE0F' },
    { id: 'web', label: 'Web Editor', icon: '\uD83C\uDF10' },
    { id: 'ads', label: 'Ad Engine', icon: '\uD83D\uDCE2' },
    { id: 'dash', label: 'Overview', icon: '\uD83D\uDCCA', section: 'dash' }
  ];

  const SUBTABS = {
    npc: ['Identity', 'Social Profile', 'Opinions', 'Connections', 'Criminal Record', 'Contact Settings', 'Modifiers', 'Lore'],
    company: ['Identity', 'Financials', 'Perception', 'Risk Status', 'Judicial', 'Ownership', 'Combat', 'Rival AI', 'Lore'],
    gov: ['Tax System', 'Reg. Thresholds', 'Compliance', 'Hidden Values', 'Investigator Fines', 'Notoriety Tiers', 'CE Tiers', 'Personnel', 'Agencies'],
    web: ['Page Settings', 'Sections', 'Navigation', 'Shop / Login', 'Event triggers'],
    ads: ['Ad Library', 'Create Ad', 'Slot Mapping', 'Templates', 'Animation', 'Preview'],
    dash: ['Dashboard']
  };

  const state = {
    engine: 'npc',
    subtab: 0,
    registry: { npcs: [], companies: [], government: {}, pages: [], ads: null, shops: [] },
    adsWrap: M.defaultAdsFile(),
    selectedNpcId: null,
    selectedCompanyId: null,
    selectedPageId: null,
    selectedAdId: null,
    editingNpcDraft: null,
    editingCompanyDraft: null,
    editingGovDraft: null,
    editingPageDraft: null,
    editingAdDraft: null,
    undoStacks: {},
    backupLog: [],
    lastValidation: { errors: [], warnings: [], structuredErrors: [] },
    listSearch: '',
    npcRoleFilter: 'all',
    npcAvailFilter: 'all',
    coOwnerFilter: 'all',
    webCatFilter: 'all',
    adFmtFilter: 'all',
    adsSubtab: 0,
    secExpanded: null
  };

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function deepClone(o) {
    return JSON.parse(JSON.stringify(o));
  }

  function flashStatus(msg, ok) {
    const el = document.getElementById('sb-valid');
    if (!el) return;
    el.textContent = msg;
    el.className = 'sb-panel ' + (ok === false ? 'err' : 'ok');
    setTimeout(() => refreshStatusValidation(), 2500);
  }

  function nowClock() {
    const el = document.getElementById('sb-time');
    if (el) el.textContent = new Date().toLocaleString();
  }

  async function refreshRegistry() {
    state.registry = await corpStudio.readRegistry();
    if (state.registry.ads && typeof state.registry.ads === 'object') {
      state.adsWrap = state.registry.ads.ads ? state.registry.ads : M.defaultAdsFile();
      if (!Array.isArray(state.adsWrap.ads)) state.adsWrap.ads = [];
    } else state.adsWrap = M.defaultAdsFile();
    state.editingGovDraft = deepClone(state.registry.government || {});
  }

  async function writeJsonFile(name, obj) {
    await corpStudio.writeFile(name, JSON.stringify(obj, null, 2));
    state.backupLog.unshift({ t: Date.now(), op: 'write', file: name });
    if (state.backupLog.length > 30) state.backupLog.pop();
    await refreshRegistry();
  }

  function pushUndo(key, snapshot) {
    if (!state.undoStacks[key]) state.undoStacks[key] = { u: [], r: [] };
    const st = state.undoStacks[key];
    const s = typeof snapshot === 'string' ? snapshot : JSON.stringify(snapshot);
    if (st.u.length && st.u[st.u.length - 1] === s) return;
    st.u.push(s);
    if (st.u.length > 80) st.u.shift();
    st.r = [];
  }

  function undoKey() {
    return state.engine + '-' + (state.selectedNpcId || state.selectedCompanyId || 'x');
  }

  function doUndo() {
    const k = undoKey();
    const st = state.undoStacks[k];
    if (!st || !st.u.length) return;
    const cur =
      state.engine === 'npc'
        ? JSON.stringify(collectNpcFromDom())
        : state.engine === 'company'
          ? JSON.stringify(collectCompanyFromDom())
          : null;
    if (!cur) return;
    st.r.push(cur);
    const prev = st.u.pop();
    try {
      const j = JSON.parse(prev);
      if (state.engine === 'npc') {
        state.editingNpcDraft = j;
        renderNpcForm();
      } else if (state.engine === 'company') {
        state.editingCompanyDraft = j;
        renderCompanyForm();
      }
    } catch {
      /* ignore */
    }
  }

  function doRedo() {
    const k = undoKey();
    const st = state.undoStacks[k];
    if (!st || !st.r.length) return;
    const next = st.r.pop();
    st.u.push(
      state.engine === 'npc' ? JSON.stringify(collectNpcFromDom()) : JSON.stringify(collectCompanyFromDom())
    );
    try {
      const j = JSON.parse(next);
      if (state.engine === 'npc') {
        state.editingNpcDraft = j;
        renderNpcForm();
      } else if (state.engine === 'company') {
        state.editingCompanyDraft = j;
        renderCompanyForm();
      }
    } catch {
      /* ignore */
    }
  }

  function refreshSidebar() {
    const sb = document.getElementById('engine-sidebar');
    const npcn = state.registry.npcs?.length || 0;
    const con = state.registry.companies?.length || 0;
    const pgn = state.registry.pages?.length || 0;
    const adn = (state.adsWrap.ads || []).length;
    sb.innerHTML = `
      <div class="sidebar-header">ENGINES</div>
      ${ENGINES.filter((e) => e.id !== 'dash')
        .map((e) => {
          let c = '';
          if (e.id === 'npc') c = String(npcn);
          else if (e.id === 'company') c = String(con);
          else if (e.id === 'web') c = String(pgn);
          else if (e.id === 'ads') c = String(adn);
          return `<button type="button" class="engine-tab ${state.engine === e.id ? 'active' : ''}" data-engine="${e.id}">
            <span class="eico">${e.icon}</span> ${e.label}${c ? `<span class="ecount">${c}</span>` : ''}
          </button>`;
        })
        .join('')}
      <div style="height:1px;background:#b0aca4;margin:4px 0;"></div>
      <div class="sidebar-header" style="background:#334466;">DASHBOARD</div>
      <button type="button" class="engine-tab ${state.engine === 'dash' ? 'active' : ''}" data-engine="dash">
        <span class="eico">\uD83D\uDCCA</span> Overview
      </button>
      <div class="sidebar-foot">
        <button type="button" class="build-btn" id="btn-publish">Publish All</button>
        <div style="margin-top:4px;font-size:9px;color:#666;text-align:center;" id="sidebar-last">Ready</div>
      </div>`;
    sb.querySelectorAll('[data-engine]').forEach((b) =>
      b.addEventListener('click', () => switchEngine(b.getAttribute('data-engine')))
    );
    document.getElementById('btn-publish')?.addEventListener('click', publishAll);
  }

  function renderSubtabs() {
    const row = document.getElementById('subtabs-row');
    const tabs = SUBTABS[state.engine] || SUBTABS.npc;
    row.innerHTML = tabs
      .map(
        (t, i) =>
          `<button type="button" class="stab ${i === state.subtab ? 'active' : ''}" data-sub="${i}">${escapeHtml(t)}</button>`
      )
      .join('');
    row.querySelectorAll('.stab').forEach((b) =>
      b.addEventListener('click', () => {
        state.subtab = Number(b.getAttribute('data-sub'));
        renderSubtabs();
        showActiveSubtabPanels();
        if (state.engine === 'ads') renderAdsForm(document.getElementById('form-panel'));
      })
    );
  }

  function showActiveSubtabPanels() {
    document.querySelectorAll('.st-tab-panel').forEach((p) => {
      p.classList.toggle('active', Number(p.getAttribute('data-idx')) === state.subtab);
    });
  }

  function switchEngine(id) {
    state.engine = id;
    state.subtab = 0;
    if (id === 'ads') state.adsSubtab = 0;
    refreshSidebar();
    renderSubtabs();
    renderLeftPanel();
    renderMainForm();
    renderPreviewPanel();
    document.getElementById('sb-engine').textContent =
      ENGINES.find((e) => e.id === id)?.label || id;
  }

  function renderLeftPanel() {
    const inner = document.getElementById('left-panel-inner');
    if (state.engine === 'npc') return renderNpcList(inner);
    if (state.engine === 'company') return renderCompanyList(inner);
    if (state.engine === 'gov') return renderGovLeft(inner);
    if (state.engine === 'web') return renderWebList(inner);
    if (state.engine === 'ads') return renderAdsLeft(inner);
    if (state.engine === 'dash') {
      inner.innerHTML = '<div class="lp-list"><p style="padding:8px;">Use the center panel for dashboard.</p></div>';
      return;
    }
    inner.innerHTML = '';
  }

  function renderMainForm() {
    const fp = document.getElementById('form-panel');
    if (state.engine === 'npc') renderNpcForm(fp);
    else if (state.engine === 'company') renderCompanyForm(fp);
    else if (state.engine === 'gov') renderGovForm(fp);
    else if (state.engine === 'web') renderWebForm(fp);
    else if (state.engine === 'ads') renderAdsForm(fp);
    else if (state.engine === 'dash') renderDashForm(fp);
    else fp.innerHTML = '';
    bindSectionCollapse(fp);
  }

  function renderPreviewPanel() {
    const hdr = document.getElementById('preview-header');
    const body = document.getElementById('preview-body');
    const actions = document.getElementById('preview-actions');
    actions.innerHTML = '';
    if (state.engine === 'npc') {
      hdr.textContent = 'PREVIEW â€” Black Cherry';
      body.innerHTML = npcPreviewHtml(state.editingNpcDraft || M.defaultNpc({ id: 'draft' }));
      actions.innerHTML = `<button type="button" class="pp-btn save" id="pv-save-npc">Save NPC</button>
        <button type="button" class="pp-btn" id="pv-exp-npc">Export JSON</button>
        <button type="button" class="pp-btn" id="pv-dup-npc">Duplicate</button>
        <button type="button" class="pp-btn" style="color:#900" id="pv-del-npc">Delete</button>`;
      document.getElementById('pv-save-npc')?.addEventListener('click', saveNpc);
      document.getElementById('pv-exp-npc')?.addEventListener('click', exportNpc);
      document.getElementById('pv-dup-npc')?.addEventListener('click', duplicateNpc);
      document.getElementById('pv-del-npc')?.addEventListener('click', deleteNpc);
    } else if (state.engine === 'company') {
      hdr.textContent = 'PREVIEW â€” Company';
      body.innerHTML = companyPreviewHtml(state.editingCompanyDraft || M.defaultCompany({ id: 'draft' }));
      actions.innerHTML = `<button type="button" class="pp-btn save" id="pv-save-co">Save company</button>
        <button type="button" class="pp-btn" id="pv-exp-co">Export JSON</button>
        <button type="button" class="pp-btn" id="pv-dup-co">Duplicate</button>
        <button type="button" class="pp-btn" style="color:#900" id="pv-del-co">Delete</button>`;
      document.getElementById('pv-save-co')?.addEventListener('click', saveCompany);
      document.getElementById('pv-exp-co')?.addEventListener('click', exportCompany);
      document.getElementById('pv-dup-co')?.addEventListener('click', duplicateCompany);
      document.getElementById('pv-del-co')?.addEventListener('click', deleteCompany);
    } else if (state.engine === 'gov') {
      hdr.textContent = 'PREVIEW â€” Impact calc';
      body.innerHTML = govPreviewCalcHtml();
      actions.innerHTML = `<button type="button" class="pp-btn save" id="pv-save-gov">Save government.json</button>`;
      document.getElementById('pv-save-gov')?.addEventListener('click', saveGov);
    } else if (state.engine === 'web') {
      hdr.textContent = 'PREVIEW â€” WorldNet';
      body.innerHTML = webWireframePreview();
      actions.innerHTML = `<button type="button" class="pp-btn save" id="pv-save-web">Save pages</button>`;
      document.getElementById('pv-save-web')?.addEventListener('click', savePages);
    } else if (state.engine === 'ads') {
      hdr.textContent = 'PREVIEW â€” Ad';
      actions.innerHTML = `<button type="button" class="pp-btn save" id="pv-save-ads">Save ads.json</button>`;
      document.getElementById('pv-save-ads')?.addEventListener('click', saveAds);
      refreshAdPreviewBody(body);
    } else if (state.engine === 'dash') {
      hdr.textContent = 'Summary';
      body.innerHTML = '<div style="color:#a6b5e7;font-size:10px;padding:6px;">See metrics in main panel.</div>';
    } else {
      hdr.textContent = 'PREVIEW';
      body.innerHTML = '';
    }
  }

  function bindSectionCollapse(root) {
    root.querySelectorAll('.sg-header').forEach((h) => {
      h.addEventListener('click', () => {
        const body = h.nextElementSibling;
        if (!body || !body.classList.contains('sg-body')) return;
        const c = h.classList.toggle('collapsed');
        body.classList.toggle('hidden', c);
      });
    });
  }

  function roleBadgeClass(role) {
    const r = String(role || 'neutral');
    if (r === 'story') return 'badge-story';
    if (r === 'contact') return 'badge-contact';
    if (r === 'rival') return 'badge-rival';
    if (r === 'investigator') return 'badge-investigator';
    return 'badge-neutral';
  }

  function npcPreviewHtml(n) {
    const ps = n.perceptionStats || { public: 50, corporate: 50, government: 50 };
    const sw = M.socialWeightLabel(n.socialWeight);
    return `<div class="phone-frame"><div class="pf-screen">
      <div style="color:#a6b5e7;font-size:9px;margin-bottom:6px;">CONTACTS</div>
      <div class="pf-contact-card">
        <div class="pfc-name">${escapeHtml(n.fullName || 'â€”')}</div>
        <div class="pfc-handle">@${escapeHtml(n.blackCherryHandle || 'HANDLE')}</div>
        <div class="pfc-badges">
          <span class="pfc-badge" style="background:#330066;color:#e8ccff;">${escapeHtml((n.role || '').toUpperCase())}</span>
          <span class="pfc-badge" style="background:#003300;color:#ccffcc;">${escapeHtml((n.contactAvailability || '').toUpperCase())}</span>
        </div>
      </div>
      <div style="margin-top:8px;">
        <div style="color:#556699;font-size:9px;">PERCEPTION</div>
        ${['public', 'corporate', 'government']
          .map(
            (k) => `<div class="pf-stat-row">
          <div class="pf-stat-label">${k.slice(0, 3)}</div>
          <div class="pf-stat-bar"><div class="pf-stat-fill" style="width:${ps[k]}%;background:${M.perceptionColor(ps[k])}"></div></div>
          <div class="pf-stat-val">${ps[k]}</div>
        </div>`
          )
          .join('')}
        <div style="margin-top:8px;color:#a6b5e7;font-weight:bold;">${n.socialWeight ?? 0} <span style="font-size:9px;color:#556699;">/ 100</span></div>
        <div style="font-size:9px;color:#445566;">${escapeHtml(sw)}</div>
      </div>
    </div></div>`;
  }

  function companyPreviewHtml(c) {
    const jr = c.judicialRecord || [];
    const dc = M.judicialRecordDcModifier(jr.length);
    return `<div class="phone-frame"><div class="pf-screen" style="color:#e8e8e8;font-size:10px;">
      <div style="font-weight:bold;font-size:12px;">${escapeHtml(c.tradingName || c.legalName || 'Company')}</div>
      <div style="font-size:9px;color:#a6b5e7;margin:4px 0;">${escapeHtml(c.industry || 'â€”')} Â· Tier ${c.tier ?? 1}</div>
      <div class="pf-stat-row"><span>Notoriety</span><div class="pf-stat-bar"><div class="pf-stat-fill" style="width:${Math.min(100, (c.notoriety / 200) * 100)}%;background:#c60"></div></div></div>
      <div class="pf-stat-row"><span>Corp exp.</span><div class="pf-stat-bar"><div class="pf-stat-fill" style="width:${c.corporateExposure ?? 0}%;background:#06c"></div></div></div>
      <div style="margin-top:8px;">JR: ${jr.length} entries Â· DC mod +${dc}</div>
      <div>Lawyer: ${escapeHtml(c.activeLawyer || 'none')}</div>
      <div>Owner: ${escapeHtml(c.ownerType || 'â€”')}</div>
    </div></div>`;
  }

  function loadNpcDraft(id) {
    if (id) {
      const n = state.registry.npcs.find((x) => x.id === id);
      state.editingNpcDraft = n ? deepClone(n) : M.defaultNpc({});
      state.selectedNpcId = id;
    } else {
      state.editingNpcDraft = M.defaultNpc({});
      state.selectedNpcId = null;
    }
    renderNpcForm();
    renderPreviewPanel();
  }

  function renderNpcList(inner) {
    let list = state.registry.npcs.slice();
    const q = state.listSearch.toLowerCase();
    if (q) list = list.filter((n) => (n.fullName || '').toLowerCase().includes(q) || (n.profession || '').toLowerCase().includes(q));
    if (state.npcRoleFilter !== 'all') list = list.filter((n) => n.role === state.npcRoleFilter);
    if (state.npcAvailFilter && state.npcAvailFilter !== 'all')
      list = list.filter((n) => n.contactAvailability === state.npcAvailFilter);
    inner.innerHTML = `
      <div class="lp-header"><span>NPC REGISTRY</span><span style="font-weight:normal;opacity:.8">${list.length} shown</span></div>
      <div style="padding:4px;border-bottom:1px solid #b0aca4;"><input type="search" id="npc-search" placeholder="Search..." style="width:100%;height:20px;border:2px inset #808080;padding:2px 4px;"></div>
      <div style="padding:4px;border-bottom:1px solid #b0aca4;display:flex;gap:4px;">
        <select id="npc-filter-role" style="flex:1;height:20px;font-size:10px;"><option value="all">All roles</option>
          <option>contact</option><option>rival</option><option>investigator</option><option>neutral</option><option>story</option></select>
        <select id="npc-filter-avail" style="flex:1;height:20px;font-size:10px;"><option value="all">All avail.</option>
          <option>always</option><option>unlocked</option><option>hidden</option><option>dark-web-only</option></select>
      </div>
      <div class="lp-list" id="npc-lp-list" tabindex="0">${list
        .map((n) => {
          const sel = n.id === state.selectedNpcId ? 'selected' : '';
          return `<div class="list-item ${sel}" data-npc-id="${escapeHtml(n.id)}" data-context="npc">
            <span>\uD83D\uDC64</span>
            <div style="flex:1;min-width:0;"><div style="font-weight:bold;">${escapeHtml(n.fullName || n.id)}</div>
            <div style="font-size:9px;color:#666;">${escapeHtml(n.profession || '')}</div>
            </div>
            <span class="li-badge ${roleBadgeClass(n.role)}">${escapeHtml((n.role || '').slice(0, 8).toUpperCase())}</span>
          </div>`;
        })
        .join('')}</div>
      <button type="button" class="add-btn" id="npc-new">\uFF0B New NPC</button>`;
    inner.querySelector('#npc-search').value = state.listSearch;
    inner.querySelector('#npc-filter-role').value = state.npcRoleFilter;
    inner.querySelector('#npc-filter-avail').value = state.npcAvailFilter || 'all';
    inner.querySelector('#npc-search').addEventListener('input', (e) => {
      state.listSearch = e.target.value;
      renderLeftPanel();
    });
    inner.querySelector('#npc-filter-role').addEventListener('change', (e) => {
      state.npcRoleFilter = e.target.value;
      renderLeftPanel();
    });
    state.npcAvailFilter = state.npcAvailFilter || 'all';
    inner.querySelector('#npc-filter-avail').addEventListener('change', (e) => {
      state.npcAvailFilter = e.target.value;
      renderLeftPanel();
    });
    inner.querySelector('#npc-new').addEventListener('click', () => {
      state.listSearch = '';
      loadNpcDraft(null);
      renderLeftPanel();
    });
    inner.querySelectorAll('[data-npc-id]').forEach((row) => {
      row.addEventListener('click', () => loadNpcDraft(row.getAttribute('data-npc-id')));
      row.addEventListener('dblclick', () => {
        const id = row.getAttribute('data-npc-id');
        const n = state.registry.npcs.find((x) => x.id === id);
        const nn = prompt('Rename (full name)', n?.fullName || '');
        if (nn != null && n) {
          const next = state.registry.npcs.map((x) => (x.id === id ? { ...x, fullName: nn } : x));
          writeJsonFile('npcs.json', next);
          loadNpcDraft(id);
          renderLeftPanel();
        }
      });
    });
    const lp = inner.querySelector('#npc-lp-list');
    lp.addEventListener('keydown', (e) => {
      const rows = [...lp.querySelectorAll('.list-item')];
      let i = rows.findIndex((r) => r.classList.contains('selected'));
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        i = Math.min(rows.length - 1, i + 1);
        if (rows[i]) rows[i].click();
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        i = Math.max(0, i - 1);
        if (rows[i]) rows[i].click();
      }
    });
  }

  function collectNpcFromDom() {
    const d = state.editingNpcDraft || M.defaultNpc({});
    const g = (id) => document.getElementById('npc-' + id);
    const val = (id) => (g(id) ? g(id).value : '');
    const num = (id) => Number(val(id)) || 0;
    const chk = (id) => !!(g(id) && g(id).checked);
    d.fullName = val('name');
    d.dateOfBirth = val('dob');
    d.age = num('age');
    d.gender = val('gender');
    d.profession = val('prof');
    d.employer = val('employer');
    d.employerType = val('emptype');
    d.annualIncome = num('income');
    d.netWorth = num('networth');
    d.lifestyle = val('life');
    d.homeAddress = val('addr');
    d.phone = val('phone');
    d.email = val('email');
    d.socialSecurityNumber = val('ssn');
    d.socialWeight = num('sw');
    d.socialWeightSource = val('swsrc');
    d.perceptionStats = { public: num('pp'), corporate: num('pc'), government: num('pg') };
    d.opinionProfile = {
      playerOpinion: num('opP'),
      corporateOpinion: num('opC'),
      governmentOpinion: num('opG'),
      corposOpinion: num('opCo'),
      rapidemartOpinion: num('opRm')
    };
    const vulnTa = document.getElementById('npc-vuln');
    d.vulnerabilities = (vulnTa ? vulnTa.value : '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    d.connectionNetwork = collectConnectionsFromDom();
    d.criminalRecord = collectCriminalFromDom();
    d.contactAvailability = val('avail');
    d.unlockRequirement = val('unlockReq') || null;
    d.unlockCondition = val('unlockCond');
    d.blackCherryHandle = val('bc');
    d.role = val('role');
    const invEl = document.getElementById('npc-invTier');
    const inv = invEl ? invEl.value : '';
    d.investigatorTier = d.role === 'investigator' && inv ? inv : null;
    d.modifiers = M.listToModifiers(collectModifiersFromDom());
    d.dialogueTags = (val('tags') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    d.loreNotes = val('lore');
    d.isKeyCharacter = chk('keyChar');
    if (!state.selectedNpcId) delete d.id;
    return d;
  }

  function collectConnectionsFromDom() {
    const wrap = document.getElementById('conn-rows');
    if (!wrap) return [];
    return [...wrap.querySelectorAll('.conn-row')]
      .map((r) => ({
        connectedId: r.querySelector('.conn-id')?.value || '',
        relationshipType: r.querySelector('.conn-rel')?.value || 'unknown',
        strength: Math.min(10, Math.max(1, Number(r.querySelector('.conn-str')?.value) || 5))
      }))
      .filter((c) => c.connectedId);
  }

  function collectCriminalFromDom() {
    const wrap = document.getElementById('crime-rows');
    if (!wrap) return [];
    return [...wrap.querySelectorAll('.crime-row')]
      .map((r) => ({
        offense: r.querySelector('.crime-off')?.value || '',
        date: r.querySelector('.crime-date')?.value || '',
        outcome: r.querySelector('.crime-out')?.value || 'convicted',
        penaltyAmount: Number(r.querySelector('.crime-pen')?.value) || 0,
        notes: r.querySelector('.crime-notes')?.value || ''
      }))
      .filter((x) => x.offense);
  }

  function collectModifiersFromDom() {
    const wrap = document.getElementById('mod-rows');
    if (!wrap) return [];
    return [...wrap.querySelectorAll('.mod-row')]
      .map((r) => ({
        rollType: r.querySelector('.mod-type')?.value || '',
        value: Number(r.querySelector('.mod-val')?.value) || 0
      }))
      .filter((m) => m.rollType);
  }

  function renderConnRows(n) {
    const wrap = document.getElementById('conn-rows');
    if (!wrap) return;
    const net = n.connectionNetwork || [];
    const others = state.registry.npcs.filter((x) => x.id !== n.id);
    const rows = (net.length ? net : [{}])
      .map(
        (c, i) => `<div class="conn-item conn-row" data-i="${i}">
        <select class="conn-id" style="flex:1"><option value="">â€” NPC â€”</option>${others.map((o) => `<option value="${escapeHtml(o.id)}" ${c.connectedId === o.id ? 'selected' : ''}>${escapeHtml(o.fullName || o.id)}</option>`).join('')}</select>
        <select class="conn-rel">${['ally', 'rival', 'employer', 'employee', 'family', 'romantic', 'informant', 'unknown']
          .map((r) => `<option ${c.relationshipType === r ? 'selected' : ''}>${r}</option>`)
          .join('')}</select>
        <input class="conn-str" type="number" min="1" max="10" value="${c.strength || 5}" style="width:44px">
        <button type="button" class="rm conn-rm">\u2715</button></div>`
      )
      .join('');
    wrap.innerHTML = rows || '<p style="font-size:10px;color:#666;">Add connections below.</p>';
    wireConnRows(wrap, n);
  }

  function wireConnRows(wrap, n) {
    wrap.querySelectorAll('.conn-rm').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.preventDefault();
        collectNpcFromDom();
        const row = b.closest('.conn-row');
        const i = Number(row?.getAttribute('data-i'));
        const arr = state.editingNpcDraft.connectionNetwork || [];
        arr.splice(i, 1);
        state.editingNpcDraft.connectionNetwork = arr;
        renderConnRows(state.editingNpcDraft);
      })
    );
  }

  function renderNpcForm(container) {
    const fp = container || document.getElementById('form-panel');
    const n = state.editingNpcDraft || M.defaultNpc({});
    const mods = M.modifiersToList(n.modifiers);
    const op = (id, v) => `<input type="range" id="npc-${id}" min="-100" max="100" value="${v}"><span class="sv" id="npc-${id}-sv">${v}</span><span class="sl">${escapeHtml(M.opinionLabel(v))}</span>`;

    fp.innerHTML = `
      <div class="st-tab-panel active" data-idx="0">${npcIdentityHtml(n)}</div>
      <div class="st-tab-panel" data-idx="1">
        <div class="section-group"><div class="sg-header">Social weight</div><div class="sg-body">
          <div class="slider-row"><label>Social weight</label><input type="range" id="npc-sw" min="0" max="100" value="${n.socialWeight ?? 0}">
            <span class="sv" id="npc-sw-sv">${n.socialWeight ?? 0}</span><span class="sl">${escapeHtml(M.socialWeightLabel(n.socialWeight))}</span></div>
          <div class="field-row"><label>Source</label><input type="text" id="npc-swsrc" value="${escapeHtml(n.socialWeightSource || '')}"></div>
          <div class="field-row" style="align-items:flex-start;"><label>Vulnerabilities</label><textarea id="npc-vuln" rows="3" placeholder="One per line">${escapeHtml((n.vulnerabilities || []).join('\n'))}</textarea></div>
          ${['pp', 'pc', 'pg']
            .map((k, i) => {
              const lab = ['Public', 'Corporate', 'Government'][i];
              const vv = n.perceptionStats?.[['public', 'corporate', 'government'][i]] ?? 50;
              return `<div class="slider-row"><label>${lab}</label><input type="range" id="npc-${k}" min="0" max="100" value="${vv}">
                <span class="sv" id="npc-${k}-sv" style="color:${M.perceptionColor(vv)}">${vv}</span><span class="sl">${escapeHtml(M.perceptionLabel(vv))}</span></div>`;
            })
            .join('')}
        </div></div>
      </div>
      <div class="st-tab-panel" data-idx="2">
        <div class="section-group"><div class="sg-header">Opinions (-100\u2026100)</div><div class="sg-body">
          <div class="slider-row"><label>Player</label>${op('opP', n.opinionProfile?.playerOpinion ?? 0)}</div>
          <div class="slider-row"><label>Corporate</label>${op('opC', n.opinionProfile?.corporateOpinion ?? 0)}</div>
          <div class="slider-row"><label>Government</label>${op('opG', n.opinionProfile?.governmentOpinion ?? 0)}</div>
          <div class="slider-row"><label>CorpOS</label>${op('opCo', n.opinionProfile?.corposOpinion ?? 0)}</div>
          <div class="slider-row"><label>RapidEMart</label>${op('opRm', n.opinionProfile?.rapidemartOpinion ?? 0)}</div>
        </div></div>
      </div>
      <div class="st-tab-panel" data-idx="3">
        <div class="section-group"><div class="sg-header">Connections</div><div class="sg-body" id="conn-rows"></div>
          <button type="button" class="add-btn" id="conn-add" style="margin-top:6px;">Add connection</button></div>
      </div>
      <div class="st-tab-panel" data-idx="4">
        <div class="section-group"><div class="sg-header">Criminal record</div><div class="sg-body" id="crime-rows"></div>
          <button type="button" class="add-btn" id="crime-add">Add entry</button></div>
      </div>
      <div class="st-tab-panel" data-idx="5">${npcContactHtml(n)}</div>
      <div class="st-tab-panel" data-idx="6">
        <div class="section-group"><div class="sg-header">Modifiers</div><div class="sg-body" id="mod-rows">
          ${mods.map((m, i) => modRowHtml(m, i)).join('')}</div>
        <button type="button" class="add-btn" id="mod-add">Add modifier</button></div>
      </div>
      <div class="st-tab-panel" data-idx="7">
        <div class="section-group"><div class="sg-header">Lore</div><div class="sg-body">
          <div class="field-row"><label>Dialogue tags</label><input type="text" id="npc-tags" value="${escapeHtml((n.dialogueTags || []).join(', '))}"></div>
          <div class="field-row"><label>Notes</label><textarea id="npc-lore">${escapeHtml(n.loreNotes || '')}</textarea></div>
        </div></div>
      </div>`;

    renderConnRows(n);
    renderCrimeRows(n);
    document.getElementById('conn-add')?.addEventListener('click', () => {
      collectNpcFromDom();
      state.editingNpcDraft.connectionNetwork = [...(state.editingNpcDraft.connectionNetwork || []), {}];
      renderConnRows(state.editingNpcDraft);
    });
    document.getElementById('crime-add')?.addEventListener('click', () => {
      collectNpcFromDom();
      state.editingNpcDraft.criminalRecord = [...(state.editingNpcDraft.criminalRecord || []), { offense: '', date: '', outcome: 'convicted', penaltyAmount: 0, notes: '' }];
      renderCrimeRows(state.editingNpcDraft);
    });
    document.getElementById('mod-add')?.addEventListener('click', () => {
      collectNpcFromDom();
      const wrap = document.getElementById('mod-rows');
      wrap.insertAdjacentHTML('beforeend', modRowHtml({ rollType: M.ROLL_TYPES[0], value: 0 }, wrap.querySelectorAll('.mod-row').length));
      bindModRows();
    });
    bindModRows();
    bindNpcLivePreview();
    showActiveSubtabPanels();

    const inv = n.role === 'investigator';
    const iw = document.getElementById('npc-inv-wrap');
    if (iw) iw.style.display = inv ? 'flex' : 'none';
    document.getElementById('npc-role')?.addEventListener('change', () => {
      const r = document.getElementById('npc-role').value;
      document.getElementById('npc-inv-wrap').style.display = r === 'investigator' ? 'flex' : 'none';
      syncPreviewFromNpcForm();
    });
    document.getElementById('npc-name')?.addEventListener('input', () => {
      const h = document.getElementById('npc-bc');
      if (h && !h.dataset.touched) h.value = M.autoBlackCherryHandle(document.getElementById('npc-name').value);
    });
    document.getElementById('npc-bc')?.addEventListener('input', () => {
      document.getElementById('npc-bc').dataset.touched = '1';
    });
    document.getElementById('npc-ssn-show')?.addEventListener('change', (e) => {
      const s = document.getElementById('npc-ssn');
      if (s) s.type = e.target.checked ? 'text' : 'password';
    });
  }

  function npcIdentityHtml(n) {
    return `<div class="section-group"><div class="sg-header">Identity</div><div class="sg-body grid-2" style="display:block;">
      <div class="field-row"><label>Full name</label><input type="text" id="npc-name" value="${escapeHtml(n.fullName || '')}"></div>
      <div class="field-row"><label>DOB</label><input type="text" id="npc-dob" value="${escapeHtml(n.dateOfBirth || '')}"></div>
      <div class="field-row"><label>Age</label><input type="number" id="npc-age" value="${n.age ?? 0}"></div>
      <div class="field-row"><label>Gender</label><select id="npc-gender">${['', 'Female', 'Male', 'Other'].map((g) => `<option ${n.gender === g ? 'selected' : ''}>${g}</option>`).join('')}</select></div>
      <div class="field-row"><label>Profession</label><input type="text" id="npc-prof" value="${escapeHtml(n.profession || '')}"></div>
      <div class="field-row"><label>Employer</label><input type="text" id="npc-employer" value="${escapeHtml(n.employer || '')}"></div>
      <div class="field-row"><label>Employer type</label><select id="npc-emptype">${['company', 'institution', 'self-employed', 'unemployed'].map((e) => `<option ${(n.employerType || '') === e ? 'selected' : ''}>${e}</option>`).join('')}</select></div>
      <div class="field-row"><label>Income</label><input type="number" id="npc-income" value="${n.annualIncome ?? 0}"></div>
      <div class="field-row"><label>Net worth</label><input type="number" id="npc-networth" value="${n.netWorth ?? 0}"></div>
      <div class="field-row"><label>Lifestyle</label><select id="npc-life">${['low', 'middle', 'upper-middle', 'wealthy', 'elite'].map((l) => `<option ${(n.lifestyle || 'middle') === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field-row"><label>Address</label><input type="text" id="npc-addr" value="${escapeHtml(n.homeAddress || '')}"></div>
      <div class="field-row"><label>Phone</label><input type="text" id="npc-phone" value="${escapeHtml(n.phone || '')}"></div>
      <div class="field-row"><label>Email</label><input type="email" id="npc-email" value="${escapeHtml(n.email || '')}"></div>
      <div class="field-row"><label>SSN</label><input type="password" id="npc-ssn" value="${escapeHtml(n.socialSecurityNumber || '')}" autocomplete="off"></div>
      <div class="check-row"><input type="checkbox" id="npc-ssn-show"> <label>Show SSN</label></div>
    </div></div>`;
  }

  function npcContactHtml(n) {
    return `<div class="section-group"><div class="sg-header">Contact / role</div><div class="sg-body">
      <div class="grid-2" style="display:grid;">
        <div class="field-row"><label>Role</label><select id="npc-role">${['contact', 'rival', 'investigator', 'neutral', 'story'].map((r) => `<option ${(n.role || '') === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
        <div class="field-row"><label>Availability</label><select id="npc-avail">${['always', 'unlocked', 'hidden', 'dark-web-only'].map((a) => `<option ${(n.contactAvailability || '') === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="field-row" id="npc-inv-wrap" style="display:${n.role === 'investigator' ? 'flex' : 'none'}"><label>Inv. tier</label><select id="npc-invTier">${['', 'Tier 1', 'Tier 2', 'Tier 3'].map((t) => `<option ${(n.investigatorTier || '') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field-row"><label>BC handle</label><input type="text" id="npc-bc" value="${escapeHtml(n.blackCherryHandle || '')}"></div>
        <div class="field-row"><label>Unlock req</label><input type="text" id="npc-unlockReq" value="${escapeHtml(n.unlockRequirement || '')}"></div>
        <div class="field-row"><label>Unlock cond</label><input type="text" id="npc-unlockCond" value="${escapeHtml(n.unlockCondition || '')}"></div>
      </div>
      <div class="check-row"><input type="checkbox" id="npc-keyChar" ${n.isKeyCharacter ? 'checked' : ''}> <label>Key story character</label></div>
    </div></div>`;
  }

  function modRowHtml(m, i) {
    return `<div class="mod-item mod-row" data-i="${i}">
      <select class="mod-type">${M.ROLL_TYPES.map((t) => `<option ${m.rollType === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <input type="number" class="mod-val" value="${m.value ?? 0}" style="width:64px">
      <button type="button" class="rm mod-rm">\u2715</button></div>`;
  }

  function bindModRows() {
    document.querySelectorAll('.mod-rm').forEach((b) =>
      b.addEventListener('click', () => {
        collectNpcFromDom();
        b.closest('.mod-row').remove();
      })
    );
  }

  function renderCrimeRows(n) {
    const wrap = document.getElementById('crime-rows');
    if (!wrap) return;
    const arr = n.criminalRecord || [];
    wrap.innerHTML = (arr.length ? arr : [{ offense: '', date: '', outcome: 'convicted', penaltyAmount: 0, notes: '' }])
      .map(
        (c, i) => `<div class="crime-item crime-row" data-i="${i}">
        <input class="crime-off" placeholder="Offense" value="${escapeHtml(c.offense || '')}" style="flex:1">
        <input class="crime-date" placeholder="Date" value="${escapeHtml(c.date || '')}" style="width:100px">
        <select class="crime-out">${['convicted', 'acquitted', 'charges dropped', 'settled'].map((o) => `<option ${c.outcome === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <input class="crime-pen" type="number" placeholder="$" value="${c.penaltyAmount ?? 0}" style="width:70px">
        <input class="crime-notes" placeholder="Notes" value="${escapeHtml(c.notes || '')}" style="flex:1">
        <button type="button" class="rm crime-rm">\u2715</button></div>`
      )
      .join('');
    wrap.querySelectorAll('.crime-rm').forEach((b) =>
      b.addEventListener('click', () => {
        collectNpcFromDom();
        const row = b.closest('.crime-row');
        const i = Number(row.getAttribute('data-i'));
        state.editingNpcDraft.criminalRecord.splice(i, 1);
        renderCrimeRows(state.editingNpcDraft);
      })
    );
  }

  function bindNpcLivePreview() {
    const ids = ['npc-name', 'npc-bc', 'npc-role', 'npc-avail', 'npc-sw', 'npc-swsrc', 'npc-pp', 'npc-pc', 'npc-pg'];
    const onRange = (id, sv) => {
      const el = document.getElementById(id);
      const s = document.getElementById(sv);
      if (el && s)
        el.addEventListener('input', () => {
          s.textContent = el.value;
          if (sv === 'npc-pp-sv' || sv === 'npc-pc-sv' || sv === 'npc-pg-sv') {
            s.style.color = M.perceptionColor(el.value);
            const sl = s.nextElementSibling;
            if (sl) sl.textContent = M.perceptionLabel(el.value);
          }
          if (sv === 'npc-sw-sv') {
            const sl = s.nextElementSibling;
            if (sl) sl.textContent = M.socialWeightLabel(el.value);
          }
          syncPreviewFromNpcForm();
        });
    };
    onRange('npc-sw', 'npc-sw-sv');
    onRange('npc-pp', 'npc-pp-sv');
    onRange('npc-pc', 'npc-pc-sv');
    onRange('npc-pg', 'npc-pg-sv');
    ['opP', 'opC', 'opG', 'opCo', 'opRm'].forEach((k) => {
      const el = document.getElementById('npc-' + k);
      const sv = document.getElementById('npc-' + k + '-sv');
      if (el && sv)
        el.addEventListener('input', () => {
          sv.textContent = el.value;
          const sl = sv.nextElementSibling;
          if (sl) sl.textContent = M.opinionLabel(el.value);
          syncPreviewFromNpcForm();
        });
    });
  }

  function syncPreviewFromNpcForm() {
    collectNpcFromDom();
    const b = document.getElementById('preview-body');
    if (b && state.engine === 'npc') b.innerHTML = npcPreviewHtml(state.editingNpcDraft);
  }

  async function saveNpc() {
    collectNpcFromDom();
    const o = state.editingNpcDraft;
    if (!o.fullName) {
      flashStatus('Name required', false);
      return;
    }
    let list = state.registry.npcs.slice();
    if (state.selectedNpcId) list = list.map((n) => (n.id === state.selectedNpcId ? { ...o, id: state.selectedNpcId, type: 'person' } : n));
    else {
      const nn = M.defaultNpc({ ...o, id: undefined });
      list.push(nn);
      state.selectedNpcId = nn.id;
      state.editingNpcDraft = deepClone(nn);
    }
    list = list.map((n) => ({
      ...n,
      connectionNetwork: (n.connectionNetwork || []).filter((c) => list.some((x) => x.id === c.connectedId))
    }));
    await writeJsonFile('npcs.json', list);
    flashStatus('Saved.', true);
    document.getElementById('sidebar-last').textContent = 'Last: NPC save';
    refreshSidebar();
    renderLeftPanel();
    renderPreviewPanel();
    refreshStatusValidation();
  }

  function exportNpc() {
    collectNpcFromDom();
    const blob = new Blob([JSON.stringify(state.editingNpcDraft, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.editingNpcDraft.fullName || 'npc').replace(/\W+/g, '_')}.json`;
    a.click();
  }

  function duplicateNpc() {
    collectNpcFromDom();
    const copy = deepClone(state.editingNpcDraft);
    delete copy.id;
    state.selectedNpcId = null;
    state.editingNpcDraft = M.defaultNpc({ ...copy, id: undefined });
    renderNpcForm();
    renderPreviewPanel();
    renderLeftPanel();
    flashStatus('Duplicated â€” save as new', true);
  }

  async function deleteNpc() {
    if (!state.selectedNpcId || !confirm('Delete this NPC?')) return;
    const next = state.registry.npcs.filter((n) => n.id !== state.selectedNpcId).map((n) => ({
      ...n,
      connectionNetwork: (n.connectionNetwork || []).filter((c) => c.connectedId !== state.selectedNpcId)
    }));
    await writeJsonFile('npcs.json', next);
    state.selectedNpcId = null;
    loadNpcDraft(null);
    renderLeftPanel();
    flashStatus('Deleted.', true);
  }

  /* -------- Company engine -------- */

  function loadCompanyDraft(id) {
    if (id) {
      const c = state.registry.companies.find((x) => x.id === id);
      state.editingCompanyDraft = c ? deepClone(c) : M.defaultCompany({});
      state.selectedCompanyId = id;
    } else {
      state.editingCompanyDraft = M.defaultCompany({});
      state.selectedCompanyId = null;
    }
    renderCompanyForm();
    renderPreviewPanel();
  }

  function renderCompanyList(inner) {
    let list = state.registry.companies.slice();
    const q = state.listSearch.toLowerCase();
    if (q) list = list.filter((c) => (c.tradingName || c.legalName || '').toLowerCase().includes(q));
    if (state.coOwnerFilter !== 'all') list = list.filter((c) => c.ownerType === state.coOwnerFilter);
    inner.innerHTML = `
      <div class="lp-header"><span>COMPANIES</span><span style="font-weight:normal;opacity:.8">${list.length}</span></div>
      <div style="padding:4px;"><input type="search" id="co-search" placeholder="Search..." style="width:100%;height:20px;border:2px inset #808080;padding:2px 4px;"></div>
      <div style="padding:4px;"><select id="co-filter-owner" style="width:100%;height:20px;font-size:10px;">
        <option value="all">All owners</option><option>player</option><option>rival</option><option>npc</option><option>government</option><option>institution</option>
      </select></div>
      <div class="lp-list" id="co-lp-list" tabindex="0">${list
        .map((c) => {
          const sel = c.id === state.selectedCompanyId ? 'selected' : '';
          return `<div class="list-item ${sel}" data-co-id="${escapeHtml(c.id)}">
            <span>\uD83C\uDFE2</span><div style="flex:1;min-width:0;"><div style="font-weight:bold;">${escapeHtml(c.tradingName || c.legalName || c.id)}</div>
            <div style="font-size:9px;color:#666;">${escapeHtml(c.industry || '')}</div></div>
            <span class="li-badge badge-neutral">${escapeHtml((c.ownerType || '').slice(0, 5))}</span></div>`;
        })
        .join('')}</div>
      <button type="button" class="add-btn" id="co-new">\uFF0B New company</button>`;
    inner.querySelector('#co-search').value = state.listSearch;
    inner.querySelector('#co-filter-owner').value = state.coOwnerFilter;
    inner.querySelector('#co-search').addEventListener('input', (e) => {
      state.listSearch = e.target.value;
      renderLeftPanel();
    });
    inner.querySelector('#co-filter-owner').addEventListener('change', (e) => {
      state.coOwnerFilter = e.target.value;
      renderLeftPanel();
    });
    inner.querySelector('#co-new').addEventListener('click', () => {
      state.listSearch = '';
      loadCompanyDraft(null);
      renderLeftPanel();
    });
    inner.querySelectorAll('[data-co-id]').forEach((row) =>
      row.addEventListener('click', () => loadCompanyDraft(row.getAttribute('data-co-id')))
    );
  }

  function collectCompanyFromDom() {
    const c = state.editingCompanyDraft || M.defaultCompany({});
    const v = (id) => (document.getElementById('co-' + id) ? document.getElementById('co-' + id).value : '');
    const n = (id) => Number(v(id)) || 0;
    const ck = (id) => !!(document.getElementById('co-' + id) && document.getElementById('co-' + id).checked);
    c.legalName = v('legal');
    c.tradingName = v('trade');
    c.entityType = v('entity');
    c.industry = v('ind');
    c.registrationNumber = v('reg');
    c.registrationDate = v('regd');
    c.hqLocation = v('hq');
    c.weeklyRevenue = n('rev');
    c.weeklyExpenses = n('exp');
    c.totalAssets = n('assets');
    c.totalDebt = n('debt');
    c.totalLiab = n('liab');
    c.totalLiabilities = n('liab');
    c.employeeCount = n('emp');
    c.tier = n('tier');
    c.perceptionStats = { public: n('pp'), corporate: n('pc'), government: n('pg') };
    c.notoriety = n('not');
    c.corporateExposure = n('ce');
    c.activeLawyer = v('law');
    c.activeInvestigator = v('inv') || null;
    c.judicialRecord = collectCoJudicialFromDom();
    c.ownerType = v('owner');
    c.ownerId = v('ownerId') || null;
    c.isPlayerCompany = ck('isplayer');
    c.companySlot = v('slot') ? Number(v('slot')) : null;
    if (v('slot') === 'none' || v('slot') === '') c.companySlot = null;
    c.parentHolding = v('parent') || null;
    c.subsidiaries = (v('subs') || '')
      .split(/[,\\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    c.combatCapabilities = {
      social: ck('cap-soc'),
      espionage: ck('cap-esp'),
      sabotage: ck('cap-sab'),
      cyber: ck('cap-cyb'),
      legal: ck('cap-leg')
    };
    c.personalityType = v('pers');
    c.rivalBehavior = {
      awarenessThreshold: n('r-aw'),
      decisionStyle: v('r-ds'),
      memoryDuration: n('r-mem'),
      allianceCapable: ck('r-all'),
      scalingType: v('r-scale')
    };
    c.loreNotes = v('lore');
    c.isKeyCompany = ck('keyco');
    if (!state.selectedCompanyId) delete c.id;
    return c;
  }

  function collectCoJudicialFromDom() {
    const w = document.getElementById('co-jr-rows');
    if (!w) return state.editingCompanyDraft?.judicialRecord || [];
    return [...w.querySelectorAll('.co-jr-row')]
      .map((r) => ({
        offense: r.querySelector('.jr-off')?.value || '',
        date: r.querySelector('.jr-date')?.value || '',
        outcome: r.querySelector('.jr-out')?.value || 'convicted',
        penaltyAmount: Number(r.querySelector('.jr-pen')?.value) || 0,
        notes: r.querySelector('.jr-notes')?.value || ''
      }))
      .filter((x) => x.offense);
  }

  function renderCoJudicialRows(c) {
    const w = document.getElementById('co-jr-rows');
    if (!w) return;
    const arr = c.judicialRecord || [];
    w.innerHTML = (arr.length ? arr : [{}])
      .map(
        (j, i) => `<div class="co-jr-row crime-item" data-i="${i}">
        <input class="jr-off" placeholder="Offense" value="${escapeHtml(j.offense || '')}" style="flex:1">
        <input class="jr-date" value="${escapeHtml(j.date || '')}" style="width:90px">
        <select class="jr-out">${['convicted', 'acquitted', 'settled'].map((o) => `<option ${j.outcome === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <input class="jr-pen" type="number" value="${j.penaltyAmount ?? 0}" style="width:60px">
        <input class="jr-notes" placeholder="Notes" value="${escapeHtml(j.notes || '')}" style="flex:1">
        <button type="button" class="rm co-jr-rm">\u2715</button></div>`
      )
      .join('');
    w.querySelectorAll('.co-jr-rm').forEach((b) =>
      b.addEventListener('click', () => {
        collectCompanyFromDom();
        const i = Number(b.closest('.co-jr-row').getAttribute('data-i'));
        state.editingCompanyDraft.judicialRecord.splice(i, 1);
        renderCoJudicialRows(state.editingCompanyDraft);
      })
    );
  }

  function renderCompanyForm(container) {
    const fp = container || document.getElementById('form-panel');
    const c = state.editingCompanyDraft || M.defaultCompany({});
    const invs = state.registry.npcs.filter((n) => n.role === 'investigator');
    const valRo = M.computeAdjustedValuation(c);
    const rep = M.reputationBonusFromPerception(c.perceptionStats);
    const dc = M.judicialRecordDcModifier((c.judicialRecord || []).length);
    renderCompanyFormSimple(fp, c, invs, valRo, dc, rep);
  }

  function renderCompanyFormSimple(fp, c, invs, valRo, dc, rep) {
    const judicialHtml = (c.judicialRecord || []).length
      ? (c.judicialRecord || [])
          .map(
            (j, i) => `<div class="co-jr-row crime-item" data-i="${i}">
        <input class="jr-off" value="${escapeHtml(j.offense || '')}" style="flex:1"><input class="jr-date" value="${escapeHtml(j.date || '')}" style="width:80px">
        <select class="jr-out">${['convicted', 'acquitted', 'settled'].map((o) => `<option ${j.outcome === o ? 'selected' : ''}>${o}</option>`).join('')}</select>
        <input class="jr-pen" type="number" value="${j.penaltyAmount ?? 0}" style="width:50px"><button type="button" class="rm co-jr-rm">\u2715</button></div>`
          )
          .join('')
      : '';
    const panels = [
      `<div class="st-tab-panel" data-idx="0"><div class="section-group"><div class="sg-header">Identity</div><div class="sg-body">
        <div class="field-row"><label>Legal</label><input id="co-legal" value="${escapeHtml(c.legalName || '')}"></div>
        <div class="field-row"><label>Trading</label><input id="co-trade" value="${escapeHtml(c.tradingName || '')}"></div>
        <div class="field-row"><label>Entity</label><select id="co-entity">${['sole-proprietor', 'LLC', 'corporation', 'holding-company'].map((x) => `<option ${(c.entityType || '') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
        <div class="field-row"><label>Industry</label><select id="co-ind">${M.INDUSTRIES.map((ind) => `<option ${c.industry === ind ? 'selected' : ''}>${ind}</option>`).join('')}</select></div>
        <div class="field-row"><label>Reg #</label><input id="co-reg" value="${escapeHtml(c.registrationNumber || '')}"></div>
        <div class="field-row"><label>Reg date</label><input id="co-regd" value="${escapeHtml(c.registrationDate || '')}"></div>
        <div class="field-row"><label>HQ</label><input id="co-hq" value="${escapeHtml(c.hqLocation || '')}"></div></div></div></div>`,
      `<div class="st-tab-panel" data-idx="1"><div class="section-group"><div class="sg-header">Financials</div><div class="sg-body">
        <div class="field-row"><label>Revenue/wk</label><input type="number" id="co-rev" value="${c.weeklyRevenue ?? 0}"></div>
        <div class="field-row"><label>Expenses/wk</label><input type="number" id="co-exp" value="${c.weeklyExpenses ?? 0}"></div>
        <div class="field-row"><label>Assets</label><input type="number" id="co-assets" value="${c.totalAssets ?? 0}"></div>
        <div class="field-row"><label>Debt</label><input type="number" id="co-debt" value="${c.totalDebt ?? 0}"></div>
        <div class="field-row"><label>Liabilities</label><input type="number" id="co-liab" value="${c.totalLiabilities ?? 0}"></div>
        <div class="field-row"><label>Employees</label><input type="number" id="co-emp" value="${c.employeeCount ?? 0}"></div>
        <div class="field-row"><label>Tier 1-5</label><input type="number" id="co-tier" min="1" max="5" value="${c.tier ?? 1}"></div>
        <div class="field-row"><label>Rep bonus</label><span id="co-rep-ro">${rep}</span></div>
        <div class="field-row"><label>Valuation</label><strong id="co-val-ro">${valRo.toLocaleString()}</strong></div></div></div></div>`,
      `<div class="st-tab-panel" data-idx="2"><div class="section-group"><div class="sg-header">Perception</div><div class="sg-body">
        <div class="slider-row"><label>Public</label><input type="range" id="co-pp" min="0" max="100" value="${c.perceptionStats?.public ?? 50}"><span class="sv" id="co-pp-sv">${c.perceptionStats?.public ?? 50}</span></div>
        <div class="slider-row"><label>Corporate</label><input type="range" id="co-pc" min="0" max="100" value="${c.perceptionStats?.corporate ?? 50}"><span class="sv" id="co-pc-sv">${c.perceptionStats?.corporate ?? 50}</span></div>
        <div class="slider-row"><label>Government</label><input type="range" id="co-pg" min="0" max="100" value="${c.perceptionStats?.government ?? 50}"><span class="sv" id="co-pg-sv">${c.perceptionStats?.government ?? 50}</span></div>
        </div></div></div>`,
      `<div class="st-tab-panel" data-idx="3"><div class="section-group"><div class="sg-header">Risk</div><div class="sg-body">
        <div class="slider-row"><label>Notoriety</label><input type="range" id="co-not" min="0" max="200" value="${c.notoriety ?? 0}"><span class="sv" id="co-not-sv">${c.notoriety ?? 0}</span></div>
        <div class="slider-row"><label>Exposure</label><input type="range" id="co-ce" min="0" max="100" value="${c.corporateExposure ?? 0}"><span class="sv" id="co-ce-sv">${c.corporateExposure ?? 0}</span></div>
        <div class="field-row"><label>Lawyer</label><select id="co-law">${['none', 'basic', 'mid', 'top', 'elite'].map((l) => `<option ${(c.activeLawyer || 'none') === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field-row"><label>Investigator</label><select id="co-inv"><option value="">â€”</option>${invs.map((n) => `<option value="${escapeHtml(n.fullName || n.id)}" ${c.activeInvestigator === n.fullName ? 'selected' : ''}>${escapeHtml(n.fullName || n.id)}</option>`).join('')}</select></div>
        </div></div></div>`,
      `<div class="st-tab-panel" data-idx="4"><div class="section-group"><div class="sg-header">Judicial (+${dc} DC)</div><div class="sg-body" id="co-jr-rows">${judicialHtml}</div>
        <button type="button" class="add-btn" id="co-jr-add">Add</button></div></div></div>`,
      `<div class="st-tab-panel" data-idx="5"><div class="section-group"><div class="sg-header">Ownership</div><div class="sg-body">
        <div class="field-row"><label>Owner type</label><select id="co-owner">${['player', 'rival', 'npc', 'government', 'institution'].map((o) => `<option ${(c.ownerType || '') === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
        <div class="field-row"><label>Owner ID</label><input id="co-ownerId" value="${escapeHtml(c.ownerId || '')}"></div>
        <div class="check-row"><input type="checkbox" id="co-isplayer" ${c.isPlayerCompany ? 'checked' : ''}> Player co.</div>
        <div class="field-row"><label>Slot</label><select id="co-slot"><option value="">none</option><option value="1" ${c.companySlot === 1 ? 'selected' : ''}>1</option><option value="2" ${c.companySlot === 2 ? 'selected' : ''}>2</option><option value="3" ${c.companySlot === 3 ? 'selected' : ''}>3</option></select></div>
        <div class="field-row"><label>Parent</label><select id="co-parent"><option value="">â€”</option>${state.registry.companies.filter((x) => x.id !== c.id).map((x) => `<option value="${escapeHtml(x.id)}" ${c.parentHolding === x.id ? 'selected' : ''}>${escapeHtml(x.tradingName || x.id)}</option>`).join('')}</select></div>
        <div class="field-row"><label>Subs IDs</label><input id="co-subs" value="${escapeHtml((c.subsidiaries || []).join(', '))}"></div>
        </div></div></div>`,
      `<div class="st-tab-panel" data-idx="6"><div class="section-group"><div class="sg-header">Combat</div><div class="sg-body">
        ${['soc:social', 'esp:espionage', 'sab:sabotage', 'cyb:cyber', 'leg:legal'].map((p) => {
          const [id, key] = p.split(':');
          return `<div class="check-row"><input type="checkbox" id="co-cap-${id}" ${c.combatCapabilities?.[key] ? 'checked' : ''}> ${key}</div>`;
        }).join('')}
        </div></div></div>`,
      `<div class="st-tab-panel" data-idx="7"><div class="section-group"><div class="sg-header">Rival AI</div><div class="sg-body" id="co-rival-body">
        <div class="field-row"><label>Personality</label><select id="co-pers">${['aggressive', 'subtle', 'defensive', 'balanced', 'corrupt'].map((p) => `<option ${(c.personalityType || '') === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
        <div class="slider-row"><label>Awareness</label><input type="range" id="co-r-aw" min="0" max="100" value="${c.rivalBehavior?.awarenessThreshold ?? 0}"><span class="sv" id="co-r-aw-sv">${c.rivalBehavior?.awarenessThreshold ?? 0}</span></div>
        <div class="field-row"><label>Style</label><select id="co-r-ds">${['scheduled', 'reactive'].map((d) => `<option ${(c.rivalBehavior?.decisionStyle || '') === d ? 'selected' : ''}>${d}</option>`).join('')}</select></div>
        <div class="field-row"><label>Memory</label><input type="number" id="co-r-mem" value="${c.rivalBehavior?.memoryDuration ?? 0}"></div>
        <div class="check-row"><input type="checkbox" id="co-r-all" ${c.rivalBehavior?.allianceCapable ? 'checked' : ''}> Alliance</div>
        <div class="field-row"><label>Scale</label><select id="co-r-scale">${['player-tied', 'independent'].map((s) => `<option ${(c.rivalBehavior?.scalingType || '') === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        </div></div></div>`,
      `<div class="st-tab-panel" data-idx="8"><div class="section-group"><div class="sg-header">Lore</div><div class="sg-body">
        <textarea id="co-lore" rows="4">${escapeHtml(c.loreNotes || '')}</textarea>
        <div class="check-row"><input type="checkbox" id="co-keyco" ${c.isKeyCompany ? 'checked' : ''}> Key</div></div></div></div>`
    ];
    fp.innerHTML = panels.join('');
    showActiveSubtabPanels();
    document.getElementById('co-jr-add').addEventListener('click', () => {
      collectCompanyFromDom();
      state.editingCompanyDraft.judicialRecord = [...(state.editingCompanyDraft.judicialRecord || []), {}];
      renderCompanyForm();
    });
    fp.querySelectorAll('.co-jr-rm').forEach((b) =>
      b.addEventListener('click', () => {
        collectCompanyFromDom();
        const i = Number(b.closest('.co-jr-row').getAttribute('data-i'));
        state.editingCompanyDraft.judicialRecord.splice(i, 1);
        renderCompanyForm();
      })
    );
    const updCo = () => {
      collectCompanyFromDom();
      const v = M.computeAdjustedValuation(state.editingCompanyDraft);
      const r = M.reputationBonusFromPerception(state.editingCompanyDraft.perceptionStats);
      const elv = document.getElementById('co-val-ro');
      const elr = document.getElementById('co-rep-ro');
      if (elv) elv.textContent = v.toLocaleString();
      if (elr) elr.textContent = String(r);
      const b = document.getElementById('preview-body');
      if (b && state.engine === 'company') b.innerHTML = companyPreviewHtml(state.editingCompanyDraft);
    };
    ['co-rev', 'co-exp', 'co-assets', 'co-debt', 'co-liab', 'co-pp', 'co-pc', 'co-pg', 'co-not', 'co-ce'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updCo);
    });
    document.getElementById('co-owner').addEventListener('change', () => {
      const rival = document.getElementById('co-owner').value === 'rival';
      document.querySelector('.st-tab-panel[data-idx="7"]').style.opacity = rival ? '1' : '0.45';
    });
    [['co-pp', 'co-pp-sv'], ['co-pc', 'co-pc-sv'], ['co-pg', 'co-pg-sv'], ['co-not', 'co-not-sv'], ['co-ce', 'co-ce-sv'], ['co-r-aw', 'co-r-aw-sv']].forEach(([a, b]) => {
      const x = document.getElementById(a);
      const y = document.getElementById(b);
      if (x && y) x.addEventListener('input', () => (y.textContent = x.value));
    });
    bindSectionCollapse(fp);
  }

  async function saveCompany() {
    collectCompanyFromDom();
    const o = state.editingCompanyDraft;
    if (!o.legalName && !o.tradingName) {
      flashStatus('Company name required', false);
      return;
    }
    let list = state.registry.companies.slice();
    if (state.selectedCompanyId) list = list.map((x) => (x.id === state.selectedCompanyId ? { ...o, id: state.selectedCompanyId, type: 'company' } : x));
    else {
      const nn = M.defaultCompany({ ...o, id: undefined });
      list.push(nn);
      state.selectedCompanyId = nn.id;
      state.editingCompanyDraft = deepClone(nn);
    }
    list = M.updateCompaniesLedger(list);
    await writeJsonFile('companies.json', list);
    flashStatus('Saved.', true);
    document.getElementById('sidebar-last').textContent = 'Last: company save';
    refreshSidebar();
    renderLeftPanel();
    renderPreviewPanel();
    refreshStatusValidation();
  }

  function exportCompany() {
    collectCompanyFromDom();
    const blob = new Blob([JSON.stringify(state.editingCompanyDraft, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(state.editingCompanyDraft.tradingName || 'co').replace(/\W+/g, '_')}.json`;
    a.click();
  }

  function duplicateCompany() {
    collectCompanyFromDom();
    state.selectedCompanyId = null;
    const x = deepClone(state.editingCompanyDraft);
    delete x.id;
    state.editingCompanyDraft = M.defaultCompany({ ...x, id: undefined });
    renderCompanyForm();
    renderPreviewPanel();
    renderLeftPanel();
  }

  async function deleteCompany() {
    if (!state.selectedCompanyId || !confirm('Delete company?')) return;
    const id = state.selectedCompanyId;
    let list = state.registry.companies
      .filter((c) => c.id !== id)
      .map((c) => ({
        ...c,
        subsidiaries: (c.subsidiaries || []).filter((s) => s !== id),
        parentHolding: c.parentHolding === id ? null : c.parentHolding
      }));
    list = M.updateCompaniesLedger(list);
    await writeJsonFile('companies.json', list);
    loadCompanyDraft(null);
    renderLeftPanel();
    flashStatus('Deleted.', true);
  }

  /* -------- Government -------- */

  function pathGet(o, p) {
    return String(p)
      .split('.')
      .reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);
  }
  function pathSet(o, p, v) {
    const keys = String(p).split('.');
    let c = o;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!c[k] || typeof c[k] !== 'object') c[k] = {};
      c = c[k];
    }
    c[keys[keys.length - 1]] = v;
  }

  function renderGovLeft(inner) {
    const g = state.editingGovDraft || {};
    const tax = g.taxSystem || {};
    const comp = g.complianceValues || {};
    inner.innerHTML = `
      <div class="lp-header">GOVERNMENT</div>
      <div class="lp-list" style="padding:8px;font-size:10px;">
        <div><b>Corp tax</b> ${((Number(tax.corporateTaxRate) || 0) * 100).toFixed(1)}%</div>
        <div><b>Scrutiny</b> ${comp.corposBaseScrutinyLevel ?? 'â€”'}</div>
        <div><b>Fine mult.</b> ${comp.fineMultiplier ?? 'â€”'}</div>
        <div><b>Agencies</b> ${(g.activeAgencies || []).filter((a) => a.active !== false).length}</div>
      </div>`;
  }

  function isTaxRatePath(path) {
    return /^taxSystem\.(corporateTaxRate|personalIncomeTaxRate|capitalGainsTaxRate)$/.test(path);
  }

  function govField(label, path, type, min, max, step) {
    const v = pathGet(state.editingGovDraft, path);
    const id = 'gov-' + path.replace(/\./g, '-');
    if (type === 'range') {
      const usePct = isTaxRatePath(path);
      const disp = usePct ? (Number(v) || 0) * 100 : Number(v) || 0;
      return `<div class="slider-row"><label>${escapeHtml(label)}</label><input type="range" id="${id}" data-path="${path}" data-frac="${usePct ? '1' : ''}" min="${min}" max="${max}" step="${step || 1}" value="${disp}">
        <span class="sv gov-val" data-for="${id}">${disp}</span></div>`;
    }
    return `<div class="field-row"><label>${escapeHtml(label)}</label><input id="${id}" data-path="${path}" type="${type}" value="${escapeHtml(String(v ?? ''))}"></div>`;
  }

  function renderGovForm(fp) {
    const g = state.editingGovDraft || {};
    const tabs = [
      `<div class="st-tab-panel" data-idx="0"><div class="section-group"><div class="sg-header">Tax system</div><div class="sg-body">
        ${govField('Corporate tax %', 'taxSystem.corporateTaxRate', 'range', 0, 50, 0.5)}
        ${govField('Income tax %', 'taxSystem.personalIncomeTaxRate', 'range', 0, 50, 0.5)}
        ${govField('Cap gains %', 'taxSystem.capitalGainsTaxRate', 'range', 0, 30, 0.5)}
        <div class="field-row"><label>Frequency</label><select id="gov-tax-freq" data-path="taxSystem.taxFilingFrequency">${['quarterly', 'monthly', 'annual'].map((f) => `<option ${(g.taxSystem?.taxFilingFrequency || '') === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="field-row"><label>Deadline week</label><input type="number" id="gov-tax-dw" data-path="taxSystem.taxDeadlineWeek" value="${g.taxSystem?.taxDeadlineWeek ?? 12}"></div>
        <div class="field-row"><label>Late penalty</label><input type="number" id="gov-tax-late" data-path="taxSystem.penaltyForLateFiling" value="${g.taxSystem?.penaltyForLateFiling ?? 0}"></div>
        <div class="field-row"><label>Non-file penalty</label><input type="number" id="gov-tax-nf" data-path="taxSystem.penaltyForNonFiling" value="${g.taxSystem?.penaltyForNonFiling ?? 0}"></div>
        <div class="field-row"><label>FRA audit threshold</label><input type="number" id="gov-tax-fra" data-path="taxSystem.fraAuditThreshold" value="${g.taxSystem?.fraAuditThreshold ?? 0}"></div>
        <p style="font-size:9px;color:#666;margin-top:6px;">Sample on $100k income: tax ${((((Number(g.taxSystem?.personalIncomeTaxRate) || 0.28) * 100000) / 100) || 0).toFixed(0)} (income rate applied as illustration)</p>
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="1"><div class="section-group"><div class="sg-header">Regulatory thresholds</div><div class="sg-body">
        <div class="field-row"><label>Cash report $</label><input type="number" data-path="regulatoryThresholds.cashTransactionReportingThreshold" value="${g.regulatoryThresholds?.cashTransactionReportingThreshold ?? 0}"></div>
        <div class="field-row"><label>SAR harbor</label><input type="number" data-path="regulatoryThresholds.suspiciousActivityReportThreshold_harbor" value="${g.regulatoryThresholds?.suspiciousActivityReportThreshold_harbor ?? 0}"></div>
        <div class="field-row"><label>SAR pacific</label><input type="number" data-path="regulatoryThresholds.suspiciousActivityReportThreshold_pacificrim" value="${g.regulatoryThresholds?.suspiciousActivityReportThreshold_pacificrim ?? 0}"></div>
        <div class="field-row"><label>Structuring window (days)</label><input type="number" data-path="regulatoryThresholds.structuringPatternWindow" value="${g.regulatoryThresholds?.structuringPatternWindow ?? 7}"></div>
        <div class="field-row"><label>Structuring count</label><input type="number" data-path="regulatoryThresholds.structuringPatternCount" value="${g.regulatoryThresholds?.structuringPatternCount ?? 3}"></div>
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="2"><div class="section-group"><div class="sg-header">Compliance</div><div class="sg-body">
        <p style="color:#900;font-size:10px;margin-bottom:6px;">These values affect all companies globally.</p>
        ${govField('Base scrutiny', 'complianceValues.corposBaseScrutinyLevel', 'range', 5, 300, 1)}
        ${govField('Audit freq. mod', 'complianceValues.auditFrequencyModifier', 'range', 5, 300, 1)}
        ${govField('Inv. assign speed', 'complianceValues.investigatorAssignmentSpeed', 'range', 5, 300, 1)}
        ${govField('Fine multiplier', 'complianceValues.fineMultiplier', 'range', 5, 300, 1)}
        ${govField('Dismissal DC mod', 'complianceValues.dismissalDCModifier', 'range', -10, 10, 1)}
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="3"><div class="section-group"><div class="sg-header">Hidden weights</div><div class="sg-body">
        ${govField('Tax compliance w', 'hiddenGovernmentValues.taxComplianceWeight', 'range', 50, 500, 5)}
        ${govField('Charity w', 'hiddenGovernmentValues.charitableActivityWeight', 'range', 50, 500, 5)}
        ${govField('Judicial w', 'hiddenGovernmentValues.judicialRecordWeight', 'range', 50, 500, 5)}
        ${govField('Crime severity w', 'hiddenGovernmentValues.crimeSeverityWeight', 'range', 50, 500, 5)}
        ${govField('Corp aggression w', 'hiddenGovernmentValues.corporateAggressionWeight', 'range', 50, 500, 5)}
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="4"><div class="section-group"><div class="sg-header">Investigator fines</div><div class="sg-body" id="gov-fine-rows">
        ${['tier1Min', 'tier1Max', 'tier2Min', 'tier2Max', 'tier3Min', 'tier3Max', 'tier1FrequencyMin', 'tier1FrequencyMax', 'tier2FrequencyMin', 'tier2FrequencyMax', 'tier3FrequencyMin', 'tier3FrequencyMax']
          .map((k) => {
            const val = g.investigatorFineRanges?. [k] ?? 0;
            return `<div class="field-row"><label>${k}</label><input type="number" data-fine="${k}" value="${val}"></div>`;
          })
          .join('')}
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="5"><div class="section-group"><div class="sg-header">Notoriety tiers (%)</div><div class="sg-body" id="gov-not-rows">
        ${Object.entries(g.notorietyThresholds || {}).map(([k, v]) => `<div class="field-row"><label>${escapeHtml(k)}</label><input type="number" data-not="${k}" value="${v}"></div>`).join('')}
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="6"><div class="section-group"><div class="sg-header">CE tiers (%)</div><div class="sg-body" id="gov-ce-rows">
        ${Object.entries(g.exposureThresholds || {}).map(([k, v]) => `<div class="field-row"><label>${escapeHtml(k)}</label><input type="number" data-ce="${k}" value="${v}"></div>`).join('')}
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="7"><div class="section-group"><div class="sg-header">Personnel</div><div class="sg-body">
        <div id="gov-personnel-rows"></div>
        <button type="button" class="add-btn" id="gov-per-add">Add official</button>
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="8"><div class="section-group"><div class="sg-header">Agencies</div><div class="sg-body">
        <div id="gov-agency-rows"></div>
        <button type="button" class="add-btn" id="gov-ag-add">Add agency</button>
      </div></div></div>`
    ];
    fp.innerHTML = tabs.join('');
    showActiveSubtabPanels();
    fp.querySelectorAll('[data-path]').forEach((el) => {
      el.addEventListener('change', () => collectGovFromDom(fp));
      el.addEventListener('input', () => {
        if (el.type === 'range') {
          const sv = fp.querySelector(`.gov-val[data-for="${el.id}"]`);
          if (sv) sv.textContent = el.value;
        }
      });
    });
    renderGovPersonnel(fp);
    renderGovAgencies(fp);
    document.getElementById('gov-per-add')?.addEventListener('click', () => {
      collectGovFromDom(fp);
      state.editingGovDraft.governmentPersonnel = [...(state.editingGovDraft.governmentPersonnel || []), { name: '', title: '', agency: '', tier: 1, personality: 'strict', modifier: 0 }];
      renderGovForm(fp);
    });
    document.getElementById('gov-ag-add')?.addEventListener('click', () => {
      collectGovFromDom(fp);
      state.editingGovDraft.activeAgencies = [...(state.editingGovDraft.activeAgencies || []), { name: '', jurisdiction: '', scrutinyFocus: 'tax', active: true }];
      renderGovForm(fp);
    });
    bindSectionCollapse(fp);
  }

  function renderGovPersonnel(fp) {
    const w = fp.querySelector('#gov-personnel-rows');
    if (!w) return;
    const arr = state.editingGovDraft.governmentPersonnel || [];
    w.innerHTML = arr
      .map(
        (p, i) => `<div class="crime-item" data-i="${i}">
        <input placeholder="Name" value="${escapeHtml(p.name || '')}" class="gp-name" style="flex:1">
        <input placeholder="Title" value="${escapeHtml(p.title || '')}" class="gp-title">
        <input placeholder="Agency" value="${escapeHtml(p.agency || '')}" class="gp-ag">
        <input type="number" class="gp-tier" value="${p.tier ?? 1}" style="width:40px">
        <select class="gp-person">${['strict', 'lenient', 'corrupt', 'by-the-book'].map((x) => `<option ${p.personality === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <input type="number" class="gp-mod" value="${p.modifier ?? 0}" style="width:50px">
        <button type="button" class="rm gp-rm">\u2715</button></div>`
      )
      .join('');
    w.querySelectorAll('.gp-rm').forEach((b) =>
      b.addEventListener('click', () => {
        collectGovFromDom(fp);
        const i = Number(b.closest('[data-i]').getAttribute('data-i'));
        state.editingGovDraft.governmentPersonnel.splice(i, 1);
        renderGovForm(fp);
      })
    );
  }

  function renderGovAgencies(fp) {
    const w = fp.querySelector('#gov-agency-rows');
    if (!w) return;
    const arr = state.editingGovDraft.activeAgencies || [];
    w.innerHTML = arr
      .map(
        (a, i) => `<div class="crime-item" data-i="${i}">
        <input class="ga-name" value="${escapeHtml(a.name || '')}" placeholder="Name" style="flex:1">
        <input class="ga-jur" value="${escapeHtml(a.jurisdiction || '')}" placeholder="Jurisdiction">
        <select class="ga-focus">${['tax', 'corporate', 'criminal', 'all'].map((x) => `<option ${a.scrutinyFocus === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <label><input type="checkbox" class="ga-act" ${a.active !== false ? 'checked' : ''}> on</label>
        <button type="button" class="rm ga-rm">\u2715</button></div>`
      )
      .join('');
    w.querySelectorAll('.ga-rm').forEach((b) =>
      b.addEventListener('click', () => {
        collectGovFromDom(fp);
        const i = Number(b.closest('[data-i]').getAttribute('data-i'));
        state.editingGovDraft.activeAgencies.splice(i, 1);
        renderGovForm(fp);
      })
    );
  }

  function collectGovFromDom(fp) {
    const g = state.editingGovDraft;
    fp.querySelectorAll('[data-path]').forEach((el) => {
      const p = el.getAttribute('data-path');
      if (!p) return;
      if (el.tagName === 'SELECT') {
        pathSet(g, p, el.value);
        return;
      }
      if (el.type === 'checkbox') {
        pathSet(g, p, el.checked);
        return;
      }
      if (el.type === 'range') {
        const raw = Number(el.value);
        pathSet(g, p, el.getAttribute('data-frac') === '1' ? raw / 100 : raw);
        return;
      }
      if (el.type === 'number') {
        pathSet(g, p, Number(el.value));
        return;
      }
      pathSet(g, p, el.value);
    });
    /* fines */
    if (!g.investigatorFineRanges) g.investigatorFineRanges = {};
    fp.querySelectorAll('[data-fine]').forEach((el) => {
      g.investigatorFineRanges[el.getAttribute('data-fine')] = Number(el.value) || 0;
    });
    if (!g.notorietyThresholds) g.notorietyThresholds = {};
    fp.querySelectorAll('[data-not]').forEach((el) => {
      g.notorietyThresholds[el.getAttribute('data-not')] = Number(el.value) || 0;
    });
    if (!g.exposureThresholds) g.exposureThresholds = {};
    fp.querySelectorAll('[data-ce]').forEach((el) => {
      g.exposureThresholds[el.getAttribute('data-ce')] = Number(el.value) || 0;
    });
    /* personnel */
    g.governmentPersonnel = [...fp.querySelectorAll('#gov-personnel-rows [data-i]')].map((row) => ({
      name: row.querySelector('.gp-name')?.value || '',
      title: row.querySelector('.gp-title')?.value || '',
      agency: row.querySelector('.gp-ag')?.value || '',
      tier: Number(row.querySelector('.gp-tier')?.value) || 1,
      personality: row.querySelector('.gp-person')?.value || 'strict',
      modifier: Number(row.querySelector('.gp-mod')?.value) || 0
    }));
    g.activeAgencies = [...fp.querySelectorAll('#gov-agency-rows [data-i]')].map((row) => ({
      name: row.querySelector('.ga-name')?.value || '',
      jurisdiction: row.querySelector('.ga-jur')?.value || '',
      scrutinyFocus: row.querySelector('.ga-focus')?.value || 'tax',
      active: !!row.querySelector('.ga-act')?.checked
    }));
  }

  function govPreviewCalcHtml() {
    collectGovFromDom(document.getElementById('form-panel'));
    const g = state.editingGovDraft;
    const n = Number(document.getElementById('calc-not')?.value) || 50;
    const ce = Number(document.getElementById('calc-ce')?.value) || 30;
    const tiers = g.notorietyThresholds || {};
    const ceT = g.exposureThresholds || {};
    const notTier = Object.entries(tiers).find(([, v]) => n < v)?.[0] || 'max';
    const ceTier = Object.entries(ceT).find(([, v]) => ce < v)?.[0] || 'max';
    return `<div class="pf-screen" style="color:#ccc;font-size:10px;">
      <div class="field-row" style="margin-bottom:8px;"><label style="color:#fff;">Notoriety %</label><input type="number" id="calc-not" value="${n}" style="width:60px;color:#000;"></div>
      <div class="field-row" style="margin-bottom:8px;"><label style="color:#fff;">CE %</label><input type="number" id="calc-ce" value="${ce}" style="width:60px;color:#000;"></div>
      <button type="button" class="pp-btn" id="calc-run" style="margin-bottom:8px;">Recalc</button>
      <div>Notoriety band: <b>${escapeHtml(notTier)}</b></div>
      <div>CE band: <b>${escapeHtml(ceTier)}</b></div>
    </div>`;
  }

  async function saveGov() {
    collectGovFromDom(document.getElementById('form-panel'));
    await writeJsonFile('government.json', state.editingGovDraft);
    flashStatus('government.json saved', true);
    document.getElementById('sidebar-last').textContent = 'Last: gov';
    refreshStatusValidation();
  }

  /* -------- Web / pages -------- */

  function loadPageDraft(id) {
    if (id) {
      const p = state.registry.pages.find((x) => x.pageId === id);
      state.editingPageDraft = p ? deepClone(p) : M.defaultPage({});
      state.selectedPageId = id;
    } else {
      state.editingPageDraft = M.defaultPage({});
      state.selectedPageId = null;
    }
    renderWebForm(document.getElementById('form-panel'));
    renderPreviewPanel();
  }

  function renderWebList(inner) {
    let list = state.registry.pages.slice();
    if (state.listSearch) {
      const q = state.listSearch.toLowerCase();
      list = list.filter((p) => (p.title || p.url || p.pageId || '').toLowerCase().includes(q));
    }
    if (state.webCatFilter !== 'all') list = list.filter((p) => (p.category || '') === state.webCatFilter);
    inner.innerHTML = `
      <div class="lp-header">PAGES</div>
      <div style="padding:4px;"><input type="search" id="web-search" style="width:100%"></div>
      <div class="lp-list" id="web-lp">${list
        .map((p) => {
          const sel = p.pageId === state.selectedPageId ? 'selected' : '';
          return `<div class="list-item ${sel}" data-page-id="${escapeHtml(p.pageId)}"><span>\uD83C\uDF10</span>
            <div style="flex:1;"><b>${escapeHtml(p.title || p.pageId)}</b><div style="font-size:9px;">${escapeHtml(p.url || '')}</div></div></div>`;
        })
        .join('')}</div>
      <button type="button" class="add-btn" id="web-new">New page</button>`;
    inner.querySelector('#web-search').value = state.listSearch;
    inner.querySelector('#web-search').addEventListener('input', (e) => {
      state.listSearch = e.target.value;
      renderLeftPanel();
    });
    inner.querySelector('#web-new').addEventListener('click', () => loadPageDraft(null));
    inner.querySelectorAll('[data-page-id]').forEach((r) =>
      r.addEventListener('click', () => loadPageDraft(r.getAttribute('data-page-id')))
    );
  }

  function defaultSection(t) {
    const base = { type: t };
    if (t === 'hero') Object.assign(base, { siteNameOverride: '', taglineOverride: '', bgColor: '#0a246a', showBannerAd: false });
    if (t === 'text') Object.assign(base, { headline: '', body: '', links: [] });
    if (t === 'newsFeed') Object.assign(base, { count: 5 });
    if (t === 'productGrid') Object.assign(base, { shopId: '', maxItems: 12, columns: 3 });
    if (t === 'table') Object.assign(base, { headers: [], rows: [] });
    if (t === 'form') Object.assign(base, { formId: 'f1', fields: [], submitLabel: 'Submit' });
    if (t === 'ad') Object.assign(base, { slot: 'inline' });
    if (t === 'login') Object.assign(base, { headline: 'Sign in', systemType: 'wahoo', buttonLabel: 'Log In' });
    if (t === 'profile') Object.assign(base, { fields: ['displayName'] });
    if (t === 'links') Object.assign(base, { items: [] });
    if (t === 'divider') Object.assign(base, { label: '' });
    if (t === 'ticker') Object.assign(base, { inlineText: 'News ticker' });
    return base;
  }

  function renderWebForm(fp) {
    const p = state.editingPageDraft || M.defaultPage({});
    const tabs = [
      `<div class="st-tab-panel" data-idx="0"><div class="section-group"><div class="sg-header">Page</div><div class="sg-body">
        <div class="field-row"><label>pageId</label><input id="wp-id" value="${escapeHtml(p.pageId || '')}"></div>
        <div class="field-row"><label>URL</label><input id="wp-url" value="${escapeHtml(p.url || '')}"></div>
        <div class="field-row"><label>Title</label><input id="wp-title" value="${escapeHtml(p.title || '')}"></div>
        <div class="field-row"><label>Category</label><input id="wp-cat" value="${escapeHtml(p.category || '')}"></div>
        <div class="field-row"><label>Unlock</label><input id="wp-unlock" value="${escapeHtml(p.unlockRequirement || '')}"></div>
        <div class="field-row"><label>Theme</label><select id="wp-theme">${['year2000-corporate', 'year2000-casual', 'year2000-government', 'year2000-dark', 'terminal'].map((t) => `<option ${(p.aestheticTheme || '') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field-row"><label>Primary</label><input type="color" id="wp-c1" value="${p.primaryColor || '#0a246a'}"></div>
        <div class="field-row"><label>Secondary</label><input type="color" id="wp-c2" value="${p.secondaryColor || '#a6b5e7'}"></div>
        <div class="field-row"><label>Background</label><input type="color" id="wp-bg" value="${p.backgroundColor || '#ffffff'}"></div>
        <div class="field-row"><label>Site name</label><input id="wp-sn" value="${escapeHtml(p.siteName || '')}"></div>
        <div class="field-row"><label>Tagline</label><input id="wp-st" value="${escapeHtml(p.siteTagline || '')}"></div>
        <div class="field-row"><label>Footer</label><input id="wp-ft" value="${escapeHtml(p.footerText || '')}"></div>
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="1"><div class="section-group"><div class="sg-header">Sections</div><div class="sg-body" id="wp-sections"></div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${M.SECTION_TYPES.map((t) => `<button type="button" class="pp-btn wp-add-sec" data-sec="${t}">${t}</button>`).join('')}</div>
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="2"><div class="section-group"><div class="sg-header">Navigation</div><div class="sg-body" id="wp-nav-rows"></div>
        <button type="button" class="add-btn" id="wp-nav-add">Add link</button></div></div></div>`,
      `<div class="st-tab-panel" data-idx="3"><div class="section-group"><div class="sg-header">Shop</div><div class="sg-body">
        <div class="check-row"><input type="checkbox" id="wp-hasshop" ${p.hasShop ? 'checked' : ''}> <label>Enable shop</label></div>
        <div class="field-row"><label>shopId</label><input id="wp-shopid" value="${escapeHtml(p.shopId || '')}"></div>
      </div></div>
      <div class="section-group"><div class="sg-header">Login</div><div class="sg-body">
        <div class="check-row"><input type="checkbox" id="wp-login" ${p.loginEnabled ? 'checked' : ''}> <label>Login module</label></div>
      </div></div></div>`,
      `<div class="st-tab-panel" data-idx="4"><div class="section-group"><div class="sg-header">Event triggers (JSON)</div><div class="sg-body">
        <textarea id="wp-events" rows="6" style="width:100%;">${escapeHtml(JSON.stringify(p.eventTriggers || [], null, 2))}</textarea>
      </div></div></div>`
    ];
    fp.innerHTML = tabs.join('');
    showActiveSubtabPanels();
    renderWebSections(fp);
    renderWebNav(fp);
    fp.querySelectorAll('.wp-add-sec').forEach((b) =>
      b.addEventListener('click', () => {
        collectWebFromDom(fp);
        const t = b.getAttribute('data-sec');
        p.sections = [...(p.sections || []), defaultSection(t)];
        renderWebForm(fp);
      })
    );
    document.getElementById('wp-nav-add')?.addEventListener('click', () => {
      collectWebFromDom(fp);
      p.navLinks = [...(p.navLinks || []), { label: 'Link', targetUrl: '', url: '' }];
      renderWebForm(fp);
    });
    bindSectionCollapse(fp);
  }

  function renderWebSections(fp) {
    const w = fp.querySelector('#wp-sections');
    const p = state.editingPageDraft;
    if (!w) return;
    w.innerHTML = (p.sections || [])
      .map(
        (s, i) => `<div class="section-card" data-sec-i="${i}">
        <div class="sc-head">${escapeHtml(s.type || 'section')} <button type="button" class="rm sec-up" data-d="-1">\u2191</button><button type="button" class="rm sec-down" data-d="1">\u2193</button>
        <button type="button" class="rm sec-del">\u2715</button></div>
        <pre style="font-size:9px;white-space:pre-wrap;max-height:80px;overflow:auto;">${escapeHtml(JSON.stringify(s, null, 0))}</pre>
        <textarea class="sec-json" rows="3" style="width:100%;font-family:monospace;font-size:9px;">${escapeHtml(JSON.stringify(s, null, 2))}</textarea>
      </div>`
      )
      .join('');
    w.querySelectorAll('.sec-json').forEach((ta, i) =>
      ta.addEventListener('change', () => {
        try {
          p.sections[i] = JSON.parse(ta.value);
        } catch {
          /* keep */
        }
      })
    );
    w.querySelectorAll('.sec-del').forEach((b) =>
      b.addEventListener('click', () => {
        collectWebFromDom(fp);
        const i = Number(b.closest('.section-card').getAttribute('data-sec-i'));
        p.sections.splice(i, 1);
        renderWebForm(fp);
      })
    );
    w.querySelectorAll('.sec-up,.sec-down').forEach((b) =>
      b.addEventListener('click', () => {
        collectWebFromDom(fp);
        const card = b.closest('.section-card');
        const i = Number(card.getAttribute('data-sec-i'));
        const d = Number(b.getAttribute('data-d'));
        const j = i + d;
        if (j < 0 || j >= p.sections.length) return;
        const tmp = p.sections[i];
        p.sections[i] = p.sections[j];
        p.sections[j] = tmp;
        renderWebForm(fp);
      })
    );
  }

  function renderWebNav(fp) {
    const w = fp.querySelector('#wp-nav-rows');
    const p = state.editingPageDraft;
    if (!w) return;
    const pageOpts = state.registry.pages.map((x) => `<option value="${escapeHtml(x.pageId)}">${escapeHtml(x.pageId)}</option>`).join('');
    w.innerHTML = (p.navLinks || [])
      .map(
        (l, i) => `<div class="crime-item" data-i="${i}">
        <input class="nv-lab" value="${escapeHtml(l.label || '')}" placeholder="Label" style="flex:1">
        <select class="nv-tgt">${pageOpts}</select>
        <button type="button" class="rm nv-rm">\u2715</button></div>`
      )
      .join('');
    w.querySelectorAll('[data-i]').forEach((row, i) => {
      const sel = row.querySelector('.nv-tgt');
      const tgt = (p.navLinks[i].targetUrl || p.navLinks[i].url || '').replace(/^#/, '');
      if (sel) [...sel.options].forEach((o) => (o.selected = o.value === tgt));
    });
    w.querySelectorAll('.nv-rm').forEach((b) =>
      b.addEventListener('click', () => {
        collectWebFromDom(fp);
        const i = Number(b.closest('[data-i]').getAttribute('data-i'));
        p.navLinks.splice(i, 1);
        renderWebForm(fp);
      })
    );
  }

  function collectWebFromDom(fp) {
    const p = state.editingPageDraft;
    p.pageId = document.getElementById('wp-id')?.value || p.pageId;
    p.url = document.getElementById('wp-url')?.value || '';
    p.title = document.getElementById('wp-title')?.value || '';
    p.category = document.getElementById('wp-cat')?.value || '';
    p.unlockRequirement = document.getElementById('wp-unlock')?.value || null;
    p.aestheticTheme = document.getElementById('wp-theme')?.value || '';
    p.primaryColor = document.getElementById('wp-c1')?.value || '#0a246a';
    p.secondaryColor = document.getElementById('wp-c2')?.value || '#a6b5e7';
    p.backgroundColor = document.getElementById('wp-bg')?.value || '#fff';
    p.siteName = document.getElementById('wp-sn')?.value || '';
    p.siteTagline = document.getElementById('wp-st')?.value || '';
    p.footerText = document.getElementById('wp-ft')?.value || '';
    p.hasShop = !!document.getElementById('wp-hasshop')?.checked;
    p.shopId = document.getElementById('wp-shopid')?.value || null;
    p.loginEnabled = !!document.getElementById('wp-login')?.checked;
    try {
      p.eventTriggers = JSON.parse(document.getElementById('wp-events')?.value || '[]');
    } catch {
      p.eventTriggers = [];
    }
    fp.querySelectorAll('.section-card').forEach((card, i) => {
      const ta = card.querySelector('.sec-json');
      if (ta)
        try {
          p.sections[i] = JSON.parse(ta.value);
        } catch {
          /* noop */
        }
    });
    fp.querySelectorAll('#wp-nav-rows [data-i]').forEach((row) => {
      const i = Number(row.getAttribute('data-i'));
      const lab = row.querySelector('.nv-lab')?.value || '';
      const pid = row.querySelector('.nv-tgt')?.value || '';
      if (!p.navLinks[i]) p.navLinks[i] = {};
      p.navLinks[i].label = lab;
      p.navLinks[i].targetUrl = pid;
      p.navLinks[i].url = pid;
    });
  }

  function webWireframePreview() {
    const p = state.editingPageDraft || M.defaultPage({});
    const secs = (p.sections || []).map((s) => `<div class="wireframe-section">${escapeHtml(s.type || '?')}</div>`).join('');
    return `<div style="background:#fff;color:#000;padding:6px;border:2px inset #666;font-size:9px;">
      <div style="background:#d4d0c8;padding:2px;border-bottom:1px solid #000;">\u2190 \u2192 \uD83D\uDD0D ${escapeHtml(p.url || 'url')}</div>
      ${secs || '<div class="wireframe-section">(no sections)</div>'}
    </div>`;
  }

  async function savePages() {
    collectWebFromDom(document.getElementById('form-panel'));
    const p = state.editingPageDraft;
    let list = state.registry.pages.slice();
    const idx = list.findIndex((x) => x.pageId === p.pageId);
    if (state.selectedPageId && idx >= 0) list[idx] = { ...p, pageId: state.selectedPageId };
    else if (idx >= 0) list[idx] = p;
    else {
      list.push(p);
      state.selectedPageId = p.pageId;
    }
    await writeJsonFile('pages-pipeline.json', list);
    flashStatus('pages-pipeline.json saved', true);
    renderLeftPanel();
    refreshStatusValidation();
  }

  /* -------- Ads -------- */

  function loadAdDraft(id) {
    const ads = state.adsWrap.ads || [];
    if (id) {
      const a = ads.find((x) => x.id === id);
      state.editingAdDraft = a ? deepClone(a) : M.defaultAd({});
      state.selectedAdId = id;
    } else {
      state.editingAdDraft = M.defaultAd({});
      state.selectedAdId = null;
    }
    state.adsSubtab = 1;
    state.subtab = 1;
    renderSubtabs();
    renderAdsForm(document.getElementById('form-panel'));
    renderPreviewPanel();
  }

  function renderAdsLeft(inner) {
    const ads = state.adsWrap.ads || [];
    inner.innerHTML = `
      <div class="lp-header">ADS</div>
      <div class="lp-list">${ads
        .map((a) => {
          const sel = a.id === state.selectedAdId ? 'selected' : '';
          return `<div class="list-item ${sel}" data-ad-id="${escapeHtml(a.id)}">${escapeHtml(a.id)}<span class="li-badge">${escapeHtml(a.type || '')}</span></div>`;
        })
        .join('')}</div>
      <button type="button" class="add-btn" id="ad-new">New ad</button>`;
    inner.querySelectorAll('[data-ad-id]').forEach((r) =>
      r.addEventListener('click', () => {
        state.selectedAdId = r.getAttribute('data-ad-id');
        state.editingAdDraft = deepClone(ads.find((x) => x.id === state.selectedAdId));
        renderAdsForm(document.getElementById('form-panel'));
        renderPreviewPanel();
      })
    );
    inner.querySelector('#ad-new').addEventListener('click', () => loadAdDraft(null));
  }

  function renderAdsForm(fp) {
    if (state.subtab === 0) {
      fp.innerHTML = `<div class="st-tab-panel active"><div class="section-group"><div class="sg-header">Library</div><div class="sg-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:6px;">
        ${(state.adsWrap.ads || [])
          .map(
            (a) =>
              `<div class="section-card" style="cursor:pointer" data-pick-ad="${escapeHtml(a.id)}"><b>${escapeHtml(a.id)}</b><div style="font-size:9px;">${a.width}x${a.height}</div><div style="font-size:9px;">${escapeHtml(a.pageKey || '')}</div></div>`
          )
          .join('')}
      </div></div></div>`;
      fp.querySelectorAll('[data-pick-ad]').forEach((x) =>
        x.addEventListener('click', () => {
          state.selectedAdId = x.getAttribute('data-pick-ad');
          state.editingAdDraft = deepClone(state.adsWrap.ads.find((a) => a.id === state.selectedAdId));
          state.subtab = 1;
          renderSubtabs();
          renderAdsForm(fp);
          renderPreviewPanel();
        })
      );
      return;
    }
    if (state.subtab === 5) {
      fp.innerHTML = `<div class="st-tab-panel active"><div class="section-group"><div class="sg-header">Animation presets</div><div class="sg-body">
        ${M.CSS_ANIMATIONS.map((anim) => `<div style="margin:4px;padding:4px;border:1px solid #ccc;"><code>${escapeHtml(anim)}</code> <button type="button" class="pp-btn anim-pick" data-anim="${anim}">Use</button></div>`).join('')}
      </div></div></div>`;
      fp.querySelectorAll('.anim-pick').forEach((b) =>
        b.addEventListener('click', () => {
          if (state.editingAdDraft) {
            state.editingAdDraft.animation = b.getAttribute('data-anim');
            state.editingAdDraft.type = 'css-animation';
          }
          renderPreviewPanel();
        })
      );
      return;
    }
    const a = state.editingAdDraft || M.defaultAd({});
    fp.innerHTML = `<div class="st-tab-panel active">
      <div class="section-group"><div class="sg-header">Ad</div><div class="sg-body">
        <div class="field-row"><label>id</label><input id="ad-id" value="${escapeHtml(a.id || '')}"></div>
        <div class="field-row"><label>pageKey</label><input id="ad-pk" value="${escapeHtml(a.pageKey || '')}"></div>
        <div class="field-row"><label>position</label><input id="ad-pos" value="${escapeHtml(a.position || '')}"></div>
        <div class="field-row"><label>W / H</label><input type="number" id="ad-w" value="${a.width ?? 468}" style="width:70px"><input type="number" id="ad-h" value="${a.height ?? 60}" style="width:70px"></div>
        <div class="field-row"><label>type</label><select id="ad-type">${['css-animation', 'image', 'gif', 'video'].map((t) => `<option ${(a.type || '') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field-row"><label>src (path)</label><input id="ad-src" value="${escapeHtml(a.src || '')}" placeholder="ad-assets/..."></div>
        <button type="button" class="pp-btn" id="ad-pick-asset">Pick file\u2026</button>
        <div class="field-row"><label>animation</label><select id="ad-anim">${M.CSS_ANIMATIONS.map((t) => `<option ${(a.animation || '') === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div class="field-row"><label>content</label><textarea id="ad-content">${escapeHtml(a.content || '')}</textarea></div>
        <div class="field-row"><label>link</label><select id="ad-link"><option value="">â€”</option>${state.registry.pages.map((p) => `<option value="${escapeHtml(p.pageId)}" ${(a.link || '') === p.pageId ? 'selected' : ''}>${escapeHtml(p.pageId)}</option>`).join('')}</select></div>
        <div class="field-row"><label>bg / border</label><input type="color" id="ad-bg" value="${a.bgColor || '#ffffcc'}"><input type="color" id="ad-br" value="${a.borderColor || '#990000'}"></div>
        <div class="field-row"><label>weight</label><input type="number" id="ad-wt" value="${a.weight ?? 1}"></div>
      </div></div>
      <div class="section-group"><div class="sg-header">Pages (multi)</div><div class="sg-body" id="ad-pages-chk">
        ${state.registry.pages.map((p) => `<label style="display:block;"><input type="checkbox" class="ad-onpage" value="${escapeHtml(p.pageId)}"> ${escapeHtml(p.pageId)}</label>`).join('')}
      </div></div>
    </div>`;
    (a.pageAssignments || [a.pageKey].filter(Boolean)).forEach((pk) => {
      const cb = fp.querySelector(`.ad-onpage[value="${pk}"]`);
      if (cb) cb.checked = true;
    });
    document.getElementById('ad-pick-asset')?.addEventListener('click', async () => {
      const id = document.getElementById('ad-id').value || state.editingAdDraft.id || 'ad';
      const r = await corpStudio.pickAdAsset(id);
      if (r && r.relativePath) {
        document.getElementById('ad-src').value = r.relativePath;
        document.getElementById('ad-type').value = /\\.mp4|\\.webm/i.test(r.relativePath) ? 'video' : 'image';
      }
    });
  }

  async function refreshAdPreviewBody(body) {
    const a = state.editingAdDraft;
    if (!body) return;
    if (!a) {
      body.innerHTML = '';
      return;
    }
    let inner = '';
    if (a.src && !String(a.src).startsWith('ad-assets/')) inner = `<div style="padding:8px;color:#aaa;">${escapeHtml(a.src)}</div>`;
    else if (a.src) {
      const url = await corpStudio.assetToDataUrl(a.src);
      if (url && url.startsWith('data:video'))
        inner = `<video src="${url}" style="max-width:100%;" autoplay muted loop></video>`;
      else if (url) inner = `<img src="${url}" style="max-width:100%;" alt="">`;
    }
    if (!inner) inner = `<div style="background:${escapeHtml(a.bgColor)};border:2px solid ${escapeHtml(a.borderColor)};padding:8px;color:#000;min-height:40px;">${escapeHtml(a.content || a.animation || 'ad')}</div>`;
    body.innerHTML = `<div style="background:#f0f0f0;padding:6px;">${inner}</div>`;
  }

  async function saveAds() {
    const idEl = document.getElementById('ad-id');
    if (!idEl || state.subtab === 0) {
      await writeJsonFile('ads.json', state.adsWrap);
      flashStatus('ads.json saved', true);
      refreshStatusValidation();
      return;
    }
    let a = state.editingAdDraft || M.defaultAd({});
    a.id = idEl.value || a.id;
    a.pageKey = document.getElementById('ad-pk')?.value || a.pageKey;
    a.position = document.getElementById('ad-pos')?.value || a.position;
    a.width = Number(document.getElementById('ad-w')?.value) || 468;
    a.height = Number(document.getElementById('ad-h')?.value) || 60;
    a.type = document.getElementById('ad-type')?.value || a.type;
    a.src = document.getElementById('ad-src')?.value || null;
    a.animation = document.getElementById('ad-anim')?.value || a.animation;
    a.content = document.getElementById('ad-content')?.value || '';
    const lk = document.getElementById('ad-link')?.value;
    a.link = lk || null;
    a.bgColor = document.getElementById('ad-bg')?.value;
    a.borderColor = document.getElementById('ad-br')?.value;
    a.weight = Number(document.getElementById('ad-wt')?.value) || 1;
    const ads = state.adsWrap.ads || [];
    const idx = ads.findIndex((x) => x.id === a.id);
    if (state.selectedAdId && idx >= 0) ads[idx] = a;
    else if (idx >= 0) ads[idx] = a;
    else ads.push(a);
    state.adsWrap.ads = ads;
    state.selectedAdId = a.id;
    await writeJsonFile('ads.json', state.adsWrap);
    flashStatus('ads saved', true);
    refreshSidebar();
    renderLeftPanel();
    refreshStatusValidation();
  }

  /* -------- Dashboard -------- */

  function renderDashForm(fp) {
    const snap = state.registry;
    const v = state.lastValidation;
    const errRows = (v.structuredErrors || [])
      .filter((e) => e.level !== 'warning')
      .map(
        (e, i) =>
          `<tr><td>${escapeHtml(e.engine || '')}</td><td>${escapeHtml(e.recordId || 'â€”')}</td><td>${escapeHtml(e.field || '')}</td><td>${escapeHtml(e.message)}</td>
        <td><button type="button" class="pp-btn fix-btn" data-fix-i="${i}">Fix</button></td></tr>`
      )
      .join('');
    fp.innerHTML = `
      <div class="st-tab-panel active">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:12px;">
          ${['npcs', 'companies', 'pages', 'ads', 'shops'].map((k) => {
            const n = k === 'ads' ? (state.adsWrap.ads || []).length : (snap[k] || []).length;
            return `<div class="section-group"><div class="sg-header">${k}</div><div class="sg-body" style="font-size:20px;font-weight:bold;">${n}</div></div>`;
          }).join('')}
        </div>
        <div class="section-group"><div class="sg-header">Validation</div><div class="sg-body">
          <table style="width:100%;font-size:10px;border-collapse:collapse;"><thead><tr><th>Engine</th><th>Record</th><th>Field</th><th>Message</th><th></th></tr></thead><tbody>${errRows || '<tr><td colspan="5">No errors</td></tr>'}</tbody></table>
        </div></div>
        <div class="section-group"><div class="sg-header">Build log</div><div class="sg-body"><pre style="font-size:10px;max-height:120px;overflow:auto;">${state.backupLog
          .slice(0, 12)
          .map((l) => new Date(l.t).toISOString() + ' ' + l.op + ' ' + l.file)
          .join('\n')}</pre></div></div>
        <div class="ca-toolbar">
          <button type="button" class="pp-btn" id="dash-refresh">Refresh</button>
          <button type="button" class="pp-btn" id="dash-backup">Backup ZIP</button>
          <button type="button" class="pp-btn" id="dash-pack">Build content.pack</button>
          <button type="button" class="pp-btn" id="dash-val">Run validation</button>
        </div>
      </div>`;
    document.getElementById('dash-refresh')?.addEventListener('click', async () => {
      await refreshRegistry();
      refreshSidebar();
      renderDashForm(fp);
      refreshStatusValidation();
    });
    document.getElementById('dash-backup')?.addEventListener('click', async () => {
      const r = await corpStudio.backupZip();
      alert(r.cancelled ? 'Cancelled' : 'Backup OK ' + r.bytes + ' bytes');
    });
    document.getElementById('dash-pack')?.addEventListener('click', async () => {
      const s = await corpStudio.getSettings();
      const r = await corpStudio.buildPack(s.contentPackKey);
      alert('Wrote ' + r.path);
    });
    document.getElementById('dash-val')?.addEventListener('click', runValidation);
    fp.querySelectorAll('.fix-btn').forEach((b) =>
      b.addEventListener('click', () => {
        const i = Number(b.getAttribute('data-fix-i'));
        const e = (v.structuredErrors || []).filter((x) => x.level !== 'warning')[i];
        if (!e) return;
        if (e.engine === 'npc' && e.recordId) {
          switchEngine('npc');
          loadNpcDraft(e.recordId);
          state.subtab = 0;
          renderSubtabs();
        } else if (e.engine === 'company' && e.recordId) {
          switchEngine('company');
          loadCompanyDraft(e.recordId);
        } else if (e.engine === 'web' && e.recordId) {
          switchEngine('web');
          loadPageDraft(e.recordId);
        } else if (e.engine === 'ads' && e.recordId) {
          switchEngine('ads');
          state.selectedAdId = e.recordId;
          state.editingAdDraft = deepClone(state.adsWrap.ads.find((x) => x.id === e.recordId));
          renderAdsForm(document.getElementById('form-panel'));
        }
      })
    );
  }

  async function runValidation() {
    const v = await corpStudio.validate();
    state.lastValidation = v;
    if (!state.lastValidation.structuredErrors) state.lastValidation.structuredErrors = [];
    refreshStatusValidation();
    if (state.engine === 'dash') renderDashForm(document.getElementById('form-panel'));
  }

  async function refreshStatusValidation() {
    const v = state.lastValidation;
    let el = document.getElementById('sb-valid');
    if (!el) return;
    if (!v.errors || v.errors.length === 0) el.textContent = '\u2713 Registry valid';
    else el.textContent = '\u2717 ' + v.errors.length + ' errors';
    el.className = 'sb-panel ' + (v.errors && v.errors.length ? 'err' : 'ok');
    const counts = document.getElementById('sb-counts');
    if (counts)
      counts.textContent = `${state.registry.npcs.length} NPCs | ${state.registry.companies.length} Cos | ${state.registry.pages.length} Pages | ${(state.adsWrap.ads || []).length} Ads`;
  }

  async function publishAll() {
    await runValidation();
    if (state.lastValidation.errors && state.lastValidation.errors.length) {
      alert('Fix validation errors first (' + state.lastValidation.errors.length + ').');
      switchEngine('dash');
      return;
    }
    if (!confirm('Validation OK. Build encrypted content.pack now?')) {
      flashStatus('Publish skipped', true);
      return;
    }
    const s = await corpStudio.getSettings();
    await corpStudio.buildPack(s.contentPackKey);
    flashStatus('content.pack built', true);
  }

  function wireMenus() {
    document.getElementById('menubar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action],[data-menu]');
      if (!b) return;
      const a = b.getAttribute('data-action');
      const m = b.getAttribute('data-menu');
      if (a === 'refresh') {
        refreshRegistry().then(() => {
          refreshSidebar();
          switchEngine(state.engine);
        });
      }
      if (a === 'validate') runValidation();
      if (a === 'help') alert('CorpOS 2000 Content Studio â€” use engines on the left.');
      if (m === 'file-data') {
        document.getElementById('modal-menu').classList.add('show');
        const box = document.getElementById('modal-menu-body');
        box.innerHTML = `<p>Data directory</p>
          <button type="button" class="pp-btn" id="mm-open">Open data folder</button>
          <button type="button" class="pp-btn" id="mm-set">Settings</button>
          <button type="button" class="pp-btn" id="mm-close">Close</button>`;
        document.getElementById('mm-open').onclick = () => corpStudio.openDataFolder();
        document.getElementById('mm-set').onclick = () => {
          document.getElementById('modal-menu').classList.remove('show');
          openSettings();
        };
        document.getElementById('mm-close').onclick = () => document.getElementById('modal-menu').classList.remove('show');
      }
      if (m === 'build') {
        document.getElementById('modal-menu').classList.add('show');
        const box = document.getElementById('modal-menu-body');
        box.innerHTML = `<button type="button" class="pp-btn" id="bm-bak">Backup ZIP</button><button type="button" class="pp-btn" id="bm-pack">Build pack</button><button type="button" class="pp-btn" id="bm-cl">Close</button>`;
        document.getElementById('bm-bak').onclick = async () => corpStudio.backupZip();
        document.getElementById('bm-pack').onclick = async () => {
          const s = await corpStudio.getSettings();
          corpStudio.buildPack(s.contentPackKey);
        };
        document.getElementById('bm-cl').onclick = () => document.getElementById('modal-menu').classList.remove('show');
      }
    });
    document.getElementById('modal-menu').addEventListener('click', (e) => {
      if (e.target.id === 'modal-menu') e.currentTarget.classList.remove('show');
    });
  }

  function openSettings() {
    corpStudio.getSettings().then((s) => {
      document.getElementById('set-datadir').value = s.dataDir || '';
      document.getElementById('set-packkey').value = s.contentPackKey || '';
      document.getElementById('modal-settings').classList.add('show');
    });
  }

  async function init() {
    wireMenus();
    document.getElementById('set-save').addEventListener('click', async () => {
      await corpStudio.setSettings({
        dataDir: document.getElementById('set-datadir').value.trim(),
        contentPackKey: document.getElementById('set-packkey').value
      });
      document.getElementById('modal-settings').classList.remove('show');
      await refreshRegistry();
      refreshSidebar();
      switchEngine(state.engine);
    });
    document.getElementById('set-cancel').addEventListener('click', () => document.getElementById('modal-settings').classList.remove('show'));
    document.getElementById('form-panel').addEventListener('input', (e) => {
      if (state.engine === 'npc' && e.target.id && e.target.id.startsWith('npc-')) syncPreviewFromNpcForm();
    });
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        doUndo();
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        doRedo();
      }
    });
    await refreshRegistry();
    await runValidation();
    refreshSidebar();
    switchEngine('npc');
    setInterval(nowClock, 1000);
    nowClock();
  }

  init();
})();
