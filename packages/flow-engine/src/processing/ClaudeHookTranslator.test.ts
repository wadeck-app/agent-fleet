/**
 * ClaudeHookTranslator Tests
 *
 * Verifies that toSettingsJson() generates correct Claude hook settings JSON.
 * For commands that execute node one-liners, we also run them via spawnSync
 * to verify actual exit code and stderr output behavior.
 */
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { ClaudeHookTranslator } from './ClaudeHookTranslator';
import type { ToolHook } from './ToolHook';

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

interface HookEntry {
	matcher: string;
	hooks: Array<{ type: string; command: string }>;
}

interface ClaudeSettings {
	hooks: {
		PreToolUse?: HookEntry[];
		PostToolUse?: HookEntry[];
	};
}

/**
 * Extract the node -e expression from a command of the form:
 *   node -e "EXPRESSION"
 * Throws if the command does not match expected format.
 */
function extractNodeExpression(command: string): string {
	const prefix = 'node -e "';
	const suffix = '"';
	if (!command.startsWith(prefix) || !command.endsWith(suffix)) {
		throw new Error(`Unexpected command format (expected node -e "EXPR"): ${command}`);
	}
	return command.slice(prefix.length, -suffix.length);
}

/**
 * Run a node -e expression with optional env vars and return the result.
 * Uses spawnSync for synchronous test execution.
 */
function runNodeExpression(
	expression: string,
	env: Record<string, string> = {}
): {
	stdout: string;
	stderr: string;
	status: number | null;
} {
	const result = spawnSync(process.execPath, ['-e', expression], {
		env: { ...process.env, ...env },
		encoding: 'utf8',
	});
	return {
		stdout: result.stdout as string,
		stderr: result.stderr as string,
		status: result.status,
	};
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClaudeHookTranslator', () => {
	it('returns null when no hooks', () => {
		expect(ClaudeHookTranslator.toSettingsJson([])).toBeNull();
	});

	it('generates PreToolUse log command with matcher *', () => {
		const hooks: ToolHook[] = [{ timing: 'before', action: { type: 'log' } }];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;

		expect(settings).not.toBeNull();
		expect(settings.hooks.PreToolUse).toBeDefined();
		expect(settings.hooks.PostToolUse).toBeUndefined();

		const entry = settings.hooks.PreToolUse![0];
		expect(entry.matcher).toBe('*');
		expect(entry.hooks[0].type).toBe('command');
		expect(entry.hooks[0].command).toContain('tool-use');
	});

	it('generates PostToolUse log command with matcher *', () => {
		const hooks: ToolHook[] = [{ timing: 'after', action: { type: 'log' } }];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;

		expect(settings.hooks.PostToolUse).toBeDefined();
		expect(settings.hooks.PreToolUse).toBeUndefined();

		const entry = settings.hooks.PostToolUse![0];
		expect(entry.matcher).toBe('*');
		expect(entry.hooks[0].command).toContain('tool-result');
	});

	it('generates PreToolUse deny command with toolPattern as matcher', () => {
		const hooks: ToolHook[] = [{ timing: 'before', action: { type: 'deny', reason: 'no rm', toolPattern: 'rm' } }];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;

		expect(settings.hooks.PreToolUse).toBeDefined();
		const entry = settings.hooks.PreToolUse![0];
		// toolPattern becomes the Claude matcher — Claude handles tool filtering
		expect(entry.matcher).toBe('rm');
		expect(entry.hooks[0].command).toContain('process.exit(2)');
		expect(entry.hooks[0].command).toContain('Tool denied: no rm');
	});

	it('deny command exits with code 2 when run', () => {
		const hooks: ToolHook[] = [{ timing: 'before', action: { type: 'deny', reason: 'blocked', toolPattern: '*' } }];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;
		const command = settings.hooks.PreToolUse![0].hooks[0].command;
		const expression = extractNodeExpression(command);

		const result = runNodeExpression(expression);
		expect(result.status).toBe(2);
		expect(result.stderr).toContain('Tool denied: blocked');
	});

	it('log PreToolUse command outputs tool name and input to stderr', () => {
		const hooks: ToolHook[] = [{ timing: 'before', action: { type: 'log' } }];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;
		const command = settings.hooks.PreToolUse![0].hooks[0].command;
		const expression = extractNodeExpression(command);

		const result = runNodeExpression(expression, {
			TOOL_NAME: 'Bash',
			TOOL_INPUT: '{"command":"ls"}',
		});
		expect(result.status).toBe(0);
		expect(result.stderr).toContain('[tool-use]');
		expect(result.stderr).toContain('Bash');
		expect(result.stderr).toContain('{"command":"ls"}');
	});

	it('log PostToolUse command outputs tool name and result to stderr', () => {
		const hooks: ToolHook[] = [{ timing: 'after', action: { type: 'log' } }];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;
		const command = settings.hooks.PostToolUse![0].hooks[0].command;
		const expression = extractNodeExpression(command);

		const result = runNodeExpression(expression, {
			TOOL_NAME: 'Read',
			TOOL_RESULT: 'file content here',
		});
		expect(result.status).toBe(0);
		expect(result.stderr).toContain('[tool-result]');
		expect(result.stderr).toContain('Read');
		expect(result.stderr).toContain('file content here');
	});

	it('combines log + deny hooks correctly — both appear in PreToolUse', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'log' } },
			{ timing: 'before', action: { type: 'deny', reason: 'forbidden', toolPattern: 'rm' } },
		];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;

		expect(settings.hooks.PreToolUse).toHaveLength(2);

		const logEntry = settings.hooks.PreToolUse!.find(e => e.matcher === '*');
		const denyEntry = settings.hooks.PreToolUse!.find(e => e.matcher === 'rm');
		expect(logEntry).toBeDefined();
		expect(denyEntry).toBeDefined();
		expect(logEntry!.hooks[0].command).toContain('tool-use');
		expect(denyEntry!.hooks[0].command).toContain('process.exit(2)');
	});

	it('returns null when only deny hook has timing=after (not meaningful)', () => {
		const hooks: ToolHook[] = [{ timing: 'after', action: { type: 'deny', reason: 'ignored', toolPattern: '*' } }];
		expect(ClaudeHookTranslator.toSettingsJson(hooks)).toBeNull();
	});

	// ---------------------------------------------------------------------------
	// argsContains tests
	// ---------------------------------------------------------------------------

	it('argsContains only: matcher is *, command checks CLAUDE_TOOL_INPUT', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'regedit forbidden', argsContains: 'regedit' } },
		];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;

		expect(settings.hooks.PreToolUse).toBeDefined();
		const entry = settings.hooks.PreToolUse![0];
		// matcher must be '*' — Claude fires the command for every tool
		expect(entry.matcher).toBe('*');
		const command = entry.hooks[0].command;
		// Command must check CLAUDE_TOOL_INPUT (not just exit 2 unconditionally)
		expect(command).toContain('CLAUDE_TOOL_INPUT');
		// Single quotes used inside the double-quoted node -e "..." command — no escaping needed
		expect(command).toContain("'regedit'");
		expect(command).toContain('process.exit(2)');
		expect(command).toContain('Tool denied: regedit forbidden');
	});

	it('argsContains only: command exits 2 when CLAUDE_TOOL_INPUT contains the string', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'regedit forbidden', argsContains: 'regedit' } },
		];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;
		const command = settings.hooks.PreToolUse![0].hooks[0].command;
		const expression = extractNodeExpression(command);

		// Args contain 'regedit' → should exit 2
		const blocked = runNodeExpression(expression, { CLAUDE_TOOL_INPUT: '{"command":"regedit /v key"}' });
		expect(blocked.status).toBe(2);
		expect(blocked.stderr).toContain('Tool denied: regedit forbidden');

		// Args do NOT contain 'regedit' → should exit 0
		const allowed = runNodeExpression(expression, { CLAUDE_TOOL_INPUT: '{"command":"ls -la"}' });
		expect(allowed.status).toBe(0);
	});

	it('argsContains only: case-insensitive — CLAUDE_TOOL_INPUT with uppercase triggers denial', () => {
		const hooks: ToolHook[] = [
			{ timing: 'before', action: { type: 'deny', reason: 'regedit forbidden', argsContains: 'regedit' } },
		];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;
		const command = settings.hooks.PreToolUse![0].hooks[0].command;
		const expression = extractNodeExpression(command);

		// 'REGEDIT' (uppercase) in input must still trigger denial
		const result = runNodeExpression(expression, { CLAUDE_TOOL_INPUT: '{"command":"REGEDIT /v key"}' });
		expect(result.status).toBe(2);
		expect(result.stderr).toContain('Tool denied: regedit forbidden');
	});

	it('argsContains + toolPattern: matcher is *, command checks both args and tool name', () => {
		const hooks: ToolHook[] = [
			{
				timing: 'before',
				action: { type: 'deny', reason: 'regedit via bash', argsContains: 'regedit', toolPattern: 'Bash' },
			},
		];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;

		const entry = settings.hooks.PreToolUse![0];
		expect(entry.matcher).toBe('*');
		const command = entry.hooks[0].command;
		// Command must reference both CLAUDE_TOOL_INPUT and CLAUDE_TOOL_NAME
		expect(command).toContain('CLAUDE_TOOL_INPUT');
		expect(command).toContain('CLAUDE_TOOL_NAME');
		// Single quotes used inside the double-quoted node -e "..." command
		expect(command).toContain("'regedit'");
		expect(command).toContain('Bash');
	});

	it('argsContains + toolPattern: command exits 2 only when BOTH match', () => {
		const hooks: ToolHook[] = [
			{
				timing: 'before',
				action: { type: 'deny', reason: 'regedit via bash', argsContains: 'regedit', toolPattern: 'Bash' },
			},
		];
		const settings = ClaudeHookTranslator.toSettingsJson(hooks) as ClaudeSettings;
		const command = settings.hooks.PreToolUse![0].hooks[0].command;
		const expression = extractNodeExpression(command);

		// Both match → denied
		const bothMatch = runNodeExpression(expression, {
			CLAUDE_TOOL_INPUT: '{"command":"regedit /v key"}',
			CLAUDE_TOOL_NAME: 'Bash',
		});
		expect(bothMatch.status).toBe(2);

		// Args match but wrong tool → allowed
		const wrongTool = runNodeExpression(expression, {
			CLAUDE_TOOL_INPUT: '{"command":"regedit /v key"}',
			CLAUDE_TOOL_NAME: 'Write',
		});
		expect(wrongTool.status).toBe(0);

		// Right tool but args don't match → allowed
		const noArgs = runNodeExpression(expression, {
			CLAUDE_TOOL_INPUT: '{"command":"ls -la"}',
			CLAUDE_TOOL_NAME: 'Bash',
		});
		expect(noArgs.status).toBe(0);
	});
});
