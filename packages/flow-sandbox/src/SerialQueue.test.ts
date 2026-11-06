import { describe, expect, it } from 'vitest';

import { SerialQueue } from './SerialQueue';

describe('SerialQueue', () => {
	it('runs operations one at a time in call order even when an earlier one is slower', async () => {
		const queue = new SerialQueue();
		const events: string[] = [];
		let releaseFirst: () => void = () => undefined;
		const firstGate = new Promise<void>(resolve => {
			releaseFirst = resolve;
		});

		const first = queue.run(async () => {
			events.push('first:start');
			await firstGate;
			events.push('first:end');
			return 1;
		});
		const second = queue.run(() => {
			events.push('second');
			return Promise.resolve(2);
		});
		await Promise.resolve();
		expect(events).toEqual(['first:start']);

		releaseFirst();

		expect(await first).toBe(1);
		expect(await second).toBe(2);
		expect(events).toEqual(['first:start', 'first:end', 'second']);
	});

	it('rejects the failing caller only and keeps running later operations', async () => {
		const queue = new SerialQueue();
		const failing = queue.run(() => Promise.reject(new Error('boom')));
		const after = queue.run(() => Promise.resolve('still runs'));

		await expect(failing).rejects.toThrow('boom');
		expect(await after).toBe('still runs');
	});
});
