// GET /api/proof : the latest payments made through Strait, read straight from Solana.
// Every Strait payment carries one read-only reference key (REF) and a "strait:v1" memo, so getSignaturesForAddress(REF)
// lists them all. Nothing here is stored by us; the rows are re-derived from the chain on every read.
const L = require('./_lib');
const SOL = 'So11111111111111111111111111111111111111112';

function owners(bals, mint) { const m = {}; for (const b of bals || []) if (b.mint === mint) m[b.owner] = (m[b.owner] || 0) + Number(b.uiTokenAmount && b.uiTokenAmount.uiAmountString || 0); return m; }

function parse(t, s) {
  if (!t || !t.meta || t.meta.err) return null;
  const logs = (t.meta.logMessages || []).join('\n');
  const memo = logs.match(/Memo \(len \d+\): "strait:v1([^"]*)"/);
  if (!memo) return null;
  const keys = (t.transaction.message.accountKeys || []).map(k => (k && k.pubkey) || k);
  const payer = String(keys[0] || '');
  const pre = owners(t.meta.preTokenBalances, L.USDC), post = owners(t.meta.postTokenBalances, L.USDC);
  let to = null, usd = 0;
  for (const o of new Set([...Object.keys(pre), ...Object.keys(post)])) {
    const d = (post[o] || 0) - (pre[o] || 0);
    if (o !== payer && d > usd) { usd = d; to = o; }
  }
  if (!to || usd <= 0) return null;
  // what the payer spent: the token whose balance fell the most, else SOL
  let inMint = SOL, worst = 0;
  const mints = new Set([...(t.meta.preTokenBalances || []), ...(t.meta.postTokenBalances || [])].map(b => b.mint));
  for (const m of mints) {
    if (m === SOL) continue;
    const a = owners(t.meta.preTokenBalances, m)[payer] || 0, b = owners(t.meta.postTokenBalances, m)[payer] || 0;
    if (a - b > 0 && (m !== L.USDC || inMint === SOL)) { const rel = (a - b) / (a || 1); if (rel > worst || m === L.USDC) { worst = rel; inMint = m; } }
  }
  const note = memo[1].trim().slice(0, 80);
  return { sig: s.signature, t: (t.blockTime || s.blockTime || 0) * 1000, from: payer, to, usd: Math.round(usd * 100) / 100, inMint, note };
}

module.exports = L.wrap(async (req, res) => {
  const out = await L.cached('proof', 12000, async () => {
    const sigs = await L.rpc('getSignaturesForAddress', [L.REF, { limit: 25, commitment: 'confirmed' }]);
    const ok = (sigs || []).filter(s => !s.err).slice(0, 20);
    const txs = await Promise.all(ok.map(s => L.rpc('getTransaction', [s.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]).catch(() => null)));
    const rows = txs.map((t, i) => parse(t, ok[i])).filter(Boolean);
    const mints = [...new Set(rows.map(r => r.inMint))];
    let sym = {};
    if (mints.length) {
      try {
        const list = await L.cached('sym:' + mints.join(','), 600000, () => L.getJson(`${L.JUP}/tokens/v2/search?query=${mints.join(',')}`, {}, 8000));
        for (const t of list || []) sym[t.id] = t.symbol;
      } catch (e) { }
    }
    for (const r of rows) r.inSymbol = r.inMint === SOL ? 'SOL' : (sym[r.inMint] || null);
    return { rows, total: rows.length };
  });
  L.send(res, 200, { ok: true, ref: L.REF, ...out }, 'public, s-maxage=10, stale-while-revalidate=30');
});
