# Threat Model -- OpenCode Step Provider

**Version:** 1.0
**Date:** 2026-08-19
**Methodology:** STRIDE

## Scope

The system boundaries covered are: spawning AI CLI subprocesses from within flow-engine step execution, passing prompts and receiving outputs, provider selection configuration, and credential/API key forwarding.

## Assets

What we are protecting:

| Asset | Sensitivity | Owner |
|---|---|---|
| ANTHROPIC_API_KEY | High | User/Operator |
| OpenCode API keys / credentials | High | User/Operator |
| Flow step prompts (may contain repo context, secrets) | Medium | User |
| Step output / model responses | Medium | User |

## Threat actors

| Actor | Motivation | Capability |
|---|---|---|
| Malicious flow definition | Exfiltrate credentials or execute arbitrary code | Runs as the current user process |
| Misconfigured provider | Unintended credential forwarding to wrong endpoint | Accidental |

## STRIDE analysis

### Spoofing
*(pending -- decisions on how provider identity is verified)*

### Tampering
*(pending -- decisions on how prompt/output integrity is maintained)*

### Repudiation
*(pending)*

### Information Disclosure
*(pending -- decisions on which env vars are forwarded to provider subprocesses)*

### Denial of Service
*(pending)*

### Elevation of Privilege
*(pending -- decisions on --dangerously-skip-permissions equivalent)*

## Mitigations

| ID | Threat category | Threat description | Mitigation | Status | Decision # |
|---|---|---|---|---|---|
| T-01 | Information Disclosure | Credentials leaked to wrong provider subprocess | Isolate env per provider; forward only required keys | Open | - |
| T-02 | Elevation of Privilege | OpenCode CLI runs with broader permissions than intended | Require explicit opt-in to skip-permissions equivalent | Open | - |

## Open security questions

<!-- Security findings that feed into _index.md open questions.
     Format: Q: <question> -> see Open Questions #N in _index.md -->
Q: Does OpenCode have a --dangerously-skip-permissions equivalent? What are its implications? -> see Open Questions #6 in _index.md
Q: What credentials does OpenCode require, and how are they isolated from Claude credentials? -> see Open Questions #5 in _index.md
