import { initCorpOsCursorFollower } from './cursor-follower.js';
import { initAmbientMusic } from './ambient-music.js';
import { loadBiosLines, startBootFlow, exposeGlobals as exposeBoot } from './boot.js';
import { startClock, pause, unpause, setSpeed } from './clock.js';
import {
  initWorldNet,
  currentPageKey,
  currentSubPath,
  ensureWorldNetHome,
  exposeGlobals as exposeWn,
  refreshTransferDialog,
  refreshIfBank,
  refreshCorposAppstoreWindow,
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
  resetState,
  migrateStateIfNeeded,
  processWorldNetDeliveriesIfNeeded,
  processSiteRepairsIfNeeded,
  processMarketplaceSettlementsIfNeeded
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
import { DevConsole } from './dev-console.js';
import { ensureMomExists } from './mom-actor.js';
import {
  fireQueuedSmsEvents,
  generatePlayerAndMomAfterEnrollment,
  onPlayerExploresDistrict
} from './world-generation.js';
import { SMS } from './bc-sms.js';
import { initTaskHandlerPanel, renderActiveTasksPanel } from './active-tasks.js';
import { on } from './events.js';
import { TOAST_KEYS, toast } from './toast.js';
import {
  initDesktopSystem,
  refreshDesktopLayoutFromSession,
  refreshInstallableAppVisibility
} from './desktop.js';
import { initContextMenus } from './context-menu.js';
import {
  renderProfilesFromState,
  syncSpeedButtons,
  updateClockDisplay
} from './ui.js';
import { getInstallStatus, processSoftwareInstallsIfNeeded } from './gameState.js';
import { getInstallableApp } from './installable-apps.js';
import { initAxis, hydrateAxisFromSave, tickAxisNpcInitiatedContact } from './axis.js';
import { SaveManager } from '../engine/SaveManager.js';
import { initSocialComments } from './social-comments.js';
import { initYourspaceFeed, tickYourspaceRtc } from './yourspace-feed.js';
import { tickWebexSiteRtcPages } from './webex-site-rtc.js';
import { tickReviewBomberNpc, warmReviewBomberPosts } from './review-bomber-feed.js';
import { tickMytubeNpcComments, warmMytubeCatalog } from './mytube-feed.js';
import { tickPipelineLiveComments } from './pipeline-live-comments.js';
import { processBusinessRegistryApprovals } from './business-registry-tick.js';
import { initMoogleMaps } from './moogle-maps.js';
import { initWebExPublisher, tickWebExDomainBilling } from './webex-publisher.js';
import { tickWarehouseDaily } from './warehouse-tick.js';
import { initRivalCompanies, tickRivals } from './rival-companies.js';
import { hydrateAmazoneWorldNetStore } from './worldnet-shop.js';
import { tickPlayerStore } from './player-store.js';
import { initPlayerReplies, tickPlayerReplies, wireReplyDeps } from './player-interaction-replies.js';
import { MediaPlayer } from '../engine/MediaPlayer.js';
import { initMediaPlayer } from './media-player.js';
import { wireTimeControlSounds, syncTimeControlLoopToState } from './time-control-sounds.js';
import { initMouseClickSounds } from './mouse-click-sounds.js';
import { initFileExplorer } from './file-explorer.js';
import { initWritepad } from './writepad.js';
import { mountInventoryWindow } from './inventory-ui.js';
import { tickEconomy, ensureEconomy, ECON_CONSTANTS } from './economy.js';
import { initMarketDynamics } from './market-dynamics.js';
import { tickHeraldSyndication } from './herald-syndication.js';
import { initDailyHerald, getDailyHeraldTickerArticles } from './daily-herald.js';
import { EventSystem } from '../engine/EventSystem.js';
import { verifyAppIntegrity, seedAllProgramFiles, seedProgramFiles, showAppErrorDialog } from './program-files.js';
import { initWebExploiter } from './webexploiter.js';
import { initCombatApps } from './combat-console-ui.js';
import { processPendingCombatEffects } from './combat-pending.js';
import { tickPhantomSmearCampaignsDaily } from './phantom-press.js';
import { tickGhostReferralSms } from './ghost-corp.js';
import { getEffectiveInstallId, COMBAT_PROGRAM_BASE_IDS } from './combat-version.js';
import { WebExploiter } from '../engine/WebExploiter.js';
import { ActivityLog } from '../engine/ActivityLog.js';

let newsItems = [];

function refreshNewsItems() {
  const st = getState();
  const items = [];

  const heraldSource = getDailyHeraldTickerArticles(st.sim?.elapsedMs ?? 0);
  for (const article of heraldSource) {
    if (article.headline) items.push(`◆ ${article.headline}`);
  }

  const heraldExtra = st.heraldArticles || st.contentRegistry?.herald || [];
  if (Array.isArray(heraldExtra)) {
    for (const article of heraldExtra) {
      if (article?.headline) items.push(`◆ ${article.headline}`);
    }
  }

  const news = st.newsRegistry || [];
  for (const n of news) {
    if (!n.headline) continue;
    const sev = Number(n.severity ?? 1);
    const prefix =
      sev >= 4 ? '🔴 BREAKING'
        : sev >= 3 ? '🟡 ALERT'
          : sev >= 2 ? '◆ NEWS'
            : '◆';
    items.push(`${prefix} — ${n.headline}`);
  }

  items.push(
    '◆ MARKETS UP — Dot-com boom continues',
    '◆ RAPIDGATE — One year later',
    '◆ CORPOS MANDATE — 100% compliance achieved',
    '◆ HARGROVE WEATHER — Partly cloudy, 68°F',
    '◆ FEDERAL BUSINESS REGISTRY — Q1 filings open',
  );

  newsItems = [...new Set(items)];
  if (typeof window !== 'undefined') {
    window.newsItems = newsItems;
    window.__wnetNewsHeadlines = newsItems;
  }
}

let _tickerAutoInterval = null;
let _lastTickerNewsCount = 0;
/** Single scheduled next headline (replaces chained setTimeouts). */
let _tickerCycleTimer = null;
/** Fallback if animationend never fires (low-power devices). */
let _tickerAnimFallbackTimer = null;

const TICKER_COLLAPSED_LS = 'corpos.ticker.collapsed';

function clearTickerTimers() {
  if (_tickerCycleTimer) {
    clearTimeout(_tickerCycleTimer);
    _tickerCycleTimer = null;
  }
  if (_tickerAnimFallbackTimer) {
    clearTimeout(_tickerAnimFallbackTimer);
    _tickerAnimFallbackTimer = null;
  }
}

function scheduleTickerNews(delayMs) {
  clearTickerTimers();
  _tickerCycleTimer = setTimeout(() => fireNews(), delayMs);
}

function isTickerCollapsed() {
  return !!document.getElementById('ticker-bar')?.classList.contains('ticker-bar--collapsed');
}

function pauseTickerBecauseHidden() {
  clearTickerTimers();
  document.getElementById('ttext')?.classList.remove('run');
}

function initTickerChrome() {
  const bar = document.getElementById('ticker-bar');
  const btn = document.getElementById('ticker-toggle');
  if (!bar || !btn) return;

  function applyCollapsed() {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(TICKER_COLLAPSED_LS) === '1';
    } catch {
      collapsed = false;
    }
    bar.classList.toggle('ticker-bar--collapsed', collapsed);
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    const t = collapsed ? 'Show Herald news bar' : 'Hide Herald news bar';
    btn.title = t;
    btn.setAttribute('aria-label', t);
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const collapsing = !bar.classList.contains('ticker-bar--collapsed');
    try {
      localStorage.setItem(TICKER_COLLAPSED_LS, collapsing ? '1' : '0');
    } catch {
      /* ignore private mode */
    }
    applyCollapsed();
    clearTickerTimers();
    if (!collapsing) fireNews();
    else pauseTickerBecauseHidden();
  });

  applyCollapsed();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      pauseTickerBecauseHidden();
      return;
    }
    if (!isTickerCollapsed()) scheduleTickerNews(250);
  });
}

function startAutoTicker() {
  if (_tickerAutoInterval) clearInterval(_tickerAutoInterval);
  _tickerAutoInterval = setInterval(() => {
    refreshNewsItems();
    if (newsItems.length > _lastTickerNewsCount && _lastTickerNewsCount > 0 && !isTickerCollapsed()) {
      scheduleTickerNews(800);
    }
    _lastTickerNewsCount = newsItems.length;
  }, 60000);

  refreshNewsItems();
  _lastTickerNewsCount = newsItems.length;
}
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
          : `${app?.label || 'This app'} is available from the CorpOS Appstore or devtools.net.`,
      icon: '💾',
      autoDismiss: 5000
    });
    return;
  }
  let integrityId = id;
  if (COMBAT_PROGRAM_BASE_IDS.includes(id)) {
    const eff = getEffectiveInstallId(id);
    if (eff) integrityId = eff;
  }
  const integrityErr = verifyAppIntegrity(integrityId);
  if (integrityErr && !integrityErr.warnOnly) {
    await showAppErrorDialog(integrityErr);
    return;
  }
  if (integrityErr?.warnOnly) {
    toast({ key: `cfg_warn_${id}`, title: integrityErr.title, message: integrityErr.message, icon: '⚠️', autoDismiss: 5000 });
  }
  openingApps.add(id);
  if (id === 'cherry') {
    openBlackCherryDock();
    openingApps.delete(id);
    return;
  }
  if (id === 'corpos-appstore') {
    await openWindowWithFeedback(id, 'CorpOS Appstore', () => {
      openWin(id);
      refreshCorposAppstoreWindow();
    });
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
  const bar = document.getElementById('ticker-bar');
  const wrap = document.getElementById('ticker-wrap');
  const text = document.getElementById('ttext');
  if (!bar || !wrap || !text || !newsItems.length) return;

  if (document.visibilityState === 'hidden') {
    scheduleTickerNews(45000);
    return;
  }

  if (isTickerCollapsed()) {
    scheduleTickerNews(120000);
    return;
  }

  clearTickerTimers();

  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let idx = Number(wrap.dataset.newsIdx || '0');
  const headline = newsItems[idx % newsItems.length];
  wrap.dataset.newsIdx = String(idx + 1);

  text.classList.remove('run');
  bar.classList.remove('ts', 'breaking');
  wrap.classList.remove('ts', 'breaking');

  requestAnimationFrame(() => {
    text.textContent = headline;

    bar.classList.add('ts');
    wrap.classList.add('ts');

    const isBreaking = headline.includes('BREAKING') || headline.includes('🔴');
    if (isBreaking) bar.classList.add('breaking');

    const finishCycle = () => {
      bar.classList.remove('ts', 'breaking');
      wrap.classList.remove('ts', 'breaking');
      text.classList.remove('run');
      scheduleTickerNews(8000 + Math.random() * 12000);
    };

    if (reduceMotion) {
      scheduleTickerNews(11000 + Math.random() * 9000);
      return;
    }

    requestAnimationFrame(() => {
      void text.offsetWidth;
      text.classList.add('run');

      let cycleFinished = false;
      const finishOnce = () => {
        if (cycleFinished) return;
        cycleFinished = true;
        finishCycle();
      };

      const onAnimEnd = (e) => {
        if (e.animationName !== 'ticker-scroll') return;
        text.removeEventListener('animationend', onAnimEnd);
        clearTimeout(_tickerAnimFallbackTimer);
        _tickerAnimFallbackTimer = null;
        finishOnce();
      };

      text.addEventListener('animationend', onAnimEnd);

      _tickerAnimFallbackTimer = setTimeout(() => {
        text.removeEventListener('animationend', onAnimEnd);
        _tickerAnimFallbackTimer = null;
        finishOnce();
      }, 23000);
    });
  });
}

function wireSpeedControls() {
  wireTimeControlSounds({ setSpeed, syncSpeedButtons });
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
  // Software cursor temporarily disabled — to re-enable, uncomment the line below:
  // initCorpOsCursorFollower();
  pause('boot');
  bankUi.installBankWindowGlobals();
  exposeWin();
  exposeWn();
  exposeBoot();
  window.openW = openW;
  window.closeW = closeW;
  window.toggleStart = toggleStart;
  window.fireNews = fireNews;
  window.startDesktopNewsTicker = () => {
    startAutoTicker();
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#smenu') && !e.target.closest('#start-btn')) {
      document.getElementById('smenu')?.classList.remove('open');
      document.getElementById('start-btn')?.classList.remove('active');
    }
  });
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

  refreshNewsItems();

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
  // NPC population is now generated during the BIOS sequence (world-generation.js).
  // ActorDB.init loads any existing actors from disk; BIOS parallel gen fills if empty.
  ActorEngine.init();
  try {
    const dm = getState().districtManifest;
    if (dm) ActorDB.loadColdManifest(dm);
  } catch {
    /* ignore */
  }
  window.onPlayerExploresDistrict = onPlayerExploresDistrict;
  await initContentPipeline(loadJsonFile);
  await initMoogleMaps(loadJsonFile);
  // Expose getState for ActorDB.getCompanyName cross-reference
  window.__gameState = getState;
  await initWorldNet(loadJsonText);
  await Promise.all([warmReviewBomberPosts(), warmMytubeCatalog()]);
  await initAxis(loadJsonFile);
  SaveManager.migrateLegacySave();
  window.__corpOsSaveStatus = {
    ready: true,
    hasUsers: SaveManager.hasRegisteredUsers(),
    accounts: SaveManager.getAccountIndex()
  };

  window.__corpOsHydrateUser = function (username) {
    SaveManager.setActiveUsername(username);
    const result = SaveManager.loadUser(username);
    if (result.exists && !result.corrupted && result.data) {
      resetState();
      patchState((s) => migrateStateIfNeeded(s));
      const axisRows = SaveManager.hydrate(result.data);
      if (axisRows?.length) {
        hydrateAxisFromSave(axisRows);
      }
      try {
        window.CCR?.syncFromPhoneBook?.();
      } catch {
        /* ok */
      }
      SaveManager.applyPendingDiscoveredActors();
      syncTimeControlLoopToState();
    }
    // First-time operators have no save blob yet; still lay out the desktop once #desktop is shown.
    refreshDesktopLayoutFromSession();
    seedAllProgramFiles();
    ensureMomExists();
    generatePlayerAndMomAfterEnrollment();
  };

  window.SaveManager = SaveManager;
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
      if (cat === 'events') {
        loadJsonFile('events/events.json').then(defs => {
          EventSystem.loadDefinitions(Array.isArray(defs) ? defs : []);
          console.log('[EventSystem] Hot-reloaded event definitions.');
        }).catch(e => console.warn('[EventSystem] Hot-reload failed:', e));
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
  initTickerChrome();
  initBlackCherry();
  DevConsole.init();
  initContextMenus();
  initTaskHandlerPanel();
  wireSpeedControls();
  initMouseClickSounds();

  await initWebExPublisher(loadJsonFile);
  await initMarketDynamics(loadJsonFile);
  await initRivalCompanies(loadJsonFile);
  hydrateAmazoneWorldNetStore();
  patchState((s) => {
    ensureEconomy(s);
    return s;
  });
  await initMediaPlayer();
  window.GameSystems = window.GameSystems || {};
  window.GameSystems.mediaPlayer = MediaPlayer;
  // Ambient music: starts after MediaPlayer is ready; uses the same file list IPC
  try {
    const ambientFiles = window.corpOS?.listAssetsMusicFiles
      ? await window.corpOS.listAssetsMusicFiles()
      : [];
    initAmbientMusic(Array.isArray(ambientFiles) ? ambientFiles : []);
  } catch (e) {
    console.warn('[AmbientMusic] init failed:', e?.message ?? e);
  }
  await initFileExplorer(loadJsonFile);
  {
    const inv = document.getElementById('player-inventory-root');
    if (inv) mountInventoryWindow(inv);
  }
  seedAllProgramFiles();
  initWritepad();
  initDailyHerald({ mount: document.getElementById('dh-root') });
  initWebExploiter();
  window.WebExploiter = WebExploiter;
  initCombatApps();

  on('tick', ({ elapsedMs }) => {
    updateClockDisplay();
    const simMs = typeof elapsedMs === 'number' ? elapsedMs : getState().sim.elapsedMs;
    processPendingCombatEffects();
    patchState((st) => {
      tickWebExDomainBilling(st);
      return st;
    });
    tickYourspaceRtc(simMs);
    tickWebexSiteRtcPages(simMs);
    tickReviewBomberNpc(simMs);
    tickMytubeNpcComments(simMs);
    tickPipelineLiveComments(simMs);
    tickBlackCherryRudeness();
    tickPlayerReplies(simMs);
    tickGhostReferralSms();
    ActorEngine.tick(getStateTimeHours());
    for (const m of processWorldNetDeliveriesIfNeeded()) {
      smsToPlayer(m.text);
    }
    for (const t of processMarketplaceSettlementsIfNeeded()) {
      const amt = Number(t.amount || 0);
      toast({
        key: `mps_done_${t.id || ''}`,
        title: 'ETradeBay',
        message: `Sale settled: $${amt.toFixed(2)} deposited to FNCB.`,
        icon: '💰',
        autoDismiss: 6000
      });
    }
    for (const t of processSiteRepairsIfNeeded()) {
      toast({
        key: `repair_done_${t.pageId}`,
        title: 'Site Back Online',
        message: `${String(t.label || '').replace(/^Repairing:\s*/i, '') || t.pageId} has been fully restored.`,
        icon: '✓',
        autoDismiss: 8000
      });
      SMS.send({
        from: 'CORPOS_SYSTEM',
        message: `MAINTENANCE COMPLETE — Site restoration for ${t.pageId} is complete. Your site is now online and accessible via WorldNet Explorer.`,
        gameTime: getState().sim?.elapsedMs || 0
      });
    }
    for (const app of processSoftwareInstallsIfNeeded()) {
      seedProgramFiles(app.id);
      refreshInstallableAppVisibility();
      refreshCorposAppstoreWindow();
      try {
        const meta = getInstallableApp(app.id);
        window.ActivityLog?.log?.('APP_INSTALL_DONE', `Install complete: ${app.label}`, {
          suspicious: meta?.trustLevel === 'unverified'
        });
      } catch {
        /* ignore */
      }
      toast({
        key: `install_complete_${app.id}`,
        title: 'Application Installed',
        message: `${app.label} is now available on your desktop.`,
        icon: app.icon || '💾',
        autoDismiss: 6000
      });
    }
    if (
      currentPageKey === 'devtools' ||
      currentPageKey === 'net99669' ||
      currentPageKey === 'backrooms' ||
      (currentPageKey === 'corpos_com' && currentSubPath === 'apps')
    ) {
      const hasActiveInstalls = !!getState().software?.activeInstalls?.length;
      if (hasActiveInstalls) wnetReload();
    }
    refreshCorposAppstoreWindow();
    refreshTransferDialog();
  });
  on('dayChanged', () => {
    const simMs = getState().sim?.elapsedMs || 0;
    tickEconomy(simMs);
    patchState((st) => {
      applyMeridianSavingsInterestIfNeeded(st);
      return st;
    });
    processBusinessRegistryApprovals();
    tickWarehouseDaily();
    tickMarketDaily();
    tickRivals(simMs);
    patchState((s) => {
      const fncb = s.accounts?.find((a) => a.id === 'fncb');
      if (fncb) fncb.balance = (fncb.balance || 0) - ECON_CONSTANTS.BASE_DAILY_EXPENSES;
      return s;
    });
    tickPhantomSmearCampaignsDaily();
    tickHeraldSyndication(getState().sim?.elapsedMs || 0);
    tickPlayerStore();
    window.WorldNet?.axis?.processDecay?.();
    WebExploiter.tickSiteRecovery();
    processPendingCombatEffects();
    for (const m of applyDueRegulatoryFinesPatch()) {
      SMS.send({ from: 'COMPLIANCE_MONITOR', message: m, gameTime: getState().sim?.elapsedMs || 0 });
    }
    refreshIfBank();
  });
  let _stateChangedRaf = 0;
  on('stateChanged', () => {
    if (_stateChangedRaf) return;
    _stateChangedRaf = requestAnimationFrame(() => {
      _stateChangedRaf = 0;
      renderProfilesFromState();
      syncSpeedButtons();
      renderActiveTasksPanel();
      refreshInstallableAppVisibility();
      refreshTransferDialog();
    });
  });

  on('news:breaking', ({ headline } = {}) => {
    if (headline) {
      newsItems.unshift(`🔴 BREAKING — ${headline}`);
      if (typeof window !== 'undefined') {
        window.newsItems = newsItems;
        window.__wnetNewsHeadlines = newsItems;
      }
      fireNews();
    }
  });

  try {
    const evtDefs = await loadJsonFile('events/events.json');
    EventSystem.loadDefinitions(Array.isArray(evtDefs) ? evtDefs : []);
  } catch (e) {
    console.warn('[EventSystem] Could not load events.json:', e);
  }
  EventSystem.init();
  window.EventSystem = EventSystem;

  ActivityLog.init();
  window.ActivityLog = ActivityLog;

  renderProfilesFromState();
  syncSpeedButtons();
  updateClockDisplay();
  renderActiveTasksPanel();
  startClock();

  let lastAutosaveKey = '';
  on('hour', ({ gameDate }) => {
    const h = gameDate.getUTCHours();
    if (h % 6 === 0) {
      tickAxisNpcInitiatedContact(getState().sim?.elapsedMs || 0);
    }
    if (h % 6 !== 0) return;
    const key = `${gameDate.getUTCFullYear()}-${gameDate.getUTCMonth()}-${gameDate.getUTCDate()}-${h}`;
    if (key === lastAutosaveKey) return;
    lastAutosaveKey = key;
    SaveManager.save();
    console.log('[AutoSave] Hourly save triggered (every 6 in-game hours).');
  });
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
