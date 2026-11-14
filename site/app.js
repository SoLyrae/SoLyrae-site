// SoLyrae site. All data comes live from public APIs (Stakewiz for validators, Vortex for epoch history).
// Nothing is typed by hand. If an API fails the page says so; it never shows invented numbers.
const VOTE = 'DPhzpiNGU9C6576uLsNSHmdi2AxwxpjMsRdh2iVC4TPh';
const IDENTITY = '7Nu9ckgtjobZ3MkbadGFKEvRymYuah9HmcxiUJKMM9NB';
const SW = 'https://api.stakewiz.com';
const VX = 'https://api.vx.tools';
const ROOT = document.body.dataset.root || '';

const POSTS = [
  { slug: 'how-to-stake-with-solyrae', title: 'How to stake SOL with SoLyrae, from creating a wallet to your first rewards', date: '2026-11-13', tag: 'Guide',
    excerpt: 'Create a wallet, get SOL, delegate to SoLyrae and see what to expect. A step-by-step guide for first-time stakers.' },
  { slug: 'alpenglow-and-delegators', title: 'Alpenglow: what Solana’s new consensus means for delegators', date: '2026-11-13', tag: 'Network',
    excerpt: 'Faster finality, shorter epochs and a new way of paying for votes. What changes for people who stake SOL, and what may come next.' },
  { slug: 'risks-of-staking-sol', title: 'The risks of staking SOL, and how to reduce them', date: '2026-11-13', tag: 'Guide',
    excerpt: 'Price, validator performance, slashing proposals, wallet security and unstaking time: what can go wrong and what you can do about it.' },
  { slug: 'what-is-solana', title: 'What is Solana? A plain-language introduction', date: '2026-11-13', tag: 'Guide',
    excerpt: 'What Solana is, what SOL is for, what validators do and how staking fits in, without jargon.' },
  { slug: 'native-vs-liquid-staking', title: 'Native staking or liquid staking: which one fits you?', date: '2026-11-13', tag: 'Guide',
    excerpt: 'The difference between delegating SOL to a validator and holding a liquid staking token, with the advantages and risks of each.' },
  { slug: 'where-staking-rewards-come-from', title: 'Where staking rewards come from: inflation, MEV and commission', date: '2026-11-13', tag: 'Guide',
    excerpt: 'How inflation and MEV tips become your rewards, what commission does and why yields change.' },
  { slug: 'vote-account-identity-stake-account', title: 'Vote account, identity and stake account: which address is which?', date: '2026-11-13', tag: 'Guide',
    excerpt: 'The addresses you meet when you stake, which one you delegate to, and what stake and withdraw authority mean.' },
  { slug: 'how-validators-earn-money', title: 'How Solana validators earn money, and why it matters to delegators', date: '2026-11-13', tag: 'Guide',
    excerpt: 'What it costs to run a validator, where its income comes from and what that means when you choose one.' },
  { slug: 'solana-foundation-delegation-program', title: 'What is the Solana Foundation Delegation Program?', date: '2026-11-13', tag: 'Network',
    excerpt: 'How the Foundation delegates stake to validators, what they must meet and what it means for people who stake.' },
  { slug: 'how-to-read-validator-numbers', title: 'How to read a Solana validator’s numbers', date: '2026-11-13', tag: 'Guide',
    excerpt: 'Commission, APY, skip rate, vote success, uptime. What each one means and which ones actually change your rewards.' },
  { slug: 'nakamoto-coefficient-solana', title: 'The Nakamoto coefficient: how decentralized is Solana today?', date: '2026-11-13', tag: 'Network',
    excerpt: 'How many validators, hosting providers and countries it takes to hold a third of the stake, and how we calculate it.' },
  { slug: 'staking-sol-step-by-step', title: 'Staking SOL step by step: stake, rewards and unstaking', date: '2026-11-13', tag: 'Guide',
    excerpt: 'What happens to your SOL when you delegate, when rewards arrive and how unstaking works.' }
];

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (n, d = 0) => (n == null || isNaN(n)) ? 'N/A' : Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 2) => (n == null || isNaN(n)) ? 'N/A' : num(n, d) + '%';
const compact = n => n >= 1e6 ? num(n / 1e6, 2) + 'M' : n >= 1e3 ? num(n / 1e3, 1) + 'K' : num(n, 0);
const safeImg = u => (typeof u === 'string' && u.startsWith('https://')) ? u : '';
const clientName = c => ({ AgaveBam: 'Agave + Jito BAM', JitoLabs: 'Jito-Agave', HarmonicAgave: 'Agave + Harmonic', HarmonicFiredancer: 'Firedancer + Harmonic', Firedancer: 'Firedancer', FireBAM: 'Firedancer + BAM', Frankendancer: 'Frankendancer', Agave: 'Agave' }[c] || c || 'Unknown');
const set = (key, html) => $$(`[data-k="${key}"]`).forEach(el => { el.innerHTML = html; el.classList.remove('sk'); });

async function getJSON(url, ms = 12000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
function cacheGet(k, maxAge) { try { const o = JSON.parse(sessionStorage.getItem(k)); if (o && Date.now() - o.t < maxAge) return o.v; } catch {} return null; }
function cacheSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), v })); } catch {} }

/* ---------- data ---------- */
let _vals;
async function getValidators() {
  if (_vals) return _vals;
  let list = cacheGet('sw_vals5', 5 * 60 * 1000);
  if (!list) {
    const raw = await getJSON(SW + '/validators', 25000);
    list = raw.filter(v => v.activated_stake > 0).map(v => ({
      cityShare: v.city_concentration, asnCityShare: v.asncity_concentration, apyStake: v.staking_apy, apyJito: v.jito_apy, jito: !!v.is_jito,
      vote: v.vote_identity, id: v.identity, name: v.name || (v.vote_identity.slice(0, 4) + '…' + v.vote_identity.slice(-4)), named: !!v.name,
      img: v.image || '', stake: v.activated_stake, comm: (v.commission ?? 0) / 100, mev: (v.jito_commission_bps ?? 0) / 100,
      apy: v.total_apy, skip: v.wiz_skip_rate, vote_s: v.vote_success, uptime: v.uptime, client: v.client, version: v.version,
      city: v.ip_city, country: v.ip_country, org: v.ip_org, asn: v.ip_asn, asnShare: v.asn_concentration,
      age: v.first_epoch_distance, delinquent: v.delinquent, site: v.website || '', desc: v.description || '', swRank: v.rank, epoch: v.epoch, updated: v.updated_at
    }));
    cacheSet('sw_vals5', list);
  }
  const total = list.reduce((a, v) => a + v.stake, 0);
  list.sort((a, b) => b.stake - a.stake).forEach((v, i) => { v.rank = i + 1; v.share = 100 * v.stake / total; });
  _vals = { list, total };
  return _vals;
}
/* Beacon (security bulletin): summary used by the Beacon page and by Home. An alert counts as open when it is a dependency of the
   latest client release, or it was published in the last 30 days. */
const BEACON_STATUS = { action: ['Action needed', 'var(--bad)'], attention: ['Needs attention', 'var(--accent)'], watch: ['Keep an eye', 'var(--violet)'], clear: ['All clear', 'var(--ok)'] };
function beaconSummary(D) {
  const now = Date.now(), day = 86400000;
  const active = D.items.filter(i => i.type === 'dependency' || (i.published && now - Date.parse(i.published) <= 30 * day));
  const counts = { critical: 0, high: 0, watch: 0, info: 0 };
  active.forEach(i => counts[i.level]++);
  return { active, counts, status: counts.critical ? 'action' : counts.high ? 'attention' : counts.watch ? 'watch' : 'clear' };
}

/* Reloads the Stakewiz validator list; keeps the previous one if the request fails. */
async function refreshList() {
  const keep = _vals;
  try { sessionStorage.removeItem('sw_vals5'); _vals = null; await getValidators(); return true; }
  catch (e) { _vals = keep; console.warn('refresh failed', e); return false; }
}
/* Runs `fn` every `ms` while the tab is visible, and once when the tab comes back after a longer wait. */
function autoRefresh(ms, fn) {
  let last = Date.now();
  const go = async () => { if (document.hidden) return; last = Date.now(); try { await fn(); } catch (e) { console.warn('refresh failed', e); } };
  setInterval(go, ms);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - last >= ms) go(); });
}
function nakamoto(amounts, total) { const s = [...amounts].sort((a, b) => b - a); let c = 0, n = 0; for (const x of s) { c += x; n++; if (c > total / 3) break; } return n; }
function groupBy(list, total, keyFn) {
  const m = new Map();
  list.forEach(v => { const k = keyFn(v) || 'Unknown'; const g = m.get(k) || { name: k, n: 0, stake: 0 }; g.n++; g.stake += v.stake; m.set(k, g); });
  const arr = [...m.values()].sort((a, b) => b.stake - a.stake); arr.forEach(g => g.share = 100 * g.stake / total); return arr;
}
/* Network concentration (providers, countries, clients, cities).
   The validators and their stake are the Stakewiz list (the same one the Explorer shows). Each validator's hosting provider,
   country, client and data center are looked up by vote account in Vortex (leaderboard of the last completed epoch);
   a validator Vortex does not list is counted as "Unknown". */
let _net;
async function getNet() {
  if (_net) return _net;
  const D = await getValidators();
  let lab = cacheGet('vx_net2', 10 * 60 * 1000);
  if (!lab) {
    const cur = await getJSON(`${VX}/epochs/current`);
    const epoch = cur.epoch - 1;
    const lb = await getJSON(`${VX}/epochs/leaderboard/participation?epoch=${epoch}`, 30000);
    lab = { epoch, rows: lb.records.map(r => [r.voteAddress, r.provider || 'Unknown', r.country || 'Unknown', r.softwareBase || 'Unknown', r.datacenter || 'Unknown']) };
    cacheSet('vx_net2', lab);
  }
  const L2 = new Map(lab.rows.map(r => [r[0], r]));
  const n = { epoch: lab.epoch, recs: D.list.map(v => {
    const l = L2.get(v.vote) || [v.vote, 'Unknown', 'Unknown', 'Unknown', 'Unknown'];
    return { vote: v.vote, name: v.name, stake: v.stake, provider: l[1], country: l[2], client: l[3], city: l[4].replace(/^\d+-/, '') || 'Unknown', dc: l[4] };
  }) };
  const total = n.recs.reduce((a, r) => a + r.stake, 0);
  const byVal = [...n.recs].sort((a, b) => b.stake - a.stake).map(r => ({ name: r.name, n: 1, stake: r.stake, share: 100 * r.stake / total }));
  _net = { epoch: n.epoch, recs: n.recs, total, byVal, byVote: new Map(n.recs.map(r => [r.vote, r])),
    byProv: groupBy(n.recs, total, r => r.provider), byCountry: groupBy(n.recs, total, r => r.country), byClient: groupBy(n.recs, total, r => r.client),
    byCity: groupBy(n.recs, total, r => r.city), byDc: groupBy(n.recs, total, r => r.dc), nakVal: nakamoto(n.recs.map(r => r.stake), total) };
  return _net;
}
async function refreshNet() {
  const keep = _net;
  // rebuilds from the current validator list; the Vortex labels are reused for up to 10 minutes (they only change with the epoch)
  try { _net = null; await getNet(); return true; }
  catch (e) { _net = keep; console.warn('refresh failed', e); return false; }
}
function median(a) { const s = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; }
function netStats(D) {
  const { list, total } = D;
  return {
    n: list.length, total,
    apy: list.reduce((a, v) => a + (v.apy || 0) * v.stake, 0) / total,
    nakVal: nakamoto(list.map(v => v.stake), total),
    byOrg: groupBy(list, total, v => v.org), byCountry: groupBy(list, total, v => v.country), byClient: groupBy(list, total, v => clientName(v.client)),
    medApy: median(list.map(v => v.apy)), medSkip: median(list.map(v => v.skip)), medVote: median(list.map(v => v.vote_s)),
    medComm: median(list.map(v => v.comm)), medMev: median(list.filter(v => v.jito).map(v => v.mev))
  };
}
async function getHistory(limit = 10) {
  let h = cacheGet('vx_hist3', 5 * 60 * 1000);
  if (!h) {
    const [part, prod] = await Promise.all([
      getJSON(`${VX}/epochs/participation?voteKey=${VOTE}&limit=${limit + 3}`),
      getJSON(`${VX}/epochs/production?voteKey=${VOTE}&limit=${limit + 3}&minLeaderSlots=1&sortBy=scoredInclusion`)
    ]);
    const pm = new Map(prod.map(p => [p.epoch, p]));
    h = part.filter(p => p.complete && p.eligibleSlots > 0).map(p => {
      const q = pm.get(p.epoch);
      return { epoch: p.epoch, part: 100 * (p.eligibleSlots - p.missedSlots) / p.eligibleSlots, rank: p.rank != null ? p.rank + 1 : null, fast: p.finalizedCerts > 0 ? 100 * p.finalizedSlots / p.finalizedCerts : null, blocks: q && q.complete ? q.blocks : null, skip: q && q.complete && q.skipRate != null ? 100 * q.skipRate : null };
    }).sort((a, b) => b.epoch - a.epoch).slice(0, limit);
    cacheSet('vx_hist3', h);
  }
  return h;
}

/* ---------- layout ---------- */
function layout() {
  const page = document.body.dataset.page;
  // [label, href, data-page key]. Pages not built yet are left out of the menu on purpose.
  const MENU = [
    ['Home', 'index.html', 'home'],
    ['Validator', [['Performance', 'performance.html', 'performance'], ['Infrastructure', 'infrastructure.html', 'infrastructure'], ['Staking', 'staking.html', 'staking'], ['Rewards', 'rewards.html', 'rewards'], ['Security', 'security.html', 'security']]],
    ['Network', [['Explorer', 'explorer.html', 'explorer'], ['Decentralization', 'decentralization.html', 'decentralization']]],
    ['Beacon', 'beacon.html', 'beacon'],
    ['Tools', [['Rewards calculator', 'calculator.html', 'calculator'], ['Compare validators', 'compare.html', 'compare']]],
    ['Resources', [['Blog', 'blog/index.html', 'blog'], ['FAQ', 'faq.html', 'faq'], ['How we measure', 'methodology.html', 'methodology'], ['Branding', 'branding.html', 'branding']]],
    ['About', [['Our story', 'about.html', 'about'], ['Contact', 'contact.html', 'contact']]]
  ];
  const a = (href, label, key) => `<a href="${ROOT}${href}"${page === key ? ' aria-current="page"' : ''}>${label}</a>`;
  const menuHtml = MENU.map(([label, x, key]) => Array.isArray(x)
    ? `<li class="dd${x.some(i => i[2] === page) ? ' here' : ''}"><button type="button" aria-haspopup="true" aria-expanded="false">${label}<svg viewBox="0 0 10 6" width="9" height="6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg></button><ul class="sub">${x.map(i => `<li>${a(i[1], i[0], i[2])}</li>`).join('')}</ul></li>`
    : `<li>${a(x, label, key)}</li>`).join('') + `<li class="mob-cta"><a href="${ROOT}stake.html">Stake with us</a></li>`;
  $('#hdr').outerHTML = `<header class="top"><div class="wrap bar">
    <a class="brand" href="${ROOT}index.html"><img src="${ROOT}logo.svg" alt="" width="30" height="30">SoLyrae</a>
    <nav id="nav" aria-label="Main"><ul>${menuHtml}</ul></nav>
    <button class="icon-btn" id="theme" aria-label="Toggle light and dark mode" title="Light / dark"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10z"/></svg></button>
    <a class="btn btn-fill" href="${ROOT}stake.html">Stake with us</a>
    <button class="icon-btn menu-btn" id="menu" aria-label="Menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
  </div></header>`;
  $('#ftr').outerHTML = `<footer class="bottom"><div class="wrap"><div class="foot">
    <div><a class="brand" href="${ROOT}index.html"><img src="${ROOT}logo.svg" alt="" width="30" height="30">SoLyrae</a><p class="note" style="margin-top:12px;max-width:34ch">An independent Solana validator that publishes its numbers and the whole network's.</p></div>
    <div><h4>Site</h4><ul><li><a href="${ROOT}stake.html">Stake with us</a></li><li><a href="${ROOT}performance.html">Performance</a></li><li><a href="${ROOT}explorer.html">Explorer</a></li><li><a href="${ROOT}beacon.html">Beacon</a></li><li><a href="${ROOT}calculator.html">Rewards calculator</a></li><li><a href="${ROOT}blog/index.html">Blog</a></li><li><a href="${ROOT}faq.html">FAQ</a></li><li><a href="${ROOT}about.html">Our story</a></li><li><a href="${ROOT}methodology.html">How we measure</a></li><li><a href="${ROOT}security.html">Security</a></li><li><a href="${ROOT}privacy.html">Legal notice</a></li><li><a href="${ROOT}contact.html">Contact</a></li></ul></div>
    <div><h4>Contact</h4><ul><li><a href="mailto:info@solyrae.com">info@solyrae.com</a></li><li><a href="https://x.com/SoLyrae_Solana" target="_blank" rel="noopener">X @SoLyrae_Solana</a></li></ul></div>
    <div><h4>Data sources</h4><ul><li>Powered by <a href="https://stakewiz.com" target="_blank" rel="noopener">Stakewiz</a></li><li><a href="https://vx.tools" target="_blank" rel="noopener">Vortex (vx.tools)</a></li><li>IP Geolocation by <a href="https://db-ip.com" target="_blank" rel="noopener">DB-IP</a></li></ul></div>
  </div><p class="disc">Staking involves risk and rewards are not guaranteed. Figures come from public Solana data through third-party services and may differ slightly between sources. Past performance does not predict future results. Nothing here is financial advice. &copy; ${new Date().getFullYear()} SoLyrae.</p></div></footer>`;
  $('#theme').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch {}
  });
  $('#menu').addEventListener('click', e => { const n = $('#nav'); const o = n.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });
  // dropdowns: hover/focus on desktop (CSS), click to toggle on touch
  $$('.dd > button').forEach(b => b.addEventListener('click', () => {
    const li = b.parentElement; const open = !li.classList.contains('open');
    $$('.dd').forEach(x => { x.classList.remove('open'); x.firstElementChild.setAttribute('aria-expanded', 'false'); });
    li.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  }));
  document.addEventListener('click', e => { if (!e.target.closest('.dd')) $$('.dd').forEach(x => x.classList.remove('open')); });
}

/* ---------- shared renderers ---------- */
function me(D) { return D.list.find(v => v.vote === VOTE); }
function chip(live, text) { $$('.live').forEach(el => { el.classList.toggle('stale', !live); el.querySelector('span').textContent = text; }); }
function apiError(sel, what) { $$(sel).forEach(el => el.innerHTML = `<p class="note" style="padding:16px">${esc(what)} is temporarily unavailable. Please try again in a moment.</p>`); }

function fillMe(m, epoch) {
  set('stake', `${num(m.stake)}<small>SOL</small>`);
  set('apy', pct(m.apy));
  set('comm', `${pct(m.comm, 0)}`);
  set('comm_sub', `On rewards &middot; ${pct(m.mev, 0)} on MEV`);
  set('vote', pct(m.vote_s));
  set('skip', pct(m.skip)); // skip rate is always Stakewiz's, on every page
  set('age', num(m.age));
  set('uptime', pct(m.uptime, 0));
  set('rank', '#' + num(m.rank));
  set('rank_sub', `Rank #${num(m.rank)} of ${num(_vals.list.length)} by stake`);
  set('status', m.delinquent ? 'Delinquent' : 'Voting normally');
  set('location', `${esc(m.city)}, ${esc(m.country)}`);
  set('provider', esc(m.org));
  set('client', esc(clientName(m.client)));
  set('version', 'v' + esc(m.version));
  set('conc', `${pct(m.asnShare, 1)} of network stake`);
  chip(true, `Live · epoch ${num(m.epoch)}`);
}

// short country codes for the explorer table (names Stakewiz uses); any name not listed is shown in full
const CC = { 'United States': 'US', 'United Kingdom': 'UK', 'Germany': 'DE', 'Netherlands': 'NL', 'France': 'FR', 'Japan': 'JP', 'Singapore': 'SG', 'Hong Kong': 'HK', 'Canada': 'CA', 'Ireland': 'IE', 'Poland': 'PL', 'Slovakia': 'SK', 'Ukraine': 'UA', 'Norway': 'NO', 'Romania': 'RO', 'Spain': 'ES', 'Sweden': 'SE', 'Bulgaria': 'BG', 'Latvia': 'LV', 'Lithuania': 'LT', 'Austria': 'AT', 'Russian Federation': 'RU', 'Mexico': 'MX', 'Brazil': 'BR', 'Argentina': 'AR', 'Luxembourg': 'LU', 'Finland': 'FI', 'South Korea': 'KR', 'Czechia': 'CZ', 'Switzerland': 'CH', 'Italy': 'IT', 'Australia': 'AU', 'India': 'IN', 'Turkey': 'TR', 'Estonia': 'EE', 'Denmark': 'DK', 'Belgium': 'BE', 'Portugal': 'PT', 'Hungary': 'HU', 'Israel': 'IL', 'United Arab Emirates': 'AE', 'Taiwan': 'TW', 'Thailand': 'TH', 'Vietnam': 'VN', 'Indonesia': 'ID', 'Chile': 'CL', 'Colombia': 'CO', 'South Africa': 'ZA', 'Kazakhstan': 'KZ', 'Serbia': 'RS', 'Moldova': 'MD', 'Iceland': 'IS', 'Greece': 'GR', 'Cyprus': 'CY', 'The Netherlands': 'NL', 'Russia': 'RU', 'Cayman Islands': 'KY', 'Albania': 'AL' };
function validatorRows(list, opts = {}) {
  return list.map(v => `<tr data-vote="${esc(v.vote)}"${v.vote === VOTE ? ' class="me"' : ''}>
    <td>${v.rank}</td>
    <td class="l"><div class="who">${safeImg(v.img) ? `<img src="${esc(safeImg(v.img))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph'}))">` : '<div class="ph"></div>'}<span title="${esc(v.name)}">${esc(v.name)}</span>${v.vote === VOTE && !opts.codes ? '<em class="me-tag">YOU ARE HERE</em>' : ''}</div></td>
    <td>${num(v.stake)}</td><td>${pct(v.share)}</td><td>${pct(v.comm, 0)}</td><td>${v.jito ? pct(v.mev, 0) : '–'}</td><td>${pct(v.apy)}</td><td>${pct(v.skip)}</td><td>${pct(v.vote_s)}</td>
    <td class="l">${esc(clientName(v.client))}</td><td class="l"${opts.codes && CC[v.country] ? ` title="${esc(v.country)}"` : ''}>${esc(opts.codes ? (CC[v.country] || v.country || '') : (v.country || ''))}</td></tr>`).join('');
}
const VHEAD = [['rank', '#'], ['name', 'Validator'], ['stake', 'Stake (SOL)'], ['share', 'Share'], ['comm', 'Comm.'], ['mev', 'MEV comm.'], ['apy', 'APY'], ['skip', 'Skip'], ['vote_s', 'Vote success'], ['client', 'Client'], ['country', 'Country']];

function barsHtml(groups, n = 6) {
  const max = groups[0]?.share || 1;
  return `<div class="bars">${groups.slice(0, n).map(g => `<div class="bar-row"><span class="n" title="${esc(g.name)}">${esc(g.name)}</span><span class="track"><i style="width:${(100 * g.share / max).toFixed(1)}%"></i></span><span class="p">${g.share.toFixed(1)}%</span></div>`).join('')}</div>`;
}
function historyTable(h, withFast = false) {
  if (!h.length) return '<p class="note" style="padding:16px">No completed epochs found yet.</p>';
  return `<table style="min-width:${withFast ? 620 : 520}px"><thead><tr><th>Epoch</th><th>Votes landed</th>${withFast ? '<th>Fast votes</th>' : ''}<th>Blocks produced</th><th>Skip rate</th><th>Voting rank</th></tr></thead><tbody>${h.map(r => `<tr style="cursor:default"><td>${r.epoch}</td><td>${pct(r.part, 3)}</td>${withFast ? `<td>${r.fast == null ? 'N/A' : pct(r.fast)}</td>` : ''}<td>${r.blocks ?? 'N/A'}</td><td>${r.skip == null ? 'N/A' : pct(r.skip)}</td><td>${r.rank ? '#' + r.rank : 'N/A'}</td></tr>`).join('')}</tbody></table>`;
}

// Extra comparison rows computed by validator.js (they arrive from a different API, possibly before or after the rest).
function renderExtraRows() { const el = $('#cmp-extra'); if (el && window.__extraRows) el.innerHTML = window.__extraRows; }

/* ---------- pages ---------- */
async function renderHome(refresh = false) {
  try {
    const D = await getValidators(); const m = me(D); const S = netStats(D);
    if (m) fillMe(m); else chip(false, 'SoLyrae not found in data');
    set('n_val', num(S.n)); set('n_stake', `${compact(S.total)}<small>SOL</small>`); set('n_apy', pct(S.apy));
    $('#prev-body').innerHTML = validatorRows(D.list.slice(0, 10));
    bindRows(D);
  } catch (e) { console.warn(e); if (!refresh) { chip(false, 'Live data unavailable'); apiError('#prev-body-wrap', 'Validator data'); } }
  // concentration figures (Nakamoto, providers, countries, clients) come from Vortex
  getNet().then(N => {
    set('n_nak', num(N.nakVal));
    $('#bars-org').innerHTML = barsHtml(N.byProv); $('#bars-country').innerHTML = barsHtml(N.byCountry); $('#bars-client').innerHTML = barsHtml(N.byClient);
    $$('#bars-org,#bars-country,#bars-client').forEach(e => { e.classList.remove('sk'); e.style.minHeight = ''; });
    set('nak_org', num(nakamoto(N.byProv.map(g => g.stake), N.total))); set('nak_country', num(nakamoto(N.byCountry.map(g => g.stake), N.total)));
  }).catch(e => { console.warn(e); if (!refresh) { set('n_nak', 'N/A'); apiError('#bars-org,#bars-country,#bars-client', 'Network data'); } });
  getHistory(5).then(h => $('#hist-wrap').innerHTML = historyTable(h)).catch(() => { if (!refresh) apiError('#hist-wrap', 'Epoch history'); });
}
async function beaconHome() {
  const el = $('#bc-home'); if (!el) return;
  try {
    const r = await fetch('data/beacon.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('HTTP ' + r.status);
    const D = await r.json(), S = beaconSummary(D), [label, color] = BEACON_STATUS[S.status], c = S.counts;
    const parts = [c.critical && `${c.critical} critical`, c.high && `${c.high} high`, c.watch && `${c.watch} to watch`].filter(Boolean);
    el.style.setProperty('--sc', color);
    $('#bc-home-t').textContent = label;
    $('#bc-home-p').textContent = (parts.length ? parts.join(', ') + ' in the last 30 days. ' : 'No open alerts in the last 30 days. ') + 'Free alerts for validator operators.';
  } catch (e) { console.warn(e); $('#bc-home-t').textContent = 'Security bulletin for validator operators'; $('#bc-home-p').textContent = 'Vulnerabilities in Agave, Jito, Firedancer, Linux and more, with free alerts.'; }
}
async function pageHome() {
  $('#latest-posts').innerHTML = POSTS.slice(0, 3).map(postCard).join('');
  beaconHome();
  renderHome();
  // every 5 minutes: reload the validator list and redraw the figures on this page
  autoRefresh(5 * 60 * 1000, async () => { if (await refreshList()) { await refreshNet(); await renderHome(true); } });
}
const postCard = p => `<a class="post-card" href="${ROOT}blog/${p.slug}.html"><span class="meta">${esc(p.tag)} &middot; ${esc(p.date)}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></a>`;

async function pagePerformance() {
  try {
    const D = await getValidators(); const m = me(D); const S = netStats(D);
    if (m) {
      fillMe(m);
      set('share_sub', `${pct(m.share, 2)} of network stake`);
      set('apy_split', `10-epoch median &middot; Staking ${pct(m.apyStake)} + Jito ${pct(m.apyJito)}`);
      // re-run on every refresh: reads the current validator list (me + medians), so it always matches the cards above
      window.__renderCompare = () => {
        const D2 = _vals, m2 = me(D2), S2 = netStats(D2); if (!m2) return;
        const cmp = (label, mine, med, lowerBetter, d = 2) => { const better = lowerBetter ? mine <= med : mine >= med; return `<div class="row"><span>${label}</span><b class="${better ? 'good' : ''}">${pct(mine, d)} <span class="note">vs median ${pct(med, d)}</span></b></div>`; };
        // same order as the cards above: skip rate, votes landed (arrives from Vortex into #cmp-extra), vote success, commission, APY
        $('#compare').innerHTML = cmp('Skip rate', m2.skip, S2.medSkip, true) + '<div id="cmp-extra"></div>' + cmp('Vote success', m2.vote_s, S2.medVote, false) + cmp('Commission', m2.comm, S2.medComm, true, 0) + cmp('MEV commission', m2.mev, S2.medMev, true, 0) + cmp('APY (10-epoch median)', m2.apy, S2.medApy, false);
        renderExtraRows();
      };
      window.__renderCompare();
    }
  } catch (e) { console.warn(e); chip(false, 'Live data unavailable'); }
  const ep = _vals && me(_vals) ? me(_vals).epoch : null;
  if (ep) set('epoch_now', num(ep));
  // The blocks-produced and skip-rate cards for the epoch in progress are filled (and refreshed) by validator.js.
  // The "last 10 completed epochs" table on this page is built by validator.js.
}

function bindRows(D) {
  $$('tbody tr[data-vote]').forEach(tr => tr.addEventListener('click', () => openDrawer(D, tr.dataset.vote)));
}
function openDrawer(D, vote) {
  const v = D.list.find(x => x.vote === vote); const m = me(D); if (!v) return;
  const d = $('#drawer'); const diff = (a, b, lower) => (a == null || b == null) ? '' : `<span class="vs">SoLyrae ${pct(b)}</span>`;
  d.innerHTML = `<button class="icon-btn x" id="close" aria-label="Close">&times;</button>
    <div class="who">${safeImg(v.img) ? `<img src="${esc(safeImg(v.img))}" alt="" referrerpolicy="no-referrer" style="width:44px;height:44px" onerror="this.remove()">` : ''}</div>
    <h3>${esc(v.name)}</h3><p class="note">Rank #${v.rank} by stake</p>
    <div class="chart" style="margin-top:18px"><div class="chart-body">
      <div class="row"><span>Active stake</span><b>${num(v.stake)} SOL</b></div>
      <div class="row"><span>Share of network</span><b>${pct(v.share, 3)}</b></div>
      <div class="row"><span>Commission</span><b>${pct(v.comm, 0)} rewards / ${v.jito ? pct(v.mev, 0) + ' MEV' : 'no MEV'}</b></div>
      <div class="row"><span>APY</span><b>${pct(v.apy)} ${m && v !== m ? diff(v.apy, m.apy) : ''}</b></div>
      <div class="row"><span>Skip rate</span><b>${pct(v.skip)} ${m && v !== m ? diff(v.skip, m.skip) : ''}</b></div>
      <div class="row"><span>Vote success</span><b>${pct(v.vote_s)} ${m && v !== m ? diff(v.vote_s, m.vote_s) : ''}</b></div>
      <div class="row"><span>Uptime</span><b>${pct(v.uptime, 0)}</b></div>
      <div class="row"><span>Client</span><b>${esc(clientName(v.client))} v${esc(v.version)}</b></div>
      <div class="row"><span>Location</span><b>${esc(v.city || 'N/A')}, ${esc(v.country || '')}</b></div>
      <div class="row"><span>Provider</span><b>${esc(v.org || 'N/A')}</b></div>
      <div class="row"><span>Epochs operating</span><b>${num(v.age)}</b></div>
    </div></div>
    <p class="note" style="margin:16px 0 6px">Vote account</p><div class="addr"><div class="box"><code>${esc(v.vote)}</code><button class="copy" data-copy="${esc(v.vote)}">Copy</button></div></div>
    ${v.desc ? `<p class="note">${esc(v.desc)}</p>` : ''}`;
  d.classList.add('open'); $('#scrim').classList.add('open');
  const close = () => { d.classList.remove('open'); $('#scrim').classList.remove('open'); };
  $('#close').addEventListener('click', close); $('#scrim').onclick = close;
  document.onkeydown = e => { if (e.key === 'Escape') close(); };
}

async function pageExplorer() {
  const st = { tab: 'validators', sort: 'stake', dir: -1, q: '', filter: 'all', page: 0, per: 25 };
  let D, S;
  try { D = await getValidators(); S = netStats(D); } catch (e) { console.warn(e); chip(false, 'Live data unavailable'); apiError('#ex-body', 'Validator data'); return; }
  chip(true, `Live · epoch ${num(D.list[0]?.epoch)}`);
  set('n_val', num(S.n)); set('n_stake', `${compact(S.total)}<small>SOL</small>`); set('n_apy', pct(S.apy));
  set('n_nak_sub', `validators holding over 1/3 of stake`);
  // concentration (Nakamoto and the Providers / Countries / Clients tabs): Vortex, last completed epoch
  let N = null;
  // the table's Country and the drawer's Provider use the same Vortex labels as the tabs, so the figures always agree
  const applyLabels = () => { if (N) D.list.forEach(v => { const r = N.byVote.get(v.vote); if (r) { v.country = r.country; v.org = r.provider; } }); };
  const showNet = () => { applyLabels(); if (N) set('n_nak', num(N.nakVal)); render(); };
  getNet().then(n => { N = n; showNet(); }).catch(e => { console.warn(e); set('n_nak', 'N/A'); N = false; render(); });
  // quick filters; "APY above median" compares with the median APY of the whole list (computed in netStats)
  const FILTERS = { all: () => true, zero: v => v.comm === 0, jito0: v => v.jito && v.mev === 0, apy: v => v.apy != null && v.apy >= S.medApy };
  const val = (v, k) => k === 'client' ? clientName(v.client) : k === 'mev' ? (v.jito ? v.mev : null) : v[k]; // MEV commission only exists for Jito validators
  function render() {
    $$('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === st.tab));
    const tools = $('#v-tools'); tools.style.display = st.tab === 'validators' ? '' : 'none';
    const out = $('#ex-out');
    if (st.tab === 'validators') {
      let rows = D.list.filter(FILTERS[st.filter]);
      const q = st.q.trim().toLowerCase();
      if (q) rows = rows.filter(v => v.name.toLowerCase().includes(q) || v.vote.toLowerCase().includes(q) || v.id.toLowerCase().includes(q));
      rows.sort((a, b) => { const x = val(a, st.sort), y = val(b, st.sort); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; const c = typeof x === 'string' ? String(x).localeCompare(String(y)) : x - y; return c * st.dir; });
      const pages = Math.max(1, Math.ceil(rows.length / st.per)); st.page = Math.min(st.page, pages - 1);
      const slice = rows.slice(st.page * st.per, (st.page + 1) * st.per);
      out.innerHTML = `<div class="tbl-wrap"><table class="vt"><thead><tr>${VHEAD.map(([k, l]) => `<th class="s${st.sort === k ? ' on' : ''}${k === 'name' || k === 'client' || k === 'country' ? ' l' : ''}" data-sort="${k}">${l}</th>`).join('')}</tr></thead><tbody>${slice.length ? validatorRows(slice, { codes: true }) : '<tr><td colspan="11" class="l">No validators match.</td></tr>'}</tbody></table></div>
        <div class="pager"><span>${rows.length ? `Showing ${num(st.page * st.per + 1)}–${num(st.page * st.per + slice.length)} of ${num(rows.length)} validators` : '0 validators'}</span><div><button id="first" ${st.page === 0 ? 'disabled' : ''}>First</button><button id="prev" ${st.page === 0 ? 'disabled' : ''}>Prev</button><span style="align-self:center">${st.page + 1} / ${pages}</span><button id="next" ${st.page >= pages - 1 ? 'disabled' : ''}>Next</button><button id="last" ${st.page >= pages - 1 ? 'disabled' : ''}>Last</button></div></div>`;
      $$('th.s', out).forEach(th => th.addEventListener('click', () => { const k = th.dataset.sort; if (st.sort === k) st.dir *= -1; else { st.sort = k; st.dir = (k === 'name' || k === 'client' || k === 'country' || k === 'skip' || k === 'comm' || k === 'mev' || k === 'rank') ? 1 : -1; } st.page = 0; render(); }));
      $('#prev')?.addEventListener('click', () => { st.page--; render(); window.scrollTo({ top: out.offsetTop - 120 }); });
      $('#next')?.addEventListener('click', () => { st.page++; render(); window.scrollTo({ top: out.offsetTop - 120 }); });
      $('#first')?.addEventListener('click', () => { st.page = 0; render(); window.scrollTo({ top: out.offsetTop - 120 }); });
      $('#last')?.addEventListener('click', () => { st.page = pages - 1; render(); window.scrollTo({ top: out.offsetTop - 120 }); });
      bindRows(D);
    } else {
      if (!N) { out.innerHTML = `<p class="note" style="padding:16px">${N === false ? 'Network data is temporarily unavailable.' : 'Loading&hellip;'}</p>`; return; }
      const groups = st.tab === 'providers' ? N.byProv : st.tab === 'countries' ? N.byCountry : N.byClient;
      const nak = nakamoto(groups.map(g => g.stake), N.total);
      const label = st.tab === 'providers' ? 'Hosting provider' : st.tab === 'countries' ? 'Country' : 'Client software';
      out.innerHTML = `<div class="naka" style="margin-top:20px"><div class="val">${nak}</div><span>${nak === 1 ? 'group holds' : 'groups hold'} more than one third of all stake (Nakamoto coefficient for this view)</span></div>
        <div class="tbl-wrap"><table class="gt" style="min-width:520px"><thead><tr><th class="l">${label}</th><th>Validators</th><th>Stake (SOL)</th><th>Share</th></tr></thead><tbody>${groups.slice(0, 60).map(g => `<tr style="cursor:default"><td class="l"><b style="font-family:var(--sans);font-weight:500">${esc(g.name)}</b></td><td>${num(g.n)}</td><td>${num(g.stake)}</td><td>${pct(g.share)}</td></tr>`).join('')}</tbody></table></div>
        <p class="note" style="margin-top:12px">Validators and stake: Stakewiz (${num(N.recs.length)} validators with stake). Provider, country and client: Vortex (epoch ${N.epoch}).</p>`;
    }
  }
  $$('.tabs button').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; render(); }));
  const qp = new URLSearchParams(location.search).get('q'); if (qp) { st.q = qp; $('#q').value = qp; }
  $('#q').addEventListener('input', e => { st.q = e.target.value; st.page = 0; render(); });
  $$('.pill').forEach(p => p.addEventListener('click', () => { st.filter = p.dataset.f; st.page = 0; $$('.pill').forEach(x => x.setAttribute('aria-pressed', x === p)); render(); }));
  render();
  // every 5 minutes: reload the list and redraw with the same search, filter, sort and page
  autoRefresh(5 * 60 * 1000, async () => {
    if (!(await refreshList())) return;
    D = _vals; S = netStats(D);
    chip(true, `Live · epoch ${num(D.list[0]?.epoch)}`);
    set('n_val', num(S.n)); set('n_stake', `${compact(S.total)}<small>SOL</small>`); set('n_apy', pct(S.apy));
    if (await refreshNet()) { N = _net; set('n_nak', num(N.nakVal)); applyLabels(); }
    render();
  });
}

/* ---------- extra pages ---------- */
async function getHosts() {
  let h = cacheGet('vx_hosts', 10 * 60 * 1000);
  if (!h) {
    const j = await getJSON(`${VX}/validators/host-changes?identity=${IDENTITY}&limit=50`);
    h = (j.migrations || []).map(m => ({ epoch: m.epoch, kind: m.kind, from: m.before && m.before.geo, to: m.after && m.after.geo }));
    cacheSet('vx_hosts', h);
  }
  return h;
}
const geoStr = g => g ? `${esc(g.city || 'Unknown')}, ${esc(g.country || '')} &middot; ${esc(g.asnOrganization || '')}` : 'N/A';

// Operating time (Vortex status endpoint); Stakewiz counts the first epoch one earlier.
function loadOperating() {
  return getJSON(`${VX}/validators/status?identity=${IDENTITY}`).then(s => {
    const find = o => { if (!o || typeof o !== 'object') return null; if ('firstEpoch' in o && 'epochsActive' in o) return o; for (const k in o) { const r = find(o[k]); if (r) return r; } return null; };
    const f = find(s);
    set('operating', f ? `${num(f.epochsActive)} epochs &middot; since epoch ${num(f.firstEpoch)}` : 'N/A');
  }).catch(() => set('operating', 'N/A'));
}

async function pageInfra() {
  try {
    const D = await getValidators(); const m = me(D); const S = netStats(D);
    if (m) {
      fillMe(m);
    }
  } catch (e) { console.warn(e); chip(false, 'Live data unavailable'); }
  // concentration boxes: Vortex only (last completed epoch)
  getNet().then(N => {
    const r = N.recs.find(x => x.vote === VOTE); if (!r) throw new Error('SoLyrae not in network data');
    const find = (arr, name) => arr.findIndex(g => g.name === name);
    const pi = find(N.byProv, r.provider), ci = find(N.byClient, r.client), ti = find(N.byCity, r.city), di = find(N.byDc, r.dc);
    set('provider', esc(r.provider));
    set('prov_rank', pi >= 0 ? `#${pi + 1} of ${N.byProv.length} providers by stake` : 'N/A');
    set('asn_share', pi >= 0 ? pct(N.byProv[pi].share, 1) : 'N/A');
    set('city_share', ti >= 0 ? pct(N.byCity[ti].share, 1) : 'N/A');
    set('asncity_share', di >= 0 ? pct(N.byDc[di].share, 1) : 'N/A');
    set('client_share', ci >= 0 ? `${pct(N.byClient[ci].share, 1)} &middot; ${esc(r.client)}` : 'N/A'); // share of validators running the same base client
  }).catch(e => { console.warn(e); ['prov_rank', 'asn_share', 'city_share', 'asncity_share', 'client_share'].forEach(k => set(k, 'N/A')); });
  loadOperating();
  getHosts().then(h => {
    $('#host-wrap').innerHTML = h.length
      ? `<table style="min-width:560px"><thead><tr><th>Epoch</th><th class="l">Event</th><th class="l">From</th><th class="l">To</th></tr></thead><tbody>${h.map(r => `<tr style="cursor:default"><td>${r.epoch}</td><td class="l">${esc((r.kind || 'move').replace(/^./, c => c.toUpperCase()))}</td><td class="l">${geoStr(r.from)}</td><td class="l">${geoStr(r.to)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="note" style="padding:16px">No host changes recorded.</p>';
  }).catch(() => apiError('#host-wrap', 'Host history'));
}

async function pageDecentral() {
  // validators and stake: Stakewiz list; provider, country and client of each validator: Vortex
  let N;
  try { N = await getNet(); } catch (e) { console.warn(e); chip(false, 'Live data unavailable'); return; }
  chip(true, `Live · epoch ${num((_vals && _vals.list[0] && _vals.list[0].epoch) || N.epoch + 1)}`);
  set('net_src', `Validators and stake: Stakewiz (${num(N.recs.length)} validators with stake). Provider, country and client: Vortex (epoch ${N.epoch}).`);
  set('nak_val', num(N.nakVal));
  set('nak_org', num(nakamoto(N.byProv.map(g => g.stake), N.total)));
  set('nak_country', num(nakamoto(N.byCountry.map(g => g.stake), N.total)));
  set('nak_client', num(nakamoto(N.byClient.map(g => g.stake), N.total)));
  $('#bars-val').innerHTML = barsHtml(N.byVal, 10);
  $('#bars-org').innerHTML = barsHtml(N.byProv, 10);
  $('#bars-country').innerHTML = barsHtml(N.byCountry, 10);
  $('#bars-client').innerHTML = barsHtml(N.byClient, 10);
  $$('#bars-val,#bars-org,#bars-country,#bars-client').forEach(e => e.classList.remove('sk'));
  const m = N.recs.find(r => r.vote === VOTE);
  if (m) {
    const org = N.byProv.find(g => g.name === m.provider), cty = N.byCountry.find(g => g.name === m.country), cl = N.byClient.find(g => g.name === m.client);
    set('me_val', pct(100 * m.stake / N.total, 3)); set('me_org', `${esc(m.provider)}: ${org ? pct(org.share, 1) : 'N/A'}`);
    set('me_country', `${esc(m.country)}: ${cty ? pct(cty.share, 1) : 'N/A'}`); set('me_client', `${esc(m.client)}: ${cl ? pct(cl.share, 1) : 'N/A'}`);
  }
}

function labelMap(D) {
  const seen = new Map(), labels = new Map();
  D.list.forEach(v => seen.set(v.name, (seen.get(v.name) || 0) + 1));
  D.list.forEach(v => labels.set(seen.get(v.name) > 1 || !v.named ? `${v.name} (${v.vote.slice(0, 4)}…${v.vote.slice(-4)})` : v.name, v));
  return labels;
}
const optionsHtml = labels => [...labels.keys()].map(k => `<option value="${esc(k)}"></option>`).join('');

async function pageCalc() {
  let D; try { D = await getValidators(); } catch (e) { console.warn(e); chip(false, 'Live data unavailable'); $('#calc-out').innerHTML = '<p class="note">Validator data is temporarily unavailable.</p>'; return; }
  let epy = 338; try { epy = (await getJSON(SW + '/epoch_info')).epochs_per_year || 338; } catch {}
  chip(true, `Live · epoch ${num(D.list[0]?.epoch)}`);
  let S = netStats(D); let labels = labelMap(D);
  $('#vlist').innerHTML = optionsHtml(labels);
  const m = me(D); const mlabel = [...labels.entries()].find(([, v]) => v.vote === VOTE)?.[0] || 'SoLyrae';
  $('#val').value = mlabel;
  function calc() {
    const amt = parseFloat($('#amt').value); const v = labels.get($('#val').value.trim());
    const out = $('#calc-out');
    if (!(amt > 0)) { out.innerHTML = '<p class="note">Enter an amount of SOL greater than 0.</p>'; return; }
    if (!v) { out.innerHTML = '<p class="note">Pick a validator from the list.</p>'; return; }
    const r = v.apy / 100, med = S.medApy / 100;
    const gain = t => amt * (Math.pow(1 + r, t) - 1);
    out.innerHTML = `<div class="grid-6" style="margin-top:0">
      <div><div class="lbl">Per epoch</div><div class="val">${num(amt * (Math.pow(1 + r, 1 / epy) - 1), 5)}<small>SOL</small></div></div>
      <div><div class="lbl">1 month</div><div class="val">${num(gain(1 / 12), 4)}<small>SOL</small></div></div>
      <div><div class="lbl">6 months</div><div class="val">${num(gain(0.5), 3)}<small>SOL</small></div></div>
      <div><div class="lbl">1 year</div><div class="val">${num(gain(1), 3)}<small>SOL</small></div><div class="sub">Balance: ${num(amt + gain(1), 3)} SOL</div></div>
      <div><div class="lbl">Validator APY</div><div class="val">${pct(v.apy)}</div><div class="sub">${esc(v.name)} &middot; commission ${pct(v.comm, 0)}, MEV ${v.jito ? pct(v.mev, 0) : 'n/a'}</div></div>
      <div><div class="lbl">Against network median</div><div class="val ${v.apy >= S.medApy ? 'good' : 'bad'}">${(v.apy >= S.medApy ? '+' : '') + num(amt * ((1 + r) - (1 + med)), 3)}<small>SOL / yr</small></div><div class="sub">Median APY ${pct(S.medApy)}</div></div>
    </div>`;
  }
  $('#amt').addEventListener('input', calc); $('#val').addEventListener('input', calc); $('#val').addEventListener('focus', e => e.target.select());
  calc();
  // every 5 minutes: reload the validator list (APY, commissions, median) and recalculate with the same amount and validator
  autoRefresh(5 * 60 * 1000, async () => {
    if (!(await refreshList())) return;
    D = _vals; S = netStats(D); labels = labelMap(D);
    $('#vlist').innerHTML = optionsHtml(labels);
    chip(true, `Live · epoch ${num(D.list[0]?.epoch)}`);
    calc();
  });
}

async function pageCompare() {
  let D; try { D = await getValidators(); } catch (e) { console.warn(e); chip(false, 'Live data unavailable'); $('#cmp-out').innerHTML = '<p class="note">Validator data is temporarily unavailable.</p>'; return; }
  chip(true, `Live · epoch ${num(D.list[0]?.epoch)}`);
  let labels = labelMap(D); $('#vlist').innerHTML = optionsHtml(labels);
  let byVote = new Map(D.list.map(v => [v.vote, v]));
  let ids = (new URLSearchParams(location.search).get('v') || '').split(',').filter(x => byVote.has(x)).slice(0, 3);
  if (!ids.length) ids = [VOTE, D.list[0].vote, D.list[1].vote];
  const ROWS = [
    ['Rank by stake', v => '#' + num(v.rank), null], ['Active stake (SOL)', v => num(v.stake), null], ['Share of network', v => pct(v.share, 3), null],
    ['Commission', v => pct(v.comm, 0), v => -v.comm], ['MEV commission', v => v.jito ? pct(v.mev, 0) : 'n/a', v => v.jito ? -v.mev : null], ['APY', v => pct(v.apy), v => v.apy],
    ['Skip rate', v => pct(v.skip), v => -(v.skip ?? 99)], ['Vote success', v => pct(v.vote_s), v => v.vote_s], ['Uptime', v => pct(v.uptime, 0), v => v.uptime],
    ['Client', v => esc(clientName(v.client)), null], ['Version', v => 'v' + esc(v.version), null],
    ['Provider', v => esc(v.org || 'N/A'), null], ['Location', v => `${esc(v.city || 'N/A')}, ${esc(v.country || '')}`, null], ['Epochs operating', v => num(v.age), null]
  ];
  function render() {
    const vs = ids.map(i => byVote.get(i));
    history.replaceState(null, '', '?v=' + ids.join(','));
    const head = vs.map((v, i) => `<th class="l" style="text-align:left"><div class="who" style="font-family:var(--sans);letter-spacing:0;text-transform:none;font-size:.95rem"><span>${esc(v.name)}</span></div><button class="copy" data-rm="${i}" style="margin-top:6px">Remove</button></th>`).join('');
    const body = ROWS.map(([label, fmt, score]) => {
      const nums = score ? vs.map(score).filter(x => x != null) : [];
      const best = nums.length ? Math.max(...nums) : null; // a validator without a value (for example no MEV commission) is never "best"
      return `<tr style="cursor:default"><td class="l" style="color:var(--muted)">${label}</td>${vs.map(v => `<td class="l${score && vs.length > 1 && best != null && score(v) === best ? ' good' : ''}" style="text-align:left">${fmt(v)}</td>`).join('')}</tr>`;
    }).join('');
    $('#cmp-out').innerHTML = `<div class="tbl-wrap"><table style="min-width:560px"><thead><tr><th class="l">Metric</th>${head}</tr></thead><tbody>${body}</tbody></table></div><p class="note" style="margin-top:10px">Green marks the best value in each row.</p>`;
    $$('[data-rm]').forEach(b => b.addEventListener('click', () => { ids.splice(+b.dataset.rm, 1); render(); }));
    $('#add').disabled = ids.length >= 3;
  }
  $('#add').addEventListener('click', () => {
    const v = labels.get($('#pick').value.trim());
    if (v && !ids.includes(v.vote) && ids.length < 3) { ids.push(v.vote); $('#pick').value = ''; render(); }
  });
  // the Provider row uses the same Vortex label as the Explorer and Infrastructure
  const applyProvider = async () => { try { const N = await getNet(); D.list.forEach(v => { const r = N.byVote.get(v.vote); if (r) v.org = r.provider; }); render(); } catch (e) { console.warn(e); } };
  render();
  applyProvider();
  // every 5 minutes: reload the list and redraw the same selection
  autoRefresh(5 * 60 * 1000, async () => {
    if (!(await refreshList())) return;
    D = _vals; labels = labelMap(D); byVote = new Map(D.list.map(v => [v.vote, v]));
    $('#vlist').innerHTML = optionsHtml(labels);
    chip(true, `Live · epoch ${num(D.list[0]?.epoch)}`);
    await refreshNet(); await applyProvider();
  });
}

async function pageStake() {
  try { const D = await getValidators(); const m = me(D); if (m) fillMe(m); } catch (e) { console.warn(e); chip(false, 'Live data unavailable'); }
}

/* ---------- init ---------- */
document.addEventListener('click', async ev => {
  const b = ev.target.closest('.copy'); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); const o = b.textContent; b.textContent = 'Copied'; setTimeout(() => (b.textContent = o), 1300); } catch {}
});
document.addEventListener('DOMContentLoaded', () => {
  layout();
  const p = document.body.dataset.page;
  if (p === 'home') pageHome();
  if (p === 'explorer') pageExplorer();
  if (p === 'performance') pagePerformance();
  if (p === 'infrastructure') pageInfra();
  if (p === 'decentralization') { pageDecentral(); autoRefresh(5 * 60 * 1000, async () => { if (await refreshList() && await refreshNet()) await pageDecentral(); }); }
  if (p === 'calculator') pageCalc();
  if (p === 'compare') pageCompare();
  if (p === 'stake') pageStake();  if (p === 'blog') $('#all-posts').innerHTML = POSTS.map(postCard).join('');
});
