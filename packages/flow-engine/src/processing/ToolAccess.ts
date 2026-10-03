/**
 * ToolAccess -- canonical, provider-agnostic tool names for the `tools` step restriction.
 *
 * A step's `tools: string[]` names which of these it may use; omitting `tools` leaves every
 * provider at its own default (unrestricted). Each provider maps the canonical name to its own
 * native identifier -- Claude and OpenCode support this per-tool; Codex does not (see
 * `CodexModelProvider`'s `--sandbox` fallback) and only honors the write/bash-adjacent cases.
 */

export const TOOL_NAMES = [
	'read',
	'write',
	'edit',
	'bash',
	'glob',
	'grep',
	'webfetch',
	'websearch',
	'task',
	'todowrite',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const TOOL_NAME_SET: ReadonlySet<string> = new Set(TOOL_NAMES);

/** Fail fast on an unknown name rather than letting a provider silently ignore it. */
export function validateToolNames(tools: readonly string[]): ToolName[] {
	for (const name of tools) {
		if (!TOOL_NAME_SET.has(name)) {
			throw new Error(`Unknown tool name '${name}' in step 'tools'. Valid names: ${TOOL_NAMES.join(', ')}`);
		}
	}
	return tools as ToolName[];
}

/** Claude Code's own tool identifiers (PascalCase), passed via --tools. */
export const CLAUDE_TOOL_NAMES: Record<ToolName, string> = {
	read: 'Read',
	write: 'Write',
	edit: 'Edit',
	bash: 'Bash',
	glob: 'Glob',
	grep: 'Grep',
	webfetch: 'WebFetch',
	websearch: 'WebSearch',
	task: 'Task',
	todowrite: 'TodoWrite',
};

/**
 * OpenCode's own tool identifiers, confirmed live against opencode 1.18.x: a config with
 * `tools: { write: false, edit: false, bash: false }` left the model reporting its own
 * available tools as "glob, grep, read, skill, task, todowrite, webfetch" -- these names map
 * 1:1 to the canonical ones.
 */
export const OPENCODE_TOOL_NAMES: Record<ToolName, string> = {
	read: 'read',
	write: 'write',
	edit: 'edit',
	bash: 'bash',
	glob: 'glob',
	grep: 'grep',
	webfetch: 'webfetch',
	websearch: 'websearch',
	task: 'task',
	todowrite: 'todowrite',
};

/**
 * Builds the `tools` object for OpenCode's config.json: every canonical name gets an explicit
 * true/false based on membership in `allowed`. OpenCode's own `patch` tool is an alternate
 * write path with no canonical equivalent -- folded into `write` here so excluding `write`
 * actually blocks file writes, not just its most common tool.
 */
export function buildOpenCodeToolsConfig(allowed: readonly ToolName[]): Record<string, boolean> {
	const allowedSet = new Set(allowed);
	const config: Record<string, boolean> = {};
	for (const name of TOOL_NAMES) {
		config[OPENCODE_TOOL_NAMES[name]] = allowedSet.has(name);
	}
	config['patch'] = allowedSet.has('write');
	return config;
}

/** Builds Claude's --tools argument value: "" disables all tools (confirmed via `claude --help`). */
export function buildClaudeToolsArg(allowed: readonly ToolName[]): string {
	return allowed.map(name => CLAUDE_TOOL_NAMES[name]).join(',');
}
