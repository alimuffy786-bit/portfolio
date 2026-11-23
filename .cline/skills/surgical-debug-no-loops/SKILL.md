---
name: surgical-debug-no-loops
description: "Use when something is broken: one hypothesis, one measurement, one edit. Reproduce first, bisect the owner, verify the fix, stop. No shotgun edits, no retry-until-green, no try/catch instead of a diagnosis."
---

# Surgical debugging

A bug is a claim about the running page. Diagnose it there, once, then fix one thing.

## The loop (do not skip a step, do not add a second loop)

1. **Reproduce.** Exact viewport, exact state (`cover`/`index`/`view`), exact input. If you cannot
   reproduce it, you cannot know you fixed it — say so and stop guessing.
2. **Read the evidence before touching code.** The console stack first, then the network, then the
   DOM. In this repo a single unhandled rejection or a 404 fails harness group 13, and the exception
   usually names the owner.
3. **One hypothesis**, written as a falsifiable sentence: "the gate re-arms before `__adGateP`
   settles, so the second notch is swallowed".
4. **One measurement** that discriminates: a CDP evaluate, a logpoint, a value read from
   `window.__ad`/`__adGateP`. Not five experiments at once — you will not know which one changed.
5. **One edit**, at the owner (§-banner / `main.js` section). Smallest change that the hypothesis
   requires.
6. **Re-measure the same thing**, plus the neighbouring behaviours the edit could disturb.
7. **Stop.** Report cause, fix, measurement, and what remains unverified.

## House rules

- Never "try" a fix to see if the symptom moves. That is a random walk with extra steps.
- Never wrap the symptom in `try/catch`, a `setTimeout`, or a `!important` to make it quiet. Feature
  detection with a genuine fallback is the only sanctioned quiet path.
- Never re-run the full harness repeatedly hoping for green. A flake is a finding: quote the failing
  invariant, re-run once, and label it flake or regression with the evidence.
- Do not edit a neighbour to compensate for a broken owner. If `shape()` is wrong, fix `shape()`.
- Check state coupling before blaming the input: `mode`, `place`, `data-motion`, `data-a11y`,
  `data-sound` are global and persist across reloads (`ad-motion`, `ad-a11y`, `ad-sound`). A "bug"
  caused by a stale preference is a five-second check, not a refactor.
- If two hypotheses remain and one measurement can separate them, take that measurement — do not
  take both edits.
- Timebox: if three measurements in a row change nothing, the hypothesis is wrong. Reset to step 2
  with the new information instead of escalating the size of the edit.

## Large-file safe editing

`index.html` is ~2,979 lines and `js/main.js` several thousand; a blind full-file rewrite destroys work.

- Locate a unique anchor first: the `§`-banner, the function name with its section comment, or a
  selector that appears once. Confirm the anchor is unique before replacing anything.
- On a diff mismatch (old text missing, or matched twice): reread the current target range, then retry
  **once** with a smaller, more unique anchor.
- A second mismatch means the model of the file is wrong, not the anchor. Stop and diagnose: quote
  what the range actually contains. Never fall back to rewriting the whole file.
- After the edit, check the diff shape: `git diff --stat` plus the changed hunk's line count. A
  one-line intent that produced a 200-line diff is a bug in the edit method.
- Do not reformat, reorder script tags or normalise line endings as part of a surgical fix
  (`tests/verify.mjs` is CRLF; the rest of the tree is LF).

## Plan → Act handoff

Write this block before the first edit of an Act step, so acting has nothing left to invent:

```text
Target effect:        <one sentence: observable before → after>
Authorized files:     <exact paths + § owner / main.js section for each>
Init/event path:      <the listener, state change or lifecycle that fires it>
Dependency status:    <GSAP/Lenis/Draggable/Supabase present or feature-detected absent>
Acceptance evidence:  <the measurement that proves it: hook, sample pair, viewport>
Fallback/cleanup:     <reduced-motion path, teardown, inert/aria-hidden owner>
Deferred:             <explicitly out of scope, with the reason>
```

## Anti-patterns this repo punishes

Stacked `console.log` debugging left in the tree; parallel state resurrected to "isolate" a problem;
disabling a harness assertion to see the rest of the run; fixing the one viewport that reproduces it.
