import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RunIdempotencyCache } from './RunIdempotencyCache';

describe('RunIdempotencyCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('runs the work once and hands the same promise to a repeated id', async () => {
		const cache = new RunIdempotencyCache<string>();
		const work = vi.fn(async () => 'a');

		const first = cache.run('id-1', work);
		const second = cache.run('id-1', work);

		expect(second).toBe(first);
		expect(work).toHaveBeenCalledTimes(1);
		expect(await second).toBe('a');
	});

	it('keeps distinct ids apart', async () => {
		const cache = new RunIdempotencyCache<string>();
		const work = vi.fn(async () => 'x');

		const first = cache.run('id-1', work);
		const second = cache.run('id-2', work);

		expect(second).not.toBe(first);
		expect(work).toHaveBeenCalledTimes(2);
		await Promise.all([first, second]);
	});

	it('still answers the same result once the first run has finished', async () => {
		const cache = new RunIdempotencyCache<string>();
		const work = vi.fn(async () => 'done');

		await cache.run('id-1', work);

		expect(await cache.run('id-1', work)).toBe('done');
		expect(work).toHaveBeenCalledTimes(1);
	});

	it('forgets an entry after the time to live', async () => {
		const cache = new RunIdempotencyCache<string>({ ttlMs: 1000 });
		const work = vi.fn(async () => 'v');
		await cache.run('id-1', work);

		vi.advanceTimersByTime(999);
		await cache.run('id-1', work);
		expect(work).toHaveBeenCalledTimes(1);

		vi.advanceTimersByTime(2);
		await cache.run('id-1', work);
		expect(work).toHaveBeenCalledTimes(2);
	});

	it('evicts the oldest entry beyond the cap', async () => {
		const cache = new RunIdempotencyCache<string>({ maxEntries: 2 });
		const work = vi.fn(async () => 'v');
		await cache.run('a', work);
		await cache.run('b', work);
		await cache.run('c', work);
		expect(cache.size).toBe(2);
		expect(work).toHaveBeenCalledTimes(3);

		// 'a' was evicted: it runs again. 'c' is still cached.
		await cache.run('c', work);
		expect(work).toHaveBeenCalledTimes(3);
		await cache.run('a', work);
		expect(work).toHaveBeenCalledTimes(4);
	});

	it('does not cache a rejection: a retry runs the work again', async () => {
		const cache = new RunIdempotencyCache<string>();
		const work = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');

		await expect(cache.run('id-1', work)).rejects.toThrow('boom');

		expect(await cache.run('id-1', work)).toBe('ok');
		expect(work).toHaveBeenCalledTimes(2);
	});

	it('does not cache a synchronous throw', async () => {
		const cache = new RunIdempotencyCache<string>();
		const work = vi
			.fn<() => Promise<string>>()
			.mockImplementationOnce(() => {
				throw new Error('sync');
			})
			.mockResolvedValueOnce('ok');

		await expect(cache.run('id-1', work)).rejects.toThrow('sync');
		expect(await cache.run('id-1', work)).toBe('ok');
	});

	it('clear() drops every entry', async () => {
		const cache = new RunIdempotencyCache<string>();
		const work = vi.fn(async () => 'v');
		await cache.run('id-1', work);

		cache.clear();

		expect(cache.size).toBe(0);
		await cache.run('id-1', work);
		expect(work).toHaveBeenCalledTimes(2);
	});
});
