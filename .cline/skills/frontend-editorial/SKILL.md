---
name: frontend-editorial
description: "Use for visual work: type scale, rhythm, colour and riso/print texture. Cormorant + EB Garamond + Space Mono with self-hosted JSL Blackletter, 42ch measure, bone on near-black, 0.5px hairlines."
---

# The editorial surface

The page is a riso-printed broadsheet that happens to be a website: bone paper, near-black ink, one
red accent, brass for detail, a blackletter masthead. Every visual decision serves reading.

## Type

- Families come from tokens (§01), never from a raw family name: `--serif` Cormorant Garamond,
  `--eb` EB Garamond, `--mono` Space Mono (Google Fonts); `--serif-gothic` JSL Blackletter
  (self-hosted, preloaded, WOFF2 only); `--serif-grunge` Old Newspaper Types; `--serif-editorial`
  The Story of Nothing.
- Body prose sits at `--measure:42ch`. Wide body text is a bug, not a mood. Headings may break the
  measure; paragraphs may not.
- Hierarchy by size and space, not by colour noise. Two weights per family is plenty.
- Track small caps and mono labels positively; large display type needs negative tracking.
- Never fake small caps, never stretch a face, and never let a fallback silently stand in for a
  display face — confirm what actually loaded.

## Colour and texture

- Tokens only: `--dark:#14100C`, `--bone:#EDE6D4`, `--ink:#111929`, `--accent:#7A1818`,
  `--brass:#7D5A1F`, `--muted`, `--muted-dark`, `--pop-1`…`--pop-4`.
- Pops are punctuation — a sticker, a block, one line. Four pops on a screen is confetti.
- Paper grain, misregistration and ink bleed already exist (§12c plus the SVG sprite). Reuse them;
  do not invent a fresh texture per component.
- Hairlines are `--hairline:0.5px`. A 1px rule beside a 0.5px rule reads as a mistake, because it is.

## Rhythm

- Vertical rhythm from spacing tokens and section padding, not from margin-collapse accidents.
- Align to the frame: `--frame-cols`, `--maxw:1280px`, `--pad:5vw`. Off-frame elements read broken.
- Numbers and dates are tabular in mono and column-aligned; the work list and the ledger must line up.

## Motion is part of the type

- Movement may reveal hierarchy (a plate slapping down) but must never shift text under a reading
  eye. Residual, not perpetual.
- Every entrance has a still equivalent at `prefers-reduced-motion: reduce` and `data-motion="off"`.

## Before calling it done

Look at it at 390, 768 and 1440, in all three states, motion on and off, with the settings drawer
open. Contrast-check every new colour pair (accessibility-audit skill) instead of trusting the eye.
