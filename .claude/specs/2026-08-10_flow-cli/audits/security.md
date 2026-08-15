# Security Audit

**Scope:** `packages/flow-cli/src` — secrets, daemon, storage, worker, CLI, validation, utils  
**Date:** 2026-08-12  
**Files reviewed:** Secret.ts, SecretProvider.ts, LogMasker.ts, CommandHandler.ts, ExecutionStore.ts, McpServer.ts, WorkerAdapter.ts, WebSocketServer.ts, WorkerPool.ts, RunCommand.ts, FlowValidator.ts, loadYaml.ts

---

## Findings

### 1. [CRITICAL] No Authentication on Worker WebSocket — `WebSocketServer.ts:9-11, 27`

**Issue:** The daemon's WebSocket server binds to `127.0.0.1` but accepts connections from **any local process** with zero authentication. Any process running under the same or a lower-privileged user can connect, send forged `WorkerToDaemon` messages (e.g., `step_completed`, `inject_steps`), and manipulate execution state — marking failed steps as succeeded, injecting arbitrary steps, or poisoning the StepQueue. The comment `// v1: no token auth ... Tracked for v2` documents the gap but does not mitigate it.

**Fix:** Generate a per-daemon secret (e.g., written to `~/.flow-daemon/ws-token`) at daemon start and require workers to send it as the first message (a `hello` frame) before being accepted. Reject and terminate connections that do not present the correct token within a short grace window.

---

### 2. [CRITICAL] Worker PID Check is Trivially Spoofable — `WorkerPool.ts:71-86`

**Issue:** `registerWorker()` rejects connections whose PID is not in `spawnedPids`. However the PID value **comes from the untrusted WebSocket message itself** — the worker self-reports it. A rogue local process can claim any PID. Because `spawnedPids` is only cleared on child `exit`, a valid PID will remain in the set for the lifetime of the worker. This completely defeats the guard.

**Fix:** Do not rely on self-reported PID for authentication. The WebSocket auth token (finding #1 above) is the correct mechanism. If PID tracking is still desired for diagnostics, obtain it via OS-level APIs (e.g., `SO_PEERCRED` on Linux), not from the message payload.

---

### 3. [HIGH] Unrestricted Flow File Path — `CommandHandler.ts:41-52`

**Issue:** `handleRun` resolves `cmd.flowFile` against `cmd.cwd` (both user-supplied) with no restriction on the resulting absolute path. Any path on the filesystem can be passed. The file is read (`fs.readFileSync`) and parsed as YAML. While `yaml.JSON_SCHEMA` prevents arbitrary JS execution, a valid flow YAML found anywhere on disk (e.g., a CI config repurposed as a flow, a flow from another project) will be executed, running its `script` steps under the daemon's privileges.

**Fix:** Enforce that the resolved `flowFile` path stays within an allowed root (the project's `.agent-fleet/` directory, or the workspace `cwd`). Apply the same `path.relative(root, resolved).startsWith('..')` guard already used in `SecretProvider.ts`.

---

### 4. [HIGH] Bearer Token Sent as URL Query Parameter — `McpServer.ts:120, 138`

**Issue:** The MCP bearer token is embedded in the config URL as `?token=<value>` and is checked via `url.searchParams.get('token')`. Query parameters appear in HTTP server access logs, proxy logs, Node.js `IncomingMessage.url`, and any diagnostic tooling that logs request URLs. The token is also written into a temp file in its full URL form (`writeConfig`), readable by any process that can enumerate `/tmp`.

**Fix:** Require the token in the `Authorization: Bearer <token>` header instead of the query string. Update `writeConfig` to emit the token separately from the URL (or use the `Authorization` header in the MCP client configuration).

---

### 5. [HIGH] Workers Inherit Full Parent Environment — `WorkerPool.ts:36-43`

**Issue:** `spawnWorker()` passes `{ ...process.env, FLOW_DAEMON_PORT: ..., FLOW_WS_PORT: ... }` to the child process. Every secret present in the daemon's environment (e.g., `ANTHROPIC_API_KEY`, `DATABASE_URL`, cloud credentials, CI tokens) is inherited verbatim by every spawned worker. If a worker is compromised or a rogue step exfiltrates env vars, all parent secrets are exposed.

**Fix:** Build an explicit allowlist of env vars needed by workers (at minimum `PATH`, `HOME`, `FLOW_DAEMON_PORT`, `FLOW_WS_PORT`, and whichever API keys the worker legitimately needs). Pass only those keys. Use `Object.create(null)` as the base and populate it manually.

---

### 6. [MEDIUM] Short Secrets Not Masked (< 4 chars) — `LogMasker.ts:17-18`

**Issue:** `register()` skips any variant whose encoded length is less than 4 characters. A secret value of 1–3 bytes (or whose base64/hex encoding is shorter than 4 chars) will never be registered and will appear in plaintext in logs. While intentional (to avoid over-masking common tokens), there is no warning or enforcement that secrets must meet a minimum length before being accepted.

**Fix:** Enforce a minimum length at the `SecretProvider` level: throw `SecretResolutionError` if the resolved plaintext is fewer than 4 characters. This pushes the policy to the point of resolution rather than silently allowing unmasked secrets downstream.

---

### 7. [MEDIUM] URL-Encoded and JSON-Escaped Secret Variants Not Masked — `LogMasker.ts:33-51`

**Issue:** `buildVariants()` registers 7 encoding forms (plaintext, base64, base64url, hex, two base64 offsets), but does not cover percent-encoding (`%XX`), JSON string escaping (`\uXXXX`), or HTML entity encoding. A secret appearing inside a URL query string (very common with API keys), a JSON-encoded body logged at debug level, or an HTML response would not be masked.

**Fix:** Add `encodeURIComponent(value)` and `JSON.stringify(value).slice(1, -1)` (JSON-escaped body, strip surrounding quotes) to the variants array. Evaluate whether HTML-entity encoding is in scope for log sources.

---

### 8. [MEDIUM] No Mutual Exclusion on ExecutionStore File Writes — `ExecutionStore.ts:66-119`

**Issue:** `update()` is a read-modify-write operation (`read` → merge → `write`) with no file-level locking. Under concurrent execution (multiple steps completing simultaneously for the same `executionId`), two callers can read the same stale state, apply different patches, and the last writer wins — silently discarding the other's update. Steps can be lost from `currentSteps`, `status` transitions can be skipped.

**Fix:** Use an in-memory per-`executionId` mutex (e.g., a `Map<string, Promise<void>>` serializing writes) or write-ahead with atomic rename (`fs.writeFileSync` to a `.tmp` file then `fs.renameSync`). For a v2, consider SQLite with `BEGIN EXCLUSIVE`.

---

### 9. [MEDIUM] Injected Step Field Values Not Validated — `McpServer.ts:50-54, 211-245`

**Issue:** `ALLOWED_STEP_FIELDS` restricts which **keys** can appear in injected steps, but the **values** of dangerous fields (`script`, `workingDir`, `env`, `prompt`, `flowId`) are passed through entirely unvalidated to the `StepRunner`. A compromised or malicious MCP caller (who has the bearer token) can inject a `script` step executing arbitrary shell commands, set `workingDir` to an arbitrary path, or override `env` with attacker-controlled values.

**Fix:** Apply the same `FlowValidator` schema validation to injected steps that is applied to statically-defined flow steps in `CommandHandler.handleRun`. At minimum, validate `workingDir` against the workspace path (same guard as `SecretProvider`) and restrict `env` keys to non-sensitive names.

---

### 10. [MEDIUM] No Request Rate Limiting on MCP Endpoint — `McpServer.ts:131-157`

**Issue:** The MCP HTTP server has a 1 MiB body cap but no rate limiting on the number of requests. A caller with the bearer token (i.e., the Claude process, or anything that read the config file) can flood the endpoint with `tools/call` requests, triggering unbounded `onInjectSteps` callbacks and exhausting the StepQueue / worker pool.

**Fix:** Add a simple token-bucket or request-count cap (e.g., max N `tools/call` requests per second per connection) and reject with HTTP 429 when exceeded.

---

### 11. [MEDIUM] findProjectRoot Traverses to Filesystem Root — `RunCommand.ts:42-50`

**Issue:** `findProjectRoot` walks parent directories until it finds `.agent-fleet/` or reaches the filesystem root. On a misconfigured machine where `.agent-fleet/` is absent, this performs O(depth) `fs.existsSync` calls up to root and returns `null`. There is no depth limit. On deeply nested paths this is a minor DoS; on network-mounted filesystems each `existsSync` is a blocking network call.

**Fix:** Cap the traversal at a reasonable depth (e.g., 20 levels) and return `null` if exceeded, or limit the search to the user's home directory subtree.

---

### 12. [LOW] Duplicate `markIdle` Method — `WorkerPool.ts:105-111`

**Issue:** `markIdle` is declared twice (lines 105–108 and 109–111). TypeScript will emit a compile error; the second declaration shadows the first. This is likely dead code from a merge conflict.

**Fix:** Remove the duplicate declaration at lines 109–111.

---

### 13. [LOW] TOCTOU Race Between existsSync and readFileSync — `loadYaml.ts:5-8`

**Issue:** `loadYaml()` calls `fs.existsSync(file)` then `fs.readFileSync(file)` in separate syscalls. Between the two, a concurrent process can delete or replace the file (symlink swap, log rotation). The function exits via `process.exit(1)` on read failure, which skips any registered cleanup handlers.

**Fix:** Remove the `existsSync` guard and wrap `readFileSync` in a `try/catch` that rethrows a descriptive `Error` (do not call `process.exit` from a utility function — let callers decide). This also avoids the TOCTOU window.

---

### 14. [LOW] Predictable MCP Config Temp Filename — `McpServer.ts:124`

**Issue:** The config file is written to `os.tmpdir()/flow-mcp-<executionId>-<Date.now()>.json`. `Date.now()` is predictable (millisecond precision). A local attacker can enumerate or predict the filename and either read the token before the file is deleted, or pre-create a symlink to redirect the write. The file is mode `0o600` which limits read access on POSIX, but the create-then-write is still racy (TOCTOU on symlink).

**Fix:** Use `fs.mkstempSync` (or `tmp`/`tmp-promise` library) to generate an unpredictable filename atomically with `O_EXCL`. If staying with manual creation, add a `crypto.randomBytes(8).toString('hex')` suffix instead of `Date.now()`.

---

## Summary Table

| #   | Severity | Area       | One-liner                                                  |
| --- | -------- | ---------- | ---------------------------------------------------------- |
| 1   | CRITICAL | WebSocket  | No auth on daemon worker WebSocket                         |
| 2   | CRITICAL | WebSocket  | PID check uses attacker-controlled value                   |
| 3   | HIGH     | IPC        | Flow file path unrestricted — any file can be run          |
| 4   | HIGH     | MCP        | Bearer token in URL query string — logged                  |
| 5   | HIGH     | Process    | Workers inherit full daemon env (all secrets)              |
| 6   | MEDIUM   | Logging    | Short secrets (< 4 chars) silently unmasked                |
| 7   | MEDIUM   | Logging    | URL-encoded / JSON-escaped secret variants unmasked        |
| 8   | MEDIUM   | Storage    | Concurrent ExecutionStore writes have no locking           |
| 9   | MEDIUM   | MCP        | Injected step values (script, workingDir, env) unvalidated |
| 10  | MEDIUM   | MCP        | No rate limiting — token holder can flood StepQueue        |
| 11  | MEDIUM   | CLI        | findProjectRoot traverses to filesystem root               |
| 12  | LOW      | WorkerPool | Duplicate markIdle method — compile error                  |
| 13  | LOW      | Utils      | TOCTOU between existsSync and readFileSync in loadYaml     |
| 14  | LOW      | MCP        | Predictable temp config filename (Date.now suffix)         |

## Score: 4/10

The `SecretProvider` path-traversal and symlink defenses, `LogMasker` multi-encoding coverage, `ExecutionStore` ID validation, and MCP body-size cap are well-implemented. However, the two critical WebSocket findings (no auth + spoofable PID) mean any local process can fully control the daemon — undermining all other defences. The worker environment inheritance (finding #5) compounds this by exposing every parent-process secret to each spawned worker. These three issues alone drop the score significantly. Fixing findings 1–5 would bring the codebase to a solid 7–8/10.
