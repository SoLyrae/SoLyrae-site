/* SoLyrae Beacon page. Loaded after app.js (shares its helpers). Data: data/beacon.json, built by tools/build_beacon.py */
const BC_LEVELS = [['critical', 'Critical'], ['high', 'High'], ['watch', 'Watch'], ['info', 'Info']];
const BC_GROUPS = [['Validator clients', ['agave', 'jito', 'firedancer']], ['Built on', ['rust']], ['Operating system', ['kernel', 'ubuntu', 'debian', 'systemd']], ['Network and tools', ['openssl', 'openssh', 'docker']]];
const BC_BASE = 'https://www.solyrae.com';
let BC = null;
const bst = { q: '', levels: new Set(), comps: new Set(), shown: 18, pick: new Set() };

const bcRel = iso => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 2 ? 'just now' : m < 90 ? `${m} minutes ago` : m < 2880 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`;
};
const bcDate = i => i.dateLabel && !i.published ? i.dateLabel : (i.published ? new Date(i.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (i.dateLabel || ''));

function bcStatus() {
  const S = beaconSummary(BC), [label, color] = BEACON_STATUS[S.status];
  const c = S.counts;
  const sub = S.status === 'clear' ? 'No open alerts in the last 30 days.'
    : S.status === 'action' ? `${c.critical} critical alert${c.critical === 1 ? '' : 's'} in the last 30 days. Check them below.`
    : S.status === 'attention' ? `${c.high} high alert${c.high === 1 ? '' : 's'} to review.` : 'Nothing urgent. A few things to plan for.';
  const age = (Date.now() - Date.parse(BC.generatedAt)) / 3600000;
  $('#bc-status').innerHTML = `<div class="bc-state" style="--sc:${color}"><span class="bc-dot"></span><div><h2>${label}</h2><p>${sub}</p><p>Last check ${bcRel(BC.generatedAt)}.</p></div></div>
    <div class="bc-stats">${BC_LEVELS.map(([k, l]) => `<div class="bc-stat lv-${k}"><div class="n">${c[k]}</div><div class="l">${l}</div></div>`).join('')}</div>`
    + (age > 12 ? `<div class="bc-warn" style="grid-column:1/-1;margin:0;border-radius:0">The data was last refreshed ${bcRel(BC.generatedAt)}. New alerts may not be shown yet.</div>` : '');
}

function bcVersions() {
  const v = BC.versions || {}, card = (k, t, d, u) => `<${u ? 'a href="' + esc(u) + '" target="_blank" rel="noopener"' : 'div'}><div class="k">${t}</div><div class="v">${esc(k)}</div><div class="d">${d}</div></${u ? 'a' : 'div'}>`;
  const when = x => x ? new Date(x).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  $('#bc-ver').innerHTML =
    (v.agave ? card(v.agave.version, 'Agave stable', 'Released ' + when(v.agave.published), v.agave.url) : '')
    + (v.jito ? card(v.jito.version, 'Jito mainnet', 'Released ' + when(v.jito.published), v.jito.url) : '')
    + (v.firedancer ? card(v.firedancer.version, 'Firedancer mainnet', 'Released ' + when(v.firedancer.published), v.firedancer.url) : '')
    + (v.sfdpMinAgave ? card('v' + v.sfdpMinAgave, 'Minimum for the SFDP', 'Agave, mainnet · official criteria', 'https://solana.org/delegation-criteria') : '');
}

// open alerts first (dependency of the latest release, or published in the last 30 days), then by level and date
const bcActive = i => i.type === 'dependency' || (i.published && Date.now() - Date.parse(i.published) <= 30 * 86400000);
function bcSorted() {
  const L = k => BC_LEVELS.findIndex(x => x[0] === k);
  return [...BC.items].sort((a, b) => (bcActive(b) - bcActive(a)) || (L(a.level) - L(b.level)) || String(b.published || '').localeCompare(String(a.published || '')));
}
function bcFiltered() {
  const q = bst.q.trim().toLowerCase();
  return bcSorted().filter(i => (!bst.levels.size || bst.levels.has(i.level)) && (!bst.comps.size || i.components.some(c => bst.comps.has(c)))
    && (!q || (i.title + ' ' + i.id + ' ' + (i.cves || []).join(' ') + ' ' + i.affects + ' ' + i.summary).toLowerCase().includes(q)));
}

function bcCard(i) {
  const flags = [i.kev ? '<span class="bc-flag hot">Exploited in the wild</span>' : '', i.epss != null && i.epss >= 0.01 ? `<span class="bc-flag" title="Chance of exploitation in the next 30 days">EPSS ${Math.round(i.epss * 100)}%</span>` : '',
    i.cvss ? `<span class="bc-flag">CVSS ${i.cvss}</span>` : '',
    i.assessment ? `<span class="bc-flag" title="The client team has reviewed this advisory">Reviewed by ${esc(i.assessment.by)}</span>` : ''].join('');
  const ids = [i.id, ...(i.cves || []).filter(c => c !== i.id)].slice(0, 4).map(esc).join(' &middot; ');
  const rows = [['Affects', i.affects], ['Fix', i.fixed], ['What to do', i.action]].filter(r => r[1]).map(r => `<b>${r[0]}</b><span>${esc(r[1])}</span>`).join('');
  return `<article class="bc-card lv-${i.level}"><div class="bc-top"><span class="bc-badge">${i.level}</span>${flags}<span class="bc-date">${esc(bcDate(i))}</span></div>
    <h3>${esc(i.title)}</h3><p class="s">${esc(i.summary)}</p>
    <div class="bc-comp">${i.components.map(c => `<span>${esc(BC.components[c] || c)}</span>`).join('')}</div>
    <div class="bc-rows">${rows}</div>
    <div class="bc-foot"><a href="${esc(i.source.url)}" target="_blank" rel="noopener">Source: ${esc(i.source.name)}</a>${i.assessment ? `<a href="${esc(i.assessment.url)}" target="_blank" rel="noopener">${esc(i.assessment.by)} assessment</a>` : ''}<span>${ids}</span></div></article>`;
}

function bcRender() {
  const list = bcFiltered();
  $('#bc-count').textContent = `Showing ${Math.min(bst.shown, list.length)} of ${list.length} alerts`;
  $('#bc-list').innerHTML = list.length ? list.slice(0, bst.shown).map(bcCard).join('') : '<p class="note">No alerts match these filters.</p>';
  const more = $('#bc-more'); more.hidden = list.length <= bst.shown; more.style.display = more.hidden ? 'none' : ''; // .btn sets display, so [hidden] alone is not enough
}

function bcControls() {
  $('#bc-levels').innerHTML = BC_LEVELS.map(([k, l]) => `<button class="bc-chip lv-${k}" type="button" data-lv="${k}" aria-pressed="false"><i></i>${l}</button>`).join('');
  $('#bc-comps').innerHTML = Object.entries(BC.components).map(([k, l]) => `<button class="bc-chip" type="button" data-c="${k}" aria-pressed="false">${esc(l)}</button>`).join('');
  $('#bc-levels').addEventListener('click', e => { const b = e.target.closest('[data-lv]'); if (!b) return; const k = b.dataset.lv; bst.levels.has(k) ? bst.levels.delete(k) : bst.levels.add(k); b.setAttribute('aria-pressed', bst.levels.has(k)); bst.shown = 18; bcRender(); });
  $('#bc-comps').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; const k = b.dataset.c; bst.comps.has(k) ? bst.comps.delete(k) : bst.comps.add(k); b.setAttribute('aria-pressed', bst.comps.has(k)); bst.shown = 18; bcRender(); });
  $('#bc-q').addEventListener('input', e => { bst.q = e.target.value; bst.shown = 18; bcRender(); });
  $('#bc-more').addEventListener('click', () => { bst.shown += 18; bcRender(); });
}

function bcFollow() {
  $('#bc-pick').innerHTML = BC_GROUPS.map(([g, ks]) => `<div class="bc-grp"><div class="gl">${g}</div><div class="bc-chips" style="margin-top:0">${ks.filter(k => BC.components[k]).map(k => `<button class="bc-chip" type="button" data-p="${k}" aria-pressed="false">${esc(BC.components[k])}</button>`).join('')}</div></div>`).join('');
  $('#bc-pick').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; const k = b.dataset.p; bst.pick.has(k) ? bst.pick.delete(k) : bst.pick.add(k); b.setAttribute('aria-pressed', bst.pick.has(k)); bcFeeds(); });
  const row = (label, url) => `<div class="bc-feed"><span>${esc(label)}</span><code title="${esc(url)}">${esc(url.replace('https://', ''))}</code><button class="copy" data-copy="${esc(url)}">Copy</button></div>`;
  $('#bc-allfeeds').innerHTML = row('Atom', BC_BASE + '/feeds/beacon.atom') + row('JSON Feed', BC_BASE + '/feeds/beacon.json');
  bcFeeds();
  $('#bc-sub').addEventListener('submit', bcSubscribe);
}
async function bcSubscribe(e) {
  e.preventDefault();
  const msg = $('#bc-sub-msg'), btn = $('#bc-sub-btn'), email = $('#bc-mail').value.trim();
  const say = (t, bad) => { msg.textContent = t; msg.style.color = bad ? 'var(--bad)' : 'var(--ok)'; };
  if (!bst.pick.size) return say('Pick one or more components in step 1 first.', true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return say('Please enter a valid email address.', true);
  btn.disabled = true; say('Sending…');
  try {
    const r = await fetch('/api/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, components: [...bst.pick], website: $('#bc-hp').value }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) { say('Almost done. Check your inbox and confirm your subscription.'); $('#bc-mail').value = ''; }
    else say(j.error || 'Something went wrong. Please try again later.', true);
  } catch (err) { say('Something went wrong. Please try again later.', true); }
  btn.disabled = false;
}
function bcFeeds() {
  const row = (k) => { const url = `${BC_BASE}/feeds/beacon-${k}.atom`; return `<div class="bc-feed"><span>${esc(BC.components[k])}</span><code title="${esc(url)}">${esc(url.replace('https://', ''))}</code><button class="copy" data-copy="${esc(url)}">Copy</button></div>`; };
  $('#bc-feeds').innerHTML = bst.pick.size ? [...bst.pick].map(row).join('') : '<p class="note">Pick one or more components on the left.</p>';
}

function bcSources() {
  $('#bc-src').innerHTML = (BC.sources || []).map(s => `<li><i class="${s.ok ? '' : 'bad'}"></i><span><a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:var(--accent)">${esc(s.name)}</a> &middot; ${s.count} item${s.count === 1 ? '' : 's'}${s.ok ? '' : ' (unreachable at the last check)'}</span></li>`).join('');
}

async function pageBeacon() {
  try {
    const r = await fetch('data/beacon.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    BC = await r.json();
  } catch (e) {
    console.warn(e);
    $('#bc-status').innerHTML = '<div class="bc-state"><span class="bc-dot" style="--sc:var(--bad)"></span><div><h2>Bulletin unavailable</h2><p>The alerts could not be loaded. Please try again in a moment.</p></div></div>';
    $('#bc-list').innerHTML = '<p class="note">No data available right now.</p>';
    return;
  }
  bcStatus(); bcVersions(); bcControls(); bcRender(); bcFollow(); bcSources();
  autoRefresh(10 * 60 * 1000, async () => {
    const r = await fetch('data/beacon.json', { cache: 'no-cache' }); if (!r.ok) return;
    const j = await r.json(); if (j.generatedAt === BC.generatedAt) return;
    BC = j; bcStatus(); bcVersions(); bcRender(); bcSources();
  });
}

document.addEventListener('DOMContentLoaded', () => { if (document.body.dataset.page === 'beacon') pageBeacon(); });
