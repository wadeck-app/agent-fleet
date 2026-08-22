# Final Audit Report (R4) -- CLI Status and Next Steps

**Date:** 2026-08-22
**Spec version:** v0.2.1
**Verdict:** PASS WITH NOTES

## Blockers (CRITICAL/HIGH)

none

## Non-blocking issues (MEDIUM/LOW/INFO)

### LOW-R4-01 -- `_index.md` status question count is still wrong after R3-F-01

**File:** `_index.md` header -- `**Status:**`
**Observed:** "11/12 questions resolved"
**Actual:** The Open Questions table contains exactly 11 rows (Q-1 through Q-11). Q-10 is "Open"; the other 10 are resolved. Correct fraction is **10/11**.
**Root cause:** R3-F-01 appears to have set the count to 11/12 instead of 10/11 -- an overcorrection (possibly counting 12 original questions when one was consolidated into a decision).
**Fix:** Change status line to `10/11 questions resolved`.

### LOW-R4-02 -- `_index.md` version field lags behind changelog

**File:** `_index.md` header -- `**Version:** v0.2`
**Observed:** The spec header still reads `v0.2`, but the last changelog entry is `v0.2.1` (R3 audit fixes applied 2026-08-22).
**Fix:** Update header to `**Version:** v0.2.1`.

### LOW-R4-03 -- Decision Log row for completeness-r3 audit is malformed

**File:** `_index.md` Decision Log, row 45
**Observed:** `| Audit R3 | 2026-08-22 | Completeness round 3 | audits/2026-08-22_completeness_r3/report.md |` -- 4 columns, columns out of order.
**Expected format (5 columns):** `| Audit (completeness r3) | Completeness round 3 completed -- <summary> | Completed | 2026-08-22 | See audits/2026-08-22_completeness_r3/report.md |`
**Fix:** Reformat that row to match the standard 5-column decision log format.

### INFO-R4-01 -- `shared-cli.md` exports list omits `UpdaterMain` subpath

**File:** `shared-cli.md` "Current exports" section
**Observed:** Lists `ConfigDir`, `UpdateManager`, `HookDispatcher`, `VersionValidation`. Does not document the `UpdaterMain` subpath export (`@wadeck/shared-cli/UpdaterMain`).
**Context:** `violations-migration.md` explicitly instructs consumers to create a `src/updater/UpdaterMain.ts` that re-exports from `@wadeck/shared-cli/UpdaterMain`. The subpath export must exist in the published package.
**Fix (documentation only):** Add `UpdaterMain` to the exports list in `shared-cli.md` with a note that it is a subpath export consumed by the violations-cli and flow-cli updater wrapper pattern.

### INFO-R4-02 -- Q-10 (root/admin self-check) remains explicitly open

**File:** `_index.md` Open Questions; `threat-model.md` T-05
**Status:** Known, explicitly tracked open question -- not a new finding. T-05 status is "Open" and linked to Q-10. Documented for completeness; no action required for approval.

## Confirmed clean

The following areas had findings in R1/R2/R3 and are now clean:

- **SEC (R1/R2/R3 residuals):** T-06 blast radius (D-19 caret strategy documented), T-08 VbsLauncher injection (documented in threat-model + scrapers.md), SEC-R3-04 local binary replacement (FP, note in threat-model), SEC-R3-01/02/03 (FPs documented in config-dir.md, sdk-xdg.md, scrapers.md)
- **Arch R3-02:** T-07 gate note added to wdrive-migration.md T8 section
- **Arch R3-08:** violations-migration.md UpdaterMain pattern clarified (re-export from shared-cli)
- **Consistency R3-F-03:** scrapers added to config-dir.md per-CLI target paths table
- **Consistency R3-F-04:** wdrive-migration.md Markdown table fixed (blockquote moved out of table)
- **Consistency R3-01/02:** shared-cli.md Q-11 resolved as D-19 (caret range pinning strategy)
- **Completeness:** All R1/R2 completeness blockers closed; violations UpdaterMain pattern, build pipeline steps, and scraper data migration intent documented
- **Architecture:** D-18 (--config override) and D-19 (caret range) added; T5+T6 atomicity warning in sdk-xdg.md; wdrive-tray.exe dual-process note in T8
- **CI/Security:** violations CI warning (never run with WRITE token) added to violations-migration.md; token validation (PyPI probe) referenced in threat-model T-01
