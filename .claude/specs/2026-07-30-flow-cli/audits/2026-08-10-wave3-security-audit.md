# Security Audit — Wave 3 (2026-08-10)

## Findings

### F1 — HookDispatcher: no timeout on CLI/HTTP hooks (Medium → Fixed by wave 3 fix batch)
**File:** `src/hooks/HookDispatcher.ts:64, sendHttpHook`
**Problem:** `execFileAsync` with no timeout. HTTP request with no socket timeout. Hung subprocess or unreachable server hangs the CLI process indefinitely (blocks `flow task new` etc.).
**Status:** Fixed in wave 3 fix batch — `timeout: 10_000` added to execFileAsync, `req.setTimeout(10_000)` added to HTTP.

### F2 — StepQueue: unbounded stepOutputs accumulation (Medium → Document)
**Files:** `src/daemon/StepQueue.ts:115`, `src/ipc/Protocol.ts`
**Problem:** `stepOutputs` accumulates all step outputs in `ExecutionContext`. With 1000 injected steps × 1 MiB each = ~1 GiB in daemon heap. `assign` messages include full `stepOutputs` → grow proportionally → can exceed worker's WS payload limit.
**Status:** Document in threat-model.md as known v1 limitation. Hard cap on stepOutputs is a v2 concern.

### F3 — threat-model.md makes false security claim: Claude not filesystem-sandboxed (High → Fix doc)
**Files:** `src/worker/McpServer.ts:177-219`, `src/worker/StepExecutor.ts:58-65`
**Problem:** Threat model states "Claude subprocess does not have filesystem access beyond workspaceDir". This is false. Via `provideSteps`, Claude can inject script steps with arbitrary `script` content and `workingDir` outside workspaceDir. No validation restricts this in `handleToolCall`.
**Assessment:** Injecting scripts IS intentional design (that's the whole point of model steps that produce sub-tasks). The threat model claim is wrong — it overstates the sandbox. Fix: correct threat-model.md to accurately state that injected script steps execute with full OS permissions within the user's shell.
