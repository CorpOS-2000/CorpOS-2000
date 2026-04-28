/**
 * combat-console-ui.js
 * Unified combat console for all six programs — sim cooldowns, intel DC, audio, roll animation, op log.
 */
import { escapeHtml } from './identity.js';
import { getState, getGameEpochMs } from './gameState.js';
import { combatCooldownRemaining } from './combat-cooldowns.js';
import {
  getInstalledVersion,
  canUpgradeTo,
  VERSION_PROFILES,
  resolveCombatDc
} from './combat-version.js';
import { executePhantomPress } from './phantom-press.js';
import { executeMarketForce } from './market-force.js';
import { executeGhostCorp } from './ghost-corp.js';
import { executeDataMiner } from './dataminer-pro.js';
import { executeComplianceCannon } from './compliance-cannon.js';
import { executeSignalScrub } from './signal-scrub.js';
import { ATTACK_TYPES } from './phantom-press.js';
import { MF_ATTACKS } from './market-force.js';
import { GC_OPS } from './ghost-corp.js';
import { DM_OPS } from './dataminer-pro.js';
import { CC_OPS } from './compliance-cannon.js';
import { SS_OPS } from './signal-scrub.js';
import { on } from './events.js';
import { CombatAudio } from './combat-audio.js';

const COMBAT_APP_IDS = [
  'phantom-press',
  'market-force',
  'ghost-corp',
  'dataminer-pro',
  'compliance-cannon',
  'signal-scrub'
];

const ATTACKS_BY_APP = {
  'phantom-press': ATTACK_TYPES,
  'market-force': MF_ATTACKS,
  'ghost-corp': GC_OPS,
  'dataminer-pro': DM_OPS,
  'compliance-cannon': CC_OPS,
  'signal-scrub': SS_OPS
};

function normTag(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
}

function cooldownKeyPhantom(attackId, tid) {
  return `phantom:${attackId}:${tid}`;
}

function cooldownKeyMarket(attackId, target) {
  const slot =
    attackId === 'supply_attack' ? String(target || '').trim() : normTag(target);
  return `mf:${attackId}:${slot}`;
}

function cooldownKeyGhost(opId, target, amount) {
  if (opId === 'register_shell') return 'gc:register_shell';
  if (opId === 'launder_assets') return `gc:launder_assets:${Math.max(0, Number(amount) || 0)}`;
  return `gc:${opId}:${String(target || '').trim() || 'x'}`;
}

function cooldownKeyDm(opId, tid) {
  return `dm:${opId}:${String(tid || '').trim()}`;
}

function cooldownKeyCc(opId, tid) {
  return `cc:${opId}:${String(tid || '').trim()}`;
}

function cooldownKeySs(opId) {
  return `ss:${opId}`;
}

function cooldownRemainingFor(appId, attackId, ctx) {
  const { target = '', targetKind = 'company', amount = '' } = ctx;
  let key = '';
  if (appId === 'phantom-press') key = cooldownKeyPhantom(attackId, target.trim());
  else if (appId === 'market-force') key = cooldownKeyMarket(attackId, target);
  else if (appId === 'ghost-corp') key = cooldownKeyGhost(attackId, target, amount);
  else if (appId === 'dataminer-pro') key = cooldownKeyDm(attackId, target);
  else if (appId === 'compliance-cannon') key = cooldownKeyCc(attackId, target);
  else if (appId === 'signal-scrub') key = cooldownKeySs(attackId);
  if (!key || !attackId) return 0;
  return combatCooldownRemaining(key);
}

function getTargetForResolve(appId, attackId, targetRaw) {
  const t = String(targetRaw || '').trim();
  if (appId === 'market-force' && attackId === 'supply_attack') return t;
  if (appId === 'market-force') return normTag(t);
  return t;
}

function getAttackDef(appId, attackId) {
  return ATTACKS_BY_APP[appId]?.[attackId] || null;
}

function formatCdLabel(ms) {
  if (ms <= 0) return '0';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return `${d}d ${rh}h`;
  }
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatRemainingShort(ms) {
  if (ms <= 0) return 'READY';
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CONSOLE_CONFIGS = {
  'phantom-press': {
    brandTitle: 'Phantom Press',
    subtitle: 'Reputation Warfare Console',
    color: '#ff8800',
    bgColor: '#1a0a00',
    borderColor: '#663300',
    icon: '📰',
    needsTarget: true,
    targetHint: 'Actor ID or company name — set Target type below.',
    attacks: ['fabricate_story', 'review_bomb', 'suppress_story', 'smear_campaign'],
    startSound: () => CombatAudio.operationStart()
  },
  'market-force': {
    brandTitle: 'MarketForce 2000',
    title: 'MarketForce 2000',
    subtitle: 'Financial Warfare Console',
    color: '#00cc44',
    bgColor: '#001a08',
    borderColor: '#003318',
    icon: '📉',
    needsTarget: true,
    targetHint: 'Product tag (shortage / squeeze) or company (supply).',
    attacks: ['create_shortage', 'price_squeeze', 'supply_attack'],
    startSound: () => CombatAudio.operationStart()
  },
  'ghost-corp': {
    brandTitle: 'GhostCorp Suite',
    subtitle: 'Anonymous Corporate Operations',
    color: '#aa66ff',
    bgColor: '#0a0018',
    borderColor: '#330055',
    icon: '👻',
    needsTarget: false,
    attacks: ['register_shell', 'proxy_acquire', 'launder_assets'],
    startSound: () => CombatAudio.operationStart()
  },
  'dataminer-pro': {
    brandTitle: 'DataMiner Pro',
    subtitle: 'Intelligence Operations',
    color: '#00aaff',
    bgColor: '#000a18',
    borderColor: '#002244',
    icon: '🔬',
    needsTarget: true,
    targetHint: 'Actor ID or company ID / trading name.',
    attacks: ['compile_dossier', 'map_company', 'track_banking'],
    startSound: () => CombatAudio.dataTransfer()
  },
  'compliance-cannon': {
    brandTitle: 'Compliance Cannon',
    title: 'Compliance Cannon',
    subtitle: 'Legal Warfare Console',
    color: '#ff3333',
    bgColor: '#1a0000',
    borderColor: '#660000',
    icon: '⚖',
    needsTarget: true,
    targetHint: 'Competitor company ID or trading name.',
    attacks: ['file_complaint', 'trigger_audit'],
    startSound: () => CombatAudio.legalProcess()
  },
  'signal-scrub': {
    brandTitle: 'SignalScrub',
    subtitle: 'Counter-Surveillance Console',
    color: '#44ccdd',
    bgColor: '#000f14',
    borderColor: '#003344',
    icon: '🔇',
    needsTarget: false,
    attacks: ['degrade_log', 'slow_escalation', 'noise_burst'],
    startSound: () => CombatAudio.signalSweep()
  }
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dataAttrId(appId, attackId) {
  return `${appId}--${attackId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function initCombatApps() {
  for (const id of COMBAT_APP_IDS) {
    const root = document.getElementById(`${id}-root`);
    if (root) mountCombatConsole(id, root);
  }
}

export function mountCombatConsole(appId, rootEl) {
  const config = CONSOLE_CONFIGS[appId];
  if (!config || !rootEl) return;

  let selectedTarget = '';
  let selectedAttack = null;
  let targetKind = 'company';
  let extraAmount = '';
  let lastResult = null;
  let lastLog = [];
  let isExecuting = false;
  let pollTimer = null;
  let offState = null;

  function ctx() {
    return { target: selectedTarget, targetKind, amount: extraAmount };
  }

  function preValidate() {
    if (!selectedAttack) return { ok: false, reason: 'Select an operation.' };
    if (getInstalledVersion(appId) == null) {
      return { ok: false, reason: 'Program is not installed.' };
    }
    const target = selectedTarget.trim();
    if (appId === 'phantom-press' && !target) return { ok: false, reason: 'Enter a target.' };
    if (appId === 'market-force' && !target) {
      return { ok: false, reason: 'Enter a product tag or company.' };
    }
    if (appId === 'ghost-corp') {
      if (selectedAttack === 'proxy_acquire' && !target) {
        return { ok: false, reason: 'Enter acquisition target reference.' };
      }
    } else if (appId === 'dataminer-pro' && !target) {
      return { ok: false, reason: 'Enter a target ID or name.' };
    } else if (appId === 'compliance-cannon' && !target) {
      return { ok: false, reason: 'Enter a competitor company.' };
    }
    return { ok: true };
  }

  function runExecuteSync() {
    const target = selectedTarget.trim();
    if (appId === 'phantom-press') {
      if (!target) return { success: false, reason: 'Enter a target.' };
      return executePhantomPress(selectedAttack, target, targetKind);
    }
    if (appId === 'market-force') {
      if (!target) return { success: false, reason: 'Enter a product tag or company.' };
      if (selectedAttack === 'supply_attack') {
        return executeMarketForce(selectedAttack, '', target);
      }
      return executeMarketForce(selectedAttack, target, '');
    }
    if (appId === 'ghost-corp') {
      if (selectedAttack === 'proxy_acquire' && !target) {
        return { success: false, reason: 'Enter acquisition target reference.' };
      }
      const amt = selectedAttack === 'launder_assets' ? Number(extraAmount) || 0 : undefined;
      return executeGhostCorp(selectedAttack, target, amt);
    }
    if (appId === 'dataminer-pro') {
      if (!target) return { success: false, reason: 'Enter a target ID or name.' };
      return executeDataMiner(selectedAttack, target);
    }
    if (appId === 'compliance-cannon') {
      if (!target) return { success: false, reason: 'Enter a competitor company.' };
      return executeComplianceCannon(selectedAttack, target);
    }
    if (appId === 'signal-scrub') {
      return executeSignalScrub(selectedAttack);
    }
    return { success: false, reason: 'Unknown app.' };
  }

  function playOutcomeSound(result) {
    const d = result?.dice;
    const atk = getAttackDef(appId, selectedAttack);
    const tid = getTargetForResolve(appId, selectedAttack, selectedTarget);
    const { adj } = atk ? resolveCombatDc(appId, atk, tid) : { adj: {} };
    const passMargin = Number(d?.passMargin);
    if (result?.success) {
      if ((d && Number(d.dc) > 0) && !Number.isNaN(Number(d.total)) && passMargin >= 8) {
        CombatAudio.critHit();
        return;
      }
      CombatAudio.hit();
      return;
    }
    const discovered = !!(result?.discovered || result?.exposed);
    if (discovered) {
      CombatAudio.discovered();
      const nd = Number(adj?.notorietyOnDiscover) || 0;
      const exp = Number(adj?.notorietyOnExpose) || 0;
      if (nd >= 30 || exp >= 30) {
        setTimeout(() => CombatAudio.federalAlert(), 600);
      }
      return;
    }
    CombatAudio.miss();
  }

  async function runExecute() {
    if (!selectedAttack || isExecuting) return;
    const pre = preValidate();
    if (!pre.ok) {
      lastResult = { success: false, reason: pre.reason || 'Cannot execute.' };
      render();
      CombatAudio.miss();
      return;
    }

    isExecuting = true;
    render();
    try {
      config.startSound();
      await sleep(420);
      CombatAudio.rollTick();
      await animateRoll();
      await sleep(180);
      const result = runExecuteSync();
      lastResult = result || { success: false, reason: 'No result.' };
      playOutcomeSound(lastResult);

      const st = getState();
      const simMs = st.sim?.elapsedMs || 0;
      const gameDate = new Date(getGameEpochMs() + simMs);
      const timeStr = `${gameDate.getUTCMonth() + 1}/${gameDate.getUTCDate()} ${String(gameDate.getUTCHours()).padStart(2, '0')}:00`;
      const d = lastResult.dice;
      const outcome =
        lastResult.success && d && (d.passMargin ?? 0) >= 8
          ? 'crit'
          : lastResult.success
            ? 'hit'
            : lastResult.discovered || lastResult.exposed
              ? 'discovered'
              : 'miss';
      const lbl = getAttackDef(appId, selectedAttack)?.label || selectedAttack;
      let targetLabel = selectedTarget.trim() || '—';
      if (appId === 'market-force' && selectedAttack !== 'supply_attack') {
        targetLabel = normTag(selectedTarget) || '—';
      }
      lastLog.push({ outcome, label: lbl, target: targetLabel, time: timeStr });
      if (lastLog.length > 10) lastLog.shift();
    } finally {
      isExecuting = false;
    }
    render();
  }

  async function animateRoll() {
    const el = rootEl.querySelector('#cc-roll-display');
    if (!el) return;
    const frames = 16;
    for (let i = 0; i < frames; i += 1) {
      const fake = 1 + Math.floor(Math.random() * 20);
      el.textContent = `🎲 ${fake}`;
      await sleep(45 + i * 7);
    }
  }

  function updateCooldownDynamic() {
    if (isExecuting) return;
    const c = ctx();
    for (const id of config.attacks) {
      const def = getAttackDef(appId, id);
      if (!def) continue;
      const { adj } = resolveCombatDc(appId, def, getTargetForResolve(appId, id, selectedTarget));
      const rem = cooldownRemainingFor(appId, id, c);
      const key = dataAttrId(appId, id);
      const total = adj.cooldownMs || def.cooldownMs;
      const bar = rootEl.querySelector(`[data-cooldown-bar="${key}"]`);
      const lab = rootEl.querySelector(`[data-cooldown-pct="${key}"]`);
      if (bar) {
        if (rem > 0 && total > 0) {
          bar.style.width = `${Math.min(100, Math.round((1 - rem / total) * 100))}%`;
        } else if (rem <= 0) {
          bar.style.width = '0%';
        }
      }
      if (lab) {
        lab.textContent = rem > 0 ? formatRemainingShort(rem) : 'READY';
      }
    }
  }

  function render() {
    if (isExecuting) {
      // During execute, only rebuild if we need scan/roll (already in DOM from prior render+isExecuting)
    }
    const st = getState();
    const notoriety = st.corporateProfile?.notoriety || 0;
    const acumen = st.player?.acumen ?? 10;
    const modifier = Math.floor((acumen - 10) / 2);
    const activeVersion = getInstalledVersion(appId) || '1.0';
    const verSlug = activeVersion.replace(/\./g, '');
    const vp = VERSION_PROFILES[activeVersion] || VERSION_PROFILES['1.0'];
    const brand = config.brandTitle || config.title;
    const titleLine = getInstalledVersion(appId) ? `${brand} ${vp.label}` : `${brand} (not installed)`;
    const showV2Hint = canUpgradeTo(appId, '2.0');
    const showV3Hint = canUpgradeTo(appId, '3.0');

    const kindRow =
      appId === 'phantom-press'
        ? `<div class="cc-section"><div class="cc-label">▶ TARGET TYPE</div>
          <label class="cc-radio"><input type="radio" name="pp-kind-${escapeHtml(appId)}" value="company" ${targetKind === 'company' ? 'checked' : ''}/> Company</label>
          <label class="cc-radio"><input type="radio" name="pp-kind-${escapeHtml(appId)}" value="actor" ${targetKind === 'actor' ? 'checked' : ''}/> Actor</label></div>`
        : '';

    let targetBlock = '';
    if (appId === 'ghost-corp') {
      if (selectedAttack === 'register_shell') targetBlock = '';
      else if (selectedAttack === 'launder_assets') {
        targetBlock = `<div class="cc-section"><div class="cc-label">▶ AMOUNT (USD)</div>
           <input type="number" id="cc-amount-input" class="cc-input" min="0" step="100" value="${escapeHtml(extraAmount)}"/></div>`;
      } else if (selectedAttack === 'proxy_acquire') {
        targetBlock = `<div class="cc-section"><div class="cc-label">▶ ACQUISITION TARGET</div>
             <input type="text" id="cc-target-input" class="cc-input" placeholder="Company or asset reference…" value="${escapeHtml(selectedTarget)}"/></div>`;
      }
    } else if (config.needsTarget) {
      const intelTid = getTargetForResolve(appId, selectedAttack || 'compile_dossier', selectedTarget);
      const intel = intelTid ? st.dataMinerDossiers?.[intelTid] : null;
      const mfTid = intelTid && st.dataMinerDossiers?.[`market-force:${intelTid}`];
      const showIntel =
        intel && Number(intel.dcBonus) > 0
          ? `🔬 Intel +${intel.dcBonus} DC (actor/company)`
          : mfTid && Number(mfTid.dcBonus) > 0
            ? `🔬 MarketForce +${mfTid.dcBonus} DC (banking map)`
            : '';
      const hintText =
        appId === 'market-force' && selectedAttack === 'supply_attack'
          ? 'Supply: competitor company ID or name.'
          : appId === 'market-force'
            ? 'Product tag, e.g. coffee, laptop.'
            : config.targetHint || '';
      targetBlock = `<div class="cc-section">
    <div class="cc-label">▶ ${escapeHtml(config.targetLabel || 'TARGET')}</div>
    <div class="cc-target-row">
    <input type="text" id="cc-target-input" class="cc-input"
      placeholder="Enter target…"
      value="${escapeHtml(selectedTarget)}">
    ${showIntel ? `<span class="cc-intel-tag">${escapeHtml(showIntel)}</span>` : ''}
    </div>
    <div class="cc-hint">${escapeHtml(hintText)}</div>
  </div>`;
    }

    const cctx = ctx();

    const attackGrid = config.attacks
      .map((id) => {
        const atk = getAttackDef(appId, id);
        if (!atk) return '';
        const tid = getTargetForResolve(appId, id, selectedTarget);
        const { adj, effectiveDc, intelBonus } = resolveCombatDc(appId, atk, tid);
        const cdRem = cooldownRemainingFor(appId, id, cctx);
        const onCd = cdRem > 0;
        const isSel = selectedAttack === id;
        const dkey = dataAttrId(appId, id);
        const pct = onCd && adj.cooldownMs
          ? Math.min(100, Math.round((1 - cdRem / adj.cooldownMs) * 100))
          : 0;
        return `<div class="cc-attack-card ${isSel ? 'cc-attack-selected' : ''} ${onCd ? 'cc-attack-cooldown' : ''}"
   data-attack-id="${escapeHtml(id)}"
   style="border-color:${isSel ? config.color : config.borderColor}40;">
  <div class="cc-attack-top">
    <span class="cc-attack-icon">${escapeHtml(atk.icon || '◆')}</span>
    <span class="cc-attack-name">${escapeHtml(atk.label)}</span>
    ${atk.cost > 0 ? `<span class="cc-attack-cost">$${Number(atk.cost).toLocaleString()}</span>` : ''}
  </div>
  <div class="cc-attack-desc">${escapeHtml(atk.description)}</div>
  <div class="cc-attack-stats">
    <span class="cc-stat-chip">DC ${effectiveDc}${
      intelBonus > 0
        ? ` <span class="cc-intel-dc">(−${intelBonus} intel)</span>`
        : ''
    }</span>
    <span class="cc-stat-chip">Noto ${Math.round(adj.notorietyCost)}%</span>
    <span class="cc-stat-chip">CD ${formatCdLabel(adj.cooldownMs)}</span>
  </div>
  ${
    onCd
      ? `<div class="cc-cooldown-track"><div class="cc-cooldown-bar" data-cooldown-bar="${dkey}" style="width:${pct}%;background:${config.color}"></div></div>
  <div class="cc-cooldown-label" data-cooldown-pct="${dkey}">${formatRemainingShort(cdRem)}</div>`
      : ''
  }
</div>`;
      })
      .join('');

    rootEl.innerHTML = `<div class="cc-shell" style="background:${config.bgColor};border:1px solid ${
      config.borderColor
    };color:${config.color};">
  <div class="cc-header" style="border-bottom:1px solid ${config.borderColor}40">
    <div class="cc-header-left">
      <div class="cc-icon">${config.icon || ''}</div>
      <div>
        <div class="cc-title" style="color:${config.color}">${escapeHtml(titleLine)}</div>
        <div class="cc-subtitle">${escapeHtml(config.subtitle)}</div>
        <div class="cc-version-row">
      <span class="cc-version-badge cc-version-${escapeHtml(verSlug)}">${escapeHtml(vp.label)}</span>
      ${showV2Hint ? `<span class="cc-upgrade-hint">↑ v2.0 available (grey market)</span>` : ''}
      ${showV3Hint ? `<span class="cc-upgrade-hint">↑ v3.0 — referral</span>` : ''}
    </div>
    <div class="cc-stats-row" style="margin-top:4px">
      <span class="cc-stat">v-stat: DC+${vp.dcBonus} · N×${Math.round(vp.notorietyMultiplier * 100)}% · CD×${Math.round(
        vp.cooldownMultiplier * 100
      )}%</span>
      <span class="cc-stat">Trace: ${escapeHtml(String(vp.traceLevel))}</span>
    </div>
      </div>
    </div>
    <div class="cc-header-right">
      <div class="cc-stat-row">
        <span class="cc-stat-pill">Noto ${notoriety}%</span>
        <span class="cc-stat-pill">AC ${acumen}</span>
        ${
          modifier !== 0
            ? `<span class="cc-stat-pill ${modifier > 0 ? 'cc-mod-pos' : 'cc-mod-neg'}">${
                modifier > 0 ? '+' : ''
              }${modifier}</span>`
            : ''
        }
      </div>
    </div>
  </div>
  ${kindRow}
  ${targetBlock}
  <div class="cc-section">
    <div class="cc-label">▶ OPERATION</div>
    <div class="cc-attack-grid" id="cc-attack-grid">
      ${attackGrid}
    </div>
  </div>
  <div class="cc-section cc-execute-section">
    <button type="button" class="cc-execute-btn ${!selectedAttack || isExecuting ? 'cc-execute-disabled' : ''}"
      id="cc-execute" style="--cc-color:${config.color}"
      ${!selectedAttack || isExecuting ? 'disabled' : ''}>
      ${
        isExecuting
          ? '<span class="cc-spinner">◈</span> EXECUTING…'
          : selectedAttack
            ? `▶ EXECUTE — ${escapeHtml(getAttackDef(appId, selectedAttack)?.label || '')}`
            : '▶ SELECT AN OPERATION'
      }
    </button>
  </div>
  <div class="cc-scan-wrap" id="cc-scan-wrap" style="display:${isExecuting ? 'block' : 'none'}">
    <div class="cc-scan-bar" style="background:${config.color}"></div>
    <div class="cc-scan-label">OPERATION IN PROGRESS…</div>
  </div>
  <div id="cc-result-panel" class="cc-result-panel">
    <div class="cc-roll-display" id="cc-roll-display"></div>
    ${
      lastResult
        ? renderResultBlock(lastResult, config)
        : '<div class="cc-idle">Awaiting operation.</div>'
    }
  </div>
  ${
    lastLog.length
      ? `<div class="cc-section">
    <div class="cc-label">▶ OPERATION LOG</div>
    <div class="cc-log">
      ${[...lastLog]
        .reverse()
        .map(
          (r) => `<div class="cc-log-row cc-log-${r.outcome}">
        <span class="cc-log-icon">${
          r.outcome === 'hit' || r.outcome === 'crit' ? (r.outcome === 'crit' ? '✦' : '✓') : r.outcome === 'discovered' ? '⚡' : '✗'
        }</span>
        <span class="cc-log-op">${escapeHtml(r.label)}</span>
        <span class="cc-log-target">${escapeHtml(r.target)}</span>
        <span class="cc-log-time">${escapeHtml(r.time)}</span>
      </div>`
        )
        .join('')}
    </div>
  </div>`
      : ''
  }
</div>`;

    const tgt = rootEl.querySelector('#cc-target-input');
    if (tgt) {
      tgt.addEventListener('input', (e) => {
        selectedTarget = e.target.value;
        if (!isExecuting) render();
      });
    }
    const amt = rootEl.querySelector('#cc-amount-input');
    if (amt) {
      amt.addEventListener('input', (e) => {
        extraAmount = e.target.value.trim();
        if (!isExecuting) updateCooldownDynamic();
      });
    }
    rootEl.querySelectorAll(`input[name="pp-kind-${appId}"]`).forEach((r) => {
      r.addEventListener('change', (e) => {
        targetKind = e.target.value || 'company';
        if (!isExecuting) render();
      });
    });
    rootEl.querySelectorAll('[data-attack-id]').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-attack-id') || '';
        if (cooldownRemainingFor(appId, id, ctx()) > 0) return;
        rootEl.querySelectorAll('[data-attack-id]').forEach((c) => c.classList.remove('cc-attack-selected'));
        card.classList.add('cc-attack-selected');
        selectedAttack = id;
        if (!isExecuting) render();
      });
    });
    rootEl.querySelector('#cc-execute')?.addEventListener('click', () => void runExecute());
  }

  if (!offState) {
    offState = on('stateChanged', () => {
      if (!isExecuting) render();
    });
  }

  if (pollTimer) {
    clearInterval(pollTimer);
  }
  pollTimer = window.setInterval(() => updateCooldownDynamic(), 1000);
  render();
}

function renderDice(dice) {
  if (!dice || typeof dice !== 'object') return '';
  const roll = dice.roll ?? '';
  const total = dice.total ?? '';
  const dc = dice.dc ?? '';
  const mod = dice.modifier != null ? ` (${dice.modifier >= 0 ? '+' : ''}${dice.modifier})` : '';
  if (roll === '' || dc === '') return '';
  return `<div class="cc-dice">d20: ${roll}${mod} → ${total} vs DC ${dc}</div>`;
}

function renderResultBlock(result, config) {
  if (!result) return '';
  const d = result.dice;
  const isCrit = !!(result.success && d && (d.passMargin ?? 0) >= 8);
  const discovered = !!(result.discovered || result.exposed);
  const ok = !!result.success;
  const cls = isCrit
    ? 'cc-result-hit cc-result-crit'
    : ok
      ? 'cc-result-hit'
      : discovered
        ? 'cc-result-discovered'
        : 'cc-result-miss';
  const icon = isCrit ? '✦' : ok ? '✓' : discovered ? '⚡' : '✗';
  const status = isCrit
    ? 'CRITICAL SUCCESS'
    : ok
      ? 'SUCCESS — OPERATION COMPLETE'
      : discovered
        ? 'DISCOVERED / TRACED'
        : 'FAILURE';
  return `<div class="cc-result-block ${cls}">
  <div class="cc-result-icon">${icon}</div>
  <div class="cc-result-main">
    <div class="cc-result-status">${status}</div>
    ${renderDice(d)}
    ${result.reason ? `<div class="cc-result-reason">${escapeHtml(result.reason)}</div>` : ''}
    ${
      discovered
        ? `<div class="cc-result-warning">Target / authorities alerted — notoriety may spike.</div>`
        : ''
    }
    ${
    result.shellName
      ? `<div class="cc-result-reason">Shell: ${escapeHtml(result.shellName)} (${escapeHtml(String(result.shellId || ''))})</div>`
      : ''
  }
  </div>
  ${result.payload ? `<pre class="cc-payload">${escapeHtml(JSON.stringify(result.payload, null, 2))}</pre>` : ''}
</div>`;
}
