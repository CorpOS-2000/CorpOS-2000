/**
 * bc-notifications.js
 * Central notification store for the Black Cherry bell inbox.
 * Written to by toast.js, peek-manager.js, and bc-sms.js.
 * Read by black-cherry.js notifications view.
 * The ONLY way to remove notifications is clearAll().
 */
import { getSessionState, patchSession } from './sessionState.js';
import { emit } from './events.js';

export const NOTIF_TYPE = {
  SMS: 'sms',
  CALL: 'call',
  EMAIL: 'email',
  COMPLIANCE: 'compliance',
  SYSTEM: 'system',
  TOAST: 'toast',
  AUDIT: 'audit',
  MARKET: 'market',
  CONTRACT: 'contract',
  WEBSITE: 'website',
};

/** @deprecated Use NOTIF_TYPE — alias for existing imports */
export const NOTIF_TYPES = NOTIF_TYPE;

// ACTION TYPE RESOLUTION MAP — toast keys → deep-link actions
const TOAST_KEY_ACTIONS = {
  bank_deposit: { type: 'open_window', payload: 'worldnet' },
  bank_withdrawal: { type: 'open_window', payload: 'worldnet' },
  bank_transfer: { type: 'open_window', payload: 'worldnet' },
  bank_loan_approved: { type: 'open_window', payload: 'worldnet' },
  bank_compliance_notice: { type: 'open_window', payload: 'worldnet' },
  order_confirmed: { type: 'open_worldnet', payload: 'amazone' },
  order_delivered: { type: 'open_sms_thread', payload: 'CORPOS_SYSTEM' },
  new_message: { type: 'open_sms_thread', payload: null },
  missed_call: { type: 'open_view', payload: 'dial' },
  federal_audit_result: { type: 'open_sms_thread', payload: 'CORPOS_SYSTEM' },
  notoriety_increase: { type: 'open_window', payload: 'corporate' },
  exposure_increase: { type: 'open_window', payload: 'corporate' },
  investigator_assigned: { type: 'open_sms_thread', payload: 'COMPLIANCE_MONITOR' },
  fine_issued: { type: 'open_sms_thread', payload: 'FRA' },
  new_contract: { type: 'open_window', payload: 'tasks' },
  contract_complete: { type: 'open_window', payload: 'tasks' },
  company_registered: { type: 'open_window', payload: 'corporate' },
  cashpass_received: { type: 'open_view', payload: 'cashup' },
  cashpass_envelope_arrived: { type: 'open_view', payload: 'cashup' },
  cashpass_delivered: { type: 'open_view', payload: 'cashup' },
};

const PEEK_TYPE_ACTIONS = {
  sms: (targetId) => ({ type: 'open_sms_thread', payload: targetId }),
  compliance: (targetId) => ({ type: 'open_sms_thread', payload: targetId || 'CORPOS_SYSTEM' }),
  call_incoming: (targetId) => ({ type: 'open_sms_thread', payload: targetId }),
  call_missed: () => ({ type: 'open_view', payload: 'dial' }),
  email: (targetId) => ({ type: 'open_jeemail_message', payload: targetId }),
  cashpass: () => ({ type: 'open_view', payload: 'cashup' }),
  order_delivered: (targetId) => ({ type: 'open_sms_thread', payload: targetId }),
  toast_only: () => null,
};

export function resolveToastAction(key) {
  return TOAST_KEY_ACTIONS[String(key || '')] || null;
}

export function resolvePeekAction(type, targetId) {
  const fn = PEEK_TYPE_ACTIONS[String(type || '')];
  if (!fn) return null;
  return fn(targetId) || null;
}

/** Maps peek `type` strings to inbox category type */
export function mapPeekTypeToNotifCategory(peekType) {
  switch (peekType) {
    case 'sms':
    case 'order_delivered':
      return NOTIF_TYPE.SMS;
    case 'email':
      return NOTIF_TYPE.EMAIL;
    case 'compliance':
      return NOTIF_TYPE.COMPLIANCE;
    case 'call_incoming':
    case 'call_missed':
      return NOTIF_TYPE.CALL;
    case 'cashpass':
    case 'toast_only':
      return NOTIF_TYPE.SYSTEM;
    default:
      return NOTIF_TYPE.SYSTEM;
  }
}

/**
 * Core push function. Called by toast.js, peek-manager.js, bc-sms.js.
 * Never called directly by other systems.
 */
export function pushNotification({
  id,
  type,
  title,
  body,
  icon,
  simMs,
  action,
}) {
  const notifId = id || `n_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  const resolvedAction = action === undefined ? null : action;
  const entry = {
    id: notifId,
    type: type || NOTIF_TYPE.SYSTEM,
    title: String(title || 'Notification').slice(0, 60),
    body: String(body || '').slice(0, 120),
    icon: String(icon || '◆'),
    simMs: Number(simMs || 0),
    action: resolvedAction,
    linked: resolvedAction != null,
    read: false,
    ts: Date.now(),
  };

  patchSession((s) => {
    if (!s.bcNotifications) s.bcNotifications = { items: [], unreadCount: 0 };
    const existing = s.bcNotifications.items;
    if (existing.some((n) => n.id === notifId)) return s;
    if (
      existing.length
      && existing[0].title === entry.title
      && existing[0].body === entry.body
      && Date.now() - existing[0].ts < 500
    ) {
      return s;
    }
    existing.unshift(entry);
    if (existing.length > 100) existing.length = 100;
    s.bcNotifications.unreadCount = existing.filter((n) => !n.read).length;
    return s;
  });

  try {
    emit('bc:notification_pushed', { id: notifId });
  } catch {
    /* ignore */
  }

  return notifId;
}

export function getNotifications() {
  return getSessionState().bcNotifications?.items || [];
}

export function getUnreadCount() {
  return getSessionState().bcNotifications?.unreadCount || 0;
}

export function markRead(id) {
  patchSession((s) => {
    const item = (s.bcNotifications?.items || []).find((n) => n.id === id);
    if (item && !item.read) {
      item.read = true;
      if (s.bcNotifications && s.bcNotifications.unreadCount > 0) {
        s.bcNotifications.unreadCount--;
      }
    }
    return s;
  });
}

export function markAllRead() {
  patchSession((s) => {
    (s.bcNotifications?.items || []).forEach((n) => {
      n.read = true;
    });
    if (s.bcNotifications) s.bcNotifications.unreadCount = 0;
    return s;
  });
}

export function clearAll() {
  patchSession((s) => {
    s.bcNotifications = { items: [], unreadCount: 0 };
    return s;
  });
  try {
    emit('bc:notification_pushed', { id: null });
  } catch {
    /* ignore */
  }
}
