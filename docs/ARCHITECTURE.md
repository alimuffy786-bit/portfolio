# ARCHITECTURE — current tree

Legend: **verified** = read from the working tree during this documentation pass.
**user-observed** = a runtime observation supplied by the maintainer, not re-measured here.
**planned** = not present in the tree. Anything unmarked and unresolved is called out as UNVERIFIED.

## 1. File map (verified)

- `index.html` — 2,979 lines: all markup, all CSS (two `<style>` blocks), SVG filter sprite, one inline boot script.
- `js/main.js` — 3,680 lines: the application, one IIFE.
- `js/ledger.js` — 411 lines: visitor ledger, second IIFE, lazy Supabase SDK.
- `js/Draggable.min.js` — vendored GSAP **3.15.0** Draggable (35,762 B); `js/lenis.min.js` — vendored **Lenis 1.3.25** (18,392 B). Both LF, BOM-free.
- `tests/verify.mjs` — 925 lines, **CRLF**, no BOM. `CHANGELOG.md` — 434 lines, LF.
- `fonts/` (3 WOFF2 faces) and `images/` (WebP/PNG/JPG, incl. `images/wall/`).

No `package.json`, no build step, no `css/` directory, no framework. Nothing is compiled: the
browser loads `index.html`, three CDN scripts, two vendored files and `js/main.js`.

## 2. The three states (verified)

`js/main.js` holds two variables — `mode` (`cover` \| `index` \| `view`) and `place`
(`who` \| `work` \| `magazine` \| `reach`) — and writes them to `html[data-mode]`.

- **cover** — `#gate` renders the gothic riso broadsheet: `#hero` plus the `#metroboard` blocks.
- **index** — `#gate` again; the docked bar morphs into the contents. Not a separate document.
- **view** — `gate.hidden = true` and exactly one `[data-view]` section is live.

`shape()` (main.js ~2804) is the hard stop: for every `[data-view]` it sets or removes `inert`
**and** `aria-hidden` from the same `mode`/`place` pair, so the tab ring, the accessibility tree
and hit-testing can never disagree with the painted sheet.

The 4 views: `#who`, `#work`, `#magazine`, `#reach`. `#hero` carries `data-nav="hero"` but **no**
`data-view`; it is a place in the rail, not a view.

## 3. Section ownership map (§ = stylesheet banner, verified)

- **Sheet** — 00 fonts, 01 tokens, 02 reset + base, 02b smooth scroll, 03 typography, 04 primitives.
- **Chrome** — 05 head bar, 05a section links, 05b settings drawer, 05c page progress, 05d sound wave.
- **Hero + gate** — 06 hero (gothic riso), 06b metroboard, 16 the gate, 16d gate progress (JS only).
- **Places** — 07 who, 08 work, 09 leaflet modal, 10 magazine, 11 contact + footer.
- **Room + order** — 12 room (hidden layer) + bingo, 12b hairline pass, 12c ink bleed, 12d ledger.
- **Responsive + runtime** — 13 responsive, 13b1 tablet, 13b phone, 13c widescreen, 14 preferences.

No `§15` banner was observed. Source comments cite these numbers; keep them aligned when editing.

## 4. Design contracts (verified, §01)

Colour: `--dark:#14100C`, `--bone:#EDE6D4`, `--ink:#111929`, `--accent:#7A1818`, `--brass:#7D5A1F`,
`--muted:#6E6050`, `--muted-dark:rgba(237,230,212,0.62)`, pops `--pop-1:#A8D173` to `--pop-4:#9ED8F5`
(`--pop` aliases `--pop-1`). The two `--muted` values are documented AA re-derivations — measure
before "restoring" a paler grey.
Type: `--serif` Cormorant Garamond, `--eb` EB Garamond, `--mono` Space Mono (Google Fonts);
`--serif-gothic` JSL Blackletter (self-hosted, preloaded, WOFF2 only), `--serif-grunge` Old Newspaper
Types, `--serif-editorial` The Story of Nothing. Layout: `--measure:42ch`, `--maxw:1280px`,
`--pad:5vw`, `--head-h:3.4rem`, `--board-h:72px`, `--frame-cols`, `--hairline:0.5px`.

## 5. Runtime switches (verified)

| Attribute on `<html>` | Written by | Read by |
| --- | --- | --- |
| `data-motion` `on`/`off` | `applyPrefs()` | `stillMotion()`, stylesheet §14 |
| `data-a11y` `on`/`off` | `applyPrefs()` | `applyPrefs()` (accessibility owns motion while on) |
| `data-sound` `on`/`off` | audio module, from `localStorage['ad-sound']` | audio module, `#soundToggle`, wave |
| `data-mode` | `setMode()` | stylesheet §16 |

Storage keys: `ad-motion`, `ad-a11y` (settings drawer), `ad-sound` (audio module).
Reduced motion is `matchMedia('(prefers-reduced-motion: reduce)')` **or** `data-motion="off"`.
Sound is independent: a visitor may silence sound and keep motion, and vice versa. While the
accessibility switch is on it owns motion, and the motion row goes `aria-disabled` (still
readable), not `disabled`.

## 6. Public hooks (verified signatures)

`window.__ad` is assigned once, at the end of the IIFE:

`mode()`, `painted()`, `place()`, `progress()`, `revealed()`, `sheetPos` (the function itself,
not a wrapper), `readMode()`, `view(id)`, `index()`, `cover()`, `measure()`, `scrollTo(y)`,
`gate: { state, toIndex(), toCover(), setProgress(p) }`.

Also published: `window.__adGateP` (number written by `paint()`; `-1` in a view) and
`window.__adRailMeasure` (function, ~line 2634). Source comments describe these as the surface
the acceptance suite drives; treat the list as a compatibility contract, not decoration.

## 7. Lifecycle ownership (verified)

- **Scroll lock** — `syncScrollLock()` (:54) owns `body.dataset.scrollLock`, `body.style.overflow`
  and `--sbw` for `#lfModal.open`, `#artOverlay.open`, `#setPanel.open`. It stops and restarts the
  *same* Lenis instance and re-runs on `pageshow` and `visibilitychange`.
- **Smoother** — `syncSmoothScroll()` (:115) creates or `destroy()`s Lenis. Gates: `window.Lenis`,
  `min-width:768px`, `!stillMotion()`. Below 768px no instance exists at all (destroyed on resize).
- **Audio** — one `AudioContext` built on the first real gesture (`arm()`, :1929):
  `bus (gain 0.9) → DynamicsCompressor → destination`, plus a silent unlock buffer. Voices are
  capped by a counter and released from `onended` *and* a timer; `guard()` resets the counter if a
  voice throws. Material voices check `audible()` — live **and** motion welcome.
- **Gate machine** — `state = { p, transitioning, token, proxy }` (:2841). `commit()` is the only
  transition path; `token` invalidates stale tween writes; `state.transitioning` refuses a routing
  press mid-morph rather than queueing one.
- **Navigation** — one delegated `click` (:3482) for brand / `#headIndex` / `[data-back-index]` /
  `[data-open-view]` / `.metro-block` / `.head-nav-link`; `Escape` leaves a view only; the phone
  pull-up commits on 110px of raw travel with `touchcancel` as a non-committing end.
- **Ledger** — `js/ledger.js` never reaches into main.js's closure: it asks for the folio's voice
  over a DOM event (`ad:wall` opens the room and lazily injects the SDK).

## 8. No-JS / degradation contract

- The four `[data-view]` sections are **not** `hidden` in source (asserted by the harness, group 1);
  visibility is runtime-owned. Never hardcode `hidden` on them.
- Every library is feature-detected: `!window.gsap`, `!window.Flip`, `!window.Observer`,
  `!window.Draggable`, `!window.Lenis`, `!window.supabase` each have a quiet path. A missing CDN
  is a quieter page, not a broken one.
- The OG/meta block and the prose in `#hero`, `#who`, `#work`, `#magazine`, `#reach` are real
  HTML: the biography never depends on canvas, a filter, or audio succeeding.
- Beyond "sections stay in the DOM and are not `hidden`", the exact JS-disabled presentation is
  **UNVERIFIED** — do not assert what a JS-less first paint looks like without measuring it.

## 9. Planned / not in this tree (verified absent)

No **ScrollTrigger, ScrollSmoother, SplitType, OGL, `<canvas>`, or WebGL context** exists in this
tree. Motion is GSAP core + Flip + Observer + Draggable + Lenis on DOM nodes and CSS transforms;
any shader/OGL/halftone work is **planned**, and Pass-3 scope is **UNVERIFIED** here.
