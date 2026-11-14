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
// §06 — the smoother's last velocity and when it was read, so the sheet's frame can prefer Lenis's
// own number (it knows the gesture) and fall back to a scroll delta when there is no instance.
// Declared here, above syncSmoothScroll(), because the callback attached there writes them.
let fxLenVel = 0, fxLenAt = 0;
// ...and the sheet's own frame state lives here for the same reason: syncSmoothScroll() can ask for
// a frame from a scroll callback long before the hero module below has been parsed, so nothing in
// that path may sit in the temporal dead zone of a `let` declared further down the file.
let fxItems = [], fxSkewItems = [], fxGearSet = null, fxRaf = 0;
let fxLastY = 0, fxVel = 0;
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
    smoothLenis.destroy();
    smoothLenis = null;
    return;
  }
  smoothLenis = new window.Lenis({
    autoRaf: true,   // Lenis owns its loop; calling raf() by hand as well would double-step it
  });
  // §06 — THE SHEET READS THE SMOOTHER'S VELOCITY. One callback, attached where the instance is
  // built, so a rebuild (a breakpoint cross, or the drawer's Motion switch going back on) attaches
  // exactly once and a destroy takes it with the instance. `velocity` is px per frame in Lenis
  // 1.3.x; it is divided down in drawFx() and damped there, so this only has to remember it.
  smoothLenis.on('scroll', e => {
    const v = (e && typeof e.velocity === 'number') ? e.velocity : 0;
    if (Math.abs(v) > 0.01){
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

// THE MASTHEAD'S FIT — one size for both words. The blackletter has no italic and no light cut, so
// the two rows are the same face at the same size: fitting them independently (the old 0.62 factor
// on line 2) was compensating for a second, lighter typeface that no longer exists. The loop
// shrinks the pair until the WIDER of the two fits, which is what keeps the block one rectangle
// instead of a long word over a short one at an unrelated size.
function fitName(){
  const block = document.getElementById('nameBlock');
  const l1 = document.getElementById('line1');
  const l2 = document.getElementById('line2');
  if (!block || !l1 || !l2) return;
  const w = block.clientWidth;
  if (!w) return;                      // display:none / pre-layout: measure again when it isn't
  let s = 300;
  // `scrollWidth`, not a rect: the group that contains each word is shrink-to-fit and is capped at
  // the block's width, so a rect would report "it fits" for a word that is overflowing it.
  const widest = () => Math.max(l1.scrollWidth, l2.scrollWidth);
  for (const l of [l1, l2]){ l.style.fontSize = s + 'px'; l.style.whiteSpace = 'nowrap'; }
  while (widest() > w && s > 18){
    s -= 2;
    for (const l of [l1, l2]) l.style.fontSize = s + 'px';
  }
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
//   alignStickers()  the resting jitter — a few degrees and a few pixels, re-rolled on every load
//                    so the two plates never look like they were set on a grid — and the CLAMP: a
//                    64%-of-the-word square hung past the word's right edge would run off the
//                    sheet on a phone, so the offset is walked back inside #hero's own rect.
//   Draggable        x/y inside #hero with edge resistance and an elastic release; the scale on
//                    press is what makes the vinyl read as lifted rather than as a moving picture.
//   the gloss        a screen-blended bubble that follows the pointer across the plate. It writes
//                    CSS VARIABLES (--bubble-x / --bubble-y), not a transform: the sticker's
//                    transform belongs to GSAP, and a second writer there would fight the drag.
const heroEl = document.getElementById('hero');
const stickerBtns = heroEl ? Array.from(heroEl.querySelectorAll('.sticker')) : [];
const stickerDrags = [];

function alignStickers(){
  if (!heroEl || !stickerBtns.length) return;
  const hr = heroEl.getBoundingClientRect();
  const narrow = !!(window.matchMedia && window.matchMedia('(max-width: 800px)').matches);
  const amp = narrow ? { x: 9, y: 7, r: 2.4 } : { x: 16, y: 12, r: 4 };
  for (const btn of stickerBtns){
    if (!btn.offsetWidth) continue;
    // measure from the CSS anchor, not from wherever the last drag left it: the jitter is an
    // absolute rest offset, so it must not accumulate every time this runs (fonts, resize).
    if (window.gsap) window.gsap.set(btn, { x: 0, y: 0, rotation: 0 });
    else btn.style.transform = 'none';
    const r = btn.getBoundingClientRect();
    if (!r.width) continue;
    let x = (Math.random() * 2 - 1) * amp.x;
    let y = (Math.random() * 2 - 1) * amp.y;
    const rot = -5 + (Math.random() * 2 - 1) * amp.r;
    if (r.right + x > hr.right - 6) x -= (r.right + x) - (hr.right - 6);
    if (r.left + x < hr.left + 6) x += (hr.left + 6) - (r.left + x);
    if (r.bottom + y > hr.bottom - 6) y -= (r.bottom + y) - (hr.bottom - 6);
    if (r.top + y < hr.top + 6) y += (hr.top + 6) - (r.top + y);
    if (window.gsap) window.gsap.set(btn, { x: x, y: y, rotation: rot });
    else btn.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rot + 'deg)';
  }
  // the drag's bounds were measured around the old offsets; let each instance re-read itself
  for (const d of stickerDrags){ try { if (d && d.update) d.update(); } catch (e) { /* older plugin */ } }
}

function initStickers(){
  if (!heroEl) return;
  for (const btn of stickerBtns){
    const gloss = btn.querySelector('.sticker__gloss');
    if (gloss){
      const setBubble = (x, y) => {
        gloss.style.setProperty('--bubble-x', x.toFixed(1) + 'px');
        gloss.style.setProperty('--bubble-y', y.toFixed(1) + 'px');
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
      onPress(){ window.gsap.to(btn, { scale: 1.06, duration: 0.22, ease: 'power2.out', overwrite: 'auto' }); },
      onDragStart(){ btn.classList.add('dragging'); },
      onRelease(){
        btn.classList.remove('dragging');
        const still = stillMotion();
        window.gsap.to(btn, { scale: 1, duration: still ? 0 : 0.9,
          ease: still ? 'none' : 'elastic.out(1,0.42)', overwrite: 'auto' });
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
const risoEl = document.getElementById('risoPortrait');
let risoLayers = risoEl ? Array.from(risoEl.querySelectorAll('.rp-layer')) : [];
const RISO_DEPTH = [9, -7, 0];        // red one way, blue the other, the key holds
let risoShuffling = false;

function shuffleRiso(){
  if (!risoEl || risoShuffling || risoLayers.length < 2) return;
  const top = risoLayers[risoLayers.length - 1];
  // paint order IS DOM order, so the plate that was on top goes to the FRONT of the stack. The
  // array is kept in the same order as the DOM, so each drum keeps its own drift depth.
  const rotate = () => {
    risoEl.insertBefore(top, risoEl.firstElementChild);
    risoLayers = [top].concat(risoLayers.slice(0, -1));
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
        const d = RISO_DEPTH[i] || 0;
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

// ── ONE FRAME FOR THE SHEET ────────────────────────────────────────────────────────────────
// Everything that reads the scroll is computed here, once per frame, from ONE position:
//   parallax   each [data-parallax-speed] node is translated by -(y × (speed − 1)), so 1 is the
//              page itself, 0.8 lags behind it (the stock) and 1.5 runs ahead (the stickers).
//   velocity   damped toward the scroll's own speed and written as skewY (+ a hair of scaleY) on
//              [data-skew] — the masthead, the plate and the stickers lean into a fast scroll and
//              settle back. Clamped to ±1 so no flick can fold the type over.
//   the gear   rotates 720° across the sheet's own height, plus a little lean from the velocity.
// The velocity is LENIS'S when the smoother is alive (one callback, attached where the instance is
// built, so a rebuild re-attaches exactly once) and the frame-to-frame delta when it is not — which
// is what keeps the sheet's motion working below 768px, where Lenis deliberately does not exist.
// (frame state is declared next to fxLenVel, at the top of the file — see the note there.)

function collectFx(){
  if (!heroEl || !window.gsap) return;
  const q = sel => Array.from(heroEl.querySelectorAll(sel));
  fxItems = q('[data-parallax-speed]').map(el => ({
    el: el, speed: parseFloat(el.getAttribute('data-parallax-speed')) || 1,
    setY: window.gsap.quickSetter(el, 'y', 'px'),
  }));
  // THE STICKERS TAKE THE SAME SKEW, but they are NOT in the stylesheet's off-switch list, and the
  // reason is in §06: their transform also carries the drag, the jitter and the resting rotation, so
  // `transform:none !important` would not "stop" them — it would teleport them back to their CSS
  // anchors and break the hand. drawFx zeroes their skew instead, on the same stillMotion() the
  // stylesheet reads, so the result is identical and the placement survives.
  fxSkewItems = q('[data-skew], .sticker').map(el => ({
    el: el, setSkew: window.gsap.quickSetter(el, 'skewY', 'deg'),
    setScale: window.gsap.quickSetter(el, 'scaleY'),
  }));
  const gear = heroEl.querySelector('.hero-gear-asterisk');
  fxGearSet = gear ? window.gsap.quickSetter(gear, 'rotation', 'deg') : null;
  fxLastY = Math.max(0, window.scrollY);   // start from where the page actually is, not from 0
}

function drawFx(){
  fxRaf = 0;
  if (!window.gsap || !heroEl) return;
  const y = Math.max(0, window.scrollY);
  if (stillMotion()){
    fxVel = 0;
    for (const it of fxItems) it.setY(0);
    for (const s of fxSkewItems){ s.setSkew(0); s.setScale(1); }
    if (fxGearSet) fxGearSet(0);
    fxLastY = y;
    return;
  }
  const delta = y - fxLastY;
  fxLastY = y;
  const now = (window.performance && performance.now) ? performance.now() : Date.now();
  const fresh = (now - fxLenAt) < 140;
  const raw = (fresh && Math.abs(fxLenVel) > 0.01) ? fxLenVel / 45 : delta / 16;
  fxVel += (clampNum(raw, -1, 1) - fxVel) * 0.18;
  const heroH = heroEl.offsetHeight || 1;
  const capped = Math.min(y, heroH);
  for (const it of fxItems) it.setY(-(capped * (it.speed - 1)));
  for (const s of fxSkewItems){ s.setSkew(fxVel * 2.2); s.setScale(1 - Math.min(0.03, Math.abs(fxVel) * 0.03)); }
  if (fxGearSet) fxGearSet((capped / heroH) * 720 + fxVel * 8);
  // KEEP THE LOOP ALIVE UNTIL THE VELOCITY HAS ACTUALLY DECAYED. Without this line the last flick's
  // skew would be the state the sheet keeps until the next scroll event, so a page that stops dead
  // would be left permanently leaning — and the gear would keep the flick's angle forever.
  if (Math.abs(fxVel) > 0.0015) fxRaf = requestAnimationFrame(drawFx);
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
  const VOICE = { tap, breath, snap, glide };
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
// THE BAR — headroom, breadcrumb, section list, drawer
// ═══════════════════════════════════════════════════
// One module, because these four things are one instrument: the bar leaves when the visitor
// reads and returns when they look for it, the breadcrumb names the section under the reading
// line, the list is the same five names in the same order, and the drawer holds the two
// switches the stylesheet and the four motion modules already know how to honour.
(function(){
  const bar     = document.getElementById('siteNav');
  const bc      = document.getElementById('navBc');
  const bcLabel = document.getElementById('navBcLabel');
  const menu    = document.getElementById('navMenu');
  const rows    = Array.from(document.querySelectorAll('[data-nav-for]'));
  const sections = Array.from(document.querySelectorAll('[data-nav]'));
  // §06b — the signboard this bar is handed from, and the drawer whose open state outranks the
  // handoff (a focused control may never be invisible). Both looked up here, before the first
  // frame, because frame() reads all three on every scroll.
  const strip    = document.getElementById('marqueeToc');
  const stripTrack = document.getElementById('marqueeTrack');
  const drawer   = document.getElementById('setPanel');
  // BEFORE THE FIRST FRAME THE BAR IS NOT ON THE PAGE. The handoff writes opacity from scroll
  // position, and at scrollY 0 that answer is 0 — so the start state is written here, in the
  // parse, rather than left for the first animation frame to discover after a visible flash.
  // No script at all means the style is never touched and the bar is simply there (<noscript>
  // is not needed for that: nothing in the stylesheet hides it).
  if (bar) bar.style.opacity = '0';

  // ── THE PROGRESS TRACK (§05c) ───────────────────────────────────────
  // Five segments, built from the same list the breadcrumb walks rather than authored a second
  // time in the markup: one list of sections, so the rail and the label can never disagree about
  // what the page is made of. The container is aria-hidden — this is the breadcrumb's answer
  // drawn a second way, and a screen reader has no use for a picture of it.
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

  // ── THE TWO SWITCHES ────────────────────────────────────────────────
  // Both are <button aria-checked>, not checkboxes: a switch is a state, and the row around it
  // is 44px of paper (§05b). The storage keys are read once here and mirrored by the attribute
  // the stylesheet reads, so this session and the next one behave the same, and the audio
  // module's own key ('ad-sound') stays a separate promise.
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
    // switch, not three; the row under it says so and is aria-disabled rather than disabled, so
    // it stays readable. Turning it back off returns motion to its own switch — never to `on` —
    // because a visitor who had already silenced the movement would not expect that press to
    // start it again.
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


  // ── ONE FRAME, TWO ANSWERS ──────────────────────────────────────────
  // Where the visitor is (the label and the lit row) and which way they are moving (whether the
  // bar is on the page) both come from the same scroll position, so they are computed together —
  // and every geometry READ happens before any class is WRITTEN, so the frame cannot read back
  // its own writes as a forced re-layout.
  // §06 RETIRED ASTERISK_AT (50). It was the scroll position at which the hero's display asterisk
  // faded, and it wrote `html.is-scrolled` for a single stylesheet rule. The broadsheet has no
  // asterisk (the gear is a different mark and it turns instead of leaving), so both the constant
  // and the class went with it rather than leaving a selector nothing can match and a class nothing
  // reads. What remains is the bar's own choreography, which never needed the hero.
  const HIDE_AT     = 140;   // the bar only starts leaving once the hero is behind it
  const DELTA       = 5;     // px of travel before a direction counts: a jittery wheel is not a scroll
  const LINE        = 0.4;   // the reading line: 40% down the viewport, never the top edge

  let anchorY = Math.max(0, window.scrollY);  // the position the current direction was measured from
  let hide = false;                           // ...and the direction the bar is following
  let shownHidden = false, shownId = '';
  let menuOpen = false;
  // THE HANDOFF'S TWO ANSWERS (§06b), and the last opacity each surface was given. -1 is "never
  // written", so the first frame always paints both sides exactly once.
  let navFocus = false;                       // focus anywhere in the bar (keyboard, or the gear)
  let shownNavOp = -1, shownStripOp = -1;

  // is the bar holding focus on behalf of a keyboard? (see the headroom block in frame())
  function keyboardInBar(){
    const a = document.activeElement;
    if (!bar || !a || !bar.contains(a)) return false;
    try { return a.matches(':focus-visible'); } catch(e){ return true; }
  }

  // FOCUS OUTRANKS THE FADE (§06b). The bar is transparent over the hero but it is still there,
  // and a programmatic or keyboard focus inside it must bring it back — otherwise a focused
  // control would be invisible, which is the one thing a handoff may never do. focusout is
  // deferred one task so "focus moved to another control in the bar" is not read as "left".
  if (bar){
    bar.addEventListener('focusin', () => { navFocus = true; schedule(); });
    bar.addEventListener('focusout', () => {
      setTimeout(() => { navFocus = !!(bar.contains(document.activeElement)); schedule(); }, 0);
    });
  }

  // ── THE TRACK'S ARITHMETIC ──────────────────────────────────────────
  // One entry per section, reused every frame: this runs on scroll, so nothing in here allocates.
  // `len` is a section's reading window in px of scroll travel — the positions during which that
  // section is the one under the reading line — and `p` is how far the page has gone through it.
  // The windows tile the page exactly (see the loop in frame()), so their lengths add up to the
  // document and the rail's five lengths are the page, not an approximation of it.
  const TOPS      = sections.map(() => 0);
  const WIN       = sections.map(() => ({ start: 0, len: 1, p: 0 }));
  const shownLen  = sections.map(() => -1);   // the flex-grow each segment was last given
  const shownFill = sections.map(() => -1);   // ...and the scaleY each fill was last given
  let shownSteps  = -1;                       // the count painted last while motion was off

  // ONLY THE NUMBERS THAT CHANGED ARE WRITTEN. The fill is a transform for the same reason the
  // bar's headroom is: scaleY is resolved on the compositor, so a scroll that moves the fill by a
  // pixel never asks the page for a layout. Segment lengths move only when a section's geometry
  // does — a resize, a late font, the hero's photograph arriving.
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
    // MOTION OFF — or the system asking for less. The rail stops measuring and starts counting:
    // the sections behind the reading line are full, the one under it is not, and nothing is
    // written until that answer changes, so a page that asked for no movement gets no per-frame
    // movement at all — one step at each section boundary. It still ends full, because the last
    // window ends on the last scroll position, which is a section finished rather than entered.
    if (stillMotion()){
      if (completed === shownSteps) return;
      shownSteps = completed;
      for (let i = 0; i < fills.length; i++) setFill(i, i < completed ? 1 : 0);
      return;
    }
    shownSteps = -1;
    for (let i = 0; i < fills.length; i++) setFill(i, WIN[i].p);
  }

  function frame(){
    const y = Math.max(0, window.scrollY);
    // READ: the section under the reading line. The sections are in document order, so the last
    // one whose top has passed the line is the one being read — no observer thresholds to fight,
    // and a section taller than the viewport still reports itself. The same single walk of rects
    // feeds the track below, so the page is measured once per frame and not twice.
    const line = window.innerHeight * LINE;
    const maxScroll = Math.max(0, rootEl.scrollHeight - window.innerHeight);
    let active = sections.length ? sections[0] : null;
    for (let i = 0; i < sections.length; i++){
      const r = sections[i].getBoundingClientRect();
      TOPS[i] = r.top + y;
      if (r.top <= line) active = sections[i];
    }
    // ...and the windows those tops imply. Section i owns the line from the scroll position that
    // first put its top on it to the one that puts the NEXT section's top there — which is why a
    // section's window is its own height of travel and the windows tile the page with no gap.
    // The first window starts at 0 and the last ends on the last scroll position, because the
    // page cannot scroll past either end: that is what makes the rail empty at the top of the
    // page and full at the bottom of it, instead of starting a third of the way in.
    let completed = 0;
    for (let i = 0; i < sections.length; i++){
      const last  = i === sections.length - 1;
      const start = Math.min(i === 0 ? 0 : Math.max(0, TOPS[i] - line), maxScroll);
      const end   = last ? maxScroll : Math.max(start, Math.min(maxScroll, TOPS[i + 1] - line));
      const len   = Math.max(1, end - start);
      const p     = (y - start) / len;
      WIN[i].start = start; WIN[i].len = len;
      WIN[i].p = p > 1 ? 1 : (p > 0 ? p : 0);
      if (p >= 1) completed++;
    }

    // WRITE: nothing here is about the hero any more. The asterisk's class write is gone (§06), and
    // the reads above are the only geometry this frame needs.

    // WRITE: the label and the lit row — and only when the answer changes, because this runs on
    // every scroll frame and textContent is a layout-affecting write.
    if (active){
      const id = active.dataset.nav || '';
      if (id !== shownId){
        shownId = id;
        if (bcLabel) bcLabel.textContent = active.dataset.navLabel || '';
        for (const row of rows){
          if (row.dataset.navFor === id) row.setAttribute('aria-current', 'location');
          else row.removeAttribute('aria-current');
        }
      }
    }

    // HEADROOM: measured from an anchor rather than from the last frame, so a slow wheel — a few
    // px per frame under Lenis — still adds up to a direction instead of never registering.
    if (y <= HIDE_AT){ hide = false; anchorY = y; }
    else if (y - anchorY > DELTA){ anchorY = y; hide = true; }
    else if (anchorY - y > DELTA){ anchorY = y; hide = false; }
    // Two things outrank the gesture. An open list cannot be hidden along with the bar it belongs
    // to, and a KEYBOARD focus ring inside the bar must not leave while the visitor is tabbing
    // toward it — the drawer's handle lives in the bar, so it holds there too. `:focus-visible`,
    // not `:focus`: if a pointer press focused the breadcrumb, the bar is still yours to hide, and
    // a visitor who opens the list with a mouse must not be stuck with a bar that will not leave.
    // The anchor is reset with it so the bar does not vanish the instant the reason goes away.
    if (menuOpen || keyboardInBar()){ hide = false; anchorY = y; }
    if (bar && hide !== shownHidden){ shownHidden = hide; bar.classList.toggle('nav-hidden', hide); }

    // WRITE: THE HANDOFF (§06b) — one number, written twice. `dock` is how far the contents strip
    // has risen through its own height: 0 while it is still below the fold, 1 the moment it is
    // stuck to the top. The bar's opacity IS that number and the strip's type is its inverse, so
    // there is exactly one surface at the top of the page at any scroll position, and neither
    // fade is a transition — a transition would lag the wheel by its own duration.
    // Three things hold the bar at 1 regardless of the scroll: its own list is open, focus is
    // inside it (focusin/focusout above), or the modal drawer is open — its gear lives in the bar.
    let dock = 1;
    if (strip){
      const sr = strip.getBoundingClientRect();
      const sh = sr.height || 1;
      dock = 1 - sr.top / sh;
      dock = dock < 0 ? 0 : (dock > 1 ? 1 : dock);
    }
    if (menuOpen || navFocus || (drawer && drawer.open)) dock = 1;
    if (bar && Math.abs(dock - shownNavOp) > 0.004){
      shownNavOp = dock; bar.style.opacity = dock.toFixed(3);
    }
    if (stripTrack && Math.abs((1 - dock) - shownStripOp) > 0.004){
      shownStripOp = 1 - dock; stripTrack.style.opacity = shownStripOp.toFixed(3);
    }

    // WRITE: the track (§05c) — every geometry READ is above it, and it is the one writer here
    // that is allowed to do nothing at all: motion off, and no section boundary crossed since the
    // last frame, means the rail is already the truth.
    paintTrack(completed);
  }

  let queued = false;
  function schedule(){
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; frame(); });
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  // the hero's photograph arrives after first paint and moves every section below it, so one
  // late pass keeps the label honest without measuring on a timer
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
  window.addEventListener('load', schedule);
  schedule();


  // ── THE LIST — a disclosure, not a menu widget ──────────────────────
  // aria-expanded + aria-controls on the handle, focus left where it was, Tab walking the rows.
  // No role="menu": these are five links to five places, and a menu widget would owe the visitor
  // arrow-key navigation to match the promise it makes. Escape still closes and comes back,
  // because a list you can only leave with the pointer is not a list a keyboard can use.
  function openMenu(){
    if (!menu || !bc || menuOpen) return;
    menuOpen = true;
    menu.hidden = false;
    bc.setAttribute('aria-expanded', 'true');
    // the bar cannot be off the page while its own list is open, and the anchor moves to here so
    // that closing the list cannot immediately re-hide it
    hide = false; anchorY = Math.max(0, window.scrollY);
    if (bar){ shownHidden = false; bar.classList.remove('nav-hidden'); }
    schedule();   // an open list holds the bar at opacity 1 (§06b), even over the hero
  }
  function closeMenu(refocus){
    if (!menu || !menuOpen) return;
    menuOpen = false;
    menu.hidden = true;
    if (bc) bc.setAttribute('aria-expanded', 'false');
    if (refocus && bc) bc.focus({ preventScroll: true });
    schedule();
  }

  if (bc && menu){
    bc.addEventListener('click', () => { if (menuOpen) closeMenu(false); else openMenu(); });
    if (bar) bar.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !menuOpen) return;
      e.stopPropagation();   // the page behind does not also get this Escape
      closeMenu(true);
    });
    // a press anywhere else shuts it. pointerdown, not click, so a press that starts outside and
    // ends inside the list (a drag across it) does not leave a panel open behind the pointer.
    document.addEventListener('pointerdown', e => {
      if (menuOpen && !(e.target.closest && e.target.closest('.nav-left'))) closeMenu(false);
    }, true);
    // Tab off the last row and the list closes behind the visitor, so the next Shift+Tab does not
    // land in a list that is no longer on screen. relatedTarget is null when focus goes nowhere
    // focusable — that is still a leave.
    menu.addEventListener('focusout', e => {
      if (menuOpen && !(e.relatedTarget && menu.contains(e.relatedTarget))) closeMenu(false);
    });
    // THE ARCHIVE ROW IS A DOOR, NOT A DESTINATION. Its href is #footerB1 so the no-JS page still
    // lands on the plate, but the wall's own listener (bound earlier) has already opened the room
    // by the time this runs — so the jump is cancelled here and the visitor is never also thrown
    // to the footer behind the open wall. Every row closes the list; a row that is already the
    // current section does not fire a scroll event, so the frame is asked for one more pass.
    // Every link in the list, not just the four section rows: the door is a link too, and it is
    // the one whose href must not be followed.
    for (const link of menu.querySelectorAll('a')){
      link.addEventListener('click', e => {
        if (link.hasAttribute('aria-controls')) e.preventDefault();
        closeMenu(false);
        schedule();
      });
    }
  }


  // ── THE DRAWER ──────────────────────────────────────────────────────
  // A modal <dialog>, because the platform already owes us the parts that are easy to get wrong:
  // the top layer, the inert page behind it, the Tab ring, Escape, and the focus return. What it
  // does not do is animate in — the panel is `[open]` before it can have a start state — so the
  // slide class waits a frame (§05b), and what it does not do is stop the page behind it from
  // scrolling, which is why it asks syncScrollLock() the same question the wall and the folio do.
  const panel    = drawer;   // the same node — looked up at the top of the module, where frame() reads it
  const gear     = document.getElementById('setOpen');
  const setClose = document.getElementById('setClose');
  let closeTimer = 0;

  function openDrawer(){
    if (!panel || panel.open) return;
    closeMenu(false);
    hide = false; anchorY = Math.max(0, window.scrollY);
    if (bar){ shownHidden = false; bar.classList.remove('nav-hidden'); }
    if (gear) gear.setAttribute('aria-expanded', 'true');
    if (typeof panel.showModal === 'function') panel.showModal();
    else panel.setAttribute('open', '');   // Safari < 15.4: no top layer, but the panel does open
    requestAnimationFrame(() => panel.classList.add('is-open'));
    syncScrollLock();
    // THE RETICLE MOVES INTO THE TOP LAYER (F2). #cur is position:fixed at z-index 9999, and a
    // modal <dialog> paints in the top layer — above every z-index the page can write — so the
    // mark would sit behind the drawer it is the cursor for. Re-parented, not cloned: there is
    // one mark, the pointer loop keeps writing the same node's left/top, and it works in its new
    // home with no second code path. [data-a11y="on"] still hides it wherever it lives (§14).
    if (cur && cur.parentNode !== panel) panel.appendChild(cur);
    schedule();   // the open drawer outranks the handoff: the bar comes back for its gear
    // showModal() already focuses the first control — the close button is deliberately first in
    // the markup — so this is a belt, not the braces: it also survives the fallback path above.
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
    // Escape arrives as `cancel` first, and intercepting it is what lets the panel slide out
    // instead of vanishing. The `close` listener below then lands on the same cleanup whether the
    // panel was dismissed natively or by this module.
    panel.addEventListener('cancel', e => { e.preventDefault(); closeDrawer(); });
    panel.addEventListener('close', () => {
      panel.classList.remove('is-open');
      if (gear) gear.setAttribute('aria-expanded', 'false');
      // the mark goes home with the page it belongs to, so the next open moves it again rather
      // than leaving a fixed node inside a closed display:none dialog
      if (cur && cur.parentNode !== document.body) document.body.appendChild(cur);
      syncScrollLock();
      if (gear) gear.focus({ preventScroll: true });
      schedule();   // the gear now holds focus: the bar must stay visible for it
    });
    // THE THIRD WAY OUT: a press on the backdrop. The dialog box is the panel itself (inset:0 0
    // 0 auto), so a click whose target is the dialog is a click on the field behind it — the
    // ::backdrop takes no element of its own.
    panel.addEventListener('click', e => { if (e.target === panel) closeDrawer(); });
  }
})();

