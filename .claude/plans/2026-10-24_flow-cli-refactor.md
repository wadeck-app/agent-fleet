# flow-cli oversized-file refactor (no behaviour change)

Rules: every non-test file < 400 lines (hard max 500); one responsibility per file; collaborators constructor-injected; original classes stay as thin orchestrators with unchanged public API and IPC protocol; characterization tests first where a moved responsibility is uncovered (they must pass on the unmodified code).

## Baseline (non-test .ts, lines)

| File | Lines |
| --- | --- |
| daemon/CommandHandler.ts | 1467 |
| cli/commands/WorkerCommand.ts | 1001 |
| daemon/Daemon.ts | 966 |
| cli/commands/RunCommand.ts | 556 |
| everything else | < 360 |

Test files over 800 lines: CommandHandler.test.ts (2137), lowest priority.

## Order

1. CommandHandler, Daemon, WorkerCommand, RunCommand (independent files, worked in parallel; shared gates run at the end).
2. Final gates: build, ts, eslint, prettier, violations, `npm ci --dry-run --ignore-scripts`, vitest 6x + 3x shuffled, flow-engine and flow-core suites.

## CommandHandler.ts

Responsibilities found: run request handling (path guard, definition, project, secrets, workspace, record, context, step preparation, scheduler start), workspace allocation/release, per-execution state, hooks, worker assignment supervision (verify, stall, disconnect/re-dispatch), dispatch (placement, secrets/resume gating, interactivity, unmet demand/provisioning), step outcomes (completed/failed/resume/failStep), step injection.

New files (all in daemon/):

| File | Single responsibility |
| --- | --- |
| ExecutionRegistry.ts | Per-execution in-memory state (schedulers, contexts, step defs/counts, project, resumables, active count) |
| ExecutionHooks.ts | Per-execution hook dispatcher store and dispatch |
| ExecutionWorkspaces.ts | Allocate (plugin/native) and release execution workspaces |
| FlowFileAccessGuard.ts | Is the flow file inside an allowed root |
| RunStepPreparer.ts | Global env/labels merge, assignable check, mock overlay |
| RunRequestHandler.ts | handleRun orchestration |
| ReadyStepQueue.ts | Central ready-step queue |
| WorkerAssignmentSupervisor.ts | Assignment verification, stalled steps, worker disconnect re-dispatch |
| UnmetDemandCoverage.ts | S8 demand episode, sources request, provisioning, recheck timer |
| StepDispatcher.ts | tryDispatch, placement, interactivity, worker feature gating |
| StepOutcomes.ts | step completed/failed, resume, failStep, cleanup |
| StepInjection.ts | inject_steps validation and enqueue |

CommandHandler.ts stays the facade (same constructor, same public methods).

Risks: callbacks between StepOutcomes/StepDispatcher/Supervisor (failStep, tryDispatch) injected as functions to avoid cycles; tests mock `flow-engine` WorkspaceManager and `node:os` globally, which keeps working after a move.

## Daemon.ts

966 -> 340 lines. Responsibilities found and where they went (all in `daemon/`):

| File | Single responsibility |
| --- | --- |
| `Daemon.ts` | Orchestrator: builds the components in `onStart`, wires them |
| `DaemonRuntime.ts` | Type of the components built by `onStart` (getter-injected elsewhere) |
| `createDaemonCommands.ts` | IPC command routing and payload validation |
| `DaemonWorkerMessageHandler.ts` | Worker/relay WebSocket messages and socket close |
| `DaemonIdleShutdown.ts` | Idle detection, grace period, idle stop |
| `DaemonSourceContact.ts` | Contact/prune declared worker sources |
| `tryResolvePlugins.ts`, `declaresPlugins.ts`, `parseFlowConfigFile.ts` | Plugin config resolution; one YAML parse (was copied 3x) |
| `loadFlowHooks.ts`, `pruneProjectWorkspaces.ts` | Per-project run preparation |
| `publishWorkerPort.ts`, `resolveClaudePath.ts` | Port file; claude lookup |
| `startPeriodicUpdateCheck.ts`, `registerAppCoreModules.ts` | Update timer; app-core registration |

Risks:
- Components now exist only after `onStart`; a use before then throws a named error instead of a `TypeError` (unreachable in practice).
- `declaresPlugins`, `loadFlowHooks`, `WORKER_PORT_FILE`, `writeDaemonLog` are no longer re-exported from `Daemon.ts`; importers were updated (FlowIndex, DaemonWatch, Daemon.test).
- Idle-shutdown timing paths were uncovered; `DaemonIdleShutdown.test.ts` (fake timers) is new, not characterization.

## WorkerCommand.ts

Responsibilities found (1001 lines): command registration, `list`/`list --follow` rendering, `update` subcommand, startup banner, self-update (periodic check, busy tracking, re-exec), WS connect/reconnect loop, per-message handling (`assign` execution), console reporting helpers.

New files (all in `cli/commands/` except where noted; mocks in existing tests are by module path, so they keep working):

| File | Single responsibility |
|---|---|
| `WorkerReport.ts` | `report()` / `ts()` operator console lines |
| `parseWorkerLabels.ts` | `--labels` parsing (shared by start and update) |
| `WorkerListCommand.ts` | `flow worker list` (once + follow) |
| `WorkerUpdateCommand.ts` | `flow worker update` + `--shells` validation |
| `WorkerStartupBanner.ts` | banner and registry status lines |
| `WorkerSelfUpdate.ts` | `BusyTracker`, `buildReExecArgs`, `isNewerVersionAvailable`, class owning the timer and re-exec |
| `WorkerConnection.ts` | class: WS connect + reconnect scheduling (replaces 11-argument `connect`/`scheduleReconnect` chains) |
| `handleWorkerMessage.ts` | daemon message dispatch / step execution |

`WorkerCommand.ts` keeps `registerWorkerCommand`, `runWorker` orchestration and `releaseOnExit`.

Risks: order of side effects in `runWorker` (banner, declaration, cleanup registration, timer start) must be preserved; `buildReExecArgs`/`isNewerVersionAvailable` move (pureHelpers test import path updated); uncovered paths (list, update, reconnect, message branches) get characterization tests first.

## RunCommand.ts

Responsibilities found (556 lines): option parsing, `--mock-config` loading, log tailing, completion polling, daemon background spawn, send-with-retry, commander wiring and output rendering.

New files (all in `cli/commands/`), one responsibility each:

| File | Responsibility |
| --- | --- |
| `RunArgumentParser.ts` | `parseInputArgs`, `parseTimeout` |
| `MockConfigLoader.ts` | `--mock-config` load and step-id validation |
| `ExecutionLogTail.ts` | `tailLogFile` (incremental NDJSON log read) |
| `ExecutionCompletionWaiter.ts` | `waitForCompletion`, `ExecutionTimeoutError` |
| `DaemonBackgroundSpawner.ts` | detached daemon start + port file wait |
| `RunDaemonSender.ts` | `run` IPC send, start daemon on `DaemonNotRunningError`, retry |
| `FlowLogModeDetector.ts` | fast-poll detection from flow YAML `log:` modes |

`RunCommand.ts` stays the commander wiring and exit-code/output orchestrator.

Risks:
- `RunCommand.windows-daemon.test.ts` reads source text: its path moves to `DaemonBackgroundSpawner.ts`; the dev-mode bundle regex follows the file name.
- `SecretMasking.integration.test.ts` imports `tailLogFile`: import path only.
- Action body is untested today: a characterization test is added first.
- `FlowIndex.ts` has a near-duplicate daemon spawn (out of scope, suggested follow-up).
