import { afterEach, describe, expect, it, vi } from 'vitest';

import { CodexEventParser } from './CodexEventParser';
import type { StreamJsonEvent } from './StreamJsonParser';

// Real lines captured from codex-cli 0.171.0 (Amazon Bedrock, openai.gpt-5.6-luna): turn 1 of a new thread, then turn 2
// of the SAME thread through `codex exec resume`.
const THREAD_STARTED = '{"type":"thread.started","thread_id":"01a14a23-e936-7571-9110-f15a92322574"}';
const TURN_1 =
	'{"type":"turn.completed","usage":{"input_tokens":9344,"cached_input_tokens":0,"cache_write_input_tokens":9302,"output_tokens":5,"reasoning_output_tokens":0}}';
const TURN_2 =
	'{"type":"turn.completed","usage":{"input_tokens":18710,"cached_input_tokens":9302,"cache_write_input_tokens":9324,"output_tokens":10,"reasoning_output_tokens":0}}';

function resultOf(lines: string[]): Record<string, unknown> | undefined {
	const events: StreamJsonEvent[] = [];
	const parser = new CodexEventParser('openai.gpt-5.6-luna', event => events.push(event));
	parser.feed(lines.join('\n') + '\n');
	parser.flush();
	parser.emitResult(10);
	return events.find(event => event.type === 'result')?.data;
}

describe('CodexEventParser usage', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('reports the uncached input and the cache figures of a real first turn', () => {
		const data = resultOf([THREAD_STARTED, TURN_1]);
		expect(data?.['modelUsage']).toEqual({
			codex: {
				// 9344 - 0 cached - 9302 cache write
				inputTokens: 42,
				outputTokens: 5,
				cacheReadTokens: 0,
				cacheWriteTokens: 9302,
				reasoningTokens: 0,
			},
		});
		// codex reports no cost: the 0 is a placeholder the executor must not read as a measurement
		expect(data?.['cost_usd']).toBe(0);
	});

	it('reports the cumulative thread usage of a real resumed turn', () => {
		const data = resultOf([THREAD_STARTED, TURN_2]);
		expect(data?.['modelUsage']).toEqual({
			codex: {
				// 18710 - 9302 cached - 9324 cache write
				inputTokens: 84,
				outputTokens: 10,
				cacheReadTokens: 9302,
				cacheWriteTokens: 9324,
				reasoningTokens: 0,
			},
		});
	});

	it('keeps the latest turn.completed of one process instead of adding them (usage is cumulative)', () => {
		const data = resultOf([THREAD_STARTED, TURN_1, TURN_2]);
		expect(data?.['modelUsage']).toMatchObject({ codex: { inputTokens: 84, outputTokens: 10 } });
	});

	it('reports no usage at all when no turn.completed was seen (unknown, not zero)', () => {
		expect(resultOf([THREAD_STARTED])?.['modelUsage']).toEqual({});
	});

	it('warns once and reports no usage when a required usage field is missing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const data = resultOf([
			THREAD_STARTED,
			'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":1}}',
			'{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":1}}',
		]);
		expect(data?.['modelUsage']).toEqual({});
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('lacks a numeric'));
	});

	it('flags inconsistent usage (cache above input) instead of reporting a negative input', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const data = resultOf([
			THREAD_STARTED,
			'{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":80,"cache_write_input_tokens":30,"output_tokens":1}}',
		]);
		expect(data?.['modelUsage']).toMatchObject({ codex: { inputTokens: 0, usageInconsistent: true } });
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('inconsistent'));
	});
});
