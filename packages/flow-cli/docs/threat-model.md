# flow-cli Threat Model

## Trust boundaries

| Component | Trust level |
|-----------|-------------|
| User (operator running `flow` CLI) | Full trust — owns the machine |
| YAML flow files | Trusted — authored by the user |
| `.flows/config.yml` (hooks config) | Trusted — authored by the user |
| Worker subprocess | Trusted — spawned by daemon with SIGKILL authority |
| Claude subprocess | Untrusted input via stdout; injected script steps execute with full OS user permissions (see note below) |
| HTTP hook endpoints | Untrusted network — responses are ignored, only fire-and-forget POST |

## Addressed threats

### Path traversal via `file://` secrets
`SecretProvider` resolves the requested path then checks that the result stays
within `workspaceDir` using `path.relative()`. After that, `fs.realpathSync()`
resolves any symlinks and the check is repeated on the real path, blocking
symlinks that point outside the workspace.

### Unbounded request body in McpServer
`readBody()` enforces a 1 MiB hard cap and destroys the socket if exceeded,
preventing a rogue Claude process from exhausting daemon memory.

### Temp file permissions for MCP config
`McpServer.writeConfig()` writes with mode `0o600` (owner read/write only).
Current content is a loopback URL only, but future versions may include auth
tokens and this restriction prevents other local users from reading them.

### Worker spawn timeout
`WorkerPool.spawnWorker()` starts a `WORKER_CONNECT_TIMEOUT_MS` (10 s) timer.
If the worker process does not connect via WebSocket within that window, it is
killed with SIGKILL. This prevents orphaned workers from consuming a
concurrency slot indefinitely.

### ExecutionId path injection in ExecutionStore
`ExecutionStore` validates that every `executionId` matches `/^[a-z0-9]{8}$/`
before constructing a file path. This blocks path traversal attempts if an
untrusted source (e.g., a modified worker binary) sends a crafted id.

## Known limitations (v1)

### Secret masking not wired in Worker execution path
`SecretProvider` and `LogMasker` are implemented and tested in isolation but are
not yet wired into the Worker execution path. `StepExecutor` does not call
`SecretProvider.resolve()` for script env vars, and `LogMasker.mask()` is not
applied before `LogWriter.write()`. Consequence: if a user passes a secret
value as a plain string in a script env var, it may appear in
`~/.flow-daemon/logs/YYYY-MM-DD.ndjson`.

Mitigations in v1:
- The daemon log directory (`~/.flow-daemon/`) is created with default
  user-only permissions (mode depends on OS umask).
- `LogWriter` files are date-based NDJSON, not streamed to any network endpoint.

Tracked for v2: wire `SecretProvider` into `CommandHandler.handleRun()` input
resolution, and pass a `LogMasker` instance to `StepExecutor`.

## Known limitations (continued)

### WebSocket channel has no worker identity verification
Any local process can connect to `ws://127.0.0.1:wsPort`, send `{ type: 'ready', pid: N }`,
and be registered as an idle worker. A malicious local process could receive
`assign` messages (containing `ExecutionContext` with inputs and step outputs)
and send crafted `inject_steps` messages to execute arbitrary step scripts.

Mitigations in v1:
- The WS port is stored in `~/.flow-daemon/` with `mode: 0o700` (created by
  daemon startup), making it unreadable by other local users on POSIX systems.
- The threat requires code running as the same OS user (or root), which already
  has full access to the user's filesystem.

Tracked for v2: shared secret / token passed via `FLOW_WS_TOKEN` env var to
spawned workers, verified on the first `ready` message.

### MCP config file permissions (0o600) are ineffective on Windows
`McpServer.writeConfig()` passes `mode: 0o600` to `fs.writeFileSync`. On
Windows, Node.js silently ignores the `mode` option — Windows uses ACLs, not
POSIX permission bits. The file inherits the default ACL and may be readable
by other local users. The current content is a loopback URL only and is not
sensitive in v1. If auth tokens are added in a future version, a Windows-
specific ACL manipulation will be required.

### Unbounded stepOutputs accumulation
`ExecutionContext.stepOutputs` accumulates all step outputs over the lifetime of
an execution. With `MAX_INJECTED_STEPS_PER_EXECUTION = 1000` and 1 MiB per
message, a single execution can accumulate ~1 GiB in the daemon heap. `assign`
messages include the full `stepOutputs` map and grow proportionally, potentially
exceeding the worker's WS payload limit.

Mitigations in v1:
- The 1 MiB `maxPayload` cap on individual WS messages limits per-step output.
- Workers are local trusted processes — an adversarial worker would require local
  code execution.

Tracked for v2: per-execution `stepOutputs` size cap; lazy loading from disk
instead of in-memory accumulation.

### Claude subprocess filesystem access
Via the `provideSteps` MCP tool, Claude can inject script steps with arbitrary
`script` content. These script steps execute as the OS user running the daemon,
with full filesystem access — not sandboxed to `workspaceDir`. The
`workingDir` field of an injected step is not validated against `workspaceDir`.

This is intentional design: model steps producing sub-tasks via `provideSteps`
is the primary use case of flow-cli. The operator chooses which flows and models
to run — they accept this execution model. No sandbox is implemented or planned.

The threat arises only from prompt injection: if a model processes untrusted
content (e.g., a document containing adversarial instructions) and that content
triggers a `provideSteps` call with malicious scripts. Operators running flows
over untrusted input should apply model-level guardrails.

## Out-of-scope / not applicable

### SSRF via HTTP hook URLs
HTTP hook URLs come from `.flows/config.yml`, a file the user writes and owns
on the same machine. There is no request path where an external attacker can
supply a URL — only the local user can configure hooks. Blocking private IP
ranges would prevent legitimate use cases (e.g., hooks targeting a local
webhook receiver or an internal CI system). No blocklist is implemented.

### Daemon HTTP port exposure
The daemon binds to `127.0.0.1` (loopback only) via `singleton-daemon-kit`.
It is not reachable from the network.

### WebSocket port exposure
The WebSocket server also binds to `127.0.0.1:WS_PORT` (loopback only). Only
processes on the same machine can connect.
