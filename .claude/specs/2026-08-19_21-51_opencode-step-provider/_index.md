# Spec: OpenCode Step Provider

**Created:** 2026-08-19
**Version:** v1.0
**Status:** Approved -- v1.0 -- 2026-08-19
**Iteration:** 1

## Summary

This spec defines how to add OpenCode (v1.18.18) as an alternative AI CLI provider for `"model"` flow steps, alongside the existing Claude Code integration. It introduces a thin `ModelProvider` interface, an `OpenCodeModelProvider` implementation, step-level provider selection, and a clean `McpServer[]` abstraction that replaces the Claude-specific `mcpConfigPath`. Scope is v1 only -- registry pattern and lifecycle manager generalization are explicitly deferred to v2.

## Decision Log

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 1 | Provider abstraction: thin `ModelProvider` interface (Option B), provider registry (Option C) planned for v2 | Approved | 2026-08-19 | DI pattern matches existing codebase; clean executors; low cost vs. Option A; Option C deferred until 3+ providers exist |
| 2 | OpenCode v1.18.18 invocation facts: `opencode run [message]` (positional args, not stdin); `--format json` for structured output; `--auto` for permissions skip; `-m provider/model` for model; MCP via `OPENCODE_CONFIG_CONTENT` env var (inline JSON, highest precedence) | Factual | 2026-08-19 | Verified from installed binary + official docs |
| 3 | `LaunchOptions` carries structured `McpServer[]`; each provider serializes independently; `mcpConfigPath` removed entirely (no migration, no production usage) | Approved | 2026-08-19 | Avoids cross-provider schema coupling; clean interface; Claude's path was an impl detail that leaked |
| 4 | Provider selection: `provider` field on `ModelFlowStep` (step-level); if omitted defaults to `"claude"` | Approved | 2026-08-19 | Explicit per-step; no ambiguity; supports mixed-provider flows naturally |
| 5 | Process lifecycle: each `ModelProvider` self-manages via `kill()` (Option B); `ClaudeLifecycleManager` left as-is for v1; generalization to `ProviderLifecycleManager` deferred to v2 (when 3+ providers exist) | Approved | 2026-08-19 | Minimal v1 change; v2 generalization is likely given more providers coming |
| 6 | `StepRunner` builds `Map<string, ModelProvider>` once in constructor; resolves by `step.provider ?? "claude"` per step | Approved | 2026-08-19 | Simplest correct approach; both providers are cheap to construct |

## Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| 1 | What is the desired scope of provider abstraction? | High | Resolved -> Decision #1 |
| 2 | Which invocation style does OpenCode support? | High | Resolved -> Decision #2 |
| 3 | How should flow steps select which provider to use? | High | Resolved -> Decision #4 |
| 4 | How should FlowDesignerAgent and LocalClaudeAgentExecutor be handled? | Medium | Resolved -> Decision #5 (out of scope v1) |
| 5 | How should MCP config be passed via the ModelProvider interface? | Medium | Resolved -> Decision #3 |
| 6 | How should --dangerously-skip-permissions equivalent be handled? | Medium | Resolved -> Decision #6 (factual: `--auto` flag, same `skipPermissions` field) |
| 7 | What is the migration / rollout strategy? | Low | Resolved -> out of scope (no production) |

## Modules / Sub-files

| File | Contents |
|---|---|
| `guiding-principles.md` | Core principles driving all decisions |
| `out-of-scope.md` | Explicitly excluded items |
| `threat-model.md` | Security threats and mitigations |
| `provider-abstraction.md` | Provider interface design and implementations |
| `step-model-integration.md` | How flow steps select and configure a provider |

## Changelog

| Version | Date | Summary |
|---|---|---|
| v0.1 | 2026-08-19 | Initial spec created |
| v1.0 | 2026-08-19 | All 7 questions resolved; spec approved |
