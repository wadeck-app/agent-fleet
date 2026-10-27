import { raceWithTimeout } from './BoundedWait.js';

afterEach(() => {
	vi.useRealTimers();
});

describe('raceWithTimeout', () => {
	it('says done when the wait resolves first', async () => {
		await expect(raceWithTimeout(Promise.resolve('x'), 1_000)).resolves.toBe('done');
	});

	it('says timeout when the wait never settles, and leaves no timer behind once the wait wins', async () => {
		vi.useFakeTimers();
		const outcome = raceWithTimeout(new Promise(() => {}), 500);
		await vi.advanceTimersByTimeAsync(500);

		await expect(outcome).resolves.toBe('timeout');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('clears its timer when the wait wins', async () => {
		vi.useFakeTimers();
		await raceWithTimeout(Promise.resolve(), 500);

		expect(vi.getTimerCount()).toBe(0);
	});
});
