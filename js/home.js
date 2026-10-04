// Home: rotating headline, the live quote card, the quote calculator, the request maker, the proof feed.
import { CONFIG, $, $$, esc, B58, short, usd, amt, ago, hue, getJ, quoteFor, tokens, routeHTML, copy, boot } from './core.js';
import { current } from './current.js';
import { motion, countTo } from './motion.js';

boot();
motion();
current($('#current'));

const KNOWN = [
  { symbol: 'SOL', mint: CONFIG.sol, decimals: 9 },
  { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', decimals: 6 },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
  { symbol: 'WIF', mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', decimals: 6 },
  { symbol: 'PYTH', mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', decimals: 6 },
  { symbol: 'RAY', mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6 },
];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// 1. rotating word in the headline
(() => {
  const rot = $('#rot'); if (!rot || reduced) return;
  const words = ['$SOL.', '$BONK.', '$JUP.', '$WIF.', 'your bags.'];
  let i = 0, cur = rot.firstElementChild;
  setInterval(() => {
    if (document.hidden) return;
    i = (i + 1) % words.length;
    const nx = document.createElement('span'); nx.className = 'down'; nx.textContent = words[i]; rot.append(nx);
    const old = cur; cur = nx;
    requestAnimationFrame(() => requestAnimationFrame(() => { old.classList.add('up'); nx.classList.remove('down'); }));
    setTimeout(() => old.remove(), 700);
  }, 2600);
})();

// 2. live quote card: $50 in four coins, real quotes, one at a time
(() => {
  const body = $('#qbody'), dots = $('#qdots'), live = $('#qlive'), card = $('#qcard');
  const AMT = 50, coins = KNOWN.slice(0, 4);
  let data = [], idx = 0, paused = false, timer = 0, prevAmt = 0;
  const show = (i, instant) => {
    const d = data[i]; if (!d) return;
    const paint = () => {
      body.innerHTML = `<div class="ask">Pay <b>${usd(AMT)}</b> with <b>${esc(d.c.symbol)}</b></div>
        <div class="big"><span class="cnt" data-v="${prevAmt}">${amt(prevAmt || d.inAmt)}</span><small>${esc(d.c.symbol)}</small></div>
        <div class="route">${routeHTML(d.quote, d.c.symbol)}</div>
        <div class="gets"><span>They receive</span><b>${d.exact ? 'exactly ' : 'at least '}${usd(AMT)} USDC</b></div>
        <div class="meta"><span>impact ${(Number(d.quote.priceImpactPct || 0) * 100).toFixed(2)}%</span><span data-age="${d.t}">${ago(d.t)}</span></div>`;
      body.classList.remove('fade');
      countTo(body.querySelector('.cnt'), d.inAmt, amt, 700); prevAmt = d.inAmt;
    };
    if (instant) paint(); else { body.classList.add('fade'); setTimeout(paint, 420); }
    $$('button', dots).forEach((b, k) => b.classList.toggle('on', k === i));
  };
  const offline = () => {
    live.classList.add('off'); live.lastElementChild.textContent = 'Quotes offline';
    body.innerHTML = `<div class="qoff"><p>The router did not answer.</p><button class="btn light sm" type="button" id="qRetry">Retry ↻</button></div>`;
    $('#qRetry').onclick = load;
  };
  async function load() {
    const got = await Promise.all(coins.map(async c => {
      const r = await getJ(`/api/jup?op=quote&in=${c.mint}&amount=${AMT * 1e6}&mode=ExactOut&slip=100&max=40`);
      return r.ok ? { c, quote: r.quote, exact: true, inAmt: Number(r.quote.inAmount) / 10 ** c.decimals, t: Date.now() } : null;
    }));
    const ok = got.filter(Boolean);
    if (!ok.length) { if (!data.length) offline(); return; }
    data = ok; live.classList.remove('off'); live.lastElementChild.textContent = 'Live quote';
    if (!dots.children.length || dots.children.length !== data.length) {
      dots.innerHTML = data.map((d, k) => `<button type="button" aria-label="${esc(d.c.symbol)}"></button>`).join('');
      $$('button', dots).forEach((b, k) => b.onclick = () => { idx = k; show(k); });
    }
    if (idx >= data.length) idx = 0;
    show(idx, true);
  }
  card.addEventListener('mouseenter', () => paused = true);
  card.addEventListener('mouseleave', () => paused = false);
  load();
  timer = setInterval(() => { if (!paused && !document.hidden && data.length > 1) { idx = (idx + 1) % data.length; show(idx); } }, 4600);
  setInterval(() => { if (!document.hidden) load(); }, 30000);
  setInterval(() => $$('[data-age]', body).forEach(e => e.textContent = ago(+e.dataset.age)), 1000);
})();

// 3. the quote calculator
(() => {
  const amtIn = $('#qAmt'), box = $('#qAmtBox'), chips = $('#qChips'), mintIn = $('#qMint'), out = $('#qOut'), msg = $('#qMsg');
  let pick = null, seq = 0, t = 0;
  chips.innerHTML = KNOWN.map(c => `<button class="chip" type="button" data-m="${c.mint}"><span class="dot" style="background:${hue(c.symbol)}"></span>${c.symbol}</button>`).join('')
    + `<button class="chip" type="button" data-m="${CONFIG.usdc}"><span class="dot" style="background:#2563EB"></span>USDC</button>`;
  $$('.chip', chips).forEach(b => b.onclick = () => {
    $$('.chip', chips).forEach(x => x.classList.toggle('on', x === b)); mintIn.value = '';
    const k = KNOWN.find(c => c.mint === b.dataset.m);
    pick = k ? { ...k } : { symbol: 'USDC', mint: CONFIG.usdc, decimals: 6 };
    run();
  });
  mintIn.addEventListener('input', () => {
    clearTimeout(t); const v = mintIn.value.trim(); $$('.chip', chips).forEach(x => x.classList.remove('on'));
    if (!v) { pick = null; out.hidden = true; msg.textContent = ''; return; }
    if (!B58.test(v)) { msg.textContent = 'That is not a token mint address.'; out.hidden = true; return; }
    t = setTimeout(async () => {
      msg.textContent = '';
      const list = await tokens(v); const tk = list.find(x => x.mint === v);
      if (!tk) { msg.textContent = 'The router does not know this token.'; out.hidden = true; return; }
      pick = { symbol: tk.symbol, mint: tk.mint, decimals: tk.decimals, price: tk.usd }; run();
    }, 350);
  });
  amtIn.addEventListener('input', () => { amtIn.value = amtIn.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'); clearTimeout(t); t = setTimeout(run, 350); });
  async function run() {
    const v = parseFloat(amtIn.value); box.classList.remove('bad'); msg.textContent = '';
    if (!pick || !(v > 0)) { out.hidden = true; return; }
    if (v < CONFIG.minUsd || v > CONFIG.maxUsd) { box.classList.add('bad'); msg.textContent = `Between ${usd(CONFIG.minUsd)} and ${usd(CONFIG.maxUsd)}.`; out.hidden = true; return; }
    const my = ++seq; out.hidden = false;
    out.innerHTML = `<div class="k">You spend</div><div class="v"><span class="spin"></span></div>`;
    if (pick.mint === CONFIG.usdc) {
      out.innerHTML = `<div class="k">You spend</div><div class="v">${amt(v)}<small> USDC</small></div>
        <div class="rows"><div><span>They receive</span><span>exactly ${usd(v)} USDC</span></div><div><span>Route</span><span>Direct transfer, no swap</span></div></div>
        <div style="margin-top:20px"><a class="btn dark" href="/pay?usd=${v}&in=${pick.mint}">Pay this <span class="arr">→</span></a></div>`;
      return;
    }
    if (!pick.price) { const tk = (await tokens(pick.mint)).find(x => x.mint === pick.mint); if (tk) pick.price = tk.usd; }
    const r = await quoteFor(pick.mint, v, pick.decimals, pick.price);
    if (my !== seq) return;
    if (r.error) { out.innerHTML = `<div class="k">You spend</div><div class="v" style="font-size:22px;color:var(--bad)">${esc(r.error)}</div>`; return; }
    const q = r.quote, spend = Number(q.inAmount) / 10 ** pick.decimals;
    const maxIn = r.exact ? Number(q.otherAmountThreshold) / 10 ** pick.decimals : spend;
    out.innerHTML = `<div class="k">You spend</div><div class="v">${amt(spend)}<small> ${esc(pick.symbol)}</small></div>
      <div class="rows">
        <div><span>They receive</span><span>${r.exact ? 'exactly' : 'at least'} ${usd(v)} USDC</span></div>
        <div><span>Route</span><span>${esc([...new Set((q.routePlan || []).map(p => p.swapInfo && p.swapInfo.label).filter(Boolean))].join(' + ') || 'Jupiter')}</span></div>
        <div><span>Price impact</span><span>${(Number(q.priceImpactPct || 0) * 100).toFixed(2)}%</span></div>
        <div><span>${r.exact ? 'Most you could spend' : 'Slippage limit'}</span><span>${r.exact ? amt(maxIn) + ' ' + esc(pick.symbol) : '1%'}</span></div>
      </div>
      <div style="margin-top:20px"><a class="btn dark" href="/pay?usd=${v}&in=${pick.mint}">Pay this <span class="arr">→</span></a></div>`;
  }
})();

// 4. request link + QR
(() => {
  const to = $('#rTo'), am = $('#rAmt'), note = $('#rNote'), go = $('#rGo'), msg = $('#rMsg'), out = $('#rOut');
  am.addEventListener('input', () => { am.value = am.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'); });
  [to, am, note].forEach(i => i.addEventListener('input', () => { out.hidden = true; msg.textContent = ''; $('#rToBox').classList.remove('bad'); $('#rAmtBox').classList.remove('bad'); }));
  go.onclick = () => {
    const a = to.value.trim(), v = parseFloat(am.value), n = note.value.trim().slice(0, 60);
    if (!B58.test(a)) { $('#rToBox').classList.add('bad'); msg.textContent = 'That is not a Solana address.'; return; }
    if (!(v >= CONFIG.minUsd && v <= CONFIG.maxUsd)) { $('#rAmtBox').classList.add('bad'); msg.textContent = `Enter an amount between ${usd(CONFIG.minUsd)} and ${usd(CONFIG.maxUsd)}.`; return; }
    const link = `${location.origin}/pay?to=${a}&usd=${Math.round(v * 100) / 100}${n ? '&note=' + encodeURIComponent(n) : ''}`;
    $('#rLink').textContent = link;
    $('#rOpen').href = link;
    $('#rShare').href = 'https://x.com/intent/post?text=' + encodeURIComponent(`Pay me ${usd(v)} with any coin on Solana:\n${link}`);
    $('#rCopy').onclick = () => copy(link, 'Link copied');
    $('#rQr').innerHTML = qrSvg(link);
    out.hidden = false;
  };
  function qrSvg(text) {
    if (!window.qrcode) return '';
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(); let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code for the payment link"><path d="${d}" fill="#0A0A0A"/></svg>`;
  }
})();

// 5. proof feed, rebuilt from the chain
(() => {
  const feed = $('#pFeed'), live = $('#pLive');
  $('#pRef').textContent = CONFIG.ref;
  $('#pCopy').onclick = () => copy(CONFIG.ref, 'Reference key copied');
  $('#pScan').href = 'https://solscan.io/account/' + CONFIG.ref;
  let shown = new Set();
  async function load() {
    const j = await getJ('/api/proof', 20000);
    if (!j.ok) {
      live.classList.add('off'); live.lastElementChild.textContent = 'Offline';
      if (!shown.size) feed.innerHTML = `<div class="empty"><b>Could not reach Solana.</b>The list is read live from the chain. <button class="btn light sm" type="button" id="pRetry" style="margin-left:8px">Retry ↻</button></div>`;
      const b = $('#pRetry'); if (b) b.onclick = load; return;
    }
    live.classList.remove('off'); live.lastElementChild.textContent = j.rows.length ? `${j.rows.length} latest` : 'Live';
    if (!j.rows.length) { feed.innerHTML = `<div class="empty"><b>No payments yet.</b>The first one appears here seconds after it settles.</div>`; return; }
    const fresh = j.rows.filter(r => !shown.has(r.sig));
    if (!shown.size) feed.innerHTML = '';
    fresh.reverse().forEach(r => {
      shown.add(r.sig);
      const el = document.createElement('div'); el.className = 'row';
      el.innerHTML = `<span class="when" data-t="${r.t}">${ago(r.t)}</span>
        <span class="who">${esc(short(r.from))}<em>→</em>${esc(short(r.to))}${r.note ? ' · ' + esc(r.note) : ''}</span>
        <span class="amt">${usd(r.usd)}<small>in ${esc(r.inSymbol || short(r.inMint))}</small></span>
        <a href="https://solscan.io/tx/${esc(r.sig)}" target="_blank" rel="noopener">tx ↗</a>`;
      feed.prepend(el);
    });
  }
  const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); load(); setInterval(() => { if (!document.hidden) load(); }, 20000); } }, { rootMargin: '400px' });
  io.observe(feed);
  setInterval(() => $$('[data-t]', feed).forEach(e => e.textContent = ago(+e.dataset.t)), 5000);
})();
