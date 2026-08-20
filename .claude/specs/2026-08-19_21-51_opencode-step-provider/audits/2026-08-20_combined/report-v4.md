Here is my analysis.

---

## Verification Results

**1. ClaudeLauncher ~line 165: `skipPermissions === true`**
`ClaudeLauncher.ts:165` — `const skipPermissions = options?.skipPermissions === true;`
**CONFIRMED** ✓

**2. OpenCodeModelProvider: `skipPermissions === true`**
`OpenCodeModelProvider.ts:88` — `if (options.skipPermissions === true) {`
**CONFIRMED** ✓

**3. ModelStepExecutor: `skipPermissions === true`**
`ModelStepExecutor.ts:43` — `const skipPermissions = execConfig?.skipPermissions === true;`
**CONFIRMED** ✓

**4. `exitCode ?? -1` in launchBackground of both providers**
`ClaudeLauncher.ts:353` — `exitCode: code ?? -1` ✓
`OpenCodeModelProvider.ts:318` — `exitCode: code ?? -1` ✓
**CONFIRMED** ✓

**5. `ClaudeModelProvider.currentProcess = null` in BOTH finally blocks**
`ClaudeModelProvider.ts:58–60` (launchInteractive) — `this.kill(); this.currentProcess = null;` ✓
`ClaudeModelProvider.ts:71–73` (launchBackground) — `this.kill(); this.currentProcess = null;` ✓
**CONFIRMED** ✓

**6. StepRunner: optional `providers` param in StepRunnerConfig**
`StepRunner.ts:67` — `providers?: Map<string, ModelProvider>;`
`StepRunner.ts:79–84` — `this.providers = config.providers ?? new Map(...);`
**CONFIRMED** ✓

**7. ModelStepExecutor: result guard is `!== undefined && !== null`**
`ModelStepExecutor.ts:116` — `event.data.result !== undefined && event.data.result !== null`
**CONFIRMED** ✓

---

## Additional Findings

### [HIGH] OpenCodeModelProvider — `currentProcess` not cleared in error path

- **File:** `OpenCodeModelProvider.ts:170–175` (launchInteractive) / `:293–296, :320-326` (launchBackground)
- **Finding:** When the `error` event fires (not `close`), `this.currentProcess` is never set to `null`. Both `launchInteractive` and `launchBackground` only clear `currentProcess` inside the `close` handler. The `finally` block calls `kill()` (silently swallows the error) but does NOT do `this.currentProcess = null`. Compare with `ClaudeModelProvider` which always clears in `finally`.
- **Failure scenario:** Flow abort calls `runner.kill()` after a spawn-failure. OpenCode's `kill()` tries to kill the stale (dead) process reference, fails silently, and the reference persists — a subsequent `launchBackground` call overwrites it but a concurrent external `kill()` window exists.
- **Fix:** Add `this.currentProcess = null;` to the `finally` block in both `launchInteractive` and `launchBackground`, mirroring `ClaudeModelProvider`.

### [MEDIUM] Signal-killed interactive process silently returns empty success

- **File:** `ModelStepExecutor.ts:175` and `ClaudeLauncher.ts:258–263`
- **Finding:** When Claude is killed by a signal (not via our `kill()`), Node fires `close(null, signal)`. `exitCode` is `null`. The guard `result.exitCode !== 0 && result.exitCode !== 1 && result.exitCode !== null` explicitly allows `null` to pass — so the step continues with `result.response = ''` (empty string), extracts outputs from an empty string, and returns a successful-looking `StepTrace`.
- **Failure scenario:** OS sends SIGKILL to the Claude subprocess (OOM, container limit). The step trace shows `exitCode: null`, no error, and empty output — downstream steps silently receive nothing.
- **Fix:** Treat `exitCode === null` as an error: `if (result.exitCode !== 0 && result.exitCode !== 1) { stepTrace.error = result.exitCode === null ? 'Claude killed by signal' : \`Claude exited with code ${result.exitCode}\`; return stepTrace; }`

### [MEDIUM] Integration test `runProcess` uses `code ?? 0` (should be `?? -1`)

- **File:** `StepRunner.opencode.integration.test.ts:79`
- **Finding:** `child.on('close', code => resolve({ stdout, stderr, exitCode: code ?? 0 }))` — a signal-killed test process returns exit code 0 (success), masking signal kills. Inconsistent with provider convention of `?? -1`.
- **Fix:** Change to `exitCode: code ?? -1`.

### [LOW] Prompt not validated for null bytes / control characters

- **File:** `ModelProvider.ts:124–140` (`validateLaunchOptions`)
- **Finding:** `validateLaunchOptions` validates `model`, `resumeSessionId`, and `mcpServers` fields via `validateString`/regex, but never calls `validateString` on `options.prompt`. A null byte in the prompt would silently truncate the positional arg to OpenCode on POSIX (POSIX null-terminates argv strings). For the Windows `.cmd` / `shell: true` fallback, prompt metacharacters are an accepted risk per `out-of-scope.md`, but the null-byte truncation is unaddressed on the `.exe` / `shell: false` path.
- **Fix:** Call `validateString(options.prompt, 'prompt')` inside `validateLaunchOptions` (omit the length cap or raise it for large prompts, since Claude accepts them via stdin — but null bytes should still be rejected).

---

**Score: Code 8/10, Security 8.5/10**

The architecture is sound and the main security concerns (env isolation, skipPermissions opt-in, MCP config injection) are all correctly implemented. The primary gap is the `OpenCodeModelProvider` stale `currentProcess` reference after errors, and the silent success on signal-killed interactive steps.
