/**
 * Form handler for Y2K WorldNet sites.
 * Mounts interactive guest books, registration, contact, and login forms.
 * Integrates with JeeMail (confirmation emails), SMS (notifications),
 * and Toast (feedback) using existing game systems.
 */

import { getSessionState, patchSession } from './sessionState.js';
import { ToastManager } from './toast.js';
import { escapeHtml } from './identity.js';

let rootEl = null;
let gen = 0;
let cleanupFns = [];

export function teardownY2kForms() {
  for (const fn of cleanupFns) { try { fn(); } catch {} }
  cleanupFns = [];
  rootEl = null;
}

export function mountY2kForms(container, pageDef) {
  teardownY2kForms();
  const myGen = ++gen;
  rootEl = container;
  if (!container || !pageDef) return;

  const siteId = pageDef.pageId || 'unknown';
  const siteName = pageDef.siteName || pageDef.title || 'Site';

  bindGuestbooks(container, siteId, siteName, myGen);
  bindRegistrationForms(container, siteId, siteName, myGen);
  bindContactForms(container, siteId, siteName, myGen);
  bindStubActions(container, myGen);
}

function bindGuestbooks(container, siteId, siteName, myGen) {
  const gbs = container.querySelectorAll('[data-y2k-form="guestbook"]');
  for (const gb of gbs) {
    const submitBtn = gb.querySelector('.y2k-gb-submit');
    if (!submitBtn) continue;

    const handler = () => {
      if (gen !== myGen) return;
      const nameInput = gb.querySelector('.y2k-gb-name');
      const msgInput = gb.querySelector('.y2k-gb-msg');
      const name = (nameInput?.value || '').trim();
      const message = (msgInput?.value || '').trim();
      if (!name || !message) {
        ToastManager.fire({ key: 'y2k-gb-err', title: siteName, message: 'Please fill in all fields.', icon: '!' });
        return;
      }

      const wahooUser = getSessionState().wahoo?.currentUser;
      const displayName = wahooUser || name;
      const now = new Date();
      const dateStr = `${now.getMonth() + 1}/${now.getDate()}/2000`;

      patchSession(s => {
        if (!s.y2kGuestbooks) s.y2kGuestbooks = {};
        if (!s.y2kGuestbooks[siteId]) s.y2kGuestbooks[siteId] = [];
        s.y2kGuestbooks[siteId].push({ name: displayName, message, date: dateStr });
      });

      if (nameInput) nameInput.value = '';
      if (msgInput) msgInput.value = '';

      const entriesTable = gb.querySelector('table');
      if (entriesTable) {
        const lastRow = entriesTable.querySelector('tr:last-child');
        const newRow = document.createElement('tr');
        const count = gb.querySelectorAll('tr').length;
        newRow.setAttribute('bgcolor', count % 2 ? '#f0f0ff' : '#ffffff');
        newRow.innerHTML = `<td><font size="2"><b>${escapeHtml(displayName)}</b> <font color="#888">(${escapeHtml(dateStr)})</font><br>${escapeHtml(message)}</font></td>`;
        if (lastRow?.querySelector('.y2k-gb-submit')) {
          entriesTable.querySelector('tbody, table')?.insertBefore(newRow, lastRow);
        } else {
          entriesTable.querySelector('tbody, table')?.appendChild(newRow);
        }
      }

      ToastManager.fire({ key: 'y2k-gb-ok', title: siteName, message: 'Guest book entry posted!', icon: '\u270D' });
    };

    submitBtn.addEventListener('click', handler);
    cleanupFns.push(() => submitBtn.removeEventListener('click', handler));
  }
}

function bindRegistrationForms(container, siteId, siteName, myGen) {
  const forms = container.querySelectorAll('[data-y2k-form="register"]');
  for (const form of forms) {
    const submitBtn = form.querySelector('.y2k-reg-submit');
    if (!submitBtn) continue;

    const handler = () => {
      if (gen !== myGen) return;
      const userInput = form.querySelector('.y2k-reg-user');
      const emailInput = form.querySelector('.y2k-reg-email');
      const username = (userInput?.value || '').trim();
      const email = (emailInput?.value || '').trim();
      if (!username || !email) {
        ToastManager.fire({ key: 'y2k-reg-err', title: siteName, message: 'Please fill in all fields.', icon: '!' });
        return;
      }

      patchSession(s => {
        if (!s.y2kRegistrations) s.y2kRegistrations = {};
        s.y2kRegistrations[siteId] = { username, email, ts: Date.now() };

        const jeemailUser = s.jeemail?.currentUser;
        if (jeemailUser && s.jeemail?.accounts?.[jeemailUser]) {
          const inbox = s.jeemail.accounts[jeemailUser].inbox;
          if (Array.isArray(inbox)) {
            inbox.unshift({
              id: `y2k-reg-${siteId}-${Date.now()}`,
              from: `noreply@${siteName.toLowerCase().replace(/[^a-z0-9]/g, '')}.net`,
              to: jeemailUser,
              subject: `Welcome to ${siteName}!`,
              body: `Hello ${username},\n\nThank you for registering at ${siteName}. Your account has been created successfully.\n\nUsername: ${username}\n\nPlease keep this email for your records.\n\nBest regards,\nThe ${siteName} Team`,
              date: new Date().toISOString(),
              read: false
            });
          }
        }
      });

      if (userInput) userInput.value = '';
      if (emailInput) emailInput.value = '';
      const passInput = form.querySelector('.y2k-reg-pass');
      if (passInput) passInput.value = '';

      ToastManager.fire({ key: 'y2k-reg-ok', title: siteName, message: 'Registration complete! Check your JeeMail for confirmation.', icon: '\u2709' });
    };

    submitBtn.addEventListener('click', handler);
    cleanupFns.push(() => submitBtn.removeEventListener('click', handler));
  }
}

function bindContactForms(container, siteId, siteName, myGen) {
  const forms = container.querySelectorAll('[data-y2k-form="contact"]');
  for (const form of forms) {
    const submitBtn = form.querySelector('.y2k-contact-submit');
    if (!submitBtn) continue;

    const handler = () => {
      if (gen !== myGen) return;
      const nameInput = form.querySelector('.y2k-contact-name');
      const subjInput = form.querySelector('.y2k-contact-subj');
      const msgInput = form.querySelector('.y2k-contact-msg');
      const name = (nameInput?.value || '').trim();
      const subject = (subjInput?.value || '').trim();
      const message = (msgInput?.value || '').trim();
      if (!name || !message) {
        ToastManager.fire({ key: 'y2k-ct-err', title: siteName, message: 'Please fill in your name and message.', icon: '!' });
        return;
      }

      patchSession(s => {
        const jeemailUser = s.jeemail?.currentUser;
        if (jeemailUser && s.jeemail?.accounts?.[jeemailUser]) {
          const inbox = s.jeemail.accounts[jeemailUser].inbox;
          if (Array.isArray(inbox)) {
            inbox.unshift({
              id: `y2k-contact-${siteId}-${Date.now()}`,
              from: `webmaster@${siteName.toLowerCase().replace(/[^a-z0-9]/g, '')}.net`,
              to: jeemailUser,
              subject: `Re: ${subject || 'Your message'}`,
              body: `Dear ${name},\n\nThank you for contacting ${siteName}. We have received your message and will respond within 3-5 business days.\n\nOriginal message:\n${message}\n\nBest regards,\n${siteName} Webmaster`,
              date: new Date().toISOString(),
              read: false
            });
          }
        }
      });

      if (nameInput) nameInput.value = '';
      if (subjInput) subjInput.value = '';
      if (msgInput) msgInput.value = '';

      ToastManager.fire({ key: 'y2k-ct-ok', title: siteName, message: 'Message sent! You may receive a response via JeeMail.', icon: '\u2709' });
    };

    submitBtn.addEventListener('click', handler);
    cleanupFns.push(() => submitBtn.removeEventListener('click', handler));
  }
}

function bindStubActions(container, myGen) {
  const handler = (e) => {
    if (gen !== myGen) return;
    const btn = e.target.closest('[data-action="y2k-stub"]');
    if (!btn || !container.contains(btn)) return;
    e.preventDefault();
    ToastManager.fire({ key: 'y2k-stub', title: 'WorldNet', message: 'This feature is not yet available.', icon: '\u26A0' });
  };
  container.addEventListener('click', handler);
  cleanupFns.push(() => container.removeEventListener('click', handler));
}
