# Threat Model -- Plugin System for flow/task CLI

**Version:** 1.0
**Date:** 2026-08-16
**Methodology:** STRIDE

## Scope

The plugin system loads third-party or user-defined code at runtime into the flow/task CLI process. Plugins can provide workspaces, agents, models, secrets, scripts, and approval flows. The threat surface covers plugin loading, configuration, plugin-to-host communication, and secrets access.

## Assets

What we are protecting:

| Asset                                             | Sensitivity | Owner      |
| ------------------------------------------------- | ----------- | ---------- |
| User secrets / API keys                           | Critical    | User       |
| Source code in workspaces                         | High        | User / org |
| Flow execution context (prompts, results)         | High        | User       |
| Host filesystem                                   | High        | OS / user  |
| Plugin configuration (provider selection, params) | Medium      | User       |

## Threat actors

| Actor                             | Motivation                                 | Capability                    | In scope?                                                                                                               |
| --------------------------------- | ------------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Malicious third-party plugin      | Data exfiltration, privilege escalation    | Code execution in CLI process | **No** -- plugins are written by the developer running the tool. Third-party untrusted plugins are out of scope for v1. |
| Misconfigured plugin              | Accidental data loss, workspace corruption | Depends on plugin type        | Yes                                                                                                                     |
| Compromised plugin registry / npm | Supply chain attack                        | Arbitrary code                | **No** -- out of scope for v1; treat as standard npm supply-chain hygiene, not a plugin-system concern.                 |

**Scope note (Decision #1):** The threat model for v1 assumes all plugins are first-party (written or audited by the user running the tool). Malicious plugin actors are explicitly out of scope. If untrusted third-party plugins become a future requirement, subprocess isolation (wrapping the in-process interface) can be layered in without changing the plugin API.

## STRIDE analysis

### Spoofing

v1 scope: plugins are loaded by convention from `packages/plugin-<id>` (developer-controlled). No external plugin loading, no identity spoofing risk in v1. Plugin identity is verified by PLUGIN-002 (pluginId must match directory name). v3 remote config introduces spoofing surface -- deferred.

**IMPORTANT:** The PLUGIN-002 spoofing mitigation (pluginId matches directory name at runtime) is NOT fully enforceable until Open Question #1 (plugin discovery/loading mechanism) is resolved. Spoofing is **partially mitigated** (lint-time PLUGIN-002 check exists) but the runtime enforcement is pending. This is a known gap to resolve before production use.

### Tampering

Main risk: a misconfigured workspace plugin writing to the repo root instead of the allocated worktree path (T-03). Mitigated by WorkspaceHandle exposing only the allocated path. The `none` provider's use of `process.cwd()` is an accepted opt-in risk.

### Repudiation

No audit log for plugin calls in v1. Actions taken by plugins (worktree creation, git commits, API calls) are logged by the underlying systems (git log, Jira audit log). A flow-level audit log is a v2+ concern.

### Information Disclosure

Main risks: T-01 (credentials committed via inline instance -- mitigated by load-time hard error on literal credential values) and T-02 (plugin reads secrets it should not -- accepted risk for v1 developer-written plugins).

### Denial of Service

No timeout contract on provider methods in v1. A hung `allocate()` or `requestApproval()` blocks the CLI indefinitely. Acceptable for v1 (developer-controlled environment). Timeout support is a v2 hardening item.

### Elevation of Privilege

In-process plugins run with full CLI process capabilities (P-1 accepted risk for developer-written plugins). No EoP risk beyond the user's existing OS privileges. Subprocess isolation (v2) would add a boundary.

## Mitigations

| ID   | Threat category        | Threat description                                                                                  | Mitigation                                                                                                                                                                                                                                                                                                                                                             | Status                                             | Decision # |
| ---- | ---------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------- |
| T-01 | Information Disclosure | Credential accidentally committed in project config via inline instance                             | CLI enforces ${ENV_VAR} for all known sensitive fields in inline instances -- literal values are a hard error at load time                                                                                                                                                                                                                                             | Mitigated                                          | 2          |
| T-02 | Information Disclosure | Plugin reads secrets it should not access at runtime                                                | Capability injection: each plugin call receives only the typed request, not the full config. Accepted risk for v1: all plugins are developer-written (see scope note in Threat actors). Capability injection (P-2) reduces accidental cross-plugin data access. If untrusted plugins become a requirement, subprocess isolation (out-of-scope, v2) would address this. | Accepted risk -- v1                                | 1          |
| T-03 | Tampering              | Misconfigured workspace plugin corrupts source files                                                | WorkspaceHandle exposes only an allocated path, not the raw repo root. Exception: the `none` workspace provider intentionally returns `process.cwd()` (the live repo root). This is an accepted risk when `none` is explicitly configured -- the developer opts into no isolation.                                                                                     | Accepted risk for `none`; Mitigated for `worktree` | 4          |
| T-04 | Tampering              | Malicious plugin mutates CLI config (OUT OF SCOPE v1)                                               | n/a -- malicious plugins are out of scope                                                                                                                                                                                                                                                                                                                              | Closed -- N/A                                      | 1          |
| T-05 | Spoofing / Tampering   | Remote config source is compromised or spoofed (v3)                                                 | Deferred -- threat model update required when remote config is designed                                                                                                                                                                                                                                                                                                | Open -- v3                                         | -          |
| T-06 | Spoofing               | Cross-task intervention spoofing: a user responds to another task's approval request via the web UI | Orchestrator plugin must validate that the responding user is authorized for the given taskId before accepting the response. **Note:** The CLI approval plugin (terminal prompt) is not affected -- single user, blocking prompt, no multi-user risk. The orchestrator approval plugin is gated on T-06 resolution before it can be marked production-ready.           | Open -- v2                                         | -          |

## Open security questions

<!-- Security findings that feed into _index.md open questions.
     Format: Q: <question> -> see Open Questions #N in _index.md -->

Q: Should plugins be sandboxed (subprocess isolation vs in-process)? -> Resolved, see Decision #1 in \_index.md (in-process accepted for v1; subprocess isolation deferred to v2/out-of-scope.md)
Q: How are secrets scoped to individual plugins? -> see Open Questions #8
