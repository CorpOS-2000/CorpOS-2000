/**
 * Unified WorldNet `data-wn-action` form handlers (Y2K site expansion).
 */
import { getState, patchState } from './gameState.js';
import { escapeHtml } from './identity.js';
import { toast } from './toast.js';
import { recordHashtagEvent, recordPurchase } from './market-dynamics.js';
import { WORLDNET_100_TITLES } from './worldnet-sites-registry.js';

const ACT_PATRICIA = 'ACT-WNET-PATRICIA-DELGADO';

/**
 * @param {string} action
 * @param {HTMLFormElement} form
 * @param {ParentNode} _root
 * @returns {boolean} handled
 */
export function dispatchWorldNetFormAction(action, form, _root) {
  if (!action || !form) return false;
  const pageKey = form.getAttribute('data-wn-page-key') || '';
  const title = WORLDNET_100_TITLES[pageKey] || pageKey;

  if (action === 'guestbook_submit') {
    const name = String(form.querySelector('input[name="name"],input[name="n"]')?.value || '').trim() || 'Guest';
    const message = String(form.querySelector('textarea[name="message"],input[name="m"]')?.value || '').trim();
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'guestbook', at: Date.now(), name, message });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-40);
      return st;
    });
    if (pageKey === 'patricias_garden') {
      try {
        window.AXIS?.discover?.(ACT_PATRICIA, {
          source: 'worldnet',
          note: `Garden guestbook signed (${name}). Neighborhood intel route unlocked.`
        });
      } catch {
        /* ignore */
      }
    }
    toast({ title: 'Guestbook', message: `${title}: thanks for signing.`, icon: '📝', autoDismiss: 4000 });
    try {
      window.wnetReload?.();
    } catch {
      /* ignore */
    }
    return true;
  }

  if (action === 'petition_sign') {
    const row = {
      at: new Date().toISOString(),
      name: form.querySelector('input[name="nm"],input[name="name"]')?.value || '',
      ssn: form.querySelector('input[name="ssn"]')?.value || '',
      addr: form.querySelector('input[name="addr"]')?.value || '',
      phone: form.querySelector('input[name="ph"],input[name="phone"]')?.value || '',
      email: form.querySelector('input[name="em"],input[name="email"]')?.value || '',
      employer: form.querySelector('input[name="emp"]')?.value || '',
      income: form.querySelector('input[name="inc"]')?.value || '',
      cookiesPerYear: form.querySelector('input[name="cpy"]')?.value || '',
      cookieType: form.querySelector('input[name="typ"]')?.value || '',
      pledge: form.querySelector('input[name="pledge"]')?.value || ''
    };
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      st.worldnet.petitions = st.worldnet.petitions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'petition', ...row });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-50);
      st.worldnet.petitions[pageKey] = (st.worldnet.petitions[pageKey] || 0) + 1;
      if (pageKey === 'savethecookies') {
        st.cookiePetitionData = st.cookiePetitionData || [];
        st.cookiePetitionData.push(row);
      }
      return st;
    });
    toast({ title: 'Petition', message: `Recorded for ${escapeHtml(title)}.`, icon: '📋', autoDismiss: 4500 });
    return true;
  }

  if (action === 'newsletter_subscribe') {
    const email = String(form.querySelector('input[name="email"],input[name="em"]')?.value || '').trim();
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'newsletter', at: Date.now(), email });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-30);
      return st;
    });
    toast({ title: 'Newsletter', message: email ? `Subscribed: ${email}` : 'Subscribed.', icon: '📬', autoDismiss: 3500 });
    return true;
  }

  if (action === 'poll_vote') {
    const vote = String(form.querySelector('input[name="vote"]:checked')?.value || form.querySelector('select[name="vote"]')?.value || '').trim();
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.pollVotes = st.worldnet.pollVotes || {};
      st.worldnet.pollVotes[pageKey] = vote;
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'poll', at: Date.now(), vote });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-20);
      return st;
    });
    toast({ title: 'Poll', message: vote ? `Vote recorded: ${vote}` : 'Vote recorded.', icon: '📊', autoDismiss: 3000 });
    return true;
  }

  if (action === 'order_submit') {
    const item = String(form.querySelector('input[name="item"],select[name="item"]')?.value || '').trim();
    const qty = Number(form.querySelector('input[name="qty"]')?.value || 1) || 1;
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'order', at: Date.now(), item, qty });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-30);
      return st;
    });
    recordHashtagEvent('worldnet_order', 'mention');
    toast({
      title: 'Order received',
      message: `Your ${qty}× ${item || 'item'} request was faxed to a dot-matrix printer.`,
      icon: '🛒',
      autoDismiss: 4000
    });
    return true;
  }

  if (action === 'contact_submit') {
    const name = String(form.querySelector('input[name="name"]')?.value || '').trim();
    const msg = String(form.querySelector('textarea[name="message"]')?.value || '').trim();
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'contact', at: Date.now(), name, message: msg });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-40);
      return st;
    });
    toast({ title: 'Message sent', message: 'A volunteer will respond within 6–8 WorldNet weeks.', icon: '✉️', autoDismiss: 4000 });
    return true;
  }

  if (action === 'donate') {
    const amt = Number(form.querySelector('input[name="amt"],input[name="amount"]')?.value || 5) || 5;
    patchState((s) => {
      const primary = (s.accounts || []).find((a) => a.isPrimary) || (s.accounts || []).find((a) => a.id === 'fncb');
      if (primary) primary.balance = Math.max(0, Math.round((primary.balance - Math.max(1, amt)) * 100) / 100);
      s.worldnet = s.worldnet || {};
      s.worldnet.formSubmissions = s.worldnet.formSubmissions || {};
      const arr = s.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'donate', at: Date.now(), amount: amt });
      s.worldnet.formSubmissions[pageKey] = arr.slice(-20);
      return s;
    });
    recordPurchase('donation', getState().sim?.elapsedMs || 0);
    toast({ title: 'Thank you', message: `Donation of $${amt.toFixed(2)} processed.`, icon: '💸', autoDismiss: 3500 });
    return true;
  }

  if (action === 'complaint_submit') {
    const subj = String(form.querySelector('input[name="subject"]')?.value || '').trim();
    const body = String(form.querySelector('textarea[name="body"]')?.value || '').trim();
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.complaintLog = st.worldnet.complaintLog || [];
      st.worldnet.complaintLog.push({ pageKey, at: Date.now(), subject: subj, body });
      if (st.worldnet.complaintLog.length > 80) st.worldnet.complaintLog = st.worldnet.complaintLog.slice(-80);
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'complaint', at: Date.now(), subject: subj, body });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-30);
      return st;
    });
    toast({
      title: 'Complaint logged',
      message: 'Ticket #Y2K-' + String(Math.floor(1000 + Math.random() * 8999)) + ' — expect passive-aggressive delay.',
      icon: '📛',
      autoDismiss: 5000
    });
    return true;
  }

  if (action === 'typing_test_submit') {
    const wpm = Number(form.querySelector('input[name="wpm"]')?.value || 0) || 0;
    patchState((st) => {
      st.worldnet = st.worldnet || {};
      st.worldnet.formSubmissions = st.worldnet.formSubmissions || {};
      const arr = st.worldnet.formSubmissions[pageKey] || [];
      arr.push({ type: 'typing', at: Date.now(), wpm });
      st.worldnet.formSubmissions[pageKey] = arr.slice(-15);
      return st;
    });
    const grade = wpm >= 85 ? 'Regional Legend' : wpm >= 55 ? 'Office Adequate' : 'Needs Gelatin Keyboard';
    toast({ title: 'Typing test', message: `${wpm} WPM — "${grade}"`, icon: '⌨️', autoDismiss: 4500 });
    return true;
  }

  return false;
}
