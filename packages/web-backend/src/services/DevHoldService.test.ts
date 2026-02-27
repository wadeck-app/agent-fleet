import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevHoldService } from './DevHoldService';

describe('DevHoldService', () => {
	let service: DevHoldService;

	beforeEach(() => {
		service = new DevHoldService();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('register', () => {
		it('should return a unique ID', () => {
			const id1 = service.register('PATCH /api/tickets');
			const id2 = service.register('PATCH /api/tickets');

			expect(id1).toBeTruthy();
			expect(id2).toBeTruthy();
			expect(id1).not.toBe(id2);
		});

		it('should create a hold that can be retrieved', () => {
			const id = service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('PATCH', '/api/tickets/123');

			expect(promise).toBeInstanceOf(Promise);
		});
	});

	describe('getHoldPromise', () => {
		it('should return null when no holds are active', () => {
			const promise = service.getHoldPromise('GET', '/api/tickets');

			expect(promise).toBeNull();
		});

		it('should match full pattern "PATCH /api/tickets" against "PATCH /api/tickets/abc123"', () => {
			service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('PATCH', '/api/tickets/abc123');

			expect(promise).toBeInstanceOf(Promise);
		});

		it('should match exact pattern "PATCH /api/tickets" against exact URL "PATCH /api/tickets"', () => {
			service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('PATCH', '/api/tickets');

			expect(promise).toBeInstanceOf(Promise);
		});

		it('should NOT match different method', () => {
			service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('GET', '/api/tickets');

			expect(promise).toBeNull();
		});

		it('should match url-only pattern "/api/tickets" against any method', () => {
			service.register('/api/tickets');
			const getPromise = service.getHoldPromise('GET', '/api/tickets/123');
			const patchPromise = service.getHoldPromise('PATCH', '/api/tickets/456');
			const postPromise = service.getHoldPromise('POST', '/api/tickets');

			expect(getPromise).toBeInstanceOf(Promise);
			expect(patchPromise).toBeInstanceOf(Promise);
			expect(postPromise).toBeInstanceOf(Promise);
		});

		it('should NOT match unrelated URL', () => {
			service.register('/api/tickets');
			const promise = service.getHoldPromise('GET', '/api/projects');

			expect(promise).toBeNull();
		});

		it('should match case-insensitive method', () => {
			service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('patch', '/api/tickets');

			expect(promise).toBeInstanceOf(Promise);
		});
	});

	describe('release', () => {
		it('should resolve the promise when released', async () => {
			const id = service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('PATCH', '/api/tickets');

			let resolved = false;
			promise?.then(() => {
				resolved = true;
			});

			// Promise should not be resolved yet
			await Promise.resolve();
			expect(resolved).toBe(false);

			// Release the hold
			const result = service.release(id);
			expect(result).toBe(true);

			// Promise should now be resolved
			await Promise.resolve();
			expect(resolved).toBe(true);
		});

		it('should return false when releasing unknown id', () => {
			const result = service.release('unknown-id');

			expect(result).toBe(false);
		});

		it('should clear the timer when released', () => {
			const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
			const id = service.register('PATCH /api/tickets');

			service.release(id);

			expect(clearTimeoutSpy).toHaveBeenCalled();
		});

		it('should remove the hold from the list after release', () => {
			const id = service.register('PATCH /api/tickets');
			expect(service.list()).toHaveLength(1);

			service.release(id);

			expect(service.list()).toHaveLength(0);
		});
	});

	describe('releaseAll', () => {
		it('should resolve all promises', async () => {
			const id1 = service.register('PATCH /api/tickets');
			const id2 = service.register('GET /api/projects');

			const promise1 = service.getHoldPromise('PATCH', '/api/tickets');
			const promise2 = service.getHoldPromise('GET', '/api/projects');

			let resolved1 = false;
			let resolved2 = false;

			promise1?.then(() => {
				resolved1 = true;
			});
			promise2?.then(() => {
				resolved2 = true;
			});

			// Promises should not be resolved yet
			await Promise.resolve();
			expect(resolved1).toBe(false);
			expect(resolved2).toBe(false);

			// Release all
			service.releaseAll();

			// Promises should now be resolved
			await Promise.resolve();
			expect(resolved1).toBe(true);
			expect(resolved2).toBe(true);
		});

		it('should clear all timers', () => {
			const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
			service.register('PATCH /api/tickets');
			service.register('GET /api/projects');

			service.releaseAll();

			expect(clearTimeoutSpy).toHaveBeenCalledTimes(2);
		});

		it('should clear the holds list', () => {
			service.register('PATCH /api/tickets');
			service.register('GET /api/projects');
			expect(service.list()).toHaveLength(2);

			service.releaseAll();

			expect(service.list()).toHaveLength(0);
		});
	});

	describe('list', () => {
		it('should return empty array when no holds', () => {
			const holds = service.list();

			expect(holds).toEqual([]);
		});

		it('should return all active holds with id and pattern', () => {
			service.register('PATCH /api/tickets');
			service.register('GET /api/projects');

			const holds = service.list();

			expect(holds).toHaveLength(2);
			expect(holds[0]).toHaveProperty('id');
			expect(holds[0]).toHaveProperty('pattern');
			expect(holds[0].pattern).toBe('PATCH /api/tickets');
			expect(holds[1].pattern).toBe('GET /api/projects');
		});
	});

	describe('auto-expire', () => {
		it('should auto-release after AUTO_EXPIRE_MS', async () => {
			const id = service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('PATCH', '/api/tickets');

			let resolved = false;
			promise?.then(() => {
				resolved = true;
			});

			// Promise should not be resolved yet
			await Promise.resolve();
			expect(resolved).toBe(false);

			// Fast-forward time by 30 seconds (AUTO_EXPIRE_MS)
			vi.advanceTimersByTime(30_000);

			// Promise should now be resolved
			await Promise.resolve();
			expect(resolved).toBe(true);

			// Hold should be removed from list
			expect(service.list()).toHaveLength(0);
		});

		it('should not auto-release before AUTO_EXPIRE_MS', async () => {
			const id = service.register('PATCH /api/tickets');
			const promise = service.getHoldPromise('PATCH', '/api/tickets');

			let resolved = false;
			promise?.then(() => {
				resolved = true;
			});

			// Fast-forward time by 29 seconds (just before AUTO_EXPIRE_MS)
			vi.advanceTimersByTime(29_000);

			// Promise should not be resolved yet
			await Promise.resolve();
			expect(resolved).toBe(false);

			// Hold should still be in list
			expect(service.list()).toHaveLength(1);
		});
	});
});
