# Iteration 3 Summary

## Findings

### Security: 0 HIGH, 1 MED, 1 LOW

- **MED S5**: LogMasker `< 4` threshold — intentional anti-false-positive (documented, NOT fixed per loop instructions)
- **LOW S8**: `String(chunk)` explicit encoding → FIXED

### Quality: 0 HIGH, 2 MED, 1 LOW

- **MED M2**: Duplicate validation logic (CommandHandler vs FlowValidator CLI) — deferred
- **MED M3**: HookDispatcher mutable state per-run — deferred (complex refactor)
- **LOW M4**: StepRunner `any` cast — blocked on flow-engine API

### Maintenance: 2 HIGH, 4 MED, 2 LOW

- **HIGH H2**: HookDispatcher mutable state → deferred (same as quality M3)
- **HIGH H4**: God closure — structural debt, deferred
- **MED M3**: Worker.ts JSON parse silent → FIXED (logs to stderr)
- **MED M4**: HookDispatcher inner catch makes outer log dead → FIXED (onError callback)
- **MED M8**: sendToWorker silent failure → noted, deferred (requires return value + StepQueue revert)
- **MED M9**: mcpServer.stop() error shadows step error → FIXED
- **MED M1**: child.pid! non-null → FIXED
- **LOW L5**: ExecutionStore readdirSync not wrapped → FIXED

### Discoverability: 0 HIGH, 5 MED, 3 LOW

- All renaming/doc suggestions — deferred

### Readability: 3 HIGH, 4 MED, 3 LOW

- **HIGH #1**: StepQueue silent return → FIXED (stderr log + throw)
- **HIGH #2**: Bare catch in polling loop — deferred (needs ExecutionStore.exists())
- **HIGH #3**: `trace.outputs ?? {}` — intentional per flow-engine contract, comment added in plan
- **MED #4**: Repeated json/human guard — deferred
- **MED #5**: 106-line callback — deferred
- **LOW #9**: ValidateCommand JSON case 0 no output → FIXED

### Plan: 10/10 (fully consistent, D8 now fully implemented)

## Fixed this iteration

1. **HookDispatcher M4**: Added `onError` callback to `dispatch()`. CommandHandler's outer catch now actually fires when hooks fail. Test passes.
2. **WorkerAdapter M9**: Wrapped `mcpServer.stop()` in `try/catch` inside `finally`. Original step error no longer shadowed.
3. **Worker.ts M3**: JSON parse errors now logged to stderr. Worker no longer silently idles on bad messages.
4. **McpServer S8**: `String(chunk)` → `(chunk as Buffer).toString('utf8')` — explicit encoding.
5. **WorkerPool M1**: Guard against `child.pid === undefined` before non-null assertion. `activeCount` no longer inflated on spawn failure.
6. **ExecutionStore L5**: `readdirSync` wrapped in try/catch with stderr log. Permissions error no longer crashes daemon startup.
7. **ValidateCommand readability**: `--json` case 0 now writes `{ "valid": true }` to stdout. Test updated.
8. **StepQueue readability**: `onStepCompleted`/`onStepFailed` log to stderr on missing entry. `markStepActive` throws on missing entry (programming error).
9. **LogMasker S5**: Reverted — `< 4` threshold is a documented intentional decision.

## Documented (intentional v1 decisions not to fix)

- S1/S2/S3: WebSocket no-auth, PID self-report, env spread
- S5: LogMasker `< 4` threshold — intentional anti-false-positive
- S7: tmpdir mode on Windows
- H4: God closure in Daemon.ts — structural debt, tracked for v2

## Scores

- security: 7/10
- quality: 7/10
- maintenance: 7/10
- discoverability: 6/10
- readability: 6/10
- plan: 10/10

## Decision: CONTINUE → Iteration 4

Rationale: Two HIGH findings remain unfixed:

- HookDispatcher mutable state (Quality M3 / Maintenance H2): can misdirect hooks under concurrency > 1
- Readability #2 (bare catch in polling loop): swallows real I/O errors
- Readability #3 (trace.outputs ?? {}): needs comment or throw to clarify intent
