# Provider Abstraction -- OpenCode Step Provider

**Version:** v0.1
**Last updated:** 2026-08-19
**Status:** Draft

## Overview

This module defines the `ModelProvider` interface and its implementations (`ClaudeModelProvider`, `OpenCodeModelProvider`). It replaces the direct dependency on `ClaudeLauncher` inside `ModelStepExecutor`. A v2 `ModelProviderRegistry` (plugin-style, Option C) is planned once a third provider exists.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 1 | Use thin `ModelProvider` interface (Option B); registry (Option C) deferred to v2 | Matches existing DI pattern; clean executors; low cost | 2026-08-19 |

## OpenCode CLI flag mapping (v1.18.18)

| Concern | Claude Code flag | OpenCode equivalent |
|---|---|---|
| Prompt delivery | stdin (pipe) | positional args to `opencode run` |
| Structured output | `--output-format stream-json` | `--format json` |
| Model selection | `--model <id>` | `-m provider/model` |
| Permissions skip | `--dangerously-skip-permissions` | `--auto` |
| Session resume | `--resume <id>` | `--session <id>` or `--continue` |
| MCP config | `--mcp-config <path>` (per invocation) | `OPENCODE_CONFIG_CONTENT` env var (inline JSON, highest precedence) or `OPENCODE_CONFIG` env var (path to temp file) |
| Interactive TUI | default mode | `opencode [project]` or `opencode run -i` |

## Design

### v1 Interface (thin, DI-injected)

```ts
interface ModelProvider {
  launchInteractive(options: LaunchOptions): Promise<StepTrace>;
  launchBackground(options: LaunchOptions): Promise<StepTrace>;
  kill(): void;
}
```

`ModelStepExecutor` receives a `ModelProvider` via constructor (dependency injection).
`FlowExecutor` resolves the correct implementation based on `step.provider` or flow-level default.

### v2 Registry (planned)

`ModelProviderRegistry` -- providers register by string ID.
Flows reference provider by ID. Loaded from config, not dynamically.
Deferred until a third provider is needed.

## Open questions

*(none currently open for this module)*

## Security considerations

Each `ModelProvider` implementation is responsible for:
- Env isolation: forward only required credentials (T-01 in threat-model.md)
- No cross-provider credential leakage
