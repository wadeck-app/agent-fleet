# Security Audit Report — Round 3

**Spec:** cli-status-and-next
**Date:** 2026-08-22
**Auditor:** Claude (fork)
**Scope:** New issues and genuinely residual R2 issues only. Confirmed closed and NOT re-reported: SEC-R01, SEC-R02, SEC-R03, SEC-R04, T-06 (D-19), SEC-03 (D-13).

---

## Summary

8 findings: 0 CRITICAL, 0 HIGH, 4 MEDIUM, 2 LOW, 2 INFO.

All findings are residuals from R2 (SEC-06 through SEC-12) that were not addressed by v0.2 changes, plus 2 new LOW findings. No new HIGH or CRITICAL issues found.

Overall assessment: the spec is converging well. The remaining MEDIUM residuals are STRIDE coverage gaps (missing threat-model rows), not design flaws. They can be closed cheaply by adding rows and deciding accept/mitigate.

---

## Findings

### SEC-R3-01 (severity: MEDIUM) — Residual SEC-06

**File:** `config-dir.md` — Migration path, step 5
**Issue:** Migration failure is non-fatal and falls back to a fresh empty config dir. The spec says: "This is a WARNING (not an error exit) because the app can still function — it just uses a fresh config dir." A user whose migration failed runs with no config, silently losing previous settings. Conflicts with P-5 (fail loudly — no silent fallbacks). Only partially fixed in R2: warning added to stderr, but fallback behavior kept.
**Recommended fix:** Either (a) exit non-zero on migration failure (P-5 compliant), or (b) document this as an explicit P-5 exception in `guiding-principles.md` with rationale. The current state is an undocumented violation of a guiding principle.

---

### SEC-R3-02 (severity: MEDIUM) — Residual SEC-07

**File:** `threat-model.md` — STRIDE Tampering section
**Issue:** The `--config <dir>` CLI override (core wdrive feature, D-18) has no STRIDE entry. An attacker who can influence CLI invocation arguments (malicious wrapper script, compromised shell profile) can redirect the config dir to an attacker-controlled path containing a crafted `launcher.config.json` with a malicious `UpdateCmd`. This is the argument-injection analogue to the SEC-R02 XDG env-var vector (closed as FP), but `--config` is explicitly user-facing and a higher-confidence attack path. Related to T-07 but not covered by it.
**Recommended fix:** Add STRIDE Tampering row for `--config <dir>` redirect attacks. Options: validate that the resolved path is owned by the current user, or accept and document explicitly.

---

### SEC-R3-03 (severity: MEDIUM) — Residual SEC-08

**File:** `threat-model.md`; `scrapers.md` — Security considerations
**Issue:** Scrapers use `schtasks.exe` for OS-level persistence. `@wadeck/shared-cli` is a supply chain dependency (D-15). A compromised shared-cli version (T-06 blast radius, accepted via D-19 caret range) would execute on every scheduled task trigger — potentially with the task security context. T-06 covers generic shared-cli supply-chain risk but does not model the OS-persistence amplification. No dedicated STRIDE row for: supply-chain compromise -> scheduled task execution.
**Recommended fix:** Add a STRIDE row for scraper persistence amplification. At minimum: specify that `/RU <currentUser>` must be set in all `WindowsTask.js` `schtasks /create` calls so tasks never run above user privilege. Cross-reference T-05.

---

### SEC-R3-04 (severity: MEDIUM) — Residual SEC-10

**File:** `threat-model.md` — STRIDE Tampering section
**Issue:** Post-install local binary replacement via the JS shim (`bin/flow.js`, `bin/wdrive.js`, `bin/violations.js`) has no STRIDE entry. T-01 covers registry-level tampering only. A local attacker (malware, compromised user session) can replace installed binary files directly on disk after a legitimate install, bypassing the registry. On Windows, global npm installs land in a user-writable prefix with no integrity enforcement.
**Recommended fix:** Add a STRIDE Tampering row for local post-install binary replacement. Options: file-hash self-check at startup, or accept as out-of-scope (same trust model as any installed application) with explicit documentation.

---

### SEC-R3-05 (severity: LOW) — New finding

**File:** `wdrive-migration.md` — T8 design
**Issue:** The T8 design (A-09 note) acknowledges that `wdrive-tray.exe` also holds a file lock during updates and must exit before npm overwrites it. The threat model has no STRIDE row for the dual-process (`wdrive.exe` + `wdrive-tray.exe`) update window. T-04 covers broken-update rollback generically but not this wdrive-specific race: a partially applied update (one exe overwritten, the other still locked) may leave wdrive in an inconsistent binary state that rollback cannot recover.
**Recommended fix:** Add a note to T-04 (or a new T row) for the dual-process update window. Specify required sequencing: tray exits -> launcher exits -> npm installs -> both restart. Clarify that rollback must handle partial overwrites.

---

### SEC-R3-06 (severity: LOW) — New finding

**File:** `threat-model.md` — Mitigations table, T-08 row
**Issue:** T-08 (VBScript injection via VbsLauncher) references `Decision #: D-6`. D-6 is the scrapers monorepo consolidation decision — unrelated to VBScript sanitization. The correct reference should be D-15 (scrapers adopt shared-cli) or `scrapers.md` Security section. This traceability error makes it harder to verify that the T-08 mitigation is actually implemented.
**Recommended fix:** Update T-08 Decision # to reference `scrapers.md §Security` or leave blank until an implementation decision covers it.

---

### SEC-R3-07 (severity: INFO) — Residual SEC-11

**File:** `threat-model.md` — Repudiation section
**Issue:** Repudiation is accepted as-is: "CLI tools, not security-critical infrastructure." `update-state.json` is user-writable; an attacker can erase post-compromise evidence of a malicious auto-install. The acceptance rationale does not address post-compromise cleanup. If auth tokens are introduced (T-03 future), update-state forensics would become more relevant.
**Recommended fix:** Append to Repudiation entry: "If auth tokens are introduced (T-03), re-evaluate this acceptance — update-state.json becomes forensically relevant."

---

### SEC-R3-08 (severity: INFO) — Residual SEC-12

**File:** `threat-model.md` — T-05; `wdrive-migration.md` — T9 auto-update
**Issue:** T-05 requires CLIs not run as root and self-check verifies this. But for wdrive T8, `UpdateCmd` is spawned as a detached child process from the Go launcher. If the launcher ran with elevated privileges, the detached process inherits them and runs `npm install -g` as root/admin. T-05 addresses the launcher self-check but does not specify that the detached updater must independently re-validate its privilege level.
**Recommended fix:** Add to T-05 mitigation: "Detached UpdateCmd process must independently verify non-elevated execution before running npm install -g." Low urgency — T8 is deferred, but the gap should be noted before T8 is implemented.

---

## R2 Residuals Status

| R2 ID  | R3 ID     | Status                                                          |
| ------ | --------- | --------------------------------------------------------------- |
| SEC-06 | SEC-R3-01 | Residual — still open                                           |
| SEC-07 | SEC-R3-02 | Residual — still open                                           |
| SEC-08 | SEC-R3-03 | Residual — still open                                           |
| SEC-10 | SEC-R3-04 | Residual — still open                                           |
| SEC-11 | SEC-R3-07 | Residual — still open                                           |
| SEC-12 | SEC-R3-08 | Residual — still open                                           |
| SEC-05 | —         | Closed — resolved by D-19 (caret range accepted, Q-11 resolved) |

## Confirmed closed from R1/R2 (not re-reported)

SEC-R01 (CI warning added), SEC-R02 (XDG FP documented), SEC-R03 (T-08 added), SEC-R04 (covered by T-08), T-06 (D-19 mitigated), SEC-03 (D-13 accepted trade-off), SEC-05 (D-19 resolution).
