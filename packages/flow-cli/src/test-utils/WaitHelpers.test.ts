import { describe, expect, it } from 'vitest';

import { observeFor, pollUntil, waitUntil } from './WaitHelpers';

describe('pollUntil', () => {
	it('returns true as soon as the predicate holds', async () => {
		let calls = 0;

		const result = await pollUntil(() => ++calls >= 3, { timeoutMs: 1_000, intervalMs: 1 });

		expect(result).toBe(true);
		expect(calls).toBe(3);
	});

	it('supports an async predicate', async () => {
		expect(await pollUntil(() => Promise.resolve(true), { timeoutMs: 100 })).toBe(true);
	});

	it('returns false when the predicate never holds', async () => {
		expect(await pollUntil(() => false, { timeoutMs: 30, intervalMs: 5 })).toBe(false);
	});
});

describe('waitUntil', () => {
	it('resolves when the predicate holds', async () => {
		await expect(waitUntil(() => true, { timeoutMs: 100, failureMessage: 'unused' })).resolves.toBeUndefined();
	});

	it('fails with the given message and the budget when the predicate never holds', async () => {
		await expect(
			waitUntil(() => false, { timeoutMs: 30, intervalMs: 5, failureMessage: 'never ready' })
		).rejects.toThrow('never ready (gave up after 30ms)');
	});
});

describe('observeFor', () => {
	it('resolves once the window has elapsed', async () => {
		const start = Date.now();

		await observeFor(30);

		// Timers may fire a millisecond early, so allow a small margin.
		expect(Date.now() - start).toBeGreaterThanOrEqual(25);
	});
});
