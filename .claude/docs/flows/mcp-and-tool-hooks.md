# MCP Servers and Tool Hooks in Model Steps

Both `ClaudeModelProvider` and `OpenCodeModelProvider` accept the same `McpServer[]` and `ToolHook[]` on a model step. Write the YAML once; both providers translate it to their native format automatically.

## Adding an MCP Server

```yaml
steps:
  - id: analyze
    type: model
    model: sonnet
    mcpServers:
      - name: my-tool
        command: [node, /absolute/path/to/server.mjs]
        env:
          API_KEY: ${{ inputs.apiKey }}   # optional
        cwd: /working/dir                  # optional
    prompt: Use the my-tool MCP tool to analyze ${{ inputs.target }}
```

### `McpServer` fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | `string` | yes | `^[a-zA-Z0-9_-]+$` — used as the server key in both providers |
| `command` | `string[]` | yes | First element is the executable; rest are args |
| `env` | `Record<string,string>` | no | Keys must be `^[A-Z_][A-Z0-9_]*$` |
| `cwd` | `string` | no | Working directory for the MCP process |
| `enabled` | `boolean` | no | Defaults to `true` |

**Provider translation:**
- **Claude**: serialised to `{ mcpServers: { name: { command, args, env?, cwd? } } }` and passed via `--mcp-config <tmpfile>`
- **OpenCode**: merged into the OpenCode JSON config under `mcpServers` before launch

### Fixture server for tests

A minimal zero-dependency MCP server is in `packages/flow-engine/src/test-utils/fixtures/mcp-weather-server.mjs`. Copy and adapt it for other test tools instead of referencing a path outside the repo.

## Tool Hooks

Tool hooks intercept the model's tool calls without modifying the MCP server. Use them for logging or denying specific tools.

```yaml
steps:
  - id: run
    type: model
    model: sonnet
    toolHooks:
      - timing: before
        action:
          type: log              # logs tool name + args to stderr before each call
      - timing: before
        action:
          type: deny
          reason: "filesystem writes not allowed in this step"
          toolPattern: "write_*" # glob; omit to deny all tools
          argsContains: "/etc"   # optional: only deny when args contain this string
    prompt: ...
```

### `ToolHook` fields

| Field | Type | Values |
|---|---|---|
| `timing` | `'before' \| 'after'` | When the hook fires |
| `action.type` | `'log' \| 'deny'` | What to do |
| `action.reason` | `string` | Required for `deny`; shown to the model |
| `action.toolPattern` | `string` | Glob against tool name; omit to match all |
| `action.argsContains` | `string` | Case-insensitive substring match on JSON-serialised args |

`deny` only applies with `timing: before`. Both `toolPattern` and `argsContains` must match when both are set (AND logic).

**Provider translation:** OpenCode hooks are compiled to an ESM plugin JS file; Claude hooks are written to the Claude settings JSON — both via provider-specific translators in `processing/OpenCodeHookTranslator.ts` and `processing/ClaudeHookTranslator.ts`.

## Combining MCP servers and tool hooks

```yaml
- id: safe-search
  type: model
  model: haiku
  mcpServers:
    - name: search
      command: [node, search-server.mjs]
  toolHooks:
    - timing: before
      action: { type: log }
    - timing: before
      action:
        type: deny
        reason: "only search tool allowed"
        toolPattern: "!search"   # deny everything that is NOT search
  prompt: Search for ${{ inputs.query }}
```

## Selecting the provider

Set `provider: opencode` or `provider: claude` on the step (defaults to `claude`). The `mcpServers` and `toolHooks` fields are identical regardless of provider.

```yaml
- id: generate
  type: model
  provider: opencode
  model: amazon-bedrock/anthropic.claude-sonnet-4-6
  mcpServers:
    - name: fs
      command: [npx, -y, "@modelcontextprotocol/server-filesystem", /tmp]
  prompt: List the files in /tmp
```

## Relevant source files

| File | Purpose |
|---|---|
| `processing/ModelProvider.ts` | `McpServer` and `LaunchOptions` types |
| `processing/ToolHook.ts` | `ToolHook` type |
| `processing/ClaudeModelProvider.ts` | Claude translation (`--mcp-config`, settings JSON) |
| `processing/OpenCodeModelProvider.ts` | OpenCode translation (JSON config, ESM plugin) |
| `processing/ClaudeHookTranslator.ts` | Claude hook → settings JSON |
| `processing/OpenCodeHookTranslator.ts` | OpenCode hook → ESM plugin JS |
| `test-utils/fixtures/mcp-weather-server.mjs` | Minimal MCP server fixture for tests |
