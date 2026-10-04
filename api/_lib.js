// STRAIT API helpers: fetch with timeouts, JSON replies, a Solana RPC with fallbacks, a small in-memory cache.
const RPCS = [process.env.RPC_URL, 'https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com'].filter(Boolean);
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const REF = 'D9DqxEsUqNVTVxVeqHPaGotAMZQt9itZhN2Jo3AnFScw';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUP = 'https://lite-api.jup.ag';

async function get(url, opt = {}, ms = 9000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { return await fetch(url, { ...opt, signal: c.signal }); } finally { clearTimeout(t); }
}
async function getJson(url, opt, ms) {
  const r = await get(url, opt, ms);
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { }
  if (!r.ok) { const m = (j && (j.error || j.message)) || text.slice(0, 160) || ('HTTP ' + r.status); const e = new Error(String(m)); e.status = r.status; throw e; }
  return j;
}
function send(res, code, body, cache) {
  res.setHeader('Cache-Control', cache || 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(code).send(JSON.stringify(body));
}
function wrap(fn) { return async (req, res) => { try { await fn(req, res); } catch (e) { send(res, 502, { ok: false, error: String(e && e.message || e).slice(0, 240) }); } }; }
async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise(r => { let d = ''; req.on('data', c => { d += c; if (d.length > 2e6) d = ''; }); req.on('end', () => { try { r(JSON.parse(d || '{}')); } catch (e) { r({}); } }); });
}
async function rpc(method, params, ms = 12000) {
  let last;
  for (const url of RPCS) {
    try {
      const r = await get(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }, ms);
      const j = await r.json();
      if (j.error) { last = new Error(j.error.message); if (/not found|invalid param|invalid/i.test(j.error.message)) throw last; continue; }
      return j.result;
    } catch (e) { last = e; }
  }
  throw last || new Error('rpc failed');
}
const mem = {};
async function cached(key, ms, fn) {
  const c = mem[key]; if (c && Date.now() - c.t < ms) return c.v;
  const v = await fn(); mem[key] = { t: Date.now(), v };
  const keys = Object.keys(mem); if (keys.length > 500) for (const k of keys.slice(0, 200)) delete mem[k];
  return v;
}
function q(req) { try { return new URL(req.url, 'http://x').searchParams; } catch (e) { return new URLSearchParams(); } }
module.exports = { get, getJson, send, wrap, body, rpc, cached, q, B58, REF, USDC, JUP };
