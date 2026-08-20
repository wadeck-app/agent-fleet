# Provider Abstraction -- OpenCode Step Provider

**Version:** v1.0
**Last updated:** 2026-08-19
**Status:** Approved

## Overview

This module defines the `ModelProvider` interface and its implementations (`ClaudeModelProvider`, `OpenCodeModelProvider`). It replaces the direct dependency on `ClaudeLauncher` inside `ModelStepExecutor`. A v2 `ModelProviderRegistry` (plugin-style, Option C) is planned once a third provider exists.

## Decisions

| #   | Decision                                                                          | Rationale                                              | Date       |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------- |
| 1   | Use thin `ModelProvider` interface (Option B); registry (Option C) deferred to v2 | Matches existing DI pattern; clean executors; low cost | 2026-08-19 |

## OpenCode CLI flag mapping (v1.18.18)

| Concern           | Claude Code flag                       | OpenCode equivalent                                                                                                  |
| ----------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Prompt delivery   | stdin (pipe)                           | positional args to `opencode run`                                                                                    |
| Structured output | `--output-format stream-json`          | `--format json`                                                                                                      |
| Model selection   | `--model <id>`                         | `-m provider/model`                                                                                                  |
| Permissions skip  | `--dangerously-skip-permissions`       | `--auto`                                                                                                             |
| Session resume    | `--resume <id>`                        | `--session <id>` or `--continue`                                                                                     |
| MCP config        | `--mcp-config <path>` (per invocation) | `OPENCODE_CONFIG_CONTENT` env var (inline JSON, highest precedence) or `OPENCODE_CONFIG` env var (path to temp file) |
| Interactive TUI   | default mode                           | `opencode [project]` or `opencode run -i`                                                                            |

> **`OPENCODE_CONFIG_CONTENT` semantics:** loaded after project config with last-write-wins merge -- `mcp` keys in the content override any global MCP config of the same name. Keys not present in the content are inherited from global config. _(assumed -- verify empirically before shipping OpenCodeModelProvider)_

## Design

### Shared types

```ts
interface McpServer {
	name: string;
	command: string[]; // command + args as array
	env?: Record<string, string>;
	cwd?: string;
	enabled?: boolean;
}

interface LaunchOptions {
	prompt: string; // used by launchBackground() only; ignored by launchInteractive()
	model?: string;
	sessionId?: string;
	skipPermissions?: boolean;
	streamJson?: boolean;
	verbose?: boolean;
	mcpServers?: McpServer[]; // replaces mcpConfigPath entirely
	env?: Record<string, string>;
}
```

`mcpConfigPath: string` is removed from `StepRunnerConfig` and all callers. No migration shim.

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

### MCP serialization per provider

- `ClaudeModelProvider`: writes `mcpServers` to a temp JSON file (Claude format), passes `--mcp-config <tmpfile>`; file is written to `os.tmpdir()`, named `mcp-config-<uuid>.json`, permissions `0o600` (best-effort, Unix only; on Windows file ACLs apply), deleted in a `finally` block after the process exits.
- `OpenCodeModelProvider`: serializes `mcpServers` to OpenCode config format, passes as `OPENCODE_CONFIG_CONTENT` env var. Example value:
    ```json
    {
    	"mcp": {
    		"my-server": {
    			"type": "local",
    			"command": ["npx", "-y", "my-mcp-server"],
    			"environment": { "MY_KEY": "value" },
    			"enabled": true
    		}
    	}
    }
    ```
    Each `McpServer` entry maps to one key under `"mcp"`, using `McpServer.name` as the key, `McpServer.command` as `command`, `McpServer.env` as `environment`, `McpServer.cwd` as `cwd`.

### Security requirements for provider implementations

1. **Spawn with explicit args array** -- never use shell interpolation. Use `spawn(binary, [arg1, arg2, ...])`, not `exec("binary " + prompt)`. This prevents shell injection (T-05).
2. **Env isolation** -- forward only entries declared in `LaunchOptions.env`. Never pass `process.env` directly. Exception: `ClaudeModelProvider` implicitly forwards `ANTHROPIC_API_KEY`, `PATH`, and `HOME` (matching existing `ClaudeLauncher` behavior). All other credentials MUST be declared by the caller in `LaunchOptions.env` (T-01).
3. **McpServer field validation** -- before serializing `McpServer[]` to any format, validate all string fields: no null bytes, no control characters, max 2048 chars per field; `McpServer.command` must have `length >= 1`; `McpServer.env` keys must match `^[A-Z_][A-Z0-9_]*$`; `McpServer.name` must match `^[a-zA-Z0-9_-]+$` (prevents JSON key injection in OPENCODE*CONFIG_CONTENT); the `model` field in `LaunchOptions` must match `^[a-zA-Z0-9*./:@-]{1,256}$` before being passed as a spawn flag; `sessionId` (if provided) must match `^[a-zA-Z0-9_-]{1,128}$` (T-04).
4. **kill() contract (normative)** -- `launchBackground()` MUST wrap the subprocess lifetime in a try/finally. The `finally` block MUST call `kill()`. `kill()` itself MUST be wrapped in try/catch and log a warning on failure -- it MUST NOT throw. Pseudocode:
    ```ts
    try {
    	/* run process, collect output */
    } finally {
    	try {
    		provider.kill();
    	} catch (e) {
    		log.warn('kill() failed', e);
    	}
    }
    ```
5. **OPENCODE_CONFIG_CONTENT size** -- if serialized JSON exceeds 1MB, fall back to writing a temp file: path `os.tmpdir()/opencode-mcp-config-<uuid>.json`, permissions `0o600`, set `OPENCODE_CONFIG` env var to the path, delete in `finally` block after process exits (T-06).
6. **Prompt length (OpenCode only)** -- `opencode run` passes the prompt as positional args (not stdin), subject to OS `ARG_MAX`. Prompt MUST NOT exceed 32KB; `OpenCodeModelProvider.launchBackground()` MUST throw a clear error (`PromptTooLargeError`) if exceeded. No limit applies to `ClaudeModelProvider` (prompt via stdin). This rule applies to `launchBackground()` only. `launchInteractive()` does not accept a pre-supplied prompt -- it launches the TUI directly.
7. **--auto / skipPermissions** -- this flag authorizes the provider to execute file writes, shell commands, and arbitrary tool calls without confirmation. Default `false`; requires explicit opt-in in flow `execution` config.

### v2 Registry (planned)

`ModelProviderRegistry` -- providers register by string ID.
Flows reference provider by ID. Loaded from config, not dynamically.
Deferred until a third provider is needed.

## Open questions

_(none currently open for this module)_

## Security considerations

See §Security requirements for provider implementations above. The normative requirements supersede this section.
