---
name: cdp-qa-verify
description: "Use to prove behaviour in the real browser: serve the repo over HTTP, drive headless Chrome via CDP, click and wheel for real, measure relations in the live DOM, read console and network. Complements node tests/verify.mjs."
---

# Verify on the running page, not in your head

`docs/qa-contract.md` is the authority on the harness. This skill is the ad-hoc measurement loop you
use while working — the same technique `tests/verify.mjs` uses, without its 111 assertions.

## Setup

- Serve the repo over HTTP; never open `index.html` from `file://` (module-free but absolute paths,
  fonts, and `fetch` all behave differently, and the harness itself always uses `http://127.0.0.1`).
- Ports are the harness contract: `PORTFOLIO_PORT` server (8777), `PORTFOLIO_DBG` DevTools (9355),
  `PORTFOLIO_CHROME` binary. If 8777 is busy pick another server port; keep the debug port distinct.
- Launch headless (`--headless=new`, `--disable-gpu`, `--window-size=1440,900`,
  `--force-device-scale-factor=1`, isolated `--user-data-dir`) so your measurement matches the
  harness's conditions. Do **not** write into `.cdp-run/`.

## Driving the page

- `window.__ad` is the supported surface: enumerate it (`Object.keys(window.__ad)`) instead of
  assuming names. It exposes the state drivers (`cover()`, `index()`, `view(id)`) and the gate's
  progress promise `__adGateP`; `__adRailMeasure` is the measurement hook.
- Await `__adGateP` after a gesture: it settles when the gate's state machine settles (main.js
  :2841), which is the difference between measuring a transition and measuring a coincidence.
- Prefer real input where the input is the subject: CDP `Input.dispatchMouseEvent` (wheel),
  `Input.dispatchTouchEvent`, `Input.dispatchKeyEvent` (Escape, Tab). `__ad` proves the state
  machine; synthetic input proves the listeners.
- Set device metrics (`Emulation.setDeviceMetricsOverride`) for 390×844, 768×1024, 1440×900, and wait
  for `document.fonts.ready` before measuring geometry.

## What to measure

- Relations, both sides measured in the same run: "the gate's height equals the viewport height",
  not "the gate is 900px". Re-derive; never paste a number from a doc.
- The exclusive-view contract: for every `[data-view]`, exactly one lacks `inert` **and**
  `aria-hidden`, and it is the one named by `mode`/`place`.
- Console and network: an exception, an unhandled rejection, or any response ≥400 is a failure — the
  same rule group 13 applies. Check them before declaring success.
- Screenshots for layout claims (`--shots` in the harness, or a direct capture), remembering that
  `--disable-gpu` makes pixel output a layout check, not a fidelity check.

## Implementation & Animation Fidelity Gate

1. **Contract** — what separates it from a static fade or placeholder: property, from-value, to-value,
   duration, trigger.
2. **Wiring** — the real trigger fired (CDP `Input.*` click/wheel/touch/key, scroll, or the owning
   lifecycle event); `window.gsap` or `gsap.getTweensOf(el)` proves construction, never wiring.
3. **In-flight samples** — ≥2 distinct mid-execution reads (computed `transform`, rect, attribute),
   differing from each other and from both endpoints; equal samples mean a settled page.
4. **Settled endpoint and a11y state** — final style after `await __adGateP`, plus `inert`/
   `aria-hidden`, `mode`/`place`, and focus.
5. **Reverse and repeat** — gesture back (Escape, reverse wheel, second click), then again: no stacked
   tween, no drifted endpoint, no double-fire.
6. **Cleanup and pause** — ticker/rAF stops and listeners release on view close; a frame later nothing
   animates or logs.
7. **Reduced motion and no-JS** — `prefers-reduced-motion: reduce` and `html[data-motion="off"]` land
   on the still state; with scripts blocked the page still reads.

## Completion record — required before "done"

```text
Requested effect:     <the task sentence, not a paraphrase>
Actual wiring/input:  <CDP call or event that fired it; port and viewport>
In-flight evidence:   <two sampled states with values and timing>
Endpoint/cleanup:     <settled values, inert/aria-hidden, teardown observed>
Reduced-motion/no-JS: <what the still path did and how it was forced>
Viewport/visual:      <390x844, 768x1024, 1440x900 checked; screenshot reference>
Performance trace:    <trace file, or NOT MEASURED>
Regression:           <node tests/verify.mjs result, or why it is not warranted>
Substitutions:        <each substituted or unverified effect, spelled out>
```

## Reporting

Quote the command, the port, the viewport, and the numbers you read. Distinguish "measured" from
"expected", and list what you did not run. Do not run `tests/verify.mjs` for documentation-only work,
and never claim a green suite you did not execute.
