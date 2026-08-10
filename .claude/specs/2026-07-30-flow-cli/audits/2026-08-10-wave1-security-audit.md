# Security Audit — Wave 1 (2026-08-10)

## Findings

### F1 — McpServer: unbounded request body (Critical → Fixed)
**File:** `src/worker/McpServer.ts` `readBody()`
**Problem:** No body size limit → DoS via memory exhaustion.
**Fix:** Added `MAX_BODY_BYTES = 1 MiB` hard cap in `readBody()`, destroys socket on excess.
**Status:** Fixed. Documented in threat-model.md.

### F2 — McpServer: temp config world-readable (High → Fixed)
**File:** `src/worker/McpServer.ts` `writeConfig()`
**Problem:** `fs.writeFileSync` without `mode` → file readable by all local users.
**Fix:** Added `{ mode: 0o600 }` to `writeFileSync`.
**Status:** Fixed. Note: ineffective on Windows (documented in threat-model.md).

### F3 — SecretProvider: symlink escape via `file://` (High → Fixed)
**File:** `src/secrets/SecretProvider.ts`
**Problem:** `path.relative()` check could be bypassed via symlinks pointing outside workspaceDir.
**Fix:** Added `fs.realpathSync()` after initial check, re-validates real path.
**Status:** Fixed.

### F4 — ExecutionStore: path injection via executionId (High → Fixed)
**File:** `src/storage/ExecutionStore.ts`
**Problem:** No validation of executionId format before constructing file paths.
**Fix:** Added `assertExecutionIdSafe()` validating `/^[a-z0-9]{8}$/` on `create()` and `read()`.
**Status:** Fixed.

### F5 — WebSocket: no maxPayload cap (Medium → Fixed)
**File:** `src/daemon/WebSocketServer.ts`
**Problem:** Default `ws` maxPayload is 100 MiB — rogue local process could exhaust daemon memory.
**Fix:** Added `maxPayload: 1024 * 1024` (1 MiB) to `WsServer` constructor.
**Status:** Fixed.

### F6 — StepQueue: unbounded step injection (Medium → Fixed)
**File:** `src/daemon/StepQueue.ts` `injectSteps()`
**Problem:** No limit on total injected steps per execution — repeated `provideSteps` calls exhaust memory.
**Fix:** Added `MAX_INJECTED_STEPS_PER_EXECUTION = 1000` cap.
**Status:** Fixed.

### F7 — Secrets infrastructure not wired (Medium → Documented)
**Files:** `src/secrets/SecretProvider.ts`, `src/secrets/LogMasker.ts`
**Problem:** Both classes implemented and tested but never instantiated in Worker execution path. Log entries may contain plaintext secret values.
**Status:** Documented in threat-model.md as "Known limitations (v1)". Tracked for v2.

### F8 — SSRF via HTTP hook URLs (Not Applicable)
**File:** `src/hooks/HookDispatcher.ts`
**Problem (claimed):** HTTP hook URLs could target private IP ranges.
**Why not applicable:** Hook URLs come from `.flows/config.yml` written by the user themselves — no external attacker controls the URL. Documented in threat-model.md.
