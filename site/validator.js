// SoLyrae · validator pages: Performance (voting + production), Staking, Earnings.
// Loaded after app.js (shares its helpers). All data is live from Vortex's public API; nothing is typed by hand.
const L = 1e9; // lamports per SOL
const sol = (l, d = 2) => num(l / L, d);
const tile = (label, val, sub = '', id = '', k = '') => `<div class="tile"><div class="lbl">${label}</div><div class="val"${k ? ` data-k="${k}"` : ''}>${val}</div><div class="sub"${id ? ` id="${id}"` : ''}>${sub}</div></div>`;

/* ---------- tiny SVG charts (our own, no library) ---------- */
function svgLine(data, o = {}) {
  const W = 560, H = 170, P = { l: 50, r: 10, t: 12, b: 26 };
  const fmt = o.fmt || (v => v.toFixed(2));
  const ys = data.map(d => d.y); let lo = o.yMin ?? Math.min(...ys), hi = o.yMax ?? Math.max(...ys);
  if (lo === hi) { lo -= 1; hi += 1; }
  const x = i => P.l + (W - P.l - P.r) * (data.length < 2 ? 0.5 : i / (data.length - 1));
  const y = v => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.y).toFixed(1)}`).join(' ');
  const area = `${line} L${x(data.length - 1).toFixed(1)} ${H - P.b} L${x(0).toFixed(1)} ${H - P.b} Z`;
  const dots = data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.y).toFixed(1)}" r="3.2" class="c-dot" data-tip="${esc(d.tip || `${d.x}: ${fmt(d.y)}`)}"></circle>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(o.label || 'Chart')}">
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(hi)}" y2="${y(hi)}" class="c-grid"/><line x1="${P.l}" x2="${W - P.r}" y1="${y(lo)}" y2="${y(lo)}" class="c-grid"/>
    <path d="${area}" class="c-area"/><path d="${line}" class="c-line"/>${dots}
    <text x="${P.l - 6}" y="${y(hi) + 4}" class="c-t" text-anchor="end">${fmt(hi)}</text><text x="${P.l - 6}" y="${y(lo) + 4}" class="c-t" text-anchor="end">${fmt(lo)}</text>
    <text x="${P.l}" y="${H - 6}" class="c-t">${esc(data[0].x)}</text><text x="${W - P.r}" y="${H - 6}" class="c-t" text-anchor="end">${esc(data[data.length - 1].x)}</text></svg>`;
}
function svgStack(data, o = {}) {
  const W = 560, H = 170, P = { l: 50, r: 10, t: 12, b: 26 };
  const pctMode = !!o.percent; // bars all reach 100% and show each part's share
  const norm = d => { if (!pctMode) return d.parts; const t = d.parts.reduce((a, b) => a + b, 0) || 1; return d.parts.map(v => 100 * v / t); };
  const hi = pctMode ? 100 : Math.max(1, ...data.map(d => d.parts.reduce((a, b) => a + b, 0)));
  const bw = (W - P.l - P.r) / data.length;
  const y = v => P.t + (H - P.t - P.b) * (1 - v / hi);
  const cls = o.cls || ['c-s1', 'c-s2', 'c-s3'];
  const bars = data.map((d, i) => {
    const x = P.l + i * bw + bw * 0.14, w = bw * 0.72; let acc = 0;
    const segs = norm(d).map((v, k) => { if (v <= 0) return ''; const y1 = y(acc + v), y0 = y(acc); acc += v; return `<rect x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(1, y0 - y1).toFixed(1)}" class="${cls[k]}"/>`; }).join('');
    return `<rect x="${(P.l + i * bw).toFixed(1)}" y="${P.t}" width="${bw.toFixed(1)}" height="${H - P.t - P.b}" class="c-hit" data-tip="${esc(d.tip)}"/>${segs}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(o.label || 'Chart')}">
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" class="c-grid"/>${bars}
    <text x="${P.l - 6}" y="${y(hi) + 4}" class="c-t" text-anchor="end">${pctMode ? '100%' : num(hi)}</text><text x="${P.l - 6}" y="${y(0) + 4}" class="c-t" text-anchor="end">0</text>
    <text x="${P.l}" y="${H - 6}" class="c-t">${esc(data[0].x)}</text><text x="${W - P.r}" y="${H - 6}" class="c-t" text-anchor="end">${esc(data[data.length - 1].x)}</text></svg>`;
}
function svgBars(data, o = {}) {
  const W = 560, H = 170, P = { l: 50, r: 10, t: 12, b: 26 };
  const fmt = o.fmt || (v => num(v));
  const vals = data.map(d => d.y); const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals, o.min || 0) || 1;
  const bw = (W - P.l - P.r) / data.length;
  const y = v => P.t + (H - P.t - P.b) * (1 - (v - lo) / (hi - lo));
  const bars = data.map((d, i) => {
    const y0 = y(0), y1 = y(d.y), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
    return `<rect x="${(P.l + i * bw + bw * 0.14).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw * 0.72).toFixed(1)}" height="${h.toFixed(1)}" class="${d.y < 0 ? 'c-neg' : 'c-bar'}" data-tip="${esc(d.tip || `${d.x}: ${fmt(d.y)}`)}"></rect>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(o.label || 'Chart')}">
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(0)}" y2="${y(0)}" class="c-grid"/>${bars}
    <text x="${P.l - 6}" y="${y(hi) + 4}" class="c-t" text-anchor="end">${fmt(hi)}</text><text x="${P.l - 6}" y="${y(lo) + 4}" class="c-t" text-anchor="end">${lo === 0 ? '0' : fmt(lo)}</text>
    <text x="${P.l}" y="${H - 6}" class="c-t">${esc(data[0].x)}</text><text x="${W - P.r}" y="${H - 6}" class="c-t" text-anchor="end">${esc(data[data.length - 1].x)}</text></svg>`;
}

/* Hover (or touch) any chart: a label shows the exact value of the nearest point or bar. */
(function chartTooltips() {
  const tip = document.createElement('div'); tip.className = 'chart-tip'; document.body.appendChild(tip);
  let cur = null;
  const clear = () => { tip.style.display = 'none'; if (cur) { cur.classList.remove('hl'); cur = null; } };
  document.addEventListener('pointermove', e => {
    const svg = e.target.closest && e.target.closest('.chart-svg');
    if (!svg) { clear(); return; }
    const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
    const x = (e.clientX - r.left) * vb.width / r.width;
    let best = null, bd = Infinity;
    svg.querySelectorAll('[data-tip]').forEach(el => {
      const cx = el.tagName === 'circle' ? +el.getAttribute('cx') : (+el.getAttribute('x') + +el.getAttribute('width') / 2);
      const d = Math.abs(cx - x); if (d < bd) { bd = d; best = el; }
    });
    if (!best) { clear(); return; }
    if (cur !== best) { if (cur) cur.classList.remove('hl'); cur = best; best.classList.add('hl'); }
    tip.textContent = best.getAttribute('data-tip'); tip.style.display = 'block';
    const tw = tip.offsetWidth; let left = e.clientX + 14; if (left + tw > innerWidth - 8) left = e.clientX - tw - 14;
    tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, e.clientY - 42) + 'px';
  });
  document.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('.chart-svg'))) clear(); });
  window.addEventListener('scroll', clear, { passive: true });
})();

/* ---------- data ---------- */
async function loadEpochData(fresh = false) {
  let d = fresh ? null : cacheGet('vx_ep6', 5 * 60 * 1000);
  if (!d) {
    const [part, prod] = await Promise.all([
      getJSON(`${VX}/epochs/participation?voteKey=${VOTE}&limit=33`),
      // same ordering Vortex uses for its production rank
      getJSON(`${VX}/epochs/production?voteKey=${VOTE}&limit=33&minLeaderSlots=1&sortBy=scoredInclusion`)
    ]);
    d = { part, prod }; cacheSet('vx_ep6', d);
  }
  const done = a => a.filter(x => x.complete).sort((p, q) => p.epoch - q.epoch);
  const cur = a => a.filter(x => !x.complete).sort((p, q) => q.epoch - p.epoch)[0];
  return { partDone: done(d.part).filter(p => p.eligibleSlots > 0), partCur: d.part.filter(p => !p.complete && p.eligibleSlots > 0).sort((p, q) => q.epoch - p.epoch)[0], prodDone: done(d.prod), prodCur: cur(d.prod) };
}
const fastPct = p => p.finalizedCerts > 0 ? 100 * p.finalizedSlots / p.finalizedCerts : null;
const med = a => { const s = a.filter(x => x != null && !isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/* ---------- Performance: voting + production ---------- */
let _S = null, _P = null; // network summary for voting; production record shown in the tiles
function renderPerf(E) {
  const vt = $('#vt'), pt = $('#pt');
  const { partDone, partCur, prodDone, prodCur } = E;

  /* voting tiles */
  if (partCur) {
    const missed = partCur.missedSlots, el = partCur.eligibleSlots, fast = fastPct(partCur);
    vt.innerHTML = tile('Eligible slots', num(el), 'Slots it could vote on')
      + tile('Missed votes', num(missed), `${pct(100 * missed / el, 3)} of eligible`)
      + tile('Uptime (30 days)', (typeof _vals !== 'undefined' && _vals && me(_vals)) ? pct(me(_vals).uptime, 0) : '&hellip;', 'Time the node was online', '', 'uptime')
      + tile('Fast votes', fast == null ? 'N/A' : pct(fast), 'Votes that arrived in time', 'fast-net')
      + tile('Voting rank', '&hellip;', 'among validators that vote', 'vrank');
    set('votes_card', pct(100 * (1 - missed / el), 3));
  }
  /* voting charts */
  const pd = partDone.map(p => ({ x: 'Ep ' + p.epoch, y: 100 * (1 - p.missedSlots / p.eligibleSlots), tip: `Epoch ${p.epoch}: ${pct(100 * (1 - p.missedSlots / p.eligibleSlots), 3)} · ${num(p.missedSlots)} missed votes` }));
  // why votes were missed: offline = node not voting, late = vote arrived late, other = the rest (e.g. a poor block from the leader)
  const md = partDone.map(p => {
    const off = p.missCauses ? p.missCauses.offlineSlots || 0 : 0, late = p.missCauses ? p.missCauses.lateSlots || 0 : 0, oth = Math.max(0, p.missedSlots - off - late);
    return { x: 'Ep ' + p.epoch, parts: [off, late, oth], tip: `Epoch ${p.epoch}: ${num(p.missedSlots)} missed · offline ${num(off)} · late ${num(late)} · other ${num(oth)}` };
  });
  if (md.length) $('#ch-missed').innerHTML = svgStack(md, { label: 'Missed votes per epoch by cause' });
  if (pd.length) $('#ch-part').innerHTML = svgLine(pd, { yMax: 100, yMin: Math.floor(Math.min(...pd.map(d => d.y)) * 20) / 20, fmt: v => v.toFixed(2) + '%', label: 'Vote participation per epoch' });

  /* production tiles */
  const last = prodDone[prodDone.length - 1];
  const P = prodCur && prodCur.blocks > 0 ? prodCur : last;
  // rank of the epoch in progress when it already has one; otherwise the last completed epoch (labelled)
  const rk = prodCur && prodCur.blocks > 0 && prodCur.rank != null ? prodCur : last;
  if (P) {
    const live = P === prodCur;
    const played = P.windows * 4, upcoming = Math.max(0, P.scheduledWindows * 4 - played);
    const perfect = P.classifiedSlots > 0 ? 100 * P.perfectSlots / P.classifiedSlots : null;
    pt.innerHTML = tile('Inclusion', pct(100 * P.scoredInclusion, 3), 'Votes included in our blocks')
      + tile('Perfect blocks', perfect == null ? 'N/A' : pct(perfect), 'Share of blocks produced')
      + tile('Poor blocks', num(P.thinSlots), 'Blocks that left out many votes')
      + tile('Production rank', rk ? `#${num(rk.rank + 1)}` : 'N/A', rk ? `of ${num(rk.rankedOf)} producers${rk === prodCur ? '' : ` &middot; epoch ${rk.epoch}`}` : '');
  }
  // what happened to every block slot in each epoch: perfect / ok / poor / skipped (share of the epoch's slots)
  const od = prodDone.map(p => ({ x: 'Ep ' + p.epoch, parts: [p.perfectSlots || 0, p.okSlots || 0, p.thinSlots || 0, p.skippedSlots || 0],
    tip: `Epoch ${p.epoch}: ${num(p.perfectSlots)} perfect · ${num(p.okSlots)} ok · ${num(p.thinSlots)} poor · ${num(p.skippedSlots)} skipped` }));
  if (od.length) $('#ch-outcomes').innerHTML = svgStack(od, { percent: true, cls: ['c-p1', 'c-p2', 'c-p3', 'c-p4'], label: 'Block outcomes per epoch' });
  const idl = prodDone.map(p => ({ x: 'Ep ' + p.epoch, y: 100 * p.scoredInclusion, tip: `Epoch ${p.epoch}: ${pct(100 * p.scoredInclusion, 3)}` }));
  if (idl.length) $('#ch-incl').innerHTML = svgLine(idl, { yMax: 100, yMin: Math.floor(Math.min(...idl.map(d => d.y)) * 10) / 10, fmt: v => v.toFixed(2) + '%', label: 'Inclusion per epoch' });

  _P = P || null;

  /* table: the last 10 completed epochs, same order as the cards above */
  const hw = $('#hist-wrap');
  if (hw) {
    const prodBy = new Map(prodDone.map(p => [p.epoch, p]));
    const rows = [...partDone].sort((a, b) => b.epoch - a.epoch).slice(0, 10).map(p => {
      const q = prodBy.get(p.epoch);
      const sched = q ? q.blocks + q.skippedSlots : null;
      return `<tr style="cursor:default"><td>${p.epoch}</td><td>${pct(100 * (1 - p.missedSlots / p.eligibleSlots), 3)}</td><td>${num(p.missedSlots)}</td>`
        + `<td>${q ? `${num(q.blocks)} of ${num(sched)}` : 'N/A'}</td><td>${q ? pct(100 * (q.skipRate || 0)) : 'N/A'}</td>`
        + `<td>${q ? pct(100 * q.scoredInclusion, 3) : 'N/A'}</td><td>${q && q.classifiedSlots > 0 ? pct(100 * q.perfectSlots / q.classifiedSlots) : 'N/A'}</td></tr>`;
    }).join('');
    hw.innerHTML = rows ? `<table style="min-width:640px"><thead><tr><th>Epoch</th><th>Votes landed</th><th>Missed votes</th><th>Blocks produced</th><th>Skip rate</th><th>Inclusion</th><th>Perfect blocks</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="note" style="padding:16px">No completed epochs found yet.</p>';
  }

  /* top cards that depend on the epoch in progress */
  if (prodCur && prodCur.blocks > 0) set('blocks_now', `${num(prodCur.blocks)}<small>of ${num(prodCur.scheduledWindows * 4)} scheduled</small>`);
  else set('blocks_now', '&mdash;');

  applyNetSummary(); // re-apply the network comparison after the tiles were redrawn
}

function applyNetSummary() {
  const s = _S;
  if (s && !s.error && s.medLanded != null && s.mineLanded != null) {
    const better = s.mineLanded >= s.medLanded;
    window.__extraRows = `<div class="row"><span>Votes landed</span><b class="${better ? 'good' : ''}">${pct(s.mineLanded, 3)} <span class="note">vs median ${pct(s.medLanded, 3)}</span></b></div>`;
    renderExtraRows();
  }
  if (!$('#fast-net')) return;
  if (!s) return;
  if (s.error) { if ($('#vrank')) { $('#vrank').closest('.tile').querySelector('.val').textContent = 'N/A'; $('#vrank').textContent = ''; } return; }
  if (s.mine != null) $('#fast-net').closest('.tile').querySelector('.val').textContent = pct(s.mine);
  if ($('#vrank')) { $('#vrank').closest('.tile').querySelector('.val').textContent = s.rank ? '#' + num(s.rank) : 'N/A'; $('#vrank').textContent = `of ${num(s.n)} validators that vote`; }
}

/* network comparison for voting: one ~0.8 MB request, computed in the browser, at most every 10 minutes */
let _lbAt = 0;
async function loadNetSummary(E) {
  const ce = E.partCur ? E.partCur.epoch : null; if (!ce) return;
  if (_S && !_S.error && _S.epoch === ce && Date.now() - _lbAt < 10 * 60 * 1000) return;
  let s = cacheGet('vx_lbp2_' + ce, 10 * 60 * 1000);
  try {
    if (!s) {
      const lb = await getJSON(`${VX}/epochs/leaderboard/participation?epoch=${ce}`, 30000);
      const recs = lb.records.filter(r => r.rank != null && r.eligibleSlots > 0);
      const mine = lb.records.find(r => r.voteAddress === VOTE);
      const fasts = recs.map(r => lb.finalizedCerts > 0 ? 100 * r.finalizedSlots / lb.finalizedCerts : null);
      const landed = recs.map(r => 100 * (1 - r.missedSlots / r.eligibleSlots));
      s = { epoch: ce, median: med(fasts), medLanded: med(landed), mineLanded: mine && mine.eligibleSlots > 0 ? 100 * (1 - mine.missedSlots / mine.eligibleSlots) : null, n: recs.length, rank: mine && mine.rank != null ? mine.rank + 1 : null, mine: mine && lb.finalizedCerts > 0 ? 100 * mine.finalizedSlots / lb.finalizedCerts : null };
      cacheSet('vx_lbp2_' + ce, s);
    }
    _S = s; _lbAt = Date.now();
  } catch (e) { console.warn(e); _S = { error: true }; }
  applyNetSummary();
}

/* Stakewiz, single validator (about 2 KB): stake, APY and vote success for the epoch in progress */
async function refreshStakewiz() {
  const v = await getJSON(`${SW}/validator/${VOTE}`);
  if (!v || v.vote_identity !== VOTE) return;
  // keep the validator list in step with the cards, so the comparison rows use the same fresh numbers
  const m = typeof _vals !== 'undefined' && _vals ? me(_vals) : null;
  if (m) {
    const oldStake = m.stake;
    Object.assign(m, { stake: v.activated_stake, apy: v.total_apy, apyStake: v.staking_apy, apyJito: v.jito_apy, vote_s: v.vote_success, uptime: v.uptime, comm: (v.commission ?? 0) / 100, mev: (v.jito_commission_bps ?? 0) / 100, skip: v.wiz_skip_rate });
    _vals.total += v.activated_stake - oldStake; m.share = 100 * v.activated_stake / _vals.total;
    set('share_sub', `${pct(m.share, 2)} of network stake`);
    set('comm', pct(m.comm, 0)); set('comm_sub', `On rewards &middot; ${pct(m.mev, 0)} on MEV`);
    if (window.__renderCompare) window.__renderCompare();
  }
  set('stake', `${num(v.activated_stake)}<small>SOL</small>`);
  set('skip', pct(v.wiz_skip_rate));
  if (v.epoch) { chip(true, `Live · epoch ${num(v.epoch)}`); set('epoch_now', num(v.epoch)); } // header chip follows the epoch in progress
  set('apy', pct(v.total_apy));
  set('apy_split', `10-epoch median &middot; Staking ${pct(v.staking_apy)} + Jito ${pct(v.jito_apy)}`);
  set('vote', pct(v.vote_success));
  set('uptime', pct(v.uptime, 0));
}

/* Keeps the figures of the epoch in progress up to date without hammering the APIs.
   Vortex limits (per client): 10 requests/s, burst 300, 256 KB/s. One cycle is about 23 KB and 3 requests, once a minute,
   and it pauses while the tab is hidden. Any error doubles the wait (up to 10 minutes). */
async function perfExtras() {
  const vt = $('#vt'), pt = $('#pt'); if (!vt) return;
  let E, delay = 60000, timer = null, lastRun = 0, listAt = Date.now();
  try { E = await loadEpochData(); } catch (e) { console.warn(e); vt.innerHTML = pt.innerHTML = '<p class="note">Epoch data is temporarily unavailable.</p>'; set('blocks_now', 'N/A'); return; }
  renderPerf(E);
  loadNetSummary(E);


  // brief gold highlight on any figure whose value changed after a refresh
  const VALS = '.grid-6 .val, .tile .val';
  const labelOf = v => { const l = v.parentElement.querySelector('.lbl'); return l ? l.textContent : null; };
  const snap = () => new Map([...document.querySelectorAll(VALS)].map(v => [labelOf(v), v.textContent]));
  const flashChanges = before => document.querySelectorAll(VALS).forEach(v => {
    const k = labelOf(v);
    if (k && before.has(k) && before.get(k) !== v.textContent) { v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash'); }
  });

  async function cycle() {
    lastRun = Date.now();
    const before = snap();
    try {
      // small requests: only the latest 3 epochs
      const [p3, q3] = await Promise.all([
        getJSON(`${VX}/epochs/participation?voteKey=${VOTE}&limit=3`),
        getJSON(`${VX}/epochs/production?voteKey=${VOTE}&limit=3&minLeaderSlots=1&sortBy=scoredInclusion`)
      ]);
      const curPart = p3.filter(x => !x.complete && x.eligibleSlots > 0).sort((a, b) => b.epoch - a.epoch)[0];
      const curProd = q3.filter(x => !x.complete).sort((a, b) => b.epoch - a.epoch)[0];
      if (curPart && E.partCur && curPart.epoch !== E.partCur.epoch) E = await loadEpochData(true); // a new epoch started: reload the full history once
      else { if (curPart) E.partCur = curPart; if (curProd) E.prodCur = curProd; }
      renderPerf(E);
      loadNetSummary(E);
      // the full Stakewiz list (network medians) is reloaded every 10 minutes
      if (Date.now() - listAt > 10 * 60 * 1000) {
        const keep = _vals;
        try { sessionStorage.removeItem('sw_vals5'); _vals = null; await getValidators(); listAt = Date.now(); } catch (e) { _vals = keep; console.warn(e); }
      }
      await refreshStakewiz();
      flashChanges(before);
      delay = 60000;
    } catch (e) { console.warn('refresh failed, backing off', e); delay = Math.min(delay * 2, 10 * 60 * 1000); }
    schedule();
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(() => { if (document.hidden) return; cycle(); }, delay); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastRun >= delay) cycle(); });
  schedule();
}

/* ---------- Staking ---------- */
const KIND = { sfdp: 'Solana Foundation Delegation Program', 'stake-pool': 'Liquid staking pools', marinade: 'Marinade', other: 'Other wallets' };
const short = v => v >= 1e6 ? `${v / 1e6}M` : v >= 1e3 ? `${v / 1e3}K` : String(v);
const SIZE_LABEL = r => r.maxSol == null ? `${short(r.minSol)}+` : r.minSol === 0 ? `Under ${short(r.maxSol)}` : `${short(r.minSol)}–${short(r.maxSol)}`;
async function pageStaking(refresh = false) {
  let del, sc, stat = null;
  try { [del, sc, stat] = await Promise.all([getJSON(`${VX}/validators/delegators?identity=${IDENTITY}`), getJSON(`${VX}/validators/stake-changes?identity=${IDENTITY}&limit=50`), getJSON(`${VX}/validators/status?identity=${IDENTITY}`).catch(() => null)]); }
  catch (e) { console.warn(e); if (refresh) return; chip(false, 'Live data unavailable'); $('#st-tiles').innerHTML = '<p class="note">Staking data is temporarily unavailable.</p>'; return; }
  // share of network stake: same figure as on Performance (Stakewiz list), so the two pages always agree
  let shareNet = null;
  try { const D = await getValidators(); const m = me(D); if (m) shareNet = m.share; } catch (e) { console.warn(e); }
  chip(true, `Live · epoch ${num(del.epoch)}`);
  const active = del.stake;
  // completed epochs only (the one in progress is incomplete)
  const rows = (Array.isArray(sc) ? sc : []).filter(r => r.epoch < del.epoch).sort((a, b) => a.epoch - b.epoch);
  const last30 = rows.slice(-30);
  const net30 = last30.reduce((a, r) => a + r.net, 0), new30 = last30.reduce((a, r) => a + (r.newDelegators || 0), 0), out30 = last30.reduce((a, r) => a + (r.exitedDelegators || 0), 0);
  const nextNet = del.activating - del.deactivating;
  const top = del.top[0];
  $('#st-tiles').innerHTML = tile('Active stake', `${sol(active, 0)}<small>SOL</small>`, shareNet == null ? 'Delegated to SoLyrae' : `${pct(shareNet, 2)} of network stake`)
    + tile('Stakers', num(del.delegators), `${num(del.stakeAccounts)} stake accounts`)
    + tile('Entering next epoch', `+${sol(del.activating, 0)}<small>SOL</small>`, 'Stake activating')
    + tile('Leaving next epoch', `−${sol(del.deactivating, 0)}<small>SOL</small>`, 'Stake deactivating');

  /* next epoch: who is about to put stake in or take it out (named sources only, never wallet addresses) */
  const mv = new Map();
  (del.changes || []).forEach(c => {
    const mar = c.label && c.label.kind === 'marinade';
    const name = mar ? 'Marinade' : (c.label ? c.label.name : 'Other wallets');
    const full = mar ? 'mSOL and Marinade Native' : (c.label ? (c.label.fullName || '') : 'Wallets without a known label');
    const g = mv.get(name) || { name, full, act: 0, deact: 0, accounts: 0 };
    g.act += c.activating || 0; g.deact += c.deactivating || 0; g.accounts += c.stakeAccounts || 0; mv.set(name, g);
  });
  const moves = [...mv.values()];
  const list = (arr, key, sign, none) => arr.length
    ? arr.sort((a, b) => b[key] - a[key]).map(g => `<div class="row"><span>${esc(g.name)} <span class="note">${esc(g.full)}</span></span><b>${sign}${num(g[key] / L, 2)} SOL</b></div>`).join('')
    : `<p class="note" style="padding:6px 0">${none}</p>`;
  $('#ne-in').innerHTML = list(moves.filter(g => g.act > 0), 'act', '+', 'No stake is activating.');
  $('#ne-out').innerHTML = list(moves.filter(g => g.deact > 0), 'deact', '−', 'No stake is deactivating.');

  /* where the stake comes from: one bar split by named source */
  const labelled = del.top.filter(t => t.label);
  const byName = new Map();
  // Marinade's two products (mSOL and Marinade Native) are shown together as Marinade
  labelled.forEach(t => { const mar = t.label.kind === 'marinade'; const k = mar ? 'Marinade' : t.label.name; const g = byName.get(k) || { name: k, full: mar ? 'mSOL and Marinade Native' : (t.label.fullName || ''), stake: 0, accounts: 0 }; g.stake += t.stake; g.accounts += t.stakeAccounts; byName.set(k, g); });
  const parts = [...byName.values()].sort((a, b) => b.stake - a.stake);
  const known = parts.reduce((a, g) => a + g.stake, 0), knownAcc = parts.reduce((a, g) => a + g.accounts, 0);
  parts.push({ name: 'Other wallets', full: 'Wallets without a known label', stake: Math.max(0, active - known), accounts: Math.max(0, del.stakeAccounts - knownAcc) });
  const seg = ['sg1', 'sg2', 'sg3', 'sg4', 'sg5', 'sg6'];
  // the bar has at most 6 colours: the 4 largest named sources, the rest of the named ones together, and "Other wallets";
  // the table below still lists every source
  const MAX_NAMED = 4, named = parts.slice(0, -1), other = parts[parts.length - 1];
  const segs = named.slice(0, MAX_NAMED);
  const rest = named.slice(MAX_NAMED);
  if (rest.length) segs.push({ name: 'Other sources', stake: rest.reduce((a, g) => a + g.stake, 0) });
  segs.push(other);
  const colorOf = i => i < MAX_NAMED ? seg[i] : (i === parts.length - 1 ? seg[segs.length - 1] : seg[MAX_NAMED]); // index i in `parts`
  $('#st-kinds').innerHTML = `<div class="stackbar" role="img" aria-label="Share of stake by source">${segs.map((g, i) => `<i class="${seg[i]}" style="width:${(100 * g.stake / active).toFixed(2)}%;min-width:${g.stake > 0 ? 3 : 0}px" title="${esc(g.name)}: ${pct(100 * g.stake / active, 1)}"></i>`).join('')}</div>`;
  $('#st-sources').innerHTML = `<table style="min-width:560px"><thead><tr><th class="l">Source</th><th>Stake (SOL)</th><th>Share</th><th>Stake accounts</th></tr></thead><tbody>${parts.map((g, i) => `<tr style="cursor:default"><td class="l"><b style="font-family:var(--sans);font-weight:500"><i class="dotb ${colorOf(i)}"></i>${esc(g.name)}</b><div class="note" style="font-family:var(--sans);margin-left:20px">${esc(g.full)}</div></td><td>${num(g.stake / L)}</td><td>${pct(100 * g.stake / active, 2)}</td><td>${num(g.accounts)}</td></tr>`).join('')}</tbody></table>`;

  /* movements */
  if (rows.length) {
    $('#ch-changes').innerHTML = svgBars(rows.map(r => ({ x: 'Ep ' + r.epoch, y: r.net / L, tip: `Epoch ${r.epoch}: net ${r.net >= 0 ? '+' : '−'}${num(Math.abs(r.net) / L, 0)} SOL (in ${num(r.inflow / L, 0)}, out ${num(r.outflow / L, 0)})` })), { fmt: v => compact(Math.abs(v)) + (v < 0 ? ' out' : ''), label: 'Net stake change per epoch' });
    const lo = Math.min(...rows.map(r => r.stakeAfter / L)), hi = Math.max(...rows.map(r => r.stakeAfter / L));
    $('#ch-stakers').innerHTML = svgLine(rows.map(r => ({ x: 'Ep ' + r.epoch, y: r.stakeAfter / L, tip: `Epoch ${r.epoch}: ${num(r.stakeAfter / L, 0)} SOL` })), { yMin: Math.floor(lo / 1000) * 1000, yMax: Math.ceil(hi / 1000) * 1000, fmt: v => compact(v), label: 'Active stake per epoch' });
    $('#st-hist').innerHTML = `<table style="min-width:640px"><thead><tr><th>Epoch</th><th>Stake at end (SOL)</th><th>In (SOL)</th><th>Out (SOL)</th><th>Net stake change (SOL)</th><th>Change (%)</th></tr></thead><tbody>${[...rows].reverse().slice(0, 10).map(r => { const cls = r.net < 0 ? 'bad' : r.net > 0 ? 'good' : '', sg = r.net >= 0 ? '+' : '−', ch = r.stakeBefore > 0 ? 100 * r.net / r.stakeBefore : null; return `<tr style="cursor:default"><td>${r.epoch}</td><td>${num(r.stakeAfter / L)}</td><td>${num(r.inflow / L, 0)}</td><td>${num(r.outflow / L, 0)}</td><td class="${cls}">${sg}${num(Math.abs(r.net) / L, 0)}</td><td class="${cls}">${ch == null ? 'N/A' : sg + num(Math.abs(ch), 2) + '%'}</td></tr>`; }).join('')}</tbody></table>`;
  }

  /* sizes */
  const sizes = (del.sizes || []).filter(r => r.delegators > 0 || r.stake > 0);
  $('#st-sizes').innerHTML = `<table style="min-width:480px"><thead><tr><th class="l">Stake per staker (SOL)</th><th>Stakers</th><th>Stake (SOL)</th><th>Share</th></tr></thead><tbody>${sizes.map(r => `<tr style="cursor:default"><td class="l">${SIZE_LABEL(r)}</td><td>${num(r.delegators)}</td><td>${num(r.stake / L)}</td><td>${pct(100 * r.stake / active, 2)}</td></tr>`).join('')}</tbody></table>`;
  $('#ch-sizes').innerHTML = svgBars((del.sizes || []).filter(r => r.delegators > 0).map(r => ({ x: SIZE_LABEL(r), y: r.delegators, tip: `${SIZE_LABEL(r)} SOL: ${num(r.delegators)} stakers · ${pct(100 * r.stake / active, 2)} of stake` })), { label: 'Stakers by stake size' });
}

/* ---------- Rewards: comparison with the whole network ---------- */
function svgHist(vals, marks) {
  const W = 560, H = 190, P = { l: 36, r: 10, t: 22, b: 30 };
  // validators with exactly 0 get their own bar on the left; everyone else is split into equal-width bars
  const zeros = vals.filter(v => v === 0).length, pos = vals.filter(v => v > 0), off = zeros ? 1 : 0, nb = 26 - off, S = nb + off;
  const s = [...pos].sort((a, b) => a - b), q = p => s[Math.floor(p * (s.length - 1))];
  const lo = q(0.01), hi = q(0.99), bw = (hi - lo) / nb;
  const cnt = Array(S).fill(0);
  if (zeros) cnt[0] = zeros;
  pos.forEach(v => { const i = Math.max(0, Math.min(nb - 1, Math.floor((v - lo) / bw))); cnt[off + i]++; });
  const mx = Math.max(...cnt), cw = (W - P.l - P.r) / S;
  const x = v => v === 0 ? P.l + cw / 2 : P.l + cw * off + (W - P.l - P.r - cw * off) * Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const y = c => P.t + (H - P.t - P.b) * (1 - c / mx);
  const tipOf = i => {
    if (zeros && i === 0) return `No rewards: ${cnt[0]} validators`;
    const j = i - off, a = lo + j * bw, b = lo + (j + 1) * bw;
    return j === 0 ? `Up to ${b.toFixed(3)} SOL: ${cnt[i]} validators` : j === nb - 1 ? `${a.toFixed(3)} SOL or more: ${cnt[i]} validators` : `${a.toFixed(3)} to ${b.toFixed(3)} SOL: ${cnt[i]} validators`;
  };
  const bars = cnt.map((c, i) => `<rect x="${(P.l + i * cw + cw * 0.06).toFixed(1)}" y="${y(c).toFixed(1)}" width="${(cw * 0.88).toFixed(1)}" height="${Math.max(1, (H - P.b) - y(c)).toFixed(1)}" class="c-bar" style="opacity:.55" data-tip="${esc(tipOf(i))}"></rect>`).join('');
  const lines = marks.map((m, k) => `<line x1="${x(m.v).toFixed(1)}" x2="${x(m.v).toFixed(1)}" y1="${P.t - 6}" y2="${H - P.b}" class="${m.cls}"/><text x="${(x(m.v) + (k ? -5 : 5)).toFixed(1)}" y="${P.t - 9}" class="c-t" text-anchor="${k ? 'end' : 'start'}">${esc(m.label)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="Distribution of total rewards per 1,000 SOL across validators"><line x1="${P.l}" x2="${W - P.r}" y1="${H - P.b}" y2="${H - P.b}" class="c-grid"/>${bars}${lines}
    ${zeros ? `<text x="${(P.l + cw / 2).toFixed(1)}" y="${H - 8}" class="c-t" text-anchor="middle">0</text>` : ''}<text x="${(P.l + cw * off + (off ? 8 : 0)).toFixed(1)}" y="${H - 8}" class="c-t">${lo.toFixed(2)}</text><text x="${((P.l + cw * off + W - P.r) / 2).toFixed(1)}" y="${H - 8}" class="c-t" text-anchor="middle">${((lo + hi) / 2).toFixed(2)}</text><text x="${W - P.r}" y="${H - 8}" class="c-t" text-anchor="end">${hi.toFixed(2)} SOL</text>
    <text x="${P.l - 6}" y="${H - P.b + 4}" class="c-t" text-anchor="end">0</text><text x="${P.l - 6}" y="${P.t + 4}" class="c-t" text-anchor="end">${mx}</text></svg>`;
}
function lazyNetwork(epoch) {
  const sec = $('#rn-sec'); if (!sec || !epoch) return;
  const run = () => rewardsNetwork();
  if ('IntersectionObserver' in window) { const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); run(); } }, { rootMargin: '400px' }); io.observe(sec); }
  else run();
}
async function rewardsNetwork() {
  // Net rewards per 1,000 SOL staked for every validator (inflation net of commission + MEV tips paid to stakers).
  // One source only (Vortex). Built by tools/build_network_rewards.py once per epoch and saved in data/network_rewards.json.
  const tiles = $('#rn-tiles');
  try {
    const r0 = await fetch('data/network_rewards.json', { cache: 'no-cache' });
    if (!r0.ok) throw new Error('HTTP ' + r0.status);
    const J = await r0.json();
    let rows = J.rows.map(r => ({ vote: r[0], infl: r[1], tips: r[2], total: r[3] }));
    // same validator list as the Explorer (Stakewiz, validators with stake today); their rewards come from Vortex
    let late = 0;
    try { const D = await getValidators(); const inList = new Set(D.list.map(v => v.vote)); rows = rows.filter(r => inList.has(r.vote)); late = D.list.length - rows.length; } catch (e) { console.warn(e); }
    const mine = rows.find(r => r.vote === VOTE);
    if (!mine || rows.length < 50) throw new Error('not enough data');
    const epoch = J.epoch;
    const pc = (key, p) => { const s = rows.map(r => r[key]).sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
    const rank = rows.filter(r => r.total > mine.total).length + 1;
    const medT = pc('total', 0.5);
    const dPct = (mine.total / medT - 1) * 100, dAbs = mine.total - medT, sg = dAbs >= 0 ? '+' : '&minus;';
    tiles.innerHTML = tile('Network Median Rewards', `${num(medT, 3)}<small>SOL</small>`, `Per 1,000 SOL &middot; epoch ${epoch}`)
      + tile('SoLyrae vs Network Median Rewards', `${sg}${num(Math.abs(dAbs), 3)}<small>SOL</small>`, `Per 1,000 SOL &middot; epoch ${epoch} &middot; ${num(Math.abs(dPct), 1)}% ${dAbs >= 0 ? 'higher' : 'lower'}`)
      + tile('Rank', `#${num(rank)}`, `of ${num(rows.length)} validators`);
    const zero = rows.filter(r => r.total === 0).length;
    if (zero) $('#rn-count').textContent = `${num(rows.length)} validators with stake in epoch ${epoch}, ${num(zero)} of them with no rewards.${late > 0 ? ` ${num(late)} newer validators are not included.` : ''}`;
    $('#rn-chart').innerHTML = svgHist(rows.map(r => r.total), [{ v: mine.total, cls: 'm-me', label: 'SoLyrae' }, { v: medT, cls: 'm-med', label: 'Median' }]);
    const f = (v, d) => num(v, d);
    const line = (name, key, d) => { const m = pc(key, 0.5), a = mine[key] - m, s = a >= 0 ? '+' : '&minus;'; return `<tr style="cursor:default"><td class="l"><b style="font-family:var(--sans);font-weight:500">${name}</b></td><td>${f(mine[key], d)}</td><td>${f(m, d)}</td><td>${s}${f(Math.abs(a), d)}</td><td>${m > 0 ? s + f(Math.abs(a / m * 100), 1) + '%' : '&ndash;'}</td></tr>`; };
    $('#rn-table').innerHTML = `<table style="min-width:560px"><thead><tr><th class="l">SOL per 1,000 SOL staked, net of commission</th><th>SoLyrae</th><th>Network median</th><th>Difference (SOL)</th><th>Difference (%)</th></tr></thead><tbody>${line('Inflation rewards', 'infl', 4)}${line('MEV tips', 'tips', 4)}${line('Total rewards', 'total', 4)}</tbody></table>`;
  } catch (e) { console.warn(e); tiles.innerHTML = '<p class="note">The comparison with the network is temporarily unavailable.</p>'; }
}

/* ---------- Earnings ---------- */
async function pageEarnings(refresh = false) {
  let earn, tips, part;
  try { [earn, tips, part] = await Promise.all([getJSON(`${VX}/epochs/earnings?identity=${IDENTITY}&limit=33`), getJSON(`${VX}/validators/tips?identity=${IDENTITY}&limit=33`), getJSON(`${VX}/epochs/participation?voteKey=${VOTE}&limit=33`)]); }
  catch (e) { console.warn(e); if (refresh) return; chip(false, 'Live data unavailable'); $('#ea-tiles').innerHTML = '<p class="note">Rewards data is temporarily unavailable.</p>'; return; }
  const epochNow = Math.max(...earn.map(r => r.epoch));
  chip(true, `Live · epoch ${num(epochNow)}`);
  const lostBy = new Map(part.map(p => [p.epoch, p.rewards ? p.rewards.missedLamports : null]));
  const rows = earn.filter(r => r.income).sort((a, b) => b.epoch - a.epoch).map(r => {
    const v = r.income.votingReward || 0, pr = r.income.producerBonus || 0, tot = r.income.inflationRewardGross || (v + pr), com = r.income.voteAccountReward || 0; // commission kept by the validator, paid into its vote account (same field the network comparison uses)
    return { epoch: r.epoch, v, pr, tot, com, lost: lostBy.get(r.epoch), live: r.epoch === epochNow };
  });
  const done = rows.filter(r => !r.live);
  const stakeBy = new Map(part.map(p => [p.epoch, p.stake])); // stake the validator had in each epoch (same field as the network comparison)
  // total rewards of a completed epoch = inflation rewards + MEV tips paid to stakers
  const tipsBy = new Map((tips.epochs || []).filter(t => t.total && t.complete).map(t => [t.epoch, t.total.stakers || 0]));
  const totalOf = r => (r.tot - r.com) + (tipsBy.get(r.epoch) || 0); // net of the validator's commission
  const last = done[0], tipsLast = last ? tipsBy.get(last.epoch) : null;
  const totalLast = last ? totalOf(last) : null;
  const stakeLast = last ? stakeBy.get(last.epoch) : null;
  const perSol = stakeLast > 0 && totalLast != null ? totalLast / stakeLast : null; // SOL earned per SOL staked in that epoch
  const n10 = Math.min(10, done.length);
  $('#ea-tiles').innerHTML = tile('Total rewards', totalLast == null ? 'N/A' : `${sol(totalLast)}<small>SOL</small>`, last ? `Epoch ${last.epoch} &middot; inflation + MEV tips` : '')
    + tile('Per 1,000 SOL staked', perSol == null ? 'N/A' : `${num(perSol * 1000, 3)}<small>SOL</small>`, 'Per epoch, from total rewards')
    + tile('MEV tips', tipsLast == null ? 'N/A' : `${sol(tipsLast, 3)}<small>SOL</small>`, last ? `Epoch ${last.epoch} &middot; paid to stakers` : '')
    + (n10 ? tile('Average per epoch', `${sol(done.slice(0, n10).reduce((a, r) => a + totalOf(r), 0) / n10)}<small>SOL</small>`, `Total rewards, last ${n10} epochs`) : '');
  lazyNetwork(done[0] ? done[0].epoch : null); // network comparison: loads when its section scrolls into view

  $('#ch-rewards').innerHTML = svgBars([...done].reverse().map(r => ({ x: 'Ep ' + r.epoch, y: (r.tot - r.com) / L, tip: `Epoch ${r.epoch}: ${sol(r.tot - r.com, 3)} SOL to stakers${r.v + r.pr > 0 ? ` (voting ${sol(r.v, 3)} + production ${sol(r.pr, 3)}${r.com > 0 ? ` − commission ${sol(r.com, 3)}` : ''})` : ''}` })), { fmt: v => v.toFixed(1), label: 'Inflation rewards to stakers per epoch (SOL)' });
  $('#ea-rewards').innerHTML = `<table style="min-width:640px"><thead><tr><th>Epoch</th><th>Voting (SOL)</th><th>Block production (SOL)</th><th>Total (SOL)</th><th>Commission</th><th>Missed-vote loss (SOL)</th></tr></thead><tbody>${done.slice(0, 12).map(r => `<tr style="cursor:default"><td>${r.epoch}${r.live ? ' <span class="note">so far</span>' : ''}</td><td>${sol(r.v)}</td><td>${sol(r.pr)}</td><td>${sol(r.tot)}</td><td>${sol(r.com, 4)}</td><td>${r.lost == null ? 'N/A' : sol(r.lost, 4)}</td></tr>`).join('')}</tbody></table>`;

  const tr = (tips.epochs || []).filter(t => t.total).sort((a, b) => b.epoch - a.epoch);
  if (tr.length) {
    const tdone = tr.filter(t => t.complete);
    $('#ch-tips').innerHTML = svgBars([...tdone].reverse().map(t => ({ x: 'Ep ' + t.epoch, y: t.total.stakers / L, tip: `Epoch ${t.epoch}: ${sol(t.total.stakers, 4)} SOL to stakers` })), { fmt: v => v.toFixed(2), label: 'MEV tips paid to stakers per epoch (SOL)' });
    $('#ea-tips').innerHTML = `<table style="min-width:600px"><thead><tr><th>Epoch</th><th>Jito tips (SOL)</th><th>Jito fees (SOL)</th><th>Validator (SOL)</th><th>Stakers (SOL)</th></tr></thead><tbody>${tdone.slice(0, 12).map(t => `<tr style="cursor:default"><td>${t.epoch}${t.complete ? '' : ' <span class="note">so far</span>'}</td><td>${sol(t.total.gross, 4)}</td>${t.complete ? `<td>${sol((t.total.builderFee || 0) + (t.total.protocolFee || 0), 4)}</td><td>${sol(t.total.validatorCut || 0, 4)}</td><td>${sol(t.total.stakers || 0, 4)}</td>` : '<td>&mdash;</td><td>&mdash;</td><td>&mdash;</td>'}</tr>`).join('')}</tbody></table>`;
  }
}

/* ---------- Infrastructure: health checks (public ones only) ---------- */
const CHECKS = { gossip: 'Visible on the network', voting: 'Voting', vote_authority: 'Voting key', sfdp_version_mainnet: 'Mainnet software', sfdp_version_testnet: 'Testnet node', concentration: 'Hosting concentration' };
async function infraChecks(refresh = false) {
  const el = $('#checks'); if (!el) return;
  try {
    const st = await getJSON(`${VX}/validators/status?identity=${IDENTITY}`);
    const rows = (st.checks || []).filter(c => CHECKS[c.id]);
    el.innerHTML = rows.length ? rows.map(c => `<div class="row"><span><i class="dotc ${c.status === 'ok' ? 'ok' : c.status === 'warn' ? 'warn' : 'bad'}"></i>${CHECKS[c.id]}</span><b style="font-family:var(--sans);font-weight:400;text-align:right">${esc(c.summary)}</b></div>`).join('') : '<p class="note">No checks available.</p>';
  } catch (e) { console.warn(e); if (!refresh) el.innerHTML = '<p class="note" style="padding:12px 0">Checks are temporarily unavailable.</p>'; }
}

/* ---------- Infrastructure: connection quality ---------- */
async function infraExtras(refresh = false) {
  infraChecks(refresh);
  const el = $('#lat'); if (!el) return;
  try {
    const j = await getJSON(`${VX}/validators/pace?voteKey=${VOTE}&limit=3`);
    const eps = (j.epochs || []).filter(e => e.slotDuration && e.slotDuration.handoff && e.slotDuration.handoff.count > 0).sort((a, b) => b.epoch - a.epoch);
    const e = eps[0]; if (!e) { if (!refresh) el.innerHTML = '<p class="note">No data yet for this epoch.</p>'; return; }
    const sd = e.slotDuration, cl = e.cluster || {};
    const ms = v => v == null ? 'N/A' : `${num(v, 1)}<small>ms</small>`;
    const vs = c => c == null ? 'Network median: N/A' : `Network median: ${num(c, 1)} ms`;
    el.innerHTML = tile('Time between blocks', ms(sd.inWindow.p50Ms), vs(cl.inWindow && cl.inWindow.p50Ms))
      + tile('Handoff to us', ms(sd.handoff.p50Ms), vs(cl.handoff && cl.handoff.p50Ms))
      + tile('Handoff from us', ms(sd.handoffOut && sd.handoffOut.p50Ms), 'Median over this epoch');
    const label = !e.complete ? '' : `Epoch ${e.epoch}`;
    document.querySelectorAll('.lat-note').forEach(n => n.remove());
    if (label) el.insertAdjacentHTML('afterend', `<p class="note lat-note" style="margin-top:10px">${label}</p>`);
  } catch (err) { console.warn(err); if (!refresh) el.innerHTML = '<p class="note">Connection data is temporarily unavailable.</p>'; }
}


document.addEventListener('DOMContentLoaded', () => {
  const p = document.body.dataset.page;
  if (p === 'infrastructure') {
    infraExtras();
    // node data (Stakewiz list) and checks / connection quality (Vortex) every 5 minutes
    autoRefresh(5 * 60 * 1000, async () => { const keep = _vals; sessionStorage.removeItem('sw_vals5'); _vals = null; try { await getValidators(); } catch (e) { _vals = keep; return; } await refreshNet(); await pageInfra(); await infraExtras(true); });
  }
  if (p === 'performance') perfExtras();
  if (p === 'staking') { pageStaking(); autoRefresh(5 * 60 * 1000, async () => { await refreshList(); await pageStaking(true); }); }
  if (p === 'rewards') { pageEarnings(); autoRefresh(10 * 60 * 1000, () => pageEarnings(true)); }
});
