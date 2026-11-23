---
name: docs-lookup
description: "Use before trusting memory about an API: pin the version from docs/library-index.md, read official docs, never parse minified bundles, never invent an ID or an auth flow. Record what you looked up and what it changed."
---

# Look it up, at the right version

## Order of sources

1. **This repo.** `docs/ARCHITECTURE.md` and `docs/library-index.md` state what ships and which
   version — cheaper and more truthful than a search engine.
2. **The running page.** If docs and behaviour disagree, behaviour wins; measure it (cdp-qa-verify).
3. **Official documentation**, matched to the exact version: GSAP **3.15.0** (core, Flip, Observer,
   Draggable) and Lenis **1.3.25**, plus Supabase JS **v2**. Links live in `docs/library-index.md` §4.
4. **Context7** for up-to-date library docs, resolved to a specific ID — but only once you actually
   need it: resolve the library, then query it, and never guess an ID from a plausible-looking name.

## Hard rules

- **Never open `js/Draggable.min.js` or `js/lenis.min.js`.** Minified bodies are unreadable and any
  "API" you infer from them is fiction. The vendor header (name, version, licence) is the only fact
  worth reading.
- **Never assume a capability is present.** There is no ScrollTrigger, ScrollSmoother, SplitType,
  OGL, `three.js`, canvas or WebGL in this tree. If a doc snippet starts `gsap.registerPlugin(
  ScrollTrigger)`, that snippet does not apply here — say so instead of adding the plugin.
- **Never invent an authentication or deployment flow** for a configured server (Supabase or any
  MCP/provider). If a lookup requires credentials or a token you do not have, stop and report the
  blocker; do not fabricate a login sequence, a key, or a "standard" setup step.
- **Version-gate every signature.** A GSAP v4 helper or a Lenis 2 option will silently do nothing
  here. Prefer the form the vendored major version documents.
- **No CDN installs.** Reading docs is not permission to add a `<script>` tag; that needs an explicit
  instruction and an update to `docs/library-index.md` on the same day.
- **Do not paste credentials** into a search, a URL, or a prompt. Ever.

## The loop

1. State the question precisely ("does Flip accept `absolute` in 3.15?").
2. Try the local files, then the official page for that version.
3. Extract the smallest applicable snippet, and check its preconditions (plugin registered, element
   exists, `window` global present).
4. Apply it at the owner, feature-detected, and measure the result.
5. Report the source you used and the version it described. If you could not confirm it, label the
   item **UNVERIFIED** rather than filling the gap from memory.
