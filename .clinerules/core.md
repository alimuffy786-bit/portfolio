# core.md — always-on rules for this repository

This is a hand-written portfolio: `index.html` (all markup and CSS), `js/main.js` (all behaviour),
`js/ledger.js` (the guestbook). No build step, no framework, no `package.json`, no test runner
beyond `node tests/verify.mjs`.

## 1. Hard limits

- Change only what the task names. No refactors, no renames, no "while I'm here" cleanup.
- Never edit `js/Draggable.min.js` or `js/lenis.min.js`; never reformat `tests/verify.mjs` line endings.
- Never read or write `.cdp-run/`, credentials, or provider/MCP configuration.
- No new dependency without an explicit instruction; every feature-detect path must survive its absence.
- Never link `docs/*.md` from the page — the harness serves it as `application/octet-stream`.

## 2. Before editing

1. Read `docs/ARCHITECTURE.md` (states, section map, design contracts) and `docs/library-index.md`.
2. Find the owner of the code you are about to touch: the `§`-banner in the `<style>` blocks, or the
   section comment in `js/main.js`. Edit at the owner, not at a convenient look-alike.
3. Measure current behaviour. Numbers in these docs are pointers, not values to quote as fresh.

## 3. After editing

- Re-read your own diff and confirm it is the smallest edit that satisfies the request.
- `docs/qa-contract.md` says when `node tests/verify.mjs` is warranted — it is not, for docs-only work.
  Known baseline (2026-11-23): 110 passed, 1 failed at 6.8. That failure is pre-existing; never hide it.
- State what you verified and what you did not. "UNVERIFIED" is an acceptable answer; a guess is not.

## 4. Skills — read the matching one before the matching work

- `.cline/skills/minimal-code-ponytail/SKILL.md` — the smallest correct diff
- `.cline/skills/frontend-editorial/SKILL.md` — type, rhythm, riso/print surface
- `.cline/skills/gsap-lenis-motion/SKILL.md` — timelines, Flip, Observer, Lenis
- `.cline/skills/shaders-and-filters/SKILL.md` — SVG filters today, shaders only when planned
- `.cline/skills/procedural-web-audio/SKILL.md` — the sound wave, Web Audio
- `.cline/skills/mobile-touch-physics/SKILL.md` — touch, the phone deck, gesture roles
- `.cline/skills/cdp-qa-verify/SKILL.md` — drive the page over CDP and measure it
- `.cline/skills/surgical-debug-no-loops/SKILL.md` — one hypothesis, one measurement
- `.cline/skills/docs-lookup/SKILL.md` — versions, official docs, no invented APIs
- `.cline/skills/accessibility-audit/SKILL.md` — contrast, focus, inert, reduced motion

## 5. Voice

Write like the code: exact and unmarketed. In reports, name the file and the line you changed.
