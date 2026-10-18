import { describe, expect, it } from 'vitest';

import { formatDuration, formatModelCost, formatStarted } from './ExecutionFormat.js';

describe('formatDuration', () => {
	it('is "running" without a completion time', () => {
		expect(formatDuration('2026-08-16T12:00:00.000Z', null)).toBe('running');
	});
	it('uses ms under a second', () => {
		expect(formatDuration('2026-08-16T12:00:00.000Z', '2026-08-16T12:00:00.250Z')).toBe('250ms');
	});
	it('uses seconds with one decimal under a minute', () => {
		expect(formatDuration('2026-08-16T12:00:00.000Z', '2026-08-16T12:00:01.244Z')).toBe('1.2s');
	});
	it('uses minutes and rounded seconds from a minute on', () => {
		expect(formatDuration('2026-08-16T12:00:00.000Z', '2026-08-16T12:02:30.400Z')).toBe('2m30s');
	});
});

describe('formatStarted', () => {
	it('replaces the T separator and drops milliseconds and zone', () => {
		expect(formatStarted('2026-08-16T12:00:01.244Z')).toBe('2026-08-16 12:00:01');
	});
});

describe('formatModelCost', () => {
	it('is undefined without meta or for meta without cost (script step)', () => {
		expect(formatModelCost(undefined)).toBeUndefined();
		expect(formatModelCost({ duration_ms: 5 } as never)).toBeUndefined();
	});
	it('prints usd, tokens and duration, with cache tokens as a separate figure', () => {
		const meta = {
			duration_ms: 1200,
			cost: { input_tokens: 10, output_tokens: 20, cache_read_tokens: 3, cache_write_tokens: 4, usd: 0.5 },
		};
		expect(formatModelCost(meta as never)).toBe('cost: $0.5000 (10 in / 20 out + 7 cache tokens, 1200ms)');
	});
});
