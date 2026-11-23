---
name: gsap-lenis-motion
description: "Use for any animation or scroll work: GSAP 3.15.0 core/Flip/Observer plus vendored Draggable, Lenis 1.3.25 desktop-only. Timeline ownership, kill/teardown, reduced-motion paths. No ScrollTrigger in this tree."
---

# Motion: GSAP 3.15 + Lenis 1.3.25

Classic scripts at the end of `<body>`, in this order: `gsap.min.js` → `Flip.min.js` →
`Observer.min.js` → vendored `js/Draggable.min.js` → vendored `js/lenis.min.js` → `js/main.js`.
Nothing is a module. **There is no ScrollTrigger and no ScrollSmoother here** — do not import them,
do not describe a timeline as scroll-driven, and do not add a CDN tag without an explicit instruction.

## GSAP

- One timeline per job, stored so the next run can kill it. Re-triggering must kill the previous
  tween rather than stack a second one on the same property.
- Animate `transform` and `opacity` (x, y, scale, rotate, autoAlpha). Layout properties re-run layout
  every frame and fight the smooth scroller.
- Give duration and ease explicitly. The gate's commit tween is the reference feel: weighted, settled,
  no bounce on text.
- `gsap.ticker` is the only clock. Do not start a `requestAnimationFrame` loop beside it.
- **Flip** — record state *before* the DOM change, `Flip.from(state, …)` after it. Used for the
  contents↔bar morph and the flood's `#flood` → `#floodProxy` fit. Never measure mid-transition.
- **Observer** — a single instance for the gate's intent layer (§16d); the raw event is on
  `self.event`, which is how `main.js` tells a thumb from a wheel. Do not add a second Observer or a
  bare `wheel` listener for the same gesture.
- **Draggable** — hero stickers only, and only when `window.Draggable` exists; without it they stay
  still prints (`if (!window.Draggable)`).
- Kill tweens on teardown, on any state change that removes the target, and when motion is off.

## Lenis

- Desktop smoothing only: created above 768px with motion on (`syncSmoothScroll`, main.js :115),
  destroyed below the breakpoint and when `data-motion="off"`. Never run two instances.
- Scroll through Lenis (`scrollTo`) while it is active; a raw `window.scrollTo` desynchronises it.
- `syncScrollLock` (:54) is the only lock owner. Do not flip `body { overflow }` from a component or
  the page can stick in one state.
- Anchor jumps and route changes go through the same path as the nav click (:3482), so history and
  `scrollRestoration` stay honest.

## Non-negotiables

- With `prefers-reduced-motion: reduce` or `html[data-motion="off"]`: no tweens, no smoothing, no
  residual motion. The page must be complete and readable with every animation absent.
- The gate state machine (`__adGateP`, main.js :2841) is the only writer of gate state. Timelines
  follow it; they never drive it.
- Verify by measurement (`window.__ad`, `__adGateP`, CDP input), and remember headless
  `--disable-gpu` hides real compositing cost — see `docs/qa-contract.md` §8.
