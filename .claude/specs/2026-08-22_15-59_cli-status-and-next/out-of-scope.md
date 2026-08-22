# Out of Scope -- CLI Status and Next Steps

Items listed here are **explicitly excluded**.
Raising an excluded item as a requirement is a change-of-scope conversation, not a design question.

## Excluded items

### T8 -- SDK UpdateCmd for wdrive Windows update

**Reason:** Requires a non-trivial contribution to the singleton-daemon-kit SDK. Not yet started. Deferred by user decision (D-7).
**Covered by:** T8 in `.claude/plans/2026-08-22_cli-status-and-next.md`; will be picked up after T5 lands.

### T9 -- wdrive npm migration (Phase 2)

**Reason:** Blocked on T5 (SDK XDG), T7 (dead code cleanup), and T8 (SDK UpdateCmd). Deferred by user decision (D-7).
**Covered by:** `wdrive/.claude/plans/2026-08-18_wdrive-npm-migration-and-dead-code.md`

### scrapers distribution (npm publish for scrapers)

**Reason:** The scrapers are local automation scripts, not distributed CLIs. No global install story is planned.

### Linux/macOS support for scrapers

**Reason:** The scrapers use Windows-specific APIs (schtasks.exe, VBScript, PowerShell balloon notifications) by design. Cross-platform scraper support is out of scope.

### violations-framework Go launcher

**Reason:** violations-framework is a linter tool invoked per-project, not a long-running daemon. A Go launcher adds complexity with no benefit.

### wdrive systray redesign

**Reason:** Systray behavior is not part of this harmonization spec. Covered separately if needed.

## How to challenge scope

If you believe an item should be in scope, open a new discussion with the rationale.
Do not modify this file silently -- scope changes must be acknowledged as a versioned decision.
