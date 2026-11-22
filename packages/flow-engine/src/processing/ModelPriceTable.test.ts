import { describe, expect, it } from 'vitest';

import { ModelPriceTable, PRICES_AS_OF, PRICES_SOURCE } from './ModelPriceTable';

describe('ModelPriceTable', () => {
	const table = new ModelPriceTable();

	it('prices turn 1 of a real codex capture on luna', () => {
		// {"input_tokens":9344,"cached_input_tokens":0,"cache_write_input_tokens":9302,"output_tokens":5}
		// uncached 42 * 0.22 + 0 * 0.022 + 9302 * 0.275 + 5 * 1.32 = 9.24 + 2558.05 + 6.6 = 2573.89 per million
		const result = table.estimate('openai.gpt-5.6-luna', {
			inputTokens: 9344,
			cachedInputTokens: 0,
			cacheWriteInputTokens: 9302,
			outputTokens: 5,
		});
		expect(result).toEqual({ usd: expect.closeTo(0.00257389, 12), pricesAsOf: '2026-11-08' });
	});

	it('prices the cumulative usage of the resumed thread (turn 2) on luna', () => {
		// {"input_tokens":18710,"cached_input_tokens":9302,"cache_write_input_tokens":9324,"output_tokens":10}
		// uncached 84 * 0.22 + 9302 * 0.022 + 9324 * 0.275 + 10 * 1.32 = 18.48 + 204.644 + 2564.1 + 13.2 = 2800.424
		const result = table.estimate('openai.gpt-5.6-luna', {
			inputTokens: 18710,
			cachedInputTokens: 9302,
			cacheWriteInputTokens: 9324,
			outputTokens: 10,
		});
		expect(result).toEqual({ usd: expect.closeTo(0.002800424, 12), pricesAsOf: '2026-11-08' });
	});

	it('uses the terra prices of the machine default', () => {
		// 1000000 uncached * 2.2 + 1000000 output * 13.2 = 15.4 USD
		const result = table.estimate('openai.gpt-5.6-terra', {
			inputTokens: 1_000_000,
			cachedInputTokens: 0,
			cacheWriteInputTokens: 0,
			outputTokens: 1_000_000,
		});
		expect(result).toEqual({ usd: expect.closeTo(15.4, 9), pricesAsOf: PRICES_AS_OF });
	});

	it('prices the inference-profile prefixes and the global ids differently', () => {
		const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0 };
		expect(table.estimate('us.openai.gpt-5.6-sol', usage)).toMatchObject({ usd: 4.4 });
		expect(table.estimate('global.openai.gpt-5.6-sol', usage)).toMatchObject({ usd: 4 });
		expect(table.estimate('gpt-5.6', usage)).toMatchObject({ usd: 4 });
	});

	it('prices the gpt-6 and gpt-6.1 models enabled on Bedrock (input per million tokens)', () => {
		const usage = { inputTokens: 1_000_000, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0 };
		expect(table.estimate('openai.gpt-6-luna', usage)).toMatchObject({ usd: 0.11 });
		expect(table.estimate('global.openai.gpt-6-luna', usage)).toMatchObject({ usd: 0.1 });
		expect(table.estimate('openai.gpt-6.1-terra', usage)).toMatchObject({ usd: 1.1 });
		expect(table.estimate('openai.gpt-6.1-sol', usage)).toMatchObject({ usd: 2.2 });
		expect(table.estimate('us.openai.gpt-6-sol', usage)).toMatchObject({ usd: 2.2 });
	});

	it('does not price a model that is not enabled for the codex role: gpt-6.2-sol stays unknown', () => {
		expect(table.has('openai.gpt-6.2-sol')).toBe(false);
	});

	it('does not round: a tiny usage stays a positive figure', () => {
		const result = table.estimate('openai.gpt-5.6-luna', {
			inputTokens: 1,
			cachedInputTokens: 0,
			cacheWriteInputTokens: 0,
			outputTokens: 0,
		});
		expect(result).toEqual({ usd: expect.closeTo(0.00000022, 14), pricesAsOf: PRICES_AS_OF });
		expect((result as { usd: number }).usd).toBeGreaterThan(0);
	});

	it('reports an unknown model with its id and the table date, never 0', () => {
		const result = table.estimate('openai.gpt-9', {
			inputTokens: 10,
			cachedInputTokens: 0,
			cacheWriteInputTokens: 0,
			outputTokens: 1,
		});
		expect(result).toEqual({ unknownReason: "model 'openai.gpt-9' is not in the price table of 2026-11-08" });
		expect(table.has('openai.gpt-9')).toBe(false);
		expect(table.has('toString')).toBe(false);
	});

	it('reports a negative uncached input as inconsistent usage', () => {
		const result = table.estimate('openai.gpt-5.6-luna', {
			inputTokens: 100,
			cachedInputTokens: 80,
			cacheWriteInputTokens: 30,
			outputTokens: 1,
		});
		expect(result).toHaveProperty('unknownReason', expect.stringContaining('inconsistent'));
		expect(result).not.toHaveProperty('usd');
	});

	it('reports a negative or non-finite field as inconsistent usage', () => {
		const base = { inputTokens: 10, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 1 };
		expect(table.estimate('openai.gpt-5.6-luna', { ...base, outputTokens: -1 })).toHaveProperty('unknownReason');
		expect(table.estimate('openai.gpt-5.6-luna', { ...base, inputTokens: Number.NaN })).toHaveProperty(
			'unknownReason'
		);
	});

	it('documents where its prices come from', () => {
		expect(PRICES_AS_OF).toBe('2026-11-08');
		expect(PRICES_SOURCE).toContain('models.dev');
	});
});
