# Security Audit V3

Audited: Secret.ts, SecretProvider.ts, LogMasker.ts, CommandHandler.ts, McpServer.ts, WorkerAdapter.ts, WebSocketServer.ts, WorkerPool.ts, RunCommand.ts, FlowValidator.ts

---

## FIXED since V2

- **S4**: MCP token now passed as `Authorization: Bearer` header (McpServer.ts:121-122) — token no longer in URL query param.
- **S6**: CommandHandler.ts now validates file existence with `fs.existsSync` before reading, and resolves the flowFile relative to `cmd.cwd` — arbitrary path read risk significantly reduced.

---

## Intentional / Documented

- **S1** (No WebSocket auth): v1 loopback-only dev tool, documented.
- **S2** (PID self-reported): Mitigated by spawnedPids set; full OS-level verification not required for v1.
- **S3** (`...process.env` spread): Required for PATH/claude CLI access; documented intentional decision.
- **S7** (tmpdir 0o600 on Windows): Documented Windows limitation.

---

## HIGH

*(none new — S1/S2/S3 are documented intentional; S4/S6 fixed)*

---

## MEDIUM

### S5 — LogMasker: plaintext variant skipped when < 4 characters

**File:** `src/secrets/LogMasker.ts:17`

`register()` iterates all encoding variants and skips any whose `length < 4`. The first variant returned by `buildVariants` is the raw `value` (plaintext). If `value.length < 4` (e.g. a 3-character PIN), the plaintext variant is skipped entirely, meaning the secret appears unredacted in logs.

The `< 4` heuristic is appropriate for *derived encoding variants* (short base64/hex fragments cause false positives), but must NOT apply to the plaintext itself — the plaintext must always be registered if non-empty.

**Fix:** Track the index: always register `variants[0]` (plaintext) if non-empty, apply the `< 4` filter only to `variants[1:]` (derived encodings).

---

## LOW

### S8 — McpServer: `String(chunk)` in readBody uses implicit coercion

**File:** `src/worker/McpServer.ts:279`

`const str = String(chunk)` on a Node.js Buffer relies on implicit coercion. Functionally equivalent to `.toString('utf8')` today, but `String()` bypasses the Buffer API. Replace with `(chunk as Buffer).toString('utf8')` for explicit intent and future safety.

---

## Score: 7/10

All exploitable-at-v1-scope vulnerabilities are either fixed (S4, S6) or documented intentional decisions (S1–S3, S7). S5 is a real masking gap for short secrets. S8 is a low-risk style issue.
