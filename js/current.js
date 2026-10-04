// The hero current: particles carried through the strait by a stream function precomputed from the same map as topo.svg.
export async function current(canvas) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let F; try { F = await (await fetch('/assets/flow.json')).json(); } catch (e) { return; }
  const dec = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const psi = dec(F.psi), land = dec(F.land), GW = F.w, GH = F.h, MW = F.mw, MH = F.mh;
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1, sc = 1, ox = 0, oy = 0;
  function size() {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    sc = Math.max(W / MW, H / MH); ox = (W - MW * sc) / 2; oy = (H - MH * sc) / 2;   // matches object-fit:cover on the map
  }
  const at = (a, gx, gy) => { gx = Math.max(0, Math.min(GW - 1.001, gx)); gy = Math.max(0, Math.min(GH - 1.001, gy)); const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, i = y0 * GW + x0;
    return a[i] * (1 - fx) * (1 - fy) + a[i + 1] * fx * (1 - fy) + a[i + GW] * (1 - fx) * fy + a[i + GW + 1] * fx * fy; };
  const isLand = (mx, my) => { const gx = Math.round(mx / MW * (GW - 1)), gy = Math.round(my / MH * (GH - 1)); return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? false : land[gy * GW + gx] === 1; };
  function vel(mx, my) {
    const gx = mx / MW * (GW - 1), gy = my / MH * (GH - 1), e = 0.6;
    const dx = at(psi, gx + e, gy) - at(psi, gx - e, gy), dy = at(psi, gx, gy + e) - at(psi, gx, gy - e);
    return [dy, -dx];   // along the iso-lines of psi: through the channel, never across it
  }
  const N = innerWidth < 700 ? 150 : 360, P = [];
  const spawn = p => { for (let k = 0; k < 30; k++) { const x = Math.random() * MW, y = Math.random() * MH; if (!isLand(x, y)) { p.x = x; p.y = y; break; } } p.h = []; p.life = 90 + Math.random() * 200; p.age = 0; p.lit = Math.random() < 0.035; return p; };
  for (let i = 0; i < N; i++) { const p = spawn({}); p.age = Math.random() * p.life; P.push(p); }
  size(); addEventListener('resize', size);
  let last = 0, raf = 0, visible = true;
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !raf) raf = requestAnimationFrame(frame); }, {}); io.observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });
  function frame(ts) {
    raf = 0;
    if (document.hidden || !visible) return;
    if (ts - last > 33) {
      last = ts;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round';
      for (const p of P) {
        const v = vel(p.x, p.y); const m = Math.hypot(v[0], v[1]) || 1; const sp = Math.min(3.2, 0.9 + m * 0.18);
        p.x += v[0] / m * sp; p.y += v[1] / m * sp; p.age++;
        p.h.push(p.x, p.y); if (p.h.length > 22) p.h.splice(0, 2);
        if (p.age > p.life || isLand(p.x, p.y) || p.x < -20 || p.y < -20 || p.x > MW + 20 || p.y > MH + 20) { spawn(p); continue; }
        const fade = Math.min(1, p.age / 20, (p.life - p.age) / 30);
        if (p.h.length < 4) continue;
        ctx.beginPath(); ctx.moveTo(ox + p.h[0] * sc, oy + p.h[1] * sc);
        for (let k = 2; k < p.h.length; k += 2) ctx.lineTo(ox + p.h[k] * sc, oy + p.h[k + 1] * sc);
        ctx.strokeStyle = p.lit ? `rgba(21,128,61,${0.55 * fade})` : `rgba(10,10,10,${0.16 * fade})`;
        ctx.lineWidth = p.lit ? 1.8 : 1; ctx.stroke();
      }
    }
    if (!reduced) raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}
