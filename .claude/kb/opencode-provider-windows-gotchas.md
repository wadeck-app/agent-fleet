# OpenCodeModelProvider -- Windows Gotchas

Discovered by running actual flows; unit tests with mocked spawn don't catch these.

## 1. Real binary path
`where.exe opencode.cmd` → npm install dir → `<dir>/node_modules/opencode-ai/bin/opencode.exe`
Spawn this directly (`shell:false`). Chocolatey shim at `C:\ProgramData\chocolatey\bin\opencode.exe` prints --help and exits 1.

## 2. stdin must be 'ignore'
OpenCode takes prompt as positional arg, not stdin. An open stdin pipe (`stdio: ['pipe', ...]`) causes indefinite hang waiting for EOF.

## 3. Use 'exit' event, not 'close'
OpenCode spawns a backend server that inherits stdio pipes → `close` event never fires. Use `proc.on('exit', ...)`.

## 4. MCP config format (verified v1.18.18)
```json
{ "mcp": { "<name>": { "type": "local", "command": [...], "environment": {...}, "enabled": true } } }
```
NOT `mcp.servers`, NOT `type: "stdio"`, NOT `env` (use `environment`).

## 5. Infrastructure env vars required
Forward `PATH`, `HOME`, `USERPROFILE`, `SystemRoot`. Without `HOME`, OpenCode can't find `~/.config/opencode/` and hangs silently.

## 6. Model IDs on Bedrock (this account)
- ✓ `amazon-bedrock/anthropic.claude-sonnet-4-6`
- ✗ `amazon-bedrock/anthropic.claude-haiku-4-5` → UnknownError

## 7. Speed
OpenCode `run`: 3-10s (warm server). Claude Code: 30-60s same model. Major win for automated flows.

## Test flows
`C:\Workspace_Tooling\_test-tasks\` -- 3 manual YAML flows to verify end-to-end.
