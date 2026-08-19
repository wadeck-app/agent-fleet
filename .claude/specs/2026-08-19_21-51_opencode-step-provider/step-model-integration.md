# Step Model Integration -- OpenCode Step Provider

**Version:** v0.1
**Last updated:** 2026-08-19
**Status:** Draft

## Overview

This module covers how the `provider` field on `ModelFlowStep` is declared, validated, and resolved to a concrete `ModelProvider` instance at runtime.

## Decisions

| # | Decision | Rationale | Date |
|---|---|---|---|
| 4 | `provider` field on `ModelFlowStep` (step-level); omitted = `"claude"` | Explicit; supports mixed-provider flows; no ambiguity | 2026-08-19 |

## Design

### Flow YAML

```yaml
steps:
  - id: analyze
    type: model
    provider: opencode
    model: amazon-bedrock/anthropic.claude-sonnet-4-6
    prompt: "..."
  - id: summarize
    type: model
    # provider omitted -> defaults to "claude"
    prompt: "..."
```

### Type change

```ts
// packages/flow-engine/src/types.ts
type ModelProvider = "claude" | "opencode";  // extend as providers are added

interface ModelFlowStep extends BaseFlowStep {
  type: "model";
  provider?: ModelProvider;  // default: "claude"
  model?: string;
  prompt: string;
  // ...
}
```

### Resolution in FlowExecutor / StepRunner

`FlowExecutor` builds a `ModelProviderFactory` (or a simple resolver function) that maps `step.provider ?? "claude"` to the correct `ModelProvider` instance. The resolved instance is passed to `ModelStepExecutor` via DI.

### `ClaudeLifecycleManager` impact (v1)

`ClaudeLifecycleManager` is left unchanged. Each `ModelProvider` implementation self-manages its spawned process and exposes `kill()`. `FlowWorker` propagates `KILL_CLAUDE` to `FlowExecutor` -> `StepRunner` -> active `ModelStepExecutor` -> `provider.kill()`.

**TODO v2:** Generalize to `ProviderLifecycleManager` tracking N processes when a third provider is added. Decision #5 in `_index.md`.

## Open questions

*(none currently open for this module)*

## Security considerations

Each provider isolates its own environment (T-01 in threat-model.md). Mixed-provider flows do not share env vars between providers.
