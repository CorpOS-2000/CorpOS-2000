/* global corpStudio */

function el(id) {
  return document.getElementById(id);
}

function log(line) {
  const d = el('dash-log');
  if (d) d.textContent += line + '\n';
}

async function refreshDashboard() {
  const snap = await corpStudio.readRegistry();
  const npcs = snap.npcs || [];
  const companies = snap.companies || [];
  const pages = snap.pages || [];
  const shops = snap.shops || [];
  const ads = snap.ads || {};
  const g = snap.government || {};
  const tax = g.taxSystem || {};

  const byRole = {};
  for (const n of npcs) {
    const r = n.role || '?';
    byRole[r] = (byRole[r] || 0) + 1;
  }
  const byAvail = {};
  for (const n of npcs) {
    const a = n.contactAvailability || '?';
    byAvail[a] = (byAvail[a] || 0) + 1;
  }
  const byOwner = {};
  const byInd = {};
  for (const c of companies) {
    byOwner[c.ownerType || '?'] = (byOwner[c.ownerType || '?'] || 0) + 1;
    if (c.industry) byInd[c.industry] = (byInd[c.industry] || 0) + 1;
  }
  const byCat = {};
  for (const p of pages) {
    const c = p.category || '?';
    byCat[c] = (byCat[c] || 0) + 1;
  }

  let adCount = 0;
  let adByFmt = {};
  const adArr = Array.isArray(ads?.slots) ? ads.slots : Array.isArray(ads?.ads) ? ads.ads : [];
  adCount = adArr.length;
  for (const s of adArr) {
    const f = s.format || s.type || 'default';
    adByFmt[f] = (adByFmt[f] || 0) + 1;
  }

  el('dash-out').innerHTML = `
    <div class="ca-fieldset" style="border-style:solid;">
      <b>NPCs:</b> ${npcs.length} &nbsp; By role: ${JSON.stringify(byRole)} &nbsp; By availability: ${JSON.stringify(byAvail)}
    </div>
    <div class="ca-fieldset" style="border-style:solid;">
      <b>Companies:</b> ${companies.length} &nbsp; By owner: ${JSON.stringify(byOwner)}<br>
      <b>Industries:</b> ${JSON.stringify(byInd)}
    </div>
    <div class="ca-fieldset" style="border-style:solid;">
      <b>Government:</b> corp tax ${((tax.corporateTaxRate || 0) * 100).toFixed(1)}% &nbsp;
      scrutiny ${g.complianceValues?.corposBaseScrutinyLevel ?? '—'}
    </div>
    <div class="ca-fieldset" style="border-style:solid;">
      <b>WorldNet pages (pipeline):</b> ${pages.length} &nbsp; ${JSON.stringify(byCat)}
    </div>
    <div class="ca-fieldset" style="border-style:solid;">
      <b>Ads:</b> ~${adCount} slots ${JSON.stringify(adByFmt)} &nbsp; <b>Shops:</b> ${shops.length}
    </div>
  `;
}

document.querySelectorAll('#st-nav button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#st-nav button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    const id = b.getAttribute('data-panel');
    document.querySelectorAll('.st-panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${id}`));
  });
});

el('btn-refresh')?.addEventListener('click', () => {
  el('dash-log').textContent = '';
  refreshDashboard();
});

el('btn-backup')?.addEventListener('click', async () => {
  try {
    const r = await corpStudio.backupZip();
    log(r.cancelled ? 'Backup cancelled' : `Backup OK (${r.bytes} bytes)`);
  } catch (e) {
    log(String(e.message || e));
  }
});

el('btn-pack')?.addEventListener('click', async () => {
  const s = await corpStudio.getSettings();
  try {
    const r = await corpStudio.buildPack(s.contentPackKey);
    log(`Wrote ${r.path}`);
  } catch (e) {
    log(String(e.message || e));
  }
});

el('set-save')?.addEventListener('click', async () => {
  await corpStudio.setSettings({
    dataDir: el('set-datadir').value.trim(),
    contentPackKey: el('set-packkey').value
  });
  log('Settings saved');
});

el('btn-validate')?.addEventListener('click', async () => {
  const v = await corpStudio.validate();
  const o = el('val-out');
  o.textContent =
    `Errors (${v.errors.length}):\n${v.errors.join('\n') || '—'}\n\nWarnings (${v.warnings.length}):\n${v.warnings.join('\n') || '—'}`;
});

(async function init() {
  const s = await corpStudio.getSettings();
  el('set-datadir').value = s.dataDir || '';
  el('set-packkey').value = s.contentPackKey || '';
  await refreshDashboard();
})();
