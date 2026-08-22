# Audit Report -- Consistency Round 2 -- CLI Status and Next Steps

**Date:** 2026-08-22
**Spec version:** v0.1
**Auditor:** Claude (spec mode)
**Basis:** Round 1 report (`audits/2026-08-22_consistency/report.md`); fixes F-01 to F-09 claimed applied.

## Scope

All 10 spec files re-read in full:
`_index.md`, `guiding-principles.md`, `out-of-scope.md`, `threat-model.md`,
`config-dir.md`, `shared-cli.md`, `sdk-xdg.md`, `violations-migration.md`,
`wdrive-migration.md`, `scrapers.md`.

Focus: residual issues from round 1 fixes and new issues only.

## Confirmed fixes (no residual issue)

| Round-1 ID | Fix claimed                                                         | Verified                                                                                                                  |
| ---------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| F-01       | shared-cli.md now reflects own repo (D-3/D-9 consistent)            | Yes -- shared-cli.md D-3 now says "Source lives in its own repo (`C:\Workspace_Tooling\shared-cli`)"                      |
| F-05       | shared-cli.md Q-1 resolved section updated                          | Yes -- "None -- all resolved (Q-1 resolved by D-3)"                                                                       |
| F-07       | migrateIfNeeded failure documented as non-fatal WITH stderr warning | Yes -- config-dir.md step 5 now has explicit warning text                                                                 |
| F-08       | Terminology: prose "scraper", package names "scrapper"              | Yes -- D-6 uses "Scrapers" (prose) with `@wadeck/shared-scrapper` (package name); scrapers.md documents the double-p rule |
| F-09       | CalVer placeholder standardized to BUILD                            | Yes -- violations-migration.md and scrapers.md both use `^1.YYYYMMDDHHMMSS.BUILD`                                         |

## Executive summary

6 findings: 0 CRITICAL, 0 HIGH, 3 MEDIUM (residual), 3 INFO (new). The three MEDIUM findings are incomplete fixes from round 1: F-04 (T7 still absent from T9 deps in out-of-scope.md), F-06 (T-06 still points to Q-1 instead of Q-11 in threat-model.md), and F-02 (sdk-xdg.md D-17 row still carries D-18 content). Three INFO findings cover missing changelog entries and a stale prose blurb.

## Findings

| ID   | Severity | R1 basis        | Finding                                                                                                                                                                                                                                                                                                                                                                  | File / Section                                                                 | Recommendation                                                                                                                                    |
| ---- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-01 | MEDIUM   | F-04 (residual) | **T9 dependency still missing T7 in out-of-scope.md.** T9 entry reads "Blocked on T5 (SDK XDG) and T8 (SDK UpdateCmd)". T7 (dead code cleanup) is absent. `wdrive-migration.md` correctly states "requires T5 + T7 + T8".                                                                                                                                                | `out-of-scope.md` T9 entry                                                     | Change to: "Blocked on T5, T7, and T8."                                                                                                           |
| R-02 | MEDIUM   | F-06 (residual) | **threat-model.md T-06 Decision # column still says "Q-1".** The Mitigations table row T-06 Decision # reads "Q-1". The "Open security questions" prose also says "see Open Questions Q-1 in _index.md". Q-1 is resolved (D-3); Q-11 (consumer pinning strategy) is the relevant open question.                                                                          | `threat-model.md` -- Mitigations table row T-06; Open security questions prose | Change T-06 Decision # to "Q-11". Update the prose reference to "see Open Questions Q-11 in _index.md".                                           |
| R-03 | MEDIUM   | F-02 (partial)  | **sdk-xdg.md Decisions table D-17 row carries D-18 content.** After the D-17/D-18 split, `sdk-xdg.md` still has a single D-17 row labelled "wdrive `--config <dir>` override must be preserved through T9 migration" -- which is D-18's content. D-17's actual meaning ("wdrive unchanged until T9; `~/.wdrive` is the config dir until T5+T9 land together") is absent. | `sdk-xdg.md` Decisions table                                                   | Correct the D-17 row to "wdrive `~/.wdrive` unchanged until T5+T9 land together" and add a D-18 row for the `--config <dir>` override constraint. |
| N-01 | INFO     | New             | **Changelog has no entry for round-1 fixes or D-18 addition.** The `_index.md` Changelog only records the initial spec creation and the security/architecture audits. D-18 addition and all F-01 to F-09 corrections are untracked.                                                                                                                                      | `_index.md` Changelog                                                          | Add a v0.1 changelog row: "Consistency round 1 fixes applied: D-18 added; F-01 through F-09 corrected."                                           |
| N-02 | INFO     | New             | **Security and architecture audits missing from Decision Log.** Header says "4 audits complete"; Changelog mentions both additional audits; but Decision Log has rows only for completeness and consistency (round 1).                                                                                                                                                   | `_index.md` Decision Log                                                       | Add rows for the security audit and architecture audit (same format as existing audit rows).                                                      |
| N-03 | INFO     | New             | **threat-model.md "Open security questions" section -- Q-10 prose is stale.** Closing prose says "T-05 -- should self-check explicitly verify it is not running as root/admin? -> new open question candidate". Q-10 is already a formal Open Question in `_index.md`.                                                                                                   | `threat-model.md` -- Open security questions section                           | Replace with "see Open Questions Q-10 in _index.md" (consistent with the Q-11 reference pattern).                                                 |

## New open questions raised

None -- all findings are fixable without a design decision.

## Round 1 fix status summary

| R1 ID | R1 Severity | Status                                                                                          |
| ----- | ----------- | ----------------------------------------------------------------------------------------------- |
| F-01  | CRITICAL    | Fixed                                                                                           |
| F-02  | HIGH        | Partial -- D-17/D-18 split in index and wdrive-migration correct; sdk-xdg.md still wrong (R-03) |
| F-03  | HIGH        | Accepted (T-NEW/T6 live in plan file, not spec modules)                                         |
| F-04  | MEDIUM      | Not fixed (R-01)                                                                                |
| F-05  | MEDIUM      | Fixed                                                                                           |
| F-06  | MEDIUM      | Not fixed (R-02)                                                                                |
| F-07  | MEDIUM      | Fixed                                                                                           |
| F-08  | INFO        | Fixed                                                                                           |
| F-09  | INFO        | Fixed                                                                                           |
