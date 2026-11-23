# LIBRARY INDEX — what is loaded, when, and where to read about it

Verified against the working tree on 2026-11-23. Nothing here authorises installing, upgrading
or removing a dependency: that needs an explicit request in the current task.

## 1. Loading order (index.html, verified)

Every application script is a **classic** `src` tag at the end of `<body>` — no `defer`, no
`async`, no modules, no bundler. The order is load-bearing: `js/main.js` reads `window.gsap`,
`window.Flip`, `window.Observer`, `window.Draggable` and `window.Lenis` at parse time.

| # | Line | Tag | Delivery |
| --- | --- | --- | --- |
| 1 | 28 | inline `history.scrollRestoration='manual'` | inline, in `<head>`, before first paint |
| 2 | 2945 | GSAP **3.15.0** `gsap.min.js` | cdnjs, `integrity` SRI, `crossorigin`, `no-referrer` |
| 3 | 2946 | GSAP Flip **3.15.0** | cdnjs, SRI |
| 4 | 2961 | GSAP Observer **3.15.0** | cdnjs, SRI |
| 5 | 2968 | GSAP Draggable **3.15.0** | vendored `js/Draggable.min.js` (35,762 B, SHA-256 `EB28FF7A…`) |
| 6 | 2974 | Lenis **1.3.25** | vendored `js/lenis.min.js` (18,392 B, SHA-256 `239B9506…`) |
| 7 | 2975 | `js/main.js` | local, last of the motion stack |
| 8 | 2977 | `js/ledger.js` | local, guestbook |

The head also carries the Google Fonts CSS2 stylesheet (Cormorant Garamond, EB Garamond, Space
Mono), `preconnect` hints for `fonts.googleapis.com`, `fonts.gstatic.com` and
`cdnjs.cloudflare.com`, and a `preload` of the self-hosted `fonts/JSL-Blackletter-Normal.woff2`.

## 2. What each one does here (verified)

- **GSAP core** — the gate's commit tween, sticker slap-back, plate shuffles, morph timelines.
- **Flip** — the contents↔bar morph and the flood's `#flood` → `#floodProxy` fit.
- **Observer** — the gate's intent layer (§16d): one callback for wheel and touch, raw event on
  `self.event`, so main.js can tell the devices apart.
- **Draggable** — the hero's stickers only; `if (!window.Draggable)` leaves them as still prints.
- **Lenis** — desktop smoothing only, ≥768px, motion-on; destroyed below the breakpoint.
- **Supabase JS** — `@supabase/supabase-js@2.118.0` UMD from jsDelivr, injected by `js/ledger.js`
  on the first `ad:wall` event and never at page load. The key in that file is a **publishable**
  key (readable by design). It is not a secret — and it must never be replaced by a service-role
  key, in the frontend or anywhere else.

## 3. Not installed (verified absent)

No `ScrollTrigger`, `ScrollSmoother`, `SplitType`, `OGL`, `three.js`, `<canvas>` or WebGL context
exists in this tree, and there is no build tooling. Do not claim ScrollTrigger drives a timeline
here, and do not reach for a shader API that is not present. If a future authorised task adds a
library, record it here the same day: version, tag, loading form, and the feature-detect fallback.

## 4. Documentation

Official sources, matched to the versions above:
- GSAP core — https://gsap.com/docs/v3/
- GSAP Flip — https://gsap.com/docs/v3/Plugins/Flip/
- GSAP Observer — https://gsap.com/docs/v3/Plugins/Observer/
- GSAP Draggable — https://gsap.com/docs/v3/Plugins/Draggable/
- Lenis — https://github.com/darkroomengineering/lenis
- Supabase JS v2 — https://supabase.com/docs/reference/javascript/introduction

Context7: only `/cline/cline` was resolved during this documentation pass, and it documents Cline
itself, not a project dependency. No Context7 ID is recorded for GSAP, Lenis or Supabase because
none was verified here. Resolve one when you actually need it; never invent an ID, and do not
assume an authentication flow for a configured server.

## 5. Lookup rules

- Read this file first. It answers "which version" more cheaply than any web search.
- Query by exact version: a v4 GSAP or Lenis 2 signature does not apply to what ships here.
- Never open `js/*.min.js` to "check" an API — the bodies are minified and unreadable by design.
  Use upstream docs, or inspect the live page (see the cdp-qa-verify skill).
- If documentation and this repo disagree, the running page wins. Measure it before rewriting.
