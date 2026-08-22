/**
 * ClaudeHookTranslator — converts ToolHook[] into Claude hook settings JSON.
 *
 * Claude CLI expects: { hooks: { PreToolUse: [...], PostToolUse: [...] } }
 * Each entry: { matcher: "<glob>", hooks: [{ type: "command", command: "<shell cmd>" }] }
 *
 * Tool filtering: the `matcher` field handles tool selection (Claude evaluates it before
 * running the command). For `deny` hooks, toolPattern becomes the matcher; the command
 * unconditionally exits 2, which signals Claude to block the tool call.
 *
 * Commands are Node.js one-liners for Windows compatibility (no bash dependency).
 * Available env vars in Claude hook commands:
 *   PreToolUse:  TOOL_NAME, TOOL_INPUT (JSON string)
 *   PostToolUse: TOOL_NAME, TOOL_INPUT, TOOL_RESULT
 */
import type { ToolHook } from './ToolHook';

// ---------------------------------------------------------------------------
// Pattern matching helper (for inline node one-liners)
// ---------------------------------------------------------------------------

/**
 * Convert a glob pattern to a regex source string suitable for embedding in a
 * generated Node.js one-liner (e.g. /^Bash.*$/).
 */
function globToRegexSource(pattern: string): string {
	return pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
}

interface ClaudeHookEntry {
	matcher: string;
	hooks: Array<{ type: 'command'; command: string }>;
}

interface ClaudeHooksSettings {
	hooks: {
		PreToolUse?: ClaudeHookEntry[];
		PostToolUse?: ClaudeHookEntry[];
	};
}

export class ClaudeHookTranslator {
	/**
	 * Convert a ToolHook array to a Claude hook settings object.
	 * Returns null when there are no hooks (caller should skip writing the settings file).
	 */
	static toSettingsJson(hooks: ToolHook[]): ClaudeHooksSettings | null {
		if (hooks.length === 0) return null;

		const preToolUseEntries: ClaudeHookEntry[] = [];
		const postToolUseEntries: ClaudeHookEntry[] = [];

		for (const hook of hooks) {
			if (hook.action.type === 'log') {
				if (hook.timing === 'before') {
					preToolUseEntries.push({
						matcher: '*',
						hooks: [
							{
								type: 'command',
								// Log tool name and input to stderr (TOOL_NAME, TOOL_INPUT are set by Claude)
								command: `node -e "process.stderr.write('[tool-use] '+process.env.TOOL_NAME+' '+process.env.TOOL_INPUT+'\\n')"`,
							},
						],
					});
				} else {
					postToolUseEntries.push({
						matcher: '*',
						hooks: [
							{
								type: 'command',
								// Log tool name and result to stderr (TOOL_RESULT is set by Claude in PostToolUse)
								command: `node -e "process.stderr.write('[tool-result] '+process.env.TOOL_NAME+' '+process.env.TOOL_RESULT+'\\n')"`,
							},
						],
					});
				}
			} else if (hook.action.type === 'deny') {
				if (hook.timing === 'before') {
					const { reason, toolPattern, argsContains } = hook.action;
					if (argsContains !== undefined) {
						// Args-based check: matcher='*', inspect CLAUDE_TOOL_INPUT in the command.
						// Exit code 2 signals Claude to block the tool call.
						const argsStr = argsContains.toLowerCase();
						// Single quotes are used inside the condition so they nest safely within the
						// outer double-quoted node -e "..." shell command without escaping.
						let condition = `i.toLowerCase().includes('${argsStr}')`;
						if (toolPattern !== undefined) {
							// AND the tool name check (glob → regex)
							const regexSource = globToRegexSource(toolPattern);
							condition += `&&process.env.CLAUDE_TOOL_NAME&&/^${regexSource}$/.test(process.env.CLAUDE_TOOL_NAME)`;
						}
						preToolUseEntries.push({
							matcher: '*',
							hooks: [
								{
									type: 'command',
									command: `node -e "const i=process.env.CLAUDE_TOOL_INPUT||'{}'; if(${condition}){process.stderr.write('Tool denied: ${reason}\\n');process.exit(2)}"`,
								},
							],
						});
					} else {
						// toolPattern only (original behavior): use as Claude matcher.
						// Claude pre-filters by tool name; command unconditionally exits 2.
						const matcher = toolPattern ?? '*';
						preToolUseEntries.push({
							matcher,
							hooks: [
								{
									type: 'command',
									command: `node -e "process.stderr.write('Tool denied: ${reason}\\n');process.exit(2)"`,
								},
							],
						});
					}
				}
				// deny timing='after' is not meaningful — tool already executed
			}
		}

		if (preToolUseEntries.length === 0 && postToolUseEntries.length === 0) return null;

		const settingsHooks: ClaudeHooksSettings['hooks'] = {};
		if (preToolUseEntries.length > 0) settingsHooks['PreToolUse'] = preToolUseEntries;
		if (postToolUseEntries.length > 0) settingsHooks['PostToolUse'] = postToolUseEntries;

		return { hooks: settingsHooks };
	}
}
