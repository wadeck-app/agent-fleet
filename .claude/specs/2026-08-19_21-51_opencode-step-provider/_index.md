# Spec: OpenCode Step Provider

**Created:** 2026-08-19
**Version:** v0.1
**Status:** In Progress -- v0.1 -- 2/7 questions resolved
**Iteration:** 1

## Summary

<!-- One paragraph: what this spec covers and why it exists. Fill in after first few decisions. -->

## Decision Log

| # | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| 1 | Provider abstraction: thin `ModelProvider` interface (Option B), provider registry (Option C) planned for v2 | Approved | 2026-08-19 | DI pattern matches existing codebase; clean executors; low cost vs. Option A; Option C deferred until 3+ providers exist |
| 2 | OpenCode v1.18.18 invocation facts: `opencode run [message]` (positional args, not stdin); `--format json` for structured output; `--auto` for permissions skip; `-m provider/model` for model; no per-invocation MCP config path | Factual | 2026-08-19 | Verified from installed binary help output |

## Open Questions

| # | Question | Priority | Status |
|---|---|---|---|
| 1 | What is the desired scope of provider abstraction? | High | Resolved -> Decision #1 |
| 2 | Which invocation style does OpenCode support? | High | Resolved -> Decision #2 |
| 3 | How should flow steps select which provider to use? | High | Open |
| 4 | How should FlowDesignerAgent and LocalClaudeAgentExecutor be handled? | Medium | Open |
| 5 | How should MCP config be passed via the ModelProvider interface? | Medium | Open |
| 6 | How should --dangerously-skip-permissions equivalent be handled? | Medium | Open |
| 7 | What is the migration / rollout strategy? | Low | Open |

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
