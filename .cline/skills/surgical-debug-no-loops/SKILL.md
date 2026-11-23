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

## Anti-patterns this repo punishes

Stacked `console.log` debugging left in the tree; parallel state resurrected to "isolate" a problem;
disabling a harness assertion to see the rest of the run; fixing the one viewport that reproduces it.
