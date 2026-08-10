# Maintainability Re-Audit — Wave 3 (2026-08-10)

## Findings

### 1.1 — `{ type: 'idle' }` dead protocol variant (Medium → Document)
**Files:** `src/ipc/Protocol.ts:33`, `src/worker/Worker.ts:59`
**Problem:** Daemon never sends `idle`. Worker has a `case 'idle':` no-op. Architecture.md shows it as active.
**Fix:** Add `// v2: not yet sent by daemon` comment to Protocol type + architecture.md diagram.

### 1.2 — Unused `path` import in DeclaredWorkspaceProvider.ts (Low → Fix)
**File:** `src/workspace/DeclaredWorkspaceProvider.ts:2`
**Problem:** `import * as path` unused — no path operations performed.
**Fix:** Remove the import.

### 1.3 — `WebSocketServer.send()` dead + wsServer never closed (Medium → Fix)
**Files:** `src/daemon/WebSocketServer.ts:43-47`, `src/daemon/Daemon.ts:49,81`
**Problem:** `send()` method never called. `wsServer` variable assigned but never used again — `wsServer.close()` never called on daemon shutdown → resource leak.
**Fix:** Remove `send()`. Call `wsServer.close()` when `daemonHandle` stops (or in shutdown hook).

### 1.4 — SecretProvider/LogMasker not wired, no comment (Medium → Already fixed)
Comment already added by wave 3 fix batch (Fix 10). Status: done.

### 2.1 — Stale tsc artifacts in dist/ (High → Fix build.mjs)
**Problem:** `build.mjs` doesn't clean `dist/` before building. Stale tsc files from prior `outDir: "dist"` config pollute dist/. Fresh build leaves hundreds of stale files.
**Fix:** Add `fs.rmSync('dist', { recursive: true, force: true })` at start of `build.mjs`.

### 2.2 — `flow-engine` in `dependencies` but bundled at build time (Medium → Fix)
**File:** `package.json:16`
**Problem:** `flow-engine: "*"` in `dependencies` but esbuild bundles it — it's never resolved at runtime. Misleads tooling; `npm install` in fresh checkout may fail.
**Fix:** Move `flow-engine` to `devDependencies`.

### 3.1 — architecture.md `'idle'` branch shown as active (Low → Document)
**File:** `docs/architecture.md:178`
**Fix:** Annotate `receive 'idle'` line as `// v2: unimplemented`.

### 3.2 — architecture.md secrets section implies active masking (Medium → Document)
**File:** `docs/architecture.md:255-290`
**Problem:** Secrets section documents full SecretProvider/LogMasker flow as active in v1. It's not.
**Fix:** Add `> v1: SecretProvider and LogMasker are implemented but not yet wired. See D31.` callout.

### 3.3 — RunCommand.test.ts mock has wrong FlowConfig shape (Medium → Fix)
**File:** `src/cli/RunCommand.test.ts:17-21`
**Problem:** Mock uses `{ queue: { concurrencyLimit: 2 }, worker: { timeoutMs: 60000 } }` — wrong field names. Real shape: `{ queue: { concurrency: 1 }, logs: { retainDays: 30 }, worker: { wsPort: null } }`.
**Fix:** Correct the mock to match `FlowConfig`.

### 4.1 — TestHelpers duplicates Daemon.ts handleWorkerMessage (High → Deferred)
**Status:** High-risk refactor mid-audit. Integration test still exercises real daemon. Deferred to v2.

### 4.2 — TestHelpers creates stores per message (Low → Not fixed)
**Status:** Functionally correct, cosmetic. Not fixed.

### 5.1 — wsServer not closed in TestHelpers asyncDispose (Low → Fix)
**File:** `src/test-utils/TestHelpers.ts:37`
**Problem:** wsServer.close() never called → port conflicts on rapid test reruns.
**Fix:** Call `wsServer.close()` in `[Symbol.asyncDispose]`.
