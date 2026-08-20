# Threat Model -- OpenCode Step Provider

**Version:** 1.0
**Date:** 2026-08-19
**Methodology:** STRIDE

## Scope

The system boundaries covered are: spawning AI CLI subprocesses from within flow-engine step execution, passing prompts and receiving outputs, provider selection configuration, and credential/API key forwarding.

## Assets

What we are protecting:

| Asset                                                 | Sensitivity | Owner         |
| ----------------------------------------------------- | ----------- | ------------- |
| ANTHROPIC_API_KEY                                     | High        | User/Operator |
| OpenCode API keys / credentials                       | High        | User/Operator |
| Flow step prompts (may contain repo context, secrets) | Medium      | User          |
| Step output / model responses                         | Medium      | User          |

## Threat actors

| Actor                     | Motivation                                         | Capability                       |
| ------------------------- | -------------------------------------------------- | -------------------------------- |
| Malicious flow definition | Exfiltrate credentials or execute arbitrary code   | Runs as the current user process |
| Misconfigured provider    | Unintended credential forwarding to wrong endpoint | Accidental                       |

## STRIDE analysis

### Spoofing

Provider identity is determined by the `provider` field on `ModelFlowStep`. The `StepRunner` resolves it against a closed map of known providers; unknown values throw at runtime (fail fast). No runtime verification of the binary beyond PATH resolution -- see T-03 (binary spoofing, accepted risk).

### Tampering

`McpServer.command[]` and prompt fields must be sanitized before use. `McpServer` fields are serialized to JSON for `OPENCODE_CONFIG_CONTENT` -- all string values must be escaped/validated before serialization to prevent JSON injection (see T-04). Prompt is passed as a positional arg array to `spawn()`, never via shell interpolation, preventing shell injection (see T-05).

### Repudiation

Each provider subprocess produces stdout/stderr captured in `StepTrace`. Flow execution traces are stored by the orchestrator. No additional repudiation controls in v1 scope.

### Information Disclosure

Each `ModelProvider` implementation forwards only explicitly declared env vars (see T-01). `ClaudeModelProvider` forwards `ANTHROPIC_API_KEY` and entries from `LaunchOptions.env`. `OpenCodeModelProvider` forwards only entries from `LaunchOptions.env`. Any additional credentials OpenCode needs internally (e.g. provider API keys) must be declared explicitly in `LaunchOptions.env` by the caller -- no implicit passthrough of host env vars. `OPENCODE_CONFIG_CONTENT` is passed via env var -- its content (MCP server definitions) is visible to child processes of the spawned provider.

### Denial of Service

`OPENCODE_CONFIG_CONTENT` size is bounded by OS `ARG_MAX` (~2MB on Linux/Windows). If `McpServer[]` serialization exceeds ~1MB, `OpenCodeModelProvider` must fall back to writing a temp file and using `OPENCODE_CONFIG` env var instead (see T-06). Flow step timeouts are enforced by `StepRunner`.

### Elevation of Privilege

`--auto` (OpenCode) and `--dangerously-skip-permissions` (Claude) authorize the AI to execute file writes, shell commands, and tool calls without per-action confirmation. These flags are controlled by `LaunchOptions.skipPermissions` and must only be set when explicitly configured in the flow's `execution.skipPermissions` field. Default is `false` for both providers.

## Mitigations

| ID   | Threat category        | Threat description                                                             | Mitigation                                                                                                      | Status                 | Decision #                        |
| ---- | ---------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------- |
| T-01 | Information Disclosure | Credentials leaked to wrong provider subprocess                                | Each `ModelProvider` forwards only explicit keys from `LaunchOptions.env`; no `process.env` passthrough         | Mitigated              | Decision #2 / #6                  |
| T-02 | Elevation of Privilege | OpenCode CLI runs with broader permissions than intended                       | `skipPermissions` defaults to `false`; requires explicit opt-in in flow `execution` config                      | Mitigated              | Decision #6                       |
| T-03 | Spoofing               | Binary spoofing via PATH manipulation                                          | Accepted risk -- same issue exists for Claude today; no path pinning in v1                                      | Accepted               | -                                 |
| T-04 | Tampering              | JSON injection via unsanitized `McpServer` fields in `OPENCODE_CONFIG_CONTENT` | All `McpServer` string fields must be validated (no control chars, reasonable length) before JSON serialization | Mitigated (impl. req.) | provider-abstraction.md §Security |
| T-05 | Tampering              | Shell injection via prompt passed to subprocess                                | Prompt must be passed as positional arg to `spawn()` with explicit args array; never via shell interpolation    | Mitigated (impl. req.) | provider-abstraction.md §Security |
| T-06 | Denial of Service      | `OPENCODE_CONFIG_CONTENT` env var exceeds OS ARG_MAX                           | If serialized MCP config exceeds 1MB, fall back to `OPENCODE_CONFIG` (temp file path)                           | Mitigated (impl. req.) | provider-abstraction.md §Security |

## Open security questions

T-04, T-05, T-06 mitigated as implementation requirements in `provider-abstraction.md § Security requirements`. T-03 accepted risk (binary spoofing via PATH -- same as existing Claude integration). All threats covered.
