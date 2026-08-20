# Code Review Report v2 — OpenCode Step Provider

**Date:** 2026-08-20
**Spec version:** v1.0
**Reviewer:** Claude (subprocess, zero context)
**Score:** 7/10

## Prior fixes verified

All 5 prior-round fixes confirmed present:

1. `exitCode ?? -1` — OpenCodeModelProvider.ts:318 ✓
2. `skipPermissions === true` — ModelStepExecutor.ts:43 ✓
3. `providers?: Map` DI — StepRunner.ts:67 ✓
4. Empty string guard `!== undefined && !== null` — ModelStepExecutor.ts:116 ✓
5. `kill()` in `launchInteractive` finally — ClaudeModelProvider.ts:59 ✓

## Findings

### [MEDIUM] `execSync` imported but never used

- **File:** OpenCodeModelProvider.ts:9
- **Finding:** `execSync` named in import but `findOpenCodeCommand()` never calls it after refactor.
- **Fix:** Remove `execSync` from import.

### [MEDIUM] `ClaudeModelProvider.currentProcess` never nulled after close

- **File:** ClaudeModelProvider.ts:49
- **Finding:** Set on process start, never set to null on close — unlike OpenCodeModelProvider. Causes spurious console.warn when `kill()` is called in `finally` on an already-dead reference.
- **Fix:** Null it in `kill()` after calling `.kill()`, or add close-handler via `onProcessStarted`.

### [MEDIUM] `launchInteractive` has zero unit test coverage

- **File:** ClaudeModelProvider.test.ts / OpenCodeModelProvider.test.ts
- **Finding:** No test ever calls `launchInteractive`; finally block, close handler, process-started callback untested.
- **Fix:** Add one `launchInteractive` happy-path test per provider.

### [MEDIUM] Integration test silently passes when mock file missing

- **File:** StepRunner.opencode.integration.test.ts:201-204
- **Finding:** When MOCK_PATH not found, test does `console.warn + return` — passes green while skipping all assertions.
- **Fix:** Replace with `expect.fail(...)`.

### [INFO] Misleading comment "default: true" on --auto

- **File:** OpenCodeModelProvider.ts:88
- **Finding:** Comment says default:true but via ModelStepExecutor chain default is now false.

### [INFO] Stale test comment references removed execSync lookup

- **File:** OpenCodeModelProvider.test.ts (OPENCODE_MOCK_PATH describe)
- **Finding:** Comment describes execSync-based path that no longer exists.
