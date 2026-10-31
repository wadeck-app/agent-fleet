import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MAX_RETRY_MS, RetryBackoff } from './RetryBackoff.js';

describe('RetryBackoff', () => {
	let stderr: ReturnType<typeof vi.spyOn>;
	let clock: { now: number };
	beforeEach(() => {
		stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		clock = { now: 0 };
	});
	afterEach(() => {
		stderr.mockRestore();
	});

	const lines = (): string[] => stderr.mock.calls.map((call: unknown[]) => String(call[0]));
	const backoff = (firstRetryMs = 500) => new RetryBackoff('[Thing]', firstRetryMs, () => clock.now);

	it('doubles the delay with each failure in a row, up to the maximum', () => {
		const retry = backoff(500);

		const delays = [1, 2, 3, 4, 5, 6, 7, 8].map(() => retry.failed('pass', new Error('boom')));

		expect(delays).toEqual([500, 1_000, 2_000, 4_000, 8_000, 16_000, MAX_RETRY_MS, MAX_RETRY_MS]);
	});

	it('starts over at the first delay once a pass went through', () => {
		const retry = backoff(500);
		retry.failed('pass', new Error('boom'));
		retry.failed('pass', new Error('boom'));

		retry.succeeded();

		expect(retry.failed('pass', new Error('boom'))).toBe(500);
	});

	it('writes the first failure with the prefix, the pass, the count, the delay and the cause', () => {
		backoff(500).failed('dispatch pass of the thing', new Error('boom'));

		expect(lines()).toEqual([
			'[Thing] dispatch pass of the thing failed (1 in a row), asking again in 0.5s: Error: boom\n',
		]);
	});

	it('writes at most one line per maximum delay, and counts the failures left out in the next one', () => {
		const retry = backoff(500);
		retry.failed('pass', new Error('boom'));
		clock.now = MAX_RETRY_MS - 1;
		retry.failed('pass', new Error('boom'));
		retry.failed('pass', new Error('boom'));
		expect(lines()).toHaveLength(1);

		clock.now = MAX_RETRY_MS;
		retry.failed('pass', new Error('boom'));

		expect(lines()).toHaveLength(2);
		expect(lines()[1]).toContain('(2 similar failure(s) since the last line not shown)');
		clock.now = 2 * MAX_RETRY_MS;
		retry.failed('pass', new Error('boom'));
		expect(lines()[2]).not.toContain('similar failure');
	});

	it('keeps the throttle across a success, so a flapping pass does not write a line each time', () => {
		const retry = backoff(500);
		retry.failed('pass', new Error('boom'));
		retry.succeeded();
		retry.failed('pass', new Error('boom'));

		expect(lines()).toHaveLength(1);
	});
});
