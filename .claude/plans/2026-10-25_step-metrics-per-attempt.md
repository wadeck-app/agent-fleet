# Step metrics and per-attempt history

Status: design, no code. Source: flow-test session (a step relaunched 8x reported ~0.3 USD, real 2.79 USD).

## Verified current behavior (root cause of the cost gap)

- `ModelStepMeta` (`flow-engine/src/types.ts`) holds one `cost` object; `StepState.meta` (`flow-core/.../ExecutionState.ts`) is overwritten by `ExecutionStore.markStepCompleted`. Only `attempts`, `priorAttemptsMs` (duration) and `relaunches[]` (feedback text) survive across attempts.
- A FAILED attempt never reaches the store with a meta: `WorkerAdapter` throws `Object.assign(new Error(trace.error), { io })` (meta dropped) and `step_failed` in `ipc/Protocol.ts` has no `meta` field. Failed-attempt cost is therefore lost, not merely overwritten.
- `ModelStepExecutor` builds the meta only on the success/exit-code paths; the `catch` path (timeout, spawn error) sets none.
- Engine-origin failures (`StepOutcomes.failStep`, `recordParentFailures`) call `markStepFailed` with no result: no metrics exist.
- Every cost display reads the last meta: `ExecutionView` (`costUsd`, `totalCostUsd`), `ExecutionDetail`/`HistoryTable` (`formatModelCost`, total), `StepIO.ts` (`costUsd`, chart panel), `FlowGraphBuilder`, web contract `flow-daemon.contract.ts`, `FlowExecutionStepsTable`/`Header`.
- Providers: claude result event gives `total_cost_usd`, `num_turns`, `modelUsage`. opencode: provider sums per-turn `step_finish` cost/tokens and emits a synthesized `result` (no `num_turns`). codex: `cost_usd: 0` always (cost not reported), tokens from `turn.completed`.

## Decisions

### D1 Data model (additive only, old records stay readable)

`ModelStepMeta` (last attempt, unchanged semantics) gains optional:
- `turns?: number`
- `tool_calls?: { total: number; by_tool: Record<string, number> }` (by_tool capped at 50 names, remainder under `"other"`)
- `files_written?: string[]` (distinct, max 100 paths, 500 chars each) and `files_written_count?: number` (true total)
- `end_reason?: AttemptEndReason`

New `StepState.attemptLog?: AttemptRecord[]`, one entry per settled attempt, oldest first:
`{ n, origin: 'first'|'retry'|'loop'|'relaunch'|'resume', startedAt, endedAt, durationMs, outcome: 'completed'|'failed'|'engine_failed'|'abandoned', endReason, error? (<=500 chars), model?, usd?, tokens?, turns?, toolCalls?, filesWrittenCount?, relaunchIndex? }`
- `usd` absent means "unknown" (never 0). `abandoned` = worker lost / execution ended while running.
- Paths are NOT kept in `attemptLog`; only the latest attempt's paths live in `meta`.
- `AttemptEndReason` is a closed union: `completed | exit_nonzero | is_error_result | empty_output | timeout | stalled | worker_lost | engine_failed | execution_ended`. Unknown value fails fast (no default branch).
- Size caps (separate from `StepIoRecorder` limits, which count text chars of inputs/outputs): 50 entries per step, 400 per execution. Past a cap the oldest entries fold into `StepState.attemptOverflow?: { count, usd, usdUnknownCount, durationMs }` so totals stay correct and nothing is dropped silently. Entry is ~300 B, worst case ~120 KB per execution.
- Old records: no `attemptLog`; readers fall back to `meta` and `attempts`.

### D2 Where each metric is computed (worker side, new `StepMetricsCollector`, fed from `onStreamEvent` in `ModelStepExecutor`; `ToolCallTracker` stays in-flight-only)

| Metric | claude | opencode | codex |
|---|---|---|---|
| turns | `result.num_turns` (authoritative); no result: undefined | count of `step_start` | NOT observable (one codex turn = whole run): undefined |
| tool_calls | every assistant `tool_use` block (all blocks, dedup by block id) | top-level `tool_use` event (`data.tool`), emitted after completion | `command_execution`, `mcp__<server>__<tool>`, `apply_patch` events |
| files_written | `Write`/`Edit`/`MultiEdit` `input.file_path`, `NotebookEdit` `input.notebook_path`; drop if matching `tool_result.is_error` | tools `write`/`edit`/`patch` from `data.input` (field name UNVERIFIED, needs a real capture) | `apply_patch` `changes[].path`, kinds add/update |
| cost/tokens | `result` (already) | summed `step_finish` (already) | tokens only, usd unknown (not 0) |

Not observable, stated in docs: writes done through shell (`sed -i`, redirects, scripts), writes by nested sub-agents (not verified whether claude streams them), partial cost of a killed/timed-out process (claude emits cost only in `result`; opencode sums in provider locals; codex none). Those attempts record `usd` unknown and `end_reason` timeout/stalled/worker_lost.
Do NOT count in `StreamEventMapper`: it reads only the first content block of an assistant message.
Paths pass through the existing secrets masker in `WorkerAdapter` before leaving the worker.

### D3 Archiving attempts (daemon, `ExecutionStore`)

- Entry is written when the attempt SETTLES (not at next start), so the last attempt and crashes are covered: `markStepCompleted`, `markStepFailed`, `withRunningStepsFailed` (`abandoned`/`execution_ended`), worker-lost and `failStep` (`engine_failed`, no metrics, `usd` unknown).
- `step_failed` gains optional `meta` (`Protocol.ts`); `WorkerAdapter` attaches `trace.meta` to the thrown error and `Worker.ts` forwards it. Older worker: field absent, entry has no metrics (warn once in daemon log naming the worker version, no silent zero).
- `ModelStepExecutor` `catch` path also builds a meta (usd unknown) so timeouts carry duration, turns, tool counts seen so far.
- `origin` derived in `markStepRunning` (it already knows `relaunchFeedback`; retry/loop/resume from scheduler). `markStepsPending` and `markStepRunning` keep `attemptLog`.
- A parent relaunch is a new attempt of the parent with `origin: 'relaunch'` and `relaunchIndex` pointing into `relaunches[]`.
- `meta` keeps meaning "last attempt" so templates (`steps.x.meta.cost.usd`, `FlowCapabilitiesGenerator`) are unchanged.

### D4 Cost aggregation

- Step total = sum of `attemptLog[].usd` + `attemptOverflow.usd`; execution total = sum of step totals.
- `ExecutionView.costUsd` becomes the step TOTAL; new `lastAttemptCostUsd`, `costComplete: boolean` (false when any attempt unknown). `totalCostUsd` sums totals. This changes the meaning of an existing field on purpose: it is the bug.
- Old record with `attempts > 1` and no log: show last-attempt cost labelled `(last attempt of N, earlier not recorded)`, `costComplete: false`.
- Unknown is never rendered as `$0`: `$2.79+ (2 attempts unknown)`.

### D5 Display

- `flow show` / `ExecutionDetail`: per model step add `turns 12, tools 31 (Edit 9, Bash 14, ...), files 4`; when `attempts >= 2` print an indented attempt table (n, origin, duration, usd, turns, end reason) under the existing `attempts:` line; `Total cost` line uses D4 with the completeness marker. `flow history` (`HistoryTable`) total uses D4.
- Web: `FlowExecutionStepsTable` cost column = total, tooltip/expand = attempts; `FlowExecutionHeader` total with marker; update `flow-daemon.contract.ts` zod (additive optional) and `flowDaemonFixtures.ts`.
- Chart panel: `StepIO.ts` `RecordedStepIO` gains `attempts[]`, `turns`, `toolCalls`, `filesWritten`; `RunFactsSection`/`StepIODetails` render them. Logs page (`LogRoutes`): not verified to show cost; check in phase 3, change only if it does.

### D6 Events

`flow.step.completed` / `flow.step.failed` payloads (`FlowEventCatalog`, built in `FlowEventMapper`) gain optional: `costUsd`, `turns`, `toolCalls`, `endReason` (THIS attempt) and `stepTotalCostUsd` (so far). Catalog schema, sample payload and `FlowEventCatalog.test.ts` updated; payload is not validated against the schema, so docs are the contract.

### D7 Docs

`FlowCapabilitiesGenerator` (model meta field list, add new fields and "last attempt" wording), `StepRecordDocumentation` (attempt log caps), flow show section, events doc, and a "not observable" table (D2). `.claude/kb/lessons-learned.md` entry on the cost-loss root cause.

## TDD test list (write first, one failing test at a time)

1. `StepMetricsCollector`: claude multi-block assistant message counts every `tool_use`; same block id twice counts once.
2. Collector: `tool_result is_error` removes the path from `files_written`; cap 100 paths, `files_written_count` keeps true total.
3. Collector per provider with mocks (`CLAUDE_MOCK_PATH`/`OPENCODE_MOCK_PATH`): turns, tools, paths; codex turns undefined, usd unknown.
4. `ModelStepExecutor`: meta present on timeout/catch path with usd unknown.
5. `WorkerAdapter`/`Worker`: failing model step sends `step_failed` with `meta`.
6. `ExecutionStore`: completed then failed then completed produces 3 entries; `markStepsPending` and relaunch keep them; origin values; cap folds into `attemptOverflow` with correct sums.
7. `StepOutcomes.failStep` and `withRunningStepsFailed` produce `engine_failed` / `abandoned` entries with `usd` undefined.
8. Old record without `attemptLog` loads and renders (`ExecutionView`, `ExecutionDetail`, `HistoryTable`, `StepIO`).
9. Cost aggregation: unknown attempts give `costComplete: false`, never 0; 8-attempt fixture totals match the sum.
10. `flow show` snapshot with attempt table; web `FlowExecutionStepsTable` total + expand; `FlowEventMapper` payload fields; contract zod accepts old and new shapes.
11. Old worker (no `meta` on `step_failed`) accepted, warning logged once.

## Risks

- Claude `total_cost_usd` on a resumed session (relaunch passes `resumeSessionId`) may be cumulative per session, not per process: summing would double count. UNVERIFIED, blocks D4 for relaunches; verify with a real two-launch capture first.
- Claude assistant events may repeat a `message.id` per content block (turn fallback and dedup rely on it): UNVERIFIED.
- opencode tool input field names for writes UNVERIFIED; wrong names silently under-report, so the collector logs unknown write-tool names once.
- Changing `ExecutionView.costUsd` meaning affects any external reader of the daemon API.
- Mock drift (`.claude/docs/mock-fidelity.md`): mocks must emit the new fields as real CLIs do.
- Version skew worker/daemon (handled by D3, tested by 11).

## Open questions (recommended default)

1. Keep `ExecutionView.costUsd` as total, add `lastAttemptCostUsd`? Default: yes.
2. Expose `steps.x.meta.cost_total` to templates? Default: no, last attempt only until requested.
3. Keep paths of earlier attempts? Default: no, counts only.
4. Entry cap 50/step, 400/execution? Default: yes.
5. Partial cost on timeout for opencode (emit incremental result)? Default: later, mark unknown now.
6. Count tool calls that errored? Default: yes, with `by_tool` unchanged; failures not split in v1.

## Phased delivery

1. Verification captures (claude resume cost, message.id, opencode write input) and fixtures. Gate for D2/D4.
2. Collector + `ModelStepMeta` fields + `step_failed.meta` + catch-path meta (worker/protocol).
3. `attemptLog` in `ExecutionStore`, engine-origin and abandoned entries, caps.
4. Aggregation in flow-core views, `flow show`/`history` rendering.
5. Web steps table/header/chart panel + contract; events payload.
6. Docs and lessons-learned.

Each phase is shippable alone; phases 2-3 already stop the cost loss (data recorded) even before any display changes. Until phase 4 the displayed cost stays last-attempt: flag this in the release notes.

## Decisions taken (phases 2-3 implemented)

Open questions: 1 yes (display not touched yet), 2 no, 3 no (counts only), 4 yes (50/step, 400/execution), 5 later, 6 yes. Deviations and additions:

- `AttemptEndReason` gains `step_error` (exception, spawn failure, config refused before launch, failure reported without a classified reason).
- `ModelStepMeta.cost.reported?: boolean`: false = provider gave no cost (killed before `result`, codex), `usd` is a placeholder 0. Absent on old records = reported. `AttemptRecord.usd` is omitted when `reported === false` or no meta arrived.
- Script meta gains `end_reason` (`completed`/`exit_nonzero`/`timeout`).
- opencode: provider now puts `num_turns` (count of `step_start`) on its synthesized `result`; the executor only sees the first `step_start`.
- Pre-launch refusals in `ModelStepExecutor` also return a meta (`step_error`), so a missing `step_failed.meta` means an older worker (warned once per worker in the execution log).
- `StepState.runningAttempt` (persisted) carries origin/relaunchIndex from start to settle. `origin: loop` also covers sub-step round restarts; `retry` is detected via new read-only `FlowScheduler.getRetryCount` (`ReRunKindTracker`). `resume` is tracked in memory (resume only works within one daemon).
- Entry written only when the step was `running`: failing an already-settled parent adds no attempt.
- Engine failures: `stalled`, `worker_lost`, else `engine_failed`; running steps at execution end/daemon restart: `abandoned` / `execution_ended`.
- Raw per-attempt `usd` is stored, never summed (claude cumulative-on-resume still unverified).

Not observable: shell writes, nested sub-agent writes (unverified), partial cost of killed processes, codex turns. opencode write-tool input path (`filePath`/`file_path`/`path`) is unverified; unknown shapes warn once.
