# Step Model Integration -- OpenCode Step Provider

**Version:** v1.0
**Last updated:** 2026-08-19
**Status:** Approved

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
type ModelProviderName = "claude" | "opencode";  // distinct from interface ModelProvider

interface ModelFlowStep extends BaseFlowStep {
  type: "model";
  provider?: ModelProviderName;  // default: "claude"
  model?: string;
  prompt: string;
  // ...
}
```

### Resolution in StepRunner

`StepRunner` builds a `Map<string, ModelProvider>` once in its constructor. Per step: `providers.get(step.provider ?? "claude")`. Throws if provider name is unknown (fail fast).

**v1 concurrency constraint:** Each `ModelProvider` instance tracks one active subprocess. Concurrent model steps that resolve to the same provider name share a single instance -- `StepRunner` MUST serialize such steps (queue them, do not execute in parallel). Steps using different provider names may still run concurrently. This avoids kill() ambiguity on shared instances. Tracked as a v2 improvement when `ProviderLifecycleManager` is generalized.

### `ClaudeLifecycleManager` impact (v1)

`ClaudeLifecycleManager` is left unchanged. Each `ModelProvider` implementation self-manages its spawned process and exposes `kill()`. `FlowWorker` propagates `KILL_CLAUDE` to `FlowExecutor` -> `StepRunner` -> active `ModelStepExecutor` -> `provider.kill()`.

**TODO v2:** Generalize to `ProviderLifecycleManager` tracking N processes when a third provider is added. Decision #5 in `_index.md`.

On `KILL_CLAUDE`, `StepRunner` MUST call `kill()` on ALL provider instances currently executing (not just the most recently started). This covers concurrent model steps in a flow.

## Open questions

*(none currently open for this module)*

## How to add a provider (v1)

1. Implement `ModelProvider` interface: create `<Name>ModelProvider.ts` in `packages/flow-engine/src/processing/`
2. Add the provider name to the `ModelProviderName` union type in `packages/flow-engine/src/types.ts`: `type ModelProviderName = "claude" | "opencode" | "<name>"`
3. Add an entry to the provider map in `StepRunner` constructor: `["<name>", new <Name>ModelProvider()]`

Note: when a third provider is added, evaluate whether `ClaudeLifecycleManager` generalization (deferred in Decision #5) is now warranted.

## Security considerations

Each provider isolates its own environment (T-01 in threat-model.md). Mixed-provider flows do not share env vars between providers.
