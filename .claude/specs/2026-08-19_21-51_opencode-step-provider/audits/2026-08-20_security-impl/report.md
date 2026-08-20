## Findings

---

### [CRITICAL] skipPermissions default is inverted — opt-out instead of opt-in

- **File:** `ModelStepExecutor.ts:43`
- **Finding:** `execConfig?.skipPermissions !== false` evaluates to `true` when `execConfig` is `undefined` (or when `skipPermissions` is `undefined`), so `--dangerously-skip-permissions` / `--auto` is passed **by default** — the exact opposite of what T-02 requires.
- **Suggested fix:** Change to `execConfig?.skipPermissions === true` so the flag is opt-in; the default then becomes `false` in all undefined cases.

---

### [HIGH] `OPENCODE_MOCK_PATH` reads `process.env` in production code

- **File:** `OpenCodeModelProvider.ts:339`
- **Finding:** `findOpenCodeCommand()` reads `process.env['OPENCODE_MOCK_PATH']` unconditionally in the production binary path — any caller that can inject this env var can redirect the opencode binary to an arbitrary executable; there is no `NODE_ENV` or test-mode guard.
- **Suggested fix:** Remove the check from the class itself and inject the command override via the constructor (`commandOverride?: string[]`), so test code passes it explicitly and production code has no backdoor.

---

### [MEDIUM] Windows `.cmd` wrapper contradicts `shell: false` — code and comment disagree

- **File:** `OpenCodeModelProvider.ts:350-354`
- **Finding:** The inline comment says "On Windows, opencode resolves to a `.cmd/.bat` wrapper — must use `shell: true`, we return `'opencode'` and let the caller use `shell: true` on Windows," but no caller ever passes `shell: true`. On Windows this silently fails; if someone "fixes" this later by adding `shell: true`, it reopens shell-injection on the args array (T-05).
- **Suggested fix:** Either handle the `.cmd` case inside `findOpenCodeCommand()` by returning the resolved `.cmd` path and using a thin Node shim (`cmd /c`), OR document that Windows support is explicitly out of scope and throw a clear error on `process.platform === 'win32'`.

---

### [MEDIUM] `LaunchOptions.env` values are never validated against null bytes / control chars

- **File:** `ModelProvider.ts:124-140`
- **Finding:** `validateLaunchOptions()` validates `model`, `resumeSessionId`, and `mcpServers`, but never calls `validateString()` on `options.env` key/value pairs. A malicious flow can inject null bytes or newlines into subprocess environment variables.
- **Suggested fix:** Add a loop over `options.env` entries inside `validateLaunchOptions()` that applies `ENV_KEY_REGEX` to keys and `validateString()` to values, mirroring what `validateMcpServer()` already does.

---

### [MEDIUM] `ClaudeModelProvider.launchInteractive` has no `kill()` in `finally`

- **File:** `ClaudeModelProvider.ts:51-59`
- **Finding:** `launchBackground` calls `this.kill()` in its `finally` block (line 70), but `launchInteractive` only cleans up `mcpConfigPath` — if an exception propagates after the child process starts, the subprocess is not killed.
- **Suggested fix:** Add `this.kill()` to the `finally` block of `launchInteractive`, consistent with `launchBackground`.

---

### [INFO] ANTHROPIC_API_KEY forwarding delegated to `ClaudeLauncher` — not verifiable from provided files

- **File:** `ClaudeModelProvider.ts:85-105`
- **Finding:** `toClaudeOptions()` sets `isolateEnv: true` and forwards `env: options.env`; the actual `ANTHROPIC_API_KEY` injection lives in `ClaudeLauncher` (not provided). The threat model's T-01 claim that "ClaudeModelProvider forwards ANTHROPIC_API_KEY" cannot be verified from the reviewed files.
- **Suggested fix:** NOT DOCUMENTED — review `ClaudeLauncher.ts` to confirm the key is added only when `isolateEnv: true` and not leaked when `isolateEnv: false`.

---

### [INFO] `validateLaunchOptions` does not validate `options.workingDir` or `options.prompt`

- **File:** `ModelProvider.ts:124-140`
- **Finding:** `options.workingDir` and `options.prompt` are not validated for null bytes or control characters; only `model`, `resumeSessionId`, and `mcpServers` are checked.
- **Suggested fix:** Add `validateString(options.workingDir, 'workingDir')` and optionally `validateString(options.prompt, 'prompt')` (prompt length is already checked by OpenCode provider separately, but not centrally).

---

## Score: 5/10

The implementation handles most structural security requirements (env isolation, args array, temp-file cleanup, `finally` blocks on background) but the inverted `skipPermissions` default is a **critical elevation-of-privilege defect** — every flow step silently runs with full AI permissions unless explicitly disabled — and the `OPENCODE_MOCK_PATH` backdoor is a live attack surface in production binaries.
