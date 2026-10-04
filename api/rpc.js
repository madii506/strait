// POST /api/rpc : an allow-listed Solana JSON-RPC relay for the browser (balances, token accounts, blockhash, simulate, send, status).
const L = require('./_lib');
const ALLOW = new Set(['getLatestBlockhash', 'getBalance', 'getAccountInfo', 'getMultipleAccounts', 'getTokenAccountsByOwner',
  'getSignatureStatuses', 'simulateTransaction', 'sendTransaction', 'getMinimumBalanceForRentExemption']);
module.exports = L.wrap(async (req, res) => {
  if (req.method !== 'POST') return L.send(res, 405, { error: { message: 'POST only' } });
  const b = await L.body(req);
  if (!ALLOW.has(b.method)) return L.send(res, 400, { error: { message: 'method not allowed' } });
  const params = Array.isArray(b.params) ? b.params : [];
  if (JSON.stringify(params).length > 24000) return L.send(res, 413, { error: { message: 'request too large' } });
  try { const result = await L.rpc(b.method, params, 20000); L.send(res, 200, { result }); }
  catch (e) { L.send(res, 200, { error: { message: String(e.message || e).slice(0, 300) } }); }
});
