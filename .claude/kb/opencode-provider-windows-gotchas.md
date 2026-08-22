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

## 8. Dynamic plugins — no npm install needed (verified v1.18.18)

OpenCode supports **file path plugins** in addition to npm package names. Pass an absolute path in the `plugin` array:

```json
{ "plugin": ["C:/Temp/my-run-abc/hook.js"] }
```

OpenCode imports the file directly — no `npm install`, no `package.json` needed.

**Minimum plugin structure** (ES module, single file):

```js
export const Plugin = async ctx => {
	return {
		'tool.execute.before': async (input, output) => {
			/* input.tool, input.callID, output.args */
		},
		'tool.execute.after': async (input, output) => {
			/* output.output, output.title */
		},
	};
};
```

The exported name must be `Plugin` (or any named async function matching the Plugin type — unconfirmed if arbitrary names work).

**Isolation per parallel run** (`XDG_CONFIG_HOME`):

- `XDG_CONFIG_HOME=<uniqueTemp>` completely replaces `~/.config/opencode/` for that subprocess.
- `OPENCODE_CONFIG_DIR` is additive (global config still loads) — wrong tool for isolation.
- `--pure` disables all plugins, including injected ones.

**Pattern for agent-fleet spawned subprocess:**

```ts
const tempDir = path.join(os.tmpdir(), `opencode-${crypto.randomUUID()}`);
const pluginPath = path.join(tempDir, 'hook.js').replace(/\\/g, '/');
await fs.mkdir(tempDir, { recursive: true });
await fs.writeFile(pluginPath, generatePluginCode(hooks));
const config = { ...baseConfig, plugin: [pluginPath] };
// pass XDG_CONFIG_HOME=tempDir in env
// cleanup tempDir in finally
```

**Gotcha — npm package name in `plugin` array triggers background npm install:**
If you accidentally set `plugin: ["my-package"]` (not a path), OpenCode reads the XDG config dir's `package.json`, finds the dep, and runs `npm install` in the background. Fails with `NpmInstallFailedError` if package not on registry. Use an absolute path to avoid this.

**Available hooks** (from `@opencode-ai/plugin` v1.0.168 types):

- `tool.execute.before` — fires before each tool call; can mutate `output.args`; throw to block
- `tool.execute.after` — fires after; `output.output` is the tool result string
- `chat.message`, `chat.params`, `permission.ask`, `event`, `tool` (add custom tools)
- `experimental.session.compacting`, `experimental.text.complete`

## Test flows

`C:\Workspace_Tooling\_test-tasks\` -- 3 manual YAML flows to verify end-to-end.
