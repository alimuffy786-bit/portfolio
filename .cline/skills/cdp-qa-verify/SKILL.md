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
- Ports are owned by the harness contract: `PORTFOLIO_PORT` (default `8777`) for the server,
  `PORTFOLIO_DBG` (default `9355`) for Chrome's DevTools endpoint, `PORTFOLIO_CHROME` for the binary.
  Pick a different server port if 8777 is busy — but keep the debug port distinct and say which you used.
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

## Reporting

Quote the command, the port, the viewport, and the numbers you read. Distinguish "measured" from
"expected", and list what you did not run. Do not run `tests/verify.mjs` for documentation-only work,
and never claim a green suite you did not execute.
