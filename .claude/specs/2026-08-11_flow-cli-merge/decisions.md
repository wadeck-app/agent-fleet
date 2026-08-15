# Architectural Decisions

## D1 — One `flow` CLI, one `task` CLI

One unified `flow` binary (not two). The `task` binary stays as its own separate entry point.

**Rationale:** Two packages named `flow-cli` with overlapping command names (`flow run`, `flow validate`) is unsustainable. The `task` binary has a distinct concern (ticket/task lifecycle management) and must not be merged into `flow`.

---

## D2 — `flow run` is async by default; `--wait` for synchronous experience

`flow run <flowRef>` queues the execution via daemon, prints `executionId`, exits immediately.
`flow run <flowRef> --wait` blocks until the execution reaches a terminal state, then prints the result.

**Rationale:** The daemon architecture (Repo B) is the only working execution path. Async-by-default enables the core use case (flows outlive the terminal). `--wait` gives developers the synchronous experience without maintaining a separate in-process execution path.

---

## D3 — `--wait` timeout: 10 minutes by default, configurable

Default timeout for `--wait`: **10 minutes**.

Configurable in `~/.flow-config.yaml`:
```yaml
run:
  waitTimeout: 10m
```

Overridable per invocation: `flow run --wait --timeout 30m`

On expiry: non-zero exit with message: `Timeout after Xm — execution still running, id: <executionId>`

---

## D4 — Output format: human by default, explicit flags to override

Default output is always **human-readable** regardless of context. No TTY detection.

- `flow <command>` → human-readable output
- `flow <command> --json` → JSON output (for agent/script callers)
- `flow <command> --human` → force human output (override any config default)

Configurable default in `~/.flow-config.yaml`:
```yaml
output:
  defaultFormat: json   # override default for this machine
```

**Rationale:** TTY detection changes behavior silently depending on context (pipe, redirect, CI). This is confusing to debug. An explicit flag is always predictable.

**Impact on `flow validate`:** on `--json`, outputs the Repo B contract (exit codes 0/1/2/3, JSON body). On human (default), outputs Repo A format (`✓ Flow is valid`, per-step error locations).

---

## D5 — Keep `flow show` and `flow docs` from Repo A

Both inspection commands are carried into the unified CLI.
- `flow show <file>` — ASCII table: steps, types, dependencies, outputs
- `flow docs [-o <file>]` — FlowCapabilitiesGenerator markdown output

**Rationale:** Pure read-only introspection with no execution side effects. Genuine discoverability value. Zero architecture dependency.

---

## D6 — Keep Repo B execution architecture wholesale

The daemon + worker pool from Repo B is the only real execution engine. Repo A's PoC daemon (`engine-daemon.ts`, `engine-daemon-entry.ts`, `engine-client.ts`) is non-functional (never calls FlowExecutor) and is deleted.

Carried from Repo B: `Daemon`, `CommandHandler`, `StepQueue`, `WorkerPool`, `WebSocketServer`, `StepExecutor`, `Worker`, `McpServer`, `ExecutionStore`, `LogWriter`, `HookDispatcher`, `DeclaredWorkspaceProvider`, `ipc/Protocol.ts`.

---

## D7 — Fix YAML coercion bug before merge

Repo B's `CommandHandler.handleRun` calls `yaml.load()` without `{ schema: yaml.JSON_SCHEMA }`. This allows silent type coercions (date strings become Date objects). Fix: adopt Repo A's `loadYaml` utility everywhere.

This is a one-line fix but must be done before merge to avoid introducing a regression.

---

## D8 — Fix `flow-engine` dependency classification in Repo B

Repo B declares `flow-engine` as a `devDependency` but `CommandHandler.ts` imports `FlowValidator` as a value at runtime. In a monorepo with workspace hoisting this works accidentally. It must be moved to `dependencies`.

---

## D9 — Commander.js as the CLI framework

Replace Repo B's hand-written `process.argv` switch with Commander.js (already used in Repo A). Each command becomes a `registerXCommand(program: Command)` function. Commander provides automatic `--help`, option parsing, type coercion, and an enforced convention for adding commands.

---

## D10 — No Go launcher

The Go launcher in Repo A (`launcher-go/`, `scripts/build-launcher.mjs`) references a `flow.cjs` that does not exist and has no `bin` entry in `package.json`. It is dead code and is deleted. Distribution artifact: esbuild bundle (Repo B approach).

---

## D11 — No package split yet

The daemon + worker logic currently lives inside `flow-cli` (Repo B). Extracting it into a separate `flow-worker` package is the right long-term direction but is deferred. No feature is blocked by keeping it monolithic. The split is done after the merge is stable.

Exception: D8 (fix `flow-engine` dep classification) must happen regardless of split timing.

---

## D12 — Worker adapter wraps StepRunner, does not port StepExecutor

Repo B's `StepExecutor` is an IPC-bound class with an interface incompatible with flow-engine's `StepRunner`. `StepRunner` already provides retry, subflow recursion, user_intervention handling, and interactive mode that `StepExecutor` explicitly defers.

**Decision:** Build a thin worker adapter that wraps `StepRunner.executeStep()`, translates IPC types (`AssignableStep`, `ExecutionContext`) to flow-engine types, manages `McpServer` start/stop around model steps, and forwards `inject_steps` / log messages via `sendMessage`. Do not port `StepExecutor`.

---

## D13 — Use WorkspaceManager directly, do not port DeclaredWorkspaceProvider

Repo B's `DeclaredWorkspaceProvider` is a v1 stub: `isolated` throws, `shared`/`manual` both return `cwd` unchanged. `WorkspaceManager` in `agent-fleet_cli-v2` fully implements all three modes.

**Decision:** Update `CommandHandler` to call `manager.allocate({ taskId: executionId, config: flow.workspace })` and use `.path`. `DeclaredWorkspaceProvider` is not ported.

---

## D14 — Move `TaskStatus` from `shared-orch-worker` to `shared-common`

`flow-engine` imports `TaskStatus` from `shared-orch-worker` at runtime. `shared-orch-worker` is an orchestrator-stack concern that should not be a transitive dependency of a standalone CLI.

**Decision:** Move `TaskStatus` (and any other types in `shared-orch-worker` that are purely domain types with no orchestrator concern) to `shared-common`. Update all import paths in `flow-engine` and any other consumers. `flow-engine` becomes independent of `shared-orch-worker`.
