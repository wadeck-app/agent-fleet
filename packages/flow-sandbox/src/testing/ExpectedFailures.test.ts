import { describe, expect, it } from 'vitest';

import { SandboxError } from '../SandboxError';
import { failure, rejection, rejectionOf } from './ExpectedFailures';

// The helpers every other test leans on: one that passed on a missing or a foreign error would hide failures.
describe('ExpectedFailures', () => {
	it('returns the SandboxError thrown or rejected', async () => {
		const thrown = new SandboxError('timeout', 'slow');

		expect(
			failure(() => {
				throw thrown;
			})
		).toBe(thrown);
		expect(await rejection(Promise.reject(thrown))).toBe(thrown);
		expect(await rejectionOf(TypeError, Promise.reject(new TypeError('x')))).toBeInstanceOf(TypeError);
	});

	it('fails the test, naming the case, when nothing is thrown or something else is', async () => {
		expect(() => failure(() => 1, 'my case')).toThrow(
			'Expected the call to throw, but it returned [case: my case]'
		);
		expect(() =>
			failure(() => {
				throw new Error('plain');
			}, 'my case')
		).toThrow('Expected a SandboxError, got Error: plain [case: my case]');
		await expect(rejection(Promise.resolve(1))).rejects.toThrow('Expected the promise to reject, but it resolved');
		await expect(rejection(Promise.reject(new Error('plain')), 'other')).rejects.toThrow(
			'Expected a SandboxError, got Error: plain [case: other]'
		);
	});
});
