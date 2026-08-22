/**
 * OpenCodeHookTranslator Tests
 *
 * Verifies that toPluginJs() generates correct ESM plugin JS for each hook combination.
 * For behavioral tests (deny matching), we extract the handler body and evaluate it
 * with new Function() to test actual execution semantics.
 */
import { describe, expect, it } from 'vitest';

import { OpenCodeHookTranslator } from './OpenCodeHookTranslator';
import type { ToolHook } from './ToolHook';

// ---------------------------------------------------------------------------
// Helper: extract the before-handler body from generated plugin JS
// ---------------------------------------------------------------------------

function extractBeforeBody(js: string): string {
	const match = js.match(/"tool\.execute\.before": async \(input, output\) => \{ (.*?) \},/s);
	if (!match) throw new Error(`Cannot extract before body from:\n${js}`);
	return match[1];
}

function extractAfterBody(js: string): string {
	const match = js.match(/"tool\.execute\.after": {2}async \(input, output\) => \{ (.*?) \}\s*\}\)/s);
	if (!match) throw new Error(`Cannot extract after body from:\n${js}`);
	return match[1];
}

/**
 * Evaluate a handler body with given input/output objects.
 * Returns undefined on success, re-throws on Error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function runHandlerBody(body: string, input: Record<string, unknown>, output: Record<string, unknown>): void {
	// new Function creates a function in the global scope — safe for unit test evaluation
	// eslint-disable-next-line no-new-func
	const fn = new Function('input', 'output', body);
	fn(input, output);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenCodeHookTranslator', () => {
	it('generates a valid plugin module structure when no hooks', () => {
		const js = OpenCodeHookTranslator.toPluginJs([]);

		expect(js).toContain('export const Plugin = async (ctx) => ({');
		expect(js).toContain('"tool.execute.before"');
		expect(js).toContain('"tool.execute.after"');
		// Both handler bodies should be empty
		expect(extractBeforeBody(js)).toBe('');
		expect(extractAfterBody(js)).toBe('');
	});

	it('generates log hook that logs tool name and args in the before handler', () => {
		const hooks: ToolHook[] = [{ timing: 'before', action: { type: 'log' } }];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);

		const beforeBody = extractBeforeBody(js);
		expect(beforeBody).toContain("console.log('[tool-use]', input.tool, JSON.stringify(output.args))");
		// After handler should remain empty
		expect(extractAfterBody(js)).toBe('');
	});

	it('generates log hook that logs tool name and output in the after handler', () => {
		const hooks: ToolHook[] = [{ timing: 'after', action: { type: 'log' } }];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);

		const afterBody = extractAfterBody(js);
		expect(afterBody).toContain("console.log('[tool-result]', input.tool, output.output)");
		// Before handler should remain empty
		expect(extractBeforeBody(js)).toBe('');
	});

	it('generates deny hook that throws when tool exactly matches pattern', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'not allowed', toolPattern: 'rm' } },
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		// Static content check
		expect(beforeBody).toContain('throw new Error');
		expect(beforeBody).toContain('Tool denied: not allowed');
		// Condition should use exact equality for a pattern without wildcards
		expect(beforeBody).toContain('input.tool === "rm"');

		// Behavioral check: actually run the generated handler
		expect(() => runHandlerBody(beforeBody, { tool: 'rm' }, {})).toThrow('Tool denied: not allowed');
	});

	it('deny hook does not throw for a non-matching tool name', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'not allowed', toolPattern: 'rm' } },
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		// 'ls' should not trigger the deny
		expect(() => runHandlerBody(beforeBody, { tool: 'ls' }, {})).not.toThrow();
	});

	it('deny hook with wildcard pattern matches any tool', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'all blocked', toolPattern: '*' } },
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		// The condition for '*' should be the literal 'true'
		expect(beforeBody).toContain('if (true)');

		expect(() => runHandlerBody(beforeBody, { tool: 'any_tool' }, {})).toThrow('Tool denied: all blocked');
	});

	it('deny hook with glob pattern uses regex and matches correctly', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'no bash', toolPattern: 'Bash*' } },
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		// Should use RegExp for glob patterns
		expect(beforeBody).toContain('new RegExp');

		expect(() => runHandlerBody(beforeBody, { tool: 'Bash' }, {})).toThrow('Tool denied: no bash');
		expect(() => runHandlerBody(beforeBody, { tool: 'BashAdvanced' }, {})).toThrow('Tool denied: no bash');
		expect(() => runHandlerBody(beforeBody, { tool: 'Write' }, {})).not.toThrow();
	});

	it('combines log + deny hooks correctly in the before handler', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'log' } },
			{ timing: 'before', action: { type: 'deny', reason: 'forbidden', toolPattern: 'rm' } },
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		expect(beforeBody).toContain("console.log('[tool-use]'");
		expect(beforeBody).toContain('throw new Error');
		expect(beforeBody).toContain('Tool denied: forbidden');
	});

	it('ignores deny hooks with timing=after (not meaningful)', () => {
		const hooks: ToolHook[] = [{ timing: 'after', action: { type: 'deny', reason: 'ignored', toolPattern: '*' } }];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);

		// Neither handler should contain throw
		expect(extractBeforeBody(js)).toBe('');
		expect(extractAfterBody(js)).not.toContain('throw');
	});

	// ---------------------------------------------------------------------------
	// argsContains tests
	// ---------------------------------------------------------------------------

	it('argsContains only: deny fires when args JSON contains the string (case-insensitive)', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'regedit forbidden', argsContains: 'regedit' } },
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		// Static content check — no tool equality check, only args check
		expect(beforeBody).toContain('JSON.stringify(output.args ?? {}).toLowerCase().includes("regedit")');
		expect(beforeBody).not.toContain('input.tool ===');

		// Behavioral: args contain the string → denied
		expect(() => runHandlerBody(beforeBody, {}, { args: { command: 'regedit /v key' } })).toThrow(
			'Tool denied: regedit forbidden'
		);
		// Behavioral: args do not contain the string → allowed
		expect(() => runHandlerBody(beforeBody, {}, { args: { command: 'ls -la' } })).not.toThrow();
	});

	it('argsContains only: case-insensitive — uppercase in args still triggers denial', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'regedit forbidden', argsContains: 'regedit' } },
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		// 'REGEDIT' in args must still trigger the deny (case-insensitive)
		expect(() => runHandlerBody(beforeBody, {}, { args: { command: 'REGEDIT /v key' } })).toThrow(
			'Tool denied: regedit forbidden'
		);
	});

	it('argsContains + toolPattern: deny fires only when BOTH match', () => {
		const hooks: ToolHook[] = [
			{
				timing: 'before',
				action: { type: 'deny', reason: 'regedit via bash only', toolPattern: 'Bash', argsContains: 'regedit' },
			},
		];
		const js = OpenCodeHookTranslator.toPluginJs(hooks);
		const beforeBody = extractBeforeBody(js);

		// Both conditions must appear in the generated code
		expect(beforeBody).toContain('JSON.stringify(output.args ?? {}).toLowerCase().includes("regedit")');
		expect(beforeBody).toContain('input.tool === "Bash"');

		// Behavioral: tool matches AND args contain → denied
		expect(() => runHandlerBody(beforeBody, { tool: 'Bash' }, { args: { command: 'regedit /v key' } })).toThrow(
			'Tool denied: regedit via bash only'
		);
		// Behavioral: tool matches but args do NOT contain → allowed
		expect(() => runHandlerBody(beforeBody, { tool: 'Bash' }, { args: { command: 'ls -la' } })).not.toThrow();
		// Behavioral: args contain but tool does NOT match → allowed
		expect(() =>
			runHandlerBody(beforeBody, { tool: 'Write' }, { args: { command: 'regedit /v key' } })
		).not.toThrow();
	});
});
