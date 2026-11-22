/**
 * What a model attempt reports about itself: turns, tool calls, written files, end reason, and whether a
 * cost was actually reported. Hand-written ModelProvider emitting stream events -- no real CLI launch.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { CodexSessionModelReader } from '../processing/CodexSessionModelReader';

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
	step: ModelFlowStep = makeStep(),
	codexSessionModelReader?: CodexSessionModelReader
): Promise<{ trace: StepTrace; meta: ModelStepMeta }> {
	const trace = await executeModelStep(
		step,
		'/workspace',
		{ inputs: {}, stepOutputs: new Map() } as never,
		makeTrace(step),
		{ interactive: false, provider, ...(codexSessionModelReader && { codexSessionModelReader }) },
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

	it.each<[ModelProviderName | undefined, string]>([
		[undefined, 'claude'],
		['opencode', 'opencode'],
		['codex', 'codex'],
	])('records the provider that ran the attempt (step provider %s -> %s)', async (stepProvider, expected) => {
		const { meta } = await run(
			scriptedProvider([init, resultEvent()]),
			makeStep(stepProvider === undefined ? {} : { provider: stepProvider })
		);

		expect(meta.provider).toBe(expected);
	});

	it('records the provider on a failed attempt and on one refused before launch too', async () => {
		const failing: ModelProvider = {
			launchInteractive: () => Promise.reject(new Error('unused')),
			launchBackground: () => Promise.reject(new Error('spawn claude ENOENT')),
			kill: () => {},
		};
		expect((await run(failing)).meta.provider).toBe('claude');
		expect((await run(failing, makeStep({ provider: 'opencode', contextLimit: 60_000 }))).meta.provider).toBe(
			'opencode'
		);
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

describe('ModelStepExecutor -- codex cost estimate', () => {
	// What CodexEventParser emits for the real first turn: input 9344 - 0 cached - 9302 cache write = 42 uncached
	const codexResult = (modelUsage: Record<string, unknown>): StreamJsonEvent => ({
		type: 'result',
		subtype: 'result',
		data: { result: 'done', cost_usd: 0, duration_ms: 5, modelUsage },
	});
	const firstTurnUsage = {
		codex: { inputTokens: 42, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 9302 },
	};

	it('estimates the usd from the usage when the model is in the price table, without calling it reported', async () => {
		const { meta } = await run(
			scriptedProvider([init, codexResult(firstTurnUsage)]),
			makeStep({ provider: 'codex', model: 'openai.gpt-5.6-luna' })
		);

		expect(meta.cost.reported).toBe(false);
		expect(meta.cost.estimated).toBe(true);
		expect(meta.cost.pricesAsOf).toBe('2026-11-08');
		// 42 * 0.22 + 9302 * 0.275 + 5 * 1.32 = 2573.89 per million
		expect(meta.cost.usd).toBeCloseTo(0.00257389, 12);
		expect(meta.cost.unknownReason).toBeUndefined();
		expect(meta.cost.input_tokens).toBe(42);
		expect(meta.cost.cache_write_tokens).toBe(9302);
	});

	it('resolves the family alias to the id of the price table when the caller passes it', async () => {
		const step = makeStep({ provider: 'codex', model: 'luna' });
		const trace = await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as never,
			makeTrace(step),
			{
				interactive: false,
				provider: scriptedProvider([init, codexResult(firstTurnUsage)]),
				resolvedModel: 'openai.gpt-5.6-luna',
			},
			{ templateRenderer: new TemplateRenderer(), outputExtractor: new OutputExtractor() }
		);
		expect((trace.meta as ModelStepMeta).cost.estimated).toBe(true);
		expect((trace.meta as ModelStepMeta).model).toBe('openai.gpt-5.6-luna');
	});

	it('leaves the usd unknown with the reason when the model is not in the table', async () => {
		const { meta } = await run(
			scriptedProvider([init, codexResult(firstTurnUsage)]),
			makeStep({ provider: 'codex', model: 'openai.gpt-9' })
		);

		expect(meta.cost.estimated).toBeUndefined();
		expect(meta.cost.reported).toBe(false);
		expect(meta.cost.unknownReason).toBe(
			"codex reports no cost and model 'openai.gpt-9' is not in the price table of 2026-11-08"
		);
	});

	describe('step without model', () => {
		const homes: string[] = [];
		afterEach(() => {
			for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
		});
		const emptyHome = (): CodexSessionModelReader => {
			const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
			homes.push(home);
			return new CodexSessionModelReader(home);
		};
		const homeWithSession = (model: string): CodexSessionModelReader => {
			const home = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
			homes.push(home);
			const day = path.join(home, 'sessions', '2026', '11', '22');
			fs.mkdirSync(day, { recursive: true });
			const line = JSON.stringify({ timestamp: 't', ordinal: 1, type: 'turn_context', payload: { model } });
			fs.writeFileSync(path.join(day, 'rollout-2026-11-22T11-29-37-s1.jsonl'), line + '\n');
			return new CodexSessionModelReader(home);
		};

		it('estimates with the model codex recorded in its session file, and records it as the step model', async () => {
			const { meta } = await run(
				scriptedProvider([init, codexResult(firstTurnUsage)]),
				makeStep({ provider: 'codex', model: undefined }),
				homeWithSession('openai.gpt-5.6-luna')
			);

			expect(meta.model).toBe('openai.gpt-5.6-luna');
			expect(meta.cost.estimated).toBe(true);
			expect(meta.cost.usd).toBeCloseTo(0.00257389, 12);
			expect(meta.cost.unknownReason).toBeUndefined();
		});

		it('stays unknown, with the reader reason appended, when the session file cannot be read', async () => {
			const { meta } = await run(
				scriptedProvider([init, codexResult(firstTurnUsage)]),
				makeStep({ provider: 'codex', model: undefined }),
				emptyHome()
			);

			expect(meta.model).toBe('');
			expect(meta.cost.estimated).toBeUndefined();
			expect(meta.cost.usd).toBe(0);
			expect(meta.cost.unknownReason).toContain('model unknown');
			expect(meta.cost.unknownReason).toContain('2026-11-08');
			expect(meta.cost.unknownReason).toContain("no codex session file 'rollout-*-s1.jsonl'");
		});

		it('stays unknown when the recorded model is not in the price table', async () => {
			const { meta } = await run(
				scriptedProvider([init, codexResult(firstTurnUsage)]),
				makeStep({ provider: 'codex', model: undefined }),
				homeWithSession('openai.gpt-9')
			);

			expect(meta.model).toBe('openai.gpt-9');
			expect(meta.cost.estimated).toBeUndefined();
			expect(meta.cost.unknownReason).toContain("model 'openai.gpt-9' is not in the price table");
		});

		it('does not read the session file when the step names a model', async () => {
			const reader = { read: () => { throw new Error('must not be called'); } } as unknown as CodexSessionModelReader;
			const { meta } = await run(
				scriptedProvider([init, codexResult(firstTurnUsage)]),
				makeStep({ provider: 'codex', model: 'openai.gpt-5.6-luna' }),
				reader
			);
			expect(meta.cost.estimated).toBe(true);
		});

		it('does not read the session file when no thread id was captured', async () => {
			const reader = { read: () => { throw new Error('must not be called'); } } as unknown as CodexSessionModelReader;
			const { meta } = await run(
				scriptedProvider([codexResult(firstTurnUsage)]),
				makeStep({ provider: 'codex', model: undefined }),
				reader
			);
			expect(meta.cost.unknownReason).toContain('model unknown');
		});
	});

	it('leaves the usd unknown, never 0 priced, when the attempt ended without any usage', async () => {
		const { meta } = await run(
			scriptedProvider([init, codexResult({})]),
			makeStep({ provider: 'codex', model: 'openai.gpt-5.6-luna' })
		);

		expect(meta.cost.estimated).toBeUndefined();
		expect(meta.cost.unknownReason).toContain('no token usage');
	});

	it('leaves the usd unknown when the codex usage was flagged inconsistent', async () => {
		const { meta } = await run(
			scriptedProvider([init, codexResult({ codex: { ...firstTurnUsage.codex, usageInconsistent: true } })]),
			makeStep({ provider: 'codex', model: 'openai.gpt-5.6-luna' })
		);

		expect(meta.cost.estimated).toBeUndefined();
		expect(meta.cost.unknownReason).toContain('inconsistent');
	});

	it('never estimates a cost for a provider that reports its own', async () => {
		const { meta } = await run(scriptedProvider([init, resultEvent()]), makeStep({ provider: 'claude' }));

		expect(meta.cost.reported).toBe(true);
		expect(meta.cost.estimated).toBeUndefined();
		expect(meta.cost.unknownReason).toBeUndefined();
	});
});
