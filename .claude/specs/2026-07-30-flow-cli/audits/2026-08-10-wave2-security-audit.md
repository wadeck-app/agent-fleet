# Security Audit — Wave 2 (2026-08-10)

## Findings

### F1 — Daemon crash via invalid `entry.timestamp` in log messages (Medium → Fixed)
**File:** `src/storage/LogWriter.ts:26`
**Problem:** `new Date(entry.timestamp).toISOString()` throws `RangeError` on invalid timestamp string. Uncaught in WebSocket event listener → crash daemon. Attack: send `{ type: 'log', entry: { timestamp: 'INVALID' } }` from any local WS connection.
**Fix:** Wrapped in try/catch, falls back to `new Date().toISOString()`.

### F2 — WebSocket has no worker identity verification (Medium → Documented)
**File:** `src/daemon/WebSocketServer.ts`, `src/daemon/WorkerPool.ts`
**Problem:** Any local process can connect to the WS port, register as idle worker, receive ExecutionContext data, send crafted inject_steps.
**Status:** Documented in threat-model.md as "Known limitations (v1)". Port directory protected by `0o700`. Tracked for v2: shared `FLOW_WS_TOKEN` env var.

### F3 — daemon directories world-readable without explicit mode (Medium → Fixed)
**File:** `src/daemon/Daemon.ts:69-70`
**Problem:** `mkdirSync` without `mode` → permissions depend on umask → may be `0755` world-readable. Other local users could read execution state, logs (which may contain plaintext secrets per v1 known limitation).
**Fix:** Added `{ mode: 0o700 }` to both `mkdirSync` calls.

### F4 — MCP config `0o600` ineffective on Windows (Low → Documented)
**File:** `src/worker/McpServer.ts:114`
**Problem:** Node.js ignores `mode` on Windows (uses ACLs). The `0o600` stated as a security control in threat-model.md is a no-op on this OS.
**Status:** Documented in threat-model.md. Current content (loopback URL) is not sensitive in v1.
