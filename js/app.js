import { loadBiosLines, startBootFlow, exposeGlobals as exposeBoot } from './boot.js';
import { startClock, pause, unpause, setSpeed } from './clock.js';
import {
  initWorldNet,
  currentPageKey,
  ensureWorldNetHome,
  exposeGlobals as exposeWn,
  refreshTransferDialog,
  refreshIfBank,
  wnetGo,
  wnetReload
} from './worldnet.js';
import { initContentPipeline, reloadContentCategoryFromDisk } from './init-content-pipeline.js';
import { ActorDB } from '../engine/ActorDB.js';
import { ActorEngine } from '../engine/ActorEngine.js';
import { initAdminEditors } from './admin-editors.js';
import {
  applyDueRegulatoryFinesPatch,
  applyMeridianSavingsInterestIfNeeded,
  getState,
  patchState,
  migrateStateIfNeeded,
  processWorldNetDeliveriesIfNeeded
} from './gameState.js';
import * as bankUi from './bank-ui.js';
import {
  closeW as closeWinImpl,
  initWindowChrome,
  maxW,
  minW,
  openWindowWithFeedback,
  openW as openWin,
  exposeGlobals as exposeWin
} from './windows.js';
import { initBlackCherry, openBlackCherryDock, closeBlackCherryDock, smsToPlayer, tickBlackCherryRudeness } from './black-cherry.js';
import { ensureMomExists } from './mom-actor.js';
import { SMS } from './bc-sms.js';
import { initTaskHandlerPanel, renderActiveTasksPanel } from './active-tasks.js';
import { on } from './events.js';
import { TOAST_KEYS, toast } from './toast.js';
import { initDesktopSystem, refreshInstallableAppVisibility } from './desktop.js';
import { initContextMenus } from './context-menu.js';
import {
  renderProfilesFromState,
  syncSpeedButtons,
  updateClockDisplay
} from './ui.js';
import { getInstallStatus, processSoftwareInstallsIfNeeded } from './gameState.js';
import { getInstallableApp } from './installable-apps.js';
import { getMouseClickCandidates, loadFirstPlayableAudio } from './boot-audio.js';
import { initAxis } from './axis.js';
import { initSocialComments } from './social-comments.js';
import { initYourspaceFeed, tickYourspaceRtc } from './yourspace-feed.js';
import { tickReviewBomberNpc, warmReviewBomberPosts } from './review-bomber-feed.js';
import { tickMytubeNpcComments, warmMytubeCatalog } from './mytube-feed.js';
import { tickPipelineLiveComments } from './pipeline-live-comments.js';
import { processBusinessRegistryApprovals } from './business-registry-tick.js';
import { initMoogleMaps } from './moogle-maps.js';
import { initWebExPublisher, tickWebExDomainBilling } from './webex-publisher.js';
import { tickWarehouseDaily } from './warehouse-tick.js';
import { initMarketDynamics, tickMarketDaily } from './market-dynamics.js';
import { initPlayerReplies, tickPlayerReplies, wireReplyDeps } from './player-interaction-replies.js';
import { MediaPlayer } from '../engine/MediaPlayer.js';
import { initMediaPlayer } from './media-player.js';
import { initFileExplorer } from './file-explorer.js';

let newsItems = [];
const CONTENT_TOAST_DEBOUNCE_MS = 700;
const CONTENT_TOAST_STAGGER_MS = 400;
const STARTUP_LOAD_TOAST_DELAY_MS = 6500;
let pendingContentToastCounts = new Map();
let pendingContentToastTimer = null;
let pendingContentToastDueAt = 0;
let mouseClickAudio = null;
const openingApps = new Set();

const CONTENT_TOAST_META = Object.freeze({
  actors: {
    key: TOAST_KEYS.LOAD_NPCS,
    title: 'Actor Database Updated',
    single: '1 actor added to registry',
    plural: (count) => `${count} new actors added to registry`,
    icon: '👤'
  },
  npcs: {
    key: TOAST_KEYS.LOAD_NPCS,
    title: 'Actor Database Updated',
    single: '1 actor added to registry',
    plural: (count) => `${count} new actors added to registry`,
    icon: '👤'
  },
  companies: {
    key: TOAST_KEYS.LOAD_COMPANIES,
    title: 'Company Registry Updated',
    single: '1 new company registered',
    plural: (count) => `${count} new companies registered`,
    icon: '🏢'
  },
  pages: {
    key: TOAST_KEYS.LOAD_PAGES,
    title: 'WorldNet Updated',
    single: '1 website updated',
    plural: (count) => `${count} websites updated`,
    icon: '🌐'
  },
  ads: {
    key: TOAST_KEYS.LOAD_ADS,
    title: 'WorldNet Ads Updated',
    single: '1 ad library updated',
    plural: (count) => `${count} ad library updates applied`,
    icon: '📢'
  },
  shops: {
    key: TOAST_KEYS.LOAD_PAGES,
    title: 'WorldNet Shops Updated',
    single: '1 online shop updated',
    plural: (count) => `${count} online shop updates applied`,
    icon: '🛒'
  },
  government: {
    key: TOAST_KEYS.LOAD_PAGES,
    title: 'Registry Updated',
    single: '1 government dataset updated',
    plural: (count) => `${count} government datasets updated`,
    icon: '🏛'
  }
});

const FILE_WAIT_MS = 12000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label}: timed out after ${ms}ms`)), ms))
  ]);
}

async function loadJsonFile(name) {
  if (window.corpOS?.loadDataFile) {
    try {
      const text = await withTimeout(window.corpOS.loadDataFile(name), FILE_WAIT_MS, name);
      return JSON.parse(text);
    } catch (e) {
      console.warn('[CorpOS] loadDataFile failed, using fetch:', e?.message || e);
    }
  }
  const res = await fetch(`data/${name}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

async function loadJsonText(name) {
  if (window.corpOS?.loadDataFile) {
    try {
      return await withTimeout(window.corpOS.loadDataFile(name), FILE_WAIT_MS, name);
    } catch (e) {
      console.warn('[CorpOS] loadDataFile failed, using fetch:', e?.message || e);
    }
  }
  const res = await fetch(`data/${name}`);
  if (!res.ok) throw new Error(res.statusText);
  return res.text();
}

async function openW(id) {
  if (openingApps.has(id)) return;
  const installStatus = getInstallStatus(id);
  if (installStatus.state !== 'unknown' && installStatus.state !== 'installed') {
    const app = getInstallableApp(id);
    toast({
      key: `install_${id}`,
      title: 'Application Not Installed',
      message:
        installStatus.state === 'downloading'
          ? `${app?.label || 'This app'} is still downloading.`
          : installStatus.state === 'installing'
          ? `${app?.label || 'This app'} is still installing.`
          : `${app?.label || 'This app'} is available from devtools.net.`,
      icon: '💾',
      autoDismiss: 5000
    });
    return;
  }
  openingApps.add(id);
  if (id === 'cherry') {
    openBlackCherryDock();
    openingApps.delete(id);
    return;
  }
  await openWindowWithFeedback(id);
  openingApps.delete(id);
  if (id === 'worldnet') ensureWorldNetHome();
}

function closeW(id) {
  if (id === 'cherry') {
    closeBlackCherryDock();
    return;
  }
  closeWinImpl(id);
}

function toggleStart() {
  document.getElementById('smenu')?.classList.toggle('open');
  document.getElementById('start-btn')?.classList.toggle('active');
}

function fireNews() {
  const wrap = document.getElementById('ticker-wrap');
  const text = document.getElementById('ttext');
  if (!wrap || !text || !newsItems.length) return;
  let idx = Number(wrap.dataset.newsIdx || '0');
  text.classList.remove('run');
  wrap.classList.remove('ts');
  setTimeout(() => {
    text.textContent = newsItems[idx % newsItems.length];
    wrap.dataset.newsIdx = String(idx + 1);
    wrap.classList.add('ts');
    void text.offsetWidth;
    text.classList.add('run');
    setTimeout(() => {
      wrap.classList.remove('ts');
      setTimeout(() => text.classList.remove('run'), 500);
    }, 22500);
  }, 100);
}

function wireSpeedControls() {
  document.querySelectorAll('#speed-controls [data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = Number(btn.getAttribute('data-speed'));
      setSpeed(v);
      syncSpeedButtons();
    });
  });
}

function queueContentSummary(category, amount = 1, delayOverride = CONTENT_TOAST_DEBOUNCE_MS) {
  const key = String(category || '').trim().toLowerCase();
  if (!key) return;
  pendingContentToastCounts.set(key, (pendingContentToastCounts.get(key) || 0) + Math.max(1, amount));
  if (pendingContentToastTimer) clearTimeout(pendingContentToastTimer);
  pendingContentToastDueAt = Math.max(pendingContentToastDueAt || 0, Date.now() + delayOverride);
  pendingContentToastTimer = setTimeout(
    flushContentSummaries,
    Math.max(0, pendingContentToastDueAt - Date.now())
  );
}

function flushContentSummaries() {
  const batch = [...pendingContentToastCounts.entries()];
  pendingContentToastCounts = new Map();
  pendingContentToastTimer = null;
  pendingContentToastDueAt = 0;
  batch.forEach(([category, count], idx) => {
    const meta = CONTENT_TOAST_META[category] || {
      key: `content_${category}`,
      title: 'Content Updated',
      single: `${category} updated`,
      plural: (n) => `${n} ${category} updates applied`,
      icon: '◆'
    };
    const message = count === 1 ? meta.single : meta.plural(count);
    setTimeout(() => {
      toast({
        key: meta.key,
        title: meta.title,
        message,
        icon: meta.icon,
        autoDismiss: 6000
      });
    }, idx * CONTENT_TOAST_STAGGER_MS);
  });
}

async function main() {
  pause('boot');
  bankUi.installBankWindowGlobals();
  exposeWin();
  exposeWn();
  exposeBoot();
  window.openW = openW;
  window.closeW = closeW;
  window.toggleStart = toggleStart;
  window.fireNews = fireNews;
  loadFirstPlayableAudio(getMouseClickCandidates()).then((audio) => {
    mouseClickAudio = audio;
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#smenu') && !e.target.closest('#start-btn')) {
      document.getElementById('smenu')?.classList.remove('open');
      document.getElementById('start-btn')?.classList.remove('active');
    }
  });
  document.addEventListener(
    'mousedown',
    () => {
      if (!mouseClickAudio) return;
      try {
        mouseClickAudio.currentTime = 0;
        const p = mouseClickAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch((err) => {
            if (err && err.name !== 'AbortError') console.warn('[CorpOS] click sound:', err);
          });
        }
      } catch {
        /* ignore */
      }
    },
    true
  );

  // Must run before any `await`. If IPC (loadDataFile) or fetch hangs, we still reach the boot UI.
  const kickBootOnce = (() => {
    let done = false;
    return () => {
      if (done) return;
      done = true;
      setTimeout(() => startBootFlow(), 500);
    };
  })();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', kickBootOnce, { once: true });
  } else {
    kickBootOnce();
  }

  try {
    newsItems = await loadJsonFile('news.json');
  } catch {
    newsItems = ['CorpOS — News feed unavailable.'];
  }
  window.__wnetNewsHeadlines = newsItems;

  await loadBiosLines(loadJsonFile);
  bankUi.setBankRerender(refreshIfBank);
  bankUi.setBankNavigate(wnetGo);
  patchState((s) => migrateStateIfNeeded(s));
  await ActorDB.init({
    loadJson: async (name) => {
      const text = await loadJsonText(name);
      return JSON.parse(text);
    },
    saveJson: async (name, data) => {
      if (window.corpOS?.saveDataFile) {
        await window.corpOS.saveDataFile(name, JSON.stringify(data, null, 2));
      }
    }
  });
  // ActorDB: bootstrap generates a fresh population of 500 only when the registry is empty (partial saves are untouched).
  const bootReport = await ActorDB.bootstrapPopulationIfEmpty();
  if (!bootReport.valid) {
    const critical = (bootReport.errors || []).filter(
      (e) => e.includes('duplicate ssn') || e.includes('missing required field')
    );
    if (critical.length > 0) {
      throw new Error(`ActorDB critical validation failed: ${critical.slice(0, 6).join('; ')}`);
    }
    if ((bootReport.errors || []).length) {
      console.warn('[ActorDB] non-critical validation errors', bootReport.errors);
    }
    if ((bootReport.warnings || []).length) {
      console.warn('[ActorDB] warnings', bootReport.warnings);
    }
  }
  if ((bootReport?.generated || 0) > 0) {
    queueContentSummary('actors', Number(bootReport.generated), STARTUP_LOAD_TOAST_DELAY_MS);
  }
  ActorEngine.init();
  await initContentPipeline(loadJsonFile);
  await initMoogleMaps(loadJsonFile);
  await initWorldNet(loadJsonText);
  await Promise.all([warmReviewBomberPosts(), warmMytubeCatalog()]);
  await initAxis(loadJsonFile);
  await initSocialComments(loadJsonFile);
  await initPlayerReplies(loadJsonFile);
  wireReplyDeps({ smsReceive: SMS.receive, patchState });
  await initYourspaceFeed(loadJsonFile);
  initAdminEditors();

  if (window.corpOS?.onContentFileChanged) {
    window.corpOS.onContentFileChanged((detail) => {
      const cat = detail?.category;
      if (!cat || cat === 'unknown') return;
      if (cat === 'actors') {
        ActorDB.init({
          loadJson: async (name) => {
            const text = await loadJsonText(name);
            return JSON.parse(text);
          },
          saveJson: async (name, data) => {
            if (window.corpOS?.saveDataFile) {
              await window.corpOS.saveDataFile(name, JSON.stringify(data, null, 2));
            }
          }
        }).then(() => ActorEngine.init());
        queueContentSummary('actors');
        return;
      }
      reloadContentCategoryFromDisk(cat, loadJsonFile).then(() => {
        if (cat === 'pages') wnetReload();
        queueContentSummary(cat);
      });
    });
  }

  initWindowChrome();
  initDesktopSystem();
  initBlackCherry();
  ensureMomExists();
  initContextMenus();
  initTaskHandlerPanel();
  wireSpeedControls();

  await initWebExPublisher(loadJsonFile);
  await initMarketDynamics(loadJsonFile);
  await initMediaPlayer();
  window.GameSystems = window.GameSystems || {};
  window.GameSystems.mediaPlayer = MediaPlayer;
  await initFileExplorer(loadJsonFile);

  on('tick', ({ elapsedMs }) => {
    updateClockDisplay();
    patchState((st) => {
      tickWebExDomainBilling(st);
      return st;
    });
    const simMs = typeof elapsedMs === 'number' ? elapsedMs : getState().sim.elapsedMs;
    tickYourspaceRtc(simMs);
    tickReviewBomberNpc(simMs);
    tickMytubeNpcComments(simMs);
    tickPipelineLiveComments(simMs);
    tickBlackCherryRudeness();
    tickPlayerReplies(simMs);
    ActorEngine.tick(getStateTimeHours());
    for (const m of processWorldNetDeliveriesIfNeeded()) {
      smsToPlayer(m.text);
    }
    for (const app of processSoftwareInstallsIfNeeded()) {
      refreshInstallableAppVisibility();
      toast({
        key: `install_complete_${app.id}`,
        title: 'Application Installed',
        message: `${app.label} is now available on your desktop.`,
        icon: app.icon || '💾',
        autoDismiss: 6000
      });
    }
    if (currentPageKey === 'devtools') {
      const hasActiveInstalls = !!getState().software?.activeInstalls?.length;
      if (hasActiveInstalls) wnetReload();
    }
    refreshTransferDialog();
  });
  on('dayChanged', () => {
    patchState((st) => {
      applyMeridianSavingsInterestIfNeeded(st);
      return st;
    });
    processBusinessRegistryApprovals();
    tickWarehouseDaily();
    tickMarketDaily();
    window.WorldNet?.axis?.processDecay?.();
    for (const m of applyDueRegulatoryFinesPatch()) {
      SMS.send({ from: 'COMPLIANCE_MONITOR', message: m, gameTime: getState().sim?.elapsedMs || 0 });
    }
    refreshIfBank();
  });
  on('stateChanged', () => {
    renderProfilesFromState();
    syncSpeedButtons();
    renderActiveTasksPanel();
    refreshInstallableAppVisibility();
    refreshTransferDialog();
  });

  renderProfilesFromState();
  syncSpeedButtons();
  updateClockDisplay();
  renderActiveTasksPanel();
  startClock();
}

function getStateTimeHours() {
  try {
    const elapsed = Number(getState()?.sim?.elapsedMs || 0);
    return Math.floor((elapsed / 3600000) % 24);
  } catch {
    return new Date().getHours();
  }
}

main().catch((e) => {
  console.error(e);
  const pre = document.createElement('pre');
  pre.style.cssText =
    'position:fixed;inset:0;margin:0;padding:20px;background:#1a0000;color:#ff8888;font:13px Consolas,monospace;white-space:pre-wrap;z-index:100000;overflow:auto;';
  pre.textContent = e?.stack || String(e);
  document.body.appendChild(pre);
});
