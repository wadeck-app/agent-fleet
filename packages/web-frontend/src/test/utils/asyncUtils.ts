import type { PaginatedLogsResponse } from '@shared/api/tasks.contract';
import { vi } from 'vitest';

/**
 * Crée une promise contrôlable pour tester les race conditions
 */
export function createControlledPromise<T>() {
	let resolveFunc: (value: T) => void;
	let rejectFunc: (error: any) => void;

	const promise = new Promise<T>((resolve, reject) => {
		resolveFunc = resolve;
		rejectFunc = reject;
	});

	return {
		promise,
		resolve: resolveFunc!,
		reject: rejectFunc!,
	};
}

/**
 * Mock API avec timing contrôlé
 */
export function createMockTasksApi() {
	const pendingCalls: Array<{ resolve: Function; reject: Function }> = [];

	const api = {
		getTaskLogs: vi.fn((taskId: string, query: any) => {
			const controlled = createControlledPromise<PaginatedLogsResponse>();
			pendingCalls.push(controlled);
			return controlled.promise;
		}),

		resolveNext: (response: PaginatedLogsResponse) => {
			if (pendingCalls.length === 0) throw new Error('No pending calls');
			const next = pendingCalls.shift()!;
			next.resolve(response);
		},

		resolveAll: (response: PaginatedLogsResponse) => {
			while (pendingCalls.length > 0) {
				api.resolveNext(response);
			}
		},

		getPendingCount: () => pendingCalls.length,
	};

	return api;
}
