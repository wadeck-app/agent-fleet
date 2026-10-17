/**
 * Runs the generated hook script with real `node` and feeds it payloads shaped like the ones real
 * codex-cli 0.163.0 sends (captured: hook_event_name, tool_name Bash / apply_patch /
 * mcp__<server>__<tool>, tool_input, tool_response).
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CodexHookTranslator } from './CodexHookTranslator';
import type { ToolHook } from './ToolHook';

let dir: string;
let logFile: string;

beforeAll(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hook-test-'));
	logFile = path.join(dir, 'hook.log');
});

afterAll(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

interface HookRun {
	stdout: string;
	status: number | null;
}

function runScript(hooks: ToolHook[], phase: 'pre' | 'post', stdin: string): HookRun {
	const { source } = CodexHookTranslator.toScript(hooks, logFile);
	if (source === undefined) throw new Error('expected a script');
	const scriptPath = path.join(dir, `hook-${Math.random().toString(16).slice(2)}.cjs`);
	fs.writeFileSync(scriptPath, source);
	const result = spawnSync(process.execPath, [scriptPath, phase], { input: stdin, encoding: 'utf8' });
	return { stdout: result.stdout, status: result.status };
}

const payload = (toolName: string, toolInput: unknown, extra: Record<string, unknown> = {}): string =>
	JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: toolName, tool_input: toolInput, ...extra });

function decision(run: HookRun): { permissionDecision: string; permissionDecisionReason: string } | undefined {
	if (run.stdout.trim() === '') return undefined;
	return (
		JSON.parse(run.stdout) as {
			hookSpecificOutput: { permissionDecision: string; permissionDecisionReason: string };
		}
	).hookSpecificOutput;
}

describe('CodexHookTranslator', () => {
	describe('toScript', () => {
		it('produces nothing for no hooks', () => {
			expect(CodexHookTranslator.toScript([], logFile)).toEqual({
				source: undefined,
				hasBefore: false,
				hasAfter: false,
				warnings: [],
			});
		});

		it('reports which phases need registering', () => {
			const result = CodexHookTranslator.toScript(
				[
					{ timing: 'before', action: { type: 'log' } },
					{ timing: 'after', action: { type: 'log' } },
				],
				logFile
			);

			expect(result).toMatchObject({ hasBefore: true, hasAfter: true });
		});

		it("drops a deny hook with timing 'after' and says so", () => {
			const result = CodexHookTranslator.toScript(
				[{ timing: 'after', action: { type: 'deny', reason: 'x' } }],
				logFile
			);

			expect(result.source).toBeUndefined();
			expect(result.warnings).toEqual([expect.stringContaining("timing 'after' was ignored")]);
		});
	});

	describe('generated script', () => {
		it('denies with the reason in the format codex reads', () => {
			const run = runScript(
				[{ timing: 'before', action: { type: 'deny', reason: 'no shell' } }],
				'pre',
				payload('Bash', { command: 'ls' })
			);

			expect(run.status).toBe(0);
			expect(decision(run)).toMatchObject({
				permissionDecision: 'deny',
				permissionDecisionReason: 'Tool denied: no shell',
			});
			expect(JSON.parse(run.stdout).hookSpecificOutput.hookEventName).toBe('PreToolUse');
		});

		it.each([
			['bash', 'Bash'],
			['Bash', 'Bash'],
			['BASH', 'Bash'],
			['mcp__echo__*', 'mcp__echo__echo_tool'],
			['*', 'apply_patch'],
			['write', 'apply_patch'],
			['edit', 'apply_patch'],
			['apply_patch', 'apply_patch'],
		])('toolPattern %s matches codex tool %s', (pattern, toolName) => {
			const run = runScript(
				[{ timing: 'before', action: { type: 'deny', reason: 'r', toolPattern: pattern } }],
				'pre',
				payload(toolName, {})
			);

			expect(decision(run)?.permissionDecision).toBe('deny');
		});

		it.each([
			['write', 'Bash'],
			['bash', 'apply_patch'],
			['mcp__other__*', 'mcp__echo__echo_tool'],
			// a glob must not be treated as a regex, and a dot is a dot
			['a.c', 'abc'],
		])('toolPattern %s does not match codex tool %s', (pattern, toolName) => {
			const run = runScript(
				[{ timing: 'before', action: { type: 'deny', reason: 'r', toolPattern: pattern } }],
				'pre',
				payload(toolName, {})
			);

			expect(decision(run)).toBeUndefined();
		});

		it('argsContains is case-insensitive over the serialized tool input', () => {
			const hooks: ToolHook[] = [
				{ timing: 'before', action: { type: 'deny', reason: 'r', argsContains: 'RM -RF' } },
			];

			expect(
				decision(runScript(hooks, 'pre', payload('Bash', { command: 'rm -rf /tmp/x' })))?.permissionDecision
			).toBe('deny');
			expect(decision(runScript(hooks, 'pre', payload('Bash', { command: 'ls' })))).toBeUndefined();
		});

		it('requires both toolPattern and argsContains when both are given', () => {
			const hooks: ToolHook[] = [
				{
					timing: 'before',
					action: { type: 'deny', reason: 'r', toolPattern: 'bash', argsContains: 'secret' },
				},
			];

			expect(
				decision(runScript(hooks, 'pre', payload('Bash', { command: 'cat secret' })))?.permissionDecision
			).toBe('deny');
			expect(decision(runScript(hooks, 'pre', payload('Bash', { command: 'ls' })))).toBeUndefined();
			expect(decision(runScript(hooks, 'pre', payload('apply_patch', { command: 'secret' })))).toBeUndefined();
		});

		it('a deny with neither condition denies everything', () => {
			expect(
				decision(
					runScript([{ timing: 'before', action: { type: 'deny', reason: 'r' } }], 'pre', payload('Bash', {}))
				)?.permissionDecision
			).toBe('deny');
		});

		it('fails closed when it cannot read the payload and a deny rule exists', () => {
			const run = runScript(
				[{ timing: 'before', action: { type: 'deny', reason: 'r', toolPattern: 'bash' } }],
				'pre',
				'not json'
			);

			expect(decision(run)?.permissionDecision).toBe('deny');
			expect(decision(run)?.permissionDecisionReason).toContain('failing closed');
		});

		it('does not deny on a payload error when there is no deny rule', () => {
			expect(
				decision(runScript([{ timing: 'before', action: { type: 'log' } }], 'pre', 'not json'))
			).toBeUndefined();
		});

		it('logs the tool call before, and the result after, to the log file', () => {
			const hooks: ToolHook[] = [
				{ timing: 'before', action: { type: 'log' } },
				{ timing: 'after', action: { type: 'log' } },
			];
			runScript(hooks, 'pre', payload('Bash', { command: 'ls' }));
			runScript(hooks, 'post', payload('Bash', { command: 'ls' }, { tool_response: 'file.txt\r\n' }));

			const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
			expect(lines.slice(-2)).toEqual(['[tool-use] Bash {"command":"ls"}', '[tool-result] Bash file.txt']);
		});

		it('only runs the rules of the phase it was started for', () => {
			const hooks: ToolHook[] = [
				{ timing: 'before', action: { type: 'deny', reason: 'r' } },
				{ timing: 'after', action: { type: 'log' } },
			];

			expect(decision(runScript(hooks, 'post', payload('Bash', {})))).toBeUndefined();
		});
	});
});
