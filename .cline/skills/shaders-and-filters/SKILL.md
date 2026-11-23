---
name: shaders-and-filters
description: "Use for grain, ink bleed, halftone or displacement work. SVG filters and blend modes ship today; OGL, three.js, canvas and WebGL do not exist in this tree. Includes the gate for adding a shader honestly."
---

# Filters now, shaders only by decision

## What actually ships

- An inline **SVG filter sprite** in `index.html` (referenced from CSS), plus CSS filter functions
  and blend modes. The ink-bleed hover pass is `§12c`; the paper grain and misregistration come from
  the same sprite.
- No `<canvas>`, no WebGL context, no `OGL`, no `three.js`, no shader files. Nothing in `js/main.js`
  creates a rendering context.
- Therefore: you may not describe an effect as GPU-shader-driven, and you may not "reach for" a
  fragment shader that does not exist here.

## Working with SVG filters

- Reuse an existing filter by `id` before writing a new one. Duplicated sprites are the main source
  of drift in this file.
- `feTurbulence` `baseFrequency` is in user units per pixel — it scales with the element, so a grain
  that looks right on the hero will crawl on a small tile. Anchor the filter region.
- Set `filterUnits`/`x`/`y`/`width`/`height` (or `objectBoundingBox` margins) deliberately: the
  default region clips shadows and blurs in ways that look like a layout bug.
- Animate `transform`/`opacity`, not `filter` values, in a loop; animating a filter re-rasterises the
  region every frame and is the expensive path on real hardware.
- Keep a still fallback: `@media (prefers-reduced-motion: reduce)` and `html[data-motion="off"]` drop
  the animation, not the texture.

## Measured trace & lifecycle gate

Any new ink, filter or canvas effect needs a before/after performance record, not an impression:

1. Record a short Chrome DevTools interaction trace (`5–10s`) on the **unchanged** tree, covering
   activation and settle; keep the file.
2. Apply the change, run the identical script, record again. Compare frames, scripting time and paint
   — the trace names when the effect starts, when it settles, and what runs in between.
3. Headless `--disable-gpu` flattens real compositing cost (`docs/qa-contract.md` §8): the trace is a
   shape check, not a verdict on a laptop.

Any of these is an immediate failure, not a tuning note:

- a loop, ticker or rAF still running while its view is `inert`/hidden or `document.hidden`;
- a duplicate listener or a second ticker after the view is reopened;
- motion under `prefers-reduced-motion: reduce` or `html[data-motion="off"]` — a leak, not a taste;
- per-frame GPU allocation: a filter primitive, canvas texture or buffer created inside the frame
  callback instead of once at setup.

## If a task explicitly authorises a shader

Treat it as a dependency, not a flourish:

1. Get the instruction in writing (which library, which version, which effect, which fallback).
2. No build step exists: it must work as a classic script, so add the tag, then feature-detect it
   (`if (!window.OGL)`) and keep the CSS/SVG path as the fallback — the page must never depend on it.
3. Shader work is decorative here: it may never carry biography text, controls or navigation.
4. Cost control: cap device pixel ratio, size the drawing buffer to the element, pause rendering when
   the gate is hidden or the document is hidden, and dispose (`WEBGL_lose_context`) on teardown.
5. Motion-off means no continuous rendering at all, not a lower frame rate.
6. Measure on real hardware. Headless Chrome runs `--disable-gpu`; a comfortable `--shots` run says
   nothing about fan noise on a laptop (see `docs/qa-contract.md` §8).

## Honesty clause

When you report, say which layer did the work: an SVG filter, a CSS effect, or (only after the above)
a shader. "It's a shader" about an SVG displacement is a false claim a reader will catch.
