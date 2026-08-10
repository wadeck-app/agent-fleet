# Threat Model — flow-cli

**Scope:** `packages/flow-cli` — standalone CLI for running, validating, and inspecting agent flows.  
**Context:** Developer-local tool. Intended users are developers running it in their own working directory on their own machine. Not exposed as a service, not multi-tenant, not network-accessible by external parties.

---

## Trust boundary

```
[Developer] → [flow CLI process] → [local filesystem] → [FlowExecutor → Claude subprocess]
                      ↑
              [engine daemon on 127.0.0.1:47832]
```

- The CLI runs as the **same OS user** as the developer.
- All inputs (`flowRef`, `--inputs`, `--cwd`, `--output`) are provided by **the same user** who owns the files being read/written.
- The daemon binds to `127.0.0.1` only — not reachable from other hosts.

---

## Accepted risks

### AR-1 — Path traversal via `flowRef` and `--cwd`

**Finding:** SEC-3 (original audit)  
**Location:** `FlowCliRunner.ts:72-74`

`flowRef` is resolved against `cwd` with no boundary check — `../../etc/hosts` would be read as YAML.

**Why accepted:** The attacker and the victim are the same person. A developer running `flow run ../../anything` is doing so intentionally. Enforcing a boundary would prevent legitimate use cases (running flows from outside the project root, absolute paths, CI pipelines with custom directory layouts).

**Residual risk:** Negligible in single-user local context. Would require re-evaluation if the CLI is ever exposed via a server endpoint or executed in a multi-tenant environment.

---

### AR-2 — Arbitrary file write via `--output`

**Finding:** SEC-4 (original audit)  
**Location:** `DocsCommand.ts:15`

`flow docs -o <path>` writes to any writable path without validation.

**Why accepted:** Same rationale as AR-1. The user invoking the command owns the target filesystem. The command writes documentation content (not user-controlled data), so the content itself is not a vector.

**Residual risk:** Negligible. Re-evaluate if `--output` ever accepts user-provided content templates.

---

### AR-3 — `autoStartDaemon` returns client before socket is bound

**Finding:** Q-4 (original audit)  
**Location:** `engine-client.ts:53-57`

The client is returned as soon as the port file is written, before the TCP socket accepts connections. The first command may get `ECONNREFUSED`.

**Why accepted:** The daemon is currently a PoC not used by any production flow. The SDK (`@wadeck/singleton-daemon-kit`) is expected to handle the retry logic on the client side. Re-evaluate when the daemon is promoted to production use.

**Residual risk:** First-call `ECONNREFUSED` on slow machines. The `autoStartDaemon` caller should handle this error and retry.

---

### AR-4 — `loadProjectFlows()` called unconditionally

**Finding:** Q-5 (original audit)  
**Location:** `FlowCliRunner.ts:68`

If neither `.agent-fleet/flows.yml` nor `.agent-fleet/flows-custom.yml` exists, the behavior depends on `FlowRegistry.loadProjectFlows()` — it may throw a cryptic error or silently continue.

**Why accepted:** The CLI is designed to run inside an agent-fleet project. Running it outside that context is an unsupported use case. The error surfaced by `FlowRegistry` is sufficient signal to the developer.

**Residual risk:** Poor DX when used outside an agent-fleet project. Acceptable for v1 scope.

---

### AR-5 — `ValidateCommand` action is synchronous

**Finding:** Q-6 (original audit)  
**Location:** `ValidateCommand.ts:21`

If the action callback is ever made async without being declared `async`, Commander will not await it and errors will be silently swallowed.

**Why accepted:** The `FlowValidator.validate()` call is fully synchronous by design (pure in-memory schema check). There is no async I/O in the validate path. The risk only materialises if someone adds async code without updating the signature — which TypeScript would flag if the return type is checked.

**Residual risk:** Latent code smell. Mitigated by TypeScript strict mode and code review.

---

### AR-6 — `FlowEngine` race condition in queue promotion (PoC daemon)

**Finding:** Q-2 (original audit)  
**Location:** `engine-daemon.ts:30-34`

Two concurrent `run-flow` calls in the same event-loop tick can both see `running.length === 0` and both return `status: 'started'`.

**Why accepted:** The daemon is explicitly a PoC (`// PoC in-memory queue — does not execute flows, only tracks run IDs`). It does not actually execute anything via `setImmediate`. Promoting it to production requires a full rewrite with filesystem-persisted queue (see `2026-06-20_flow-driven-development.md`).

**Residual risk:** None in current state (no real execution). Blocking issue for production promotion.

---

### AR-7 — SDK `/version` endpoint unauthenticated

**Finding:** SEC-5 (original audit)  
**Location:** `@wadeck/singleton-daemon-kit` health-server

The HTTP health server exposes `config_dir`, `pid`, and `port` without authentication.

**Why accepted:** Out of scope — this is in the `@wadeck/singleton-daemon-kit` external package. The daemon binds to `127.0.0.1` only, limiting exposure to local users. An issue should be filed against the SDK.

**Residual risk:** Local information disclosure. Low severity given `127.0.0.1` binding and single-user context.

---

### AR-8 — `health_token` file permissions not enforced on Windows

**Finding:** SEC-8 (original audit)  
**Location:** `@wadeck/singleton-daemon-kit` health-server

`fs.writeFile` with `mode: 0o600` is a no-op on Windows NTFS.

**Why accepted:** Out of scope (external package). Windows NTFS inherits ACLs from the parent directory (`%APPDATA%`), which is typically user-restricted by default. An issue should be filed against the SDK.

**Residual risk:** Low on default Windows setups; higher on shared/domain-joined machines.

---

## Items explicitly out of scope

- `@wadeck/singleton-daemon-kit` internals (AR-7, AR-8, no body size limit on daemon HTTP) — tracked as external dependency issues
- Network-level attacks (daemon is `127.0.0.1` only)
- Supply-chain attacks on npm packages (standard dependency management applies)
