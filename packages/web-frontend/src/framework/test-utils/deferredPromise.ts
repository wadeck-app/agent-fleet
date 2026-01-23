/**
 * ===========================================================================================
 * DEFERRED PROMISE UTILITY
 * ===========================================================================================
 *
 * Creates a promise with externally controllable resolution/rejection.
 * Essential for deterministic async testing without setTimeout.
 *
 * Usage in tests:
 * ```typescript
 * const deferred = createDeferredPromise<User>();
 * vi.mocked(api.getUser).mockReturnValue(deferred.promise);
 *
 * // Test UI in loading state
 * expect(screen.getByText('Loading...')).toBeInTheDocument();
 *
 * // Resolve when you want
 * deferred.resolve({ id: '1', name: 'Alice' });
 * await waitFor(() => expect(screen.getByText('Alice')).toBeInTheDocument());
 * ```
 *
 * Benefits:
 * - 100% deterministic timing control
 * - No setTimeout/arbitrary delays
 * - Test race conditions precisely
 * - Faster test execution
 *
 * ===========================================================================================
 */

export interface DeferredPromise<T> {
	promise: Promise<T>;
	resolve: (value: T | PromiseLike<T>) => void;
	reject: (reason?: any) => void;
	isResolved: boolean;
	isRejected: boolean;
}

/**
 * Create a promise with externally controllable resolution/rejection
 *
 * @returns Object with promise, resolve, reject, and status flags
 *
 * @example
 * ```typescript
 * const deferred = createDeferredPromise<WorkspaceScript>();
 *
 * vi.mocked(workspaceScriptsApi.updateWorkspaceScript)
 *   .mockReturnValue(deferred.promise);
 *
 * // Trigger async operation
 * fireEvent.click(saveButton);
 *
 * // Test loading state BEFORE resolving
 * expect(screen.getByText('Saving...')).toBeInTheDocument();
 *
 * // Resolve when ready
 * deferred.resolve(updatedScript);
 * await waitFor(() => expect(screen.getByText('Saved!')).toBeInTheDocument());
 * ```
 */
export function createDeferredPromise<T = void>(): DeferredPromise<T> {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: any) => void;
	let isResolved = false;
	let isRejected = false;

	const promise = new Promise<T>((res, rej) => {
		resolve = (value: T | PromiseLike<T>) => {
			isResolved = true;
			res(value);
		};
		reject = (reason?: any) => {
			isRejected = true;
			rej(reason);
		};
	});

	return {
		promise,
		resolve,
		reject,
		isResolved,
		isRejected,
	};
}
