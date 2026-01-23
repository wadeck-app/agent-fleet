import { createDeferredPromise } from '@framework/test-utils/deferredPromise';
import { describe, expect, it } from 'vitest';

import { createControllablePromise } from './createControllablePromise';

describe('createControllablePromise', () => {
	describe('basic functionality', () => {
		it('should create a function that returns a promise', () => {
			const { fn } = createControllablePromise<[], void>();

			const promise = fn();

			expect(promise).toBeInstanceOf(Promise);
		});

		it('should track if function was called', () => {
			const { fn, wasCalled } = createControllablePromise<[], void>();

			expect(wasCalled()).toBe(false);

			fn();

			expect(wasCalled()).toBe(true);
		});

		it('should capture last call arguments', () => {
			const { fn, lastCall } = createControllablePromise<[string, number], void>();

			fn('test', 42);

			expect(lastCall()).toEqual(['test', 42]);
		});

		it('should return undefined for lastCall when not called yet', () => {
			const { lastCall } = createControllablePromise<[string], void>();

			expect(lastCall()).toBeUndefined();
		});
	});

	describe('resolve', () => {
		it('should resolve the promise when resolve is called', async () => {
			const { fn, resolve } = createControllablePromise<[], string>();

			const promise = fn();

			// Promise should be pending
			let resolved = false;
			promise.then(() => {
				resolved = true;
			});

			// Add comment above the target line, not at the end
			// Wait a tick to ensure promise doesn't resolve immediately
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;
			expect(resolved).toBe(false);

			// Resolve the promise
			resolve('success');

			// Promise should now resolve
			await expect(promise).resolves.toBe('success');
			expect(resolved).toBe(true);
		});

		it('should throw if resolve is called before function is called', () => {
			const { resolve } = createControllablePromise<[], void>();

			expect(() => resolve()).toThrow('Promise has not been created yet. Call the function first.');
		});

		it('should resolve with undefined when no value provided', async () => {
			const { fn, resolve } = createControllablePromise<[], void>();

			const promise = fn();
			resolve();

			await expect(promise).resolves.toBeUndefined();
		});
	});

	describe('reject', () => {
		it('should reject the promise when reject is called', async () => {
			const { fn, reject } = createControllablePromise<[], void>();

			const promise = fn();

			// Promise should be pending
			let rejected = false;
			promise.catch(() => {
				rejected = true;
			});

			// Add comment above the target line, not at the end
			// Wait a tick to ensure promise doesn't reject immediately
			const deferred = createDeferredPromise<void>();
			deferred.resolve();
			await deferred.promise;
			expect(rejected).toBe(false);

			// Reject the promise
			const error = new Error('test error');
			reject(error);

			// Promise should now reject
			await expect(promise).rejects.toThrow('test error');
			expect(rejected).toBe(true);
		});

		it('should throw if reject is called before function is called', () => {
			const { reject } = createControllablePromise<[], void>();

			expect(() => reject(new Error('test'))).toThrow(
				'Promise has not been created yet. Call the function first.'
			);
		});
	});

	describe('multiple calls', () => {
		it('should create a new promise for each call', async () => {
			const { fn, resolve } = createControllablePromise<[], string>();

			const promise1 = fn();
			resolve('first');
			await expect(promise1).resolves.toBe('first');

			const promise2 = fn();
			resolve('second');
			await expect(promise2).resolves.toBe('second');
		});

		it('should update lastCall with each invocation', () => {
			const { fn, lastCall } = createControllablePromise<[number], void>();

			fn(1);
			expect(lastCall()).toEqual([1]);

			fn(2);
			expect(lastCall()).toEqual([2]);

			fn(3);
			expect(lastCall()).toEqual([3]);
		});
	});

	describe('type safety', () => {
		it('should work with complex argument types', () => {
			interface TestData {
				name: string;
				age: number;
			}

			const { fn, lastCall } = createControllablePromise<[TestData], void>();

			fn({ name: 'Alice', age: 30 });

			expect(lastCall()).toEqual([{ name: 'Alice', age: 30 }]);
		});

		it('should work with multiple arguments', () => {
			const { fn, lastCall } = createControllablePromise<[string, number, boolean], void>();

			fn('test', 42, true);

			expect(lastCall()).toEqual(['test', 42, true]);
		});

		it('should work with return value type', async () => {
			interface Result {
				success: boolean;
				message: string;
			}

			const { fn, resolve } = createControllablePromise<[], Result>();

			const promise = fn();
			const result: Result = { success: true, message: 'Done' };
			resolve(result);

			await expect(promise).resolves.toEqual(result);
		});
	});
});
