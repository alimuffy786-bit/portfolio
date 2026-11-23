---
name: accessibility-audit
description: "Use for contrast, focus, keyboard and screen-reader work: token-level AA checks, visible focus, the inert/aria-hidden pair, Escape and overlay semantics, reduced motion, live regions. Measure; do not declare certification."
---

# Accessibility as a measured property

The harness's group 8 covers Escape, focus and the overlay's `inert`/`aria-hidden` semantics. That is
real coverage of those behaviours — and it is **not** an accessibility audit. Neither is this skill.
Both are evidence; a conformance claim would need axe/WCAG review and assistive-technology testing.

## Colour and contrast

- Text needs **4.5:1** (AA) at body size; **3:1** for large text (≥24px, or ≥18.66px bold) and for
  UI boundaries and focus indicators.
- The pairs that matter here: `--bone` on `--dark`, `--ink` on `--bone`, `--accent` on `--bone`,
  `--brass` on `--bone`, and anything on `--pop-1`…`--pop-4`. The two `--muted` values are documented
  AA re-derivations — do not "restore" a paler grey, and do not darken a pop to make ink sit on it
  without re-measuring both sides.
- Compute the ratio (relative luminance, sRGB) or read it from a tool; never estimate by eye, and
  never quote a ratio you did not calculate. Borderline means **fail**.
- Texture and SVG grain reduce effective contrast: check the ink-on-paper pair as rendered, not as
  token hex.

## Keyboard and focus

- Tab order must follow the visual order of the live view. `shape()` sets `inert` (non-interactive,
  out of the tab ring) and `aria-hidden` (out of the tree) together, from the same `mode`/`place`
  pair — never hand-write one without the other, and never rely on `display:none` alone.
- Focus must be visible on every control, including on `--dark` and on the pops. `outline: none`
  without a replacement is a defect.
- Escape closes the overlay/settings drawer and returns focus to what opened it. Focus must never
  land inside a hidden or inert subtree after a state change.
- No keyboard trap except a deliberate modal — and that one must release on Escape.
- Buttons are `<button>`, links are `<a href>`; no click handler on a `<div>`.

## Semantics and assistive tech

- One `<h1>`, headings in order, landmarks real (`<header>`, `<main>`, `<nav>`, `<footer>`), the
  rail's current place exposed (not colour-only).
- The visitor ledger and any async status need a polite live region; new entries announced once, not
  re-announced on every repaint. Guestbook text renders as text, never as HTML.
- Images with meaning carry `alt`; decorative art carries `alt=""` and is not in the tab ring.
- Sound is never the only feedback, and never autoplays (procedural-web-audio skill).

## Motion and preference

- `prefers-reduced-motion: reduce` and `html[data-motion="off"]` both mean: no smoothing, no tweens,
  no residual animation — a complete page, not a crippled one. Test the pair after every motion edit.
- `data-a11y` is its own switch, persisted as `ad-a11y`. Respect each preference separately.

## Reporting

Name the check, the values, and the method (`bone #EDE6D4 on dark #14100C = 15.2:1, computed`), then
list what is unverified: screen-reader behaviour, real-device zoom, anything you did not run.
