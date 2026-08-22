# Architecture Audit Report -- Round 2 -- CLI Status and Next Steps

**Date:** 2026-08-22
**Spec version:** v0.1
**Auditor:** Claude (fork subagent)
**Scope:** All 10 spec files + plan. Focus: new findings and residual (unfixed) issues from prior rounds.

## Prior-round coverage

Round-1 fixes A-01 through A-09 verified: all confirmed present in the spec files.

---

## Executive summary

13 findings: 0 CRITICAL, 3 HIGH, 5 MEDIUM, 2 LOW, 3 INFO.

Two new HIGH issues: Q-11 is still formally open but the spec pre-decides caret ranges in two files; T5/T6 non-atomic rollout recreates B2. Three medium residuals remain from prior audits (F-03, F-04, C-07/F-06, C-08).

---

## Findings

### [R2-01] T-NEW and T6 undefined in all spec files

**Severity:** HIGH
**File:** `_index.md` -- none of the spec files define T-NEW or T6
**Finding:** The plan (`2026-08-22_cli-status-and-next.md`) references T-NEW (shared-cli repo) and T6 (flow/task launcher.config.json update) throughout the dependency chain. Neither task ID appears in any spec file. Flagged as F-03 (HIGH) in the consistency audit and unaddressed.
**Impact:** An implementer reading the spec finds unresolved task IDs, making execution order ambiguous.
**Recommendation:** Add T-NEW and T6 to `_index.md` Modules table with a one-line description, or add a Tasks section linking to the plan file.

---

### [R2-02] Q-11 open but spec already pre-decides caret range

**Severity:** HIGH
**File:** `_index.md` Q-11; `violations-migration.md` Dependency; `scrapers.md` shared-cli dependency
**Finding:** Q-11 (exact CalVer pin vs caret range for shared-cli) is listed as Open. Both violations-migration.md and scrapers.md already use `^` caret range as the concrete dependency. The security implication (caret = automatic minor/patch updates from GitLab registry) is unacknowledged. T-06 blast radius explicitly depends on this choice.
**Impact:** The pinning decision is implicit and unreviewed, leaving T-06 permanently ambiguous.
**Recommendation:** Close Q-11 by adding D-19 formalizing caret range with security rationale. Update T-06 status to Mitigated/Accepted referencing D-19.

---

### [R2-03] T5/T6 non-atomic rollout recreates B2

**Severity:** HIGH
**File:** `sdk-xdg.md` Design; plan Phase 1 T5/T6 sequence
**Finding:** T5 (SDK XDG default) and T6 (update launcher.config.json) are sequential, not atomic. If the SDK is upgraded before T6 is applied, the launcher writes to ~/.config/flow-cli (unchanged defaultConfigDir=flow-cli via XDG) while the Node bundle reads ~/.config/flow. This is exactly B2 -- two config directories for one tool -- the primary bug this spec was designed to eliminate.
**Impact:** Any consumer upgrading the SDK without simultaneously applying T6 gets a broken config split, potentially losing update state.
**Recommendation:** Add explicit constraint to sdk-xdg.md: T5 and T6 MUST be applied atomically in the same consumer commit. T5 without T6 is worse than pre-T5. Consider an SDK validator that errors if defaultConfigDir has a dot-prefix or -cli suffix.

---

### [R2-04] T-06 mitigation references resolved Q-1 instead of open Q-11; T-03/T-05 have no owner

**Severity:** MEDIUM
**File:** `threat-model.md` Mitigations table rows T-03, T-05, T-06
**Finding:** T-06 row reads 'consumers pin to specific CalVer | Open | Q-1'. Q-1 was resolved by D-3 (CalVer publishing strategy). Q-11 is the successor question about pinning strategy and is explicitly open. T-03 and T-05 both remain Open with Decision#=- and no resolution path, accepted-risk decision, or milestone. Flagged as C-07 and F-06 in prior audits, unaddressed.
**Impact:** Threat model tracks the wrong open question for T-06; two open threats have no owner or timeline.
**Recommendation:** Update T-06 Decision# to reference Q-11. For T-03 and T-05: add accepted-risk decisions or open questions with owners.

---

### [R2-05] T9 dependency list in out-of-scope.md still missing T7

**Severity:** MEDIUM
**File:** `out-of-scope.md` T9 entry
**Finding:** out-of-scope.md says T9 blocked on T5 and T8, omitting T7 (wdrive dead code cleanup). wdrive-migration.md correctly states T9 requires T5+T7+T8. Flagged as F-04 in consistency audit, unaddressed.
**Impact:** A reader may start T9 without completing T7, producing a bundle with dead externals.
**Recommendation:** Update out-of-scope.md T9 entry to: Blocked on T5, T7, and T8.

---

### [R2-06] T-07 (UpdateCmd injection) has no implementation gate before T8

**Severity:** MEDIUM
**File:** `threat-model.md` T-07; `wdrive-migration.md` T8
**Finding:** T-07 (Tampering: launcher.config.json UpdateCmd injection) is Open with no definition of 'validate/restrict', no acceptance criterion, and no gate blocking T8 from being merged without resolving it. UpdateCmd executes arbitrary commands as the current user when the update trigger fires.
**Impact:** T8 shipped without resolving T-07 creates a local privilege escalation vector: any same-user process can inject a malicious command executed on the next update trigger.
**Recommendation:** Add precondition to T8 design: T8 MUST resolve T-07 first. Minimum: UpdateCmd restricted to pattern 'npm install -g @wadeck/_@_'; any other value rejected with hard error at load time.

---

### [R2-07] scrapers: which shared-cli features are adopted is unspecified

**Severity:** MEDIUM
**File:** `scrapers.md` Design; `_index.md` D-15
**Finding:** D-15 says scrapers depend on shared-cli for CLI infrastructure. The scrapers.md design only documents ConfigDir adoption. UpdateManager, HookDispatcher, and VersionValidation are listed exports of shared-cli but never mentioned for scrapers. Scrapers are Windows scheduled tasks; UpdateManager.scheduleBackgroundUpdate() (spawns detached process) has no sensible semantics in a scheduled-task invocation model.
**Impact:** Implementer may add UpdateManager creating unintended detached processes alongside scheduled tasks, or skip it entirely with no consistent update story.
**Recommendation:** Add Adopted shared-cli features subsection to scrapers.md: ConfigDir (yes -- D-16), VersionValidation (yes -- display version), UpdateManager (no -- scheduled tasks; update is manual npm install), HookDispatcher (no).

---

### [R2-08] Changelog missing completeness and consistency audit entries

**Severity:** MEDIUM
**File:** `_index.md` Changelog
**Finding:** Decision Log rows 34-35 record completeness and consistency audits as completed. The Changelog only has 3 rows: initial v0.1, security audit, architecture R1. Changes driven by those audits (scrapers.md added, D-18 added, migrateIfNeeded stderr fix) have no changelog trail. Flagged as C-08, unaddressed.
**Impact:** Future readers cannot trace when spec changes were made.
**Recommendation:** Add two Changelog rows for completeness and consistency audits, noting findings count and files changed.

---

### [R2-09] Migration cross-device: partial copy state undocumented

**Severity:** LOW
**File:** `sdk-xdg.md` Migration; `config-dir.md` step 5
**Finding:** sdk-xdg.md says migration uses fs.renameSync and is non-fatal on cross-device failure (EXDEV on different Windows drive letters). The spec acknowledges the failure is non-fatal but does not specify whether a copy+delete fallback is attempted, nor what happens if copy succeeds but delete fails (duplicate state in both old and new locations).
**Impact:** On multi-drive Windows machines, partial migration could leave ambiguous duplicate config state.
**Recommendation:** In config-dir.md step 5, specify: on EXDEV, no copy+delete fallback; print stderr warning with old path and exit migration early. User must copy manually.

---

### [R2-10] wdrive macOS scope never stated

**Severity:** LOW
**File:** `wdrive-migration.md` T9; `out-of-scope.md`
**Finding:** T9 lists @wadeck/wdrive-darwin-arm64 and @wadeck/wdrive-darwin-x64 packages. out-of-scope.md only excludes macOS for scrapers. No decision states whether wdrive macOS is in or out of scope. wdrive has Windows-specific components (systray, VbsLauncher), so darwin packages may be non-functional.
**Impact:** Publishing darwin packages for a Windows-only Node bundle results in non-functional macOS installs.
**Recommendation:** Clarify in wdrive-migration.md T9: either darwin packages are placeholder stubs (Node bundle Windows-only in T9) or wdrive macOS is out of scope (remove darwin entries from T9 layout).

---

### [R2-11] P-4 not cited in D-11 or D-13

**Severity:** INFO
**File:** `_index.md` Decision Log rows D-11, D-13
**Finding:** Guiding principle P-4 (Distribute via npm only) is the primary driver for violations esbuild migration (D-11) and dropping Ed25519 for npm trust (D-13). Neither decision references P-4. Flagged as C-09, unaddressed.
**Impact:** Principle traceability only.
**Recommendation:** Add P-4 to the Rationale column of D-11 and D-13 in _index.md.

---

### [R2-12] shared-cli CI workflow not documented

**Severity:** INFO
**File:** `shared-cli.md` Publishing
**Finding:** Publishing section says CI pipeline on shared-cli repo, same as singleton-daemon-kit. No workflow file template, script name, or copy-from reference is given. T-NEW requires creating this repo from scratch.
**Impact:** Low -- implementer must search agent-fleet for the template.
**Recommendation:** Add one line to shared-cli.md Publishing: CI: copy .github/workflows/publish-flow-cli.yml from agent-fleet; replace @wadeck/flow-cli with @wadeck/shared-cli; remove platform binary steps.

---

### [R2-13] Summary missing scrapers consolidation vs distribution scope boundary

**Severity:** INFO
**File:** `_index.md` Summary
**Finding:** Summary mentions scrapers as part of the harmonization scope without clarifying that distribution is explicitly out of scope. Flagged as C-10, unaddressed.
**Impact:** Low -- reader must check out-of-scope.md to resolve ambiguity.
**Recommendation:** Add sentence to Summary: Scrapers consolidation (monorepo, @wadeck/shared-scrapper, ConfigDir adoption) is in scope; scraper distribution via npm is not.

---

## Finding summary

| ID    | Severity | Type                  | Title                                                  |
| ----- | -------- | --------------------- | ------------------------------------------------------ |
| R2-01 | HIGH     | RESIDUAL (F-03)       | T-NEW and T6 undefined in spec files                   |
| R2-02 | HIGH     | NEW                   | Q-11 open but spec pre-decides caret range             |
| R2-03 | HIGH     | NEW                   | T5/T6 non-atomic rollout recreates B2                  |
| R2-04 | MEDIUM   | RESIDUAL (F-06, C-07) | T-06 stale Q-1 ref; T-03/T-05 no owner                 |
| R2-05 | MEDIUM   | RESIDUAL (F-04)       | T9 dependency missing T7 in out-of-scope.md            |
| R2-06 | MEDIUM   | NEW                   | T-07 no implementation gate before T8                  |
| R2-07 | MEDIUM   | NEW                   | scrapers: adopted shared-cli features unspecified      |
| R2-08 | MEDIUM   | RESIDUAL (C-08)       | Changelog missing completeness + consistency audits    |
| R2-09 | LOW      | NEW                   | Migration cross-device partial copy state undocumented |
| R2-10 | LOW      | NEW                   | wdrive macOS scope never stated                        |
| R2-11 | INFO     | RESIDUAL (C-09)       | P-4 not cited in D-11/D-13                             |
| R2-12 | INFO     | NEW                   | shared-cli CI workflow not documented                  |
| R2-13 | INFO     | RESIDUAL (C-10)       | Summary missing scrapers scope boundary                |

**Total: 3 HIGH, 5 MEDIUM, 2 LOW, 3 INFO. 0 CRITICAL.**
