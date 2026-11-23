---
paths:
  - "index.html"
  - "**/*.html"
---

# html-css.md — the sheet (`index.html`)

All markup and all CSS live in one 2,979-line file: two `<style>` blocks plus an SVG filter sprite
and one inline boot script. There is no `css/` directory and nothing is compiled.

## Where things live

- `§`-banners mark CSS ownership: `§00` fonts, `§01` tokens, `§02` reset, `§02b` smooth scroll,
  `§03` typography, `§04` primitives, `§05`–`§05d` chrome, `§06`/`§06b` hero + metroboard,
  `§07`–`§11` places, `§12`–`§12d` the room and the ledger, `§13` responsive, `§14` preference
  switches, `§16`/`§16d` the gate. **There is no `§15`.**
- Parse order is the cascade. Appending a block at the end is not free — check what it overrides.
- State lives on `<html>`: `data-mode` (`cover`/`index`/`view`), `data-place`, `data-motion`,
  `data-a11y`, `data-sound`. Selectors key off those, not off ad-hoc classes.
- `#gate` is cover **and** index; in `view` it is `hidden`. One `[data-view]` section is live.

## Rules

- Add a `§`-banner for a new block instead of burying rules inside an unrelated one.
- Colour comes from tokens — `--dark`, `--bone`, `--ink`, `--accent`, `--brass`, `--muted`,
  `--muted-dark`, `--pop-1`…`--pop-4`, `--hairline`. Both `--muted` values are AA re-derivations:
  measure contrast before "restoring" a paler grey (see the accessibility-audit skill).
- Layout comes from `--measure:42ch`, `--maxw:1280px`, `--pad:5vw`, `--head-h`, `--board-h`,
  `--frame-cols`. No magic pixel that duplicates a token.
- Animate `transform` and `opacity`. `filter` here runs through SVG filters — expensive on real
  hardware, and headless Chrome will not tell you (see `docs/qa-contract.md` §8).
- Every animation needs a still path: `@media (prefers-reduced-motion: reduce)` and
  `html[data-motion="off"]`. Motion-off must be a page, not a broken animation.
- Keep hit targets honest: a decorative overlay gets `pointer-events:none`, a control stays a real
  `<button>`/`<a href>`. Never attach behaviour to a `<div>` with a click handler.
- Do not hand-write `inert`/`aria-hidden` on `[data-view]` in markup: `shape()` in `js/main.js`
  owns that pair for every view, from the same `mode`/`place` values the CSS uses.
- Do not add a CDN `<script>` or stylesheet without an explicit instruction; a new tag also changes
  the harness's group-1 source-order contract.
- Do not inline `style="..."` for layout. Classes, flat specificity, no `!important` to win a fight
  that should be resolved at the owner.

## After touching this file

Measure at 390, 768 and 1440 (emulation is enough for layout; real devices for touch feel). Check
`html[data-mode]` in all three states, and re-read the diff for accidental reordering of the sprite
or the script tags.
