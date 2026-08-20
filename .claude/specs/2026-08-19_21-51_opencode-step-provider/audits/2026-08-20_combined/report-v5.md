# Audit Report — Combined Code Review + Security Pentest v5 (Final)

**Date:** 2026-08-20
**Spec version:** v1.0
**Iteration:** 5/5

## Verification Checklist — 9/9 PASS

| #   | Item                                               | Status | Location                                          |
| --- | -------------------------------------------------- | ------ | ------------------------------------------------- |
| 1   | ClaudeLauncher skipPermissions === true            | ✓      | ClaudeLauncher.ts:165                             |
| 2   | OpenCodeModelProvider skipPermissions === true     | ✓      | OpenCodeModelProvider.ts:88                       |
| 3   | ModelStepExecutor skipPermissions === true         | ✓      | ModelStepExecutor.ts:43                           |
| 4   | exitCode ?? -1 in both locations                   | ✓      | OpenCodeModelProvider.ts:319, integration test:79 |
| 5   | ClaudeModelProvider currentProcess = null (both)   | ✓      | ClaudeModelProvider.ts:59, :72                    |
| 6   | OpenCodeModelProvider currentProcess = null (both) | ✓      | OpenCodeModelProvider.ts:171/:178 and :295/:325   |
| 7   | validateLaunchOptions checks prompt null bytes     | ✓      | ModelProvider.ts:125                              |
| 8   | StepRunner optional providers DI                   | ✓      | StepRunner.ts:67, :79-84                          |
| 9   | ModelStepExecutor result guard !== undefined       | ✓      | ModelStepExecutor.ts:116                          |

## Findings

### [HIGH] Prompt visible in OS process listing

- **File:** `OpenCodeModelProvider.ts:80-81`
- **Finding:** The full prompt is passed as a positional arg to `opencode run` — visible via `ps aux` on multi-user Unix hosts. ClaudeLauncher avoids this by using stdin. This is inherent to the opencode CLI design (no stdin alternative).
- **Fix:** Document as accepted risk in out-of-scope.md. No code fix possible without upstream opencode stdin support.

## Score

**Code: 9/10** — All 9 checklist items correctly implemented.
**Security: 8/10** — All known threats mitigated or accepted. Prompt-in-argv is inherent to opencode design.

## Verdict

**IMPLEMENTATION READY** — no blocking issues. The prompt-in-argv risk must be documented in out-of-scope.md before deployment to multi-tenant environments.
