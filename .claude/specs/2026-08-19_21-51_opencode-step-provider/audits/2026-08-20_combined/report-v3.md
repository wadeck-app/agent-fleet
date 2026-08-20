# Combined Code Review + Security Pentest — Iteration 3

**Date:** 2026-08-20
**Scope:** ClaudeModelProvider, OpenCodeModelProvider, StepRunner, ModelStepExecutor

## Findings

### [HIGH] OpenCodeModelProvider: `--auto` appended by default when `skipPermissions` is `undefined`

- **File:** `packages/flow-engine/src/processing/OpenCodeModelProvider.ts:88`
- **Finding:** `options.skipPermissions !== false` is `true` when `skipPermissions` is `undefined`, so `--auto` is added to every invocation that doesn't explicitly opt out — the opposite of the T-02 documented default.
- **Fix:** Change `options.skipPermissions !== false` → `options.skipPermissions === true`

### [HIGH] ClaudeModelProvider mirrors the same inverted default

- **File:** `packages/flow-engine/src/processing/ClaudeModelProvider.ts` (delegates to ClaudeLauncher which has identical `!== false`)
- **Finding:** The test in `ClaudeModelProvider.test.ts:108` asserts `--dangerously-skip-permissions` is present when `skipPermissions` is not set — same inversion as OpenCode.
- **Fix:** Fix `!== false` → `=== true` in `ClaudeLauncher.buildCommand` and flip the test assertion.

## Verification summary

| Prior fix                                         | Result                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| `exitCode ?? -1` — OpenCodeModelProvider          | CONFIRMED line 318                             |
| `exitCode ?? -1` — ClaudeLauncher                 | Cannot verify (file not read)                  |
| `skipPermissions === true` — ModelStepExecutor    | CONFIRMED line 43                              |
| `currentProcess = null` launchInteractive finally | CONFIRMED line 59                              |
| `currentProcess = null` launchBackground finally  | REGRESSION — launchBackground missing the null |
| `shell: false` for OPENCODE_MOCK_PATH             | CONFIRMED lines 346–349                        |
| Windows `where.exe opencode.exe` first            | CONFIRMED lines 354–359                        |

## Score

Code review: 8/10
Security: 6/10 — T-02 documented as Mitigated but provider-level default is inverted; ModelStepExecutor papers over it for in-flow use, but direct provider use is unsafe.
