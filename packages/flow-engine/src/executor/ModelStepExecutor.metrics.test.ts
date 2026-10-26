/**
 * What a model attempt reports about itself: turns, tool calls, written files, end reason, and whether a
 * cost was actually reported. Hand-written ModelProvider emitting stream events -- no real CLI launch.
 */
import { describe, expect, it } from 'vitest';

import type { LaunchOptions, ModelBackgroundResult, ModelProvider } from '../processing/ModelProvider';
import { OutputExtractor } from '../processing/OutputExtractor';
import type { StreamJsonEvent } from '../processing/StreamJsonParser';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { ModelFlowStep, ModelProviderName, ModelStepMeta, StepTrace } from '../types';
import { executeModelStep } from './ModelStepExecutor';

function makeStep(overrides: Partial<ModelFlowStep> = {}): ModelFlowStep {
	return {
		id: 'gen',
		name: 'Generate',
		type: 'model',
		provider: 'claude',
		model: 'haiku',
		prompt: 'Hello',
		...overrides,
	};
}

function makeTrace(step: ModelFlowStep): StepTrace {
	return { stepId: step.id, stepName: step.name, stepType: 'model', startTime: Date.now() };
}

const init: StreamJsonEvent = {
	type: 'system',
	subtype: 'init',
	data: { type: 'system', subtype: 'init', session_id: 's1' },
};
const toolUse = (id: string, name: string, input: Record<string, unknown>): StreamJsonEvent => ({
	type: 'assistant',
	subtype: 'tool_use',
	data: { type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } },
});
const resultEvent = (extra: Record<string, unknown> = {}): StreamJsonEvent => ({
	type: 'result',
	subtype: 'result',
	data: {
		type: 'result',
		subtype: 'success',
		is_error: false,
		result: 'done',
		total_cost_usd: 0.25,
		num_turns: 7,
		modelUsage: { m: { inputTokens: 10, outputTokens: 5 } },
		...extra,
	},
});

function scriptedProvider(events: StreamJsonEvent[], result: Partial<ModelBackgroundResult> = {}): ModelProvider {
	return {
		launchInteractive: () => Promise.resolve({ response: '', exitCode: 0 }),
		launchBackground: (options: LaunchOptions) => {
			for (const event of events) options.onStreamEvent?.(event);
			return Promise.resolve({ stdout: '', stderr: '', exitCode: 0, ...result });
		},
		kill: () => {},
	};
}

async function run(
	provider: ModelProvider,
	step: ModelFlowStep = makeStep()
): Promise<{ trace: StepTrace; meta: ModelStepMeta }> {
	const trace = await executeModelStep(
		step,
		'/workspace',
		{ inputs: {}, stepOutputs: new Map() } as never,
		makeTrace(step),
		{ interactive: false, provider },
		{ templateRenderer: new TemplateRenderer(), outputExtractor: new OutputExtractor() }
	);
	return { trace, meta: trace.meta as ModelStepMeta };
}

describe('ModelStepExecutor -- attempt metrics', () => {
	it('puts turns, tool calls, written files and end_reason completed on a successful claude attempt', async () => {
		const { trace, meta } = await run(
			scriptedProvider([
				init,
				toolUse('1', 'Write', { file_path: '/a.ts' }),
				toolUse('2', 'Bash', { command: 'ls' }),
				resultEvent(),
			])
		);

		expect(trace.error).toBeUndefined();
		expect(meta.turns).toBe(7);
		expect(meta.tool_calls).toEqual({ total: 2, by_tool: { Write: 1, Bash: 1 } });
		expect(meta.files_written).toEqual(['/a.ts']);
		expect(meta.files_written_count).toBe(1);
		expect(meta.end_reason).toBe('completed');
		expect(meta.cost.reported).toBe(true);
		expect(meta.cost.usd).toBe(0.25);
	});

	it('leaves turns and written files absent when the stream showed none (nothing invented)', async () => {
		const { meta } = await run(scriptedProvider([init, resultEvent({ num_turns: undefined })]));

		expect(meta.turns).toBeUndefined();
		expect(meta.files_written).toBeUndefined();
		expect(meta.files_written_count).toBeUndefined();
		expect(meta.tool_calls).toEqual({ total: 0, by_tool: {} });
	});

	it.each<[string, Partial<ModelBackgroundResult>, StreamJsonEvent[], string]>([
		['exit_nonzero', { exitCode: 2 }, [init, resultEvent()], 'exit_nonzero'],
		['is_error_result', {}, [init, resultEvent({ is_error: true })], 'is_error_result'],
		[
			'empty_output',
			{},
			[init, resultEvent({ result: '', modelUsage: { m: { inputTokens: 0, outputTokens: 0 } } })],
			'empty_output',
		],
	])(
		'reports end_reason %s on a failed attempt and still carries its metrics',
		async (_name, result, events, reason) => {
			const { trace, meta } = await run(scriptedProvider(events, result));

			expect(trace.error).toBeDefined();
			expect(meta.end_reason).toBe(reason);
			expect(meta.turns).toBe(7);
		}
	);

	it('builds a meta on the timeout path with what was seen so far, usd flagged as not reported', async () => {
		const provider: ModelProvider = {
			launchInteractive: () => new Promise(() => {}),
			launchBackground: (options: LaunchOptions) => {
				options.onStreamEvent?.(init);
				options.onStreamEvent?.(toolUse('1', 'Edit', { file_path: '/half.ts' }));
				return new Promise(() => {});
			},
			kill: () => {},
		};

		const { trace, meta } = await run(provider, makeStep({ timeout: 1 / 60_000 }));

		expect(trace.error).toContain('timed out after');
		expect(meta.end_reason).toBe('timeout');
		expect(meta.tool_calls).toEqual({ total: 1, by_tool: { Edit: 1 } });
		expect(meta.files_written).toEqual(['/half.ts']);
		expect(meta.turns).toBeUndefined();
		expect(meta.cost.reported).toBe(false);
		expect(meta.duration_ms).toBeGreaterThan(0);
	});

	it('builds a meta with end_reason step_error when the provider throws', async () => {
		const provider: ModelProvider = {
			launchInteractive: () => Promise.reject(new Error('unused')),
			launchBackground: () => Promise.reject(new Error('spawn claude ENOENT')),
			kill: () => {},
		};

		const { trace, meta } = await run(provider);

		expect(trace.error).toContain('ENOENT');
		expect(meta.end_reason).toBe('step_error');
		expect(meta.cost.reported).toBe(false);
	});

	it.each<ModelProviderName>(['codex'])(
		'never claims a cost was reported for %s, whatever its synthesized result says',
		async name => {
			const { meta } = await run(
				scriptedProvider([init, resultEvent({ total_cost_usd: undefined, cost_usd: 0, num_turns: undefined })]),
				makeStep({ provider: name })
			);

			expect(meta.cost.reported).toBe(false);
			expect(meta.turns).toBeUndefined();
		}
	);
});

describe('ModelStepExecutor -- attempt rejected before launch', () => {
	it('still carries a meta (step_error, nothing launched, usd not reported) so a failure is never reported without one', async () => {
		let launched = false;
		const provider: ModelProvider = {
			launchInteractive: () => Promise.reject(new Error('unused')),
			launchBackground: () => {
				launched = true;
				return Promise.reject(new Error('must not launch'));
			},
			kill: () => {},
		};

		const { trace, meta } = await run(provider, makeStep({ provider: 'opencode', contextLimit: 60_000 }));

		expect(launched).toBe(false);
		expect(trace.error).toContain('contextLimit');
		expect(meta.end_reason).toBe('step_error');
		expect(meta.cost.reported).toBe(false);
		expect(meta.tool_calls).toBeUndefined();
	});
});
