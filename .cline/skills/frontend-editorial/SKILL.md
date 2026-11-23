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

## Scoped visual & geometry review

Review the isolated target `[data-view]` — the one `shape()` left live — at `390×844`, `768×1024` and
`1440×900`, in all three states, motion on and off:

1. Wait for `document.fonts.ready` and for the target's images (`img.complete && img.naturalWidth > 0`)
   before measuring, or you are inspecting a fallback face.
2. Headings and captions: wrapping at the measure edge, orphan words, and descender clipping — a
   tight `line-height` or a clipped `overflow` cutting `g`, `y`, `p` under a display face.
3. Overlap: separate intentional from accidental. Stamp, tape and sticker overlaps are designed —
   preserve them. Text over text, a hairline through a glyph, or a control under a plate is a bug.
4. Focus rings: tab through every control in the target; the ring is visible, unclipped, and not
   covered by a decorative overlay.
5. Occlusion: at each interactive target's centre, `document.elementFromPoint(x, y)` resolves to that
   control or its own descendant — never to an overlay above it.
6. Screenshots (a `--shots` run or a direct capture) are saved for human aesthetic review and sit
   beside the programmatic geometry and computed-style numbers, never instead of them.

Contrast-check every new colour pair (accessibility-audit skill) instead of trusting the eye.
