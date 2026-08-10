# Flow CLI — Implementation Prompt

## Progress

> Last updated: 2026-08-09. Update this section after each step completes.

### Steps

| Step | Status | Notes |
|------|--------|-------|
| Step 1 — Minimal plumbing (script step end-to-end) | ✅ Done | Daemon, worker, WebSocket, ExecutionStore, LogWriter, FlowValidator, RunCommand, ValidateCommand, integration test passing |
| Step 2 — Model steps | ✅ Done | ClaudeLauncher env isolation fixed, StreamJsonParser sessionId capture, StepExecutor.executeModel wired with OutputExtractor + TemplateRenderer |
| Step 3 — Secrets and env isolation | ✅ Done | Secret, SecretProvider, LogMasker implemented and tested |
| Step 4 — MCP server + provideSteps | ✅ Done | McpServer (JSON-RPC 2.0 on random port), inject_steps IPC message, StepQueue.injectSteps, wired into StepExecutor.executeModel |
| Step 5 — Hooks | ✅ Done | HookDispatcher (cli + http), onFlowStart/End/Error, onStepStart/End/Failed, onTaskCreated, onStatusChange |
| Step 6 — task CLI | ✅ Done | task new/list/show/approve/set-status, TaskStore (.flows/tasks/), hooks wiring |

### Additional fixes applied (not in original steps)

- `ScriptExecutor.ts` (flow-engine): added `isolateEnv` option
- `ClaudeLauncher.ts` (flow-engine): added `isolateEnv` + `mcpConfigPath` options
- `CommandHandler.ts`: D8 — user_intervention steps rejected with UNSUPPORTED_STEP_TYPE error
- `ExecutionStore.ts`: D22 — pruneOldExecutions() added, retainDays wired from config
- `RunCommand.ts`: dead imports removed (CommandHandler/StepQueue/WorkerPool)
- esbuild-based build (`build.mjs`) — tsc NodeNext incompatible with flow-engine bundler resolution

### Test coverage status

- `ExecutionStore.test.ts` — ✅ full coverage including pruneOldExecutions
- `LogWriter.test.ts` — ✅
- `StepQueue.test.ts` — ✅
- `FlowValidator.test.ts` — ✅
- `DeclaredWorkspaceProvider.test.ts` — ✅
- `Secret.test.ts` — ✅
- `LogMasker.test.ts` — ✅
- `SecretProvider.test.ts` — ✅
- `StepExecutor.test.ts` — ✅ (script + subflow; model step not unit-tested — requires Claude)
- `EndToEnd.test.ts` — ✅ script step integration test passing
- `McpServer.test.ts` — ✅
- `HookDispatcher.test.ts` — ✅
- `TaskStore.test.ts` — ✅
- `TaskIndex.test.ts` — ✅
- `StepExecutor.test.ts` (model step + McpServer mock) — ✅
- Total: 114 tests, 14 test files, all passing

### Security fixes applied (from code review)

- `WebSocketServer.ts`: bind to `127.0.0.1` only (was `0.0.0.0` — exposed to network)
- `SecretProvider.ts`: path traversal validation — resolved path must stay within workspaceDir
- `Daemon.ts`: hook failures now logged (`dispatchHook` helper) instead of silently swallowed
- `SecretProvider.test.ts`: added path traversal test cases (`../../etc/passwd`, `../sibling/secret`)

### Known decisions made during implementation

- Build: esbuild (`build.mjs`) instead of tsc — flow-engine uses `module: bundler`, incompatible with NodeNext
- vitest: custom resolver plugin in `vitest.config.ts` handles `flow-engine/src/...` subpath imports
- Worker dispatch: `tryDispatch()` loops on `!stepQueue.isEmpty()` (not `canSpawn()`) — canSpawn is only checked inside the loop
- `StepExecutor` constructor takes a `sendMessage` callback — injected by Worker.ts so log/inject messages reach the daemon

---

## Context

You are implementing `flow-cli`, a standalone CLI tool for executing YAML-described flows.
The architecture is fully specified in `.claude/specs/2026-07-30-flow-cli/`. Read ALL files in that directory before writing any code.

The monorepo lives at `C:\Users\Wadeck\Workspace\__exp\agent-fleet`.
The singleton-daemon-kit library is at `C:\Users\Wadeck\Workspace\__exp\singleton-daemon-kit` (source: https://github.com/Wadeck/singleton-daemon-kit). It is an external npm package `@wadeck/singleton-daemon-kit` — NOT a monorepo workspace package. Requires the private GitLab registry configured in `~/.npmrc`.

Key API (read source for full details):
```typescript
import { createDaemon, createDaemonClient } from '@wadeck/singleton-daemon-kit';

// Daemon process — commands is a map of handler functions
const handle = await createDaemon({
  configDir: path.join(os.homedir(), '.flow-daemon'),
  commands: {
    run: (payload) => { /* enqueue execution, return { executionId } */ },
  },
  idleTimeout: null,  // flow-cli manages its own shutdown via handle.stop('idle')
  hooks: { onStart: (port) => { /* start WebSocket server on port+1 */ } },
});
// handle.port — actual bound port
// handle.stop('idle') — called when ready-step queue drains (D13)

// CLI process — sends command, gets typed response
const client = createDaemonClient({ configDir: path.join(os.homedir(), '.flow-daemon'), commands: {} as ... });
const result = await client.send('run', { flowFile, inputs });
// DaemonNotRunningError thrown if daemon not up — CLI then calls createDaemon() (D1)
// createDaemon() makes the CURRENT process the daemon (it binds HTTP, enters event loop)
// The CLI does NOT spawn a child process for the daemon — it becomes the daemon inline
// Startup sequence: try client.send() → DaemonNotRunningError → call createDaemon() → process original command → event loop
```

`~` paths: use `os.homedir()` — Node.js `fs` does not expand `~`.

## What to build

A new package `packages/flow-cli` implementing v1 scope (D1–D11, D13–D18, D20–D22, D25, D27, D29–D39).

## Package structure

```
packages/flow-cli/
  src/
    cli/
      index.ts               ← entry point for `flow` binary — parses argv, routes to run/validate
      TaskIndex.ts           ← entry point for `task` binary — parses argv, routes task commands
      RunCommand.ts          ← flow run
      ValidateCommand.ts     ← flow validate
    daemon/
      Daemon.ts              ← singleton-daemon-kit wrapper, HTTP server, command router
      CommandHandler.ts      ← processes ClientCommand, enqueues steps
      StepQueue.ts           ← ready-step queue (D5, D16)
      WorkerPool.ts          ← spawns/tracks worker processes (D5)
      WebSocketServer.ts     ← Channel 2 WebSocket server (started in onStart hook)
    worker/
      Worker.ts              ← worker entry point, WebSocket client, step execution
      McpServer.ts           ← per-execution MCP server (D35), exposes provideSteps
      StepExecutor.ts        ← dispatches to model/script executors
    ipc/
      Protocol.ts            ← TypeScript types for Channel 1 and Channel 2 messages
    storage/
      ExecutionStore.ts      ← reads/writes executions/*.json (D21)
      LogWriter.ts           ← writes prefixed NDJSON logs (D17, D20)
    secrets/
      SecretProvider.ts      ← resolves env://, file://, input:// URIs
      Secret.ts              ← Secret class with [REDACTED] serialization (D31)
      LogMasker.ts           ← 6-variant masking registration and apply (D31)
    validation/
      FlowValidator.ts       ← thin adapter: calls flow-engine's FlowValidator directly, adds CLI-specific error formatting for exit 1/2
    hooks/
      HookDispatcher.ts      ← routes hook events to cli/http listeners (D32)
    workspace/
      DeclaredWorkspaceProvider.ts  ← throws UnsupportedOperationError for mode 'isolated'; returns cwd for 'shared'/'manual'
  package.json
  tsconfig.json
```

**`package.json` template** — model after `packages/flow-engine/package.json`:
```json
{
  "name": "flow-cli",
  "version": "1.0.0",
  "type": "module",
  "bin": { "flow": "./dist/cli/index.js", "task": "./dist/cli/TaskIndex.js" },
  "scripts": {
    "build": "tsc --build tsconfig.json",
    "pretest": "tsc --build tsconfig.json",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "flow-engine": "*",
    "@wadeck/singleton-daemon-kit": "^1.0.0",
    "js-yaml": "^4.1.1",
    "ws": "^8.0.0"
  },
  "devDependencies": {
    "typescript": "^5.3.3",
    "vitest": "^4.0.14",
    "@types/node": "*",
    "@types/ws": "^8.0.0",
    "@types/js-yaml": "^4.0.9"
  }
}
```

**`tsconfig.json` template:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "ES2023"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true
  },
  "include": ["src"],
  "references": [{ "path": "../flow-engine" }]
}
```
`"lib": ["ES2022", "ES2023"]` is required for `await using` — `Symbol.asyncDispose` is in ES2023, not ES2022.

## Key architectural rules

- Workers are separate OS processes (`child_process.spawn`) — never threads (D4)
- Daemon holds NO authoritative in-memory state — all state in `executions/*.json` and `logs/*.ndjson` (D21)
- Default env for subprocesses: NOTHING — no PATH, no HOME, no inheritance (D31)
- SIGKILL for worker process kill — no SIGTERM (D4)
- Fail fast: `switch` default cases throw, no silent fallbacks
- TypeScript files are PascalCase matching their exported class

## Implementation order (D38)

### Step 1 — Minimal plumbing (validate the architecture)

Implement only enough to execute a single `script` step end-to-end:
1. `flow validate <file>` — validate a YAML flow file, exit 0/1/2 with JSON errors to stdout
2. `flow run <file>` — start daemon if needed, queue execution, print executionId, exit
3. Daemon: HTTP server via singleton-daemon-kit, accept `{ type: 'run' }` command
4. Worker: spawned as child process, connects via WebSocket, receives `assign`, executes `script` step, sends `result`
5. ExecutionStore: write execution state on each transition
6. LogWriter: write prefixed NDJSON lines

Do NOT implement model steps, MCP server, secrets, or hooks in step 1.

### Step 2 — Model steps

Add `model` step execution via `ClaudeLauncher` (reuse from `packages/flow-engine`).
Add `StreamJsonParser` usage for step output extraction (D25).
Add session ID capture for `--resume` (fix the TODO in StreamJsonParser).

### Step 3 — Secrets and env isolation

Implement `Secret`, `SecretProvider`, `LogMasker`.
Enforce NOTHING default env.
Validate `value://` forbidden in `secrets:`.

### Step 4 — MCP server and `provideSteps`

Implement `McpServer` started at `assign` message receipt (D35).
Expose `provideSteps` tool with schema from D39.
Implement `parent` field and child-step completion tracking (D36).

### Step 5 — Hooks

Implement `HookDispatcher` (D32).
Wire `onFlowStart`, `onFlowEnd`, `onFlowError`, `onStepStart`, `onStepEnd`, `onStepFailed`.

### Step 6 — `task` CLI

Implement `task new`, `task list`, `task show`, `task approve`, `task set-status`.
Storage in `.flows/tasks/` (D33).
Wire hooks from `.flows/config.yml`.

## Reuse from flow-engine

These classes are reusable as-is from `packages/flow-engine/src/`:
- `GraphValidator` — graph structure validation (`validation/GraphValidator.ts` — exists, but `DAGValidator.ts` also still exists as a separate class; use `GraphValidator` only)
- `OutputExtractor` — step output extraction with retry loop
- `TemplateRenderer` — `${{ }}` interpolation
- `StreamJsonParser` — NDJSON parser for Claude CLI output
- `ClaudeLauncher` — Claude subprocess launcher (fix env isolation TODO)
- `ConditionEvaluator` — `when:` field evaluation
- `ScriptExecutor` — script step execution (`executor/ScriptExecutor.ts`) — reuse, but the worker must pass `env: {}` (not `process.env`) to enforce NOTHING default (the existing TODO in that file). Fix the env inheritance in Step 1.
- `FlowValidator` — full validation pipeline (`validation/FlowValidator.ts`) — call directly; the flow-cli `FlowValidator` is only a thin adapter for exit code / JSON formatting

Do NOT reuse `FlowExecutor`, `FlowOrchestrator`, `StepRunner` — these run in-process and must be replaced by the daemon+worker+WebSocket model.

## IPC protocol

See `.claude/specs/2026-07-30-flow-cli/ipc-protocol.md` for exact message types.

Channel 1 (CLI↔Daemon): HTTP/1.1 loopback via singleton-daemon-kit. Port discovered from `os.homedir()/.flow-daemon/config.port`.
Channel 2 (Daemon↔Worker): WebSocket on `HTTP_PORT + 1`. Workers receive `FLOW_DAEMON_PORT` and `FLOW_WS_PORT` as env vars at spawn.

Key message shapes — authoritative source is `ipc-protocol.md`, reproduced here for reference:
```typescript
// Daemon → Worker (Channel 2)
type DaemonToWorker =
  | { type: 'assign'; stepId: string; stepConfig: FlowStep; executionContext: ExecutionContext }
  // stepConfig uses a local narrowed type (NOT the flow-engine FlowStep export which includes UserInterventionStep):
  // type AssignableStep = ModelFlowStep | ScriptFlowStep | SubFlowStep  — define in Protocol.ts
  // SubFlowStep in Step 1: StepExecutor must throw UnsupportedOperationError for type 'subflow' (D26 is v2)
  // no top-level executionId — it lives inside executionContext
  | { type: 'idle' }   // no ready steps, worker waits
  | { type: 'done' }   // no more steps, worker exits

// Worker → Daemon (Channel 2)
type WorkerToDaemon =
  | { type: 'ready'; pid: number }   // no executionId — worker is execution-agnostic at spawn (D16)
  | { type: 'log'; executionId: string; stepId: string; entry: LiveLogEntry }
  // LiveLogEntry from flow-engine/src/types.ts (NOT LogEntry — that name doesn't exist)
  | { type: 'step_completed'; executionId: string; stepId: string; output: Record<string, any> }
  // output: extracted runtime values, e.g. { pr_url: "https://...", branch: "feat/x" }
  // StepOutput from flow-engine is an OUTPUT SCHEMA declaration — NEVER use it here
  | { type: 'step_failed'; executionId: string; stepId: string; error: string }

// ExecutionContext (CLI-specific type, NOT FlowExecutionContext from flow-engine):
interface ExecutionContext {
  executionId: string;
  inputs: Record<string, string>;
  stepOutputs: Record<string, Record<string, any>>;
  workspaceDir: string;   // resolved by daemon before enqueueing (CWD from ClientCommand.cwd)
}
```

**Worker lifecycle loop:**
```
connect → send ready → receive assign → execute step → send step_completed/step_failed → send ready → receive assign|idle|done → ...
```
After each `step_completed` or `step_failed`, the worker sends `ready` again to signal availability for the next step. The daemon may respond with `assign` (if steps are queued), `idle` (queue empty, wait), or `done` (no more steps, exit).

`ClientCommand.run` includes `cwd` (the caller's working directory at invocation time — passed by CLI via `process.cwd()`):
```typescript
{ type: 'run'; flowFile: string; flowId?: string; inputs?: Record<string, string>; quiet?: boolean; cwd: string }
```
The daemon uses `cwd` to resolve relative `flowFile` paths and as the default workspace directory when the flow YAML has no `workspace:` field or `workspace.path` is relative.

`DeclaredWorkspaceProvider.prepare()` is called by the daemon when it processes a `run` command — before enqueueing the first step. The resolved `workspaceDir` string is stored in `ExecutionContext.workspaceDir` and passed to every worker via the `assign` message. The worker passes `workspaceDir` as `workingDir` to `ScriptExecutor`.

`quiet: true` suppresses the executionId stdout line in the CLI after successful queue. No effect on daemon or worker behavior — it is a client-side only flag.

`flowId`: when the YAML file contains multiple flows (D6), `flowId` selects which one to run. If the file has one flow, `flowId` is optional and defaults to the single flow's `id`.

Worker spawn path — use `process.execPath` (not `'node'` — `PATH` is NOTHING by design). Package is ESM (`"type": "module"`) — `__dirname` does not exist, use `import.meta.url`:
```typescript
import { fileURLToPath } from 'node:url';
const workerPath = fileURLToPath(new URL('../worker/Worker.js', import.meta.url));
spawn(process.execPath, [workerPath], {
  env: { FLOW_DAEMON_PORT: String(port), FLOW_WS_PORT: String(port + 1) },
  detached: false,
})
```
Note: `execution-model.md` shows `spawn('node', ['worker.js'], ...)` — stale, use `process.execPath` + `import.meta.url`.

`DaemonResponse` for `flow run` exit 2: the daemon returns `{ type: 'error', code: 'VALIDATION_FAILED', message: string }`. The CLI detects `code === 'VALIDATION_FAILED'`, reads the full `ValidationError[]` from `message` (JSON-encoded), and exits 2 with `{ valid: false, errors }` to stderr. The `DaemonResponse` error type does NOT carry an `errors` array — the full error payload is JSON-encoded in `message`.

`ValidationError` is `ValidationIssue` from `flow-engine/src/validation/ValidationTypes.ts`. The fields are: `{ type: string; message: string; path?: string; severity: 'error' | 'warning' }`.

## Execution IDs

**Format:** 8-character base36 strings (execution-model.md). Do NOT use the `uuid` package. Use:
```typescript
function generateExecutionId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10).replace(/[^a-z0-9]/gi, '0').slice(0, 8);
}
```
Or more reliably:
```typescript
function generateExecutionId(): string {
  const hex = crypto.randomUUID().replace(/-/g, '');
  return parseInt(hex.slice(0, 11), 16).toString(36).padStart(8, '0').slice(-8);
}
```
The requirement: exactly 8 chars, alphanumeric only (base36: `[0-9a-z]`), never contains `|`. **Always pad to 8 chars** — naive `Math.random().toString(36)` can produce fewer digits.

## Worker pool model

Workers are **spawned on-demand** — not pre-spawned at daemon start. When a step becomes ready and a free worker slot is available (below `queue.concurrency` limit), the daemon spawns a new worker process. The spawned worker connects via WebSocket, sends `ready`, then receives `assign` immediately.

Workers are **reused across steps** — after sending `step_completed`, a worker sends `ready` and the daemon assigns it the next available step without killing and respawning it. A worker is only killed via SIGKILL when the WebSocket closes unexpectedly or when `done` has been sent and the worker exits cleanly.

`WorkerPool` tracks:
- `activeCount: number` — current number of live worker processes
- `concurrencyLimit: number` — from `queue.concurrency` config

When a step is enqueued: if `activeCount < concurrencyLimit`, spawn a worker. Otherwise the step waits in `StepQueue` until an existing worker sends `ready` (completing its prior step).

## Runtime dependency resolution

The daemon must determine which steps are "ready" (all `depends` satisfied) after each step completes. Do NOT reuse `FlowOrchestrator`. Implement this in `StepQueue`:

1. At execution start: build a `Map<stepId, Set<stepId>>` of unresolved dependencies for each step (from `step.depends`).
2. Steps with empty dependency sets are immediately enqueued.
3. On `step_completed`: remove the completed `stepId` from all dependency sets. Steps whose set becomes empty are added to the ready queue.
4. On `step_failed`: mark the execution failed; skip remaining steps.

`GraphValidator` handles validation only (static analysis) — not runtime tracking.

## `done` message semantics

`done` is sent to a worker when the **global ready-step queue is permanently empty** — i.e., all executions are complete (no running steps, no pending steps). The daemon tracks a reference count:
- On execution start: increment `activeExecutions`
- On execution `completed` or `failed`: decrement `activeExecutions`
- When `activeExecutions === 0` AND the ready-step queue is empty: send `done` to all idle workers, then call `handle.stop('idle')` (D13)

Workers are execution-agnostic — they do not know which execution they served. `idle` means "queue temporarily empty, wait." `done` means "shut down."

**D13 shutdown race guard**: before sending `done` and calling `handle.stop('idle')`, verify that `activeWorkers === 0` (no workers are mid-execution). A worker that just completed its step sends `ready` before the daemon decrements `activeExecutions`. The shutdown sequence is:
1. Worker sends `step_completed` → daemon decrements active step count
2. Worker sends `ready` → daemon checks: queue empty AND activeExecutions === 0 → send `done`
3. Never call `handle.stop('idle')` while any worker is still `busy`.

## ScriptExecutor env isolation

`ScriptExecutor` at line 87 does `{ ...process.env, ...options.env }`. To enforce NOTHING default env (D31), add an `isolateEnv?: boolean` option to `ScriptExecutionOptions`:
- `isolateEnv: true` → use ONLY `options.env` (no `process.env` merge)
- `isolateEnv: false` (default) → existing behavior (backward compatible)

Modify `ScriptExecutor.ts` in `packages/flow-engine/` to add this option. The flow-cli worker passes `isolateEnv: true` and `env: {}` for NOTHING isolation, then adds only the explicitly declared vars.

This is the only change to flow-engine in Step 1. All existing flow-engine tests continue to pass (default is unchanged).

## ValidationIssue → CLI type string mapping

`flow validate` exit 1 JSON uses `type: string` with values from D34: `graph`, `input`, `schema`, `cycle`, `template`.

```typescript
function validationCodeToType(code: ValidationCode): string {
  switch (code) {
    case ValidationCode.MISSING_FIELD:
    case ValidationCode.INVALID_TYPE:
    case ValidationCode.INVALID_VALUE:
    case ValidationCode.DUPLICATE_ID:
    case ValidationCode.EMPTY_COLLECTION:
    case ValidationCode.TYPE_MISMATCH:
      return 'schema';
    case ValidationCode.UNDEFINED_INPUT:
    case ValidationCode.UNDEFINED_OUTPUT:
    case ValidationCode.UNDEFINED_VARIABLE:
    case ValidationCode.UNDEFINED_FLOW:
      return 'input';
    case ValidationCode.UNDEFINED_STEP:
    case ValidationCode.UNREACHABLE_STEP:
    case ValidationCode.NO_TERMINAL_STEP:
      return 'graph';
    case ValidationCode.CIRCULAR_DEPENDENCY:
    case ValidationCode.CIRCULAR_SUBFLOW_REFERENCE:
      return 'cycle';
    case ValidationCode.INVALID_TEMPLATE_SYNTAX:
    case ValidationCode.MALFORMED_EXPRESSION:
      return 'template';
    default:
      return 'schema';  // warnings: UNUSED_INPUT, UNUSED_OUTPUT, MISSING_OUTPUT, AUTO_DISCOVERED_INPUT
  }
}
```

`path` field in output: use `issue.location?.path ?? issue.location?.stepId ?? ''`. Never omit the field — the contract declares it as a string.

## Output contracts

`flow validate`:
- Exit 0: silent (valid) — including when there are only warnings; exit 0 if `summary.errors === 0`
- Exit 1: `{ "valid": false, "errors": [{ "type": string, "message": string, "path": string }] }` to stdout — include only `severity: 'error'` issues (not warnings); `path` uses `issue.location?.path ?? issue.location?.stepId ?? ''`
- Exit 2: file not found
- Exit 3: file exists but YAML is malformed (not parseable) — same JSON format as exit 1 with `type: "parse_error"`, `path: ""`

`flow run`:
- Exit 0: prints executionId to stdout
- Exit 1: error JSON to stderr `{ "code": string, "message": string }`
- Exit 2: validation error (same format as flow validate exit 1) to stderr
- Exit 3: daemon could not start

## Minimal flow YAML example (for Step 1 integration test)

```yaml
id: hello-world
version: "1.0.0"
name: Hello World
description: Minimal test flow
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: greet
    type: script
    script: echo "hello"
```

`FlowDefinition` requires `version`, `name`, `description`, `workspace`, `inputs`. `WorkspaceConfig` requires `mode`, `gitStrategy`, `reusePolicy` (all validated by `SchemaValidator`). Use `mode: shared` + `gitStrategy: any` for integration tests — `DeclaredWorkspaceProvider` throws on `mode: isolated` (not supported in v1).

`ScriptFlowStep` uses `script:` (not `command:`) — field name in `types.ts:567`.

**YAML parsing**: load the flow file with `js-yaml.load(content)` and cast to `FlowDefinition`. There is no dedicated flow loader class in flow-engine — YAML parsing is the caller's responsibility. Pass the resulting object directly to `FlowValidator.validate()`.

**`FlowValidator` instance lifecycle**: create a fresh `FlowValidator` instance per call to `validate()` — the validator accumulates state in `this.issues` and is not safe for concurrent reuse.

**`FlowRegistry` for `flow validate`**: pass `undefined` — subflow cross-reference checking is disabled. For Step 1 this is acceptable; single-file flows have no cross-references.

**Idle worker push mechanism**: `WorkerPool` maintains a `Map<WebSocket, 'idle' | 'busy'>`. When a new step becomes ready, iterate the map to find the first idle socket, send `assign`, and mark it busy. If no idle workers exist, the step stays in the `StepQueue` until a worker sends `ready` (after completing its current step).

## Test requirements

- Test runner: vitest (same as flow-engine). Config: copy `packages/flow-engine/vitest.config.ts`.
- Unit tests next to each implementation file (`Foo.ts` → `Foo.test.ts`)
- Minimum 70% coverage, 90% for business logic
- For integration tests requiring a real daemon: use `singleton-daemon-kit`'s `TestDaemonHandle` (exported from `@wadeck/singleton-daemon-kit`) — it provides `[Symbol.asyncDispose]()` for automatic cleanup in `using` blocks.

**Integration test build requirement**: the worker is spawned by path to `dist/worker/Worker.js`. Integration tests MUST run after a build. Add to `package.json`:
```json
"pretest": "tsc --build tsconfig.json"
```
Without this, `vitest` will fail at worker spawn time with "file not found" — not a TypeScript error.

Step 1 integration test shape:
```typescript
it('executes a script step end-to-end', async () => {
  await using daemon = await startTestDaemon(); // TestDaemonHandle
  const result = await runFlow(daemon, './fixtures/hello-world.yml');
  const execution = await readExecutionFile(result.executionId);
  expect(execution.status).toBe('completed');
});
```

`startTestDaemon()` is a test helper to write in `src/test-utils/TestHelpers.ts` — it is NOT exported by `@wadeck/singleton-daemon-kit`. Use `singleton-daemon-kit`'s `createTestDaemon()` (read its source at `C:\Users\Wadeck\Workspace\__exp\singleton-daemon-kit`) to see what's available.

## Config file defaults

If `~/.flow-config.yaml` is absent, apply defaults silently:
```yaml
queue:
  concurrency: 1
logs:
  retainDays: 30
worker:
  reconnectTimeoutMs: 30000   # v2 only (D23/D24 crash recovery) — parse and store, do not use in v1
  bufferSpillMs: 15000        # v2 only (D23 log buffer) — parse and store, do not use in v1
  wsPort: null                # defaults to HTTP_PORT + 1 (see wsPort note above)
```

If `.flows/config.yml` is absent, hooks and task storage default to empty (no hooks, `.flows/tasks/` dir created on first write).

`worker.wsPort` config: when set (not null), pass it to `WebSocketServer` instead of `handle.port + 1`. The `onStart` hook receives the HTTP port — use `config.worker.wsPort ?? (port + 1)` as the WebSocket port.

## Directory initialization

`~/.flow-daemon/` subdirectories are created by the daemon on startup (inside the `onStart` hook, before accepting any commands):
- `~/.flow-daemon/executions/` — execution state files
- `~/.flow-daemon/logs/` — NDJSON log files

Use `fs.mkdirSync(path, { recursive: true })`.

## LogWriter NDJSON line schema

Log files are **daily** — one file per calendar day, all executions multiplexed (log-streaming.md):
```
~/.flow-daemon/logs/2026-08-09.ndjson   <- YYYY-MM-DD format
~/.flow-daemon/logs/2026-08-08.ndjson
```

Each line:
```typescript
interface LogLine {
  prefix: string;      // "[executionId|stepId]" — e.g. "[abc1fg23|greet]" or "[abc1fg23|__execution]"
  timestamp: string;   // ISO 8601
  level: string;       // from LiveLogEntry.level
  message: string;     // from LiveLogEntry.message
}
```

`__execution` is the reserved stepId for flow-level log lines (not tied to a step). The daemon emits `__execution` lines for flow start/end events.

**Rotation:** keep last 30 files (configurable `logs.retainDays`). Hard cap: 120 files regardless of config. Delete oldest files beyond the limit after each write.

## Constraints

- All code and comments in English
- No god classes (>500 lines → split at 400)
- No circular dependencies
- `--dangerously-skip-permissions` always passed to `claude -p` (D35)
- `--strict-mcp-config` always passed when MCP server is active (D35)
- Changes to `packages/web-frontend/src/**` are BLOCKED — do not touch frontend
- Add `packages/flow-cli` to the root `package.json` workspaces array — it is already `"workspaces": ["packages/*"]` so no change needed (glob covers it automatically).

## Done when

Step 1 integration test passes: a flow YAML with a single `script` step runs end-to-end, execution file is written with `status: completed`.
