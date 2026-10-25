/**
 * Time to first token, and the end of a turn that the CLI process outlives.
 *
 * Hand-written ModelProvider emitting stream events -- no real CLI launch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LaunchOptions, ModelBackgroundResult, ModelProvider } from '../processing/ModelProvider';
import { OutputExtractor } from '../processing/OutputExtractor';
import type { StreamJsonEvent } from '../processing/StreamJsonParser';
import { TemplateRenderer } from '../processing/TemplateRenderer';
import type { LiveLogEntry, ModelFlowStep, StepTrace } from '../types';
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

const T0 = 1_700_000_000_000;

/** Emits each event after advancing the clock by `atMs` since launch. */
function scriptedProvider(
	script: { atMs: number; event: StreamJsonEvent }[],
	result: Partial<ModelBackgroundResult> = {}
): ModelProvider {
	return {
		launchInteractive: () => Promise.resolve({ response: '', exitCode: 0 }),
		launchBackground: (options: LaunchOptions) => {
			for (const { atMs, event } of script) {
				vi.setSystemTime(T0 + atMs);
				options.onStreamEvent?.(event);
			}
			return Promise.resolve({ stdout: '', stderr: '', exitCode: 0, ...result });
		},
		kill: () => {},
	};
}

const systemInit = (sessionId = 's1'): StreamJsonEvent => ({
	type: 'system',
	subtype: 'init',
	data: { type: 'system', subtype: 'init', session_id: sessionId },
});
const systemOther = (subtype: string, sessionId = 's1'): StreamJsonEvent => ({
	type: 'system',
	subtype,
	data: { type: 'system', subtype, session_id: sessionId },
});
const assistantText = (text: string): StreamJsonEvent => ({
	type: 'assistant',
	subtype: 'text',
	data: { type: 'assistant', message: { content: [{ type: 'text', text }] } },
});
const resultEvent = (text: string, tokens: { in: number; out: number }, cost: number): StreamJsonEvent => ({
	type: 'result',
	subtype: 'result',
	data: {
		type: 'result',
		subtype: 'success',
		is_error: false,
		result: text,
		total_cost_usd: cost,
		modelUsage: { m: { inputTokens: tokens.in, outputTokens: tokens.out } },
	},
});

async function run(
	provider: ModelProvider,
	log?: LiveLogEntry[],
	step: ModelFlowStep = makeStep({ log: 'streaming' })
): Promise<StepTrace> {
	return executeModelStep(
		step,
		'/workspace',
		{ inputs: {}, stepOutputs: new Map() } as never,
		makeTrace(step),
		{ interactive: false, provider, providerName: 'claude', resolvedModel: 'haiku' },
		{ templateRenderer: new TemplateRenderer(), outputExtractor: new OutputExtractor() },
		log === undefined ? undefined : entry => log.push(entry)
	);
}

describe('ModelStepExecutor -- ttft_ms', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(T0);
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('is the time to the first assistant content, not overwritten by later system events carrying a session id', async () => {
		const provider = scriptedProvider([
			{ atMs: 0, event: systemInit() },
			{ atMs: 700, event: assistantText('hi') },
			{ atMs: 40_000, event: systemOther('hook_response') },
			{ atMs: 60_000, event: resultEvent('hi', { in: 1, out: 1 }, 0.1) },
		]);

		const trace = await run(provider);

		expect(trace.error).toBeUndefined();
		expect((trace.meta as { ttft_ms: number }).ttft_ms).toBe(700);
	});

	it('is not set by the system init event alone (no output yet)', async () => {
		const provider = scriptedProvider([
			{ atMs: 300, event: systemInit() },
			{ atMs: 900, event: assistantText('hi') },
			{ atMs: 1000, event: resultEvent('hi', { in: 1, out: 1 }, 0.1) },
		]);

		const trace = await run(provider);

		expect((trace.meta as { ttft_ms: number }).ttft_ms).toBe(900);
	});

	it('keeps the first value when later assistant events follow', async () => {
		const provider = scriptedProvider([
			{ atMs: 0, event: systemInit() },
			{ atMs: 500, event: assistantText('a') },
			{ atMs: 5_000, event: assistantText('b') },
			{ atMs: 6_000, event: resultEvent('ab', { in: 1, out: 1 }, 0.1) },
		]);

		const trace = await run(provider);

		expect((trace.meta as { ttft_ms: number }).ttft_ms).toBe(500);
	});

	it('also counts the text event of opencode/codex as first output', async () => {
		const provider = scriptedProvider([
			{ atMs: 100, event: systemInit() },
			{ atMs: 450, event: { type: 'text', subtype: 'text', data: { text: 'x' } } },
			{ atMs: 900, event: resultEvent('x', { in: 1, out: 1 }, 0.1) },
		]);

		const trace = await run(provider);

		expect((trace.meta as { ttft_ms: number }).ttft_ms).toBe(450);
	});
});

describe('ModelStepExecutor -- several result events', () => {
	it('keeps the text, tokens and cost of the LAST result only (a follow-up turn replaces the earlier one)', async () => {
		const provider = scriptedProvider([
			{ atMs: 0, event: systemInit() },
			{ atMs: 10, event: assistantText('first') },
			{ atMs: 20, event: resultEvent('first', { in: 10, out: 4 }, 0.1) },
			{ atMs: 30, event: assistantText('second') },
			{ atMs: 40, event: resultEvent('second', { in: 15, out: 6 }, 0.25) },
		]);

		const trace = await run(provider);

		expect(trace.error).toBeUndefined();
		expect(trace.response).toBe('second');
		const meta = trace.meta as { cost: { input_tokens: number; output_tokens: number; usd: number } };
		expect(meta.cost).toMatchObject({ input_tokens: 15, output_tokens: 6, usd: 0.25 });
	});
});

describe('ModelStepExecutor -- process ended after the final result', () => {
	it('completes the step from the result and states in the step log and stderr that the process was ended, with the grace period', async () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		const log: LiveLogEntry[] = [];
		const provider = scriptedProvider([{ atMs: 0, event: resultEvent('done', { in: 3, out: 2 }, 0.1) }], {
			endedAfterResult: { graceMs: 30_000 },
		});

		const trace = await run(provider, log);

		expect(trace.error).toBeUndefined();
		expect(trace.response).toBe('done');
		const entry = log.find(e => e.message.includes('ended after the final result'));
		expect(entry?.level).toBe('warning');
		expect(entry?.message).toContain('30000 ms');
		expect(trace.liveLogEntries?.some(e => e.message.includes('ended after the final result'))).toBe(true);
		expect(stderr.mock.calls.map(c => String(c[0])).join('')).toContain('ended after the final result');
		stderr.mockRestore();
	});

	it('writes no such line when the process exited by itself', async () => {
		const log: LiveLogEntry[] = [];
		const provider = scriptedProvider([{ atMs: 0, event: resultEvent('done', { in: 3, out: 2 }, 0.1) }]);

		await run(provider, log);

		expect(log.some(e => e.message.includes('ended after the final result'))).toBe(false);
	});

	it('hands the configured grace period to the provider', async () => {
		let received: number | undefined;
		const provider: ModelProvider = {
			launchInteractive: () => Promise.resolve({ response: '', exitCode: 0 }),
			launchBackground: options => {
				received = options.resultGraceMs;
				options.onStreamEvent?.(resultEvent('x', { in: 1, out: 1 }, 0.1));
				return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
			},
			kill: () => {},
		};
		const step = makeStep();

		await executeModelStep(
			step,
			'/workspace',
			{ inputs: {}, stepOutputs: new Map() } as never,
			makeTrace(step),
			{ interactive: false, provider, providerName: 'claude', resolvedModel: 'haiku', resultGraceMs: 1234 },
			{ templateRenderer: new TemplateRenderer(), outputExtractor: new OutputExtractor() }
		);

		expect(received).toBe(1234);
	});
});
