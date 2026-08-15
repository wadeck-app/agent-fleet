# Plan Consistency Audit

**Date:** 2026-08-12
**Scope:** `packages/flow-cli` — 10 architectural decisions from the design plan

---

## Decision Results

- D2: ✓ IMPLEMENTED — `--wait` flag in `RunCommand.ts:77`; without it, exits immediately after printing `executionId` (lines 148–155); with it, polls `ExecutionStore` until completion or timeout (lines 157–185)

- D3: ✓ IMPLEMENTED — `.option('--timeout <duration>', 'Timeout for --wait (default: 10m)', '10m')` in `RunCommand.ts:78`; `parseTimeout()` handles `ms/s/m/h` units (lines 14–25); default resolves to 600 000 ms

- D4: ✓ IMPLEMENTED — `--json` and `--human` flags present in `RunCommand.ts:80-81` and `ValidateCommand.ts:8-9`; human-readable is the default else branch in both commands; no `process.stdout.isTTY` or similar TTY detection found anywhere in `src/`

- D5: ✓ IMPLEMENTED — All four commands (`RunCommand`, `ValidateCommand`, `ShowCommand`, `DocsCommand`) register via `program.command(...)` from Commander.js; no manual `process.argv` slicing found in any command file

- D6: ✓ IMPLEMENTED — `Daemon.ts:1` imports `createDaemon` from `@wadeck/singleton-daemon-kit`; `RunCommand.ts:1` imports `createDaemonClient` from the same package; `Worker.ts` connects back to the daemon via WebSocket (port from `FLOW_WS_PORT` env var)

- D7: ~ PARTIAL — All files in the audit scope use `{ schema: yaml.JSON_SCHEMA }`: `FlowValidator.ts:36`, `CommandHandler.ts:50`, `Daemon.ts:21`, `RunCommand.ts:114`, `utils/loadYaml.ts:11` (used by `ShowCommand`). However, `src/cli/TaskIndex.ts:29` has a bare `yaml.load(fs.readFileSync(...))` call with no schema option — this violates D7 and can silently accept `Date` and `RegExp` YAML tags

- D8: ✓ IMPLEMENTED — `CommandHandler.ts:101-109` explicitly scans `flow.steps` for `type === 'user_intervention'` and returns `{ type: 'error', code: 'UNSUPPORTED_STEP_TYPE', message: "... not supported in v1 ..." }` before any execution is started

- D12: ✓ IMPLEMENTED — `WorkerAdapter.ts:2` imports `StepRunner` from `flow-engine` and wraps it in a constructor parameter (lines 10–14); `Worker.ts:21` instantiates `new StepRunner({ interactive: false })` and passes it to `new WorkerAdapter(stepRunner)`; no reference to `StepExecutor` anywhere in `flow-cli/src/`

- D13: ✓ IMPLEMENTED — `CommandHandler.ts:75-80` constructs `new WorkspaceManager(cmd.cwd)` and calls `workspaceManager.allocate({ taskId, config: flow.workspace, existingPath: cmd.cwd })`; no `DeclaredWorkspaceProvider` import or instantiation found in `flow-cli/src/`

- D14: ✓ IMPLEMENTED — `flow-engine/src/types.ts:7`: `import type { TaskStatus } from 'shared-common/TaskStatus'`; `shared-common/src/TaskStatus.ts` defines the `TaskStatus` enum with a comment explicitly noting it was moved from `shared-orch-worker`

---

## Findings Summary

| Decision | Status | File | Line |
|---|---|---|---|
| D2 async/--wait | ✓ | RunCommand.ts | 77, 148–185 |
| D3 10min timeout | ✓ | RunCommand.ts | 78, 14–25 |
| D4 human default/--json/--human | ✓ | RunCommand.ts, ValidateCommand.ts | 80–81, 8–9 |
| D5 Commander.js | ✓ | All 4 command files | — |
| D6 singleton-daemon-kit | ✓ | Daemon.ts, RunCommand.ts, Worker.ts | 1, 1, 13 |
| D7 yaml JSON_SCHEMA | ~ | **TaskIndex.ts raw call** | **29** |
| D8 user_intervention rejected | ✓ | CommandHandler.ts | 101–109 |
| D12 WorkerAdapter wraps StepRunner | ✓ | WorkerAdapter.ts, Worker.ts | 2, 21 |
| D13 WorkspaceManager.allocate() | ✓ | CommandHandler.ts | 75–80 |
| D14 TaskStatus from shared-common | ✓ | flow-engine/src/types.ts | 7 |

---

## Action Required

**D7 fix needed:** `src/cli/TaskIndex.ts:29` — add `{ schema: yaml.JSON_SCHEMA }` to the `yaml.load()` call:

```typescript
// before
const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;

// after
const raw = yaml.load(fs.readFileSync(configPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>;
```

---

## Score: 9.5/10

9 decisions fully implemented, 1 partial (D7 — one call site missing JSON_SCHEMA).
