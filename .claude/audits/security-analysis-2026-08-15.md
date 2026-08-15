# Security Analysis — flow-cli
Date: 2026-08-15
Status: Analysis complete, implementation pending

---

## #1 — WebSocket daemon: no authentication

**Files:** `WebSocketServer.ts:9,27`, `WorkerPool.ts`, `Daemon.ts`
**Risk:** HIGH — any same-user process can inject steps, forge completions, or execute shell commands in flow workspaces. Escalates to CRITICAL in Docker sidecars/shared servers.

### Blast radius
- `inject_steps` + `script` = arbitrary shell execution in flow workspace with access to resolved secrets
- `step_completed` = forge flow completion without doing the work
- On Docker/Kubernetes shared netns: all sidecars can reach 127.0.0.1

### Recommended fix
Per-daemon random token (256-bit). Workers receive it via `FLOW_WORKER_TOKEN` env var at spawn. All incoming WS messages validated before dispatch. `Authenticator` interface for `--no-auth` / `FLOW_CLI_NO_AUTH=true`.

### Options considered
| Option | Complexity | Solves #2? | Notes |
|--------|-----------|------------|-------|
| A. Random token via env | 2/5 | Yes (primary) | Recommended |
| B. HMAC per-message | 4/5 | Yes | Overkill for local tool |
| C. Unix socket | 3/5 Linux, 4/5 Win | Yes (OS-enforced) | Best long-term, Windows complex |
| D. OS lock file perms | 1/5 | No | Ineffective vs same-user |
| E. mTLS | 5/5 | Yes | Disproportionate |

### `--no-auth` design
```typescript
interface Authenticator {
    workerEnv(): Record<string, string>;
    validate(token: string | undefined): string | null;
}
class TokenAuthenticator implements Authenticator { /* random token */ }
class NoOpAuthenticator implements Authenticator { /* pass-through */ }
```
Resolved once in `startDaemon()`, injected into `WebSocketServer` and `WorkerPool`. No conditionals scattered.

### Status: CLOSED — No action. See threat-model-ws-auth.md for full analysis and scope constraints.

---

## #2 — Worker PID self-reported (spoofable)

**File:** `WorkerPool.ts:79`
**Risk:** HIGH (without #1 fix), LOW after #1 fix

### Analysis
If #1 (token auth) is implemented: token check fires before PID check. A process without the token is terminated before `registerWorker` is reached. The PID race window (10s) becomes irrelevant.

### Residual fix (1 line)
In `registerWorker`: `this.spawnedPids.delete(pid)` after registration — makes PID one-time-use, prevents double-registration.

### Status: CLOSED — A1/A2/A3 out of scope per threat model. The spawnedPids guard (WorkerPool.ts:24) provides adequate protection within defined scope. See threat-model-ws-auth.md.

---

## #3 — Unrestricted file path + error message leakage

**File:** `CommandHandler.ts:43-54`, `RunCommand.ts:72,97,158`
**Risk:** HIGH — daemon reads arbitrary files (YAML parse, existsSync), error messages leak resolved absolute paths

### Error message inventory (user-facing, sensitive)
| Location | Leaks |
|----------|-------|
| CommandHandler.ts:46 | Resolved absolute path in FLOW_NOT_FOUND |
| CommandHandler.ts:54 | Raw js-yaml exception (may include file content) in PARSE_ERROR |
| CommandHandler.ts:108 | Raw WorkspaceManager exception in WORKSPACE_ERROR |
| RunCommand.ts:72 | Absolute projectRoot path |
| RunCommand.ts:97 | ~/.flow-config.yaml path + raw parse exception |
| RunCommand.ts:158 | Amplifies all daemon error messages to user stderr |

### Path restriction guard
```typescript
// After CommandHandler.ts:43
const allowedRoots = [path.resolve(cmd.cwd), path.resolve(os.homedir())];
const isAllowed = allowedRoots.some(root => {
    const rel = path.relative(root, flowFile);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
});
if (!isAllowed) {
    return { type: 'error', code: 'FLOW_NOT_FOUND',
        message: `Flow file is outside allowed directories.` };
}
// Also check symlinks: fs.realpathSync + repeat check
```

### Error message policy
| Code | Before | After |
|------|--------|-------|
| FLOW_NOT_FOUND | `Flow file not found: /home/alice/projet/secret.yml` | `Flow file not found.` |
| PARSE_ERROR | Raw yaml exception | `YAML syntax error in flow file — run 'flow validate' for details` |
| WORKSPACE_ERROR | Raw WorkspaceManager exception | `Failed to allocate workspace. Ensure the directory is writable.` |

### Status: TODO

---

## #4 — process.env forwarded to workers (3 layers)

**Decision confirmed violated.** Explicit requirement: only flow-declared env vars should reach workers. PATH defined by worker itself.

**Files:**
- `WorkerPool.ts:38` — L1: daemon→worker spawn
- `packages/flow-engine/src/executor/ScriptExecutor.ts:87` — L2: worker→script subprocess
- `packages/flow-engine/src/processing/ClaudeLauncher.ts:193,232` — L3: worker→claude subprocess

**Note on L2/L3:** These are in flow-engine (shared package). Fixing L1 (WorkerPool) eliminates the threat: the worker process will have a clean env, so L2/L3 spread nothing sensitive. L2/L3 changes are defence-in-depth and require coordinated flow-engine change.

### What could be exfiltrated
ANTHROPIC_API_KEY, AWS_*, GITHUB_TOKEN, DATABASE_URL, any shell-profile export — via trivial one-liner script step.

### Allowlist for WorkerPool.ts spawn env
```typescript
env: {
    FLOW_DAEMON_PORT: String(this.httpPort),
    FLOW_WS_PORT: String(this.wsPort),
    FLOW_CLAUDE_PATH: this.claudePath,  // resolved at daemon startup
    // ANTHROPIC_API_KEY: named explicitly — not via spread. Conscious decision.
    ...(process.env['ANTHROPIC_API_KEY']
        ? { ANTHROPIC_API_KEY: process.env['ANTHROPIC_API_KEY'] }
        : {}),
    // PATH: needed for standard tools in script steps
    ...(process.env['PATH'] ? { PATH: process.env['PATH'] } : {}),
    // Windows: SystemRoot + USERPROFILE needed for shell and temp resolution
    ...(process.platform === 'win32' && process.env['SystemRoot']
        ? { SystemRoot: process.env['SystemRoot'] } : {}),
    ...(process.platform === 'win32' && process.env['USERPROFILE']
        ? { USERPROFILE: process.env['USERPROFILE'] } : {}),
    // Step-declared env vars arrive via ExecutionContext.inputs (not here)
},
```

### PATH resolution for claude binary
```typescript
// Resolved once at daemon startup, before any env stripping
function resolveClaudePath(): string {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const result = execSync(`${cmd} claude`, { encoding: 'utf8' });
    return result.trim().split('\n')[0].trim();
}
```
Passed as `FLOW_CLAUDE_PATH` to workers. Fail-fast if not found.

### Breaking change
Scripts relying on inherited env (AWS_*, GH_TOKEN, etc.) will break silently. They must declare dependencies in `env:` field. This is the intended behaviour.

### Status: TODO

---

## #5 — User-facing logs contain technical/sensitive information

**Channels:** `RunCommand.ts` stderr, `ValidateCommand.ts` stderr
**Risk:** MEDIUM — paths, exceptions, internal state printed to terminal

### Log sensitivity classification
- **USER** (stderr, always safe): validation messages, step IDs from user YAML, "Flow failed", syntax error line numbers
- **INTERNAL** (file log only): String(err) from exceptions, absolute paths, OS codes, projectRoot, configFile path
- **DEBUG** (file log, DEBUG=flow-cli only): "Step X completed", "Execution started"

### Minimal viable change (no LogSink refactor needed)
3 lines in `CommandHandler.ts` (sanitize FLOW_NOT_FOUND, PARSE_ERROR, WORKSPACE_ERROR messages — already described in #3).
1 line in `RunCommand.ts:97` (hide configFile path from warning).
`RunCommand.ts:158` must not forward `response.message` verbatim — call a formatting function.

### Long-term: LogSink interface
```typescript
interface LogSink {
    user(message: string): void;             // → stderr, human-friendly
    detail(message: string, ctx?: {}): void; // → file log only
}
```
12 call sites to migrate. Not required for immediate risk elimination.

### Status: TODO (partially addressed by #3 fix)

---

## #6 — 0o600 ineffective on Windows for MCP config temp file

**File:** `McpServer.ts:128`
**Risk:** MEDIUM — same-user processes can read bearer token from %TEMP% during step execution (minutes to hours)

### Verdict: REAL RISK
Node.js `mode: 0o600` does not set NTFS ACLs. File in %TEMP% is readable by any same-user process. Token grants `provideSteps` access → `script` step injection → code execution.

### Options
| Option | Effective vs same-user? | Complexity | Feasible? |
|--------|------------------------|-----------|-----------|
| A. icacls after write | No (owner always has access) | 2/5 | No — NTFS owner = full control |
| B. Token via env var to Claude | Yes (env not readable without PROCESS_VM_READ) | 2/5 | Only if Claude CLI supports |
| C. Named pipe | Yes | 4/5 | Complex, Claude transport constraint |
| D. Accept + threat model | — | 0 | Interim if B not feasible |

### Action required
Check if Claude CLI supports env var substitution in MCP config headers: `"Authorization": "Bearer ${FLOW_MCP_TOKEN}"`. If yes → implement B. If no → TM-01 entry below.

### Threat model entry TM-01
> MCP bearer token in %TEMP% readable by same-user processes on Windows during step execution. Mitigations: 128-bit random token, loopback binding, token expires on step completion, injected steps field-validated. Residual risk: malicious persistent same-user process can inject script steps during the execution window. Severity: MEDIUM — requires existing same-user foothold.

### Status: TODO (pending Claude CLI check)

---

## #7 — LogMasker < 4 chars threshold

**File:** `LogMasker.ts:18`
**Status:** DESIGN DECISION — not a bug

Hardcoded literal, not configurable. Rationale: prevents false-positive redaction of common short strings ("ok", "id", "no"). Encoded variants (base64 ≥ 4, hex ≥ 8) are still masked.

### Changes needed
1. Make threshold a constructor parameter (default: 4) — trivial
2. Expand inline comment
3. Add TM-02 entry to threat model

### Threat model entry TM-02
> Short secrets (≤ 3 char plaintext) not masked in raw form in logs. Design decision to prevent false-positive redaction. Encoded variants (base64, hex) still masked. Mitigation: document and enforce minimum 8-char secret length in flow authoring guidelines.

### Status: TODO (trivial, 1h)

---

## #8 — Hex masking case-sensitive

**File:** `LogMasker.ts:51`
**Risk:** LOW (theoretical — no uppercase hex production path in codebase)

### Fix (trivial, defence-in-depth)
```typescript
const flags = /^[0-9a-f]+$/i.test(variant) ? 'gi' : 'g';
this.patterns.push({ pattern: new RegExp(escapeRegex(variant), flags), replacement: REDACTED });
```

### Status: TODO (1h, bundle with #7)

---

## Priority order
| P | Finding | Effort | Rationale |
|---|---------|--------|-----------|
| P0 | #4 env allowlist | 2d | CRITICAL exfiltration risk, 3 layers |
| P0 | #3 path guard + error sanitize | 0.5d | HIGH info disclosure |
| P1 | #5 log sensitivity (12 call sites) | 1d | MEDIUM — mostly covered by #3 |
| P2 | #6 Claude CLI env var check | 0.5d | MEDIUM on Windows |
| P3 | #7+#8 LogMasker fixes | 1h | LOW, trivial |

---

## Quality Review

Verified 2026-08-15 against actual source files.

### CommandHandler.ts — findings #3, #5

**Line 46 (FLOW_NOT_FOUND):** CONFIRMED. `return { type: 'error', code: 'FLOW_NOT_FOUND', message: \`Flow file not found: ${flowFile}\` }` — `flowFile` is a resolved absolute path from line 43.

**Line 54 (PARSE_ERROR):** CONFIRMED. `return { type: 'error', code: 'PARSE_ERROR', message: \`Failed to parse flow file: ${String(err)}\` }` — raw js-yaml exception string.

**Line 108 (WORKSPACE_ERROR):** CONFIRMED. `return { type: 'error', code: 'WORKSPACE_ERROR', message: \`Failed to allocate workspace: ${String(err)}\` }` — raw WorkspaceManager exception.

**Range claim `CommandHandler.ts:43-54`:** CONFIRMED. Line 43 resolves the path; line 45–46 is the existsSync + FLOW_NOT_FOUND; line 53–54 is the YAML parse + PARSE_ERROR.

### WorkerPool.ts — findings #2, #4

**Line 38 (`...process.env`):** CONFIRMED. `spawnWorker()` at line 36–44 spreads `...process.env` as the first entry in the `env` object, followed by two explicit overrides (`FLOW_DAEMON_PORT`, `FLOW_WS_PORT`). All other daemon environment variables (ANTHROPIC_API_KEY, AWS_*, etc.) are forwarded verbatim.

**Line 79 (PID check):** CONFIRMED. `registerWorker` at line 76; line 79 is `if (!this.spawnedPids.has(pid))` — the only guard. Note: `this.spawnedPids.delete(pid)` is NOT called after registration (only on process exit at line 68), confirming the residual double-registration risk described in #2.

### LogMasker.ts — findings #7, #8

**Finding #7 — `LogMasker.ts:18` (threshold):** WRONG LINE. The threshold check `if (variant.length < 4) continue;` is at **line 17**, not line 18. Line 18 is `this.patterns.push({`. The behavior described is correct; only the line number is off by one.

**Finding #8 — `LogMasker.ts:51` (hex case-sensitive):** WRONG LINE. The hex variant `buf.toString('hex')` is at **line 50**, not line 51. Line 51 is `];` (the closing bracket of the variants array). The actual root of the case-sensitivity issue is line **19** where the pattern is constructed with `'g'` flag unconditionally — `new RegExp(escapeRegex(variant), 'g')`. The finding's description and proposed fix are correct; only the cited line number is inaccurate.

### Summary

| Finding | Claim | Verdict | Correction |
|---------|-------|---------|------------|
| #3 CommandHandler.ts:46 FLOW_NOT_FOUND | Absolute path leaked | CONFIRMED | — |
| #3 CommandHandler.ts:54 PARSE_ERROR | Raw exception string | CONFIRMED | — |
| #3 CommandHandler.ts:108 WORKSPACE_ERROR | Raw exception string | CONFIRMED | — |
| #4 WorkerPool.ts:38 `...process.env` | Full env spread | CONFIRMED | — |
| #2 WorkerPool.ts:79 PID check | Self-reported PID only guard | CONFIRMED | — |
| #7 LogMasker.ts:18 threshold | `< 4` skip check | WRONG LINE | Actual line is **17** |
| #8 LogMasker.ts:51 hex case-sensitive | Hex variant registration | WRONG LINE | Hex variant is line **50**; pattern flag is line **19** |
