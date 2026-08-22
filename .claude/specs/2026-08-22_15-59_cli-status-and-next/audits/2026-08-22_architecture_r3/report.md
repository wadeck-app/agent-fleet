# Architecture Audit Round 3

**Date:** 2026-08-22
**Auditor:** fork subagent
**Scope:** All 10 spec files
**Prior rounds:** R1 (12 issues), R2 (13 issues, R2-10 unaddressed)

## Summary

8 findings: 0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW, 3 INFO.

7 residuals from R2 confirmed (6 were supposedly fixed but are missing or incomplete; R2-10 was explicitly deferred). 1 new LOW issue.

R2 fixes verified: R2-01, R2-02, R2-03, R2-05, R2-07, R2-08 confirmed fixed. Residuals: R2-04 (partial), R2-06 (missing), R2-09 (partial), R2-10 (unaddressed), R2-11, R2-12, R2-13.

---

## Issues

### R3-01 -- wdrive macOS scope still unaddressed -- LOW

**File:** wdrive-migration.md T9; out-of-scope.md
**Source:** R2-10 residual (explicitly deferred -- confirmed still a gap)
**Issue:** T9 package layout lists @wadeck/wdrive-darwin-arm64 and @wadeck/wdrive-darwin-x64. out-of-scope.md only excludes macOS for scrapers. No decision states whether wdrive macOS is in or out of scope for T9. wdrive Node bundle uses Windows-specific code (VbsLauncher, schtasks). Publishing darwin packages for a Windows-only tool produces non-functional installs.
**Recommendation:** Add one sentence to wdrive-migration.md T9: either darwin packages are stubs (Node bundle Windows-only in T9 scope) or macOS is deferred and darwin entries should be removed from the T9 layout.

---

### R3-02 -- T-07 gate missing from wdrive-migration.md T8 -- MEDIUM

**File:** wdrive-migration.md T8
**Source:** R2-06 residual -- fix described as "T-07 noted in wdrive-migration.md" but the note is absent
**Issue:** T8 section describes UpdateCmd []string and tray-process exit requirement (A-09), but contains no reference to T-07 and no precondition that T-07 must be resolved before T8 is merged. threat-model.md T-07 says "validate/restrict UpdateCmd before implementation" but nothing in wdrive-migration.md enforces this gate. An implementer reading only wdrive-migration.md would ship T8 without the validation, creating a local privilege escalation vector.
**Recommendation:** Add a precondition block to the T8 section: T8 MUST NOT be merged until T-07 is resolved. Minimum: UpdateCmd restricted to pattern npm install -g @wadeck/_@_; any other value rejected at load time.

---

### R3-03 -- T-03 still Open | - with no owner -- LOW

**File:** threat-model.md Mitigations table T-03
**Source:** R2-04 partial residual -- T-06 was fixed but T-03 was not
**Issue:** T-03 row: "No secrets currently stored; future feature must evaluate encryption. No action until auth tokens are introduced | Open | -". No decision number, no accepted-risk decision, no owner. R2-04 recommendation explicitly called out T-03 as needing an accepted-risk decision or open question with an owner.
**Recommendation:** Add an accepted-risk decision (e.g., "No auth tokens planned in current scope; T-03 deferred until the feature is introduced") or add a Q entry with an owner.

---

### R3-04 -- EXDEV no-fallback decision not specified -- LOW

**File:** config-dir.md step 5; sdk-xdg.md Migration
**Source:** R2-09 partial residual
**Issue:** config-dir.md step 5 documents a generic migration-failure warning. sdk-xdg.md notes "Non-fatal on cross-device failure." Neither file explicitly states that on EXDEV (cross-device rename failure), no copy+delete fallback is attempted. If an implementation adds a copy+delete fallback and delete fails after copy succeeds, duplicate config state is left on multi-drive Windows machines.
**Recommendation:** Add to config-dir.md step 5: "On EXDEV (cross-device rename failure), no copy+delete fallback is attempted; the warning is printed and migration exits early. The user must copy manually."

---

### R3-05 -- P-4 not cited in D-11 or D-13 -- INFO

**File:** _index.md Decision Log D-11, D-13
**Source:** R2-11 residual
**Issue:** P-4 (Distribute via npm only) is the primary driver for violations esbuild migration (D-11) and dropping Ed25519 in favor of npm trust (D-13). Neither rationale column references P-4.
**Recommendation:** Append "; P-4" to the Rationale of D-11 and D-13 in _index.md.

---

### R3-06 -- shared-cli CI workflow not documented -- INFO

**File:** shared-cli.md Publishing
**Source:** R2-12 residual
**Issue:** Publishing section says "published via CI pipeline on the shared-cli repo. No file: path overrides in consumers." No workflow filename, copy-from reference, or adaptation note is given. T-NEW requires creating the repo from scratch; an implementer must search agent-fleet for the template.
**Recommendation:** Add one line: "CI: copy .github/workflows/publish-flow-cli.yml from agent-fleet; replace @wadeck/flow-cli with @wadeck/shared-cli; remove platform binary optionalDependencies steps."

---

### R3-07 -- Summary missing scrapers scope boundary -- INFO

**File:** _index.md Summary
**Source:** R2-13 residual
**Issue:** Summary mentions scrapers as part of harmonization scope without clarifying that distribution is out of scope. Reader must check out-of-scope.md to resolve ambiguity.
**Recommendation:** Add to Summary: "Scrapers consolidation (monorepo, @wadeck/shared-scrapper, ConfigDir adoption) is in scope; scraper distribution via npm is not."

---

### R3-08 -- UpdaterMain copy vs re-export ambiguous -- LOW

**File:** violations-migration.md violations-updater.cjs bundle section
**Source:** NEW
**Issue:** Spec says second esbuild entry point is "compiled from src/updater/UpdaterMain.ts from shared-cli, copied or re-exported". Copy means a separate file in violations-cli (maintenance burden, drift risk); re-export means violations-cli has a thin wrapper and esbuild bundles shared-cli UpdaterMain -- the correct pattern. The ambiguity leaves the implementer to guess.
**Recommendation:** Replace with: "violations-cli re-exports UpdaterMain from @wadeck/shared-cli; esbuild bundles it into dist-bundle/violations-updater.cjs." Remove the "copied" option entirely.

---

## Finding summary

| ID    | Severity | Type                     | Title                                         |
| ----- | -------- | ------------------------ | --------------------------------------------- |
| R3-01 | LOW      | RESIDUAL (R2-10)         | wdrive macOS scope still unaddressed          |
| R3-02 | MEDIUM   | RESIDUAL (R2-06)         | T-07 gate missing from wdrive-migration.md T8 |
| R3-03 | LOW      | RESIDUAL (R2-04 partial) | T-03 still Open with no owner                 |
| R3-04 | LOW      | RESIDUAL (R2-09 partial) | EXDEV no-fallback decision not specified      |
| R3-05 | INFO     | RESIDUAL (R2-11)         | P-4 not cited in D-11/D-13                    |
| R3-06 | INFO     | RESIDUAL (R2-12)         | shared-cli CI workflow not documented         |
| R3-07 | INFO     | RESIDUAL (R2-13)         | Summary missing scrapers scope boundary       |
| R3-08 | LOW      | NEW                      | UpdaterMain copy vs re-export ambiguous       |

**Total: 0 CRITICAL, 0 HIGH, 1 MEDIUM, 4 LOW, 3 INFO.**

## Verified fixes from R2

| R2 ID | Status                                                                      |
| ----- | --------------------------------------------------------------------------- |
| R2-01 | Fixed -- _index.md note added pointing to plan file for task IDs            |
| R2-02 | Fixed -- D-19 added; Q-11 resolved; T-06 updated to Mitigated/D-19          |
| R2-03 | Fixed -- atomicity WARNING block added to sdk-xdg.md                        |
| R2-04 | Partial -- T-06 fixed; T-03 still Open/- (R3-03); T-05 now references Q-10  |
| R2-05 | Fixed -- out-of-scope.md T9 now lists T7 dependency                         |
| R2-06 | Not fixed -- T-07 note absent from wdrive-migration.md (R3-02)              |
| R2-07 | Fixed -- adopted features table added in scrapers.md                        |
| R2-08 | Fixed -- v0.1.1 and v0.2 changelog rows added                               |
| R2-09 | Partial -- general warning present; EXDEV/no-fallback not specified (R3-04) |
| R2-10 | Not fixed -- wdrive macOS scope still unaddressed (R3-01)                   |
| R2-11 | Not fixed -- P-4 still absent from D-11/D-13 (R3-05)                        |
| R2-12 | Not fixed -- CI workflow copy instruction absent (R3-06)                    |
| R2-13 | Not fixed -- Summary scrapers scope boundary absent (R3-07)                 |

## Verdict

**PASS WITH NOTES** -- No CRITICAL or HIGH issues remain. The 1 MEDIUM (R3-02: T-07 gate missing) is a safety gate for a deferred feature (T8); it should be fixed before T8 implementation begins. The 4 LOW and 3 INFO items are documentation clarity gaps with no immediate implementation risk.
