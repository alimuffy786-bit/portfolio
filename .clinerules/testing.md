---
paths:
  - "tests/**"
  - "docs/qa-contract.md"
---

# testing.md — `node tests/verify.mjs`

The full contract lives in `docs/qa-contract.md`; this rule is the short form to obey while editing
the harness or judging a run.

## Running

```text
node tests/verify.mjs            # 13 groups, 111 invariants
node tests/verify.mjs --shots    # same assertions, plus .cdp-run/shots/inv-<ts>/
```

- Env: `PORTFOLIO_PORT` = static server port (`8777`), `PORTFOLIO_DBG` = Chrome DevTools port
  (`9355`), `PORTFOLIO_CHROME` = browser binary. Server port and debug port are not interchangeable.
- Exit `0` green, `1` failing. No `npm test`, no watcher, no alternate runner exists.
- Baseline, observed 2026-11-23: **111 passed, 0 failed (exit 0)** on two consecutive runs. The
  earlier 110/1 note was 6.8 sampling `#flood` after `sleep(70)` — mid-fit, not the origin; group 6
  reads the seed frame in the same task as the click, with the same label and tolerance. Never
  suppress, skip, retry-until-green or "fix" a failure without an explicit instruction — and never
  report green from a run you did not perform.
- It writes `.cdp-run/` (profile, shots, logs) and deletes the profile in `finally`. Do not commit
  or hand-edit it. Do not run the suite for documentation-only work.

## Editing the harness

- Preserve **CRLF and no BOM**; do not let an editor or formatter rewrite the file.
- Keep 13 groups and 111 invariants. Add checks; never delete a label, renumber a group, or soften
  a tolerance to reach green.
- Every assertion should measure a relation on the page (both sides measured in the same run), not a
  pixel constant copied from the design.
- Group 13 is the quiet contract: console errors and any response ≥400 fail the run. Fix the cause;
  do not filter the log.
- Timing: prefer polling predicates over fixed sleeps. A flake is a finding — quote it, re-run once,
  then report it as flake or regression, naming which.

## Judging results

- Separate **pre-existing** from **regression**: reproduce on the untouched tree before blaming a
  diff, and say which check moved.
- Keep evidence layers apart — programmatic hooks, synthetic CDP input, automated a11y (none here),
  manual/real device. `docs/qa-contract.md` §7 has the table; do not describe one layer's result as
  another's.
- Known harness limitation: `.md` is served as `application/octet-stream`, so a `docs/*.md` link in
  the page fails 13.2 (user-observed). Keep documentation off the page.
