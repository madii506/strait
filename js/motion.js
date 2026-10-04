// STRAIT motion: scroll progress, hero parallax, drawn steps, the pinned transaction story, the section index,
// word reveals, animated FAQ, pointer light and number count-ups. Everything stands down under reduced motion.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function countTo(el, to, fmt, ms = 650) {
  if (!el) return;
  const from = parseFloat(el.dataset.v);
  el.dataset.v = to;
  if (reduced || !isFinite(from) || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = t => { const k = clamp((t - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1 && el.dataset.v == to) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

export function progress() {
  const bar = $('#progress'); if (!bar) return;
  const f = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.setProperty('--p', h > 0 ? clamp(scrollY / h, 0, 1) : 0); };
  f(); addEventListener('scroll', f, { passive: true }); addEventListener('resize', f);
}

export function motion() {
  progress();
  const hero = $('.hero'), img = $('.hero .map img'), card = $('#qcard'), steps = $('#steps');
  const story = $('#inside'), lis = $$('#storySteps li'), rows = $$('#txcard .tx-row'), tfs = $$('#txcard .tf');
  const sidx = $('#sidx'), sidxLinks = sidx ? $$('a', sidx) : [], secs = sidxLinks.map(a => $(a.getAttribute('href')));
  const stacked = () => matchMedia('(max-width: 960px), (prefers-reduced-motion: reduce)').matches;

  // drawn illustrations: normalise every stroke so one dash covers it
  $$('.draw path, .draw rect, .draw circle').forEach(e => e.setAttribute('pathLength', '1'));

  let lastK = -2;
  function setStory(k) {
    if (k === lastK) return; lastK = k;
    lis.forEach((li, i) => { li.classList.toggle('on', i === k); li.classList.toggle('done', i < k); });
    rows.forEach((r, i) => { r.classList.toggle('lit', i <= Math.min(k, 4)); r.classList.toggle('cur', i === k); });
    tfs.forEach((t, i) => t.classList.toggle('on', k >= 5 + i));
  }

  let ticking = false;
  function frame() {
    ticking = false;
    const y = scrollY, vh = innerHeight;
    if (hero && !reduced) {
      const hh = hero.offsetHeight;
      if (y < hh) { if (img) img.style.transform = `translate3d(0,${(y * 0.18).toFixed(1)}px,0) scale(1.04)`; if (card) card.style.transform = `translate3d(0,${(-y * 0.06).toFixed(1)}px,0)`; }
    }
    if (steps) { const r = steps.getBoundingClientRect(); steps.style.setProperty('--sp', clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1).toFixed(3)); }
    if (story) {
      if (stacked()) setStory(7);
      else { const r = story.getBoundingClientRect(), total = story.offsetHeight - vh; const p = clamp(-r.top / Math.max(1, total), 0, 1); setStory(Math.min(7, Math.floor(p * 8.2))); }
    }
    if (sidx) {
      sidx.classList.toggle('show', hero ? y > hero.offsetHeight * 0.65 : true);
      let cur = -1; secs.forEach((s, i) => { if (s && s.offsetTop <= y + vh * 0.4) cur = i; });
      sidxLinks.forEach((a, i) => a.classList.toggle('on', i === cur));
    }
  }
  const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
  addEventListener('scroll', req, { passive: true }); addEventListener('resize', req); frame();

  // closing words
  const words = $$('.words');
  if (words.length) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } }), { threshold: 0.4 });
    words.forEach(w => io.observe(w));
  }

  // FAQ opens and closes with height, not a jump
  $$('.faq details').forEach(d => {
    const s = $('summary', d), a = $('.a', d); if (!s || !a) return;
    s.addEventListener('click', e => {
      if (reduced || !a.animate) return;
      e.preventDefault();
      if (d.open) { const h = a.offsetHeight; const an = a.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 280, easing: 'cubic-bezier(.2,.7,.2,1)' }); an.onfinish = () => { d.open = false; }; }
      else { d.open = true; const h = a.offsetHeight; a.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.7,.2,1)' }); }
    });
  });

  // a soft light that follows the pointer across panels
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    $$('.panel, .qcard, .txcard').forEach(el => el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(); el.style.setProperty('--mx', (e.clientX - r.left) + 'px'); el.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }));
  }
}
