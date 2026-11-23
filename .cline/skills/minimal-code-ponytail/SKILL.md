---
name: minimal-code-ponytail
description: "Use before writing any code: tie the solution back to the smallest correct diff. Reuse the existing owner, change one thing, add no abstraction, verify by measurement, and decline work the task did not ask for."
---

# Minimal code, tied back

A ponytail is hair tied back so it stays out of the way: everything not load-bearing is removed.

## Five questions before writing a line

1. Does the task ask for this? If not, it is out of scope — say so instead of doing it.
2. Does it already exist? Search the owner first (`§`-banner in the `<style>` blocks, section
   comment in `js/main.js`). Reuse beats add, always.
3. What is the smallest edit that changes the observable behaviour? Usually one declaration.
4. What breaks if this code were absent? If the answer is "nothing", do not write it.
5. Can it be measured? If not, you cannot claim it works — say **UNVERIFIED**.

## Anti-patterns in this repo

- A new CSS block for a one-property fix, instead of the owner rule that already sets it.
- A wrapper around a single call; a config object with one key; an options bag nobody passes.
- Defensive branches for states the machine forbids — `shape()` already guarantees view exclusivity.
- Parallel state: a second variable mirroring `mode`/`place`, a second scroll listener, a second rAF.
- `try/catch` that swallows a real error. The house pattern is feature-detect, then a quiet path.
- Comments that restate the code. Comment the *why*, where a reader would otherwise "fix" it wrongly.
- Refactoring neighbours, renaming for taste, or reformatting untouched blocks — it destroys the diff.

## The shape of a good diff here

- One file, usually. If three files change, justify each one in the report.
- Same owner, same naming, same idiom as the lines around it.
- Delete at least as much as you add when you can.
- Verify by measuring the running page (CDP or `window.__ad`), and quote the command you ran.

## When "minimal" is wrong

Never minimise away correctness: the `inert`/`aria-hidden` pair, teardown and `destroy()` calls,
feature detection, and contrast are load-bearing, not decoration. Minimal is not terse-abusive — a
clear six-line block beats a clever one-liner nobody can debug.
