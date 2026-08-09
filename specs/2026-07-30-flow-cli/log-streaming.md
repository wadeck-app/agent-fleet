# Log Streaming

## Output format selection

| Condition | Format |
|---|---|
| stdout is a TTY | human-readable |
| stdout is not a TTY | JSON (newline-delimited) |
| `--json` flag | JSON (forced) |
| `--quiet` flag | silent (only execution ID printed) |

## Log line format

Every log line is prefixed `[executionId|stepId]` — always, including in the on-disk files. This makes all filtering a pure grep with no index or daemon query.

```
[abc1|generate-pr] prompt sent to claude
[abc1|generate-pr] output received (342 tokens)
[abc2|run-tests] npm test exited 0
[abc1|create-commit] running script
[abc1|__execution] COMPLETED
[abc2|__execution] FAILED: run-tests exceeded maxIterations
```

`__execution` is a reserved step ID for execution-level lifecycle events (started, completed, failed).

`--no-prefix` suppresses the prefix on stdout display only. The prefix is always written to the log file.

## Storage

Logs are written to disk by the daemon as they arrive from the worker.

```
~/.flow-daemon/logs/
  2026-07-30.ndjson     <- daily log file, all executions multiplexed
  2026-07-29.ndjson
  ...
```

**Rotation policy:**
- Daily files (one file per calendar day)
- Keep last 30 files (configurable in `~/.flow-config.yaml` -> `logs.retainDays: 30`)
- Maximum retention: 120 days — fixed safety ceiling, independent of `retainDays`. If `retainDays > 120`, 120 days is enforced.

**Why daily rotation + 30 files:** Bounded by default, survives daemon restarts, no manual cleanup needed. 120-day cap prevents unbounded accumulation on long-lived machines.

## Filtering

Pure file grep — no daemon interaction needed:

```
flow logs abc1              # grep [abc1| across log files
flow logs abc1 --step foo   # grep [abc1|foo] across log files
```

## `flow attach` behavior

`flow attach` reads log files directly from disk. No daemon streaming, no persistent connection.

```
flow attach abc1
  |
  +- scan ~/.flow-daemon/logs/*.ndjson for lines matching [abc1|
  +- tail the most recent matching file
  +- stop when [abc1|__execution] COMPLETED|FAILED line is seen
  +- or ctrl+c (execution unaffected)
```

**Midnight boundary:** If an execution spans midnight, `flow attach` scans both the current and previous day's log file to ensure no lines are missed.

**Why:** Logs are on disk (D17), prefixed by execution ID (D20). The terminal state is written as a log line — no daemon query needed to know when to stop tailing. Works after daemon exit. Zero daemon load for observation commands.
