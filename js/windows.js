const winMeta = new Map();

let zCounter = 200;
let dragState = null;
let resizeState = null;

function emitWindowStateChange() {
  window.dispatchEvent(new CustomEvent('corpos:window-state-changed'));
}

function tbContainer() {
  return document.getElementById('tb-btns');
}

function ensureMeta(id) {
  let meta = winMeta.get(id);
  if (!meta) {
    meta = {
      minimized: false,
      tbBtn: null,
      pendingLaunchPenaltyMs: 0,
      ending: null
    };
    winMeta.set(id, meta);
  }
  return meta;
}

function titleForWindow(id, win = document.getElementById(`win-${id}`)) {
  return win?.querySelector('.wtt')?.textContent?.trim() || id;
}

function iconForWindow(id, win = document.getElementById(`win-${id}`)) {
  return win?.querySelector('.wti')?.textContent?.trim() || '◆';
}

function sizeBucketDurationMs(win) {
  const width = Number(win?.offsetWidth || parseInt(win?.style.width || '', 10) || 420);
  const height = Number(win?.offsetHeight || parseInt(win?.style.height || '', 10) || 320);
  const area = width * height;
  if (area >= 420000) return 7000;
  if (area >= 300000) return 6000;
  if (area >= 220000) return 5000;
  if (area >= 140000) return 4000;
  return 3000;
}

function clearEndingTimer(meta) {
  if (meta?.ending?.timer) clearTimeout(meta.ending.timer);
}

function activeWindowCount() {
  return [...document.querySelectorAll('.ww')].filter((win) => {
    const id = String(win.id || '').replace(/^win-/, '');
    const meta = ensureMeta(id);
    return win.style.display !== 'none' || meta.minimized || meta.ending;
  }).length;
}

function killPenaltyMs() {
  return (Math.floor(Math.random() * 10) + 3) * 1000;
}

function ensureOpeningDialog() {
  let overlay = document.getElementById('corpos-opening-dialog');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'corpos-opening-dialog';
  overlay.className = 'corpos-opening is-hidden';
  overlay.innerHTML = `
    <div class="corpos-opening__panel">
      <div class="corpos-opening__titlebar">CorpOS Loader</div>
      <div class="corpos-opening__body">
        <div class="corpos-opening__message" id="corpos-opening-message">Opening program...</div>
        <div class="corpos-opening__meter"><div class="corpos-opening__fill" id="corpos-opening-fill"></div></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setBusyCursor(active) {
  document.body.classList.toggle('corpos-busy', !!active);
}

export function openW(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  const meta = ensureMeta(id);
  if (meta.ending) return;
  if (meta.minimized) {
    meta.minimized = false;
    win.style.display = 'flex';
    meta.tbBtn?.remove();
    meta.tbBtn = null;
  } else {
    win.style.display = 'flex';
  }
  win.classList.remove('inactive');
  win.style.zIndex = String(++zCounter);
  document.querySelectorAll('.ww').forEach((w) => {
    if (w !== win) w.classList.add('inactive');
  });
  emitWindowStateChange();
}

export function closeW(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  const meta = ensureMeta(id);
  clearEndingTimer(meta);
  meta.tbBtn?.remove();
  meta.tbBtn = null;
  meta.minimized = false;
  meta.ending = null;
  win.style.display = 'none';
  win.classList.add('inactive');
  emitWindowStateChange();
}

export function minW(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  const meta = ensureMeta(id);
  if (meta.ending) return;
  const title = titleForWindow(id, win);
  win.style.display = 'none';
  win.classList.add('inactive');
  meta.minimized = true;
  if (!meta.tbBtn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tb-app';
    btn.textContent = title;
    btn.addEventListener('click', () => {
      openW(id);
      btn.classList.remove('pressed');
    });
    btn.addEventListener('mousedown', () => btn.classList.add('pressed'));
    btn.addEventListener('mouseup', () => btn.classList.remove('pressed'));
    tbContainer()?.appendChild(btn);
    meta.tbBtn = btn;
  }
  emitWindowStateChange();
}

export function maxW(id) {
  const win = document.getElementById(`win-${id}`);
  if (!win) return;
  if (win.dataset.maxed) {
    win.style.cssText = win.dataset.saved || '';
    delete win.dataset.maxed;
  } else {
    win.dataset.saved = win.style.cssText;
    win.style.left = '0';
    win.style.top = '0';
    win.style.width = '100vw';
    win.style.height = 'calc(100vh - 30px)';
    win.dataset.maxed = '1';
  }
  emitWindowStateChange();
}

export function initWindowChrome() {
  document.querySelectorAll('.ww').forEach((w) => {
    w.addEventListener(
      'mousedown',
      () => {
        document.querySelectorAll('.ww').forEach((x) => x.classList.add('inactive'));
        w.classList.remove('inactive');
        w.style.zIndex = String(++zCounter);
        emitWindowStateChange();
      },
      true
    );
  });

  document.addEventListener('mousemove', (e) => {
    if (dragState) {
      const win = document.getElementById(dragState.id);
      if (win) {
        win.style.left = `${dragState.ol + e.clientX - dragState.sx}px`;
        win.style.top = `${dragState.ot + e.clientY - dragState.sy}px`;
      }
    }
    if (resizeState) {
      const win = document.getElementById(resizeState.id);
      if (win) {
        win.style.width = `${Math.max(300, resizeState.ow + e.clientX - resizeState.sx)}px`;
        win.style.height = `${Math.max(200, resizeState.oh + e.clientY - resizeState.sy)}px`;
      }
    }
  });
  document.addEventListener('mouseup', () => {
    dragState = null;
    resizeState = null;
  });
}

export function drag(e, id) {
  if (e.target.classList.contains('wcb')) return;
  const win = document.getElementById(id);
  if (!win) return;
  dragState = {
    id,
    sx: e.clientX,
    sy: e.clientY,
    ol: parseInt(win.style.left, 10) || 100,
    ot: parseInt(win.style.top, 10) || 60
  };
  e.preventDefault();
}

export function resz(e, id) {
  const win = document.getElementById(id);
  if (!win) return;
  resizeState = {
    id,
    sx: e.clientX,
    sy: e.clientY,
    ow: win.offsetWidth,
    oh: win.offsetHeight
  };
  e.preventDefault();
  e.stopPropagation();
}

export function listWindowTasks() {
  return [...document.querySelectorAll('.ww')]
    .map((win) => {
      const id = String(win.id || '').replace(/^win-/, '');
      const meta = ensureMeta(id);
      const visible = win.style.display !== 'none';
      if (!visible && !meta.minimized && !meta.ending) return null;
      const endingProgress = meta.ending
        ? Math.round(
            Math.min(1, Math.max(0, (Date.now() - meta.ending.startedAtMs) / Math.max(1, meta.ending.durationMs))) *
              100
          )
        : null;
      return {
        id,
        taskId: `window:${id}`,
        taskType: 'window',
        icon: iconForWindow(id, win),
        label: titleForWindow(id, win),
        category: 'Application',
        status: meta.ending ? 'Ending Task' : meta.minimized ? 'Minimized' : 'Running',
        progress: endingProgress,
        detail: meta.pendingLaunchPenaltyMs
          ? `Next open delayed ${Math.ceil(meta.pendingLaunchPenaltyMs / 1000)}s`
          : '',
        canEnd: !meta.ending,
        canKill: !meta.ending
      };
    })
    .filter(Boolean);
}

export function endWindowTask(id) {
  const win = document.getElementById(`win-${id}`);
  const meta = ensureMeta(id);
  if (!win || (win.style.display === 'none' && !meta.minimized)) return { ok: false, message: 'Program is not running.' };
  if (meta.ending) return { ok: false, message: 'Task is already ending.' };
  meta.ending = {
    startedAtMs: Date.now(),
    durationMs: sizeBucketDurationMs(win),
    timer: setTimeout(() => closeW(id), sizeBucketDurationMs(win))
  };
  emitWindowStateChange();
  return { ok: true, message: 'Ending task...', durationMs: meta.ending.durationMs };
}

export function killWindowTask(id) {
  const win = document.getElementById(`win-${id}`);
  const meta = ensureMeta(id);
  if (!win || (win.style.display === 'none' && !meta.minimized)) return { ok: false, message: 'Program is not running.' };
  clearEndingTimer(meta);
  meta.pendingLaunchPenaltyMs = killPenaltyMs();
  meta.ending = null;
  closeW(id);
  return { ok: true, message: 'Task terminated immediately.', penaltyMs: meta.pendingLaunchPenaltyMs };
}

export function consumeLaunchPenalty(id) {
  const meta = ensureMeta(id);
  const penaltyMs = Number(meta.pendingLaunchPenaltyMs) || 0;
  meta.pendingLaunchPenaltyMs = 0;
  emitWindowStateChange();
  return penaltyMs;
}

export function openWindowWithFeedback(id, label = '', onOpened = null) {
  const baseDelayMs = (Math.floor(Math.random() * 3) + 1) * 1000;
  const penaltyMs = consumeLaunchPenalty(id);
  const stackPenaltyMs = Math.min(6000, Math.max(0, activeWindowCount() - 1) * 900);
  const totalDelayMs = baseDelayMs + penaltyMs + stackPenaltyMs;
  const overlay = ensureOpeningDialog();
  const message = overlay.querySelector('#corpos-opening-message');
  const fill = overlay.querySelector('#corpos-opening-fill');
  if (message) {
    const suffix = stackPenaltyMs ? ` Allocating resources...` : '';
    message.textContent = `Opening ${label || titleForWindow(id)}...${suffix}`;
  }
  if (fill) fill.style.width = '0%';
  overlay.classList.remove('is-hidden');
  setBusyCursor(true);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const meterTimer = setInterval(() => {
      const pct = Math.min(100, Math.round(((Date.now() - startedAt) / Math.max(1, totalDelayMs)) * 100));
      if (fill) fill.style.width = `${pct}%`;
    }, 75);
    setTimeout(() => {
      clearInterval(meterTimer);
      if (fill) fill.style.width = '100%';
      setTimeout(() => {
        overlay.classList.add('is-hidden');
        setBusyCursor(false);
        if (typeof onOpened === 'function') onOpened();
        else openW(id);
        resolve({ ok: true, delayMs: totalDelayMs });
      }, 120);
    }, totalDelayMs);
  });
}

export function exposeGlobals() {
  window.openW = openW;
  window.closeW = closeW;
  window.minW = minW;
  window.maxW = maxW;
  window.drag = drag;
  window.resz = resz;
}
