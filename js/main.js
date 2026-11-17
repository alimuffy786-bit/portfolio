// ═══════════════════════════════════════════════════
// SCROLL — a smoother above 768px, native scrolling everywhere else.
// Lenis (js/lenis.min.js, v1.3.25) owns the wheel only where it is alive, and refuses it over
// any [data-lenis-prevent] container. Below 768px, under prefers-reduced-motion, or if the file
// never arrives there is NO instance — so the page is the page it always was. Overlays still
// lock the body through syncScrollLock(); the smoother is stopped, never destroyed, while one
// is open.
// ═══════════════════════════════════════════════════
// LOCKING MUST NOT MOVE THE PAGE. `overflow:hidden` takes the scrollbar away, so the viewport
// gets ~15px wider and every fixed element — plus the whole centred column — jumps right for as
// long as an overlay is open. The width is measured AROUND the lock rather than assumed: on
// macOS overlay scrollbars, and on any platform that reserves the gutter itself, the two
// readings differ by 0 and nothing is padded. `--sbw` carries the same number to the fixed nav
// (and to the wall's own rail), which is outside the body box and cannot be padded with it.
const rootEl = document.documentElement;

// ═══════════════════════════════════════════════════
// MOTION — one answer, however many doors
// ═══════════════════════════════════════════════════
// The system's reduced-motion preference and the settings drawer's switch (§05b) are two doors
// onto the same question, and four modules need the answer: the smoother's gate, the magnet's
// amplitude, the comparison's detents and the leaflet's timelines. The stylesheet honours both
// on its own (§14 kills durations and names the scroll-driven timelines by hand), but CSS
// cannot cancel a GSAP tween, stop Lenis, or decide not to ease a mark — so they ask here
// instead of each re-deriving it. Re-read on every call: a media query can change mid-session
// and the drawer writes its attribute at runtime.
const calmMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
const calmMotion  = () => !!(calmMQ && calmMQ.matches);
const stillMotion = () => calmMotion() || rootEl.getAttribute('data-motion') === 'off';

// declared up here because syncScrollLock() below runs at parse time (pageshow/visibilitychange)
// and must be able to reach it; the controller that assigns it lives further down
let smoothLenis = null;
// ...and the tick that feeds it. A NAMED function, so it can be removed from GSAP's ticker by
// reference: an inline arrow could never be removed, and every Motion-off → Motion-on toggle would
// stack another callback onto the same clock.
let lenisRaf = 0;
function lenisTick(t){ if (smoothLenis) smoothLenis.raf(t * 1000); }
// §06 — the smoother's last velocity and when it was read, so the sheet's frame can prefer Lenis's
// own number (it knows the gesture) and fall back to a scroll delta when there is no instance.
// Declared here, above syncSmoothScroll(), because the callback attached there writes them.
let fxLenVel = 0, fxLenAt = 0;
// ...and the sheet's own frame state lives here for the same reason: syncSmoothScroll() can ask for
// a frame from a scroll callback long before the hero module below has been parsed, so nothing in
// that path may sit in the temporal dead zone of a `let` declared further down the file.
let fxItems = [], fxRaf = 0;
let fxHeroSkew = null, fxDust = null, fxRed = null, fxBlue = null, fxAsterisk = null, fxRatchet = 0;
let fxLastY = 0, fxVel = 0;
// §16d — THE SHEET'S LAST PROGRESS, IN PIXELS. Nothing scrolls inside the gate any more, so the
// frame's velocity cannot come from `scrollY` alone: it is the CHANGE IN `sheetPos()` that makes a
// commit lean the sheet. Declared here with the rest because syncSmoothScroll() can ask for a frame
// before the hero module is parsed.
let fxLastSheet = 0;
function syncScrollLock(){
  const lf = document.getElementById('lfModal'), art = document.getElementById('artOverlay');
  // the settings drawer is a modal <dialog>: it traps focus by itself, but nothing about
  // showModal() stops the page behind it from scrolling, so it asks for the same lock.
  const set = document.getElementById('setPanel');
  const anyOpen = !!(lf && lf.classList.contains('open'))
               || !!(art && art.classList.contains('open'))
               || !!(set && set.open);
  const body = document.body;
  const locked = body.dataset.scrollLock === '1';
  if (anyOpen === locked) return;              // tab return / bfcache restore: already in sync
  if (anyOpen){
    // STOPPED, never destroyed: the instance keeps the visitor's place, while a stopped Lenis
    // refuses the wheel (the page is covered anyway) and leaves the overlay's own scroll root —
    // which carries data-lenis-prevent — scrolling natively underneath it.
    if (smoothLenis) smoothLenis.stop();
    const before = window.innerWidth - rootEl.clientWidth;    // the scrollbar about to vanish
    body.dataset.scrollLock = '1';
    body.style.overflow = 'hidden';
    const sbw = Math.max(0, before - (window.innerWidth - rootEl.clientWidth));
    if (sbw){ body.style.paddingRight = sbw + 'px'; rootEl.style.setProperty('--sbw', sbw + 'px'); }
  } else {
    delete body.dataset.scrollLock;
    body.style.overflow = '';
    body.style.paddingRight = '';
    rootEl.style.removeProperty('--sbw');
    if (smoothLenis) smoothLenis.start();
  }
}
// defensive re-sync — bfcache restore / tab return can otherwise strand the lock
window.addEventListener('pageshow', syncScrollLock);
document.addEventListener('visibilitychange', syncScrollLock);

// ═══════════════════════════════════════════════════
// SMOOTH SCROLL — Lenis 1.3.25, desktop only, and only when motion is welcome
// ═══════════════════════════════════════════════════
// Three gates, every one re-read at runtime rather than cached at load: the build must be
// there (window.Lenis, from the vendored file above js/main.js), the viewport must be at least
// 768px, and the visitor must not have asked for reduced motion. Below the breakpoint the page
// keeps its native deck and its native gutter with NO instance in existence — not hidden, not
// paused, gone — so a phone cannot inherit a desktop behaviour by accident.
//
// The breakpoint is a live listener, not a load-time answer: a window dragged across 768 or a
// rotation DESTROYS the instance (Lenis.destroy() drops its listeners, its rAF and its lenis*
// classes) instead of leaving a smoother running behind a phone layout, where it would eat the
// swipe that turns the wall.
//
// What this deliberately does not touch: the CSS view() timelines. Lenis writes REAL scroll
// offsets (wrapper.scrollTo({behavior:'instant'}) every frame), so every view() timeline still
// measures the same scrollport it always did — STEP 8h re-measures the Eid reveal with the
// smoother running and finds the same progress its own geometry predicts. And `anchors` is left
// off on purpose: Lenis 1.3.25 does not preventDefault an in-page anchor, so the browser would
// jump while Lenis animated to the same target. With the option off, anchor navigation stays the
// browser's smooth jump (§02), and Lenis picks the new position up through its native-scroll sync.
const smoothMQ = window.matchMedia ? window.matchMedia('(min-width: 768px)') : null;
const calmScrollMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
function smoothWanted(){
  // stillMotion() folds the drawer's switch in beside the media query: a visitor who turned
  // motion off in settings gets the native deck as well, without a reload.
  return !!window.Lenis && (!smoothMQ || smoothMQ.matches) && !stillMotion();
}
function syncSmoothScroll(){
  const want = smoothWanted();
  if (want === !!smoothLenis) return;
  if (!want){
    if (window.gsap && window.gsap.ticker) window.gsap.ticker.remove(lenisTick);
    if (lenisRaf){ cancelAnimationFrame(lenisRaf); lenisRaf = 0; }
    smoothLenis.destroy();
    smoothLenis = null;
    return;
  }
  // THE SMOOTHER, RE-DERIVED (§07). `duration` + a cubic-bezier-ish easing replaces the old
  // lerp feel: 0.8s with a 3.4-power ease-out is a long, heavy settle that still answers the
  // wheel immediately, and `wheelMultiplier:0.88` takes a little distance out of every notch so
  // the sheet's velocity effects have room to read without the page running away from the reader.
  // `anchors:true` is Lenis's own in-page anchor handling — it reads the hash, keeps the fixed
  // head's height in mind and writes the same eased position, so main.js no longer has an anchor
  // click handler of its own (there never was one to keep).
  smoothLenis = new window.Lenis({
    autoRaf: false,
    duration: 0.8,
    easing: t => 1 - Math.pow(1 - t, 3.4),
    wheelMultiplier: 0.88,
    touchMultiplier: 1.2,
    smoothWheel: true,
    // NO `anchors`, DELIBERATELY — and §16 is why. Lenis's own anchor handler does not check
    // `defaultPrevented`, so with it on, a press on the board or a panel started a 1-second Lenis
    // glide toward the fragment AND the gate's own route, and the two arrived at different places.
    // The gate owns every in-page destination now (one delegated click, one flood, one scroll), so
    // the only anchor behaviour left is the browser's: `scroll-behavior:smooth` from §02, and a
    // real jump when Motion is off.
    anchors: false,
  });
  // ONE CLOCK FOR EVERYTHING THAT MOVES. GSAP's ticker drives Lenis, so the smoother, the sheet's
  // frame and every tween advance on the SAME timestamp — two independent loops would beat against
  // each other by a frame and the velocity the sheet reads would always be a frame stale.
  // lagSmoothing(0) is deliberate: GSAP's default clamps a long frame and then jumps the clock,
  // which would show up on this page as a kick in the smoother after a tab regains focus.
  if (window.gsap && window.gsap.ticker){
    window.gsap.ticker.add(lenisTick);
    window.gsap.ticker.lagSmoothing(0);
  } else {
    // NO GSAP, STILL SMOOTH: the same contract over a plain rAF, so a missing CDN degrades the
    // easing's source of time and nothing else.
    const step = t => { if (!smoothLenis) return; smoothLenis.raf(t); lenisRaf = requestAnimationFrame(step); };
    lenisRaf = requestAnimationFrame(step);
  }
  // §06 — THE SHEET READS THE SMOOTHER'S VELOCITY. One callback, attached where the instance is
  // built, so a rebuild (a breakpoint cross, or the drawer's Motion switch going back on) attaches
  // exactly once and a destroy takes it with the instance. `velocity` is px per frame in Lenis
  // 1.3.x; it is clamped and damped in drawFx(), so this only has to remember it.
  smoothLenis.on('scroll', e => {
    const v = (e && typeof e.velocity === 'number') ? e.velocity : 0;
    if (Math.abs(v) > 0.05){
      fxLenVel = v;
      fxLenAt = (window.performance && performance.now) ? performance.now() : Date.now();
    }
    scheduleFx();
  });
  // a lock that survived a bfcache restore must not be undone by the instance we just built
  if (document.body.dataset.scrollLock === '1') smoothLenis.stop();
}
syncSmoothScroll();
for (const mq of [smoothMQ, calmScrollMQ]){
  if (!mq) continue;
  if (mq.addEventListener) mq.addEventListener('change', syncSmoothScroll);
  else if (mq.addListener) mq.addListener(syncSmoothScroll);   // Safari < 14
}

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
  // the magnet's amplitude and the drawer's switch ask the same question (§ MOTION), so this
  // is an alias, not a second media query — turning motion off in settings drops the pull too.
  const calm = stillMotion;

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
  const CUR_SCALE = { link:1.6, nav:1.9, work:2.2, drag:2.1, peel:2.2, archive:2.4 };
  // `peel` is the sticker's word (§06): the plate is a vinyl die-cut, so the reticle says what the
  // hand is about to do rather than the generic `drag` the decks use.
  const CUR_WORD  = { work:'look', drag:'drag', peel:'peel', archive:'archive' };
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

  // THE CLICK FOLLOWS THE CROSSHAIR. `cursor:none` hides the system pointer, so the mark is the
  // only cursor a visitor can see — and the magnet pulls it up to RING px away from the pointer.
  // A click is still dispatched at the pointer, so aiming the mark at a 37.6 x 44.2 glyph and
  // pressing lands on <nav> at any approach inside ~60px: the asterisk "sometimes" does nothing.
  // This routes the press to what the mark is over, which is what the mark has been promising
  // since it snapped. `locked` is only ever an anchor that passed the visibility hit test in
  // tick(), so a control behind the open wall can never be activated this way; `detail === 0`
  // is keyboard (already aimed at the focused control) and re-enters this handler, so it stops
  // here and cannot loop.
  window.addEventListener('click', e => {
    if (e.detail === 0 || !tracking || !locked) return;                              // unarmed / keyboard
    if (!cur.classList.contains('cur-on') || cur.classList.contains('hidden')) return; // no ghost press
    const mark = document.elementFromPoint(cx, cy);      // what the visitor is aiming with
    if (!mark || !(locked.el === mark || locked.el.contains(mark))) return;
    const there = document.elementFromPoint(mx, my);     // what the pointer actually hit
    if (there && (locked.el === there || locked.el.contains(there))) return;         // it got there
    e.preventDefault();
    e.stopPropagation();                                 // the element under the pointer must not also fire
    locked.el.click();                                   // detail 0: one snap, no re-entry
  }, true);
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
// SOUND — THE WAVE (§05d)
// ═══════════════════════════════════════════════════
// Five bars, one shape per state. ON: each bar is tweened to a random height between .45 and 1 on
// its own duration (.32–.55s) and its own 60ms phase, yoyo'd forever — a signal, not a metronome.
// OFF: every tween is killed and the group settles to the hairline (.12) in .4s with a .035s
// stagger, which is what a waveform looks like when the sound stops. STILL: mid-height (.5), held —
// the same instrument with the motion taken out, which is also what the stylesheet paints when the
// script never runs (§05d's kill lists).
// THE STATE IS NOT OURS. `html[data-sound]` and the button's aria-pressed are written by the audio
// module (§ AUDIO, below); this only mirrors them, and it watches both attributes, so flipping the
// Motion switch mid-session stops or restarts the wave without a reload and without asking the
// audio module anything.
(function(){
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  const bars = Array.from(btn.querySelectorAll('.wv'));
  if (!bars.length || !window.gsap) return;
  const g = window.gsap;
  const HAIR = 0.12, HELD = 0.5;
  let tweens = [];
  const kill = () => { for (const t of tweens){ try { t.kill(); } catch(e){} } tweens = []; };
  function flat(){
    kill();
    g.to(bars, { scaleY: HAIR, duration: 0.4, ease: 'power3.out', stagger: 0.035, overwrite: 'auto' });
  }
  function held(){
    kill();
    g.to(bars, { scaleY: HELD, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
  }
  function wave(){
    kill();
    tweens = bars.map((b, i) => g.to(b, {
      scaleY: () => 0.45 + Math.random() * 0.55,
      duration: () => 0.32 + Math.random() * 0.23,
      ease: 'sine.inOut', repeat: -1, yoyo: true, delay: i * 0.06,
    }));
  }
  function sync(){
    if (stillMotion()){ held(); return; }
    // No audio module (no Web Audio in this browser) leaves data-sound unset — and the button is
    // hidden by that same module, so an absent attribute means "nothing to animate", not "on".
    if (rootEl.getAttribute('data-sound') === 'off' || btn.getAttribute('aria-pressed') !== 'true'){ flat(); return; }
    wave();
  }
  // THE FIRST PAINT WAITS ONE FRAME. The audio module is parsed LATER in this file and is what
  // writes `data-sound` from storage; starting the wave here would flash it for one frame on a
  // session that had been muted. One rAF is after every module has had its say.
  requestAnimationFrame(sync);
  new MutationObserver(sync).observe(rootEl, { attributes: true, attributeFilter: ['data-sound', 'data-motion'] });
})();

// ═══════════════════════════════════════════════════
// HERO — THE GOTHIC RISO BROADSHEET (§06)
// ═══════════════════════════════════════════════════
// Six things live here — the masthead's fit, its masked reveal, the two vinyl stickers (placement,
// drag, gloss), the riso plate's drift and shuffle, and the one rAF that carries the sheet's
// scroll motion (velocity skew, parallax, the gear) — and they all obey one rule: EVERY transform
// on a hero element is written through GSAP (set / quickSetter / Draggable), never as a raw
// style.transform. GSAP keeps a per-element transform cache, so parallax (y), velocity
// (skewY/scaleY), the drag (x/y/rotation) and the jitter (x/y/rotation) compose into one matrix
// instead of overwriting each other. Where two of them would collide on one node, the markup gives
// them two nodes: `.sticker-slot` carries the parallax, the `.sticker` inside it carries the hand.
function clampNum(v, lo, hi){ return v < lo ? lo : (v > hi ? hi : v); }

// THE MASTHEAD'S FIT — one size for both words, found by BISECTION. The blackletter has no italic
// and no light cut, so the two rows are the same face at the same size: fitting them independently
// (the old 0.62 factor on line 2) was compensating for a second, lighter typeface that no longer
// exists. The loop finds the LARGEST size at which the WIDER of the two words fits the block, which
// is what keeps the block one rectangle instead of a long word over a short one at an unrelated
// size.
// SEVEN PROBES, NOT A WALK. The 2px decrement this replaces measured a 300px display face, then
// 298, 296 … a hundred and fifty layout flushes to answer one question — and it ran three times on
// load (metrics, fonts.ready, debounce) plus once per resize. The answer is monotone in the size,
// so bisection gets within 2.2px of it in 7 probes; `best` keeps the last size that FITTED rather
// than the last one probed, so the result can never be 0.5px too wide.
function fitName(){
  const block = document.getElementById('nameBlock');
  const l1 = document.getElementById('line1');
  const l2 = document.getElementById('line2');
  if (!block || !l1 || !l2) return;
  const w = block.clientWidth;
  if (!w) return;                      // display:none / pre-layout: measure again when it isn't
  const lines = [l1, l2];
  // `scrollWidth`, not a rect: the group that contains each word is shrink-to-fit and is capped at
  // the block's width, so a rect would report "it fits" for a word that is overflowing it.
  const widest = () => Math.max(l1.scrollWidth, l2.scrollWidth);
  const setSize = s => { for (const l of lines) l.style.fontSize = s + 'px'; };
  for (const l of lines) l.style.whiteSpace = 'nowrap';
  let lo = 18, hi = 300, best = lo;
  setSize(hi);
  if (widest() <= w){
    best = hi;                         // the whole allowance fits: nothing to search for
  } else {
    setSize(lo);
    best = widest() <= w ? lo : 0;     // 18px is the floor; below it nothing is worth setting
    for (let i = 0; i < 7; i++){
      const mid = (lo + hi) / 2;
      setSize(mid);
      if (widest() <= w){ best = mid; lo = mid; } else { hi = mid; }
    }
  }
  if (best) setSize(Math.max(18, Math.floor(best)));
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
// THE MASKED LINE REVEAL — the one place GSAP is used on the hero. Each line is already a child
// of a .hero-line mask (clip-path, §06) sitting at translateY(110%); the tween only has to move
// it to 0. `yPercent` is a transform, so the reveal cannot reflow the sheet, and the stagger is
// the whole choreography: 0.15s between the two lines of a name.
// NO GSAP, OR NO MOTION, IS NOT A DEGRADED HERO — it is the same hero, revealed in one frame.
// The end state of the tween is `transform:none`, so the fallback writes exactly that, and the
// stylesheet says the same thing under [data-motion="off"] and prefers-reduced-motion.
function revealName(){
  const nb = document.getElementById('nameBlock');
  if (!nb) return;
  const lines = nb.querySelectorAll('.hero-line > .name-line');
  nb.style.opacity = '1';
  if (window.gsap && lines.length && !stillMotion()){
    // `y: 0` IS NOT REDUNDANT. The lines arrive with a CSS transform (translateY(110%)), and GSAP
    // caches that computed matrix as y = 110% in px. Animating yPercent alone would then leave
    // the cached y untouched and the line would finish exactly where it started — the one bug
    // that looks like "the reveal never ran". Zeroing y in BOTH vars makes the percentage the
    // only thing moving, and the end state is the true translate(0, 0).
    window.gsap.fromTo(lines, { yPercent: 110, y: 0 }, {
      yPercent: 0, y: 0, duration: 1.4, ease: 'expo.out', stagger: 0.15, overwrite: 'auto',
    });
  } else {
    for (const line of lines) line.style.transform = 'none';
  }
}
// ── THE STICKERS ────────────────────────────────────────────────────────────────────────────
// The plates are PLACED by CSS (percentages of the word, §06); JS only adds the hand:
//   alignStickers()  the SPAWN. There is no random jitter any more: a plate that lands a different
//                    few degrees from its word on every load is not a sticker, it is a bug that was
//                    promoted to a feature — and the pose it was jittering around already lives on
//                    `.sticker__plate` in CSS. What this does now is put the plate dead square on
//                    its word, and it is the only place that ever writes x/y/rotation when nothing
//                    is being held. Being idempotent is the point: it runs on fonts.ready, on
//                    resize and on every re-fit, and nothing may accumulate.
//   Draggable        x/y inside #hero with edge resistance, and a 2-BEAT SLAP-BACK on release: the
//                    plate stays exactly where the hand left it for two beats and then returns home
//                    in one short, decisive move. Not an elastic — a sticker is put back, not
//                    dropped.
//   the gloss        screen-blended bubbles that follow the pointer across the plate, plus the conic
//                    sheen's angle. It writes CSS VARIABLES (--bubble-x / --bubble-y / --sheen-a),
//                    not a transform: the plate's transform belongs to GSAP, and a second writer
//                    there would fight the drag.
//   the foley        peel on press, restick when it lands home, ratchet when the asterisk steps.
const heroEl = document.getElementById('hero');
const stickerBtns = heroEl ? Array.from(heroEl.querySelectorAll('.sticker')) : [];
const stickerDrags = [];
// ONE BEAT, in seconds, at the sheet's own walking pace (~130 bpm). The slap-back waits two of them,
// which is long enough that the plate visibly STAYS where it was dropped and short enough that
// nobody reaches for it again before it goes home.
const STICKER_BEAT = 0.46;
const stickerTimers = new WeakMap();     // one pending slap-back per plate, so a re-grab wins

function alignStickers(){
  if (!heroEl || !stickerBtns.length) return;
  // THE PLATE SPAWNS SQUARE. Every write here is to ZERO — no roll, no offset, nothing remembered
  // between runs — so this is idempotent and can be called as often as the metrics change
  // (fonts.ready, resize, the name re-fitting) without the pose drifting a pixel at a time. The
  // pose itself is `.sticker__plate`'s `rotate`/`translate` in CSS, which is a DIFFERENT NODE and
  // therefore cannot be overwritten by anything in this file.
  for (const btn of stickerBtns){
    if (!btn.offsetWidth) continue;
    if (window.gsap) window.gsap.set(btn, { x: 0, y: 0, rotation: 0 });
    else btn.style.transform = 'none';
  }
  // the drag's bounds were measured around the old offsets; let each instance re-read itself
  for (const d of stickerDrags){ try { if (d && d.update) d.update(); } catch (e) { /* older plugin */ } }
}

// ── THE SLAP-BACK. Two beats of nothing, then one move home; a press inside those two beats
//    cancels the pending return instead of fighting it. Under stillMotion() the plate goes back at
//    once with no easing and makes no sound, because "it returns" is layout and "when" is motion.
function slapBack(btn){
  const prev = stickerTimers.get(btn);
  if (prev) { clearTimeout(prev); stickerTimers.delete(btn); }
  if (!window.gsap){ btn.style.transform = 'none'; return; }
  if (stillMotion()){
    window.gsap.set(btn, { x: 0, y: 0, rotation: 0 });
    return;
  }
  const id = setTimeout(() => {
    stickerTimers.delete(btn);
    window.gsap.to(btn, { x: 0, y: 0, rotation: 0, duration: 0.34, ease: 'back.in(1.7)',
      overwrite: 'auto',
      // the film meeting the paper again — the OTHER half of the peel, and the reason the two
      // voices are a pair rather than one sound used twice.
      onComplete(){ document.dispatchEvent(new CustomEvent('ad:voice', { detail: 'restick' })); } });
  }, STICKER_BEAT * 2 * 1000);
  stickerTimers.set(btn, id);
}

function initStickers(){
  if (!heroEl) return;
  for (const btn of stickerBtns){
    const gloss = btn.querySelector('.sticker__gloss');
    if (gloss){
      const setBubble = (x, y) => {
        gloss.style.setProperty('--bubble-x', x.toFixed(1) + 'px');
        gloss.style.setProperty('--bubble-y', y.toFixed(1) + 'px');
        // the conic sheen turns WITH the pointer's bearing: atan2 of the offset is an angle, and a
        // laminate's streak sits perpendicular to the viewing direction — hence the +90.
        const a = Math.atan2(y, x) * 180 / Math.PI;
        gloss.style.setProperty('--sheen-a', (a + 90).toFixed(1) + 'deg');
      };
      btn.addEventListener('pointermove', e => {
        if (stillMotion() || (e.pointerType && e.pointerType !== 'mouse')) return;
        const r = btn.getBoundingClientRect();
        setBubble((e.clientX - (r.left + r.width / 2)) * 0.35,
                  (e.clientY - (r.top + r.height / 2)) * 0.35);
      }, { passive: true });
      btn.addEventListener('pointerleave', () => setBubble(0, 0), { passive: true });
    }
    if (!window.Draggable || !window.gsap) continue;
    // No Draggable (a missing vendored file), or no GSAP: the stickers stay where they are. That is
    // the whole fallback — a still print is not a broken one.
    const d = window.Draggable.create(btn, {
      type: 'x,y', bounds: heroEl, edgeResistance: 0.85, dragResistance: 0.06,
      onPress(){
        // a re-grab cancels a pending return before it can move the plate under the hand
        const prev = stickerTimers.get(btn);
        if (prev) { clearTimeout(prev); stickerTimers.delete(btn); }
        window.gsap.to(btn, { scale: 1.1, duration: 0.22, ease: 'power2.out', overwrite: 'auto' });
        // the hand taking the plate off the paper
        document.dispatchEvent(new CustomEvent('ad:voice', { detail: 'peel' }));
      },
      onDragStart(){ btn.classList.add('dragging'); },
      onRelease(){
        btn.classList.remove('dragging');
        const still = stillMotion();
        window.gsap.to(btn, { scale: 1, duration: still ? 0 : 0.9,
          ease: still ? 'none' : 'elastic.out(1,0.42)', overwrite: 'auto' });
        slapBack(btn);
      },
    });
    if (d && d[0]) stickerDrags.push(d[0]);
  }
}

// ── THE PLATE: THREE INKS ON ONE SHEET ──────────────────────────────────────────────────────
// The three passes are ONE file and one fetch; what changes between them is the ink (the CSS
// filters) and their REGISTRATION. The pointer pulls the colour drums apart by a few pixels — the
// key never moves, because it is the plate everything else registers against — and a click (or
// Enter/Space: the plate is a button) SHUFFLES the stack: the top drum slides off to the right and
// returns from the left UNDERNEATH, which is what a printer does when they re-run a colour.
// THE SHADOW IS NOT A DRUM. The plate is four layers, and the first of them is the cut-out
// silhouette that makes the print an object on the page. It must stay at the BOTTOM of the stack
// and it must not drift, so the depths are named by CLASS rather than by position, and the shuffle
// rotates the drums only — moving the last layer (which is the key) under the shadow would print a
// blurred black over the drawing that the key exists to describe.
const risoEl = document.getElementById('risoPortrait');
let risoLayers = risoEl ? Array.from(risoEl.querySelectorAll('.rp-layer')) : [];
const RISO_DEPTH = { 'rp-shadow': 0, 'rp-red': 9, 'rp-blue': -7, 'rp-key': 0 };
const risoDrums = () => risoLayers.filter(l => !l.classList.contains('rp-shadow'));
let risoShuffling = false;

function shuffleRiso(){
  if (!risoEl || risoShuffling || risoLayers.length < 2) return;
  const drums = risoDrums();
  const top = drums[drums.length - 1];
  if (!top) return;
  const shadow = risoEl.querySelector('.rp-shadow');
  // paint order IS DOM order, so the drum that was on top goes to the FRONT of the inked stack —
  // first after the silhouette, which never moves. The array is re-read from the DOM, so every
  // drum keeps the drift depth its own class names.
  const rotate = () => {
    risoEl.insertBefore(top, shadow ? shadow.nextElementSibling : risoEl.firstElementChild);
    risoLayers = Array.from(risoEl.querySelectorAll('.rp-layer'));
  };
  risoShuffling = true;
  if (!window.gsap || stillMotion()){ rotate(); risoShuffling = false; return; }
  const px = Math.max(120, (risoEl.offsetWidth || 400) * 0.6);
  window.gsap.timeline({ onComplete(){ risoShuffling = false; } })
    .to(top, { x: px, y: -10, opacity: 0, duration: 0.36, ease: 'power2.in' })
    .add(rotate)
    .fromTo(top, { x: -px, y: 10 }, { x: 0, y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' });
}

function initRiso(){
  if (!risoEl || !risoLayers.length) return;
  risoEl.addEventListener('click', shuffleRiso);
  risoEl.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar'){ e.preventDefault(); shuffleRiso(); }
  });
  if (!window.gsap || !hasFinePointer()) return;
  // The drift: one rAF that STOPS when it has caught up (no permanent frame loop on a still
  // sheet), and it never reads a rect inside the loop.
  let raf = 0, dx = 0, dy = 0, wx = 0, wy = 0;
  const draw = () => {
    dx += (wx - dx) * 0.12;
    dy += (wy - dy) * 0.12;
    const done = Math.abs(wx - dx) < 0.01 && Math.abs(wy - dy) < 0.01;
    if (!risoShuffling && !stillMotion()){
      for (let i = 0; i < risoLayers.length; i++){
        const d = RISO_DEPTH[risoLayers[i].classList.contains('rp-shadow') ? 'rp-shadow' :
          (risoLayers[i].classList.contains('rp-red') ? 'rp-red' :
          (risoLayers[i].classList.contains('rp-blue') ? 'rp-blue' : 'rp-key'))] || 0;
        if (d) window.gsap.set(risoLayers[i], { x: dx * d, y: dy * d });
      }
    }
    raf = done ? 0 : requestAnimationFrame(draw);
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(draw); };
  risoEl.addEventListener('pointermove', e => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const r = risoEl.getBoundingClientRect();
    wx = clampNum((e.clientX - (r.left + r.width / 2)) / Math.max(200, r.width / 2), -1, 1);
    wy = clampNum((e.clientY - (r.top + r.height / 2)) / Math.max(200, r.height / 2), -1, 1);
    wake();
  }, { passive: true });
  risoEl.addEventListener('pointerleave', () => { wx = 0; wy = 0; wake(); }, { passive: true });
  // Motion off: every drum goes back to register, once, off the same attribute the stylesheet reads.
  new MutationObserver(() => {
    if (!stillMotion()) return;
    wx = 0; wy = 0; dx = 0; dy = 0;
    for (const l of risoLayers) window.gsap.set(l, { x: 0, y: 0 });
  }).observe(rootEl, { attributes: true, attributeFilter: ['data-motion'] });
}

// ── ONE FRAME FOR THE SHEET (§06, §07) ──────────────────────────────────────────────────────
// Everything below is derived once per frame from ONE velocity reading and ONE scroll position:
//   velocity  the smoother's own px-per-frame number, or the frame-to-frame scroll delta when
//             there is no instance (below 768, under reduced motion, or if Lenis never loaded).
//             Clamped to ±60 and damped at 0.18, so a wheel flick leans the sheet and then lets go.
//   skew      #hero skewY, clamp(-0.8, 0.8, v × 0.05) through quickTo .5s power3.out. ONE writer
//             for the whole sheet: the masthead, the plate and the stickers are inside #hero, so
//             they lean together — the four per-node [data-skew] writers this replaces were four
//             transforms doing one job, and each of them had to be excluded from every other
//             module's transform.
//   dust      .hero-paper opacity .34 + clamp(0, .18, |v| × .012), quickTo .4s — the stock
//             thickens as the page moves, which is what paper dust does when the sheet is handled.
//   ink       .rp-red x clamp(-22, 22, v × 1.4) and .rp-blue the inverse × 0.8, quickTo .6s: the
//             two drums slide against each other on a fast scroll, so the misregistration breathes
//             instead of being a fixed 9px offset nobody notices.
//   ratchet   the asterisk indexes 15° at a time with scroll — round(scroll × .12 / 15) × 15 —
//             with a .18s back.out(2) turn and 1px of y-settle per step, so it reads as a
//             mechanism instead of a dial being dragged.
//   parallax  each [data-parallax-speed] node translated -(y × (speed − 1)) and ROUNDED to whole
//             pixels: a half-pixel translate makes the rasteriser resample the paper grain, and a
//             moving grain reads as video noise rather than as print.
// Nothing here can lay the page out: every write is a transform or an opacity.

function collectFx(){
  if (!heroEl || !window.gsap) return;
  const g = window.gsap;
  const q = sel => Array.from(heroEl.querySelectorAll(sel));
  fxItems = q('[data-parallax-speed]').map(el => ({
    el: el, speed: parseFloat(el.getAttribute('data-parallax-speed')) || 1,
    setY: g.quickSetter(el, 'y', 'px'),
  }));
  const paper = heroEl.querySelector('.hero-paper');
  const red   = heroEl.querySelector('.rp-red');
  const blue  = heroEl.querySelector('.rp-blue');
  fxHeroSkew = g.quickTo(heroEl, 'skewY', { duration: 0.5, ease: 'power3.out' });
  fxDust     = paper ? g.quickTo(paper, 'opacity', { duration: 0.4, ease: 'power2.out' }) : null;
  fxRed      = red ? g.quickTo(red, 'x', { duration: 0.6, ease: 'power3.out' }) : null;
  fxBlue     = blue ? g.quickTo(blue, 'x', { duration: 0.6, ease: 'power3.out' }) : null;
  fxAsterisk = heroEl.querySelector('.hero-gear-asterisk');
  // THE CACHE IS THE MARK'S OWN ANGLE, NOT ZERO (§16d). `collectFx` runs after every route and every
  // commit, and a flight may have left the asterisk mid-detent: caching 0 would then tell the next
  // frame that the mark is already home, and it would never be walked back. Reading what the element
  // actually shows keeps the comparison in drawFx honest.
  fxRatchet = fxAsterisk ? Math.round((+g.getProperty(fxAsterisk, 'rotation') || 0) / 15) * 15 : 0;
  fxLastY = Math.max(0, window.scrollY);   // start from where the page actually is, not from 0
  fxLastSheet = sheetPos(heroEl.offsetHeight || 1);   // …and from the sheet's own progress
}

// §16d — HOW FAR DOWN THE SHEET THE READER IS, IN PIXELS. While the gate was 250vh this was simply
// `scrollY`; now the gate is ONE screen, so `scrollY` is 0 in both of its states and the distance
// the sheet's depths are calibrated in has to come from the gate's own published progress instead.
// `window.__adGateP` is 0 → 1 through the fold (−1 in a view, where the sheet is not rendered) and
// the full budget is the sheet's own height — exactly the travel the old scrub covered. One
// function, read by the parallax, the ratchet and anything that probes the sheet, so the frame and
// the harness can never disagree about where the sheet is standing.
function sheetPos(heroH){
  const p = (typeof window.__adGateP === 'number') ? window.__adGateP : 0;
  const q = p < 0 ? 0 : (p > 1 ? 1 : p);
  return heroH ? q * heroH : q;
}

function drawFx(){
  fxRaf = 0;
  if (!window.gsap || !heroEl) return;
  const y = Math.max(0, window.scrollY);
  const g = window.gsap;
  if (stillMotion()){
    // STILL IS A STATE, NOT A MISSING FRAME. Every value is written back to its rest reading, once,
    // on the frame that notices: the sheet is square, the stock is its stock, the drums are in
    // register and the asterisk is at 0°. The stylesheet's kill lists say the same thing by name
    // for the visitor whose script never ran.
    fxVel = 0;
    for (const it of fxItems) it.setY(0);
    if (fxHeroSkew) fxHeroSkew(0);
    if (fxDust) fxDust(0.34);
    if (fxRed) fxRed(0);
    if (fxBlue) fxBlue(0);
    if (fxAsterisk){ g.set(fxAsterisk, { rotation: 0, y: 0 }); fxRatchet = 0; }
    fxLastY = y;
    return;
  }
  const now = (window.performance && performance.now) ? performance.now() : Date.now();
  const fresh = (now - fxLenAt) < 140;
  // THE SHEET'S OWN TRAVEL IS A VELOCITY TOO (§16d). In the gate nothing scrolls, so `y - fxLastY`
  // is 0 through the whole 0.85s a commit takes and the sheet would cross the fold dead straight.
  // The progress in the same pixels `sheetPos()` reports is added to the scroll delta instead, so a
  // commit leans and drifts exactly as a scroll of that distance would have — and a view, where the
  // published number is a frozen -1, adds nothing at all.
  const sheet = sheetPos(heroEl.offsetHeight || 1);
  const travel = sheet - fxLastSheet;
  fxLastSheet = sheet;
  const delta = (y - fxLastY) + travel;
  fxLastY = y;
  const raw = (fresh && Math.abs(fxLenVel) > 0.05) ? fxLenVel : delta;
  fxVel += (clampNum(raw, -60, 60) - fxVel) * 0.18;
  const heroH = heroEl.offsetHeight || 1;
  // THE GATE IS ONE SCREEN (§16d), so a scroll offset is no longer "how far down the sheet the
  // reader is": `window.scrollY` is 0 in both the cover and the index. `sheetPos(heroH)` turns the
  // gate's published progress into the same PIXEL budget the depths were always calibrated in
  // (60px of stock lag at speed 0.8, 150px ahead at 1.5), so `capped` keeps its old meaning and the
  // sheet still stops moving once its parallax budget is spent.
  const capped = sheetPos(heroH);
  for (const it of fxItems) it.setY(Math.round(-(capped * (it.speed - 1))));
  if (fxHeroSkew) fxHeroSkew(clampNum(fxVel * 0.05, -0.8, 0.8));
  if (fxDust) fxDust(0.34 + clampNum(Math.abs(fxVel) * 0.012, 0, 0.18));
  const drift = clampNum(fxVel * 1.4, -22, 22);
  if (fxRed)  fxRed(Math.round(drift));
  if (fxBlue) fxBlue(Math.round(-drift * 0.8));
  if (fxAsterisk){
    const step = Math.round(capped * 0.12 / 15) * 15;
    if (step !== fxRatchet){
      fxRatchet = step;
      g.to(fxAsterisk, { rotation: step, y: step / 15, duration: 0.18, ease: 'back.out(2)', overwrite: 'auto' });
      // THE MARK IS A MECHANISM, SO IT SOUNDS LIKE ONE. The tick belongs to the STEP and not to the
      // scroll: it fires when the quantised angle actually changes, which is why a fast flick hears a
      // short run of ticks at exactly the rate the mark indexes and a slow drag hears one at a time.
      // The audio module owns every gate (mute, reduced motion, rate limit, the four-voice ceiling),
      // so nothing here has to know whether sound is even on.
      document.dispatchEvent(new CustomEvent('ad:voice', { detail: 'ratchet' }));
    }
  }
  // KEEP THE LOOP ALIVE UNTIL THE VELOCITY HAS ACTUALLY DECAYED. Without this line the last flick's
  // lean would be the state the sheet keeps until the next scroll event, and the ratchet would stop
  // mid-index — the decay above is what returns every value to rest within ~500ms of the last wheel.
  if (Math.abs(fxVel) > 0.05) fxRaf = requestAnimationFrame(drawFx);
}

function scheduleFx(){ if (!fxRaf) fxRaf = requestAnimationFrame(drawFx); }
if (heroEl) window.addEventListener('scroll', scheduleFx, { passive: true });

// Init on DOMContentLoaded, not window 'load': 'load' waits on every image, and the two sticker
// plates alone are 2.3 MB — that held the name at opacity 0 for seconds on mobile. Sizing runs
// twice: instantly on the metrics that are live, then again once the blackletter has landed (the
// fit is a 2px walk, so a different face is a different answer) — and the stickers are placed after
// the words have a size, because their percentages are percentages OF those words.
let heroInited = false;
function initHero(){
  const nb = document.getElementById('nameBlock');
  if (heroInited || !nb) return;   // revealName() must run once: twice would restart the stagger
  heroInited = true;
  fitName();                       // size with whatever metrics are available right now
  alignStickers();                 // place the plates after the words have a size
  revealName();
  initStickers();
  initRiso();
  collectFx();
  scheduleFx();
}
const refitHero = () => { if (heroInited){ fitName(); alignStickers(); collectFx(); scheduleFx(); } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initHero, { once: true });
else initHero();                   // defer/async or late injection: the DOM is already parsed
if (document.fonts) {
  if (document.fonts.load) {       // force the masthead face, then wait on exactly that
    Promise.all([
      document.fonts.load('700 1em "JSL Blackletter"'),
      document.fonts.load('400 1em "JSL Blackletter"')
    ]).then(refitHero, refitHero);
  } else if (document.fonts.ready) {
    document.fonts.ready.then(refitHero);
  }
  if (document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', refitHero);
}
window.addEventListener('resize', debounce(() => { if (heroInited){ fitName(); alignStickers(); } }, 120));

// ═══════════════════════════════════════════════════
// FOLIO CLOCK (§06)
// ═══════════════════════════════════════════════════
// THE SHEET HAS A TIME, AND IT IS THE VISITOR'S. HH:MM, 24-hour, in the grunge face, updated ON the
// minute boundary rather than every 30s (a 60s interval drifts and can show a minute for 1.4s or
// 59.9s depending on when the page loaded). Three mirrors of the same value:
//   <time datetime>   the machine-readable answer (and what the harness reads)
//   .sr-only label    the same string, spoken
//   five .dg slots    the printed face, one character per fixed-width slot, so the tick is a flip
//                     and never a reflow — the slots are 0.58em wide and the colon 0.34em, and the
//                     width of the line is therefore identical for 00:00 and 23:59.
// The micro-tween (180ms, yPercent 55 → 0 on the digits that changed) is stillMotion()-gated; the
// load stamp-in is the folio's entrance — VOL, then the dateline, then the clock, 60ms apart, each
// landing from 1.06 scale and -1.5° at -0.4°, which is the brooardsheet's own slight misprint.
(function(){
  const clock = document.getElementById('folioClock');
  if (!clock) return;
  const label  = document.getElementById('folioClockLabel');
  // FIVE SLOTS, ONE OF THEM A COLON — and the update walks the SLOTS, not the digits. `HH:MM` is
  // five characters sitting in five boxes, so indexing the four `.dg` boxes with the string's own
  // positions puts the colon in the third digit and leaves the last minute digit unwritten, which
  // is exactly how `01::2` gets printed. Every write below is a slot-for-slot assignment of the
  // same string the <time> and the spoken label already carry, so the three mirrors cannot disagree.
  const slots  = Array.from(clock.querySelectorAll('.dg, .cl'));
  const digits = slots.filter(s => s.classList.contains('dg'));
  if (digits.length !== 4 || slots.length !== 5) return;
  const pad = n => (n < 10 ? '0' : '') + n;
  let shown = '';
  function stamp(){
    const d = new Date();
    const text = pad(d.getHours()) + ':' + pad(d.getMinutes());
    if (clock.getAttribute('datetime') !== text) clock.setAttribute('datetime', text);
    if (label && label.textContent !== text) label.textContent = text;
    if (text === shown) return;
    const changed = [];
    for (let i = 0; i < slots.length; i++){
      const slot = slots[i], ch = text[i];
      if (!ch || slot.textContent === ch) continue;
      slot.textContent = ch;
      // only a digit flips: the colon is the same character every minute, and re-writing it would
      // restart the blink animation that lives on `.cl`
      if (slot.classList.contains('dg')) changed.push(slot);
    }
    shown = text;
    if (!changed.length || !window.gsap || stillMotion()) return;
    window.gsap.fromTo(changed, { yPercent: 55, opacity: 0 }, {
      yPercent: 0, opacity: 1, duration: 0.18, ease: 'power2.out', stagger: 0.02, overwrite: 'auto',
    });
  }
  stamp();
  let timer = 0;
  function schedule(){
    clearTimeout(timer);
    // 60s minus whatever part of the current minute has already gone, plus a hair so the browser's
    // timer jitter lands after the boundary rather than before it.
    timer = setTimeout(() => { stamp(); schedule(); }, 60000 - (Date.now() % 60000) + 30);
  }
  schedule();
  // a hidden tab throttles timers, so the face is re-stamped on return instead of catching up digit
  // by digit from whenever it was frozen
  document.addEventListener('visibilitychange', () => { if (!document.hidden){ stamp(); schedule(); } });
  // THE STAMP-IN — once, on the folio's three zones, in reading order.
  const folio = document.querySelector('.hero__folio');
  if (folio && window.gsap && !stillMotion()){
    window.gsap.fromTo(Array.from(folio.children),
      { autoAlpha: 0, scale: 1.06, rotate: -1.5, transformOrigin: '50% 50%' },
      { autoAlpha: 1, scale: 1, rotate: -0.4, duration: 0.26, ease: 'power3.in', stagger: 0.06, delay: 0.1 });
  }
})();

// REMOVED — THE PLATE'S POINTER PARALLAX. It translated each pass by a depth (5/11/18px) on the
// RAW style.transform, which is exactly the bug the new sheet cannot afford: GSAP's cache does not
// know about a matrix written behind its back, so the next quickSetter (velocity skew) or the next
// riso drift would snap the plate to a transform that had never heard of the pointer. The depth
// idea survives as the riso drift's RISO_DEPTH (see initRiso), and it is written through GSAP.

// REMOVED — THE SHEET'S CLOCK. #heroClock went with the slug (there is no caption line on a
// broadsheet), so the interval, the Intl formatter, the visibility gate and the MutationObserver
// that stopped and restarted it all went too. One fewer timer, and one fewer module to hold the
// twelfth-second it was measuring.

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
  // a detent is motion: with the drawer's switch off it lands instead of easing (§ MOTION)
  const prefersReduced = stillMotion;
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
const leafletCard = document.getElementById('leafletCard');
// Module scope: the modal calls this when the overlay takes over, so a tilt held at the moment
// of the click cannot ride into the transition — the card must be square before its rect is
// measured as the morph's start point.
function settleSheet(){
  if (!leafletStage || !leafletCard) return;
  leafletStage.classList.remove('tilting');
  leafletCard.style.transform = '';   // the CSS transition owns the return
}
if (leafletStage && leafletCard) {
  const tiltMQ = window.matchMedia ? window.matchMedia('(pointer: fine)') : null;
  const MAX_TILT = 6;
  // stillMotion(), not a fourth copy of the media query: the drawer's Motion switch reaches here
  // too, so a visitor who asked the site to stop moving does not get a sheet that tilts anyway.
  const canTilt = () => (!tiltMQ || tiltMQ.matches) && !stillMotion();
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
    leafletCard.style.transform = 'rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateZ(0)';
    leafletStage.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
    leafletStage.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  });
  leafletStage.addEventListener('pointerleave', settleSheet);
  leafletStage.addEventListener('pointercancel', settleSheet);
}

// ═══════════════════════════════════════════════════
// LEAFLET — ONE SHEET, THREE HINGES
// The four panels are a single 3D chain, not four cards: each leaf is translated to the
// hinge its predecessors' rotations handed it, so folding is exact rather than
// approximate. One state object (S) is tweened and one function (render) writes the DOM.
// Nothing else may write a leaf transform — that is what lets an interrupted fold land on
// real geometry instead of on a stale matrix, and it is why there is no CSS transition to
// disagree with the maths. GSAP is used when it is on the wire; when it is not, the same
// state is assigned and rendered once, so the sheet still opens, folds and turns.
// ═══════════════════════════════════════════════════
const lfModal = document.getElementById('lfModal');
const openLeafletBtn = document.getElementById('openLeafletBtn');
const leafletThumb = document.getElementById('leafletThumb');
if (lfModal && openLeafletBtn) {
  const gsap  = window.gsap;
  const Flip  = window.Flip;
  if (gsap && Flip) gsap.registerPlugin(Flip);

  const lfCloseBtn = document.getElementById('lfModalClose');
  const lfBook     = lfModal.querySelector('.lf-book-container');
  const lfRig      = document.getElementById('lfRig');
  const lfAcc      = document.getElementById('lfAccordion');
  const lfLeaves   = Array.from(lfAcc.querySelectorAll('.lf-leaf'));
  const lfFly      = document.getElementById('lfFly');
  const stateLbl   = document.getElementById('lfStateLabel');
  const hint       = document.getElementById('lfHint');
  const btnFold    = document.getElementById('lfBtnFold');
  const btnUnfold  = document.getElementById('lfBtnUnfold');
  const btnTurn    = document.getElementById('lfBtnTurnOver');
  const btnPrev    = document.getElementById('lfPrev');
  const btnNext    = document.getElementById('lfNext');
  const stepLbl    = document.getElementById('lfCount');
  // the thumbnail's cover is the morph's source; the fly layer is its destination, and the
  // two share data-flip-id so Flip can match them as one object across two nodes
  const thumbCover = leafletThumb ? leafletThumb.querySelector('[data-flip-id]') : null;
  const lfNarrowMQ = window.matchMedia ? window.matchMedia('(max-width: 800px)') : null;
  // every fold, turn and flip below asks this: with motion off they pose instead of tween (§ MOTION)
  const still = stillMotion;

  // Folded: leaves 1 and 3 sit at 180°, so all four panels collapse into one footprint.
  // Open: 0° each, and the chain lays itself out to exactly four panels.
  const FOLDED = [0, 180, 0, 180], OPEN = [0, 0, 0, 0];
  const CAM_FLAT = { x: 0, y: 0, z: 1 }, CAM_OPEN = { x: 2.5, y: -2, z: 1 };
  // c is the strip's own release: 1.5u centres the folded stack inside the 4u box, 0
  // centres the open strip. Tweening it is what makes the sheet look placed down rather
  // than dragged open.
  const S = { th: FOLDED.slice(), c: 1.5, camX: 0, camY: 0, camZ: 1, yaw: 0 };
  let lfOpen = false, lfPhase = 'folded', lfLastTrigger = null, lfTimeline = null;
  let lfAxis = (lfNarrowMQ && lfNarrowMQ.matches) ? 'x' : 'y', lfWarm = false;
  // THE PAGER'S THREE STOPS. Two leaves rotate, so the chain only has three honest
  // footprints — one panel, two, four — and each one is a pose this engine already
  // renders. Going through the same S object and the same render() is what keeps the
  // pager from becoming a second writer of transforms: it tweens to a pose, it never
  // sets a matrix. `half` is its own phase because "Open — four panels, three hinges"
  // would be a lie at two panels.
  const STEPS = [
    { th: FOLDED.slice(), c: 1.5, cam: CAM_FLAT, phase: 'folded', word: 'Folded · 1 of 3' },
    { th: [0, 0, 0, 180], c: 1, cam: { x: 1.2, y: -1, z: 1 }, phase: 'half', word: 'Two panels · 2 of 3' },
    { th: OPEN.slice(), c: 0, cam: CAM_OPEN, phase: 'open', word: 'Open · 3 of 3' }
  ];
  let lfStep = 0;   // a cache of the pose, written only by pager()
  lfRig.setAttribute('data-axis', lfAxis);

  function setSheetExpanded(on){
    const v = on ? 'true' : 'false';
    if (leafletThumb) leafletThumb.setAttribute('aria-expanded', v);
    openLeafletBtn.setAttribute('aria-expanded', v);
  }
  // THE ONLY WRITER. u is one panel's long edge — a quarter of the strip — and every leaf
  // is placed by accumulating the ones before it: hinge += u·cos θ, depth -= u·sin θ. A
  // positive CSS angle folds away from the viewer on both axes, because rotateX is called
  // negative for the tall layout. The -0.4px per leaf keeps leaf 0 in front of the stack
  // it carries and is far below the point where perspective could skew a 460px panel.
  function render(){
    const u = lfAxis === 'y' ? lfAcc.offsetWidth / 4 : lfAcc.offsetHeight / 4;
    if (!u) return;                       // not laid out yet: leave the last pose alone
    const shift = S.c * u;
    let hinge = 0, depth = 0;
    for (let i = 0; i < lfLeaves.length; i++){
      const a = S.th[i], rad = a * Math.PI / 180;
      const p = (hinge + shift).toFixed(2), z = (depth - i * 0.4).toFixed(2);
      lfLeaves[i].style.transform = lfAxis === 'y'
        ? 'translate3d(' + p + 'px,0,' + z + 'px) rotateY(' + a.toFixed(2) + 'deg)'
        : 'translate3d(0,' + p + 'px,' + z + 'px) rotateX(' + (-a).toFixed(2) + 'deg)';
      hinge += u * Math.cos(rad);
      depth -= u * Math.sin(rad);
    }
    lfRig.style.transform = 'rotateX(' + S.camX + 'deg) rotateY(' + (S.camY + S.yaw) + 'deg) scale(' + S.camZ + ')';
  }
  function setPose(th, c, cam, yaw){
    for (let i = 0; i < S.th.length; i++) S.th[i] = th[i];
    S.c = c;
    S.camX = cam ? cam.x : 0; S.camY = cam ? cam.y : 0; S.camZ = cam ? cam.z : 1;
    if (yaw != null) S.yaw = yaw;
    render();
  }
  function label(){
    const turned = S.yaw === 180;
    if (lfPhase === 'folded'){
      stateLbl.textContent = 'Folded — four panels, one card';
      hint.textContent = 'Unfold to lay the sheet out';
    } else if (lfPhase === 'open'){
      stateLbl.textContent = turned ? 'Turned over — the product spread' : 'Open — four panels, three hinges';
      hint.textContent = turned ? 'Fold or close to put it away' : 'Turn it over to see the product spread';
    } else if (lfPhase === 'half'){
      stateLbl.textContent = 'Half open — two panels showing';
      hint.textContent = 'Page again to lay the sheet out';
    } else {
      stateLbl.textContent = 'In motion…';
      hint.textContent = '';
    }
    if (btnFold)   btnFold.disabled   = lfPhase !== 'open';
    if (btnUnfold) btnUnfold.disabled = lfPhase !== 'folded';
    if (btnTurn)   btnTurn.disabled   = lfPhase !== 'open';
    pager();
  }
  // The pager reads its position back out of the pose rather than being told: opening,
  // folding, unfolding and a resize all land on one of the three footprints, and none of
  // them has to remember to update a counter. th[1] and th[3] are the two hinges that move.
  function pager(){
    if (!stepLbl) return;
    const n = (lfPhase === 'folded' || S.th[1] > 90) ? 0 : (S.th[3] > 90 ? 1 : 2);
    lfStep = n;
    stepLbl.textContent = STEPS[n].word;
    const moving = lfPhase === 'moving';
    if (btnPrev) btnPrev.disabled = moving || n === 0;
    if (btnNext) btnNext.disabled = moving || n === STEPS.length - 1;
  }
  // One pose at a time from a thumb. The camera is tweened alongside the hinges, because a
  // sheet that grew two panels while the camera stayed put would read as a crop.
  function goStep(n){
    n = Math.max(0, Math.min(STEPS.length - 1, n));
    if (!lfOpen || lfPhase === 'moving' || n === lfStep) return;
    const to = STEPS[n];
    stopTimeline();
    if (!gsap || still()){ setPose(to.th, to.c, to.cam, 0); lfPhase = to.phase; label(); return; }
    lfPhase = 'moving'; label();
    lfTimeline = gsap.timeline({ onComplete(){ lfTimeline = null; lfPhase = to.phase; label(); } });
    lfTimeline
      .to(S, { c: to.c, duration: 0.8, ease: 'power3.inOut', onUpdate: render }, 0)
      .to(S.th, { 1: to.th[1], duration: 0.62, ease: 'power4.inOut', onUpdate: render }, 0)
      .to(S.th, { 3: to.th[3], duration: 0.62, ease: 'power4.inOut', onUpdate: render }, 0.14)
      .to(S, { camX: to.cam.x, camY: to.cam.y, camZ: to.cam.z, yaw: 0, duration: 0.95, ease: 'power2.out', onUpdate: render }, 0);
  }
  if (btnPrev) btnPrev.addEventListener('click', () => goStep(lfStep - 1));
  if (btnNext) btnNext.addEventListener('click', () => goStep(lfStep + 1));

  // THE FLY LAYER. The cover travels from the thumbnail to the sheet on its own layer for
  // two reasons: the faces clip their contents (overflow:hidden would slice a scaled image),
  // and leaf 0's transform belongs to the hinge chain — a morph must not contest it. The
  // layer is sized to leaf 0's *folded* rect, which is square-on because the camera is at
  // identity while the sheet is closed, so the hand-off at the end is pixel-identical.
  function placeFly(){
    if (!lfFly || !lfLeaves.length) return false;
    const face = lfLeaves[0].querySelector('.lf-face--front');
    const host = lfBook.getBoundingClientRect(), r = face.getBoundingClientRect();
    if (!face || r.width < 1 || r.height < 1 || host.width < 1) return false;
    lfFly.style.left = (r.left - host.left).toFixed(2) + 'px';
    lfFly.style.top = (r.top - host.top).toFixed(2) + 'px';
    lfFly.style.width = r.width.toFixed(2) + 'px';
    lfFly.style.height = r.height.toFixed(2) + 'px';
    lfFly.hidden = false;
    return true;
  }
  function hideFly(){
    if (!lfFly) return;
    lfFly.style.opacity = '0';
    if (gsap) gsap.set(lfFly, { clearProps: 'transform' });
    else lfFly.style.transform = '';
    lfFly.hidden = true;
  }
  // The four product panels are only ever seen after a turn-over, so they are not fetched
  // until the sheet is first opened or the thumb is reached for: 270KB a visit that never
  // opens the leaflet does not pay for. The four front faces stay eager, because the cover
  // has to be decoded before Flip can measure it.
  function warmFaces(){
    if (lfWarm) return;
    lfWarm = true;
    lfAcc.querySelectorAll('img[data-src]').forEach(img => {
      img.src = img.dataset.src;
      delete img.dataset.src;
    });
  }
  if (leafletThumb){
    leafletThumb.addEventListener('pointerenter', warmFaces, { once: true });
    leafletThumb.addEventListener('focus', warmFaces, { once: true });
  }
  function stopTimeline(){
    if (lfTimeline){ lfTimeline.kill(); lfTimeline = null; }
  }
  function openLeaflet(from){
    if (lfOpen) return;
    lfOpen = true;
    stopTimeline();
    settleSheet();                       // a held tilt must not skew the morph's start rect
    lfLastTrigger = (from && from.getBoundingClientRect) ? from : openLeafletBtn;
    lfAxis = (lfNarrowMQ && lfNarrowMQ.matches) ? 'x' : 'y';
    lfRig.setAttribute('data-axis', lfAxis);
    setPose(FOLDED, 1.5, CAM_FLAT, 0);   // square and closed before anything is measured

    lfModal.inert = false;
    lfModal.setAttribute('aria-hidden', 'false');
    lfModal.classList.add('open');
    setSheetExpanded(true);
    syncScrollLock();
    lfModal.scrollTop = 0;               // the tall cascade must not reopen where it was left
    lfPhase = 'moving';
    label();
    warmFaces();
    if (lfCloseBtn) lfCloseBtn.focus({ preventScroll: true });

    // The cover lands on leaf 0 first and the chain lets go afterwards, so the sheet grows out
    // of the object that was already on the page. Both nodes carry data-flip-id="lfCover" —
    // that is how Flip matches one object across two elements, and because the thumbnail's
    // cell and a panel share the 0.7066 ratio the morph stays a uniform scale, never a smear.
    let morphing = false;
    if (gsap && Flip && thumbCover && !still() && placeFly()){
      lfFly.style.opacity = '1';
      Flip.from(Flip.getState(thumbCover), {
        targets: lfFly, scale: true, duration: 0.95, ease: 'expo.inOut',
        onComplete: hideFly
      });
      morphing = true;
    } else if (lfFly){
      lfFly.hidden = true;
    }

    if (!gsap || still()){
      setPose(OPEN, 0, CAM_OPEN, 0);
      lfPhase = 'open'; label();
      return;
    }
    lfTimeline = gsap.timeline({ onComplete(){ lfTimeline = null; lfPhase = 'open'; label(); } });
    unfoldInto(lfTimeline, morphing ? 0.42 : 0.06);
  }
  function closeLfModal(){
    if (!lfOpen) return;
    lfOpen = false;
    stopTimeline();
    const finish = () => {
      if (lfFly) hideFly();
      lfModal.classList.remove('open');
      lfModal.setAttribute('aria-hidden', 'true');
      lfModal.inert = true;
      setSheetExpanded(false);
      syncScrollLock();
      setPose(FOLDED, 1.5, CAM_FLAT, 0);
      lfPhase = 'folded';
      label();
      // the trigger may have been removed or hidden while the sheet was open
      if (lfLastTrigger && document.contains(lfLastTrigger)) lfLastTrigger.focus({ preventScroll: true });
      lfLastTrigger = null;
    };
    const onScreen = r => r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
    // The card has to be one panel again before it can be dropped into the thumbnail, so the
    // chain folds inside the room first and the cover layer carries it home second. Escape
    // therefore lands on a folded card rather than snapping it shut from four panels wide.
    const flyBack = () => {
      if (!gsap || !thumbCover || !placeFly()){ finish(); return; }
      const a = lfFly.getBoundingClientRect(), b = thumbCover.getBoundingClientRect();
      if (!onScreen(b) || a.width < 1){ hideFly(); finish(); return; }
      lfFly.style.opacity = '1';
      gsap.to(lfFly, {
        x: (b.left + b.width / 2) - (a.left + a.width / 2),
        y: (b.top + b.height / 2) - (a.top + a.height / 2),
        scaleX: b.width / a.width, scaleY: b.height / a.height,
        duration: 0.46, ease: 'power2.in',
        onComplete(){ hideFly(); finish(); }
      });
    };
    if (!gsap || still()){ finish(); return; }
    lfPhase = 'moving'; label();
    const tl = gsap.timeline({ onComplete: flyBack });
    foldInto(tl, 0);
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

  // ── CHOREOGRAPHY ────────────────────────────────────
  // One hinge at a time, innermost first: leaf 3's hinge rides on where leaf 1 puts it, so
  // opening them the other way round would make the free end arrive from the wrong place.
  // c is released alongside the angles, which is what makes the sheet settle into the middle
  // of the table instead of sliding out from under the viewer.
  function unfoldInto(tl, at){
    return tl
      .to(S, { c: 0, duration: 1.02, ease: 'power3.inOut', onUpdate: render }, at)
      .to(S.th, { 1: 0, duration: 0.84, ease: 'power4.inOut', onUpdate: render }, at)
      .to(S.th, { 3: 0, duration: 0.84, ease: 'power4.inOut', onUpdate: render }, at + 0.14)
      .to(S, { camX: CAM_OPEN.x, camY: CAM_OPEN.y, camZ: 1, duration: 1.25, ease: 'power2.out', onUpdate: render }, at);
  }
  function foldInto(tl, at){
    return tl
      .to(S, { c: 1.5, duration: 0.78, ease: 'power3.inOut', onUpdate: render }, at)
      .to(S.th, { 3: 180, duration: 0.66, ease: 'power4.inOut', onUpdate: render }, at)
      .to(S.th, { 1: 180, duration: 0.66, ease: 'power4.inOut', onUpdate: render }, at + 0.1)
      .to(S, { camX: 0, camY: 0, camZ: 1, yaw: 0, duration: 0.78, ease: 'power2.inOut', onUpdate: render }, at);
  }
  // the camera pulls back a little as the sheet goes over, so the turn reads as an object
  // being picked up rather than as a page being rotated
  function turnInto(tl, at, target){
    return tl
      .to(S, { yaw: target, duration: 1.1, ease: 'power3.inOut', onUpdate: render }, at)
      .to(S, { camZ: 0.9, duration: 0.55, ease: 'power2.in', onUpdate: render }, at)
      .to(S, { camZ: 1, duration: 0.55, ease: 'power2.out', onUpdate: render }, at + 0.55);
  }
  function runFold(){
    stopTimeline();
    if (!gsap || still()){ setPose(FOLDED, 1.5, CAM_FLAT, 0); lfPhase = 'folded'; label(); return; }
    lfPhase = 'moving'; label();
    lfTimeline = gsap.timeline({ onComplete(){ lfTimeline = null; lfPhase = 'folded'; label(); } });
    foldInto(lfTimeline, 0);
  }
  function runUnfold(){
    stopTimeline();
    if (!gsap || still()){ setPose(OPEN, 0, CAM_OPEN, 0); lfPhase = 'open'; label(); return; }
    lfPhase = 'moving'; label();
    lfTimeline = gsap.timeline({ onComplete(){ lfTimeline = null; lfPhase = 'open'; label(); } });
    unfoldInto(lfTimeline, 0);
  }
  function turnOver(){
    if (!lfOpen || lfPhase !== 'open') return;
    // which way is "over" is a question about where the sheet is, not about which side it
    // was: a press during the return swing must send it back the way it came
    const target = S.yaw > 90 ? 0 : 180;
    stopTimeline();
    if (!gsap || still()){ S.yaw = target; render(); label(); return; }
    lfPhase = 'moving'; label();
    lfTimeline = gsap.timeline({ onComplete(){ lfTimeline = null; lfPhase = 'open'; label(); } });
    turnInto(lfTimeline, 0, target);
  }
  if (btnFold)   btnFold.addEventListener('click', () => { if (lfOpen && lfPhase === 'open') runFold(); });
  if (btnUnfold) btnUnfold.addEventListener('click', () => { if (lfOpen && lfPhase === 'folded') runUnfold(); });
  if (btnTurn)   btnTurn.addEventListener('click', turnOver);

  // A resize can change the axis, not just the unit: below 800px the chain folds across the
  // sheet instead of along it. render() re-reads the unit on every frame, so a reflow in the
  // middle of a fold lands on the new geometry rather than on a pose computed for the old one.
  function relayout(){
    if (!lfOpen) return;
    const axis = (lfNarrowMQ && lfNarrowMQ.matches) ? 'x' : 'y';
    if (axis !== lfAxis){ lfAxis = axis; lfRig.setAttribute('data-axis', axis); }
    render();
  }
  if (window.ResizeObserver) new ResizeObserver(relayout).observe(lfAcc);
  else window.addEventListener('resize', relayout);

  render();   // folded, correct and already rendered the instant the room is opened
}

// ═══════════════════════════════════════════════════
// HIDDEN LAYER — nav + footer triggers + circular reveal + BINGO magnifier
// ═══════════════════════════════════════════════════
const artOverlay = document.getElementById('artOverlay');
// THE DOORS: the B1 plate in the footer and the archive row in the section list. One selector,
// so a door added to the markup is a door here without a second edit. There used to be a third —
// the Arabic verse wrapped in a button — which made a line of poetry a control; it is typography
// now. The list's row is a real <a href="#footerB1"> so the no-JS page still lands on the plate,
// which means this module must own the press: the row's own handler (in the bar module) cancels
// that navigation, and openArtOverlay() is what runs instead.
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

  // EITHER DOOR CAN BE THE ONE THAT OPENED IT, and the one that opened it may be gone by the
  // time the wall closes: the archive row lives inside a list that shuts the moment it is used.
  // Focus still has to land somewhere real, so the return is the same door in its other
  // position — the B1 plate, which is what the row's own href promised anyway and is never
  // hidden. `preventScroll` because a visitor who closed the room from the top of the page must
  // not be teleported to the footer by a focus call.
  const reachable = el => !!el && document.contains(el) && !el.closest('[hidden]') && el.offsetParent !== null;
  function returnFocus(){
    const back = reachable(lastTrigger) ? lastTrigger : artTriggers.find(reachable);
    if (back) back.focus({ preventScroll: true });
  }

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
    returnFocus();
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
  // THE DECK COMES FIRST ON A PHONE. Below 768 the wall is a horizontal scroller, and a
  // finger travelling sideways is paging the deck, not magnifying the card. The gesture is
  // declined (lens off, no preventDefault) the moment it proves horizontal, so the swipe
  // that started on the bingo still reaches the deck.
  let lensFrom = null;
  bingoWrap.addEventListener('touchstart', e => {
    const t = e.touches[0];
    lensFrom = t ? { x: t.clientX, y: t.clientY } : null;
    lensActive = true; bingoWrap.classList.add('lens-on');
  });
  bingoWrap.addEventListener('touchmove', e => {
    if (!lensActive || !e.touches[0]) return;
    if (lensFrom){
      const dx = Math.abs(e.touches[0].clientX - lensFrom.x);
      const dy = Math.abs(e.touches[0].clientY - lensFrom.y);
      if (dx > dy + 4){ lensActive = false; lensFrom = null; bingoWrap.classList.remove('lens-on'); return; }
    }
    updateLensTarget(e.touches[0]);
    if (e.cancelable) e.preventDefault(); // only while the lens is actually tracking
  }, {passive:false});
  const lensOff = () => { lensActive = false; lensFrom = null; bingoWrap.classList.remove('lens-on'); };
  bingoWrap.addEventListener('touchend', lensOff);
  bingoWrap.addEventListener('touchcancel', lensOff);
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
// THE DECK'S OWN VOICE — below 768 the museum wall is a native scroll-snap track with no
// JavaScript at all (index.html §13b), so a swipe leaves no event of its own. The only
// honest signal is the scroll settling: `scrollend` where the engine has it, and a 140 ms
// quiet timer where it does not, and the index is DERIVED from scrollLeft/clientWidth
// rather than stored as a counter, so a resize, a rotation or a restored scroll position
// cannot desync it from the deck. Two locks stand in front of the sound: the deck must
// exist (the media query the CSS uses), and the global toggle must be on — `live()` inside
// the audio module already enforces the second, and the dataset check here means even a
// future entry in the voice table could not leak a cue past a muted switch.
(function(){
  const overlay = document.getElementById('artOverlay');
  const wall = overlay && overlay.querySelector('.art-wall');
  if (!wall) return;
  const deckMQ = window.matchMedia ? window.matchMedia('(max-width:767.98px)') : null;
  let last = 0, quiet = 0;
  const index = () => wall.clientWidth ? Math.round(wall.scrollLeft / wall.clientWidth) : 0;
  const open = () => overlay.classList.contains('open');
  function arrive(){
    if (deckMQ && !deckMQ.matches) return;         // above 768 the wall is not a track
    if (!open()) return;                           // a closed room is not a page turn
    const i = index();
    if (i === last) return;                        // scrollend and the timer can both land
    last = i;
    if (document.documentElement.dataset.sound === 'off') return;   // the second lock
    document.dispatchEvent(new CustomEvent('ad:voice', { detail: { voice: 'breath', kind: 'micro' } }));
  }
  wall.addEventListener('scroll', () => {
    if (!open()) return;
    clearTimeout(quiet);
    quiet = setTimeout(arrive, 140);
  }, {passive:true});
  if ('onscrollend' in wall) wall.addEventListener('scrollend', arrive, {passive:true});
  // The reveal must never sound like a page turn: on the way in, whatever scroll position
  // the room was left at becomes the baseline, and on the way out the baseline is the
  // first slide again. A MutationObserver watches the one class the overlay already owns,
  // so this block cannot disagree with the code that opens the room.
  if (window.MutationObserver){
    new MutationObserver(() => { last = open() ? index() : 0; })
      .observe(overlay, {attributeFilter:['class']});
  }
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

  // ── THE LAMINATE — three voices for the hero's stickers and its asterisk. Each one is the
  //    gesture it names, not an "interaction" in general, and the three are chosen to be
  //    mutually unmusical so a hand that peels, drops and scrolls does not hear a phrase.
  //    PEEL is 18 ms of noise through a 2600 Hz band-pass: a strip releasing its tack is a
  //    broadband rip with a bright top, and 18 ms is short enough to BE the release rather
  //    than a hiss that follows it. Gated at 90 ms, so a fast back-and-forth across a plate
  //    cannot turn it into a rattle — one peel per press, not one per pixel.
  //    RESTICK is the opposite material and the other half of the same event: one sine
  //    falling 150 → 70 Hz over 65 ms with NO noise at all. Film going back down is the
  //    absence of brightness — it reads as a low quick thud — and any burst on top of it
  //    would say "click", which is a button and not a sticker.
  //    RATCHET is 8 ms of noise in a 5200 Hz band, and it is deliberately the only voice on
  //    the site above ~3 kHz. Every other sound here is a material; this one is a MECHANISM
  //    (the asterisk indexing one 15° step), and a detent is the one thing the ear only
  //    resolves in the top octave. It is also the quietest of the three at 0.036 — a tick at
  //    the edge of the sheet, not a notification.
  const PEEL    = { dur: 0.018, bp: 2600, bpQ: 1.1, atk: 0.0012, peak: 0.055,
                    tail: 0.004, off: 0.005, gate: 90 };
  const RESTICK = { hz0: 150, hz1: 70, dur: 0.065, atk: 0.0022, peak: 0.085,
                    tail: 0.004, off: 0.005, gate: 60 };
  const RATCHET = { dur: 0.008, bp: 5200, bpQ: 3.2, atk: 0.0006, peak: 0.036,
                    tail: 0.003, off: 0.005, gate: 55 };

  let ctx = null, bus = null, white = null, pink = null;
  let muted = readMuted(), voices = 0, lastTap = 0, lastBreath = 0, lastSnap = 0, lastGlide = 0;
  let lastPeel = 0, lastRestick = 0, lastRatchet = 0;
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
  // THE THREE MATERIAL VOICES ARE DECORATION AND THEY KNOW IT. `live()` answers "can this context
  // make a sound at all"; `audible()` also answers "should this gesture be decorated", which under
  // reduced motion is never. A reader who has asked the page to stop moving is telling us something
  // about the whole experience, not only about the transforms — so peel, restick and ratchet check
  // this one, and the existing voices keep `live()` and their own semantics untouched.
  const audible = () => live() && !stillMotion();
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

  // ── VOICE 5: the peel. One burst, one band, no body — a rip is all edge. The band centre
  //    is jittered ±6% and the buffer's start point is random, because an identical 18 ms
  //    rip repeated on every press is the one thing the ear WILL pick out as a sample.
  //    Nothing is envelope'd past 18 ms: the burst IS the event, and a tail would turn a
  //    release into a swoosh.
  function peel(){
    if (!audible()) return;
    const t = performance.now();
    if (t - lastPeel < PEEL.gate || voices >= 4) return;   // one peel per press
    lastPeel = t; voices++;
    const at = ctx.currentTime + PEEL.off;
    const end = at + PEEL.dur + PEEL.tail;

    const src = ctx.createBufferSource(); src.buffer = white;
    src.playbackRate.value = 0.92 + Math.random() * 0.18;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = PEEL.bp * (0.94 + Math.random() * 0.12);
    bp.Q.value = PEEL.bpQ;
    const g = ctx.createGain();
    env(g.gain, at, [[PEEL.peak, PEEL.atk], [FLOOR, PEEL.dur]]);
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.start(at, Math.random() * 0.5); src.stop(end);

    const release = releaseOnce();
    const kill = cut(src, bp, g);
    src.onended = () => { kill(); release(); };
    setTimeout(() => { kill(); release(); }, 300);         // a context that never resumes leaks nothing
  }

  // ── VOICE 6: the restick. One sine, no noise, 65 ms — the film settling back onto the
  //    paper. Exponential on the pitch because a linear 150 → 70 over 65 ms reads as a
  //    synth drop and an exponential reads as mass arriving; `SNAP` argues the same case at
  //    a lower pitch, and this is the same argument at the weight of a sticker rather than
  //    a hinged folio — 0.085 against the snap's 0.115.
  function restick(){
    if (!audible()) return;
    const t = performance.now();
    if (t - lastRestick < RESTICK.gate || voices >= 4) return;
    lastRestick = t; voices++;
    const at = ctx.currentTime + RESTICK.off;
    const end = at + RESTICK.dur + RESTICK.tail;

    const osc = ctx.createOscillator(); osc.type = 'sine';
    const hz = RESTICK.hz0 * (0.96 + Math.random() * 0.08); // ±4%: no two drops identical
    osc.frequency.setValueAtTime(hz, at);
    osc.frequency.exponentialRampToValueAtTime(RESTICK.hz1, at + RESTICK.dur);
    const g = ctx.createGain();
    env(g.gain, at, [[RESTICK.peak, RESTICK.atk], [FLOOR, RESTICK.dur]]);
    osc.connect(g); g.connect(bus);
    osc.start(at); osc.stop(end);

    const release = releaseOnce();
    const kill = cut(osc, g);
    osc.onended = () => { kill(); release(); };
    setTimeout(() => { kill(); release(); }, 300);
  }

  // ── VOICE 7: the ratchet. 8 ms of noise in a 5200 Hz band with a Q of 3.2 — narrow
  //    enough to ring as a DETENT and not as a click of static. 8 ms and a 0.036 peak is
  //    the smallest gesture the site is allowed to make, which is right: the asterisk
  //    indexing one step is the least eventful thing that happens here, and it must be
  //    audible without ever becoming something a reader notices they are listening to.
  function ratchet(){
    if (!audible()) return;
    const t = performance.now();
    if (t - lastRatchet < RATCHET.gate || voices >= 4) return;   // one tick per step
    lastRatchet = t; voices++;
    const at = ctx.currentTime + RATCHET.off;
    const end = at + RATCHET.dur + RATCHET.tail;

    const src = ctx.createBufferSource(); src.buffer = white;
    src.playbackRate.value = 0.98 + Math.random() * 0.08;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = RATCHET.bp; bp.Q.value = RATCHET.bpQ;
    const g = ctx.createGain();
    env(g.gain, at, [[RATCHET.peak, RATCHET.atk], [FLOOR, RATCHET.dur]]);
    src.connect(bp); bp.connect(g); g.connect(bus);
    src.start(at, Math.random() * 0.5); src.stop(end);

    const release = releaseOnce();
    const kill = cut(src, bp, g);
    src.onended = () => { kill(); release(); };
    setTimeout(() => { kill(); release(); }, 300);
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
    // THE STICKERS SPEAK FOR THEMSELVES. A press on one means peel (the hand taking the
    // plate off the paper) and its release means restick (the hand putting it back), so the
    // gesture has already said the only two things it has to say. A UI tap on the press
    // would be a third, and the one that made the plate sound like a button.
    if (node.closest('.sticker')) return null;
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
    // Inside the leaflet the sheet has already been turned: these move a panel, not the
    // paper, so they get a 0.150 s flap. #lfBtnTurnOver rolls the whole object and is still a
    // flap, not a snap — the folio itself is #lfModalClose on the next line. The pager is the
    // other way of turning the same pages, so it speaks with the same voice: a thumb press
    // on Prev/Next IS a page turn, and the generic button rule would have made it a 21 ms
    // UI knock. The ends need no special case — pager() disables Prev at the first stop and
    // Next at the last, and the dead-control rule above already silences them.
    if (node.closest('#lfBtnFold,#lfBtnUnfold,#lfBtnTurnOver,#lfPrev,#lfNext')) return ['breath', 'micro'];
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
    // the bar's own controls keep the softer knock: they are 9–10 px mono on a dark ground, and
    // a full UI tap under a 10 px word reads heavier than the word looks (§05). The archive row
    // in the list never reaches here — it matched the snap rule above.
    const inBar = act.closest('.nav-menu, .nav-bc, .nav-gear');
    return ['tap', inBar ? 'soft' : 'ui'];
  }
  // One table, so the routing name and the function name cannot drift apart, and an
  // unknown name is silent rather than an accidental tap.
  const VOICE = { tap, breath, snap, glide, peel, restick, ratchet };
  function fire(hit){
    const fn = hit && VOICE[hit[0]];
    if (fn) guard(fn)(hit[1]);
  }
  // A MODULE THAT OWNS A MOMENT asks for its voice by name instead of reaching into this
  // closure. The ledger fires this once, after the row is in the table; the same table and
  // the same rate limiter apply as if the press had been a snap all along, and an unknown
  // name stays silent because VOICE has no entry for it.
  // The detail is either a bare name (how the ledger asks) or {voice, kind} for a module
  // that needs a specific variant — the deck turns pages, so it asks for the flap rather
  // than for a breath at the default length. Both forms land in the same table, and a name
  // that is not in VOICE stays silent either way.
  document.addEventListener('ad:voice', e => {
    const d = e && e.detail;
    if (!d) return;
    const name = typeof d === 'string' ? d : d.voice;
    if (!VOICE[name]) return;
    fire(typeof d === 'string' ? [name] : [name, d.kind]);
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
// ═══════════════════════════════════════════════════
// THE HEAD, THE BOARD, THE RAIL, THE DRAWER
// ═══════════════════════════════════════════════════
// One module, because they are one system of answers about the same page: which phase the head is in
// (§05), which section the visitor is reading — written to EVERY `[data-nav-for]` surface at once,
// the head's row and the metroboard — how far through the page they are (the rail), and the two
// preference switches every motion module already knows how to honour.
// WHAT LEFT WITH THE MARQUEE: the Headroom slide (a bar that never hides cannot need a direction),
// the breadcrumb and its five-row list (the four places are named outright now), the scroll-written
// bar opacity, and the dock handoff that fed it. Nothing below watches the scroll for the head.
(function(){
  const sections = Array.from(document.querySelectorAll('[data-nav]'));
  const rows     = Array.from(document.querySelectorAll('[data-nav-for]'));
  const drawer   = document.getElementById('setPanel');

  // ── THE PHASE (§05) ─────────────────────────────────────────────
  // ONE IntersectionObserver on #hero, threshold 0: intersecting is `hero` (a transparent head over
  // the sheet), not intersecting is `sheet` (opaque paper + a 1px hairline). The stylesheet's
  // default is the opaque state, so the visitor whose script never ran still gets a legible bar —
  // and because this is an observer and not a scroll handler, the phase cannot cost a frame.
  if ('IntersectionObserver' in window && heroEl){
    new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      if (!e) return;
      rootEl.setAttribute('data-phase', e.isIntersecting ? 'hero' : 'sheet');
    }, { threshold: 0 }).observe(heroEl);
  }

  // ── WHERE THE VISITOR IS (§05a, §06b) ───────────────────────────
  // A READING LINE, NOT A SCROLL POSITION. The root margin cuts the viewport down to a 5% band
  // starting 45% from the top, so a section intersects it exactly while its body is under the
  // reader's eye — the same line the rail's own frame uses (LINE = 0.4), which is why the lit block
  // and the filling segment change together. One callback writes BOTH surfaces: every element
  // carrying `data-nav-for`, in the head and on the board, so they cannot disagree.
  // #hero is deliberately NOT observed: the head is not a place the page's contents list, and at
  // scrollY 0 nothing is current — which is what a contents page should say about itself.
  if ('IntersectionObserver' in window && rows.length){
    // LEAVING MATTERS AS MUCH AS ARRIVING. A callback that only reads the intersecting entries
    // lights a place and never puts it out, so a scroll back to the top would leave the last section
    // current — and a contents page that claims to be inside a section at scrollY 0 is lying. So
    // the set of sections ON the reading line is maintained here and the state is derived from it:
    // arrive adds, leave removes, and the write below always describes the whole page at once.
    const live = new Set();
    const io = new IntersectionObserver(entries => {
      for (const e of entries){
        if (e.isIntersecting) live.add(e.target.id);
        else live.delete(e.target.id);
      }
      // a 5% band holds one section at a time; if two ever share it the EARLIER one in document
      // order wins, because that is the one the reader has begun
      let current = '';
      for (const s of sections){ if (s.id && live.has(s.id)){ current = s.id; break; } }
      for (const row of rows){
        if (current && row.dataset.navFor === current) row.setAttribute('aria-current', 'location');
        else row.removeAttribute('aria-current');
      }
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    for (const s of sections) if (s.id && s.id !== 'hero') io.observe(s);
  }

  // ── THE PROGRESS TRACK (§05c) ───────────────────────────────────
  // One segment per [data-nav] section, built from the same list rather than authored a second
  // time: the rail can never name a place the page is not made of. aria-hidden — it is the same
  // answer as the head's row, drawn a second way.
  const track = document.getElementById('pageProgress');
  const segs = [], fills = [];
  if (track){
    for (const s of sections){
      const seg  = document.createElement('span');
      const leaf = document.createElement('span');
      seg.className = 'pp-seg';
      seg.dataset.ppFor = s.dataset.nav || '';
      leaf.className = 'pp-fill';
      seg.appendChild(leaf);
      track.appendChild(seg);
      segs.push(seg); fills.push(leaf);
    }
  }

  // ── THE TWO SWITCHES ────────────────────────────────────────────
  // Both are <button aria-checked>, not checkboxes: a switch is a state, and the row around it is
  // 44px of paper (§05b). The storage keys are read once here and mirrored by the attributes the
  // stylesheet reads, so this session and the next one behave the same, and the audio module's own
  // key ('ad-sound') stays a separate promise.
  const KEY_A11Y = 'ad-a11y', KEY_MOTION = 'ad-motion';
  const readPref  = k => { try { return localStorage.getItem(k); } catch(e){ return null; } };
  const writePref = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
  const a11yBtn   = document.getElementById('prefA11y');
  const motionBtn = document.getElementById('prefMotion');
  let a11y   = readPref(KEY_A11Y) === 'on';
  let motion = readPref(KEY_MOTION) !== 'off';   // no key at all is the site's own default: on

  function applyPrefs(){
    rootEl.setAttribute('data-a11y', a11y ? 'on' : 'off');
    // ACCESSIBILITY OWNS MOTION WHILE IT IS ON. A visitor who is overwhelmed reaches for one
    // switch, not three; the row under it says so and is aria-disabled rather than disabled, so it
    // stays readable. Turning it back off returns motion to its own switch — never to `on` —
    // because a visitor who had already silenced the movement would not expect that press to start
    // it again.
    const still = !motion || a11y;
    rootEl.setAttribute('data-motion', still ? 'off' : 'on');
    if (a11yBtn)   a11yBtn.setAttribute('aria-checked', a11y ? 'true' : 'false');
    if (motionBtn){
      motionBtn.setAttribute('aria-checked', still ? 'false' : 'true');
      motionBtn.setAttribute('aria-disabled', a11y ? 'true' : 'false');
    }
    syncSmoothScroll();   // the smoother's third gate just changed: rebuild or destroy it now
  }
  applyPrefs();

  if (a11yBtn) a11yBtn.addEventListener('click', () => {
    a11y = !a11y; writePref(KEY_A11Y, a11y ? 'on' : 'off'); applyPrefs();
    schedule();   // the rail's mode changed with the attribute: repaint it on the next frame
  });
  if (motionBtn) motionBtn.addEventListener('click', () => {
    if (a11y) return;   // the switch above has the wheel; the note under it says why
    motion = !motion; writePref(KEY_MOTION, motion ? 'on' : 'off'); applyPrefs();
    schedule();
  });

  // ── THE RAIL'S ARITHMETIC ───────────────────────────────────────
  // One entry per section, reused every frame: this runs on scroll, so nothing in here allocates.
  // `len` is how much of the track a segment is given and `p` is how far the reader is through the
  // place that segment names. Since §16 there is exactly one place in the document at a time, so
  // every `len` is 1 (five equal lengths) and exactly one `p` is fractional — see `frame()`.
  const LINE      = 0.4;    // the reading line: 40% down the viewport, never the top edge
  const WIN       = sections.map(() => ({ start: 0, len: 1, p: 0 }));
  const shownLen  = sections.map(() => -1);   // the flex-grow each segment was last given
  const shownFill = sections.map(() => -1);   // ...and the scaleY each fill was last given
  let shownSteps  = -1;                       // the count painted last while motion was off

  // ONLY THE NUMBERS THAT CHANGED ARE WRITTEN. The fill is a transform for the same reason every
  // other moving thing on this page is: scaleY is resolved on the compositor, so a scroll that moves
  // the fill by a pixel never asks the page for a layout. Segment lengths move only when a section's
  // geometry does — a resize, a late font, the hero's photograph arriving.
  function setFill(i, v){
    const q = Math.round((v > 0 ? (v < 1 ? v : 1) : 0) * 1000) / 1000;
    if (shownFill[i] === q) return;
    shownFill[i] = q;
    if (fills[i]) fills[i].style.transform = 'scaleY(' + q + ')';
  }

  function paintTrack(completed){
    if (!track) return;
    for (let i = 0; i < segs.length; i++){
      const len = Math.round(WIN[i].len);
      if (len === shownLen[i]) continue;
      shownLen[i] = len;
      segs[i].style.flexGrow = String(len > 0 ? len : 1);
    }
    // MOTION OFF — or the system asking for less. The rail stops measuring and starts counting: the
    // sections behind the reading line are full, the one under it is not, and nothing is written
    // until that answer changes, so a page that asked for no movement gets no per-frame movement at
    // all — one step at each section boundary. It still ends full, because the last window ends on
    // the last scroll position, which is a section finished rather than entered.
    if (stillMotion()){
      if (completed === shownSteps) return;
      shownSteps = completed;
      for (let i = 0; i < fills.length; i++) setFill(i, i < completed ? 1 : 0);
      return;
    }
    shownSteps = -1;
    for (let i = 0; i < fills.length; i++) setFill(i, WIN[i].p);
  }
  // ── ONE PLACE AT A TIME (§16) ───────────────────────────────────────────────
  // Five lengths of travel only exist on a page that IS five sections stacked. The gate made the
  // page one view at a time, so the rail's question changed with it: not "how far through each of
  // five bands am I" but "which place am I in, and how far through THAT am I". The answer is one
  // active index and one fraction — the lengths behind it are full, the ones ahead are empty —
  // which is the same picture the breadcrumb paints in words, and it is why the five segments stay
  // equal now: the rail is a map of five places, not a chart of five heights.
  const idxOf = id => { for (let i = 0; i < sections.length; i++) if (sections[i].id === id) return i; return -1; };
  function inView(){ return !!(window.__ad && window.__ad.mode && window.__ad.mode() === 'view'); }
  function activeIdx(){
    if (inView()){
      const i = idxOf(window.__ad.place ? window.__ad.place() : '');
      if (i >= 0) return i;
      // a view with no remembered place: read the one section the document is actually made of
      for (let j = 0; j < sections.length; j++) if (sections[j].offsetHeight > 0) return j;
    }
    return 0;   // the cover and the index are the sheet, which is the first segment
  }
  function frame(){
    const y = Math.max(0, window.scrollY);
    const maxScroll = Math.max(0, rootEl.scrollHeight - window.innerHeight);
    const line = window.innerHeight * LINE;
    const active = activeIdx();
    let p = 0;
    if (!inView()){
      // THE FIRST SEGMENT IS THE GATE. Its length is the pin's own travel — the exact span the gate
      // module scrubs over — so the rail and the inks agree about how far through the fold the
      // reader is instead of each deriving it from a different number.
      const gateEl = document.getElementById('gate');
      const span = gateEl ? (gateEl.offsetHeight - window.innerHeight) : 0;
      p = span > 0 ? Math.min(1, Math.max(0, -gateEl.getBoundingClientRect().top / span)) : 0;
    } else {
      // ONE SECTION'S OWN TRAVEL. `start` is the scroll position that put its top on the reading
      // line; `end` is the one that puts its BOTTOM edge there — except for the last place, whose
      // window ends on the document's end, because the page cannot scroll past it and a rail that
      // never fills at the foot of the page is a rail that lies.
      const s = sections[active];
      const top = s.getBoundingClientRect().top + y;
      const last = active === sections.length - 1;
      const start = top - line;
      const end = last ? maxScroll : Math.max(start + 1, top + s.offsetHeight - line);
      p = (y - start) / Math.max(1, end - start);
      p = p > 1 ? 1 : (p > 0 ? p : 0);
    }
    for (let i = 0; i < sections.length; i++){
      WIN[i].len = 1;
      WIN[i].p = i < active ? 1 : (i === active ? p : 0);
    }
    let completed = 0;
    for (let i = 0; i < sections.length; i++) if (WIN[i].p >= 1) completed++;
    paintTrack(completed);
  }

  let queued = false;
  function schedule(){
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; frame(); });
  }
  // §16 — the gate calls this after a state change: the document it measured a moment ago has been
  // replaced by one section (or by the gate), so the rail's numbers are one frame stale. Exposed
  // as a named call rather than by dispatching a resize, because this must be SYNCHRONOUS: the
  // gate finishes a transition by re-measuring, and a queued frame would leave the rail a frame
  // behind the page it is drawing.
  window.__adRailMeasure = frame;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  // the hero's photograph arrives after first paint and every section below it moves with it, so one
  // late pass keeps the rail honest without measuring on a timer
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  window.addEventListener('load', schedule);
  // §16 — A ROW ON THE WALL CHANGES #reach's HEIGHT, and the rail's windows are that page's own
  // travel. js/ledger.js announces every repaint as `ad:layout` rather than the two files knowing
  // about each other; one more frame is all this costs.
  document.addEventListener('ad:layout', schedule);
  schedule();
  // ── THE DRAWER ──────────────────────────────────────────────────
  // A modal <dialog>, because the platform already owes us the parts that are easy to get wrong:
  // the top layer, the inert page behind it, the Tab ring, Escape, and the focus return. What it
  // does not do is animate in — the panel is `[open]` before it can have a start state — so the
  // slide class waits a frame (§05b), and what it does not do is stop the page behind it from
  // scrolling, which is why it asks syncScrollLock() the same question the wall and the folio do.
  const panel    = drawer;
  const gear     = document.getElementById('setOpen');
  const setClose = document.getElementById('setClose');
  let closeTimer = 0;

  function openDrawer(){
    if (!panel || panel.open) return;
    if (gear) gear.setAttribute('aria-expanded', 'true');
    if (typeof panel.showModal === 'function') panel.showModal();
    else panel.setAttribute('open', '');   // Safari < 15.4: no top layer, but the panel does open
    requestAnimationFrame(() => panel.classList.add('is-open'));
    syncScrollLock();
    // THE RETICLE MOVES INTO THE TOP LAYER. #cur is position:fixed at z-index 9999, and a modal
    // <dialog> paints in the top layer — above every z-index the page can write — so the mark would
    // sit behind the drawer it is the cursor for. Re-parented, not cloned: there is one mark, the
    // pointer loop keeps writing the same node's left/top, and it works in its new home with no
    // second code path. [data-a11y="on"] still hides it wherever it lives (§14).
    if (cur && cur.parentNode !== panel) panel.appendChild(cur);
    // showModal() already focuses the first control — the close button is deliberately first in the
    // markup — so this is a belt, not the braces: it also survives the fallback path above.
    if (setClose) setClose.focus({ preventScroll: true });
  }

  function closeDrawer(){
    if (!panel || !panel.open) return;
    if (gear) gear.setAttribute('aria-expanded', 'false');
    panel.classList.remove('is-open');
    clearTimeout(closeTimer);
    const finish = () => {
      clearTimeout(closeTimer);
      if (!panel.open) return;
      if (typeof panel.close === 'function') panel.close();
      else {
        panel.removeAttribute('open');
        if (cur && cur.parentNode !== document.body) document.body.appendChild(cur);
        syncScrollLock();
        schedule();
      }
    };
    // the slide out is 0.36s (§05b); the panel must not sit invisible-but-open waiting for a
    // transitionend that a killed duration would never send, so the timer is the authority and
    // motion-off skips the wait entirely
    if (stillMotion()) finish();
    else closeTimer = setTimeout(finish, 380);
  }
  if (panel){
    if (gear) gear.addEventListener('click', () => { if (panel.open) closeDrawer(); else openDrawer(); });
    if (setClose) setClose.addEventListener('click', closeDrawer);
    // Escape arrives as `cancel` first, and intercepting it is what lets the panel slide out instead
    // of vanishing. The `close` listener below then lands on the same cleanup whether the panel was
    // dismissed natively or by this module.
    panel.addEventListener('cancel', e => { e.preventDefault(); closeDrawer(); });
    panel.addEventListener('close', () => {
      panel.classList.remove('is-open');
      if (gear) gear.setAttribute('aria-expanded', 'false');
      // the mark goes home with the page it belongs to, so the next open moves it again rather than
      // leaving a fixed node inside a closed display:none dialog
      if (cur && cur.parentNode !== document.body) document.body.appendChild(cur);
      syncScrollLock();
      if (gear) gear.focus({ preventScroll: true });
    });
    // THE THIRD WAY OUT: a press on the backdrop. The dialog box is the panel itself (inset:0 0 0
    // auto), so a click whose target is the dialog is a click on the field behind it — the
    // ::backdrop takes no element of its own.
    panel.addEventListener('click', e => { if (e.target === panel) closeDrawer(); });
  }
})();

// ═══════════════════════════════════════════════════
// THE GATE (§16) — cover / index / view
// ═══════════════════════════════════════════════════
// ONE STATE, WRITTEN ONCE. `html[data-mode]` is the whole machine: the stylesheet says what each
// state looks like (§16) and this module is the only writer, exactly as the phase (§05) has one
// writer in the observer above. Nothing here adds a class to a node, so there is no second place a
// state could be read from.
//
// WHAT EACH STATE MEANS, AND WHY THE BOUNDARIES ARE WHERE THEY ARE:
//   cover   the fold: `#gate` is exactly one screen and `window.scrollY` is 0. The head is hidden —
//           a navigation bar printed across the top of a poster is the one piece of chrome this
//           sheet cannot justify.
//   index   the SAME one screen, contents side out: the module tweened its own progress from 0 to 1
//           over 0.85s (0.7s on a phone), and from 0.30 the four blocks at the fold MORPH INTO the
//           four plates — each plate scales out of its own block, which already wears the ink the
//           plate rests in. The type is counter-scaled by exactly 1/scale so it never stretches, and
//           it staggers up from 0.78. The head is still hidden: the index is a contents page, not
//           the site.
//   view    a place was CHOSEN. The gate is not rendered, exactly one `[data-view]` section is, the
//           footer is back, and the head sits over them at `--head-h`.
//
// NOTHING CAN STOP HALF WAY. `state.p` is an OWNED number — 0 for the cover, 1 for the index — and
// `commit()` is its only writer. No scroll position means anything inside the gate, so nothing in
// the document can put the plates at a third position. That is also why `readMode()` can answer
// from `mode` alone: the geometry has one answer in both states, so the state itself is the honest
// source.
//
// THE HARD STOP IS A HEIGHT, NOT A GUARD. In the cover and the index the four sections and the
// footer are collapsed to `height:0` and clipped (stylesheet, §16), so the page physically ends on
// the gate's last pixel: there is nothing below the contents to scroll into and no handler is
// fighting the reader. A view swaps which node is folded away, which is the same rule in the other
// direction. `view` is therefore UNREACHABLE BY SCROLLING — only a press, a deep link or `popstate`
// enters it. `inert` is written here, not by the stylesheet, because it is a statement about the
// reader's focus rather than about the box.
//
// THE ROUTE TOKEN. Every transition that waits on an animation takes a generation number before it
// starts and refuses to write anything if a newer route has begun. A flood is 450ms of ink, a commit
// is 850ms of morph and a reader can press two blocks inside either: without the token the second
// press would be applied under the first one's animation and the page would end up wherever the
// slower tween finished. `state.token` is that number for the gate; `gen` is its twin for the flood.
(function(){
  const gate     = document.getElementById('gate');
  const stage    = document.getElementById('gateStage');
  const panels   = document.getElementById('indexPanels');
  const board    = gate.querySelector('.metroboard');
  const peek     = document.getElementById('pullPeek');
  const floodEl  = document.getElementById('flood');
  const proxyEl  = document.getElementById('floodProxy');
  const views    = Array.from(document.querySelectorAll('[data-view]'));
  if (!gate || !views.length) return;

  const PLACES = views.map(s => s.dataset.view).filter(Boolean);
  const isPlace = id => !!id && PLACES.indexOf(id) >= 0;

  // ── THE PULL-UP'S OWN CONSTANTS ────────────────────────────────────────────
  // `COMMIT` is raw finger travel, not the drawer's displacement: the drawer is a rubber band
  // (see `rubber()`), so tying the decision to the drawn distance would make a stiff phone need
  // three times the gesture a soft one did. 110px is a thumb's comfortable half-swipe.
  const PULL_COMMIT = 110;
  const PULL_START  = 12;    // below this a vertical drag is a scroll and must stay one

  let mode = '';            // '' until the first paint, so the first setMode always writes
  let place = '';           // the place last chosen, so BACK TO INDEX can put the focus back on it
  let gen = 0;              // the route token
  let shownP = null;        // the last `--gate-p` written, as a string
  let shownReveal = false;
  let armed = false;
  let painted = false;
  let inkLast = '';         // the last `--flood` colour, re-applied after clearProps

  function setMode(next){
    if (mode === next) return;
    mode = next;
    rootEl.setAttribute('data-mode', next);
    shape();
  }

  // ── THE DOCUMENT'S SHAPE, WRITTEN FROM THE MODE ────────────────────────────
  // This is the hard stop (§16). The stylesheet folds the broadsheet away in the gate's two states
  // (zero height, clipped) so the document ends on the gate's last pixel, and unfolds exactly one
  // section in a view. What the stylesheet cannot say is which of those boxes the READER may reach:
  // that is `inert` — out of the tab ring, out of the accessibility tree, out of hit-testing — and it
  // is one attribute per section, written from the same single `mode` variable as the attribute on
  // <html> so the two can never disagree.
  function shape(){
    gate.hidden = mode === 'view';
    for (const s of views){
      const live = mode === 'view' && s.dataset.view === place;
      if (live){ s.removeAttribute('inert'); s.removeAttribute('aria-hidden'); }
      else { s.setAttribute('inert', ''); s.setAttribute('aria-hidden', 'true'); }
    }
  }

  function setReveal(on){
    if (!panels || on === shownReveal) return;
    shownReveal = on;
    if (on){
      // the doors become real on the frame they are drawn: `inert` and `aria-hidden` are lifted
      // together with the attribute the stylesheet fades in on, so a keyboard and a screen reader
      // are offered exactly the four panels a sighted reader can see
      panels.removeAttribute('inert');
      panels.removeAttribute('aria-hidden');
      panels.setAttribute('data-revealed', '');
    } else {
      panels.setAttribute('inert', '');
      panels.setAttribute('aria-hidden', 'true');
      panels.removeAttribute('data-revealed');
    }
  }
  function armPeek(on){
    if (!peek || on === armed) return;
    armed = on;
    if (on) peek.setAttribute('data-armed', '');
    else peek.removeAttribute('data-armed');
  }

  // ── ONE PROGRESS NUMBER, ONE WRITER (§16d) ─────────────────────────────────
  // `p` is the index's own position: 0 the cover, 1 the contents, and something between only while
  // a commit is running. `proxy.p` is the object GSAP tweens; `p` copies it on every update, so
  // anything reading `state` never sees a tween's internal value. `token` is the generation counter:
  // a newer commit, a route or a view invalidates every write the older tween would still make.
  const state = { p: 0, transitioning: false, token: 0, proxy: { p: 0 } };

  // THE ONE TRANSITION. `next` is 'index' or 'cover' and `to` is the number it means. Everything that
  // can move the gate between its two states comes through here — a wheel tick, a thumb, an arrow
  // key, ← INDEX, the brand, BACK TO INDEX, the pull-up, and the harness — so there is exactly one
  // answer to "what does this state look like half way through".
  //
  // A SNAP WHEN THERE IS NOTHING TO PERFORM: Motion off, no GSAP (a CDN that never arrived), or an
  // `instant` route (a deep link, a popstate, a probe). The progress and the morph are written, the
  // document is measured and the page is parked — no tween, no token, nothing left running.
  //
  // OTHERWISE the state is committed at the START: `data-mode` on the first frame is what lets the
  // head hide, the sections fold and the plates take the screen inside the same paint the tween
  // begins. The smoother is stopped first so it cannot fight the `jumpTo(0)` at the end, and the one
  // number is tweened from wherever it currently stands — a second tick started mid-flight continues
  // from the interrupted position instead of jumping back to 0.
  function commit(next, opts){
    opts = opts || {};
    const to    = next === 'index' ? 1 : 0;
    const token = ++state.token;
    const settle = () => {
      state.transitioning = false;
      state.p = to;
      state.proxy.p = to;
      writeP(to);
      applyMorph(to);
      setReveal(to === 1);     // a keyboard is offered the four doors the moment they are finished
      paint();                 // publish `--gate-p` and let the sheet take its frame
      measureAll();            // the swap changed the document's length, not only the plates
      if (smoothLenis && typeof smoothLenis.resize === 'function'){ try { smoothLenis.resize(); } catch(e){} }
      jumpTo(0);
      startSmooth();
      // the route's own incidentals (history, focus) land on the finished state, never mid-flight
      if (opts.done){ try { opts.done(); } catch(e){} }
    };
    if (opts.instant || stillMotion() || !window.gsap){
      state.transitioning = false;
      setMode(next);
      settle();
      return;
    }
    state.transitioning = true;
    stopSmooth();
    setMode(next);
    const g = window.gsap;
    g.killTweensOf(state.proxy);
    state.proxy.p = state.p;
    g.to(state.proxy, {
      p: to,
      duration: window.matchMedia('(max-width:767.98px)').matches ? 0.7 : 0.85,
      ease: 'power3.inOut',
      overwrite: true,
      onUpdate(){
        if (token !== state.token) return;
        state.p = state.proxy.p;
        paint();
      },
      onComplete(){
        if (token !== state.token) return;
        settle();
      },
    });
  }

  // `readMode` answers the state the module last wrote. It used to re-derive the answer from the
  // gate's top edge on every scroll; with the gate exactly one screen tall there is no second
  // geometric opinion left to ask for — both states are at y 0 — so the state itself is the honest
  // source, and `view` is still never reachable from here.
  function readMode(){
    return mode === 'view' ? 'view' : mode;
  }
  function atEnd(){
    return window.scrollY + window.innerHeight >= rootEl.scrollHeight - 4;
  }

  // ── THE SHEET'S OWN DEPTHS READ THIS ───────────────────────────────────────
  // §06's parallax, skew, dust and ratchet are written by the sheet's frame, which needs to know how
  // far through the fold the reader is. It cannot ask `window.scrollY` any more: the sheet is PINNED,
  // so a scroll offset no longer means "how far down the sheet". `-1` is the frozen value for a view,
  // where the sheet is not rendered at all.
  function publish(p){
    window.__adGateP = (mode === 'view') ? -1 : p;
  }
  // ONE NUMBER, ONE READER. `publish()` is called from `paint()` on every frame it runs — after the
  // morph has been written in the gate's two states, and first in the view branch, where the answer
  // is the frozen `-1` — so `window.__adGateP` is never a frame behind the sheet that is drawn. The
  // sheet's own frame (§06) reads the global directly to stay off the call stack; `sheetPos(heroH)`
  // — declared once, above the sheet's frame — is the same number in pixels, for the parallax, the
  // ratchet and anything that probes the sheet. There is no second derivation of it anywhere.

  // ── THE INK, WRITTEN ONLY WHEN IT MOVES ────────────────────────────────────
  // `--gate-p` is the gate's progress as ONE number on the stage. It stays the module's published
  // contract (SF.4 measures it) even though the plates are driven by their own rectangles rather
  // than by a CSS scale. Under Motion off it is REMOVED rather than set to 0: the same thing to
  // `var(--gate-p,0)`, and one less style write per frame on a page that asked for a still sheet.
  function writeP(p){
    const v = stillMotion() ? '' : String(Math.round(p * 1000) / 1000);
    if (v === shownP) return;
    shownP = v;
    if (v) stage.style.setProperty('--gate-p', v);
    else stage.style.removeProperty('--gate-p');
  }

  // ── THE MORPH: THE DOCKED BAR IS THE CONTENTS ──────────────────────────────
  // The index used to grow four inks behind the pinned sheet and then fade four cards in over them.
  // That is a crossfade between two objects, and the reader has to be told which is which. It is now
  // ONE object: the strip of blocks at the fold IS the contents page seen from across the room, so
  // the opening is a MOVE — each block's rectangle travels to one quarter of the screen and becomes
  // that quarter's plate. The plate RESTS in the block's own `--pop`, so the ink does not change on
  // the way and nothing has to be bleached: only the size does, and the type is counter-scaled.
  // FOUR NUMBERS PER PLATE, TAKEN ONCE. The block's rectangle and the plate's own quarter, both in
  // the panels container's coordinate space, so no frame derives anything from a scroll position
  // (there is none any more) and the two reads can never disagree about where the stage is standing.
  // THE TYPE MUST NOT STRETCH. A block is ~360x80 and a plate is ~720x450, so a plain scale would
  // squash the words by the same factor. The fix is exact rather than approximate: `.ip-inner` is
  // scaled by `1 / sx, 1 / sy` about the same `0 0` origin, so `sx * (1/sx)` is 1 on every single
  // frame. SM.2 multiplies the two scales; SM.4 measures the ink box's aspect against its
  // untransformed aspect.
  // MEASURED ONLY WHERE THE NUMBER CANNOT LIE. `getBoundingClientRect` on a transformed element is
  // the TRANSFORMED box, so the plates are read through `offsetWidth/offsetHeight/offsetLeft/
  // offsetTop` — layout numbers, true under any transform — and the blocks are read once, at rest.
  // Every event that can move a layout (a resize, an orientation, a webfont, a row on the wall)
  // empties the cache, and the next frame of a morph takes it again.
  const MORPH_START = 0.30;   // the docked bar folds here and the plates take the screen over
  const MORPH_END   = 0.78;   // here the plates have arrived, the boxes hold, and the type begins
  const STAGGER     = 0.11;   // each line of a plate starts this much of the reveal window later
  const LINES       = ['.ip-num', '.ip-t', '.ip-teaser', '.ip-meta'];

  const PLATES = panels ? Array.from(panels.querySelectorAll('.index-panel')).map(el => ({
    el,
    inner: el.querySelector('.ip-inner'),
    frame: el.querySelector('.ip-frame'),
    lines: LINES.map(sel => el.querySelector(sel)),
  })) : [];
  const SEAM_V = panels ? panels.querySelector('.ip-seam-v') : null;
  const SEAM_H = panels ? panels.querySelector('.ip-seam-h') : null;

  let srcRect = [];        // .metro-block rectangles, in the panels container's coordinates
  let dstRect = [];        // .index-panel LAYOUT rectangles, in the same space
  let plateState = '';     // 'off' | 'snap' | 'run' — what is written on the plates right now
  let foldOn = null;       // the board's `data-fold`, cached so the attribute is written once
  let platesOn = null;     // the container's visibility, cached for the same reason

  const r3 = n => Math.round(n * 1000) / 1000;
  const r4 = n => Math.round(n * 10000) / 10000;
  const eases = {};
  // GSAP's own curves, asked for by name, each with an arithmetic twin so the morph still runs if
  // the core never arrived. Resolved on the first frame that needs them, then remembered.
  function ease(name, twin){
    const hit = eases[name];
    if (hit) return hit;
    let fn = twin;
    if (window.gsap && window.gsap.parseEase){
      try { fn = window.gsap.parseEase(name) || twin; } catch(e){}
    }
    eases[name] = fn;
    return fn;
  }

  function cacheMorphRects(){
    if (!panels || !PLATES.length) return;
    const pr = panels.getBoundingClientRect();
    srcRect = []; dstRect = [];
    const blocks = board ? Array.from(board.querySelectorAll('.metro-block')) : [];
    for (let i = 0; i < blocks.length; i++){
      const r = blocks[i].getBoundingClientRect();
      srcRect.push({ x: r.left - pr.left, y: r.top - pr.top,
                     w: Math.max(1, r.width), h: Math.max(1, r.height) });
    }
    for (let i = 0; i < PLATES.length; i++){
      const el = PLATES[i].el;
      // the LAYOUT box: `offsetParent` is the panels container, which is positioned and never
      // transformed, so a destination measured here survives any transform on the plate itself
      dstRect.push({ x: el.offsetLeft, y: el.offsetTop,
                     w: Math.max(1, el.offsetWidth), h: Math.max(1, el.offsetHeight) });
    }
  }
  function invalidateMorph(){ srcRect = []; dstRect = []; }

  function foldBoard(on){
    if (!board || on === foldOn) return;
    foldOn = on;
    if (on) board.setAttribute('data-fold', '');
    else board.removeAttribute('data-fold');
  }
  // `visibility` and `pointer-events` are turned on here rather than by a CSS attribute, because the
  // state below p 0.30 has to cost the page NOTHING: a subtree that is laid out (so its quarters can
  // be measured) but neither painted nor hit-tested.
  function showPlates(on){
    if (!panels || on === platesOn) return;
    platesOn = on;
    panels.style.visibility = on ? 'visible' : '';
    panels.style.pointerEvents = on ? 'auto' : '';
  }
  // 'off' — the cover and every view: nothing written on the plates at all, so they are exactly the
  // stylesheet's object and the docked bar is the only contents on screen.
  function resetPlates(){
    plateState = 'off';
    for (const t of PLATES){
      t.el.style.transform = '';
      if (t.inner) t.inner.style.transform = '';
      if (t.frame) t.frame.style.opacity = '';
      for (const l of t.lines) if (l){ l.style.opacity = ''; l.style.transform = ''; }
    }
    if (SEAM_V) SEAM_V.style.transform = '';
    if (SEAM_H) SEAM_H.style.transform = '';
  }
  // 'snap' — the finished page in ONE frame: identity scale, the key line and the type at full
  // strength over the plate's own resting ink. It is where the morph ends, and it is also where
  // Motion off begins: the four doors arrive in one frame and never travel to get there.
  function snapPlates(){
    plateState = 'snap';
    for (const t of PLATES){
      t.el.style.transform = '';
      if (t.inner) t.inner.style.transform = '';
      if (t.frame) t.frame.style.opacity = '1';
      for (const l of t.lines) if (l){ l.style.opacity = ''; l.style.transform = ''; }
    }
    if (SEAM_V) SEAM_V.style.transform = 'scaleY(1)';
    if (SEAM_H) SEAM_H.style.transform = 'scaleX(1)';
  }
  // THE REVEAL, IN FOUR LINES PER PLATE. `r` is 0 at 0.78 and 1 at the end of the scrub; each line
  // starts a little after the one above it, so a plate is read in the order it is written — the
  // number, the title, the work, the way in — instead of arriving as one slab.
  function revealLines(r){
    const up   = ease('power3.out', x => 1 - Math.pow(1 - x, 3));
    const door = ease('expo.out', x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
    for (const t of PLATES){
      for (let i = 0; i < t.lines.length; i++){
        const el = t.lines[i];
        if (!el) continue;
        const start = i * STAGGER;
        let local = r <= start ? 0 : (r - start) / (1 - start);
        if (local > 1) local = 1;
        const v = i === 0 ? door(local) : up(local);
        el.style.opacity = String(r3(v));
        el.style.transform = v >= 1 ? '' : 'translate3d(0,' + r3((1 - v) * 0.6) + 'em,0)';
      }
    }
  }

  // ── THE FRAME ──────────────────────────────────────────────────────────────
  // Called from `paint()`, so it is already inside a requestAnimationFrame and there is exactly one
  // writer of these styles per frame. `q` is 0 in a view: the gate is not rendered there, and a
  // plate left mid-morph would be the first thing the reader saw on the way back to the cover.
  function applyMorph(p){
    if (!panels || !PLATES.length) return;
    const still = stillMotion();
    const q = (mode === 'view') ? 0 : p;

    // 0.00 < p < 0.30 — THE DOCKED BAR HOLDS THE SCREEN. The plates are laid out (they have to be,
    // or their quarters would measure zero) and invisible, and nothing at all is written on them.
    if (q < MORPH_START){
      foldBoard(false);
      showPlates(false);
      if (plateState !== 'off') resetPlates();
      return;
    }

    // p = 0.30 — THE FOLD, in one frame and two writes: the docked bar leaves the screen and the
    // four plates appear in ITS OWN RECTANGLES, so crossing this line changes nothing that is drawn.
    foldBoard(true);
    showPlates(true);

    if (still){
      // Motion off: no interpolation and no stagger. The plates are the contents page already; the
      // only thing the scroll changes is that they become reachable, and `setReveal` says so.
      if (plateState !== 'snap') snapPlates();
      return;
    }

    if (!srcRect.length || !dstRect.length) cacheMorphRects();
    if (!srcRect.length || !dstRect.length){ if (plateState !== 'snap') snapPlates(); return; }

    // 0.30 < p ≤ 0.78 — THE BOX MOVES. One eased scalar for the whole gesture, shared by the
    // plate's translate and its two scales, so the block's four edges arrive at the quarter's four
    // edges together and the rectangle never passes through a shape that is off the way there.
    let t = (q - MORPH_START) / (MORPH_END - MORPH_START);
    if (t < 0) t = 0; if (t > 1) t = 1;
    const e = ease('power2.inOut',
      x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)(t);
    plateState = 'run';

    for (let i = 0; i < PLATES.length; i++){
      const s = srcRect[i < srcRect.length ? i : srcRect.length - 1];
      const d = dstRect[i < dstRect.length ? i : dstRect.length - 1];
      if (!s || !d) continue;
      // `sX`/`sY` are the OUTER scale, and they are the rounded values the inverse is taken from,
      // so `sX * innerX` is 1 to four decimal places instead of 1 to whatever the rounding left.
      const sX = r4(1 + (s.w / d.w - 1) * (1 - e));
      const sY = r4(1 + (s.h / d.h - 1) * (1 - e));
      const px = r3((s.x - d.x) * (1 - e));
      const py = r3((s.y - d.y) * (1 - e));
      const pl = PLATES[i];
      pl.el.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0) scale(' + sX + ',' + sY + ')';
      if (pl.inner) pl.inner.style.transform = 'scale(' + r4(1 / sX) + ',' + r4(1 / sY) + ')';
      if (pl.frame) pl.frame.style.opacity = String(r3(e));
    }
    if (SEAM_V) SEAM_V.style.transform = 'scaleY(' + r3(e) + ')';
    if (SEAM_H) SEAM_H.style.transform = 'scaleX(' + r3(e) + ')';

    // 0.78 < p ≤ 1.00 — THE TYPE ARRIVES. The boxes have stopped, so the last fifth of the scrub is
    // the plate being READ rather than moved.
    let r = (q - MORPH_END) / (1 - MORPH_END);
    if (r < 0) r = 0; if (r > 1) r = 1;
    revealLines(r);
  }

  function paint(){
    painted = true;
    // A VIEW IS NOT A PROGRESS. Once the gate has left the document its plates are not rendered at
    // all, so the frame's only job is the pull-up's arming — and the published number is the frozen
    // `-1` the sheet's depths read as "rest".
    if (mode === 'view'){
      publish(-1);
      armPeek(atEnd());
      applyMorph(0);          // the plates go back to the cover's state, so coming back never flashes
      return;
    }
    const p = state.p;
    writeP(p);
    applyMorph(p);
    // THE DOORS BECOME REAL WHEN THEY ARE DRAWN. 0.98 under motion, so a keyboard is never offered
    // a plate that is still travelling; 0.31 under Motion off, where the plates are finished on the
    // first frame of the commit and only the attribute is left to write.
    setReveal(p >= (stillMotion() ? 0.31 : 0.98));
    armPeek(false);
    publish(p);
    // §16d — THE SHEET'S FRAME IS DRIVEN FROM HERE. Nothing scrolls inside the gate any more, so no
    // `scroll` event fires while a commit tweens the plates from 0 to 1; the parallax, the ratchet
    // and the drum drift read `window.__adGateP` through `sheetPos()` and need one frame per update.
    scheduleFx();
  }

  // ── THE FLOOD ──────────────────────────────────────────────────────────────
  // THE INK LEAVES THE THING YOU PRESSED. A flood that rises from the bottom edge of the screen says
  // "the page is changing"; a flood that starts as the exact rectangle of the block under your thumb
  // says "THIS block is the door". So the plane is seeded to the pressed element's own box and
  // Flip-fit back to the viewport (#floodProxy's bounds) over 450ms, all of it a transform:
  // `scale:true` keeps it on the compositor, so not one frame of the swap behind it lays out.
  // The swap happens inside `onComplete`, so the DOM is never painted half-way — by the time the
  // document changes length the screen is one flat ink.
  // MOTION OFF OR NO GSAP: `apply()` runs immediately and the plane is never touched. A route is
  // still a route; it simply does not perform.
  function move(ink, rect, apply){
    const my = ++gen;
    if (!floodEl || stillMotion() || !window.gsap){ apply(); return; }
    const g = window.gsap;
    g.killTweensOf(floodEl);
    inkLast = ink || '';
    if (inkLast) floodEl.style.setProperty('--flood', inkLast);
    const vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    // no source element (a deep link, Escape, the pull-up) → a sliver at the foot of the screen,
    // which is the honest answer: something happened at the page's edge, not at a block.
    const r = rect || { left: vw / 2, top: vh - 1, width: 1, height: 1 };
    g.set(floodEl, {
      visibility: 'visible', opacity: 1, transformOrigin: '0 0',
      x: r.left, y: r.top,
      scaleX: Math.max(1, r.width) / vw, scaleY: Math.max(1, r.height) / vh,
    });
    const swap = function(){
      if (my !== gen) return;                 // a newer route owns the screen now
      apply();
      g.set(floodEl, { x: 0, y: 0, scaleX: 1, scaleY: 1 });
      g.to(floodEl, { opacity: 0, duration: 0.34, ease: 'power2.out', delay: 0.05,
        onComplete(){ if (my === gen) releaseFlood(); } });
    };
    // Flip.fit measures the plane where it is and where the proxy is, and animates between the two.
    // The proxy is `inset:0`, so "where the proxy is" is the viewport — one declaration in the
    // stylesheet, no second copy of the viewport's size in the script.
    if (window.Flip && proxyEl && window.Flip.fit){
      window.Flip.fit(floodEl, proxyEl, { scale: true, duration: 0.45, ease: 'power4.inOut', onComplete: swap });
    } else {
      g.to(floodEl, { x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.45, ease: 'power4.inOut', onComplete: swap });
    }
  }
  // The plane goes back to being the stylesheet's own object: `scaleY(0)` from its bottom edge, so
  // the next flood starts from a box that is exactly the viewport and not from the last route's
  // leftovers. `--flood` is a custom property GSAP does not manage, but it is re-applied anyway so
  // the colour of the last door is still the colour the sheet is holding.
  function releaseFlood(){
    if (!floodEl || !window.gsap) return;
    window.gsap.set(floodEl, { clearProps: 'all' });
    const back = inkLast || (floodEl.style.getPropertyValue('--flood') || '');
    if (back) floodEl.style.setProperty('--flood', back);
  }
  // ONE WRITER FOR THE SCROLL POSITION. Lenis keeps its own target, so a native jump while the
  // smoother is running would be animated back to where Lenis thought it was; `immediate` moves the
  // smoother's target with the page and `force` makes it do so even while stopped.
  function jumpTo(top){
    const y = Math.max(0, Math.round(top));
    if (smoothLenis){ try { smoothLenis.scrollTo(y, { immediate: true, force: true }); } catch(e){} }
    window.scrollTo({ top: y, behavior: 'instant' });
  }
  function stopSmooth(){ if (smoothLenis){ try { smoothLenis.stop(); } catch(e){} } }
  function startSmooth(){ if (smoothLenis){ try { smoothLenis.start(); } catch(e){} } }

  // ── EVERY SURFACE, RE-MEASURED AFTER A STATE CHANGE ───────────────────────
  // A state change swaps whole sections in and out of the layout, so every number the page holds —
  // the rail's windows, the sheet's fit, the sticker bounds, the FX cache — belongs to a document
  // that no longer exists. One named function, called once at the end of every transition, is the
  // only honest way to say that.
  function measureAll(){
    if (mode !== 'view' && heroInited){ fitName(); alignStickers(); collectFx(); }
    if (typeof window.__adRailMeasure === 'function'){ try { window.__adRailMeasure(); } catch(e){} }
    // the plates' quarters and the blocks they grow out of belong to the document that was just
    // swapped in, so the morph cache is taken again here — and never in a view, where the gate is
    // not laid out at all and every rectangle in it would read zero
    if (mode !== 'view') cacheMorphRects();
    scheduleFx();
    schedule();
  }

  // ── A PLACE ────────────────────────────────────────────────────────────────
  // The heading of the section is focused, not the section: `tabindex="-1"` is added the first
  // time so a keyboard or screen-reader visitor lands on the title of the place they chose and
  // their next Tab walks its content. `preventScroll` because the scroll has already happened.
  function focusPlace(id){
    const t = document.getElementById(id);
    if (!t) return;
    const h = t.querySelector('h1, h2, h3');
    if (!h) return;
    if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1');
    try { h.focus({ preventScroll: true }); } catch(e){}
  }
  // the ink of a place, when there is no DOM node to read it from (a deep link, a popstate)
  function popOf(id){
    const b = gate.querySelector('.metro-block[data-nav-for="' + id + '"]');
    return b ? getComputedStyle(b).getPropertyValue('--pop').trim() : '';
  }

  // ── ONE VIEW ───────────────────────────────────────────────────────────────
  // The ONLY way into `view`, and it is always a transaction: flood from the thing that was
  // pressed → swap the document's shape → park the new page at its top → focus the title. If the
  // reader is already in a view this is a switch, not an entry: the gate is already gone and the
  // scroll is already at the top, so the same code path does the right thing without a second one.
  // `instant` is for arrival — a deep link has no state to leave, and an animation on arrival is a
  // greeting nobody asked for.
  function openView(id, srcEl, push, instant){
    if (!isPlace(id)) return false;
    place = id;
    // A VIEW OWNS THE SCREEN FROM THIS FRAME: any commit still tweening is invalidated here, or its
    // `onUpdate` would keep writing plate transforms under the ink of the flood.
    state.token++;
    state.transitioning = false;
    const ink = srcEl ? getComputedStyle(srcEl).getPropertyValue('--pop').trim() : popOf(id);
    const rect = srcEl ? srcEl.getBoundingClientRect() : null;
    const apply = () => {
      setMode('view');
      // A SWITCH IS NOT A STATE CHANGE. `setMode` short-circuits when the attribute already says
      // `view`, so the shape has to be re-applied by name: without this, opening a second place
      // while already in a view would leave the section you asked for `display:none` and the one
      // you left on the page.
      shape();
      jumpTo(0);                       // the chosen section IS the document: its top is y 0
      setReveal(false);
      applyMorph(0);                   // the plates fold back to the cover's state under the ink
      measureAll();
      if (push && window.history && history.pushState){
        try { history.pushState({ place: id }, '', '#' + id); } catch(e){}
      }
      // FOCUS FOLLOWS A GESTURE, NOT A PROBE. A press lands the reader on the title of the place
      // they chose; a `__ad.view()` from the suite must leave the tab position alone, or the next
      // Tab continues from a heading nobody tabbed to.
      if (push) focusPlace(id);
      publish(-1);
      startSmooth();
    };
    if (instant || mode === 'view'){ apply(); return true; }
    stopSmooth();
    move(ink, rect, apply);
    return true;
  }

  // ── THE INDEX, AND THE COVER ───────────────────────────────────────────────
  // Both are thin now: the state change itself is `commit()`'s job, and the only things left to
  // decide here are a route's own incidentals — the ink that leaves a view, the history entry and
  // the focus. BACK TO INDEX arrives on the finished contents page and puts the focus back on the
  // door the reader left through; the brand arrives on the cover and hands the focus to the block
  // that names the place they came from.
  function focusIndexDoor(){
    if (!panels) return;
    const p = (place && panels.querySelector('[data-open-view="' + place + '"]'))
           || panels.querySelector('.index-panel');
    if (p) try { p.focus({ preventScroll: true }); } catch(err){}
  }
  function focusBoardBlock(){
    const b = (place && gate.querySelector('.metro-block[data-nav-for="' + place + '"]'))
           || gate.querySelector('.metro-block');
    if (b) try { b.focus({ preventScroll: true }); } catch(err){}
  }

  function showIndex(push, instant){
    const done = () => {
      if (!push) return;
      if (window.history && history.pushState){
        try { history.pushState({ place: 'index' }, '', '#index'); } catch(err){}
      }
      focusIndexDoor();
    };
    // already there (or a probe): the answer, in one frame
    if (instant || mode === 'index'){ commit('index', { instant: true, done }); return; }
    // OUT OF A VIEW: a route, not a morph — the ink leaves the page's foot and the contents are
    // already finished when it lifts. There is nothing on screen to morph from.
    if (mode === 'view'){
      stopSmooth();
      move('', null, () => commit('index', { instant: true, done }));
      return;
    }
    // FROM THE COVER: the plates ARE the story — the four blocks grow into the four quarters.
    commit('index', { done });
  }
  function showCover(push, instant){
    const done = () => {
      if (!push) return;
      if (window.history && history.pushState){
        try { history.pushState({ place: 'cover' }, '', location.pathname + location.search); } catch(err){}
      }
      focusBoardBlock();
    };
    if (instant || mode === 'cover'){ commit('cover', { instant: true, done }); return; }
    if (mode === 'view'){
      stopSmooth();
      move('', null, () => commit('cover', { instant: true, done }));
      return;
    }
    commit('cover', { done });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // THE GATE IS A DECISION, NOT A DISTANCE (§16d)
  // ═══════════════════════════════════════════════════════════════════════════
  // ── one tick, because there is no half-open index to protect ──
  // One tick is enough: `#gate` is exactly one
  // screen, so `window.scrollY` is 0 in both of its states and the gate owns its progress in
  // `state.p`. A commit is cheap to undo — the opposite tick plays the same tween back over the
  // same 0.85s.
  //
  // WHAT COUNTS AS A DECISION: one wheel notch, one thumb, one arrow key. `INTENT_COOLDOWN` is the
  // only guard kept from the old flick layer — a trackpad's inertia keeps producing notches after
  // the hand has stopped, and without it one throw would open and close the contents twice.
  //
  // THE SIGN IS THE WHOLE REASON THIS IS A PLUGIN. In Observer, `onDown` is `deltaY > 0` — the wheel
  // turned down. On a touchscreen the same intent (the page advancing) is a thumb moving UP, which
  // arrives as `onUp`, because a finger's y DECREASES. So each handler asks whether the event came
  // from a finger and flips the sign:
  //     onDown + wheel   → +1   (the wheel turned down)
  //     onUp   + finger  → +1   (the thumb thrown up)
  //     onUp   + wheel   → −1   (the wheel turned up)
  //     onDown + finger  → −1   (the thumb pulled down)
  // and ±1 is the whole contract: +1 is `commit('index')` — the contents — and −1 is
  // `commit('cover')` — the poster. Without the flip a phone would be exactly backwards, which is
  // the one bug a wheel-driven suite could never catch. A finger is either a `touch*` event or a
  // pointer that says `pointerType: "touch"`, because Observer wires "touch" through the POINTER
  // stream on a device that has one — a Windows touchscreen laptop, where `touchmove` never fires.
  //
  // THE GATE CLAIMS ITS OWN GESTURES. `preventDefault:true` (with `overscroll-behavior:none` in the
  // stylesheet) is what stops a wheel at the fold from ALSO being answered by the browser: the gate
  // has nothing to scroll in either state, so a gesture it has decided to act on must not raise a
  // rubber-band bounce on the same frame. `allowClicks:true` keeps the four blocks pressable. A view
  // is exempt — it has its own scroll and its own doors (Escape, BACK TO INDEX, the pull-up) — and so
  // is anything that owns the gesture itself: a form field, or a `[data-lenis-prevent]` panel.
  const INTENT_COOLDOWN = 650;   // ms; a trackpad's inertia must not commit twice on one throw
  let lastIntent = 0;

  // an overlay owns the screen while it is open, exactly as it owns Escape (§09)
  function busy(){
    const s = document.getElementById('setPanel'), a = document.getElementById('artOverlay'),
          l = document.getElementById('lfModal');
    return !!((s && s.open) || (a && a.classList.contains('open')) || (l && l.classList.contains('open')));
  }
  // …and so does anything that reads the gesture itself. Checked on the event's own target, so a
  // wheel over a field is a value change and stays one.
  function ownsGesture(ev){
    if (busy()) return true;
    const t = ev && ev.target;
    if (!t || !t.closest) return false;
    return !!t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-lenis-prevent]');
  }

  // ONE TICK, ONE DECISION. `d` is +1 toward the contents and −1 toward the poster. A direction the
  // gate is already in is not a decision and is dropped, and a commit already in flight owns the
  // screen until it finishes — a second tick mid-morph would restart the flight from the middle,
  // which reads as a stutter rather than as an answer. Every other reason not to act is asked here,
  // once, before the cooldown is spent.
  function gateIntent(d){
    if (!d) return;
    if (mode === 'view' || state.transitioning || busy()) return;
    const to = d > 0 ? 'index' : 'cover';
    if (mode === to) return;
    const now = Date.now();
    if (now - lastIntent < INTENT_COOLDOWN) return;
    lastIntent = now;
    commit(to);
  }

  if (window.gsap && window.Observer){
    window.gsap.registerPlugin(window.Observer);
    window.Observer.create({
      target: gate,
      type: 'wheel,touch',
      tolerance: 8,
      wheelSpeed: 1,
      preventDefault: true,
      allowClicks: true,
      onDown(self){
        const ev = self.event;
        const isTouch = !!(ev && ((ev.type && ev.type.indexOf('touch') === 0) || ev.pointerType === 'touch'));
        if (ownsGesture(ev)) return;
        gateIntent(isTouch ? -1 : 1);
      },
      onUp(self){
        const ev = self.event;
        const isTouch = !!(ev && ((ev.type && ev.type.indexOf('touch') === 0) || ev.pointerType === 'touch'));
        if (ownsGesture(ev)) return;
        gateIntent(isTouch ? 1 : -1);
      },
    });
  }

  // THE KEYBOARD MAKES THE SAME TWO DECISIONS, through the same function, so a keyboard can never
  // reach a state a gesture cannot. ArrowDown/PageDown open the contents from the cover and
  // ArrowUp/PageUp close them; `preventDefault` because both keys have a scroll meaning that the
  // gate would otherwise honour and then contradict.
  document.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    if (busy() || mode === 'view' || state.transitioning) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown'){
      if (mode !== 'index'){ e.preventDefault(); gateIntent(1); }
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp'){
      if (mode !== 'cover'){ e.preventDefault(); gateIntent(-1); }
    }
  });

  // ── THE GESTURES ───────────────────────────────────────────────────────────
  // One delegated click for every door: the brand means the cover, ← INDEX and every BACK TO
  // INDEX mean the index, and the three surfaces that name a place — the head's row, the board,
  // the panels — mean that place. `data-open-view` is read before `data-nav-for` so a panel is a
  // route even though it also lights with the observer.
  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // A COMMIT OWNS ITS OWN SCREEN. While the plates are travelling, a press on a block or a panel
    // would route out of a state that is still being drawn — and the door it belongs to is on screen
    // only because the morph has not finished. Refusing for those 0.85s is the honest answer; a queue
    // would be a second state machine behind the first.
    if (state.transitioning) return;
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#headIndex') || t.closest('[data-back-index]')){
      e.preventDefault(); showIndex(true); return;
    }
    if (t.closest('.head-brand')){
      e.preventDefault();
      if (mode !== 'cover') showCover(true);
      else jumpTo(0);
      return;
    }
    const door = t.closest('[data-open-view], .metro-block, .head-nav-link');
    if (!door) return;
    const id = door.dataset.openView || door.dataset.navFor
            || String(door.getAttribute('href') || '').replace('#', '');
    if (!isPlace(id)) return;
    e.preventDefault();
    openView(id, door, true);
  });

  // ESCAPE IS THE VIEW'S BACK DOOR, and it is only the view's: an overlay that is open owns the
  // key (the drawer's `cancel` is a different event and its own listener already handles it), and
  // a cover or an index has nothing to go back to. Guarded by reading the three overlays' own
  // state rather than by a flag this module would have to keep in sync with them.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.defaultPrevented || mode !== 'view') return;
    const p = document.getElementById('setPanel'), a = document.getElementById('artOverlay'),
          l = document.getElementById('lfModal');
    if ((p && p.open) || (a && a.classList.contains('open')) || (l && l.classList.contains('open'))) return;
    e.preventDefault();
    showIndex(true);
  });

  // ── THE PULL-UP ────────────────────────────────────────────────────────────
  // A phone has no Escape key, so the view's second door is the gesture the platform already taught
  // the thumb: pull UP at the foot of the page. Three things make it a gesture and not a trap —
  //   · it only exists at the document's end, so a swipe up in the middle of a section is a scroll
  //     and stays one (no `preventDefault` until the qualifier has passed);
  //   · the drawer follows the thumb through a RUBBER BAND (`rubber`), so the first 40px move it a
  //     third of the way and the last 40 move it almost not at all — the page never feels like it is
  //     being dragged out of the reader's hand;
  //   · the DECISION is made on raw travel (110px), not on the drawn distance, so every phone needs
  //     the same gesture whatever its size.
  // `touchcancel` is a non-qualifying end: the gesture is put back, never committed.
  const rubber = px => 1 - 1 / (px / 130 + 1);       // 0 → ~0.68 at 260px, asymptotic to 1
  let touchY = 0, pulled = false, tracking = false;

  function releasePull(rearm){
    if (peek){
      peek.removeAttribute('data-live');
      peek.removeAttribute('data-prompt');
      peek.style.removeProperty('--pull');
    }
    tracking = false;
    if (rearm) armPeek(mode === 'view' && atEnd());
  }
  function commitPull(){
    pulled = true;
    // the phone's own confirmation, if the platform has one — never a reason to fail a gesture
    try { if (navigator.vibrate) navigator.vibrate(12); } catch(err){}
    // THE GESTURE SPEAKS WITH THE DOOR'S OWN VOICE — the same `snap` every hinged surface on this
    // page already uses, asked for by name on the bus the audio module listens to. A pull produces
    // no pointerdown, so nothing else would have said anything, and a silent door is the one thing
    // a phone visitor cannot check by ear.
    document.dispatchEvent(new CustomEvent('ad:voice', { detail: 'snap' }));
    releasePull(false);
    showIndex(true);
  }
  window.addEventListener('touchstart', e => {
    pulled = false; tracking = false; touchY = 0;
    if (mode !== 'view' || !e.touches || e.touches.length !== 1) return;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  // NON-PASSIVE, and only because of that one `preventDefault()`: once the qualifier has passed the
  // page must not also scroll, or the drawer and the section move at the same time.
  window.addEventListener('touchmove', e => {
    if (mode !== 'view' || !touchY || pulled || !e.touches || e.touches.length !== 1) return;
    const travel = touchY - e.touches[0].clientY;               // positive = thumb moving up
    if (travel < PULL_START) return;                            // a downward drag is a scroll
    if (!atEnd()){ touchY = 0; return; }                        // the gesture belongs to the end
    if (!tracking){ tracking = true; armPeek(true); if (peek) peek.setAttribute('data-live', ''); }
    e.preventDefault();
    const px = Math.min(260, travel);
    if (peek){
      peek.style.setProperty('--pull', String(Math.round(rubber(px) * 1000) / 1000));
      peek.setAttribute('data-prompt', px >= PULL_COMMIT * 0.55 ? 'armed' : 'rest');
    }
    if (px >= PULL_COMMIT) commitPull();
  }, { passive: false });
  window.addEventListener('touchend', () => {
    if (!pulled && tracking) releasePull(true);
    touchY = 0; pulled = false;
  }, { passive: true });
  // the platform took the gesture back (a call, the notification shade): put the drawer away, and
  // do NOT treat the travel as a decision
  window.addEventListener('touchcancel', () => {
    if (!pulled) releasePull(true);
    touchY = 0; pulled = false;
  }, { passive: true });

  // ── THE HISTORY ────────────────────────────────────────────────────────────
  // One entry per place and one for the index, so the back button retraces the reader's route
  // instead of leaving the site. `popstate` re-derives the state from the hash and never pushes.
  function hashPlace(){
    const h = String(location.hash || '').replace('#', '');
    if (!h) return null;
    if (h === 'index') return 'index';
    return isPlace(h) ? h : null;
  }
  window.addEventListener('popstate', () => {
    const h = hashPlace();
    if (h === 'index') showIndex(false, true);
    else if (h) openView(h, null, false, true);
    else showCover(false, true);
  });

  // ── SCHEDULING ─────────────────────────────────────────────────────────────
  let raf = 0;
  function schedule(){
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; paint(); });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  // THE MORPH'S CACHE IS A MEASUREMENT, SO IT DIES WITH THE MEASUREMENT. Every event that can move a
  // layout empties it and asks for a frame; the next frame of a morph takes it again, and the plates
  // are read through layout numbers so even a mid-morph resize cannot poison the quarters.
  window.addEventListener('resize', () => { invalidateMorph(); schedule(); });
  window.addEventListener('orientationchange', () => { invalidateMorph(); schedule(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { invalidateMorph(); schedule(); });
  window.addEventListener('load', schedule);

  // §16 — the same announcement the rail listens for: a row on the wall moves #reach's top, and
  // the gate's two edges are measured from rects, so one more frame keeps the fold honest.
  document.addEventListener('ad:layout', schedule);
  document.addEventListener('ad:layout', invalidateMorph);

  // ── BOOT ───────────────────────────────────────────────────────────────────
  // The attribute is written before the first paint so the head never flashes on a cover, and a
  // deep link is honoured immediately: no flood on arrival, because there is no state to leave.
  // `history.scrollRestoration` is 'manual' (the head's first script), so the browser has not put
  // the page anywhere and `jumpTo` is the only writer of a scroll position.
  const boot = hashPlace();
  if (boot && boot !== 'index') openView(boot, null, false, true);
  else if (boot === 'index') showIndex(false, true);
  else setMode('cover');
  paint();

  // ── THE SURFACE THE HARNESS DRIVES ─────────────────────────────────────────
  // Named calls rather than a global object the tests would have to reach into the module for:
  // every one of these is the same function a gesture calls, so a transition the suite measures
  // is the transition a reader gets.
  // The three routes are called with `instant` here — the harness is driving STATE, not time, and
  // the animated version of each is exercised through the real press it belongs to (a block, a
  // panel, ← INDEX, a BACK TO INDEX, the pull-up), which is what the runtime suite drives.
  window.__ad = window.__ad || {};
  Object.assign(window.__ad, {
    mode: () => mode,
    painted: () => painted,
    place: () => place,
    progress: () => shownP,
    revealed: () => shownReveal,
    // the gate's published position, as a function — the same number `paint()` writes to
    // `window.__adGateP`, so a reader and a frame cannot disagree about where the sheet is
    sheetPos,
    readMode: readMode,
    view: id => openView(id, null, false, true),
    index: () => showIndex(false, true),
    cover: () => showCover(false, true),
    measure: () => measureAll(),
    // THE MODULE'S OWN SCROLL WRITER. A native `window.scrollTo` a frame after an `immediate` Lenis
    // jump can be eaten by the smoother, so the harness drives the page through the same door the
    // module does — one writer, one answer.
    scrollTo: y => jumpTo(y),
    // THE GATE'S OWN MACHINE (§16d). `state` is the live object (the counters too, so a probe can
    // wait for a commit to finish); `setProgress` writes a position in one frame and is how the suite
    // parks the plates mid-morph to measure a half-turned plate. `toIndex`/`toCover` are the same two
    // calls a wheel tick and an arrow key make, so a probe exercises the reader's path exactly.
    gate: {
      state,
      toIndex: () => commit('index'),
      toCover: () => commit('cover'),
      setProgress: p => {
        const q = p < 0 ? 0 : (p > 1 ? 1 : p);
        state.token++;
        state.transitioning = false;
        state.p = q; state.proxy.p = q;
        writeP(q); applyMorph(q); setReveal(q >= 0.98); publish(q);
        paint();
      },
    },
  });
})();
