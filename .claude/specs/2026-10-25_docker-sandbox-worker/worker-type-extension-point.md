# Worker-Type Extension Point -- Docker Sandbox Worker

**Version:** v0.1
**Last updated:** 2026-10-25
**Status:** Draft (requirement decided, contract not decided)

## Overview

Decision #8: flow gets an extension point through which a plugin provides a type of worker and the daemon can talk to the workers of that type. `plugin-worker-sbx` is its first implementation. This file lists what the daemon lacks today; the capability list is a proposal, not a decision.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 7 | Delivered as plugins with the flow changes listed in the plan | User | 2026-10-25 |
| 8 | A plugin can provide a worker type and the daemon can talk to its workers | User | 2026-10-25 |

## Today (verified)

- `WorkerSourceProvider.obtainWorker(request)` is the only provider method; it returns no handle (`extension-points/src/worker-source/v1.ts:36-48`).
- `resolveSourceProvider` is a closed switch that throws on unknown providers (`daemon/WorkerSourceContact.ts:137-165`); `PluginLoader.loadProvider` has no daemon caller; `PluginResolver` loads only workspace and approval.
- Daemon-to-worker messages: `assign`, `idle` (never sent), `done` (daemon shutdown, forked workers only) (`ipc/Protocol.ts:143-157`). The only other channel is the advisory HTTP nudge (`NudgeDispatch.ts`).
- No run-finished or cancel signal; `StepOutcomes.cleanupExecution` (`:275-279`) is where a run ends. No worker affinity (`StepRouter.ts:137`).

## Proposed capabilities (not decided)

| # | Capability | Existing hook to reuse | Needed by |
|---|---|---|---|
| 1 | Load a worker-type provider from a plugin (`plugins.<id>.<impl>` in the source entry) | `PluginLoader.loadProvider`, `SourceProviderDependencies` (`WorkerSourceContact.ts:16-26`) | Decision #7 |
| 2 | Provider-to-worker channel (send/request) and new daemon-to-worker message types | `WorkerRegistry.send` | Decisions #8, #15 |
| 3 | `onExecutionEnded(executionId)` and a cancel signal delivered to the provider | `StepOutcomes.cleanupExecution` | Decisions #5, #15 |
| 4 | Worker lifecycle callbacks (registered, gone), correlated by `sourceId` | `WorkerRegistry` register/remove | Decision #15 |
| 5 | Keep the steps of one execution on the worker type's own worker | `StepRouter`, `StepDispatcher` | Decision #5 |
| 6 | Worker-side injection of a process launcher by the plugin (the wrapper runs flow's worker code with a launcher that goes through `sbx exec`) | 8 step-process spawns in `flow-engine` (plus CompactHook and ~9 binary lookups) | Decisions #3, #4, #14 (exec variant) |

Open: whether this extends `worker-source` (v2, additive) or is a new extension point; the plugin has a daemon half (1-5) and a worker half (6).

## Existing worker types as plugins (Decision #9)

The current kinds (fork, terminal/inbound, command, relay; `flow-cli/WORKERS.md:12-18`) are extracted behind the same interface, so it is shaped by real implementations. All existing kinds are extracted (decisions #9, #13).

## Remote wrapper (Decision #10, next iteration)

`worker-remote-wrapper` runs a local worker type (e.g. the sandbox worker) on another machine and reuses its logic, so the interface must let one worker type wrap another. It would conflict with worker-availability D#12/D#18/D#19 if the daemon launched it over SSH; deferred to iteration 2 (default: the machine's owner starts it).

## Security considerations

Capability 2 and 3 widen what the daemon can ask of a worker: messages must be allow-listed and authenticated per worker (T-01). See `threat-model.md`.
