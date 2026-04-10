export const TOAST_KEYS = Object.freeze({
  SYSTEM_LOAD: 'system_load',
  LOAD_NPCS: 'load_npcs',
  LOAD_COMPANIES: 'load_companies',
  LOAD_PAGES: 'load_pages',
  LOAD_ADS: 'load_ads',
  BANK_DEPOSIT: 'bank_deposit',
  BANK_WITHDRAWAL: 'bank_withdrawal',
  BANK_TRANSFER: 'bank_transfer',
  BANK_LOAN_APPROVED: 'bank_loan_approved',
  BANK_COMPLIANCE: 'bank_compliance_notice',
  CASHPASS_RECEIVED: 'cashpass_received',
  CASHPASS_ENVELOPE: 'cashpass_envelope_arrived',
  CASHPASS_DELIVERED: 'cashpass_delivered',
  ORDER_CONFIRMED: 'order_confirmed',
  ORDER_DELIVERED: 'order_delivered',
  NEW_MESSAGE: 'new_message',
  MISSED_CALL: 'missed_call',
  NOTORIETY_INCREASE: 'notoriety_increase',
  EXPOSURE_INCREASE: 'exposure_increase',
  INVESTIGATOR_ASSIGNED: 'investigator_assigned',
  FINE_ISSUED: 'fine_issued',
  NEW_CONTRACT: 'new_contract',
  CONTRACT_COMPLETE: 'contract_complete',
  COMPANY_REGISTERED: 'company_registered',
  NPC_UNLOCKED: 'npc_unlocked',
  GENERIC: 'generic',
  TRACK_IMPORTED: 'track_imported',
  FEDERAL_AUDIT_RESULT: 'federal_audit_result',
  DEV_LOTTERY_DEPOSIT: 'dev_lottery_deposit'
});

const WEASEL_BADGE = '≽ᴥ≼';
const DEFAULT_DISMISS_MS = 4500;

function escapeToastHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeToastOptions(options) {
  if (typeof options === 'string') {
    return {
      key: TOAST_KEYS.GENERIC,
      title: 'CorpOS',
      message: options,
      icon: '◆',
      autoDismiss: DEFAULT_DISMISS_MS
    };
  }
  const key = String(options?.key || TOAST_KEYS.GENERIC).trim() || TOAST_KEYS.GENERIC;
  return {
    key,
    title: String(options?.title || 'CorpOS'),
    message: String(options?.message || ''),
    icon: String(options?.icon || '◆'),
    autoDismiss: Number(options?.autoDismiss) > 0 ? Number(options.autoDismiss) : DEFAULT_DISMISS_MS
  };
}

const ToastManager = {
  active: Object.create(null),

  fire(options) {
    const normalized = normalizeToastOptions(options);
    const container = document.getElementById('toasts');
    if (!container) return;

    const existing = this.active[normalized.key];
    if (existing?.element?.isConnected) {
      existing.count += 1;
      existing.element.dataset.count = String(existing.count);
      this.updateMessage(existing.element, normalized.title, normalized.message, normalized.icon);
      this.updateBadge(existing.element, existing.count);
      this.resetTimer(normalized.key, normalized.autoDismiss);
      return;
    }

    const element = this.createElement(normalized);
    container.appendChild(element);
    this.active[normalized.key] = {
      element,
      count: 1,
      timer: null
    };
    this.resetTimer(normalized.key, normalized.autoDismiss);
  },

  createElement({ key, title, message, icon }) {
    const div = document.createElement('div');
    div.className = 'toast';
    div.dataset.key = key;
    div.dataset.count = '1';
    div.innerHTML = `
      <div class="toast-icon">${escapeToastHtml(icon)}</div>
      <div class="toast-body">
        <div class="toast-title">${escapeToastHtml(title)}</div>
        <div class="toast-message">${escapeToastHtml(message)}</div>
      </div>
      <div class="toast-badge" aria-hidden="true" style="display:none;"></div>
    `;
    return div;
  },

  updateMessage(element, title, message, icon) {
    const titleEl = element.querySelector('.toast-title');
    const messageEl = element.querySelector('.toast-message');
    const iconEl = element.querySelector('.toast-icon');
    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;
  },

  updateBadge(element, count) {
    const badge = element.querySelector('.toast-badge');
    if (!badge) return;

    if (count <= 1) {
      badge.style.display = 'none';
      badge.textContent = '';
      badge.classList.remove('weasel', 'bump');
      badge.removeAttribute('title');
      return;
    }

    badge.style.display = 'block';
    if (count <= 99) {
      badge.textContent = `×${count}`;
      badge.classList.remove('weasel');
      badge.removeAttribute('title');
    } else {
      badge.textContent = WEASEL_BADGE;
      badge.classList.add('weasel');
      badge.title = "You've been notified a lot.";
    }

    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
  },

  resetTimer(key, autoDismiss) {
    const entry = this.active[key];
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => this.dismiss(key), autoDismiss);
  },

  dismiss(key) {
    const entry = this.active[key];
    if (!entry) return;
    clearTimeout(entry.timer);
    entry.element.classList.add('toast-out');
    setTimeout(() => {
      entry.element.remove();
      delete this.active[key];
    }, 200);
  }
};

export function toast(options) {
  ToastManager.fire(options);
}

export { ToastManager };
