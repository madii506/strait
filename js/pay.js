// Strait pay: one transaction that swaps the payer's coin (via Jupiter) and lands USDC in the recipient's wallet.
// Keys never leave the wallet. The site builds the transaction, simulates it, and the wallet signs and sends it.
import { CONFIG, $, $$, esc, B58, short, usd, amt, hue, postJ, rpc, quoteFor, tokens, copy, toast, boot } from './core.js';
boot();

const TOKEN = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const TOKEN22 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ATA_PROG = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
const MEMO = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
const CB = 'ComputeBudget111111111111111111111111111111';
const ATA_RENT = 0.00203928, FEE_RESERVE = 0.003;
const B64 = { d: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)), e: u => { let s = ''; const a = new Uint8Array(u); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); } };
const ALPH = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = bytes => { let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b); let s = ''; while (n > 0n) { s = ALPH[Number(n % 58n)] + s; n /= 58n; } for (const b of bytes) { if (b === 0) s = '1' + s; else break; } return s; };
const script = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the Solana library. Check your connection.')); document.head.append(s); });
async function web3() { if (!window.Buffer) await script('/vendor/buffer.min.js'); if (!window.solanaWeb3) await script('/vendor/web3.min.js'); return window.solanaWeb3; }
const ataOf = (W, owner, mint, prog = TOKEN) => W.PublicKey.findProgramAddressSync([new W.PublicKey(owner).toBuffer(), new W.PublicKey(prog).toBuffer(), new W.PublicKey(mint).toBuffer()], new W.PublicKey(ATA_PROG))[0];

const S = { to: '', usd: 0, note: '', inPref: '', link: false, toOk: false, toAta: null, wallet: null, holds: [], pick: null, quote: null, busy: false, qseq: 0 };

// ---------- who and how much ----------
const P = new URLSearchParams(location.search);
const clean = v => String(v || '').replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
const okAmt = v => v >= CONFIG.minUsd && v <= CONFIG.maxUsd;
S.inPref = B58.test(P.get('in') || '') ? P.get('in') : '';
(function initWho() {
  const to = (P.get('to') || '').trim(), v = parseFloat(clean(P.get('usd'))), note = (P.get('note') || '').slice(0, 60);
  if (B58.test(to) && okAmt(v)) { S.to = to; S.usd = Math.round(v * 100) / 100; S.note = note; S.link = true; showCard(); checkTo(); }
  else if (okAmt(v)) { $('#amt').value = String(Math.round(v * 100) / 100); S.usd = Math.round(v * 100) / 100; }
})();
function showCard() {
  $('#whoForm').hidden = true; $('#whoCard').hidden = false;
  $('#whoAddr').textContent = S.to; $('#whoAmt').textContent = usd(S.usd);
  $('#whoNote').hidden = !S.note; $('#whoNote').textContent = S.note ? '“' + S.note + '”' : '';
  $('#title').innerHTML = `Pay ${esc(usd(S.usd))}. <span class="dim">With any coin.</span>`;
  $('#payBtn').textContent = 'Pay ' + usd(S.usd);
}
$('#editWho').onclick = () => {
  $('#whoForm').hidden = false; $('#whoCard').hidden = true;
  $('#to').value = S.to; $('#amt').value = S.usd ? String(S.usd) : ''; $('#note').value = S.note; S.link = false;
};
let wt = 0;
['#to', '#amt', '#note'].forEach(id => $(id).addEventListener('input', () => {
  if (id === '#amt') $('#amt').value = clean($('#amt').value);
  clearTimeout(wt); wt = setTimeout(readForm, 450);
}));
function readForm() {
  $('#toBox').classList.remove('bad'); $('#amtBox').classList.remove('bad'); $('#whoErr').textContent = '';
  const to = $('#to').value.trim(), v = parseFloat($('#amt').value), note = $('#note').value.trim().slice(0, 60);
  S.note = note;
  const amtChanged = Math.round((v || 0) * 100) / 100 !== S.usd;
  S.usd = okAmt(v) ? Math.round(v * 100) / 100 : 0;
  if ($('#amt').value && !okAmt(v)) { $('#amtBox').classList.add('bad'); $('#whoErr').textContent = `Enter an amount between ${usd(CONFIG.minUsd)} and ${usd(CONFIG.maxUsd)}.`; }
  if (to !== S.to) { S.to = to; S.toOk = false; S.toAta = null; if (to) checkTo(); }
  $('#payBtn').textContent = S.usd ? 'Pay ' + usd(S.usd) : 'Pay';
  if (amtChanged) requote(); else gate();
}
async function checkTo() {
  const a = S.to; const st = $('#whoState');
  const fail = m => { if (a !== S.to) return; S.toOk = false; if (S.link) st.textContent = m; else $('#toBox').classList.add('bad'); $('#whoErr').textContent = m; gate(); };
  if (!B58.test(a)) return fail('That is not a Solana address.');
  if (S.link) st.textContent = 'Checking the address…';
  let info;
  try { info = await rpc('getAccountInfo', [a, { encoding: 'base64', commitment: 'confirmed' }]); }
  catch (e) { if (/invalid/i.test(e.message)) return fail('That is not a Solana address.'); if (S.link) st.textContent = 'Could not check the address yet.'; return; }
  const v = info && info.value;
  if (v && v.executable) return fail("That is a program, not a wallet.");
  if (v && (v.owner === TOKEN || v.owner === TOKEN22)) return fail("That is a token account, not a wallet. Ask for their wallet address.");
  const W = await web3();
  let ataInfo = null; try { ataInfo = await rpc('getAccountInfo', [ataOf(W, a, CONFIG.usdc).toBase58(), { encoding: 'base64', commitment: 'confirmed' }]); } catch (e) { }
  if (a !== S.to) return;
  S.toOk = true; S.toAta = !!(ataInfo && ataInfo.value);
  $('#whoErr').textContent = '';
  if (S.link) st.textContent = S.toAta ? 'Solana wallet · holds USDC' : (v ? 'Solana wallet · first USDC' : 'New Solana wallet');
  gate();
}

// ---------- wallets ----------
function walletList() {
  const w = window, out = [];
  const ph = (w.phantom && w.phantom.solana) || (w.solana && w.solana.isPhantom ? w.solana : null);
  if (ph) out.push({ id: 'phantom', name: 'Phantom', provider: ph });
  if (w.solflare && (w.solflare.isSolflare || w.solflare.connect)) out.push({ id: 'solflare', name: 'Solflare', provider: w.solflare });
  if (w.backpack && (w.backpack.isBackpack || w.backpack.connect)) out.push({ id: 'backpack', name: 'Backpack', provider: w.backpack.solana || w.backpack });
  if (!out.length && w.solana && w.solana.connect) out.push({ id: 'solana', name: 'Solana wallet', provider: w.solana });
  return out;
}
function paintWallets() {
  const box = $('#walletBox'); const list = walletList();
  if (S.wallet) { box.innerHTML = ''; return; }
  if (!list.length) {
    const here = encodeURIComponent(location.href), ref = encodeURIComponent(location.origin);
    box.innerHTML = `<p style="margin:0 0 14px;color:var(--text)">No Solana wallet found in this browser.</p>
      <div class="wallets"><a class="btn light" href="https://phantom.app/ul/browse/${here}?ref=${ref}">Open in Phantom <small class="mono" style="color:var(--mute)">↗</small></a>
      <a class="btn light" href="https://solflare.com/ul/v1/browse/${here}?ref=${ref}">Open in Solflare <small class="mono" style="color:var(--mute)">↗</small></a></div>`;
    return;
  }
  box.innerHTML = `<div class="wallets">${list.map(x => `<button type="button" data-w="${x.id}">${esc(x.name)}<small>Connect</small></button>`).join('')}</div>`;
  $$('[data-w]', box).forEach(b => b.onclick = () => connect(b.dataset.w));
}
async function connect(id, silent) {
  const pick = walletList().find(x => x.id === id); if (!pick) return;
  try {
    const r = await pick.provider.connect(silent ? { onlyIfTrusted: true } : undefined);
    const pk = (r && r.publicKey) || pick.provider.publicKey; if (!pk) return;
    S.wallet = { provider: pick.provider, address: pk.toString(), name: pick.name, id };
    try { localStorage.setItem('strait:w', id); } catch (e) { }
    $('#acctLine').innerHTML = `${esc(short(S.wallet.address))} · <a href="#" id="disc" style="border-bottom:1px solid var(--line2)">disconnect</a>`;
    $('#disc').onclick = e => { e.preventDefault(); disconnect(); };
    paintWallets(); loadHoldings();
  } catch (e) { if (!silent) err(human(e)); }
}
async function disconnect() {
  try { await S.wallet.provider.disconnect(); } catch (e) { }
  try { localStorage.removeItem('strait:w'); } catch (e) { }
  S.wallet = null; S.holds = []; S.pick = null; S.quote = null;
  $('#acctLine').textContent = ''; $('#holdBox').hidden = true; $('#quoteBox').hidden = true; paintWallets(); gate();
}

// ---------- holdings ----------
async function loadHoldings() {
  const box = $('#holdBox'), list = $('#hold'); box.hidden = false;
  list.innerHTML = `<div class="hint" style="padding:16px 4px"><span class="spin"></span>&nbsp; Reading your wallet…</div>`;
  const owner = S.wallet.address;
  try {
    const [bal, t1, t2] = await Promise.all([
      rpc('getBalance', [owner, { commitment: 'confirmed' }]),
      rpc('getTokenAccountsByOwner', [owner, { programId: TOKEN }, { encoding: 'jsonParsed', commitment: 'confirmed' }]),
      rpc('getTokenAccountsByOwner', [owner, { programId: TOKEN22 }, { encoding: 'jsonParsed', commitment: 'confirmed' }]).catch(() => ({ value: [] })),
    ]);
    const by = {};
    for (const [res, prog] of [[t1, TOKEN], [t2, TOKEN22]]) for (const a of (res && res.value) || []) {
      const info = a.account.data.parsed.info, ui = Number(info.tokenAmount.uiAmountString || 0);
      if (!(ui > 0)) continue;
      if (!by[info.mint] || ui > by[info.mint].ui) by[info.mint] = { mint: info.mint, ui, decimals: info.tokenAmount.decimals, account: a.pubkey, program: prog };
    }
    const mints = Object.keys(by), meta = {};
    for (let i = 0; i < mints.length; i += 20) for (const t of await tokens(mints.slice(i, i + 20).join(','))) meta[t.mint] = t;
    const solT = (await tokens(CONFIG.sol)).find(t => t.mint === CONFIG.sol);
    const rows = [{ mint: CONFIG.sol, ui: ((bal && bal.value) || 0) / 1e9, decimals: 9, symbol: 'SOL', name: 'Solana', price: solT ? solT.usd : null, native: true },
      ...mints.map(m => ({ ...by[m], symbol: meta[m] ? meta[m].symbol : short(m), name: meta[m] ? meta[m].name : 'Unknown token', price: meta[m] ? meta[m].usd : null }))];
    rows.forEach(r => r.value = r.price != null ? r.ui * r.price : null);
    rows.sort((a, b) => (b.value || 0) - (a.value || 0));
    S.holds = rows; paintHolds();
    const pre = S.inPref && rows.find(r => r.mint === S.inPref);
    if (pre) choose(pre.mint); else if (rows[0] && (rows[0].value || 0) > 0) choose(rows[0].mint);
  } catch (e) {
    list.innerHTML = `<div class="hint" style="padding:16px 4px">Could not read this wallet. <button class="btn light sm" type="button" id="hRetry">Retry ↻</button></div>`;
    $('#hRetry').onclick = loadHoldings;
  }
}
function paintHolds() {
  const f = ($('#filter').value || '').trim().toLowerCase();
  const rows = S.holds.filter(r => !f || r.symbol.toLowerCase().includes(f) || (r.name || '').toLowerCase().includes(f) || r.mint === f);
  $('#hold').innerHTML = rows.length ? rows.map(r => `<button type="button" data-m="${r.mint}" class="${S.pick && S.pick.mint === r.mint ? 'on' : ''}">
      <span class="ic" style="background:${r.mint === CONFIG.usdc ? '#2563EB' : hue(r.symbol)}">${esc(String(r.symbol).slice(0, 4))}</span>
      <span class="nm ${(r.value || 0) < 0.01 ? 'low' : ''}"><b>${esc(r.symbol)}</b><span>${amt(r.ui)}</span></span>
      <span class="val">${r.value != null ? usd(r.value) : '—'}<span>${r.price != null ? '@ ' + (r.price >= 1 ? usd(r.price) : '$' + amt(r.price)) : 'no price'}</span></span></button>`).join('')
    : `<div class="hint" style="padding:16px 4px">${S.holds.length ? 'No coin matches.' : 'This wallet is empty.'}</div>`;
  $$('#hold [data-m]').forEach(b => b.onclick = () => choose(b.dataset.m));
}
$('#filter').addEventListener('input', paintHolds);
function choose(mint) { S.pick = S.holds.find(r => r.mint === mint) || null; paintHolds(); requote(); }

// ---------- quote ----------
async function requote(maxAcc) {
  const my = ++S.qseq; S.quote = null; gate();
  const box = $('#quoteBox'), p = S.pick, v = S.usd;
  if (!p || !v) { box.hidden = true; return null; }
  box.hidden = false; $('#qSpend').innerHTML = '<span class="spin"></span>'; $('#qRows').innerHTML = '';
  let q;
  if (p.mint === CONFIG.usdc) q = { direct: true, exact: true, spendUi: v, maxUi: v };
  else {
    const r = await quoteFor(p.mint, v, p.decimals, p.price, maxAcc);
    if (my !== S.qseq) return null;
    if (r.error) { $('#qSpend').innerHTML = `<span style="font-size:20px;color:var(--bad)">${esc(r.error)}</span>`; return null; }
    const spendUi = Number(r.quote.inAmount) / 10 ** p.decimals;
    q = { ...r, spendUi, maxUi: r.exact ? Number(r.quote.otherAmountThreshold) / 10 ** p.decimals : spendUi };
  }
  if (my !== S.qseq) return null;
  q.at = Date.now(); S.quote = q; paintQuote(); gate(); return q;
}
function needs() {
  const q = S.quote, p = S.pick; if (!q || !p) return null;
  const solBal = (S.holds.find(r => r.native) || { ui: 0 }).ui;
  const extraSol = FEE_RESERVE + (S.toAta === false ? ATA_RENT : 0) + (p.native ? ATA_RENT : 0);
  if (p.native) return q.maxUi + extraSol > solBal ? `Not enough SOL. This needs up to ${amt(q.maxUi + extraSol)} SOL including fees.` : null;
  if (q.maxUi > p.ui) return `Not enough ${p.symbol}. This needs up to ${amt(q.maxUi)}.`;
  if (extraSol > solBal) return `You need about ${amt(extraSol)} SOL for the network fee${S.toAta === false ? ' and their USDC account' : ''}.`;
  return null;
}
function paintQuote() {
  const q = S.quote, p = S.pick;
  $('#qSpend').innerHTML = `${amt(q.spendUi)}<small> ${esc(p.symbol)}</small>`;
  const labels = q.direct ? 'Direct transfer, no swap' : [...new Set((q.quote.routePlan || []).map(x => x.swapInfo && x.swapInfo.label).filter(Boolean))].join(' + ') || 'Jupiter';
  const rows = [
    ['They receive', `${q.exact ? 'exactly' : 'at least'} ${usd(S.usd)} USDC`],
    ['Route', esc(labels)],
  ];
  if (!q.direct) rows.push(['Price impact', (Number(q.quote.priceImpactPct || 0) * 100).toFixed(2) + '%'], [q.exact ? 'Most you could spend' : 'Slippage limit', q.exact ? `${amt(q.maxUi)} ${esc(p.symbol)}` : '1%']);
  if (S.toAta === false) rows.push(['Their USDC account', 'opened in the same transaction (~0.002 SOL)']);
  rows.push(['Strait fee', 'none']);
  $('#qRows').innerHTML = rows.map(r => `<div><span>${r[0]}</span><span>${r[1]}</span></div>`).join('');
}
setInterval(() => { if (S.quote && !S.busy && Date.now() - S.quote.at > 20000 && !document.hidden) requote(); }, 5000);

function gate() {
  const why = !S.to ? 'Add who you are paying.' : !S.toOk ? '' : !S.usd ? 'Add an amount.' : !S.wallet ? '' : !S.pick ? 'Pick a coin.' : !S.quote ? '' : needs();
  const ready = S.toOk && S.usd && S.wallet && S.pick && S.quote && !needs() && !S.busy;
  $('#payBtn').disabled = !ready;
  const e = $('#err'); if (!S.busy && why && S.wallet && S.quote) e.textContent = why; else if (!S.busy && e.dataset.k !== 'run') e.textContent = '';
}

// ---------- build, check, sign, send ----------
async function loadAlts(W, addrs) {
  if (!addrs || !addrs.length) return [];
  const r = await rpc('getMultipleAccounts', [addrs, { encoding: 'base64', commitment: 'confirmed' }]);
  return ((r && r.value) || []).map((a, i) => a ? new W.AddressLookupTableAccount({ key: new W.PublicKey(addrs[i]), state: W.AddressLookupTableAccount.deserialize(B64.d(a.data[0])) }) : null).filter(Boolean);
}
async function build(maxAcc = 40) {
  const W = await web3();
  const payer = new W.PublicKey(S.wallet.address), to = new W.PublicKey(S.to), usdc = new W.PublicKey(CONFIG.usdc), tokenProg = new W.PublicKey(TOKEN);
  const dest = ataOf(W, S.to, CONFIG.usdc);
  const createAta = new W.TransactionInstruction({ programId: new W.PublicKey(ATA_PROG), data: Buffer.from([1]), keys: [
    { pubkey: payer, isSigner: true, isWritable: true }, { pubkey: dest, isSigner: false, isWritable: true }, { pubkey: to, isSigner: false, isWritable: false },
    { pubkey: usdc, isSigner: false, isWritable: false }, { pubkey: W.SystemProgram.programId, isSigner: false, isWritable: false }, { pubkey: tokenProg, isSigner: false, isWritable: false }] });
  const memoText = 'strait:v1' + (S.note ? ' ' + S.note.replace(/["\\\r\n]/g, '').slice(0, 60) : '');
  const memo = new W.TransactionInstruction({ programId: new W.PublicKey(MEMO), keys: [], data: Buffer.from(new TextEncoder().encode(memoText)) });
  const ref = W.SystemProgram.transfer({ fromPubkey: payer, toPubkey: payer, lamports: 0 });
  ref.keys.push({ pubkey: new W.PublicKey(CONFIG.ref), isSigner: false, isWritable: false });
  let ixs, alts = [];
  if (S.quote.direct) {
    const data = new Uint8Array(10); data[0] = 12; new DataView(data.buffer).setBigUint64(1, BigInt(Math.round(S.usd * 1e6)), true); data[9] = 6;
    const xfer = new W.TransactionInstruction({ programId: tokenProg, data: Buffer.from(data), keys: [
      { pubkey: new W.PublicKey(S.pick.account), isSigner: false, isWritable: true }, { pubkey: usdc, isSigner: false, isWritable: false },
      { pubkey: dest, isSigner: false, isWritable: true }, { pubkey: payer, isSigner: true, isWritable: false }] });
    ixs = [W.ComputeBudgetProgram.setComputeUnitLimit({ units: 90000 }), W.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 120000 }), createAta, xfer, memo, ref];
  } else {
    const j = await postJ('/api/jup?op=ix', { quoteResponse: S.quote.quote, userPublicKey: S.wallet.address, destinationTokenAccount: dest.toBase58() }, 25000);
    if (!j.ok) throw new Error(j.error || 'The router could not build this payment.');
    const ix = j.ix;
    const toIx = i => new W.TransactionInstruction({ programId: new W.PublicKey(i.programId), data: Buffer.from(B64.d(i.data)), keys: i.accounts.map(a => ({ pubkey: new W.PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })) });
    let hasLimit = false;
    const cb = (ix.computeBudgetInstructions || []).map(i => {
      const d = B64.d(i.data);
      if (d[0] === 2 && d.length >= 5) { hasLimit = true; const dv = new DataView(d.buffer, d.byteOffset, d.byteLength); dv.setUint32(1, Math.min(1400000, dv.getUint32(1, true) + 80000), true); }
      return toIx({ ...i, data: B64.e(d) });
    });
    if (!hasLimit) cb.unshift(W.ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }));
    ixs = [...cb, createAta, ...(ix.setupInstructions || []).map(toIx), toIx(ix.swapInstruction), ...(ix.cleanupInstruction ? [toIx(ix.cleanupInstruction)] : []), ...(ix.otherInstructions || []).map(toIx), memo, ref];
    alts = await loadAlts(W, ix.addressLookupTableAddresses);
  }
  const bh = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }]);
  const msg = new W.TransactionMessage({ payerKey: payer, recentBlockhash: bh.value.blockhash, instructions: ixs }).compileToV0Message(alts);
  const tx = new W.VersionedTransaction(msg);
  let size = 9999; try { size = tx.serialize().length; } catch (e) { }
  if (size > 1232) {
    if (!S.quote.direct && maxAcc > 20) { await requote(maxAcc - 12); if (!S.quote) throw new Error('No smaller route found. Try another coin.'); return build(maxAcc - 12); }
    throw new Error('This route is too large for one transaction. Try another coin.');
  }
  return tx;
}
function simErr(err, logs) {
  const s = JSON.stringify(err) + ' ' + logs;
  if (/insufficient lamports|insufficient funds|Insufficient|"Custom":1\b|0x1\b/i.test(s)) return 'Not enough balance for this payment and its network fee.';
  if (/0x1771|6001|Slippage/i.test(s)) return 'The price moved past the 1% limit. Try again for a fresh quote.';
  if (/exceeded CUs|computational budget/i.test(s)) return 'This route needs more compute than one transaction allows. Try another coin.';
  return 'The payment failed its check on Solana, so nothing was sent. (' + JSON.stringify(err).slice(0, 90) + ')';
}
async function simulate(tx) {
  const r = await rpc('simulateTransaction', [B64.e(tx.serialize()), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }]);
  const v = r && r.value; if (v && v.err) throw new Error(simErr(v.err, (v.logs || []).join('\n')));
  return v;
}
async function signSend(tx) {
  const p = S.wallet.provider;
  if (p.signAndSendTransaction) {
    const r = await p.signAndSendTransaction(tx, { skipPreflight: false, maxRetries: 5 });
    const sig = typeof r === 'string' ? r : r && (r.signature || r.txid);
    if (!sig) throw new Error('The wallet did not return a signature.');
    return typeof sig === 'string' ? sig : b58(sig);
  }
  const signed = await p.signTransaction(tx);
  return rpc('sendTransaction', [B64.e(signed.serialize()), { encoding: 'base64', skipPreflight: true, maxRetries: 5 }]);
}
async function confirm(sig) {
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 1500));
    let v; try { const st = await rpc('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]); v = st && st.value && st.value[0]; } catch (e) { continue; }
    if (v && v.err) throw new Error('The transaction failed on Solana, so nothing moved.');
    if (v && /confirmed|finalized/.test(v.confirmationStatus || '')) return true;
  }
  return false;
}
function human(e) {
  const m = String(e && (e.message || e) || '');
  if (/cancel|reject|denied|declined|user rejected|closed/i.test(m)) return 'You cancelled it in your wallet. Nothing was sent.';
  if (/blockhash|expired|block height/i.test(m)) return 'The approval took too long and expired. Nothing was sent. Try again.';
  if (/not enough|insufficient/i.test(m)) return m.length < 160 ? m : 'Not enough balance for this payment.';
  return m.length < 200 ? m : 'Something went wrong. Nothing was sent unless a transaction link appears.';
}
function err(t) { $('#err').textContent = t || ''; }
const STEPS = ['Fresh quote', 'One transaction, checked on Solana', 'Approve in your wallet', 'Sending', 'Settled'];
function steps(i, state) {
  const box = $('#status'); box.hidden = false;
  if (!box.children.length) box.innerHTML = STEPS.map(s => `<div><i></i><span>${s}</span></div>`).join('');
  [...box.children].forEach((d, k) => { d.className = k < i ? 'ok' : k === i ? state : ''; });
}
async function pay() {
  if (S.busy) return; S.busy = true; $('#err').dataset.k = 'run'; err(''); $('#payBtn').disabled = true;
  $('#status').innerHTML = '';
  let at = 0, sig = null;
  try {
    steps(at = 0, 'run'); if (!S.quote || Date.now() - S.quote.at > 8000) { if (!await requote()) throw new Error($('#qSpend').textContent || 'No quote right now.'); }
    const why = needs(); if (why) throw new Error(why);
    steps(at = 1, 'run'); const tx = await build(); await simulate(tx);
    steps(at = 2, 'run'); sig = await signSend(tx);
    steps(at = 3, 'run'); const ok = await confirm(sig);
    if (!ok) { err('Sent, but not confirmed yet. Check the transaction before paying again.'); showReceipt(sig, true); return; }
    steps(at = 4, 'ok'); showReceipt(sig, false);
  } catch (e) {
    steps(at, 'bad'); err(human(e));
  } finally { S.busy = false; $('#err').dataset.k = ''; gate(); }
}
$('#payBtn').onclick = pay;

function showReceipt(sig, pending) {
  const q = S.quote, p = S.pick, link = 'https://solscan.io/tx/' + sig;
  const done = $('#sDone'); done.hidden = false; $('#sPay').hidden = true; $('#sWho').hidden = true;
  $('#title').innerHTML = pending ? 'Sent. <span class="dim">Confirming.</span>' : 'Settled. <span class="dim">Dollars delivered.</span>';
  $('#sub').textContent = pending ? 'Solana has the transaction. It may take a few more seconds to confirm.' : 'The USDC is in their wallet. This payment is final.';
  done.innerHTML = `<div class="receipt"><div class="stamp"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#0A0A0A"/><path d="M12 20.5l5.5 5.5L28.5 14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>${pending ? 'Sent.' : 'Settled.'}</div></div>
    <div class="rows" style="margin-top:22px">
      <div><span>They received</span><span>${q.exact ? '' : 'at least '}${usd(S.usd)} USDC</span></div>
      <div><span>You paid</span><span>${q.direct ? amt(S.usd) + ' USDC' : '≈ ' + amt(q.spendUi) + ' ' + esc(p.symbol)}</span></div>
      <div><span>To</span><span class="mono">${esc(short(S.to))}</span></div>
      ${S.note ? `<div><span>Note</span><span>${esc(S.note)}</span></div>` : ''}
      <div><span>Transaction</span><span><a class="mono" href="${link}" target="_blank" rel="noopener" style="border-bottom:1px solid var(--line2)">${esc(short(sig))} ↗</a></span></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap"><a class="btn dark" href="${link}" target="_blank" rel="noopener">View on Solscan</a><button class="btn light" type="button" id="cpy">Copy receipt link</button><a class="btn light" href="/pay">New payment</a></div>`;
  $('#cpy').onclick = () => copy(link, 'Receipt link copied');
  scrollTo({ top: 0, behavior: 'smooth' });
}

// a read-only check anyone can run from the console: builds a payment and simulates it, nothing is signed or sent
window.straitSimulate = async (payer, to, usdAmount = 1, mint = CONFIG.sol) => {
  const keep = { ...S };
  try {
    S.wallet = { address: payer }; S.to = to; S.usd = usdAmount; S.note = 'simulation';
    const t = mint === CONFIG.sol ? { decimals: 9, symbol: 'SOL' } : ((await tokens(mint)).find(x => x.mint === mint) || {});
    S.pick = { mint, decimals: t.decimals, price: t.usd, symbol: t.symbol, account: null };
    if (mint === CONFIG.usdc) {
      const ta = await rpc('getTokenAccountsByOwner', [payer, { mint }, { encoding: 'jsonParsed' }]);
      S.pick.account = ta.value[0] && ta.value[0].pubkey; S.quote = { direct: true, exact: true, at: Date.now() };
    } else {
      const r = await quoteFor(mint, usdAmount, t.decimals, t.usd); if (r.error) return { ok: false, error: r.error };
      S.quote = { ...r, at: Date.now() };
    }
    const tx = await build();
    const r = await rpc('simulateTransaction', [B64.e(tx.serialize()), { encoding: 'base64', sigVerify: false, replaceRecentBlockhash: true, commitment: 'confirmed' }]);
    return { ok: !r.value.err, err: r.value.err || null, size: tx.serialize().length, units: r.value.unitsConsumed, logs: (r.value.logs || []).filter(l => /Memo|error|failed|success/i.test(l)).slice(-6) };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  finally { Object.assign(S, keep); }
};

paintWallets(); gate();
// reconnect a wallet that already trusts this site, without a prompt
setTimeout(() => { let id = null; try { id = localStorage.getItem('strait:w'); } catch (e) { } if (id && !S.wallet) connect(id, true); }, 400);
