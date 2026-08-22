# Completeness Audit Round 2 — 2026-08-22

**Spec:** CLI Status and Next Steps (`2026-08-22_15-59_cli-status-and-next`)
**Spec version:** v0.1
**Auditor:** Claude (fork agent)
**Files examined:** `_index.md`, `guiding-principles.md`, `out-of-scope.md`, `threat-model.md`, `config-dir.md`, `shared-cli.md`, `sdk-xdg.md`, `violations-migration.md`, `wdrive-migration.md`, `scrapers.md`

## Summary

All 10 round-1 issues are confirmed resolved. No new BLOCKING issues were found. The spec is implementable as written. Four residual inconsistencies remain in `threat-model.md`: two stale/missing cross-references in the mitigations table (T-05 not linked to Q-10; T-06 still references resolved Q-1 instead of open Q-11), plus T-03 and T-07 which are open with no linked decision or question. One MAJOR issue was found in `violations-migration.md`: D-11's summary text says "tsc for type-check only" but the actual build pipeline in the same file requires `tsc` with emit as Step 1. This will mislead an implementer reading only the decision tables. Two NOTE-level observations round out the findings.

## Issues

| ID    | Severity | File                                   | Description                                                                                                                              |
| ----- | -------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| R2-01 | MAJOR    | `violations-migration.md`, `_index.md` | D-11 says "tsc for type-check only (--noEmit)" but Step 1 of the build pipeline requires `tsc` WITH emit to produce `dist/` for esbuild. |
| R2-02 | MINOR    | `threat-model.md`                      | T-06 row Decision# references Q-1, which is resolved. Should reference Q-11 (open, tracks blast radius).                                 |
| R2-03 | MINOR    | `threat-model.md`                      | T-05 row Decision# is "-" despite Q-10 being added specifically to track it (C-06 fix was incomplete).                                   |
| R2-04 | MINOR    | `threat-model.md`                      | T-03 is "Open                                                                                                                            | -" (no decision or question) — accepted-risk posture not formalised. T-07 is "Open | -" — should reference D-7 (deferred) to show it is tracked. |
| R2-05 | NOTE     | `_index.md`                            | Changelog has no entry for D-18, Q-10, Q-11, completeness/consistency audit rows, or round-1 fixes.                                      |
| R2-06 | NOTE     | `shared-cli.md`                        | "T-NEW" label uses the same T-XX namespace as threat IDs (T-01 through T-07); namespace collision can confuse readers.                   |

## Per-issue detail

### R2-01 — D-11 "tsc for type-check only" contradicts Step 1 (emit required)

**File:** `violations-migration.md` (Design — Build pipeline, Step 1); `_index.md` (D-11); `violations-migration.md` Decisions table (D-11)

**What the decision says:**

> D-11: "esbuild single bundle violations.cjs; tsc for type-check only (--noEmit); no runtime TypeScript compilation in the CLI itself"

**What the design actually requires:**

```
Step 1: tsc  <- compiles src/ to dist/ (emit ENABLED)
Step 2: esbuild dist/cli.js -> violations.cjs
Step 3: tsc --noEmit  <- CI type-check only, separate job
```

Step 3 is "type-check only". Steps 1-2 are the actual build pipeline and require `tsc` to emit `dist/`. An implementer reading D-11 in either the `_index.md` or the violations-migration.md decisions table will understand "tsc --noEmit only" and will not run `tsc` with emit — causing esbuild to fail because `dist/cli.js` will not exist.

The violations-migration.md design body already contains a clarifying note ("Running `tsc --noEmit` alone (without prior tsc emit) would leave `dist/` absent and cause esbuild to fail"), so the design section itself is correct. The problem is that the decision summary in both tables is inaccurate.

**Fix:** Update D-11 in both locations to clarify: "esbuild single bundle violations.cjs; tsc WITH emit produces dist/ for esbuild; tsc --noEmit is the CI type-check job (separate step); no runtime TypeScript compilation"

---

### R2-02 — T-06 references resolved Q-1 instead of open Q-11

**File:** `threat-model.md`, mitigations table row T-06, Decision# column

**Current state:**

```
| T-06 | Tampering | shared-cli published as malicious version | ... | Open | Q-1 |
```

Q-1 is "Resolved by D-3" in `_index.md`. The blast-radius concern (pinning strategy) is now tracked as Q-11, which is still Open.

**Fix:** Change T-06 Decision# from `Q-1` to `Q-11`.

---

### R2-03 — T-05 Decision# is "-" despite Q-10 tracking it

**File:** `threat-model.md`, mitigations table row T-05

**Current state:**

```
| T-05 | Elevation of Privilege | ... | Open | - |
```

Round-1 fix C-06 added Q-10 to `_index.md` specifically to track T-05's open question ("Should CLIs warn when running as root/admin?"). The prose at the bottom of `threat-model.md` also notes "Q: T-05 -- should self-check explicitly verify it is not running as root/admin? -> new open question candidate". The table row was never updated.

**Fix:** Change T-05 Decision# from `-` to `Q-10`.

---

### R2-04 — T-03 and T-07 open with no linked decision or question

**File:** `threat-model.md`, mitigations table rows T-03 and T-07

**T-03 (Information Disclosure):**

- Status: Open | -
- Mitigation says "No secrets currently stored" — this is an accepted-risk posture (nothing to do now)
- Without a formal "accepted risk" decision or a question tracking when to revisit, this Open hangs indefinitely
- Fix: Either add a decision (e.g., "T-03 accepted as low risk until auth tokens are introduced") or add an open question

**T-07 (UpdateCmd injection, T8 scope only):**

- Status: Open | -
- T8 is deferred out of scope by D-7; the table gives no indication this is tracked
- Fix: Change T-07 Decision# from `-` to `D-7` to show it is tracked via the deferral decision

---

### R2-05 — Changelog not updated after round-1 fixes

**File:** `_index.md`, Changelog table

The changelog has 3 rows: initial creation (D-1 to D-17), security audit, architecture audit. Missing:

- D-18 added (completeness audit round 1 fix)
- Q-10 and Q-11 added
- Completeness audit completed (present in Decision Log but not Changelog)
- Consistency audit completed (present in Decision Log but not Changelog)
- Round-1 fixes applied (config-dir.md, shared-cli.md, scrapers.md created, threat-model.md updated)

**Fix:** Add a changelog row documenting the round-1 audit and fixes.

---

### R2-06 — "T-NEW" in shared-cli.md collides with threat ID namespace

**File:** `shared-cli.md`, Design section heading "### package.json (T-NEW: pre-publish changes required)"

T-NEW is used here as a task label (referring to a new task in the migration plan), but T-01 through T-07 are threat IDs in `threat-model.md`. A reader scanning for threat references will be confused by `T-NEW`.

**Fix:** Rename to avoid the T-XX prefix, e.g., "### package.json pre-publish changes" or use a distinct prefix.

---

## Verdict

**PASS WITH NOTES**

The spec is complete enough to begin implementation. No blocking issues. One MAJOR issue (R2-01) should be fixed before violations-framework T4 migration work begins, as it will directly mislead the implementer. The MINOR issues (R2-02 through R2-04) are housekeeping in the threat-model table and can be fixed concurrently with implementation prep.
