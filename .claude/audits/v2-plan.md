# Plan Consistency Audit V2

Audit date: 2026-08-12  
Files examined: RunCommand.ts, ValidateCommand.ts, CommandHandler.ts, Daemon.ts, WorkerAdapter.ts, Worker.ts, types.ts, TaskStatus.ts

---

## D2 — async default + --wait flag for sync

**IMPLEMENTED**

- `RunCommand.ts:77` — `.option('--wait', 'Block until execution completes')`
- `RunCommand.ts:148` — `if (!options.wait) { ... process.exit(0); }` — exits immediately (async) when --wait is absent
- Default path (no --wait) returns executionId and exits; --wait triggers the `waitForCompletion` polling loop.

---

## D3 — 10min default timeout, --timeout configurable

**IMPLEMENTED**

- `RunCommand.ts:78` — `.option('--timeout <duration>', 'Timeout for --wait (default: 10m)', '10m')`
- Default string `'10m'` is parsed by `parseTimeout` (`RunCommand.ts:14–25`), yielding 600 000 ms.
- `--timeout` accepts `ms`, `s`, `m`, `h` suffixes; error thrown on bad input.

---

## D4 — human output default, --json/--human flags, NO isTTY detection

**IMPLEMENTED**

- `RunCommand.ts:80–81` — `.option('--json', ...)` / `.option('--human', ...)`
- `ValidateCommand.ts:8–9` — same pattern on validate command
- Default (no flags) always uses `console.log` / `console.error` (human-readable).
- JSON path guarded by `options.json && !options.human` at `RunCommand.ts:138, 149, 164, 173`.
- No `process.stdout.isTTY` or `process.stderr.isTTY` reference anywhere in either file.

---

## D5 — Commander.js only (no manual process.argv)

**IMPLEMENTED**

- `RunCommand.ts:1–2` — `import type { Command } from 'commander'`; action registered via `program.command(...).option(...).action(...)`
- `ValidateCommand.ts:1` — same import; no `process.argv` access in either file.
- All option parsing delegated to Commander; zero raw `process.argv` access in the two command files.

---

## D6 — singleton-daemon-kit createDaemon/createDaemonClient

**IMPLEMENTED**

- `RunCommand.ts:1` — `import { DaemonNotRunningError, createDaemonClient } from '@wadeck/singleton-daemon-kit'`
- `Daemon.ts:1` — `import { type DaemonHandle, createDaemon } from '@wadeck/singleton-daemon-kit'`
- `RunCommand.ts:58–61` — `createDaemonClient<FlowCommands>({ configDir: daemonDir, ... })`
- `Daemon.ts:55` — `daemonHandle = await createDaemon({ configDir: daemonDir, ... })`

---

## D7 — ALL yaml.load() calls use JSON_SCHEMA

**IMPLEMENTED** (all 3 occurrences in provided files)

| File | Line | Call |
|------|------|------|
| `RunCommand.ts` | 114 | `yaml.load(..., { schema: yaml.JSON_SCHEMA })` |
| `CommandHandler.ts` | 50 | `yaml.load(content, { schema: yaml.JSON_SCHEMA })` |
| `Daemon.ts` | 21 | `yaml.load(..., { schema: yaml.JSON_SCHEMA })` |

No bare `yaml.load(...)` without schema option found in the audited files.

---

## D8 — user_intervention → UNSUPPORTED_STEP_TYPE before execution

**PARTIAL**

The check and error code are correct, but the placement is wrong:

- `CommandHandler.ts:101–109` — finds `user_intervention` step and returns `{ type: 'error', code: 'UNSUPPORTED_STEP_TYPE', ... }` ✓
- **Problem**: the check fires at line 101, *after*:
  - `WorkspaceManager.allocate()` at line 75–80 (workspace already allocated)
  - `ExecutionStore.create()` at line 86 (execution record already written to disk)
  - `generateExecutionId()` at line 83 (ID consumed)
- Those resources are never cleaned up when UNSUPPORTED_STEP_TYPE is returned.
- The check is before `stepQueue.enqueueExecution()` (line 115), so no actual step execution starts — but the workspace and store entry leak.
- **Fix needed**: move the `user_intervention` scan to immediately after FlowValidator (before line 75).

---

## D12 — WorkerAdapter wraps StepRunner (not StepExecutor)

**IMPLEMENTED**

- `WorkerAdapter.ts:2` — `import { StepRunner } from 'flow-engine'`
- `WorkerAdapter.ts:10` — `private readonly stepRunner: StepRunner`
- `WorkerAdapter.ts:12–13` — constructor accepts `StepRunner` instance
- `Worker.ts:3,21` — `import { StepRunner } from 'flow-engine'`; `new StepRunner({ interactive: false })`
- No `StepExecutor` reference in either file.

---

## D13 — WorkspaceManager.allocate() (not DeclaredWorkspaceProvider)

**IMPLEMENTED**

- `CommandHandler.ts:75` — `const workspaceManager = new WorkspaceManager(cmd.cwd)`
- `CommandHandler.ts:76–80` — `await workspaceManager.allocate({ taskId, config: flow.workspace, existingPath: cmd.cwd })`
- No `DeclaredWorkspaceProvider` reference in any audited file.

---

## D14 — types.ts line 7 imports TaskStatus from shared-common

**IMPLEMENTED**

- `types.ts:7` — `import type { TaskStatus } from 'shared-common/TaskStatus'`
- Exact line matches the plan specification.
- `shared-common/src/TaskStatus.ts` exports `enum TaskStatus` with all expected values.

---

## Summary Table

| Decision | Status | Key Evidence |
|----------|--------|--------------|
| D2 async default + --wait | IMPLEMENTED | RunCommand.ts:77,148 |
| D3 10m default timeout | IMPLEMENTED | RunCommand.ts:78 |
| D4 human default, no isTTY | IMPLEMENTED | RunCommand.ts:80–81, ValidateCommand.ts:8–9 |
| D5 Commander.js only | IMPLEMENTED | RunCommand.ts:1–2, ValidateCommand.ts:1 |
| D6 singleton-daemon-kit | IMPLEMENTED | RunCommand.ts:1, Daemon.ts:1 |
| D7 JSON_SCHEMA on all yaml.load | IMPLEMENTED | RunCommand.ts:114, CommandHandler.ts:50, Daemon.ts:21 |
| D8 UNSUPPORTED_STEP_TYPE pre-exec | PARTIAL | CommandHandler.ts:101–109 (after allocate/create) |
| D12 StepRunner (not StepExecutor) | IMPLEMENTED | WorkerAdapter.ts:2,10–13 |
| D13 WorkspaceManager.allocate() | IMPLEMENTED | CommandHandler.ts:75–80 |
| D14 types.ts:7 shared-common import | IMPLEMENTED | types.ts:7 |

## Score: 9/10
