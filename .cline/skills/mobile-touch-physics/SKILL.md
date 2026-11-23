---
name: mobile-touch-physics
description: "Use for touch and phone work: the 390x844 deck, thumb vs wheel, drag on stickers, scroll lock, momentum and tap targets. Includes the iOS/Android behaviours emulation cannot prove."
---

# A thumb is not a wheel

The gate's intent layer (§16d, one GSAP Observer) already distinguishes a wheel notch from a touch
gesture — the raw event is on `self.event`. Group 12 of the harness is named "A THUMB IS NOT A
WHEEL" for a reason: the same gesture must not open the gate on a phone and scroll on a desktop.

## Touch rules

- `touch-action` is a decision, not a default: `none` on a drag surface, `pan-y` where the page must
  still scroll, and never `none` on anything the reader needs to scroll past.
- Listeners that only observe get `{ passive: true }`. A non-passive `touchmove` on the document is
  how a smooth page becomes a stuttering one.
- Tap targets ≥44×44 CSS px with ≥8px separation. A hover-revealed control is invisible to a thumb —
  every hover affordance needs a tap equivalent, and `@media (hover: none)` must not leave dead ends.
- No hover-only state carries meaning. `:active` and focus states must be visible on touch.
- Guard against ghost behaviour: 300ms delays (only without a viewport meta), double-tap zoom on
  controls (`touch-action: manipulation`), long-press selection on draggable art (`user-select`).
- Phone layout lives in `§13b` (the deck) with `§13b1` tablet between 768–1024. Edit at the owner;
  do not add a fourth breakpoint for one screen.

## Scroll, lock and momentum

- `syncScrollLock` (main.js :54) owns locking. A component must not also set `overflow:hidden`, or
  the lock is released twice and the page can end up stuck.
- With Lenis running above 768px, do not call `window.scrollTo`; native touch scroll below 768 is the
  expected path, so test both.
- `100vh` on mobile is not the visible viewport: the gate must be measured against the visual
  viewport (`dvh`/`innerHeight`), or the bottom control hides behind browser chrome.
- Momentum is the platform's. Do not synthesise inertia on top of native scrolling; do add drag
  inertia only on the Draggable stickers, where the surface does not scroll.

## What emulation cannot prove

CDP touch emulation (`Emulation.setTouchEmulationEnabled`) proves the handler wiring. It cannot
prove iOS rubber-banding, Safari's pinch-zoom, Android's scroll chaining, haptics, or real frame
pacing. Report those as **UNVERIFIED on device** — never as passing because a 390px emulation run
was green.

## Checklist

390×844 first, then 768×1024: open the gate with a swipe, close with Escape and with the back
gesture, scroll each view to its end, drag a sticker, open the settings drawer and toggle sound and
motion, then reload to confirm the preferences survived (`ad-motion`, `ad-a11y`, `ad-sound`).
