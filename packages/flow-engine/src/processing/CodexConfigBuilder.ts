/**
 * CodexConfigBuilder -- builds `-c key=value` overrides for the codex CLI.
 *
 * Codex has no config-by-environment-variable (unlike opencode's OPENCODE_CONFIG_CONTENT). Its
 * configuration lives in `$CODEX_HOME/config.toml`, and every key of it can be overridden for a
 * single invocation with `-c dotted.key=<TOML value>` (`codex exec --help`). Using overrides
 * instead of a private CODEX_HOME matters: CODEX_HOME also holds the auth, the model provider
 * settings and the saved sessions that `exec resume` needs, so redirecting it would lose all three.
 *
 * Verified against codex-cli 0.163.0:
 *  - `codex mcp list --json -c mcp_servers.x.command=... ` reports the overrides back
 *    (ProviderFlagContract.test.ts checks this on every run, with no model call).
 *  - a real `codex exec` run reaches and calls an MCP server configured this way
 *    (StepRunner.codex.integration.test.ts).
 *
 * A value that is not valid TOML is NOT rejected by codex: "If it fails to parse as TOML, the raw
 * string is used as a literal". A malformed override therefore turns into a silently wrong string,
 * which is why the encoders below are kept small and exhaustively unit-tested.
 */
import type { McpServer } from './ModelProvider';

export type CodexHookEvent = 'PreToolUse' | 'PostToolUse';

/** Seconds a hook command may run before codex gives up on it. */
const HOOK_TIMEOUT_SECONDS = 30;

export class CodexConfigBuilder {
	/**
	 * Encode a string as a TOML basic string. JSON string syntax is a subset of TOML basic-string
	 * syntax except for DEL (U+007F), which TOML forbids unescaped.
	 */
	public static tomlString(value: string): string {
		return JSON.stringify(value).replace(/\x7f/g, '\\u007f');
	}

	public static tomlStringArray(values: readonly string[]): string {
		return `[${values.map(v => CodexConfigBuilder.tomlString(v)).join(', ')}]`;
	}

	/** Keys are always quoted, so any env var name is valid. */
	public static tomlInlineTable(entries: Record<string, string>): string {
		const body = Object.entries(entries)
			.map(([key, value]) => `${CodexConfigBuilder.tomlString(key)} = ${CodexConfigBuilder.tomlString(value)}`)
			.join(', ');
		return `{ ${body} }`;
	}

	/** One `-c key=value` pair as argv elements. */
	public static override(key: string, tomlValue: string): string[] {
		return ['-c', `${key}=${tomlValue}`];
	}

	/**
	 * Overrides that register each McpServer for one run.
	 *
	 * - `required = true`: without it codex starts the run anyway when a server fails to launch and
	 *   the model just never sees its tools -- a silent degradation. With it the run exits 1 and
	 *   says `required MCP servers failed to initialize: <name>: program not found` (verified).
	 *   Not set on `enabled: false` servers, which are never started.
	 * - `default_tools_approval_mode = "approve"`: without it every MCP tool call fails in a
	 *   headless run with "MCP tool call requires approval, but approval policy is never"
	 *   (verified under --sandbox read-only, which is what a `tools` restriction selects). Listing a server on a
	 *   step is the explicit opt-in to its tools.
	 */
	public static mcpServerOverrides(servers: readonly McpServer[]): string[] {
		const args: string[] = [];
		for (const server of servers) {
			const prefix = `mcp_servers.${server.name}`;
			const [command, ...commandArgs] = server.command;
			args.push(...CodexConfigBuilder.override(`${prefix}.command`, CodexConfigBuilder.tomlString(command!)));
			if (commandArgs.length > 0) {
				args.push(
					...CodexConfigBuilder.override(`${prefix}.args`, CodexConfigBuilder.tomlStringArray(commandArgs))
				);
			}
			if (server.env && Object.keys(server.env).length > 0) {
				args.push(
					...CodexConfigBuilder.override(`${prefix}.env`, CodexConfigBuilder.tomlInlineTable(server.env))
				);
			}
			if (server.cwd) {
				args.push(...CodexConfigBuilder.override(`${prefix}.cwd`, CodexConfigBuilder.tomlString(server.cwd)));
			}
			if (server.enabled === false) {
				args.push(...CodexConfigBuilder.override(`${prefix}.enabled`, 'false'));
			} else {
				args.push(...CodexConfigBuilder.override(`${prefix}.required`, 'true'));
			}
			args.push(...CodexConfigBuilder.override(`${prefix}.default_tools_approval_mode`, '"approve"'));
		}
		return args;
	}

	/**
	 * Override registering one catch-all command hook for an event. The matcher is `*` on purpose:
	 * tool filtering happens inside the generated script (see CodexHookTranslator), so one matching
	 * rule covers `toolPattern` globs, case-insensitive names and the canonical write/edit aliases.
	 *
	 * Replaces any `hooks.<event>` list in the user's own config.toml for this run.
	 */
	public static hookOverride(event: CodexHookEvent, command: string): string[] {
		const handler = `{ type = "command", command = ${CodexConfigBuilder.tomlString(command)}, timeout = ${HOOK_TIMEOUT_SECONDS} }`;
		return CodexConfigBuilder.override(`hooks.${event}`, `[{ matcher = "*", hooks = [${handler}] }]`);
	}
}
