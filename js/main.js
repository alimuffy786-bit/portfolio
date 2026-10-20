// ═══════════════════════════════════════════════════
// SCROLL — native page scrolling, no global preventDefault
// Overlays lock the body through syncScrollLock(); nothing hijacks the wheel.
// ═══════════════════════════════════════════════════
function syncScrollLock(){
  const lf = document.getElementById('lfModal'), art = document.getElementById('artOverlay');
  const anyOpen = !!(lf && lf.classList.contains('open')) || !!(art && art.classList.contains('open'));
  document.body.style.overflow = anyOpen ? 'hidden' : '';
}
// defensive re-sync — bfcache restore / tab return can otherwise strand the lock
window.addEventListener('pageshow', syncScrollLock);
document.addEventListener('visibilitychange', syncScrollLock);

// ═══════════════════════════════════════════════════
// TAB TITLE — the tab is a place, not a status bar
// visibilitychange, not blur/focus: blur also fires for devtools and OS dialogs, which is not
// "leaving". Only a hidden tab gets the nudge. The base title is read once (this script sits at
// the end of <body>), and the restore is gated on our own string so nothing else gets clobbered.
// ═══════════════════════════════════════════════════
(function(){
  const BASE = document.title;
  const AWAY = 'Come back, the work isn\u2019t finished \u273B';
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.title = AWAY;
    else if (document.title === AWAY) document.title = BASE;
  });
  // bfcache can snapshot the page while it is still in the away state
  window.addEventListener('pageshow', () => {
    if (!document.hidden && document.title === AWAY) document.title = BASE;
  });
})();

// ═══════════════════════════════════════════════════
// CURSOR — white lines + difference blend, sitewide.
// Desktop-only: gated behind a fine pointer, and armed on the first real move so the
// mark is never positioned — or painted — at the 0,0 corner on load or on touch.
// ═══════════════════════════════════════════════════
const cur = document.getElementById('cur');          // kept top-level: also used by the
const curWord = document.getElementById('curWord');  // art-overlay + magnifier blocks below
// fail-safe direction: no matchMedia ⇒ assume fine (preserve a visible cursor, since
// body{cursor:none} would otherwise leave the visitor with no cursor at all)
const fineMQ = window.matchMedia ? window.matchMedia('(pointer: fine)') : null;
const hasFinePointer = () => !fineMQ || fineMQ.matches;

if (cur && hasFinePointer()) {
  const calmMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const calm = () => !!(calmMQ && calmMQ.matches);

  // ASTERISK MAGNET — the reticle is the attractor, not the glyph. An anchor is a centre
  // and a name (`data-snap`), read from geometry, so "near" holds while the pointer is
  // still outside the button: the footer door's box is mostly Arabic, and the asterisk is
  // what should catch the mark. Three radii — pull begins at RING, is total inside CORE,
  // and lets go at RELEASE, so a pointer parked on the boundary cannot flicker.
  const RING = 104, CORE = 40, RELEASE = 132, NAME_AT = 80, SNAP_SCALE = 2.6;
  const anchors = Array.from(document.querySelectorAll('[data-snap]')).map(el => ({
    el, name: (el.dataset.snap || 'open').trim(), x: 0, y: 0
  }));
  // rects are cached: reading them every frame would force a synchronous layout right
  // after the loop writes left/top. They are re-read only when the page can have moved.
  let rectsDirty = true;
  function measure(){
    for (const a of anchors){
      const r = a.el.getBoundingClientRect();
      a.x = r.left + r.width / 2; a.y = r.top + r.height / 2;
    }
    rectsDirty = false;
  }
  addEventListener('scroll', () => { rectsDirty = true; }, { passive: true });
  addEventListener('resize', () => { rectsDirty = true; });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { rectsDirty = true; });

  // CONTEXT CURSOR — the mark takes its weight from what it is over. `data-cursor` opts an
  // element in even when it is magnetic (nav numerals, the comparison handle); magnetic
  // elements without it stay untouched. These handlers only *declare* a weight and a word:
  // the loop below is the single writer of transform and label, so a hover and a magnet
  // compose instead of overwriting each other.
  const CUR_SCALE = { link:1.6, nav:1.9, work:2.2, drag:2.1, archive:2.4 };
  const CUR_WORD  = { work:'look', drag:'drag', archive:'archive' };
  let hoverScale = 1, hoverWord = '';
  function curEnter(el){
    const state = el.dataset.cursor || 'link';
    hoverScale = CUR_SCALE[state] || CUR_SCALE.link;
    hoverWord  = CUR_WORD[state] || '';
  }
  function curLeave(){ hoverScale = 1; hoverWord = ''; }
  document.querySelectorAll('a, button, [data-cursor]').forEach(el => {
    if (el.hasAttribute('data-magnetic') && !el.hasAttribute('data-cursor')) return;
    el.addEventListener('mouseenter', () => curEnter(el));
    el.addEventListener('mouseleave', curLeave);
  });

  let mx=0,my=0,cx=0,cy=0,tracking=false,locked=null,shownScale=-1,shownWord='',shownSnap=false;
  // pointermove + pointerType, not mousemove: touch and pen — and hybrid devices whose
  // primary pointer flipped coarse since load — can never position or arm the custom cursor.
  document.addEventListener('pointermove', e => {
    if ((e.pointerType && e.pointerType !== 'mouse') || !hasFinePointer()) return;
    mx=e.clientX; my=e.clientY;
    if (tracking) return;
    tracking = true;                 // first real move: seed, arm, show — then start the loop
    cx = mx; cy = my;
    cur.style.left = cx+'px'; cur.style.top = cy+'px';
    cur.classList.add('cur-on');
    requestAnimationFrame(tick);
  }, { passive: true });
  // a pointer that leaves the window must let go, or the magnet keeps pulling at nothing
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) locked = null; });

  function tick(){
    if (rectsDirty) measure();

    // nearest anchor, with hysteresis and one hit test. The hit test is what stops the nav
    // asterisk pulling from behind an open wall: a magnet for a control you cannot see is a
    // lie. It runs only for candidates already inside the ring.
    let best = null;
    for (const a of anchors){
      const d = Math.hypot(mx - a.x, my - a.y);
      const ring = a === locked ? RELEASE : RING;
      if (d >= ring) continue;
      const hit = document.elementFromPoint(a.x, a.y);
      if (!hit || !(a.el === hit || a.el.contains(hit))) continue;
      if (!best || d < best.d) best = { a, d, ring };
    }
    locked = best ? best.a : null;

    // 0 at the ring, 1 at the core, smoothstep in between: no step at either end
    let pull = 0;
    if (best){
      const t = Math.max(0, Math.min(1, (best.ring - best.d) / (best.ring - CORE)));
      pull = t * t * (3 - 2 * t);
    }
    const amp = calm() ? 0 : pull;   // reduced motion keeps the name and drops the pull

    const tx = mx + ((best ? best.a.x : mx) - mx) * amp;
    const ty = my + ((best ? best.a.y : my) - my) * amp;
    cx += (tx - cx) * 0.15; cy += (ty - cy) * 0.15;
    cur.style.left = cx+'px'; cur.style.top = cy+'px';

    // the magnet is also the weight: the mark only ever adds to what the hover asked for
    const scale = hoverScale + (SNAP_SCALE - hoverScale) * amp;
    if (Math.abs(scale - shownScale) > 0.002){
      cur.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(3)})`;
      shownScale = scale;
    }

    // the name arrives before the pull is total (80px) and reads as a word, not a state
    const onAnchor = !!(best && best.d < NAME_AT);
    const next = onAnchor ? best.a.name : hoverWord;
    if (next !== shownWord || onAnchor !== shownSnap){
      shownWord = next; shownSnap = onAnchor;
      if (curWord) curWord.textContent = next;
      cur.classList.toggle('cur-label', !!next);
      cur.classList.toggle('cur-snap', onAnchor);
    }
    requestAnimationFrame(tick);
  }
}

// ═══════════════════════════════════════════════════
// MAGNETIC BUTTONS/LINKS — sitewide
// ═══════════════════════════════════════════════════
document.querySelectorAll('[data-magnetic]').forEach(el => {
  el.addEventListener('mousemove', e => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - (r.left + r.width/2)) * 0.35;
    const y = (e.clientY - (r.top + r.height/2)) * 0.35;
    el.style.transform = `translate(${x}px,${y}px)`;
  });
  el.addEventListener('mouseleave', () => {
    el.style.transition = 'transform 0.4s cubic-bezier(0.16,1,0.3,1)';
    el.style.transform = 'translate(0,0)';
    setTimeout(() => el.style.transition = '', 400);
  });
  el.addEventListener('mouseenter', () => { el.style.transition = ''; });
});

// ═══════════════════════════════════════════════════
// HERO — name fit + char animation + cursor-as-light
// ═══════════════════════════════════════════════════
function fitName(){
  const block = document.getElementById('nameBlock');
  const l1 = document.getElementById('line1');
  const l2 = document.getElementById('line2');
  if (!block || !l1 || !l2) return;
  const w = block.clientWidth;
  let s1 = 260; l1.style.fontSize = s1+'px'; l1.style.whiteSpace = 'nowrap';
  while (l1.scrollWidth > w && s1 > 20) { s1 -= 2; l1.style.fontSize = s1+'px'; }
  l2.style.fontSize = Math.round(s1*0.62)+'px'; l2.style.whiteSpace = 'nowrap';
}
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
function animChars(){
  const l1 = document.getElementById('line1');
  if (!l1) return;
  [['line1',0],['line2', l1.textContent.length*0.03+0.05]].forEach(([id,base]) => {
    const el = document.getElementById(id);
    const txt = el.textContent;
    el.innerHTML = txt.split('').map((c,i) => `<span class="char" style="animation-delay:${(base+i*0.03).toFixed(3)}s">${c}</span>`).join('');
  });
}
// Init on DOMContentLoaded, not window 'load': 'load' waits on every image, and 14 of the 19 images
// on this page are eager (~2 MB total) — that held the name at opacity 0 for seconds on mobile.
// Sizing runs twice: instantly on the metrics that are live, then re-fitted once the real Cormorant
// Garamond faces are in. The font paths re-fit only — they never reveal again — because .char's
// charUp (0.62s + per-char delays, done ~1.03s) starts the moment animChars() injects the spans,
// so a reveal deferred to the fonts would silently eat the whole intro.
let heroInited = false;
function initHero(){
  const nb = document.getElementById('nameBlock');
  if (heroInited || !nb) return;   // animChars() rewrites innerHTML — a second call restarts the stagger
  heroInited = true;
  fitName();                       // size with whatever metrics are available right now
  animChars();
  nb.style.opacity = '1';          // same tick as animChars(), so the char intro is actually seen
}
const refitHero = () => { if (heroInited) fitName(); };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHero, { once: true });
else initHero();                   // defer/async or late injection: the DOM is already parsed
if (document.fonts) {
  if (document.fonts.load) {       // force the two hero faces, then wait on exactly those
    Promise.all([
      document.fonts.load('700 1em "Cormorant Garamond"'),
      document.fonts.load('italic 300 1em "Cormorant Garamond"')
    ]).then(refitHero, refitHero);
  } else if (document.fonts.ready) {
    document.fonts.ready.then(refitHero);
  }
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refitHero);
}
window.addEventListener('resize', debounce(fitName, 100));

// Cursor-as-light on hero photo
const photoWrap = document.getElementById('photoWrap');
const photoTinted = document.getElementById('photoTinted');
if (photoWrap && photoTinted) {
  let targetR=60, currentR=60;
  document.addEventListener('mousemove', e => {
    const rect = photoWrap.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const inside = x>=0 && x<=rect.width && y>=0 && y<=rect.height;
    if (inside) {
      photoTinted.style.setProperty('--x', (x/rect.width*100).toFixed(2)+'%');
      photoTinted.style.setProperty('--y', (y/rect.height*100).toFixed(2)+'%');
      targetR = 200;
    } else { targetR = 60; }
  });
  (function animR(){ currentR += (targetR-currentR)*0.08; photoTinted.style.setProperty('--r', currentR.toFixed(1)+'px'); requestAnimationFrame(animR); })();
}

// ═══════════════════════════════════════════════════
// MASKED LINE REVEAL + STAT SNAP — IntersectionObserver, sitewide
// ═══════════════════════════════════════════════════
const revealIO = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); revealIO.unobserve(e.target); } });
}, { threshold: 0.2 });
document.querySelectorAll('.mask-wrap, .stat-snap').forEach(el => revealIO.observe(el));

// ═══════════════════════════════════════════════════
// MANDALA CIRCULAR REVEAL — Eid image
// ═══════════════════════════════════════════════════
// The reveal is CSS-native now (scroll-driven, fail-open): see .eid-reveal / @keyframes mandalaReveal in index.html.
// Removed: the IntersectionObserver gate observed the element that is itself clipped to circle(0%), so its
// callback never fired and #eidImg stayed invisible even when fully in view.

// ═══════════════════════════════════════════════════
// CONFERENCE ROOM WALL PAYOFF
// ═══════════════════════════════════════════════════
const WALL_ORDER = [1,'A',3,'B',5,2,'C',8,'D',9,6,'E',4,'F',7,'G',10,'H'];
const WALL_META = {
  1:{label:'Cayan Tower, Dubai',ratio:0.433}, 3:{label:'Wasl Tower, Dubai',ratio:0.430},
  5:{label:'City Tower 1, Dubai',ratio:0.5575}, 'A':{label:'The Louvre Museum, France',ratio:1.3239},
  'B':{label:'Museum of the Future, Dubai',ratio:1.3224}, 8:{label:'Palm Tower, Dubai',ratio:0.4933},
  9:{label:'Al Faisaliah Tower, KSA',ratio:0.4933}, 'C':{label:'National Museum of Qatar',ratio:1.2028},
  'D':{label:'Desert Rock Resort, KSA',ratio:1.2074}, 6:{label:'King Faisal Specialist Hospital, KSA',ratio:0.5369},
  2:{label:'Atlantis The Royal, Dubai',ratio:0.8065}, 4:{label:'500 500 Hospital, Egypt',ratio:0.8056},
  'E':{label:'Zayed International Airport, Abu Dhabi',ratio:1.2028}, 'F':{label:'City Centre Al Zahia, Sharjah',ratio:1.2074},
  7:{label:'Doha Tower, Qatar',ratio:0.4688}, 10:{label:'JW Marriott Marquis Hotel, Dubai',ratio:0.4192},
  'G':{label:'Sheikh Khalifa Bin Zayed Al Nahyan Mosque, Al Ain',ratio:1.2083}, 'H':{label:'Gate Towers, Abu Dhabi',ratio:1.2074},
};
const wallRow = document.getElementById('wallRow');
if (wallRow) {
  let seed = 7;
  function rand(){ seed = (seed*9301+49297) % 233280; return seed/233280; }
  WALL_ORDER.forEach(ref => {
    const meta = WALL_META[ref];
    const rot = (rand()*1.4 - 0.7).toFixed(2);
    const frame = document.createElement('div');
    frame.className = 'frame';
    const wpx = Math.round(170 * meta.ratio) + 28;
    frame.style.width = wpx + 'px';
    frame.style.setProperty('--rot', rot + 'deg');
    frame.innerHTML = `<div class="frame-mat"><img class="frame-photo" src="images/wall/wall-${ref}.jpg" alt="${meta.label}"></div><span class="frame-label">${meta.label}</span>`;
    wallRow.appendChild(frame);
  });

  const wallRoom = document.getElementById('wallRoom');
  const allFrames = wallRow.querySelectorAll('.frame');
  const finalLine = document.getElementById('finalLine');
  let wallRevealed = false;
  function revealWall(){
    if (wallRevealed) return;
    wallRevealed = true;
    wallRoom.style.transition = 'opacity 0.5s ease';
    wallRoom.style.opacity = '1';
    allFrames.forEach((frame, i) => {
      setTimeout(() => {
        frame.style.transition = 'opacity 0.65s ease, transform 0.65s cubic-bezier(0.16,1,0.3,1), filter 0.65s ease';
        frame.style.opacity = '1';
        frame.style.transform = `translateY(0) scale(1) rotate(${frame.style.getPropertyValue('--rot')})`;
        frame.style.filter = 'brightness(1)';
      }, i * 55);
    });
  }
  const wallIO = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) revealWall(); });
  }, { threshold: 0.6 });
  if (finalLine) wallIO.observe(finalLine);
}

// ═══════════════════════════════════════════════════
// DYK COMPARISON SLIDER
// ═══════════════════════════════════════════════════
const comparison = document.getElementById('comparison');
if (comparison) {
  const imgBefore = document.getElementById('imgBefore');
  const divider = document.getElementById('divider');
  const handle = document.getElementById('handle');
  const visionLabel = document.querySelector('.dyk-label.vision');
  const shippedLabel = document.querySelector('.dyk-label.shipped');
  const LABEL_FADE = 12; // % of travel over which a label fades out
  let pos = 50, isDragging = false, autoDemoActive = false, demoPlayed = false;

  function setPosition(pct){
    pos = Math.max(0, Math.min(100, pct));
    imgBefore.style.clipPath = `inset(0 ${100-pos}% 0 0)`;
    divider.style.left = pos + '%';
    handle.style.left = pos + '%';
    comparison.setAttribute('aria-valuenow', Math.round(pos));
    // labels fade with the divider: fully visible only while their half is shown
    if (visionLabel) {
      visionLabel.style.opacity = Math.min(1, pos / LABEL_FADE).toFixed(2);
      visionLabel.setAttribute('aria-hidden', pos <= 0.5 ? 'true' : 'false');
    }
    if (shippedLabel) {
      shippedLabel.style.opacity = Math.min(1, (100 - pos) / LABEL_FADE).toFixed(2);
      shippedLabel.setAttribute('aria-hidden', pos >= 99.5 ? 'true' : 'false');
    }
  }
  function pctFromClientX(clientX){
    const rect = comparison.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * 100;
  }
  comparison.addEventListener('mousedown', e => { autoDemoActive=false; cancelSnap(); isDragging=true; setPosition(pctFromClientX(e.clientX)); });
  document.addEventListener('mousemove', e => { if (isDragging) setPosition(pctFromClientX(e.clientX)); });
  document.addEventListener('mouseup', () => { if (!isDragging) return; isDragging = false; settle(); });
  comparison.addEventListener('touchstart', e => { autoDemoActive=false; cancelSnap(); isDragging=true; setPosition(pctFromClientX(e.touches[0].clientX)); }, {passive:true});
  document.addEventListener('touchmove', e => { if (isDragging) setPosition(pctFromClientX(e.touches[0].clientX)); }, {passive:true});
  document.addEventListener('touchend', () => { if (!isDragging) return; isDragging = false; settle(); });
  comparison.addEventListener('keydown', e => {
    autoDemoActive = false; cancelSnap();
    if (e.key === 'ArrowLeft') { setPosition(pos-5); e.preventDefault(); }
    if (e.key === 'ArrowRight') { setPosition(pos+5); e.preventDefault(); }
    if (e.key === 'Home') { setPosition(0); e.preventDefault(); }
    if (e.key === 'End') { setPosition(100); e.preventDefault(); }
  });

  // ── MAGNETIC DETENTS ──────────────────────────────────────────────────
  // Release near 0 / 50 / 100 and the divider finishes the gesture for you. The radius is
  // deliberately small: a slider that grabs from further away stops feeling like a slider.
  const DETENTS = [0, 50, 100], SNAP_RADIUS = 7, SNAP_MS = 340;
  const stillMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const prefersReduced = () => !!(stillMQ && stillMQ.matches);
  let snapRaf = 0;
  function cancelSnap(){ if (snapRaf) { cancelAnimationFrame(snapRaf); snapRaf = 0; } }
  function settle(){
    cancelSnap();
    let target = null, best = SNAP_RADIUS + 0.001;
    DETENTS.forEach(d => { const dist = Math.abs(pos - d); if (dist < best) { best = dist; target = d; } });
    if (target === null || target === pos) return;
    if (prefersReduced()) { setPosition(target); return; }
    const from = pos, started = performance.now();
    (function step(){
      const t = Math.min(1, (performance.now() - started) / SNAP_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setPosition(from + (target - from) * eased);
      snapRaf = t < 1 ? requestAnimationFrame(step) : 0;
    })();
  }

  function easeInOutCubic(t){ return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }
  function playAutoDemo(){
    if (demoPlayed) return;
    demoPlayed = true; autoDemoActive = true; cancelSnap();
    const kf = [{t:0,pos:50},{t:700,pos:32},{t:1500,pos:68},{t:2100,pos:50}];
    const start = performance.now();
    function step(now){
      if (!autoDemoActive) return;
      const elapsed = now - start, total = kf[kf.length-1].t;
      if (elapsed >= total) { setPosition(50); autoDemoActive = false; return; }
      let seg = 0;
      for (let i=0;i<kf.length-1;i++) if (elapsed>=kf[i].t && elapsed<=kf[i+1].t) { seg=i; break; }
      const a=kf[seg], b=kf[seg+1];
      const p = (elapsed-a.t)/(b.t-a.t);
      setPosition(a.pos + (b.pos-a.pos)*easeInOutCubic(Math.max(0,Math.min(1,p))));
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  const dykIO = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) playAutoDemo(); });
  }, { threshold: 0.5 });
  dykIO.observe(comparison);
  setPosition(50);
}

// ═══════════════════════════════════════════════════
// LEAFLET THUMB — tactile tilt
// The sheet is a physical object: the edge under the pointer tips away as if pressed,
// a highlight follows it, and hover-out settles back through the CSS spring. Pointer-fine
// only, and the reduced-motion query is read on every move so an OS toggle lands live.
// ═══════════════════════════════════════════════════
const leafletStage = document.getElementById('leafletStage');
const leafletSpread = document.getElementById('leafletSpread');
// Module scope: the modal calls this when the overlay takes over, so a tilt held at the moment
// of the click cannot ride into the transition — the sheet must be square before its rect is
// measured as the morph's start point.
function settleSheet(){
  if (!leafletStage || !leafletSpread) return;
  leafletStage.classList.remove('tilting');
  leafletSpread.style.transform = '';   // the CSS transition owns the return
}
if (leafletStage && leafletSpread) {
  const tiltMQ = window.matchMedia ? window.matchMedia('(pointer: fine)') : null;
  const tiltStillMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const MAX_TILT = 6;
  const canTilt = () => (!tiltMQ || tiltMQ.matches) && !(tiltStillMQ && tiltStillMQ.matches);
  leafletStage.addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;   // never on touch or pen
    if (!canTilt()) return;
    const r = leafletStage.getBoundingClientRect();
    if (!r.width || !r.height) return;   // lazy thumbs have not laid out yet — no NaN transforms
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    const ry = ((px - 0.5) * 2 * MAX_TILT).toFixed(2);
    const rx = ((0.5 - py) * 2 * MAX_TILT).toFixed(2);
    leafletStage.classList.add('tilting');
    leafletSpread.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(0)';
    leafletStage.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
    leafletStage.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  });
  leafletStage.addEventListener('pointerleave', settleSheet);
  leafletStage.addEventListener('pointercancel', settleSheet);
}

// ═══════════════════════════════════════════════════
// LEAFLET GATE FOLD MODAL
// ═══════════════════════════════════════════════════
const lfModal = document.getElementById('lfModal');
const openLeafletBtn = document.getElementById('openLeafletBtn');
const leafletThumb = document.getElementById('leafletThumb');
if (lfModal && openLeafletBtn) {
  const lfCloseBtn = document.getElementById('lfModalClose');
  const lfBook     = lfModal.querySelector('.lf-book-container');
  const lfReduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const lfWideMQ   = window.matchMedia ? window.matchMedia('(min-width: 801px)') : null;
  const MORPH_MS = 900, MORPH_BACK_MS = 420;
  let lfMorph = null, lfOpen = false, lfLastTrigger = null;

  // The closed leaflet on screen is the two static pages side by side; the flaps carry the cover
  // art on top of them. The container is exactly twice that wide (its outer quarters are the flap
  // travel), so measuring the container would grow the sheet out of transparent margins nobody can
  // see. Measure the visible object instead — correct in either flip state.
  function closedBookRect(){
    const a = pageL.getBoundingClientRect(), b = pageR.getBoundingClientRect();
    return {
      left: Math.min(a.left, b.left), top: Math.min(a.top, b.top),
      width: Math.max(a.right, b.right) - Math.min(a.left, b.left),
      height: Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top)
    };
  }
  // Below 801px the spread stacks (two pages vertically) and the source/dest ratios diverge to
  // 2.0x / 8.4x at 390px — a rect morph there reads as a smear, not as the same object. Reduced
  // motion, or a destination parked off-screen, fall through to the CSS spring as well.
  function canMorph(src, dst){
    return !(lfReduceMQ && lfReduceMQ.matches) && !!(lfWideMQ && lfWideMQ.matches)
      && src.width > 0 && src.height > 0 && dst.width > 0 && dst.height > 0
      && dst.top > -1 && dst.top + dst.height < window.innerHeight + 1;
  }
  // FLIP, centre to centre: at progress 0 the book covers the thumbnail exactly, so the object
  // never appears to travel — the dark room opens around it and the sheet settles into place.
  function flipFrom(src, dst){
    const sx = src.width / dst.width, sy = src.height / dst.height;
    const tx = (src.left + src.width / 2) - (dst.left + dst.width / 2);
    const ty = (src.top + src.height / 2) - (dst.top + dst.height / 2);
    return 'translate(' + tx.toFixed(2) + 'px,' + ty.toFixed(2) + 'px) scale(' + sx.toFixed(4) + ',' + sy.toFixed(4) + ')';
  }
  function setSheetExpanded(on){
    const v = on ? 'true' : 'false';
    if (leafletThumb) leafletThumb.setAttribute('aria-expanded', v);
    openLeafletBtn.setAttribute('aria-expanded', v);
  }
  // The trigger button wraps the stage, and a <button> does not collapse margins with its child:
  // its box is the artwork plus the stage's 2rem bottom margin. Morphing from that box would start
  // the sheet on 32px of empty paper, so measure the painted sheet when the thumb is the trigger.
  function morphSource(el){
    if (el === leafletThumb && leafletStage) return leafletStage.getBoundingClientRect();
    return el.getBoundingClientRect();
  }
  function dropMorph(){
    const a = lfMorph; lfMorph = null;
    if (!a) return;
    try { a.cancel(); } catch(err){}
  }
  // WAAPI rather than a transition: the morph must be interruptible (Escape mid-flight), and
  // anim.cancel() is atomic where reversing a CSS transition means juggling inline styles.
  function openLeaflet(from){
    if (lfOpen) return;
    lfOpen = true;
    dropMorph();                        // a reverse still filling must not win the measurement
    settleSheet();
    lfLastTrigger = (from && from.getBoundingClientRect) ? from : openLeafletBtn;
    const src = morphSource(lfLastTrigger);
    // measure the destination with the base translateY(12px) scale(0.972) neutralised — inline
    // style, forced layout, then handed straight back so the CSS spring is untouched
    const savedX = lfBook.style.transform, savedT = lfBook.style.transition;
    lfBook.style.transition = 'none';
    lfBook.style.transform = 'none';
    const dst = closedBookRect();
    lfBook.style.transform = savedX;
    lfBook.style.transition = savedT;

    lfModal.inert = false;
    lfModal.setAttribute('aria-hidden', 'false');
    lfModal.classList.add('open');
    setSheetExpanded(true);
    syncScrollLock();

    if (canMorph(src, dst)) {
      lfBook.style.willChange = 'transform';
      lfMorph = lfBook.animate(
        [{ transform: flipFrom(src, dst) }, { transform: 'none' }],
        { duration: MORPH_MS, easing: 'cubic-bezier(0.22,1.4,0.36,1)', fill: 'both' }
      );
      lfMorph.onfinish = () => {
        const a = lfMorph; lfMorph = null;
        requestAnimationFrame(() => {   // let the CSS settle transition land before dropping the fill
          if (a) { try { a.cancel(); } catch(err){} }
          lfBook.style.willChange = '';
        });
      };
    }
    if (lfCloseBtn) lfCloseBtn.focus({ preventScroll: true });
  }
  function closeLfModal(){
    if (!lfOpen) return;
    lfOpen = false;
    const backEl = (leafletThumb && document.contains(leafletThumb)) ? leafletThumb : openLeafletBtn;
    const src = morphSource(backEl);
    const dst = closedBookRect();        // still at identity — .open comes off below
    const fromT = lfMorph ? getComputedStyle(lfBook).transform : '';
    dropMorph();
    lfModal.classList.remove('open');
    lfModal.setAttribute('aria-hidden', 'true');
    lfModal.inert = true;
    setSheetExpanded(false);
    syncScrollLock();
    // The reverse starts from wherever the open morph got to, so an Escape mid-flight folds the
    // sheet back into the thumbnail from its current size instead of snapping to full first.
    if (canMorph(src, dst)) {
      lfBook.style.willChange = 'transform';
      lfMorph = lfBook.animate(
        [{ transform: fromT && fromT !== 'none' ? fromT : 'none' }, { transform: flipFrom(src, dst) }],
        { duration: MORPH_BACK_MS, easing: 'cubic-bezier(0.5,0,0.75,0.35)', fill: 'both' }
      );
      lfMorph.onfinish = () => {
        const a = lfMorph; lfMorph = null;
        requestAnimationFrame(() => {
          if (a) { try { a.cancel(); } catch(err){} }
          lfBook.style.willChange = '';
        });
      };
    }
    // the trigger may have been removed or hidden while the sheet was open
    if (lfLastTrigger && document.contains(lfLastTrigger)) lfLastTrigger.focus({ preventScroll: true });
    lfLastTrigger = null;
  }
  openLeafletBtn.addEventListener('click', () => openLeaflet(openLeafletBtn));
  if (leafletThumb) leafletThumb.addEventListener('click', () => openLeaflet(leafletThumb));
  if (lfCloseBtn) lfCloseBtn.addEventListener('click', closeLfModal);
  // null-safe: `role="dialog" aria-modal="true"` promised containment, so Tab must not escape
  // into the page behind the sheet — and neither binding may throw if a control moves.
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && lfOpen && !(artOverlay && artOverlay.classList.contains('open'))) closeLfModal();
  });
  lfModal.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const f = Array.from(lfModal.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !lfModal.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  const flapL = document.getElementById('lfFlapL'), flapR = document.getElementById('lfFlapR');
  const shadowL = document.getElementById('lfShadowL'), shadowR = document.getElementById('lfShadowR');
  const pageL = document.getElementById('lfPageL'), pageR = document.getElementById('lfPageR');
  const hint = document.getElementById('lfHint'), stateLbl = document.getElementById('lfStateLabel');
  const btnClosed = document.getElementById('lfBtnClosed');
  const OPEN_ANGLE = 100;
  let Lt=0, Lc=0, Lv=0, Rt=0, Rc=0, Rv=0;
  const K=0.10, D=0.70;

  function applyFlap(el, shadow, prog, isLeft){
    const angle = OPEN_ANGLE * prog;
    const ry = isLeft ? -angle : angle;
    el.style.transform = `rotateY(${ry.toFixed(2)}deg)`;
    const brightness = 1 - Math.min(prog,1)*0.4;
    el.style.filter = `brightness(${brightness.toFixed(2)})`;
    const shadowBlur = 4 + prog*22, shadowOpacity = 0.15 + prog*0.25;
    el.querySelector('.lf-flap-face').style.boxShadow = `${isLeft?2:-2}px 0 ${shadowBlur.toFixed(0)}px rgba(0,0,0,${shadowOpacity.toFixed(2)})`;
    shadow.style.opacity = (Math.sin(prog * Math.PI) * 0.8).toFixed(2);
  }
  // One rAF loop drives the leaflet. Every write is gated on a state change: at 60fps the
  // previous version re-wrote four class tokens, two text nodes and a disabled flag per frame.
  let lastPhase = '', lastClickable = null, isFlipped = false;
  (function anim(){
    const lf=(Lt-Lc)*K; Lv=(Lv+lf)*D; Lc+=Lv;
    const rf=(Rt-Rc)*K; Rv=(Rv+rf)*D; Rc+=Rv;
    applyFlap(flapL, shadowL, Math.max(0,Math.min(Lc,1)), true);
    applyFlap(flapR, shadowR, Math.max(0,Math.min(Rc,1)), false);
    const avg=(Lc+Rc)/2;
    const bothOpen = avg > 0.85;
    const phase = avg < 0.1 ? 'closed' : (bothOpen ? 'open' : 'opening');
    if (bothOpen !== lastClickable) {
      lastClickable = bothOpen;
      pageL.classList.toggle('clickable', bothOpen);
      pageR.classList.toggle('clickable', bothOpen);
    }
    // turnOver() writes its own label; only a real phase change may overwrite it.
    if (phase !== lastPhase) {
      lastPhase = phase;
      if (phase==='closed') { stateLbl.textContent='Closed — click either side to open'; hint.textContent='Click a panel to open it'; }
      else if (phase==='opening') { stateLbl.textContent='Opening…'; hint.textContent=''; }
      else { stateLbl.textContent = isFlipped ? 'Turned over — full product spread' : 'Open — company information';
             hint.textContent = isFlipped ? '' : 'Click a page, or turn the leaflet over, to see products'; }
    }
    const closedNow = avg < 0.05;
    if (closedNow !== btnClosed.disabled) btnClosed.disabled = closedNow;
    requestAnimationFrame(anim);
  })();

  flapL.addEventListener('click', () => { Lt = Lt<0.5 ? 1:0; });
  flapR.addEventListener('click', () => { Rt = Rt<0.5 ? 1:0; });
  btnClosed.addEventListener('click', () => { Lt=0; Rt=0; });

  const turnWrapper = document.getElementById('lfTurnWrapper');
  function turnOver(){
    Lt=1; Rt=1;
    isFlipped = !isFlipped;
    turnWrapper.classList.toggle('flipped', isFlipped);
    stateLbl.textContent = isFlipped ? 'Turned over — full product spread' : 'Open — company information';
    hint.textContent = isFlipped ? '' : 'Click a page, or turn the leaflet over, to see products';
  }
  document.getElementById('lfBtnTurnOver').addEventListener('click', turnOver);
  [pageL, pageR].forEach(p => {
    p.addEventListener('click', () => { if (Lc>0.85 && Rc>0.85 && !isFlipped) turnOver(); });
  });
}

// ═══════════════════════════════════════════════════
// HIDDEN LAYER — nav + footer triggers + circular reveal + BINGO magnifier
// ═══════════════════════════════════════════════════
const artOverlay = document.getElementById('artOverlay');
// TWO DOORS: the asterisk in the nav and the B1 plate in the footer. One selector, so a door
// added to the markup is a door here without a second edit. There used to be a third — the
// Arabic verse wrapped in a button — which made a line of poetry a control; it is typography
// now, and the asterisk above is the only place to press.
const artTriggers = Array.from(document.querySelectorAll('[aria-controls="artOverlay"]'));
if (artOverlay && artTriggers.length) {
  const setExpanded = v => artTriggers.forEach(el => el.setAttribute('aria-expanded', v ? 'true' : 'false'));
  const artClose = document.getElementById('artClose');
  const artReturn = document.getElementById('artReturn');
  const frames = Array.from(artOverlay.querySelectorAll('.art-frame'));
  // the reticle is drawn in `difference`, which over warm stone inverts to a cold grey that
  // belongs to no other surface on the site. It is the only thing that needs to know the
  // room is light, so the mode is set here rather than keyed off a body class.
  const reticle = document.getElementById('cur');
  let lastTrigger = null;

  // PLACARD STATE — hover reads a label, click pins it. One at a time: two open labels on
  // a wall read as a menu, not as a gallery.
  function setLabel(frame, on){
    const work = frame.closest('.art-work');
    if (!work) return;
    work.classList.toggle('revealed', on);
    frame.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function clearLabels(){ frames.forEach(frame => setLabel(frame, false)); }
  frames.forEach(frame => {
    frame.addEventListener('click', () => {
      const wasOpen = frame.getAttribute('aria-expanded') === 'true';
      frames.forEach(other => { if (other !== frame) setLabel(other, false); });
      setLabel(frame, !wasOpen);
    });
  });

  function openArtOverlay(trigger){
    const rect = trigger.getBoundingClientRect();
    // clamp to the viewport: a trigger offscreen (programmatic click / focused-but-scrolled)
    // would otherwise put the reveal origin far past the edge, and the circle could never
    // grow to cover the page.
    const pct = v => Math.min(100, Math.max(0, v)).toFixed(1) + '%';
    artOverlay.style.setProperty('--ox', pct((rect.left+rect.width/2)/window.innerWidth*100));
    artOverlay.style.setProperty('--oy', pct((rect.top+rect.height/2)/window.innerHeight*100));
    lastTrigger = trigger;
    if (reticle) reticle.classList.add('cur-ink');
    artOverlay.scrollTop = 0;          // always open on the first work
    artOverlay.inert = false;          // inert, not just aria-hidden, is what gates the tab order
    artOverlay.classList.add('open');
    artOverlay.setAttribute('aria-hidden', 'false');
    setExpanded(true);
    syncScrollLock();
    // the room announces itself instead of the ledger reaching in: js/ledger.js loads its SDK
    // on this event, so a visitor who never opens the wall never fetches a database client
    document.dispatchEvent(new CustomEvent('ad:wall', { detail: 'open' }));
    if (artClose) artClose.focus({ preventScroll: true });
  }
  function closeArtOverlay(){
    clearLabels();                     // reopening starts on a bare wall
    artOverlay.classList.remove('open');
    artOverlay.setAttribute('aria-hidden', 'true');
    artOverlay.inert = true;
    setExpanded(false);
    syncScrollLock();
    if (reticle) reticle.classList.remove('cur-ink');
    document.dispatchEvent(new CustomEvent('ad:wall', { detail: 'close' }));
    // the trigger may have been removed or hidden while the wall was open
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
  }
  artTriggers.forEach(trigger => trigger.addEventListener('click', () => openArtOverlay(trigger)));
  // null-safe: `role="dialog" aria-modal="true"` promised containment, so Tab must not
  // escape into the page behind the wall — and neither binding may throw if a control moves.
  if (artClose) artClose.addEventListener('click', closeArtOverlay);
  if (artReturn) artReturn.addEventListener('click', closeArtOverlay);
  document.addEventListener('keydown', e => { if (e.key==='Escape' && artOverlay.classList.contains('open')) closeArtOverlay(); });
  artOverlay.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    // every natively focusable control, not just buttons and links: the register is the first
    // text input inside this dialog, and the old selector could not see it. The tabIndex filter
    // is what keeps the honeypot out — it is in the DOM, it has a rect, and it must never be
    // a stop on the Tab ring.
    const f = Array.from(artOverlay.querySelectorAll('button, [href], input, textarea, select, [tabindex]'))
      .filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !artOverlay.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

// BINGO magnifier — high-res source
const bingoWrap = document.getElementById('bingoWrap');
if (bingoWrap) {
  const bingoImg = document.getElementById('bingoImg');
  const lens = document.getElementById('bingoLens');
  const ZOOM = 1.45;   // wall-scale magnification: 2.2× cropped past legibility in a 150px lens
  const HIRES_W = 2200, HIRES_H = 880;
  lens.style.backgroundImage = "url('images/bingo-hires.webp')";
  let targetLX=0, targetLY=0, curLX=0, curLY=0, lensActive=false;

  function updateLensTarget(e){
    const rect = bingoImg.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    const lensSize = 150;
    targetLX = Math.max(-lensSize/2, Math.min(rect.width - lensSize/2, x - lensSize/2));
    targetLY = Math.max(-lensSize/2, Math.min(rect.height - lensSize/2, y - lensSize/2));
    const pctX = x/rect.width, pctY = y/rect.height;
    const bgW = HIRES_W * ZOOM * (rect.width/HIRES_W);
    const bgH = HIRES_H * ZOOM * (rect.width/HIRES_W);
    const bgX = -(pctX*bgW - lensSize/2), bgY = -(pctY*bgH - lensSize/2);
    lens.style.backgroundSize = bgW+'px '+bgH+'px';
    lens.style.backgroundPosition = bgX+'px '+bgY+'px';
  }
  (function smoothLens(){
    curLX += (targetLX-curLX)*0.35; curLY += (targetLY-curLY)*0.35;
    if (lensActive) { lens.style.left = curLX+'px'; lens.style.top = curLY+'px'; }
    requestAnimationFrame(smoothLens);
  })();
  bingoWrap.addEventListener('mousemove', updateLensTarget);
  bingoWrap.addEventListener('mouseenter', () => { if (cur) cur.classList.add('hidden'); lensActive=true; });
  bingoWrap.addEventListener('mouseleave', () => { if (cur) cur.classList.remove('hidden'); lensActive=false; });
  bingoWrap.addEventListener('touchmove', e => {
    if (!lensActive || !e.touches[0]) return;
    updateLensTarget(e.touches[0]);
    if (e.cancelable) e.preventDefault(); // only while the lens is actually tracking
  }, {passive:false});
  bingoWrap.addEventListener('touchstart', () => { lensActive=true; bingoWrap.classList.add('lens-on'); });
  bingoWrap.addEventListener('touchend', () => { lensActive=false; bingoWrap.classList.remove('lens-on'); });
  bingoWrap.addEventListener('touchcancel', () => { lensActive=false; bingoWrap.classList.remove('lens-on'); });
}

// ═══════════════════════════════════════════════════
// EMAIL — the address also ships in index.html (entity-encoded) so the link works
// without JS; this block keeps the decoded copy authoritative and adds click-to-copy.
// ═══════════════════════════════════════════════════
(function(){
  const link = document.getElementById('emailLink');
  if (!link) return;
  const EMAIL = atob("YWxpYXNnYXJkYWxhbDEyM0BnbWFpbC5jb20=");  // single source of truth
  const COPIED = 'Copied to clipboard';
  link.href = 'mailto:' + EMAIL;                 // JS copy stays authoritative
  if (link.textContent.trim() !== EMAIL) link.textContent = EMAIL;  // HTML and JS cannot drift
  let copyTimer = 0;                             // one timer, never stacked
  const setLabel = t => { if (link.textContent !== t) link.textContent = t; };
  const resetCopy = () => { link.style.minWidth = ''; setLabel(EMAIL); };
  const copyFailed = () => { resetCopy(); link.title = 'Copy blocked — press Ctrl/⌘+C'; };
  link.addEventListener('click', e => {
    // modified/middle clicks keep the mailto: affordance (open in the mail client)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    // no Clipboard API (file://, plain http, older browser) ⇒ leave the mailto alone
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    e.preventDefault();
    link.style.minWidth = link.getBoundingClientRect().width + 'px';  // row is content-sized
    navigator.clipboard.writeText(EMAIL)          // ← constant, never link.textContent
      .then(() => setLabel(COPIED))
      .catch(copyFailed);
    clearTimeout(copyTimer);                    // a re-click cancels the pending restore
    copyTimer = setTimeout(resetCopy, 1800);
  });
})();

// ═══════════════════════════════════════════════════
// SOUND — synthesized, never sampled. Four voices built from one oscillator, one noise
// buffer and one shared envelope, so the tactile layer weighs nothing and requests
// nothing (no <audio>, no file, no network). The AudioContext is not constructed until a
// real gesture, which is both the autoplay contract and the reason an idle page costs
// nothing. Every voice is rate-limited and capped, because a click that machine-guns is
// worse than silence.
//
// One tap, one breath, one snap, one thrum.
//
// The tap is 12 ms and belongs to anything with a hard edge; it is voiced as a muffled
// micro-thud (1800 Hz low-pass, 0.065 of body against 0.210 of contact) rather than a
// click, because everything above ~2 kHz is the register a laptop speaker renders as
// glare. It stays tactile and it stays quiet: the old 2500 Hz / 0.46 strike was a UI beep
// wearing a knock. The breath is paper, and it now belongs only to paper: the 0.390 s
// link in the magazine and, inside the leaflet, a 0.150 s flap for a page turn. Both open
// on the same 40 ms attack and close on the same 350 ms release, so a link and a page
// sound like the same material handled at different sizes.
//
// The snap is the opposite argument. Opening or closing the leaflet, and opening or
// closing the museum wall, are not sheets being handled — they are a bound folio seating
// against its magnet. So they get 25 ms of sine falling 160 → 60 Hz (mass arriving) and
// 5 ms of white through a 1200 Hz low-pass (the seat), and nothing else. It is the
// heaviest voice on the site and the shortest: 0.115 of body against the tap's 0.065,
// scheduled 34 ms end to end (a 5 ms look-ahead, 25 ms of body, 4 ms of tail) and audible
// for 29 of them, with no band-pass to ring and no LFO to flutter. A modal that takes
// 1.25 s to morph is answered by 29 ms of material, and that is the point — the sound
// reports the gesture, not the animation.
//
// The comparison slider is neither a button nor paper: it is glass sliding on fluid, so
// it gets a 180 Hz sine pulsing once per 70 ms of horizontal travel — a low thrum while
// the divider moves, and silence 65 ms after it stops. No noise anywhere in that voice,
// so there is nothing in a drag that can hiss. Nothing here is a sample: there is no file
// to preload, cache or lose.
// ═══════════════════════════════════════════════════
(function(){
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { btn.hidden = true; return; }          // no Web Audio ⇒ no dead control

  const KEY = 'ad-sound';
  const readMuted = () => { try { return localStorage.getItem(KEY) === 'off'; } catch(e) { return false; } };
  const writeMuted = m => { try { localStorage.setItem(KEY, m ? 'off' : 'on'); } catch(e) {} };

  // Exponential ramps cannot start from 0 and cannot reach 0, so every envelope opens on
  // this floor (−80 dBFS in amplitude: inaudible, and far below anything the ear tracks).
  const FLOOR = 0.0001;

  // ── THE VOICES AS NUMBERS — every figure the design argues for, in one place, so the
  //    harness can assert them and nobody has to reverse-engineer a comment.
  const TAP = {
    hz0: 450, hz1: 120,                 // the body: one sine falling 450 → 120 Hz in 12 ms —
    body: 0.012,                        //   mass arriving, not a beep: linear pitch reads as a
    strike: 0.010,                      //   swoop, exponential reads as a knock
    lp: 1800, lpQ: 0.7,                 // the strike: 10 ms of noise, low-passed (not band-passed)
    bodyAtk: 0.0015, strikeAtk: 0.0012,
    tail: 0.004,                        // every source stops this far past its envelope floor,
    off: 0.005,                         //   because stopping on the floor is a tick; and the voice
    bodyPk: 0.065, softBody: 0.050,     //   is scheduled ahead of now so one janky frame cannot
    strikePk: 0.210, softStrike: 0.155  // truncate the attack
  };
  // Paper survives only where paper is literal: a page turning inside the leaflet, and
  // the one link in the magazine that reads as a page. Everything that used to borrow
  // this voice to describe an object opening now has a material of its own (SNAP).
  const BREATH = {
    // 1200 Hz, not 1400: rendered offline, 1400 measured brighter than the sweep it
    // replaced (1830 Hz centroid against 1721) — the wrong direction for cardstock.
    // At 1200 the centroid lands at 1689: a shade darker than the old voice, and the
    // RMS stays within 1 dB of it. The band is fixed; only its centre was re-derived.
    atk: 0.040, rel: 0.350,      // the shared envelope: paper in, paper out, always
    decay: 0.62,                 // the body settles to 62% of peak, then releases
    flutter: [4.5, 6.5],         // grip, not chatter: the old 7–10 Hz read as buzz
    // The flutter depth is a fraction of whatever the voice is playing at, never an
    // absolute number: ±19% of a 0.055 link and ±19% of a 0.045 flap are the same grip,
    // where an absolute 0.018 would be a tremolo on the quieter of the two.
    depthRatio: 0.19,
    // One band, fixed and never automated, a quarter off centre: a sheet is over there,
    // not inside your head.
    band: { paper: { hz: 1200, q: 0.8, lp: 2600, lpQ: 0.4, pan: 0.25 } },
    // The remaining ladder: 0.055 for the link, 0.045 for a page. Both sit under the
    // 0.065 the full sheet used to play at, which is right — neither is the sheet.
    level: { short: 0.055, micro: 0.045 },
    dur:   { short: 0.390, micro: 0.150 },
    // The micro opts out of the shared attack/release so a page turn still opens and
    // closes like paper instead of being a truncated sheet: 20 in + 20 held + 110 out.
    // The link keeps the shared pair and derives a hold of 0 — a literal AD of 0.390.
    shape: { micro: { atk: 0.020, rel: 0.110 } },
    gate:  { micro: 110 }             // ms; the link keeps the 220 default
  };

  // ── THE FOLIO — 25 ms of sine falling 160 → 60 Hz, plus 5 ms of white through a
  //    1200 Hz low-pass. The sine is a bound folder seating against its magnet; the
  //    burst is the seat itself. Exponential on the pitch because a linear fall over
  //    3.4:1 reads as a synth sweep and an exponential reads as a thud; exponential on
  //    the gain because the release has to reach the floor without a truncation — at
  //    60 Hz the 25 ms fall is four whole periods, so the wave is continuous where the
  //    source stops. The low-pass is what makes this a seat and not a hiss: nothing
  //    above 1200 Hz leaves the branch, and the branch is 5 ms long.
  const SNAP = {
    hz0: 160, hz1: 60, body: 0.025,
    strike: 0.005, lp: 1200, lpQ: 0.7,
    bodyAtk: 0.0020, strikeAtk: 0.0008,
    // The heaviest voice on the site, and the only one allowed to be: 0.115 of body
    // against the tap's 0.065. An object with hinges should be felt — once.
    bodyPk: 0.115, strikePk: 0.070,
    tail: 0.004, off: 0.005, gate: 40
  };

  // ── THE GLIDE — one 180 Hz sine, 10 ms in and 55 ms out, scheduled once per 70 ms of
  //    horizontal travel. The pointer's own movement is the rhythm: a drag becomes a
  //    ~14 Hz pulse train, which the ear reads as a thrum rather than as a series of
  //    beeps, and a drag that stops is silent 65 ms later. One pitch and no frequency
  //    automation at all — this is glass on fluid, not a sweep.
  //    Level: 0.030 is the page flap's tier, not the tap's. At 180 Hz the ear is roughly
  //    10 dB less sensitive than at the flap's 1200 Hz band, so the thrum is set about
  //    10 dB hotter than the flap's 0.045 in order to land at the same loudness — present
  //    under the hand while dragging, and never the loudest thing on the page.
  const GLIDE = {
    hz: 180, atk: 0.010, rel: 0.055, peak: 0.030,
    lp: 520, lpQ: 0.6,                 // keeps the sine pure and rounds the attack's corner
    gate: 70, px: 4,                   // ms between pulses; px of travel before one fires
    stopTau: 0.008, stopLag: 0.025     // a release mid-thrum: 8 ms τ, oscillator dead at 25 ms
  };

  let ctx = null, bus = null, white = null, pink = null;
  let muted = readMuted(), voices = 0, lastTap = 0, lastBreath = 0, lastSnap = 0, lastGlide = 0;
  let glideVoice = null;            // the one thrum that may still be sounding, so it can be cut

  // ── BUFFERS — 2 s of white and 2 s of pink (three one-pole bands + a white floor).
  //    Pink is what reads as paper; white alone reads as tape hiss. Built once, at arm
  //    time, normalised, and shared by every voice that follows.
  function buildBuffers(){
    const n = Math.floor(ctx.sampleRate * 2);
    white = ctx.createBuffer(1, n, ctx.sampleRate);
    const w = white.getChannelData(0);
    for (let i = 0; i < n; i++) w[i] = Math.random() * 2 - 1;

    pink = ctx.createBuffer(1, n, ctx.sampleRate);
    const p = pink.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, peak = 0.0001;
    for (let i = 0; i < n; i++){
      const s = w[i];
      b0 = 0.99765 * b0 + s * 0.0990460;
      b1 = 0.96300 * b1 + s * 0.2965164;
      b2 = 0.57000 * b2 + s * 1.0526913;
      p[i] = b0 + b1 + b2 + s * 0.1848;
      if (Math.abs(p[i]) > peak) peak = Math.abs(p[i]);
    }
    for (let i = 0; i < n; i++) p[i] /= peak;        // normalise: levels are set by the envelope
  }

  // ── ARM — first real gesture only. Safari additionally needs one buffer played from
  //    inside that gesture before the context will output anything at all.
  function arm(){
    if (ctx) { if (ctx.state === 'suspended') { ctx.resume(); voices = 0; glideVoice = null; } return; }
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch(e) { btn.hidden = true; ctx = null; return; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 4;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    bus = ctx.createGain();
    bus.gain.value = muted ? 0 : 0.9;
    bus.connect(comp); comp.connect(ctx.destination);
    buildBuffers();
    const unlock = ctx.createBufferSource();
    unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    unlock.connect(ctx.destination); unlock.start(0);
    if (ctx.state === 'suspended') ctx.resume();
  }

  // voices release from BOTH the terminal node's onended and a timer, so a context that
  // never resumes cannot leave the counter parked at the ceiling.
  function releaseOnce(){
    let done = false;
    return () => { if (done) return; done = true; voices = Math.max(0, voices - 1); };
  }
  const cut = (...nodes) => () => { for (const n of nodes) { try { n.disconnect(); } catch(e) {} } };
  const live = () => !!(ctx && !muted && ctx.state === 'running');
  // A voice is decoration: if scheduling ever throws (an exotic build, a revoked graph),
  // the press it was decorating must still go through. Resetting the counter also keeps
  // one bad voice from slowly silting up the four-voice ceiling.
  const guard = fn => a => { try { fn(a); } catch(e) { voices = 0; } };

  // ── ENVELOPE — one shape for both voices: open on the floor, rise to the peak, then
  //    walk back down through [level, offset] stages. Exponential throughout, because a
  //    linear fade on noise reads as a tape stop. The floor is a starting value, never a
  //    ramp: exponentialRampToValueAtTime from 0 is a no-op in Chrome and throws elsewhere.
  function env(param, at, stages){
    param.setValueAtTime(FLOOR, at);
    for (const [level, offset] of stages) param.exponentialRampToValueAtTime(Math.max(level, FLOOR), at + offset);
  }

  // ── VOICE 1: the micro-tap. Mass arriving (a sine that falls 450 → 120 Hz in 12 ms)
  //    against a strike (10 ms of noise, low-passed at 1800 Hz). The sine carries the
  //    weight and the burst carries the contact; the low-pass is what stops the burst
  //    reading as a clipped sample of static, which is exactly what a band-pass at
  //   3200 Hz was doing. 1800, not 2500: the contact needs its body and does not need
  //    its tick, and everything above ~2 kHz is the register a laptop speaker renders
  //    as glare — which is why this reads as a knuckle on a desk, not a UI beep. Two
  //    branches, summed at the bus.
  function tap(kind){
    if (!live()) return;
    const t = performance.now();
    if (t - lastTap < 40 || voices >= 4) return;       // one press, one tap — never a rattle
    lastTap = t; voices++;
    const soft = kind === 'soft';
    const at = ctx.currentTime + TAP.off;
    const end = at + Math.max(TAP.body, TAP.strike) + TAP.tail;   // both sources stop here

    const osc = ctx.createOscillator(); osc.type = 'sine';
    const hz = TAP.hz0 * (0.97 + Math.random() * 0.06);   // ±3%: no two taps are identical
    osc.frequency.setValueAtTime(hz, at);
    osc.frequency.exponentialRampToValueAtTime(TAP.hz1, at + TAP.body);
    const og = ctx.createGain();
    env(og.gain, at, [[soft ? TAP.softBody : TAP.bodyPk, TAP.bodyAtk], [FLOOR, TAP.body]]);
    osc.connect(og); og.connect(bus);
    osc.start(at); osc.stop(end);

    const nsrc = ctx.createBufferSource(); nsrc.buffer = white;
    nsrc.playbackRate.value = 0.9 + Math.random() * 0.25;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = TAP.lp; lp.Q.value = TAP.lpQ;
    const ng = ctx.createGain();
    env(ng.gain, at, [[soft ? TAP.softStrike : TAP.strikePk, TAP.strikeAtk], [FLOOR, TAP.strike]]);
    nsrc.connect(lp); lp.connect(ng); ng.connect(bus);
    nsrc.start(at, Math.random() * 0.4); nsrc.stop(end);

    const release = releaseOnce();
    const kill = cut(osc, og, nsrc, lp, ng);
    osc.onended = () => { kill(); release(); };
    setTimeout(() => { kill(); release(); }, 400);   // a context that never resumes leaks nothing
  }

  // ── VOICE 2: the paper. Pink noise through one fixed band at 1200 Hz (cardstock has a
  //    centre; air does not — which is why this is no longer swept), a low-pass to keep
  //    it acoustic, a slow grip-flutter on the amplitude, and a narrow pan because the
  //    sheet is over there, not inside your head. The length is the page: the 40 ms
  //    attack and the 350 ms release are shared, and the hold between them absorbs the
  //    difference — so a 0.390 s link and a 0.150 s page turn breathe identically at
  //    different lengths. The hold is derived, never hand-tuned, so the release cannot
  //    drift away from the spec for any duration.
  //
  //    It used to carry the modal, the wall and the slider too, at 1.25 / 0.95 / 0.75 /
  //    0.110 s. Those were three different objects wearing one material: a folio is not
  //    a sheet, and a slider is not paper at all. They have their own voices now (SNAP,
  //    GLIDE), and this one is only what it says it is. Its remaining shapes stay
  //    derived from the shared pair, so no duration can drift away from the spec.
  function breath(kind){
    if (!live()) return;
    const t = performance.now();
    if (t - lastBreath < (BREATH.gate[kind] || 220) || voices >= 4) return;
    lastBreath = t; voices++;
    const dur = BREATH.dur[kind] || BREATH.dur.micro;
    const band = BREATH.band[kind] || BREATH.band.paper;
    const shape = BREATH.shape[kind] || BREATH;        // atk/rel fall back to the shared pair
    const peak = BREATH.level[kind] || BREATH.level.micro;
    const at = ctx.currentTime + 0.01;
    const hold = Math.max(0, dur - shape.atk - shape.rel);   // 0 for the link: a literal AD

    const src = ctx.createBufferSource(); src.buffer = pink; src.loop = true;
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = band.hz; bp.Q.value = band.q;    // fixed: no automation at all
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = band.lp; lp.Q.value = band.lpQ;
    const g = ctx.createGain();
    const stages = [[peak, shape.atk]];
    if (hold > 0) stages.push([peak * BREATH.decay, shape.atk + hold]);
    stages.push([FLOOR, dur]);                                 // and this one is exactly rel wide
    env(g.gain, at, stages);
    // Every remaining paper voice flutters. The friction that used to skip it is now the
    // glass thrum, a pure sine with no LFO at all, so nothing in a drag can tick.
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = BREATH.flutter[0] + Math.random() * (BREATH.flutter[1] - BREATH.flutter[0]);
    const depth = ctx.createGain(); depth.gain.value = peak * BREATH.depthRatio;
    lfo.connect(depth); depth.connect(g.gain);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(bp); bp.connect(lp);
    if (pan) { pan.pan.value = band.pan === 0 ? 0 : Math.random() * 2 * band.pan - band.pan; lp.connect(pan); pan.connect(g); }
    else { lp.connect(g); }
    g.connect(bus);

    lfo.start(at); lfo.stop(at + dur);
    src.start(at, Math.random()); src.stop(at + dur);
    const release = releaseOnce();
    const kill = cut(src, bp, lp, g, lfo, depth, pan);
    src.onended = () => { kill(); release(); };
    setTimeout(() => { kill(); release(); }, (dur + 0.4) * 1000);   // the timer is the fallback
  }

  // ── VOICE 3: the folio snap. Two branches again, but neither is paper: a sine that
  //    falls 160 → 60 Hz in 25 ms (the mass of a bound folder settling) and 5 ms of
  //    white through a 1200 Hz low-pass (the magnet seating). No band-pass anywhere, so
  //    nothing rings; no LFO, so nothing flutters; and both sources stop 4 ms past a
  //    floor the envelope has already reached, so the stop cannot truncate a cycle. All
  //    three hinged gestures — the leaflet opening, the leaflet closing, the wall either
  //    way — play this same voice at the same weight, on purpose: a folio closes the
  //    same way wherever it is.
  function snap(){
    if (!live()) return;
    const t = performance.now();
    if (t - lastSnap < SNAP.gate || voices >= 4) return;   // one gesture, one snap
    lastSnap = t; voices++;
    const at = ctx.currentTime + SNAP.off;
    const end = at + SNAP.body + SNAP.tail;               // both sources stop here

    const osc = ctx.createOscillator(); osc.type = 'sine';
    const hz = SNAP.hz0 * (0.97 + Math.random() * 0.06);  // ±3%: no two folds identical
    osc.frequency.setValueAtTime(hz, at);
    osc.frequency.exponentialRampToValueAtTime(SNAP.hz1, at + SNAP.body);
    const og = ctx.createGain();
    env(og.gain, at, [[SNAP.bodyPk, SNAP.bodyAtk], [FLOOR, SNAP.body]]);
    osc.connect(og); og.connect(bus);
    osc.start(at); osc.stop(end);

    const nsrc = ctx.createBufferSource(); nsrc.buffer = white;
    nsrc.playbackRate.value = 0.95 + Math.random() * 0.1;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = SNAP.lp; lp.Q.value = SNAP.lpQ;
    const ng = ctx.createGain();
    env(ng.gain, at, [[SNAP.strikePk, SNAP.strikeAtk], [FLOOR, SNAP.strike]]);
    nsrc.connect(lp); lp.connect(ng); ng.connect(bus);
    nsrc.start(at, Math.random() * 0.4); nsrc.stop(at + SNAP.strike + SNAP.tail);

    const release = releaseOnce();
    const kill = cut(osc, og, nsrc, lp, ng);
    osc.onended = () => { kill(); release(); };
    setTimeout(() => { kill(); release(); }, 400);   // a context that never resumes leaks nothing
  }

  // ── VOICE 4: the glass glide. One sine at one pitch, enveloped in 10 ms and out in
  //    55 ms, scheduled once per 70 ms of travel. There is no frequency automation and
  //    no noise source: a drag cannot hiss, cannot tick, and cannot swell into a tone.
  //    The pointer is the rhythm — a still pointer is silence, because the last pulse
  //    is over 65 ms after the movement that scheduled it.
  function glide(){
    if (!live()) return;
    const t = performance.now();
    if (t - lastGlide < GLIDE.gate || voices >= 4) return;  // one pulse per quantum of travel
    lastGlide = t; voices++;
    const at = ctx.currentTime + 0.005;
    const end = at + GLIDE.atk + GLIDE.rel;

    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.value = GLIDE.hz;                        // one pitch, never automated
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = GLIDE.lp; lp.Q.value = GLIDE.lpQ;
    const g = ctx.createGain();
    env(g.gain, at, [[GLIDE.peak, GLIDE.atk], [FLOOR, GLIDE.atk + GLIDE.rel]]);
    osc.connect(lp); lp.connect(g); g.connect(bus);
    osc.start(at); osc.stop(end);

    const release = releaseOnce();
    const kill = cut(osc, lp, g);
    const mine = { g, osc, stopped: false };
    glideVoice = mine;
    const clear = () => { if (glideVoice === mine) glideVoice = null; };
    osc.onended = () => { kill(); release(); clear(); };
    setTimeout(() => { kill(); release(); clear(); }, 400);   // the timer is the fallback
  }

  // ── STOP THE GLIDE — a drag that stops moving must stop sounding, now. The pulse would
  //    fade out on its own in 65 ms; this makes the fade 8 ms and kills the oscillator
  //    inside 25 ms, so a pointer that halts, lifts, loses focus or is muted is followed
  //    by silence rather than by the tail of its last pulse. The gain is held at its
  //    computed value before the ramp is cancelled — cancelling a running exponential
  //    otherwise snaps the parameter back to where the ramp started, which is a click —
  //    and the oscillator is stopped while the gain is already on the floor, which is
  //    the only click-free place to stop it.
  function stopGlide(){
    const v = glideVoice;
    if (!v || v.stopped) return;
    v.stopped = true;
    glideVoice = null;
    if (!ctx) return;
    const now = ctx.currentTime;
    const held = v.g.gain.value;              // read before the cancel: this is the truth
    try {
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setValueAtTime(Math.max(held, FLOOR), now);
      v.g.gain.setTargetAtTime(FLOOR, now, GLIDE.stopTau);
      v.osc.stop(now + GLIDE.stopLag);
    } catch(e) { /* an already-dead node: there is nothing left to silence */ }
  }

  // ── MUTE — one source of truth behind three mirrors: the attribute, the root dataset
  //    (that the stylesheet and the harness read) and the bus gain. setTargetAtTime
  //    rather than a ramp to zero, so closing the bus cannot thump.
  function applyMute(){
    document.documentElement.dataset.sound = muted ? 'off' : 'on';
    btn.setAttribute('aria-pressed', muted ? 'false' : 'true');
    // A mute is a stop, not a fade: a thrum already in flight is the one voice whose
    // oscillator outlives the bus write, so it is cut here as well as closed by the bus.
    if (muted) stopGlide();
    // Closing is slower than opening on purpose: the switch's own confirm tap is 21 ms
    // long, and a 15 ms fade would cut its tail off — the one tap the listener is
    // actively judging. 35 ms is still far below a thump.
    if (bus) bus.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, muted ? 0.035 : 0.015);
  }

  // ── WHAT MAKES WHICH NOISE — one table, and every entry is an action that actually
  //    happened. Hover, focus and scroll are silent: unprompted sound is the thing
  //    people file as a bug, and a page that talks while you read is not a page.
  //    Order matters: the specific handlers come before the generic anchor/button rule,
  //    and the wall comes before everything because its frame buttons live inside it.
  function pick(node){
    if (!node || !node.closest) return null;
    if (node.closest('.sound-toggle')) return null;        // the toggle confirms itself
    if (node.closest('[disabled]')) return null;           // a dead control stays silent
    // the register speaks for itself. js/ledger.js fires one snap when a row has actually
    // landed, so a press that fails is silent and a press that succeeds is not a tap plus a
    // snap. A form is not a control and must not borrow the control voice.
    if (node.closest('#artLedger')) return null;
    // the museum wall snaps — opening it (either door), closing it, stepping out of it.
    // Selecting on aria-controls rather than ids means a third door cannot quietly
    // become a tap. A frame inside the open wall only pins a placard, so it taps below:
    // the folio is already open, and a second snap for one gesture would be a lie.
    if (node.closest('#artClose,#artReturn,[aria-controls="artOverlay"]')) return ['snap'];
    // Inside the leaflet the sheet has already been turned: these move a page, they do
    // not move paper, so they get a 0.150 s flap. #lfBtnClosed is the inner Close panels
    // control, not the sheet closing — that is #lfModalClose on the next line.
    if (node.closest('#lfFlapL,#lfFlapR,#lfBtnTurnOver,#lfBtnClosed')) return ['breath', 'micro'];
    if (node.closest('#lfModalClose')) return ['snap'];   // the folio closes at the same weight
    if (node.closest('[aria-controls="lfModal"]')) return ['snap'];     // thumb + open button
    if (node.closest('.mag-link')) return ['breath', 'short'];   // 0.390 s: attack + release
    if (node.closest('.art-frame')) return ['tap', 'soft'];      // a pin, not an opening
    // The comparison slider is not a button and not paper: it glides on the press and
    // again while it is dragged, and it never taps. A grab that clicked would be a lie
    // about a drag.
    if (node.closest('#comparison')) return ['glide'];
    const act = node.closest('a[href],button,[role="button"]');
    if (!act) return null;
    const nav = act.closest('.nav-links');
    return ['tap', nav ? 'soft' : 'ui'];
  }
  // One table, so the routing name and the function name cannot drift apart, and an
  // unknown name is silent rather than an accidental tap.
  const VOICE = { tap, breath, snap, glide };
  function fire(hit){
    const fn = hit && VOICE[hit[0]];
    if (fn) guard(fn)(hit[1]);
  }
  // A MODULE THAT OWNS A MOMENT asks for its voice by name instead of reaching into this
  // closure. The ledger fires this once, after the row is in the table; the same table and
  // the same rate limiter apply as if the press had been a snap all along, and an unknown
  // name stays silent because VOICE has no entry for it.
  document.addEventListener('ad:voice', e => {
    const name = e && e.detail;
    if (VOICE[name]) fire([name]);
  });

  // ── FRICTION — the comparison slider drags, so it glides. The slider owns its own
  //    pointer state far above, in another closure; this only watches the same events,
  //    so the two cannot disagree and neither has to know the other exists. Three gates
  //    keep it honest: the pointer must be the one that went down, it must still be
  //    down (buttons !== 0, which also heals a release that happened off the window),
  //    and it must have travelled GLIDE.px horizontally — a vertical touch-scroll that
  //    starts on the slider is not a drag. The rate limiter lives in glide() itself
  //    (70 ms), so the two cannot disagree about the pulse rate either. Lifting,
  //    cancelling or losing focus cuts the pulse that is already sounding.
  let dragId = null, slideX = 0;
  const endDrag = () => { dragId = null; stopGlide(); };

  // pointerdown is the press itself (capture, so it lands before anything that might
  // navigate away). click with detail 0 is keyboard or assistive tech — which never
  // produces a pointerdown, and must not be the one silent path into the site.
  window.addEventListener('pointerdown', e => {
    if (!e.isPrimary || (e.button !== undefined && e.button !== 0)) return;
    arm();
    // record the drag before the voice: the press itself is already the first pulse
    if (e.target && e.target.closest && e.target.closest('#comparison')) { dragId = e.pointerId; slideX = e.clientX; }
    fire(pick(e.target));
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', e => {
    if (dragId === null || e.pointerId !== dragId) return;
    if (e.buttons === 0) { endDrag(); return; }              // released outside the window
    if (Math.abs(e.clientX - slideX) < GLIDE.px) return;     // a vertical scroll is not a drag
    slideX = e.clientX;
    guard(glide)();
  }, { passive: true });
  document.addEventListener('pointerup', endDrag, { passive: true });
  document.addEventListener('pointercancel', endDrag, { passive: true });
  window.addEventListener('blur', endDrag);
  document.addEventListener('click', e => { if (e.detail === 0) fire(pick(e.target)); });
  // arming needs a gesture, but only an activating key is a gesture worth spending a
  // context on — Tab and the scroll keys are not.
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') arm();
  }, { capture: true });

  btn.addEventListener('click', () => {
    // Unmuting arms first: the buffers must exist before the confirm tap is scheduled,
    // or the first press after a silent session is the one that pays for them.
    if (muted) { muted = false; writeMuted(false); arm(); applyMute(); guard(tap)('soft'); }
    else { guard(tap)('soft'); muted = true; writeMuted(true); applyMute(); }  // heard, then the bus closes
  });

  // localStorage is the third mirror and the only one another tab can write. Without
  // this, a second tab keeps playing after the first has been silenced — and the
  // preference in storage and the preference in the tab disagree until a reload.
  window.addEventListener('storage', e => {
    if (!e.key || e.key !== KEY) return;
    const next = readMuted();
    if (next === muted) return;
    muted = next;
    applyMute();
  });

  // A hidden tab should not keep an audio graph alive; the return path re-syncs so a
  // suspend can never strand the voice counter at the ceiling.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) setTimeout(() => { if (document.hidden && ctx.state === 'running') ctx.suspend(); }, 250);
    else if (ctx.state === 'suspended') { ctx.resume(); voices = 0; glideVoice = null; }
  });

  applyMute();   // sync the control with the stored preference before first paint
})();
