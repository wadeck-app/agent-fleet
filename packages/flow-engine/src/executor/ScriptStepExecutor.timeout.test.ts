/**
 * `timeout:` (seconds) on script steps: handed to the executor in milliseconds, and a timeout is a plain
 * step failure whose message says the limit and that the process tree was killed.
 */
import { describe, expect, it, vi } from 'vitest';

import type { OutputExtractor } from '../processing/OutputExtractor';
import type { TemplateContext } from '../processing/TemplateRenderer';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ScriptFlowStep, StepTrace } from '../types';
import type { ScriptExecutionResult, ScriptExecutor } from './ScriptExecutor';
import { executeScriptStep } from './ScriptStepExecutor';

function setup(result: Partial<ScriptExecutionResult> = {}) {
	const execute = vi
		.fn()
		.mockResolvedValue({ success: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1, ...result });
	const services = {
		templateRenderer: new TemplateRenderer(),
		scriptExecutor: { execute } as unknown as ScriptExecutor,
		outputExtractor: { extract: () => ({}) } as unknown as OutputExtractor,
	};
	const run = (extra: Record<string, unknown>, onActivity?: () => void) =>
		executeScriptStep(
			{ id: 'call', name: 'Call', type: 'script', script: 'echo ok', ...extra } as unknown as ScriptFlowStep,
			process.cwd(),
			{ inputs: {}, stepOutputs: new Map(), taskMetadata: {} } as TemplateContext,
			{ stepId: 'call' } as StepTrace,
			services,
			undefined,
			onActivity
		);
	return { execute, run };
}

describe('executeScriptStep - timeout', () => {
	it('passes the step timeout to the executor in milliseconds', async () => {
		const { execute, run } = setup();
		await run({ timeout: 90 });
		expect(execute.mock.calls[0][0].timeout).toBe(90_000);
	});

	it('passes no timeout when the step has none (no default limit)', async () => {
		const { execute, run } = setup();
		await run({});
		expect(execute.mock.calls[0][0].timeout).toBeUndefined();
	});

	it('hands the activity callback to the executor', async () => {
		const { execute, run } = setup();
		const onActivity = vi.fn();
		await run({}, onActivity);
		expect(execute.mock.calls[0][0].onActivity).toBe(onActivity);
	});

	it('fails the step naming the limit and the killed process tree', async () => {
		const { run } = setup({ success: false, exitCode: -1, timedOut: true, timeoutMs: 90_000 });
		const trace = await run({ timeout: 90 });
		expect(trace.error).toContain('timed out after 90s');
		expect(trace.error).toMatch(/process tree.*killed|killed.*process tree/i);
		expect(trace.error).toContain('timeout');
	});
});

describe('executeScriptStep - end_reason', () => {
	it.each([
		['completed', {}, 'completed'],
		['a non-zero exit', { success: false, exitCode: 3 }, 'exit_nonzero'],
		['a timeout', { success: false, exitCode: -1, timedOut: true, timeoutMs: 1000 }, 'timeout'],
	])('records why the attempt ended for %s', async (_name, result, expected) => {
		const { run } = setup(result);
		const trace = await run({ timeout: 1 });
		expect((trace.meta as { end_reason?: string }).end_reason).toBe(expected);
	});
});
