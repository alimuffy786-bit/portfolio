---
paths:
  - "js/main.js"
  - "js/ledger.js"
---

# javascript.md — the behaviour (`js/main.js`, `js/ledger.js`)

Two classic scripts, each one IIFE, loaded at the end of `<body>` with no `defer`, no `async`, no
modules and no bundler. `js/main.js` reads `window.gsap`, `window.Flip`, `window.Observer`,
`window.Draggable` and `window.Lenis` at parse time, so script order is load-bearing.

## Ownership (verified line anchors in `js/main.js`)

- `syncScrollLock` (:54) and `syncSmoothScroll` (:115) own scrolling and Lenis.
- `shape()` (~:2804) owns `inert` + `aria-hidden` for every `[data-view]`.
- The gate state machine (:2841) owns `__adGateP`; `arm()` (:1929) owns the intent listener;
  the nav click handler (:3482) owns routing. Change these at their owner, not from a caller.
- `js/ledger.js` talks to Supabase and touches the DOM only at its boundary: nothing runs at page
  load, the SDK is injected on the first `ad:wall` event.

## Rules

- Keep everything inside the IIFE. The only public surface is `window.__ad` plus its documented
  hooks (`__adGateP`, `__adRailMeasure`) — the harness drives the page through them, so their names
  and behaviour are a contract. Do not rename, remove or "tidy" them.
- One state machine, one rAF schedule. Do not add a competing loop, a second scroll listener, or a
  parallel copy of the `mode`/`place` logic; extend the existing one.
- Feature-detect every library before use (`if (!window.gsap)`), with a quiet path. A blocked CDN
  must leave a readable page, never a `TypeError` on load.
- Lifestyle: destroy/disable what you create (Lenis below 768 or motion-off, listeners on teardown).
- Preferences persist under `ad-motion`, `ad-a11y`, `ad-sound` and are reflected in
  `html[data-*]`. Read/write through the existing helpers; do not invent a second key.
- Guard DOM queries: element references may be null after a state change — early-return rather than
  optional-chain through a whole pipeline.
- No `console.log` left behind on a normal path; no debug globals beyond the documented hooks.
- No inline handlers in markup, no `eval`, no string-built HTML from user input. The ledger renders
  guestbook entries as text, and must keep doing so.
- Timers and transitions: prefer GSAP/Lenis state over `setTimeout` guessing. If a magic delay is
  unavoidable, comment why and keep it in one place.

## Never

- Never edit `js/Draggable.min.js` or `js/lenis.min.js`.
- Never move the gate/state logic into the CSS layer or into markup "for simplicity": `main.js` is
  the single writer of `data-mode`, `data-place`, `inert` and `aria-hidden`.
- Never swap the publishable Supabase key for a service-role key, or move it server-side "quietly".
