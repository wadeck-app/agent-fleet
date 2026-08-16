# Threat Model -- Plugin System for flow/task CLI

**Version:** 1.0
**Date:** 2026-08-16
**Methodology:** STRIDE

## Scope

The plugin system loads third-party or user-defined code at runtime into the flow/task CLI process. Plugins can provide workspaces, agents, models, secrets, scripts, and approval flows. The threat surface covers plugin loading, configuration, plugin-to-host communication, and secrets access.

## Assets

What we are protecting:

| Asset | Sensitivity | Owner |
|---|---|---|
| User secrets / API keys | Critical | User |
| Source code in workspaces | High | User / org |
| Flow execution context (prompts, results) | High | User |
| Host filesystem | High | OS / user |
| Plugin configuration (provider selection, params) | Medium | User |

## Threat actors

| Actor | Motivation | Capability | In scope? |
|---|---|---|---|
| Malicious third-party plugin | Data exfiltration, privilege escalation | Code execution in CLI process | **No** -- plugins are written by the developer running the tool. Third-party untrusted plugins are out of scope for v1. |
| Misconfigured plugin | Accidental data loss, workspace corruption | Depends on plugin type | Yes |
| Compromised plugin registry / npm | Supply chain attack | Arbitrary code | **No** -- out of scope for v1; treat as standard npm supply-chain hygiene, not a plugin-system concern. |

**Scope note (Decision #1):** The threat model for v1 assumes all plugins are first-party (written or audited by the user running the tool). Malicious plugin actors are explicitly out of scope. If untrusted third-party plugins become a future requirement, subprocess isolation (wrapping the in-process interface) can be layered in without changing the plugin API.

## STRIDE analysis

### Spoofing
*(pending -- decisions on plugin identity, signing, and provenance)*

### Tampering
*(pending -- decisions on workspace writes, config mutation)*

### Repudiation
*(pending)*

### Information Disclosure
*(pending -- decisions on secrets access scope, plugin isolation)*

### Denial of Service
*(pending -- decisions on plugin timeouts and resource limits)*

### Elevation of Privilege
*(pending -- decisions on what host capabilities plugins can access)*

## Mitigations

| ID | Threat category | Threat description | Mitigation | Status | Decision # |
|---|---|---|---|---|---|
| T-01 | Information Disclosure | Credential accidentally committed in project config via inline instance | CLI enforces ${ENV_VAR} for all known sensitive fields in inline instances -- literal values are a hard error at load time | Mitigated | 2 |
| T-02 | Information Disclosure | Plugin reads secrets it should not access at runtime | Capability injection: each plugin call receives only the typed request, not the full config | Open | - |
| T-03 | Tampering | Misconfigured workspace plugin corrupts source files | WorkspaceHandle exposes only an allocated path, not the raw repo root | Open | - |
| T-04 | Tampering | Malicious plugin mutates CLI config (OUT OF SCOPE v1) | n/a -- malicious plugins are out of scope | Closed -- N/A | 1 |
| T-05 | Spoofing / Tampering | Remote config source is compromised or spoofed (v3) | Deferred -- threat model update required when remote config is designed | Open -- v3 | - |

## Open security questions

<!-- Security findings that feed into _index.md open questions.
     Format: Q: <question> -> see Open Questions #N in _index.md -->
Q: Should plugins be sandboxed (subprocess isolation vs in-process)? -> see Open Questions #1
Q: How are secrets scoped to individual plugins? -> see Open Questions #8
