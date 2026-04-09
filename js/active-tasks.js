import {
  SIM_HOUR_MS,
  cancelSoftwareInstall,
  endDeliveryTask,
  getState,
  killDeliveryTask,
  killSoftwareInstall,
  listBackgroundTasks
} from './gameState.js';
import { toast } from './toast.js';
import { endWindowTask, killWindowTask, listWindowTasks } from './windows.js';

let selectedTaskId = '';
let isBound = false;

function fmtRemain(ms) {
  const now = getState().sim?.elapsedMs ?? 0;
  const h = Math.max(0, (ms - now) / SIM_HOUR_MS);
  if (h < 1) return '< 1h';
  return `${h.toFixed(1)}h`;
}

function escapeTasks(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function allTasks() {
  const tasks = [...listWindowTasks(), ...listBackgroundTasks()];
  if (!tasks.some((task) => task.taskId === selectedTaskId)) selectedTaskId = tasks[0]?.taskId || '';
  return tasks;
}

function selectedTask(tasks) {
  return tasks.find((task) => task.taskId === selectedTaskId) || null;
}

function renderProgress(progress, status) {
  if (progress == null || Number.isNaN(progress)) return escapeTasks(status || '');
  return `<div class="task-progress">
    <div class="task-progress__bar"><div class="task-progress__fill" style="width:${Math.max(
      0,
      Math.min(100, progress)
    )}%"></div></div>
    <span>${Math.max(0, Math.min(100, progress))}%</span>
  </div>`;
}

function renderTaskTable(tasks) {
  if (!tasks.length) {
    return '<p class="tasks-empty">No active applications or background jobs.</p>';
  }
  return `<table class="tasks-table task-handler-table">
<thead><tr><th>Task</th><th>Type</th><th>Status</th><th>Details</th></tr></thead>
<tbody>
${tasks
  .map(
    (task) => `<tr class="${task.taskId === selectedTaskId ? 'is-selected' : ''}" data-task-id="${escapeTasks(
      task.taskId
    )}">
  <td><span class="task-icon">${escapeTasks(task.icon || '◆')}</span>${escapeTasks(task.label)}</td>
  <td>${escapeTasks(task.category)}</td>
  <td>${renderProgress(task.progress, task.status)}</td>
  <td>${escapeTasks(task.detail || '')}</td>
</tr>`
  )
  .join('')}
</tbody></table>`;
}

function renderDeliverySummary() {
  const deliveries = getState().worldNetShopping?.activeDeliveries || [];
  if (!deliveries.length) return 'No deliveries pending.';
  return deliveries.map((d) => `${d.storeName || d.title || 'Delivery'}: ${fmtRemain(d.deliverBySimMs)}`).join(' | ');
}

function applyTaskAction(kind, task) {
  if (!task) return;
  let res = { ok: false, message: 'Task unavailable.' };
  if (task.taskType === 'window') {
    res = kind === 'kill' ? killWindowTask(task.id) : endWindowTask(task.id);
  } else if (task.taskType === 'install') {
    res = kind === 'kill' ? killSoftwareInstall(task.targetId) : cancelSoftwareInstall(task.targetId);
  } else if (task.taskType === 'delivery') {
    res = kind === 'kill' ? killDeliveryTask(task.targetId) : endDeliveryTask(task.targetId);
  }
  toast(res.message);
  renderActiveTasksPanel();
}

export function initTaskHandlerPanel() {
  const body = document.getElementById('tasks-body');
  if (!body || isBound) return;
  isBound = true;
  body.addEventListener('mousedown', (e) => {
    const row = e.target.closest('[data-task-id]');
    if (row) {
      selectedTaskId = row.getAttribute('data-task-id') || '';
      renderActiveTasksPanel();
      return;
    }
    const action = e.target.getAttribute('data-task-action');
    if (!action) return;
    const tasks = allTasks();
    applyTaskAction(action, selectedTask(tasks));
  });
  window.addEventListener('corpos:window-state-changed', renderActiveTasksPanel);
}

export function renderActiveTasksPanel() {
  const body = document.getElementById('tasks-body');
  const foot = document.getElementById('tasks-foot');
  if (!body) return;
  const tasks = allTasks();
  const current = selectedTask(tasks);
  body.innerHTML = `
    <div class="task-handler-shell">
      <div class="task-handler-toolbar">
        <button type="button" class="wbtn" data-task-action="end" ${current?.canEnd ? '' : 'disabled'}>End Task</button>
        <button type="button" class="wbtn" data-task-action="kill" ${current?.canKill ? '' : 'disabled'}>Kill Task</button>
      </div>
      ${renderTaskTable(tasks)}
      <div class="task-handler-selection">
        <div><b>Selected:</b> ${escapeTasks(current?.label || 'None')}</div>
        <div><b>Status:</b> ${escapeTasks(current?.status || 'Idle')}</div>
      </div>
    </div>
  `;
  if (foot) {
    foot.innerHTML = `<div class="sp">Tasks: ${tasks.length}</div><div class="sp">${escapeTasks(
      renderDeliverySummary()
    )}</div><div class="sp">CorpOS Y2K Task Handler</div>`;
  }
}
