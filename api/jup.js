// Jupiter relay. Strait never holds funds: it only asks Jupiter for a route and the instructions; the payer's wallet signs.
// GET  /api/jup?op=quote&in=<mint>&amount=<base units>&mode=ExactOut|ExactIn&slip=<bps>&max=<accounts>   (output is always USDC)
// GET  /api/jup?op=tokens&q=<mint, comma list of mints, or a symbol>
// GET  /api/jup?op=price&ids=<comma list of mints>
// POST /api/jup?op=ix   { quoteResponse, userPublicKey, destinationTokenAccount }
const L = require('./_lib');
const MODES = new Set(['ExactOut', 'ExactIn']);
const int = (v, lo, hi, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

function slimToken(t) {
  return { mint: t.id, symbol: t.symbol, name: t.name, decimals: t.decimals, icon: t.icon || null, usd: t.usdPrice != null ? Number(t.usdPrice) : null,
    verified: !!(t.isVerified || (t.tags || []).includes('verified')), liquidity: t.liquidity != null ? Number(t.liquidity) : null, program: t.tokenProgram || null };
}

module.exports = L.wrap(async (req, res) => {
  const p = L.q(req);
  const op = p.get('op');

  if (op === 'quote') {
    const inMint = p.get('in') || '';
    const amount = p.get('amount') || '';
    const mode = MODES.has(p.get('mode')) ? p.get('mode') : 'ExactOut';
    if (!L.B58.test(inMint)) return L.send(res, 400, { ok: false, error: 'Unknown coin.' });
    if (inMint === L.USDC) return L.send(res, 400, { ok: false, error: 'USDC pays directly, no route needed.' });
    if (!/^\d{1,19}$/.test(amount) || amount === '0') return L.send(res, 400, { ok: false, error: 'Enter an amount.' });
    const slip = int(p.get('slip'), 1, 300, 100), max = int(p.get('max'), 16, 64, 40);
    const url = `${L.JUP}/swap/v1/quote?inputMint=${inMint}&outputMint=${L.USDC}&amount=${amount}&swapMode=${mode}&slippageBps=${slip}&maxAccounts=${max}&restrictIntermediateTokens=true`;
    try {
      const quote = await L.cached('q:' + url, 4000, () => L.getJson(url, {}, 9000));
      return L.send(res, 200, { ok: true, quote }, 'no-store');
    } catch (e) {
      const m = String(e.message || e);
      const noRoute = /route|liquidity|not tradable|COULD_NOT_FIND|NO_ROUTES/i.test(m) || e.status === 400;
      return L.send(res, 200, { ok: false, noRoute, error: noRoute ? 'No route from this coin to USDC right now.' : 'The router did not answer. Try again.' });
    }
  }

  if (op === 'tokens') {
    const qv = String(p.get('q') || '').trim().slice(0, 900);
    if (!qv) return L.send(res, 400, { ok: false, error: 'Nothing to look up.' });
    const list = await L.cached('t:' + qv, 600000, () => L.getJson(`${L.JUP}/tokens/v2/search?query=${encodeURIComponent(qv)}`, {}, 9000));
    return L.send(res, 200, { ok: true, tokens: (Array.isArray(list) ? list : []).slice(0, 40).map(slimToken) }, 'public, s-maxage=300');
  }

  if (op === 'price') {
    const ids = String(p.get('ids') || '').split(',').filter(x => L.B58.test(x)).slice(0, 50);
    if (!ids.length) return L.send(res, 400, { ok: false, error: 'No coins.' });
    const j = await L.cached('p:' + ids.join(','), 15000, () => L.getJson(`${L.JUP}/price/v3?ids=${ids.join(',')}`, {}, 9000));
    const prices = {}; for (const id of ids) if (j && j[id] && j[id].usdPrice != null) prices[id] = Number(j[id].usdPrice);
    return L.send(res, 200, { ok: true, prices }, 'public, s-maxage=15');
  }

  if (op === 'ix') {
    if (req.method !== 'POST') return L.send(res, 405, { ok: false, error: 'POST only' });
    const b = await L.body(req);
    const user = String(b.userPublicKey || ''), dest = String(b.destinationTokenAccount || '');
    if (!L.B58.test(user) || !L.B58.test(dest)) return L.send(res, 400, { ok: false, error: 'Missing wallet.' });
    const qr = b.quoteResponse;
    if (!qr || typeof qr !== 'object' || qr.outputMint !== L.USDC) return L.send(res, 400, { ok: false, error: 'Quote is missing or not to USDC.' });
    const payload = {
      quoteResponse: qr, userPublicKey: user, destinationTokenAccount: dest, wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true, prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1000000, priorityLevel: 'high' } }
    };
    try {
      const ix = await L.getJson(`${L.JUP}/swap/v1/swap-instructions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }, 15000);
      if (ix && ix.error) return L.send(res, 200, { ok: false, error: String(ix.error).slice(0, 200) });
      return L.send(res, 200, { ok: true, ix });
    } catch (e) { return L.send(res, 200, { ok: false, error: 'The router could not build this payment. Get a fresh quote and try again.' }); }
  }

  L.send(res, 400, { ok: false, error: 'Unknown op.' });
});
