import {
  exposureLabel,
  formatMoney,
  getNetWorth,
  getState,
  notorietyLabel
} from './gameState.js';
import { formatGameDateTime, getCurrentGameDate } from './clock.js';

export function renderProfilesFromState() {
  const st = getState();
  const actor = st.player?.actor_id && window.ActorDB?.get
    ? window.ActorDB.get(st.player.actor_id, 'government')
    : null;
  const p = actor
    ? {
        ...st.player,
        displayName: actor.full_legal_name || st.player.displayName,
        age: actor.age ?? st.player.age,
        dob: actor.dob || st.player.dob,
        email: actor.emails?.[0] || st.player.email,
        phone: actor.phone_numbers?.[0] || st.player.phone,
        address: actor.home_address
          ? `${actor.home_address.street}, ${actor.home_address.city} ${actor.home_address.state} ${actor.home_address.zip}`
          : st.player.address,
        ssnFull: actor.ssn || st.player.ssnFull,
        ssnSuffix: String(actor.ssn || st.player.ssnFull || '').slice(-4)
      }
    : st.player;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  setText('prof-name', p.displayName);
  setText('prof-legal-name', p.displayName);
  setText('prof-age-line', `Age: ${p.age}  |  DOB: ${p.dob}`);
  const ssn = `XXX-XX-${p.ssnSuffix}`;
  setText('prof-ssn', ssn);
  setText('prof-ssn-foot', ssn);
  setText('prof-address', p.address);
  setText('prof-email', p.email);
  setText('prof-phone', p.phone);
  setText('prof-vehicle', p.vehicle);
  setText('prof-residence', p.residence);

  const bankProfMap = [
    ['fncb', 'prof-bank-fncb'],
    ['meridian', 'prof-bank-meridian'],
    ['harbor', 'prof-bank-harbor'],
    ['pacific', 'prof-bank-pacific'],
    ['darkweb', 'prof-bank-darkweb'],
    ['davidmitchell', 'prof-bank-dmb']
  ];
  const hintEl = document.getElementById('prof-registry-hint');
  if (hintEl) {
    const yours = `Your record: ${p.displayName} — ${p.ssnFull || `XXX-XX-${p.ssnSuffix || '????'}`}`;
    const npcs = (st.registry?.citizens || []).filter((c) => c.kind === 'npc');
    const npcLine = npcs.length
      ? npcs.map((c) => `${c.displayName} — ${c.ssnFull}`).join(' · ')
      : '';
    hintEl.textContent = npcLine ? `${yours} | ${npcLine}` : yours;
  }

  for (const [aid, elid] of bankProfMap) {
    const acc = st.accounts.find((a) => a.id === aid);
    const el = document.getElementById(elid);
    if (!el) continue;
    if (acc) {
      const loan = acc.loanBalance || 0;
      const cash = acc.balance || 0;
      const suffix = loan > 0 ? ` / loan ${formatMoney(loan)}` : '';
      el.textContent = `${formatMoney(cash)}${suffix}`;
      el.style.color = '#006600';
    } else {
      el.textContent = 'No account';
      el.style.color = '#888';
    }
  }

  const wtitle = document.querySelector('#win-personal .wtt');
  if (wtitle) wtitle.textContent = `Personal Profile — ${p.displayName}`;

  const co = st.companies[0];
  if (co) {
    setText('corp-c1-name', co.name);
    setText('corp-c1-reg', co.registered || '');
    setText('corp-c1-industry', co.industry);
    setText('corp-c1-tier', co.tier);
    setText(
    'corp-c1-employees',
    co.employees === 1 ? '1 (Sole Operator)' : String(co.employees)
  );
    setText('corp-c1-revenue', formatMoney(co.weeklyRevenue));
    const n = Math.min(200, Math.max(0, co.notoriety));
    const e = Math.min(100, Math.max(0, co.exposure));
    setText('corp-notoriety-label', `${n}% — ${notorietyLabel(n)}`);
    setText('corp-exposure-label', `${e}% — ${exposureLabel(e)}`);
    const nf = document.getElementById('corp-notoriety-fill');
    const ef = document.getElementById('corp-exposure-fill');
    if (nf) nf.style.width = `${(n / 200) * 100}%`;
    if (ef) ef.style.width = `${e}%`;
    const jr = co.judicialEntries || 0;
    setText(
      'corp-judicial',
      jr === 0 ? 'Clean — 0 entries' : `${jr} entr${jr === 1 ? 'y' : 'ies'} on file`
    );
  } else {
    setText('corp-c1-name', 'No company registered');
    setText('corp-c1-reg', '—');
    setText('corp-c1-industry', '—');
    setText('corp-c1-tier', '—');
    setText('corp-c1-employees', '—');
    setText('corp-c1-revenue', '$0.00');
    setText('corp-notoriety-label', '0% — Unknown');
    setText('corp-exposure-label', '0% — Invisible');
    const nf = document.getElementById('corp-notoriety-fill');
    const ef = document.getElementById('corp-exposure-fill');
    if (nf) nf.style.width = '0%';
    if (ef) ef.style.width = '0%';
    setText('corp-judicial', 'Clean — 0 entries');
  }

  const activeCos = st.companies.filter(Boolean).length;
  setText('corp-slot-count', `Companies: ${activeCos}/3`);
  setText('corp-net-worth', `Net Worth: ${formatMoney(getNetWorth(st))}`);
}

let _lastClockText = '';
export function updateClockDisplay() {
  const clk = document.getElementById('clk');
  if (!clk) return;
  const text = formatGameDateTime(getCurrentGameDate());
  if (text === _lastClockText) return;
  _lastClockText = text;
  clk.textContent = text;
}

export function syncSpeedButtons() {
  const speed = getState().sim.speed;
  document.querySelectorAll('#speed-controls [data-speed]').forEach((btn) => {
    const v = Number(btn.getAttribute('data-speed'));
    btn.classList.toggle('active-speed', v === speed);
  });
  if (typeof document !== 'undefined' && document.body) {
    document.body.dataset.corposSimSpeed = String(speed);
  }
}
