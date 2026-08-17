# Threat Model -- Meta Hooks for flow-cli

**Version:** 1.0
**Date:** 2026-08-17
**Methodology:** STRIDE

## Scope

Meta hooks expose internal task/execution lifecycle events to external systems (HTTP endpoints) and local processes (shell commands). The attack surface includes: hook configuration storage, event payload construction, HTTP delivery, and local process execution.

## Assets

What we are protecting:

| Asset                                    | Sensitivity                                                    | Owner           |
| ---------------------------------------- | -------------------------------------------------------------- | --------------- |
| Task/execution metadata in hook payloads | Medium -- may contain file paths, step outputs, secrets in env | flow-cli user   |
| Hook configuration (URLs, commands)      | High -- commands run as the local user                         | flow-cli config |
| Local process execution context          | Critical -- CLI hooks run shell commands                       | OS / user       |

## Threat actors

| Actor                                | Motivation                                   | Capability                                      |
| ------------------------------------ | -------------------------------------------- | ----------------------------------------------- |
| Malicious hook config (supply chain) | Arbitrary code execution via CLI hooks       | Can write config files if they have repo access |
| Webhook endpoint operator            | Data collection of task metadata             | Can receive all hook payloads                   |
| Malicious flow YAML author           | Inject commands via hook config in flow YAML | Can craft flow YAML if shared                   |

## STRIDE analysis

### Spoofing

_(pending -- decisions on hook authentication)_

### Tampering

_(pending -- decisions on payload integrity, hook config storage)_

### Repudiation

_(pending)_

### Information Disclosure

_(pending -- decisions on what data is included in payloads)_

### Denial of Service

_(pending -- decisions on blocking hooks, timeout behavior)_

### Elevation of Privilege

_(pending -- CLI hook execution model)_

## Mitigations

| ID   | Threat category        | Threat description                                                | Mitigation | Status | Decision # |
| ---- | ---------------------- | ----------------------------------------------------------------- | ---------- | ------ | ---------- |
| T-01 | Elevation of Privilege | CLI hooks execute arbitrary shell commands as the current user    | TBD        | Open   | -          |
| T-02 | Information Disclosure | Webhook payloads may leak sensitive data (secrets, file contents) | TBD        | Open   | -          |
| T-03 | Denial of Service      | A blocking hook that hangs can freeze the entire flow execution   | TBD        | Open   | -          |
| T-04 | Tampering              | Malicious flow YAML injects shell commands via CLI hook config    | TBD        | Open   | -          |

## Open security questions

<!-- Security findings that feed into _index.md open questions.
     Format: Q: <question> -> see Open Questions #N in _index.md -->

Q: Should CLI hooks be sandboxed or at minimum require explicit allow-listing? -> see Open Questions #8
Q: Should payloads scrub environment variables / secrets fields? -> see Open Questions #7
Q: Should blocking hooks have a mandatory timeout? -> see Open Questions #6
