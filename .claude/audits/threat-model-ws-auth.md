# Threat Model — WebSocket Daemon Authentication
Date: 2026-08-15
Decision: No authentication implemented in v1. This document explains why.

## Architecture

```
[CLI] ──HTTP (singleton-daemon-kit)──► [Daemon] ──WebSocket :port+1──► [Workers]
```

The WebSocket channel is internal: daemon spawns workers, workers connect back.
The WS port is discoverable (httpPort+1, httpPort written to ~/.flow-daemon/ lock file).

## Threat Actors Analysed

### A1 — Malicious same-user process (e.g. compromised npm dependency)

**Can it reach the WS port?** Yes — 127.0.0.1 is system-wide on Linux.
**Can it bypass application-level auth?** Yes — on Linux it can read /proc/<pid>/environ of same-user processes to extract any token passed via env var. On Windows, similar access via ReadProcessMemory with appropriate flags.
**Does application auth help?** No.
**Accepted?** Yes — a malicious library running as the same user can cause far worse damage (modify source code, exfiltrate files directly, read secrets from disk). The WS injection vector is not the limiting factor. This is an OS-level trust boundary, not an application concern.

### A2 — Different user on shared dev server

**Can it reach the WS port?** Yes — loopback is shared system-wide on Linux.
**Can application auth help?** Yes — a memory-only token (never written to disk) would be inaccessible to a different OS user.
**Accepted?** Yes — **current deployment scope is single-user developer workstation and solo CI runners**. Shared multi-user dev servers are out of scope for v1.

### A3 — Docker sidecar / Kubernetes pod with shared network namespace

**Can it reach the WS port?** Yes — containers in the same pod share loopback.
**Can application auth help?** Yes — same reasoning as A2.
**Accepted?** Yes — **Docker/Kubernetes deployment is not planned for v1**. This scenario must be revisited when container deployment is added to the roadmap. Until then: do not run the daemon in a shared-netns container.

### A4 — Remote workers (future feature)

**Scope:** Remote workers connecting to a daemon over a non-loopback network.
**Status:** Out of scope for v1. When remote workers are implemented, a new and complete threat model must be produced. The current WebSocket channel design (loopback-only, no TLS, no auth) is fundamentally incompatible with remote use and will require a separate implementation.

## Decision

**No authentication is implemented on the WebSocket channel in v1.**

Rationale:
- A1 is not a realistic incremental risk — a same-user malicious process has more direct and severe attack vectors available.
- A2 and A3 are outside the stated deployment scope.
- A4 requires a full redesign when it arrives.

Application-level authentication (token, HMAC, mTLS) cannot protect against the primary real-world threat (A1). It would provide real value only for out-of-scope scenarios (A2, A3). Implementing it now would create a false sense of security without addressing the actual risk.

## Scope Constraints (must be revisited when violated)

1. **Single-user workstation only** — if the daemon is ever deployed on a shared server with multiple OS users, authentication must be added.
2. **No container sidecars** — if the daemon runs in a pod with untrusted sidecar containers, the WS channel must be isolated (Unix socket or authenticated).
3. **No remote workers** — if workers ever connect over a non-loopback network, a complete auth redesign is required (TLS + credentials, separate architecture).

## Mitigation in place

- WS server binds to 127.0.0.1 only (WebSocketServer.ts:27) — no network exposure.
- Workers are spawned as child processes by the daemon — the set of legitimate connectors is controlled and short-lived.
- Worker PID is validated against spawnedPids set at registration.

## References

- WebSocketServer.ts:9 — loopback binding comment
- WorkerPool.ts:24 — spawnedPids guard
- security-analysis-2026-08-15.md — finding #1 full analysis

---

## TM-02 — Short secret plaintext not masked in logs

**Component:** `secrets/LogMasker.ts`
**Decision:** Design decision — not a bug.

`LogMasker` skips any variant (including the raw plaintext) shorter than `minVariantLength` characters (default: 4) to prevent false-positive redaction of common short substrings ("ok", "id", "no", "1").

**What is protected:** Encoded variants (base64 ≥ 4 chars, hex ≥ 8 chars) of secrets with short plaintexts are still masked.

**Accepted residual risk:** A secret whose raw plaintext is ≤ 3 characters will not be masked in its literal form in logs.

**Mitigation:** Document and recommend a minimum secret value length of 8+ characters in flow authoring guidelines. Standard API keys and tokens are well above this threshold.

**Configurability:** The threshold is a constructor parameter (`new LogMasker(minVariantLength)`). The default of 4 can be lowered if needed at the call site.

---

## TM-03 — 0o600 file mode not applied on Windows for MCP config temp file

**Component:** `worker/McpServer.ts:128`
**Decision:** Not a real risk in current deployment scope.

`McpServer` writes the MCP config to `os.tmpdir()` with `mode: 0o600`. On Windows, Node.js ignores this mode parameter (NTFS does not use POSIX mode bits). However:

- On Windows, `%TEMP%` = `C:\Users\<username>\AppData\Local\Temp` — protected by NTFS per-user ACLs. Other OS users cannot access this directory by default, providing equivalent or stronger protection than 0o600 would on Linux.
- Same-user processes can read the file. This is the same threat level as TM-01 (A1 actor) — already determined to be out of scope, as a same-user malicious process has more direct attack vectors available.

**Verdict:** Not a risk in standard Windows deployment. The per-user `%TEMP%` directory provides equivalent isolation.

**When to revisit:** If the daemon is deployed on Linux where `/tmp` is world-readable by default, the `0o600` mode IS meaningful and should be verified to work correctly. If tempdir is ever changed to a shared location, this must be re-evaluated.
