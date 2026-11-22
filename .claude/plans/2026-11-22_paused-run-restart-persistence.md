# Paused run survives a daemon restart (D13, option 2)

Goal: a run paused with `flow pause` is restored paused after a daemon restart; `flow unpause` continues it. Completed steps are not re-run, queued steps are dispatched once.

## Verified facts (code read, 2026-11-22)

- `StepOutcomes.handleResume` is memory-only (needs `executions.resumable`).
- `FlowScheduler` state = `SchedulerState` (18 maps/sets) + private `SubStepWaves` (`waveOf`, `currentWave`) + `SchedulerContext` (`stepOutputs`, `subStepErrors`, `subSteps`). No restore API.
- Ready-but-undispatched steps are NOT in the scheduler (`collect()` removes them from `pendingDeps`): they live in `ReadyStepQueue`. A snapshot of the scheduler alone loses them.
- The record keeps only capped `io` tails; full outputs live in `ExecutionContext.stepOutputs/stepMeta` and the scheduler. `ExecutionContext.stepOutputs` is not cleaned by goto loops, the scheduler's is: both are saved.
- Injected steps live only in the scheduler (`steps`), not in `ExecutionRegistry.stepDefinitions`.
- Workspace handle: `ExecutionWorkspaces.pluginHandles` (memory). Providers: `in-place`/`readonly` (stateless, folder + `.flow/runs/<id>.meta`), `pool` (disk claims `.flow-pool/*.claim`, claim holder = daemonId+pid: after a restart the old claim is STALE and any run can take the slot), `worktree` (plugin-worktree; `projectByPath` in memory, so `release` throws after a restart), config-instance providers (unknown).
- A late result from a pre-restart worker is rejected by `verifyAssignment` (no assignment in the new daemon): no double completion.
- Secrets: the run command holds references only; `resumeWaiting` already re-resolves them (`daemonSecrets.prepare` + `activate`). Step outputs in memory are already masked.
- Only disk restart today: `RunRequestHandler.resumeWaiting` (runs waiting for a workspace). The reconciler touches such records so the next start does not skip them (checkpoint mtime rule).

## What is persisted, and when

One snapshot per paused run. Written at pause (after `executions.pause`, same synchronous block, so the queue cannot change), rewritten after each event that changes the state while paused: step completed/failed, step injected. Removed on unpause and when the run ends (`ExecutionStore.finishExecution`, reconciler). Not written for a running (unpaused) run: it still ends as `failed` on restart, as today.

Content (`PausedRunSnapshot`, version 1): `run` (the run command minus `requestId`, as `workspaceWait.run`), `scheduler` (`SchedulerSnapshot`), `queued` (step ids waiting in the queue), `context` (`stepOutputs`, `stepMeta`, `subStepErrors`, `subSteps`, `subStepFeedback`), `stepCount`, `workspace` (`path`, `id`, `metaDir`, `readOnly` of the handle). The definition is NOT copied: it is reloaded from the record's `definitionSnapshot`.

Format/location: `<executionsDir>/<executionId>.paused-snapshot` (never `.json`, so no record listing sees it), `{ version, executionId, writtenAt, payload }`, written with `AtomicRecordWriter`, masked (`maskDeep`) before writing.

Size: cap 32 MiB serialized. Over the cap: the previous snapshot is deleted (a stale one would restore an older state), the pause stays in force, and the answer + execution log say "this run will NOT survive a daemon restart: snapshot is N MiB, limit 32 MiB". Nothing is truncated.

## Scheduler API (flow-engine)

`FlowScheduler.snapshot(): SchedulerSnapshot` (JSON-safe: sets as arrays, versioned) and `FlowScheduler.restore(snapshot): ReadyItem[]` on a never-started scheduler. Restore validates the shape (explicit error naming the bad field), refuses an unknown version, replaces every map, clears `inFlight` and returns the in-flight steps as ready items (the caller re-queues them). `SubStepWaves` gets `exportState/importState`. Round-trip test over a scheduler with retry, goto loop, waves parent, deferred parent, injected step, superseded child.

## Restart behaviour

1. Reconciler: record `running` + `paused`: snapshot valid => touch the record, report it in `pausedExecutionIds()` (not failed). Snapshot missing/unreadable/unknown version/other executionId => failed with a message naming the cause and `flow run <flowFile>`. A snapshot of any record the reconciler fails is removed.
2. Startup (before `resumeWaitingExecutions`, so a waiting run cannot take the slot of a paused one): `PausedRunRestorer.restore(id)` per paused run: load definition, resolve project, re-resolve secrets, `scheduler.restore`, adopt the workspace, rebuild context, register in `ExecutionRegistry`, `pause`, enqueue `queued` + in-flight steps, rewrite the snapshot. Any failure => record failed with an actionable message (`failRecorded`); a workspace already adopted is kept on disk (never destroyed for a failed restore) and the message says where it is.
3. Steps RUNNING at the pause/restart: their worker is gone. The open attempt is settled `abandoned` / `worker_lost` ("daemon restarted while paused; re-queued"), the step goes back to `pending`, and its next start is a new attempt (origin `resume`). A log line per step. They may have had side effects: documented as at-least-once for these steps only.
4. `flow unpause` after the restart works as before (`isPaused` is true in the registry).

## Workspace re-adoption

New optional provider method `adopt(request: { executionId, projectDir, flow, handle }): Promise<WorkspaceHandle>` (extension-points v1, additive). Absent => the run cannot survive a restart.

| Provider | adopt |
| --- | --- |
| in-place, readonly | folder must still exist; same handle |
| pool | handle path must be a slot of the pool; claim retaken for this execution (stale claim of the dead daemon recovered); claim held by another live run => refused naming it |
| worktree | folder exists and `git worktree list` knows it; re-registers `projectByPath` |
| config instance without `adopt` | not supported |

At pause time the pauser checks `adopt` exists; if not, the pause is applied, no snapshot is written, and the answer (`restartSafe: false`, `restartNote`) and the log say so. At restart such a run is failed by the reconciler (no snapshot), as before.

## Threats / edge cases

- Pool slot taken by another run between the restart and the restore: adoption refused, run failed with the holder named (never share a slot silently). Restore runs first at startup to shrink the window.
- Snapshot older than the record (crash between completion and refresh): a step completed after the last snapshot is re-run (at-least-once); never skipped.
- Crash between the record `paused` mark and the snapshot write (order at pause: record, pause in force, snapshot): no snapshot, so the reconciler fails the run with "the restart snapshot ... does not exist" (explicit, never silent).
- Pause during retry backoff / goto loop / sub-step round: the retried or looped step is in `queued` (or in-flight); covered by the snapshot of `pendingDeps`, `retryCount`, `loopIterations`, `subStepLoopIterations`.
- Waves, deferred parent, injected steps, `onFailure.goto`: all in `SchedulerSnapshot`; injected steps are saved with their step object. Test covers each.
- Second restart before unpause: snapshot was rewritten at restore; re-queue of a step already `pending` in the record is a no-op.
- Secret no longer resolves: run failed with the existing `SecretsResolutionFailedError` message.
- Record pruned by age while paused (retention 30 d): pre-existing; the orphan snapshot is removed with the record.
- Definition snapshot missing: failed with explicit message (as `resumeWaiting`).
- Run command contains `mockEnv`: persisted like the waiting-run precedent.

## Out of scope / not done

- `flow show` / UI badge for "survives a restart" (flow-core record files belong to another change): only the answer of `flow pause` and the log say it.
- Persisting running (unpaused) runs; crash recovery of running steps.
- Daemon restart while a `user_intervention` resumable is kept (separate feature).
