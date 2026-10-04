// STRAIT shared client: config, the scam strip, nav, reveal, formatting, and thin wrappers over /api.
export const CONFIG = {
  ca: '',                    // $STRAIT mint, set at launch; until then the strip warns
  x: '',                     // X profile URL
  ref: 'D9DqxEsUqNVTVxVeqHPaGotAMZQt9itZhN2Jo3AnFScw', // read-only key carried by every Strait payment
  usdc: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  sol: 'So11111111111111111111111111111111111111112',
  minUsd: 0.5, maxUsd: 10000,
};
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const short = a => { a = String(a || ''); return a.length > 12 ? a.slice(0, 4) + '…' + a.slice(-4) : a; };
export const usd = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function amt(n) {
  n = Number(n); if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  const d = a >= 1e6 ? 0 : a >= 1000 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : 7;
  return n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: Math.min(2, d) });
}
export function ago(t) { const s = Math.max(1, Math.round((Date.now() - t) / 1000)); if (s < 60) return s + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago'; if (s < 86400) return Math.round(s / 3600) + 'h ago'; return Math.round(s / 86400) + 'd ago'; }
export const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `hsl(${h % 360} 42% 38%)`; };

export async function getJ(url, ms = 12000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal }); return await r.json(); }
  catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'That took too long.' : 'Network error.' }; }
  finally { clearTimeout(t); }
}
export async function postJ(url, body, ms = 20000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: c.signal }); return await r.json(); }
  catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'That took too long.' : 'Network error.' }; }
  finally { clearTimeout(t); }
}
export async function rpc(method, params) {
  const j = await postJ('/api/rpc', { method, params }, 25000);
  if (j && j.error) throw new Error(typeof j.error === 'string' ? j.error : (j.error.message || 'RPC error'));
  if (!j || !('result' in j)) throw new Error('The Solana relay did not answer.');
  return j.result;
}
// a USDC quote for `usdAmount`, paid in `mint`. ExactOut first (they receive the exact amount), ExactIn as a fallback.
export async function quoteFor(mint, usdAmount, decimals, priceHint, maxAcc = 40) {
  const out = Math.round(usdAmount * 1e6);
  const a = await getJ(`/api/jup?op=quote&in=${mint}&amount=${out}&mode=ExactOut&slip=100&max=${maxAcc}`);
  if (a.ok) return { exact: true, quote: a.quote };
  if (!priceHint || !decimals) return { error: a.error || 'No route from this coin to USDC right now.' };
  // fall back to ExactIn: size the input so even the worst-case fill covers the amount
  let inUnits = BigInt(Math.ceil(usdAmount / priceHint * 1.025 * 10 ** decimals));
  for (let i = 0; i < 3; i++) {
    const b = await getJ(`/api/jup?op=quote&in=${mint}&amount=${inUnits}&mode=ExactIn&slip=100&max=${maxAcc}`);
    if (!b.ok) return { error: b.error || 'No route from this coin to USDC right now.' };
    const min = Number(b.quote.otherAmountThreshold);
    if (min >= out) return { exact: false, quote: b.quote };
    inUnits = BigInt(Math.ceil(Number(inUnits) * (out / Math.max(1, min)) * 1.01));
  }
  return { error: 'This coin is too thin to pay that much right now.' };
}
let tokenCache = {};
export async function tokens(q) {
  if (tokenCache[q]) return tokenCache[q];
  const j = await getJ('/api/jup?op=tokens&q=' + encodeURIComponent(q));
  const v = j.ok ? j.tokens : []; if (j.ok) tokenCache[q] = v; return v;
}
export function routeHTML(quote, inSym) {
  const plan = (quote && quote.routePlan) || [];
  const arrow = '<svg viewBox="0 0 16 10" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M1 5h13M10 1l4 4-4 4"/></svg>';
  const labels = [...new Set(plan.map(p => p.swapInfo && p.swapInfo.label).filter(Boolean))].slice(0, 3);
  return `<span class="hop">${esc(inSym)}</span>${arrow}<span class="via">${esc(labels.join(' + ') || 'Jupiter')}</span>${arrow}<span class="hop end">USDC</span>`;
}

// toast + aria-live
let toastT;
export function toast(text) {
  let el = $('.toast'); if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); }
  el.textContent = text; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800);
  const live = $('#live'); if (live) live.textContent = text;
}
export async function copy(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); }
  catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch (x) { } t.remove(); }
  toast(label);
}

function strip() {
  const el = $('#strip'); if (!el) return;
  if (CONFIG.ca) {
    el.innerHTML = `<div class="wrap"><span>OFFICIAL TOKEN <b>$STRAIT</b></span><code>${esc(CONFIG.ca)}</code><button type="button" data-copy-ca>copy</button><span>Anything else is not ours.</span></div>`;
    $('[data-copy-ca]', el).onclick = () => copy(CONFIG.ca, 'Contract address copied');
  } else {
    el.innerHTML = `<div class="wrap"><span><b>$STRAIT</b> has no contract address yet. Anyone posting one before it appears on this bar is scamming you.</span></div>`;
  }
}
function nav() {
  const n = $('.nav'); if (!n) return;
  const xl = $('[data-x]'); if (xl) { if (CONFIG.x) xl.href = CONFIG.x; else xl.remove(); }
  const onScroll = () => n.classList.toggle('solid', window.scrollY > 260);
  if (!n.classList.contains('always')) { onScroll(); addEventListener('scroll', onScroll, { passive: true }); }
  // scroll-spy over same-page anchors only
  const links = $$('.nav .links a').filter(a => (a.getAttribute('href') || '').startsWith('#'));
  const secs = links.map(a => document.getElementById(a.getAttribute('href').slice(1))).filter(Boolean);
  if (!secs.length) return;
  const spy = () => {
    const y = window.scrollY + window.innerHeight * 0.35; let cur = null;
    for (const s of secs) if (s.offsetTop <= y) cur = s.id;
    links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
  };
  spy(); addEventListener('scroll', spy, { passive: true }); addEventListener('hashchange', spy);
}
function reveal() {
  const els = $$('.rv');
  if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('vis')); return; }
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach(e => io.observe(e));
  const sweep = () => els.forEach(e => { if (!e.classList.contains('vis') && e.getBoundingClientRect().top < innerHeight) e.classList.add('vis'); });
  addEventListener('hashchange', () => setTimeout(sweep, 60)); setTimeout(sweep, 400);
}
export function boot() { strip(); nav(); reveal(); }
