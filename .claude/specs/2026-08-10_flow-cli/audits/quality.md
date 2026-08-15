# Quality Audit

**Date:** 2026-08-12
**Scope:** `packages/flow-cli/src` — daemon, worker, cli, validation, ipc, storage layers

---

## Findings

### 1. [HIGH] Duplicate `markIdle` method — WorkerPool.ts:105–111

**Issue:** `markIdle` is defined twice (lines 105–107 and 109–111) with identical bodies. TypeScript will flag a duplicate identifier at compile time; if it somehow compiles, the second definition overwrites the first. This is a clear authoring bug.

---

### 2. [HIGH] Workspace allocated before `user_intervention` guard — CommandHandler.ts:76–109

**Issue:** `workspaceManager.allocate(...)` is called at line 76, before the `user_intervention` check at line 102. If the flow contains a `user_intervention` step the method returns an error at line 104 — but the workspace has already been allocated and is never freed. The allocation at line 78 also calls `generateExecutionId()` as a `taskId`, producing a second UUID that is immediately orphaned (see finding 7).

---

### 3. [HIGH] `markExecutionFailed` called twice in concurrent failure — Daemon.ts:101–145

**Issue:** When step B fails while step A is still running concurrently:

1. `step_failed` handler calls `executionStore.markExecutionFailed(executionId)`.
2. `step_completed` for A arrives later; it reads the execution file, finds `allDone = true` (B is failed, A is now completed), and calls `markExecutionFailed` a second time.

The call is idempotent (no data corruption), but the `onFlowError` hook fires twice and `markExecutionFailed` performs two read–write cycles unnecessarily. Root cause: `step_completed` does not check whether the execution was already in a terminal state before deciding to call failure handlers.

---

### 4. [MEDIUM] `markIdle` is dead code (never called) — WorkerPool.ts:105

**Issue:** Workers signal availability by sending a `ready` message, which routes to `registerWorker` (sets state to `'idle'`). The daemon never calls `markIdle` after a step completes; the method has no caller. Beyond being dead, it compounds finding 1.

---

### 5. [MEDIUM] `WorkerAdapter` accesses StepRunner private config via `as any` — WorkerAdapter.ts:54–58

**Issue:** `(this.stepRunner as any).config` reads a field that is not part of StepRunner's public API. Any internal rename or restructuring in `flow-engine` silently breaks MCP config injection at runtime with no TypeScript warning. The pattern also constructs a new `StepRunner` per model-step execution, bypassing any pooling or caching in the original runner.

---

### 6. [MEDIUM] Non-atomic writes in ExecutionStore — ExecutionStore.ts:116–118

**Issue:** `write()` calls `fs.writeFileSync` directly. If the daemon process is killed mid-write (power loss, OOM kill) the JSON file is left partially written, corrupting the execution state. The `read()` method will then throw `"Corrupted execution state"`, and the execution becomes unrecoverable. Fix: write to a `.tmp` sibling file then `fs.renameSync` (atomic on the same filesystem).

---

### 7. [MEDIUM] Two `generateExecutionId()` calls produce mismatched workspace and execution IDs — CommandHandler.ts:78,83

**Issue:** Line 78 calls `generateExecutionId()` as the workspace `taskId`; line 83 calls it again for the actual `executionId`. The workspace is allocated with a different random ID than the execution it belongs to, making cross-referencing (e.g. debugging which workspace belongs to which execution) impossible. The first ID is never stored anywhere and is effectively thrown away.

---

### 8. [MEDIUM] `stepType()` throws an uncaught exception for unknown step types — ShowCommand.ts:28

**Issue:** `throw new Error(...)` at line 28 is not caught in the command's `.action()` handler (line 206). An unrecognised step type in user YAML causes Commander to print an ugly unhandled rejection stack trace rather than a CLI-friendly error message and non-zero exit.

---

### 9. [LOW] `HookDispatcher` silently replaced on every `run` command — Daemon.ts:62

**Issue:** Every `run` call creates a fresh `HookDispatcher` and passes it to `commandHandler.setHookDispatcher(...)`. If two runs overlap, the second call overwrites the dispatcher that the first run was using. Hooks fired for the first execution after the second `run` arrives will use the wrong hook configuration. This is a latent race condition for concurrent runs (currently limited to concurrency 1 by default, but configurable).

---

### 10. [LOW] `ExecutionStore` in `waitForCompletion` ignores configured `retainDays` — RunCommand.ts:28

**Issue:** `new ExecutionStore(path.join(daemonDir, 'executions'))` uses the default `retainDays = 30`. The user-configured value (loaded from `~/.flow-config.yaml`) is available in scope but not passed. Minor inconsistency, but if `retainDays` is set very low the poller could start observing files that the pruning logic discards.

---

### 11. [LOW] `FlowValidator.ts` filename violates PascalCase-matches-export convention — FlowValidator.ts:1–3

**Issue:** CLAUDE.md requires `PascalCase filename ↔ exported class`. This file exports `validateFlowFile()` (a function), not a class. The file comment on line 1 acknowledges this but defers a rename to "a future refactor". The inconsistency is already tracked internally but creates confusion for contributors.

---

### 12. [LOW] ValidateCommand human-readable path collapses all non-zero exits to `1` — ValidateCommand.ts:34–51

**Issue:** In human-readable mode, `exit 2` (file not found), `exit 3` (parse error), and `exit 1` (validation errors) all call `process.exit(1)`. The distinct exit codes exist precisely so that callers (CI scripts, hooks) can differentiate error classes, but the human path silently drops this information. Only `--json` mode preserves the distinction.

---

## Score: 6/10

**Strengths:** Clean SRP across all 12 files (no class exceeds 220 lines, well under the 400-line limit). Dependency injection throughout. Exhaustive switch guards (`never` default). Protocol types are well-modelled. Input sanitisation (`assertExecutionIdSafe`) is present and correct.

**Weaknesses:** Two outright bugs (duplicate method, double hook fire), one resource leak (orphaned workspace), one fragile private-API coupling, and non-atomic disk writes that risk data loss under crash. The concurrent-failure double-call warrants a targeted fix even though it is idempotent today — it becomes a real correctness bug the moment `markExecutionFailed` gains side effects.
