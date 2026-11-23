# QA CONTRACT — tests/verify.mjs

Last recorded observation: **2026-11-23 — 111 passed, 0 failed (exit 0)**, two consecutive runs.
Those are real runs, not runs made during a documentation pass. An earlier note here recorded 6.8
failing; that was the harness reading `#flood` after `sleep(70)` — mid-fit, where the 450 ms
`power4.inOut` has already spent ~23% of the travel — not the page. Group 6 now reads the seed
frame in the same task as the click: same label, same tolerance, 111 invariants. Green is a fresh
run's result, never an exemption for the next one.

## 1. Invocation (verified)

```text
node tests/verify.mjs            # full run
node tests/verify.mjs --shots    # same assertions, plus screenshots
```

- Exit `0` = green, exit `1` = at least one failure (a harness exception also exits `1`).
- There is no `npm test`, no `package.json`, and no second runner. Do not invent one.
- `--shots` only adds evidence: after the assertions it re-navigates and captures
  `.cdp-run/shots/inv-<timestamp>/cover.png`, `index.png`, `work.png`. It changes no assertion.
- A run creates `.cdp-run/profile-<timestamp>/` and deletes it in `finally`. Do not commit,
  read, or hand-edit anything under `.cdp-run/`.

## 2. Environment (verified)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORTFOLIO_PORT` | `8777` | **static file server** port, bound to `127.0.0.1` |
| `PORTFOLIO_DBG` | `9355` | **Chrome remote-debugging** port (CDP endpoint) |
| `PORTFOLIO_CHROME` | `C:\Program Files\Google\Chrome\Application\chrome.exe` | browser binary |

The two ports have different jobs and are not interchangeable: `PORTFOLIO_PORT` serves the repo,
`PORTFOLIO_DBG` is where the harness discovers the browser's WebSocket and issues CDP commands.
Chrome is launched headless (`--headless=new`, `--disable-gpu`, `--window-size=1440,900`,
`--force-device-scale-factor=1`, isolated `--user-data-dir`) and killed at the end.

The harness speaks CDP directly through its own minimal client — no Puppeteer, no Playwright.

## 3. What a run actually covers

1. Reads `index.html`, both `<style>` blocks, `js/main.js` and `js/ledger.js` once.
2. Serves the repo over HTTP with `cache-control: no-store`.
3. Loads `http://127.0.0.1:<PORT>/index.html`, waits for `document.fonts`.
4. Drives states through `window.__ad` (`cover()`, `index()`, `view(id)`) and gestures through
   CDP input events (wheel, key, touch emulation), then measures the live DOM.
5. Collects console errors/exceptions and any response ≥400 for the whole session (group 13).

## 4. The 13 groups (verified titles)

1. THE CONTRACT (source order, one object per job)
2. BOOT (the machine is wired, the room is quiet)
3. THE COVER IS ONE SCREEN
4. THE INDEX TILES THE SCREEN
5. INTENT (a wheel notch opens the gate; momentum does not)
6. A VIEW IS ONE PLACE (exclusive, flood-lit from the block)
7. ROUTING AND HISTORY
8. ESCAPE, FOCUS, AND THE OVERLAY
9. MOTION OFF IS A PAGE, NOT A BROKEN ANIMATION
10. THE ARTIFACTS
11. THE SAME RULES AT 390, 768 AND 1440
12. A THUMB IS NOT A WHEEL
13. QUIET ACROSS THE WHOLE RUN

## 5. Invariant budget

111 runtime invariants, labelled `<group>.<ordinal>` (so `6.8` is the eighth check inside group 6).
They measure **the page**, not the file: relations the same run measured on both sides, not pixel
constants copied from the design. Preserve the count and the meaning of each label — do not
renumber, merge, or delete a check to make a run quieter.

## 6. Viewports and input (verified)

- Three rows, measured in one run: **390×844**, **768×1024**, **1440×900** (device metrics override,
  device scale 1).
- Touch is CDP emulation (`Emulation.setTouchEmulationEnabled`), and wheel/key presses are CDP
  input events. That proves the handlers are wired; it does **not** reproduce real iOS/Android
  gesture physics, momentum, or the platform's own scroll. Label real-device results separately.
- State transitions are driven through `window.__ad` — the same functions a press calls — so a
  measured transition is the reader's transition, not a test-only path.

## 7. Evidence layers — keep them apart in any report

| Layer | Proves | Does **not** prove |
| --- | --- | --- |
| Programmatic (`window.__ad`, `__adGateP`) | the state machine and its invariants | how a gesture feels |
| Synthetic input (CDP wheel / touch / key) | the listeners and the routing they trigger | real touch physics, real scroll |
| Automated accessibility | *nothing yet* — there is no axe or WCAG audit in this harness | accessibility compliance |
| Manual / real device | iOS & Android scroll, pinch zoom, VoiceOver/NVDA, hardware feel | repeatability — say it was manual |

Group 8 checks Escape, focus and overlay semantics (`inert`, `aria-hidden`, `[hidden]`), which is
real coverage of those behaviours — and still not an accessibility audit.

## 8. Known limitations (describe them, do not excuse them)

- **Markdown is not servable.** The harness's type map has no `.md` entry and unknown extensions
  fall back to `application/octet-stream`, so a browser does not render a `docs/*.md` page; adding
  such a link to `index.html` fails invariant 13.2 (user-observed). `docs/` is developer-only —
  never link it from the page.
- **No a11y certification.** A DevTools/Lighthouse accessibility snapshot is not an axe/WCAG audit.
- **GPU cost is invisible here.** Chrome runs `--headless=new --disable-gpu`; an SVG filter or
  transform that is expensive on a real device can pass. Measure cost on hardware before blaming it.
- **Timing.** `settles()` polls a predicate; on a loaded machine a check can fail for "not settled".
  Re-run before calling it a regression.
- **A green baseline is a past result.** The last observed run was 111 passed / 0 failed
  (2026-11-23). Any green claim must still come from a fresh run you actually performed, with the
  command and exit status quoted; the recorded number is a pointer, not a promise.

## 9. Editing the harness — future, explicitly authorised tasks only

- Preserve `tests/verify.mjs` as **CRLF, no BOM**; do not let an editor rewrite line endings.
- Keep 13 groups and the 111 invariant meanings. Add checks; never delete or renumber meaning.
- No weakened assertions, no skipped checks, no widened tolerances to obtain green.
- Say plainly whether a failure is pre-existing or a regression, and show the evidence for that
  judgement. A failing invariant is information, not noise.
- Do not run the suite for documentation-only work: it writes `.cdp-run/`, starts a server and a
  browser, and is not evidence about Markdown.
