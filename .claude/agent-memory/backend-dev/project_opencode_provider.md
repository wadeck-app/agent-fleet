---
name: opencode-provider-refactor
description: ModelProvider interface introduced; OpenCode as second AI CLI provider; McpServer[] replaces mcpConfigPath
metadata:
  type: project
---

`ModelProvider` interface added (2026-08-20, integration branch):
- `packages/flow-engine/src/processing/ModelProvider.ts` — interface + McpServer type + validation utils + PromptTooLargeError
- `ClaudeModelProvider` wraps ClaudeLauncher; writes McpServer[] to temp JSON file → passes --mcp-config
- `OpenCodeModelProvider` spawns `opencode run [message] --format json [--auto] [-m model]`; uses OPENCODE_CONFIG_CONTENT env var (≤1MB) or OPENCODE_CONFIG temp file (>1MB); 32KB prompt limit
- `StepRunnerConfig.mcpConfigPath` REMOVED → replaced by `mcpServers?: McpServer[]`
- `ModelFlowStep.model` changed from `ModelType` to `string?`; `provider?: ModelProviderName` added
- `flow-cli McpServer.ts` no longer writes a config file — returns `McpServerConfig` struct via `start()`, caller passes it to StepRunner as `mcpServers`
- `ModelType = 'sonnet' | 'haiku' | 'opus'` kept but deprecated; `ModelProviderName = 'claude' | 'opencode'` added

**Why:** Spec decision to support multiple AI CLI providers without breaking existing Claude behavior.
**How to apply:** Any new model provider should implement `ModelProvider`; register in StepRunner constructor providers Map.

See [[project_flow_driven_dev]]
