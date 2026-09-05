/**
 * OpenCodeHookTranslator -- converts ToolHook[] into an OpenCode ESM plugin JS string.
 *
 * The generated file is written to a temp dir and referenced via plugin: ["<path>"] in the
 * OpenCode config. No package.json is created -- that would trigger a background npm install.
 */
import type { ToolHook } from './ToolHook';

// ---------------------------------------------------------------------------
// Pattern matching helper (inlined into generated code)
// ---------------------------------------------------------------------------

/**
 * Build a JS boolean expression (for use inside the generated plugin) that checks whether
 * a given tool name expression matches a glob/exact pattern.
 *
 * Supported patterns:
 * - "*"         -- matches any tool
 * - "exact"     -- matches only that exact tool name
 * - "prefix*"   -- matches tool names starting with "prefix"
 * - "*suffix"   -- matches tool names ending with "suffix"
 * - "pre*suf"   -- matches tool names matching the glob
 */
function buildMatchExpression(toolExpression: string, pattern: string): string {
	if (pattern === '*') {
		return 'true';
	}
	if (!pattern.includes('*')) {
		return `${toolExpression} === ${JSON.stringify(pattern)}`;
	}
	// Convert glob to regex: escape regex special chars except *, then convert * to .*
	const regexSource = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
	return `new RegExp(${JSON.stringify(`^${regexSource}$`)}).test(${toolExpression})`;
}

// ---------------------------------------------------------------------------
// Translator
// ---------------------------------------------------------------------------

export class OpenCodeHookTranslator {
	/**
	 * Generate an ESM plugin JS string for OpenCode from a ToolHook array.
	 * Returns a valid plugin module that can be written to a .js file and referenced
	 * via the OpenCode config's `plugin` field.
	 */
	static toPluginJs(hooks: ToolHook[]): string {
		const beforeLines: string[] = [];
		const afterLines: string[] = [];

		for (const hook of hooks) {
			if (hook.action.type === 'log') {
				if (hook.timing === 'before') {
					beforeLines.push(`console.log('[tool-use]', input.tool, JSON.stringify(output.args));`);
				} else {
					afterLines.push(`console.log('[tool-result]', input.tool, output.output);`);
				}
			} else if (hook.action.type === 'deny') {
				if (hook.timing === 'before') {
					const { reason, toolPattern, argsContains } = hook.action;
					const errorMessage = `Tool denied: ${reason}`;
					let condition: string;
					if (argsContains !== undefined && toolPattern !== undefined) {
						// Both conditions must match (AND logic)
						const toolCondition = buildMatchExpression('input.tool', toolPattern);
						const argsCondition = `JSON.stringify(output.args ?? {}).toLowerCase().includes(${JSON.stringify(argsContains.toLowerCase())})`;
						condition = `${toolCondition} && ${argsCondition}`;
					} else if (argsContains !== undefined) {
						// Args check only -- any tool whose args JSON contains the string
						condition = `JSON.stringify(output.args ?? {}).toLowerCase().includes(${JSON.stringify(argsContains.toLowerCase())})`;
					} else if (toolPattern !== undefined) {
						// Tool name check only (original behavior)
						condition = buildMatchExpression('input.tool', toolPattern);
					} else {
						// Neither set -- matches all tools
						condition = 'true';
					}
					beforeLines.push(`if (${condition}) throw new Error(${JSON.stringify(errorMessage)});`);
				}
				// deny timing='after' is not meaningful -- tool already executed
			}
		}

		const beforeBody = beforeLines.join(' ');
		const afterBody = afterLines.join(' ');

		return `export const Plugin = async (ctx) => ({
  "tool.execute.before": async (input, output) => { ${beforeBody} },
  "tool.execute.after":  async (input, output) => { ${afterBody} }
});
`;
	}
}
