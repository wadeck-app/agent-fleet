import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	DEFAULT_COMPACT_HOOK_TIMEOUT_SECONDS,
	buildCompactHookEnv,
	extractCompactEvent,
	runCompactHook,
	validateOnCompact,
} from './CompactHook';

describe('validateOnCompact', () => {
	it('accepts a command on provider claude, with or without a timeout', () => {
		expect(() => validateOnCompact({ onCompact: { command: 'echo hi' }, provider: 'claude' })).not.toThrow();
		expect(() =>
			validateOnCompact({ onCompact: { command: 'echo hi', timeout: 10 }, provider: 'claude' })
		).not.toThrow();
	});

	it('rejects a non-claude provider, naming it', () => {
		expect(() => validateOnCompact({ onCompact: { command: 'echo hi' }, provider: 'opencode' })).toThrow(
			/opencode/
		);
	});

	it('rejects a blank command', () => {
		expect(() => validateOnCompact({ onCompact: { command: '   ' }, provider: 'claude' })).toThrow(/command/);
	});

	it('rejects a timeout that is not a positive integer, naming the unit', () => {
		expect(() => validateOnCompact({ onCompact: { command: 'echo hi', timeout: 0 }, provider: 'claude' })).toThrow(
			/seconds/
		);
		expect(() =>
			validateOnCompact({ onCompact: { command: 'echo hi', timeout: 1.5 }, provider: 'claude' })
		).toThrow(/seconds/);
	});
});

describe('extractCompactEvent', () => {
	it('maps compact_boundary to a success event', () => {
		expect(
			extractCompactEvent({
				type: 'system',
				subtype: 'compact_boundary',
				data: {
					compact_metadata: { trigger: 'auto', pre_tokens: 90957, post_tokens: 1055, duration_ms: 1200 },
				},
			})
		).toEqual({ event: 'success', trigger: 'auto', preTokens: 90957, postTokens: 1055, durationMs: 1200 });
	});

	it('maps compact_result "failed" to a failed event carrying the error', () => {
		expect(
			extractCompactEvent({
				type: 'system',
				subtype: 'init',
				data: { compact_result: 'failed', compact_error: 'too_few_groups' },
			})
		).toEqual({ event: 'failed', error: 'too_few_groups' });
	});

	it('maps a result flagged rapid_refill_breaker to a thrashing event', () => {
		expect(
			extractCompactEvent({
				type: 'result',
				subtype: 'result',
				data: { is_error: true, terminal_reason: 'rapid_refill_breaker' },
			})
		).toEqual({ event: 'thrashing' });
	});

	it('returns undefined for anything else', () => {
		expect(
			extractCompactEvent({ type: 'system', subtype: 'init', data: { model: 'x', tools: [] } })
		).toBeUndefined();
		expect(extractCompactEvent({ type: 'result', subtype: 'result', data: { result: 'ok' } })).toBeUndefined();
	});
});

describe('buildCompactHookEnv', () => {
	it('exposes the event as FLOW_COMPACT_* variables and never the summary', () => {
		const env = buildCompactHookEnv({
			event: 'success',
			trigger: 'auto',
			preTokens: 90957,
			postTokens: 1055,
			durationMs: 1200,
		});
		expect(env).toEqual({
			FLOW_COMPACT_EVENT: 'success',
			FLOW_COMPACT_TRIGGER: 'auto',
			FLOW_COMPACT_PRE_TOKENS: '90957',
			FLOW_COMPACT_POST_TOKENS: '1055',
		});
	});

	it('sets FLOW_COMPACT_ERROR for a failed event', () => {
		expect(buildCompactHookEnv({ event: 'failed', error: 'too_few_groups' })).toEqual({
			FLOW_COMPACT_EVENT: 'failed',
			FLOW_COMPACT_ERROR: 'too_few_groups',
		});
	});
});

describe('runCompactHook', () => {
	let dir: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'compact-hook-'));
	});
	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
	});

	function script(body: string): string {
		const file = join(dir, 'hook.cjs');
		writeFileSync(file, body);
		return `node "${file}"`;
	}

	it('passes the event as JSON on stdin, plus the FLOW_COMPACT_* env, in the given cwd', async () => {
		const out = join(dir, 'out.json');
		const command = script(
			`let s='';process.stdin.on('data',d=>s+=d).on('end',()=>require('fs').writeFileSync(${JSON.stringify(out)},JSON.stringify({stdin:JSON.parse(s),env:process.env.FLOW_COMPACT_EVENT,cwd:process.cwd()})));`
		);
		const warn = vi.fn();

		await runCompactHook({
			command,
			timeoutMs: 10_000,
			cwd: dir,
			env: process.env as Record<string, string>,
			event: { event: 'success', trigger: 'auto', preTokens: 5, postTokens: 1, durationMs: 9 },
			context: { stepId: 'gen', taskId: 'task-1' },
			onWarning: warn,
		});

		const seen = JSON.parse(readFileSync(out, 'utf8'));
		expect(seen.stdin).toMatchObject({
			event: 'success',
			trigger: 'auto',
			pre_tokens: 5,
			post_tokens: 1,
			duration_ms: 9,
			stepId: 'gen',
			taskId: 'task-1',
		});
		expect(seen.env).toBe('success');
		expect(seen.cwd.toLowerCase()).toBe(dir.toLowerCase());
		expect(warn).not.toHaveBeenCalled();
	});

	it('warns with the stderr on a non-zero exit and never throws', async () => {
		const warn = vi.fn();
		const command = script(`console.error('boom detail');process.exit(3);`);

		await expect(
			runCompactHook({
				command,
				timeoutMs: 10_000,
				cwd: dir,
				env: process.env as Record<string, string>,
				event: { event: 'failed', error: 'x' },
				context: { stepId: 'gen', taskId: 't' },
				onWarning: warn,
			})
		).resolves.toBeUndefined();

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]![0]).toContain('exited with code 3');
		expect(warn.mock.calls[0]![0]).toContain('boom detail');
	});

	it('kills the command and warns when it exceeds the timeout', async () => {
		const warn = vi.fn();
		const command = script(`setTimeout(()=>{},60000);`);

		const started = Date.now();
		await runCompactHook({
			command,
			timeoutMs: 300,
			cwd: dir,
			env: process.env as Record<string, string>,
			event: { event: 'success', trigger: 'auto' },
			context: { stepId: 'gen', taskId: 't' },
			onWarning: warn,
		});

		expect(Date.now() - started).toBeLessThan(15_000);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]![0]).toMatch(/timed out/i);
	});

	it('exports a default timeout of 30 seconds', () => {
		expect(DEFAULT_COMPACT_HOOK_TIMEOUT_SECONDS).toBe(30);
	});
});
