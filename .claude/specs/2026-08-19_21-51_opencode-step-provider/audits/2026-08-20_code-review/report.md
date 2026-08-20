---
## Blind Code Review
---

### [CRITICAL] Signal-killed process reported as exitCode 0

- **File:** `packages/flow-engine/src/processing/OpenCodeModelProvider.ts:314`
- **Finding:** In the `close` handler of `launchBackground`, `resolve({ stdout, stderr, exitCode: code ?? 0 })` coerces `null` (which Node.js passes when a process is killed by a signal, e.g. SIGKILL) to `0`, making a killed process appear to have succeeded. `ModelStepExecutor.ts:208` checks `result.exitCode !== 0` to detect failure, so signal-killed runs are silently swallowed.
- **Suggested fix:** Use `code ?? -1` (or keep as `null` and update `ModelBackgroundResult.exitCode` to `number | null`); add an explicit check for `code === null` in the error path.

---

### [HIGH] Windows `.cmd` wrapper spawned with `shell: false`

- **File:** `packages/flow-engine/src/processing/OpenCodeModelProvider.ts:350-357`
- **Finding:** `findOpenCodeCommand()` contains the comment "On Windows, opencode resolves to a .cmd/.bat wrapper — must use shell: true" but both `launchInteractive` (line 158) and `launchBackground` (line 199) always pass `shell: false`. The comment acknowledges the problem but no fix is applied, so the spawn will fail on Windows when resolving to a `.cmd` wrapper.
- **Suggested fix:** In the spawn calls, set `shell: process.platform === 'win32'` (or detect whether the resolved path ends in `.cmd`/`.bat`).

---

### [HIGH] `ClaudeModelProvider.launchInteractive` omits `kill()` in finally

- **File:** `packages/flow-engine/src/processing/ClaudeModelProvider.ts:55-59`
- **Finding:** `launchBackground` correctly calls `this.kill()` in its `finally` block (with an explicit security comment), but `launchInteractive` only cleans up the MCP temp file. If the surrounding code throws after the process starts, the child process is left dangling. `OpenCodeModelProvider.launchInteractive` (line 174) correctly calls `this.kill()`.
- **Suggested fix:** Add `this.kill()` to the `finally` block in `ClaudeModelProvider.launchInteractive`, matching both the `launchBackground` and `OpenCodeModelProvider` patterns.

---

### [HIGH] Empty-string model result silently discarded

- **File:** `packages/flow-engine/src/executor/ModelStepExecutor.ts:116`
- **Finding:** `if (event.type === 'result' && event.data.result)` is falsy when `result === ''`. A valid empty-string response (e.g. a step that intentionally produces no output) leaves `finalResultText` as `undefined`, causing the code to fall back to `result.stdout` instead — silently producing wrong output.
- **Suggested fix:** Change the guard to `event.data.result != null` (or `typeof event.data.result === 'string'`) so an empty string is still captured.

---

### [HIGH] `StepRunner` instantiates concrete providers — no constructor injection

- **File:** `packages/flow-engine/src/executor/StepRunner.ts:76-81`
- **Finding:** `ClaudeModelProvider` and `OpenCodeModelProvider` are created with `new` directly inside the constructor. There is no way to inject mock or alternative providers through the constructor; tests must rely on the `OPENCODE_MOCK_PATH` env-var side-channel or mock `child_process.spawn` globally — both are fragile and leak implementation details into tests.
- **Suggested fix:** Accept `providers?: Map<string, ModelProvider>` in `StepRunnerConfig` and default to the concrete pair only when not provided.

---

### [MEDIUM] Fork-mode silently falls back to append when session file is missing

- **File:** `packages/flow-engine/src/executor/ModelStepExecutor.ts:90-96`
- **Finding:** When `session.mode === 'fork'` and the referenced session file does not exist, the code writes a stderr warning and proceeds with `append` semantics. This silent behavioural substitution violates the project's "fail fast, no silent fallbacks" rule — the caller asked for `fork`, which has different conversation-isolation semantics than `append`.
- **Suggested fix:** Throw a descriptive error instead of falling back; the caller can catch and decide whether `append` is acceptable.

---

### [MEDIUM] Exit code 1 treated as non-error with no documentation

- **File:** `packages/flow-engine/src/executor/ModelStepExecutor.ts:175`
- **Finding:** The condition `result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== null` passes exit code 1 through as a successful result. The reason exit code 1 is allowed is NOT DOCUMENTED anywhere in the file. If Claude's exit-code contract changes, this silent exemption will cause incorrect behavior with no explanation in code.
- **Suggested fix:** Add a comment explaining exactly which Claude exit-code-1 condition is being tolerated (e.g. "Claude exits 1 when at least one tool call returned an error but execution completed"), or model it explicitly via an `exitCode` check with a named constant.

---

### [MEDIUM] `LaunchOptions` contains Claude-only fields silently ignored by OpenCode

- **File:** `packages/flow-engine/src/processing/ModelProvider.ts:32-35`
- **Finding:** `streamJson`, `verbose`, and `autoCompact` in `LaunchOptions` are consumed only by `ClaudeModelProvider`/`ClaudeLauncher`. `OpenCodeModelProvider` silently ignores all three. A caller that passes `streamJson: false` expecting to disable streaming for an OpenCode step has no indication the flag did nothing.
- **Suggested fix:** Either split provider-specific options into sub-interfaces (e.g. `ClaudeLaunchExtras`), or have `OpenCodeModelProvider` throw/warn when unsupported flags are set to non-default values.

---

### [MEDIUM] `launchInteractive` untested in both providers

- **File:** `packages/flow-engine/src/processing/ClaudeModelProvider.test.ts`, `packages/flow-engine/src/processing/OpenCodeModelProvider.test.ts`
- **Finding:** Every unit test exercises only `launchBackground`. The `launchInteractive` path — which has different spawn options (`stdio: 'inherit'`), no prompt arg injection, different error handling, and (for OpenCode) a `kill()` call in `finally` that Claude omits — has zero coverage.
- **Suggested fix:** Add at least one `launchInteractive` test per provider: verifies spawn options (no prompt arg, `stdio: 'inherit'`), close → resolve, and kill-on-error behaviour.

---

### [MEDIUM] `flowExecutor` field typed as `any`

- **File:** `packages/flow-engine/src/executor/StepRunner.ts:60`
- **Finding:** `flowExecutor?: any` bypasses TypeScript entirely for a central dependency. This means the compiler cannot catch call-site mismatches when `flowExecutor` is used inside `executeSubFlowStep`.
- **Suggested fix:** Define a minimal `FlowExecutorLike` interface (or import the concrete `FlowExecutor` type) and replace `any`.

---

### [INFO] Duplicate `mockReturnValue` in `beforeEach` — dead first call

- **File:** `packages/flow-engine/src/processing/ClaudeModelProvider.test.ts:67-69`, `packages/flow-engine/src/processing/OpenCodeModelProvider.test.ts:66-68`
- **Finding:** Both test files call `vi.mocked(child_process.spawn).mockReturnValue(mockProcess)` **before** `vi.clearAllMocks()` and again after. `vi.clearAllMocks()` clears call history but does **not** reset `mockReturnValue` implementations (only `vi.resetAllMocks()` does). The first call is therefore dead code, indicating a misunderstanding of Vitest's clear/reset/restore semantics.
- **Suggested fix:** Remove the first `mockReturnValue` call; keep only the one after `clearAllMocks`.

---

### [INFO] `onStreamEvent`/`StreamJsonEvent` naming is Claude-specific

- **File:** `packages/flow-engine/src/processing/ModelProvider.ts:37`
- **Finding:** The callback is named `onStreamEvent` and the event type is `StreamJsonEvent`, both of which reference Claude's `--output-format stream-json` flag name. Now that OpenCode also uses this callback interface, the name is misleading and will confuse future contributors.
- **Suggested fix:** Rename to `onModelEvent` / `ModelEvent` (or similar provider-neutral names) once both providers are stable.

---

### [INFO] MCP config written synchronously in OpenCode, asynchronously in Claude

- **File:** `packages/flow-engine/src/processing/OpenCodeModelProvider.ts:113` vs `packages/flow-engine/src/processing/ClaudeModelProvider.ts:114`
- **Finding:** `ClaudeModelProvider` writes the temp MCP config with `fs.promises.writeFile` (async); `OpenCodeModelProvider` uses `fs.writeFileSync` (sync). No functional difference, but the inconsistency makes the two implementations harder to read in parallel and means `buildSpawnParams` cannot be `async`.
- **Suggested fix:** Align to async in both, or accept the sync approach in both (sync is simpler since the file is written once before spawn).

---

## Score: 5/10

The validation layer, env isolation, and security-sensitive temp-file handling are well-executed. However, the CRITICAL signal-kill bug causes real data loss (a killed step looks like success), the Windows spawn issue will cause hard-to-diagnose failures in production, and the complete absence of `launchInteractive` tests leaves a significant execution path untested. The `LaunchOptions` interface leaking Claude-specific semantics into a shared contract is an architectural smell that will grow worse as providers are added.
