/**
 * Creates a controllable promise that can be resolved or rejected on demand.
 * This is useful in tests to have full control over async operations timing,
 * avoiding flaky tests caused by setTimeout delays.
 *
 * @example
 * // Create a controllable submit function
 * const { fn: onSubmit, resolve } = createControllablePromise<[CreateBook], void>();
 *
 * render(<BookForm onSubmit={onSubmit} />);
 * fireEvent.click(submitButton);
 *
 * // Verify loading state
 * expect(screen.getByText(/saving.../i)).toBeInTheDocument();
 *
 * // Complete the promise when ready
 * resolve();
 *
 * // Verify completion state
 * await waitFor(() => {
 *   expect(screen.queryByText(/saving.../i)).not.toBeInTheDocument();
 * });
 */
export interface ControllablePromise<TArgs extends unknown[], TReturn> {
	// The function to use as a mock (e.g., for vi.fn or as a callback)
	fn: (...args: TArgs) => Promise<TReturn>;
	// Resolve the pending promise with a value
	resolve: (value?: TReturn) => void;
	// Reject the pending promise with an error
	reject: (error: Error) => void;
	// Get the last call arguments (useful for assertions)
	lastCall: () => TArgs | undefined;
	// Check if the function was called
	wasCalled: () => boolean;
}

export function createControllablePromise<TArgs extends unknown[] = [], TReturn = void>(): ControllablePromise<
	TArgs,
	TReturn
> {
	let resolvePromise: ((value: TReturn | PromiseLike<TReturn>) => void) | undefined;
	let rejectPromise: ((reason: Error) => void) | undefined;
	let lastCallArgs: TArgs | undefined;
	let called = false;

	const fn = (...args: TArgs): Promise<TReturn> => {
		called = true;
		lastCallArgs = args;

		return new Promise<TReturn>((resolve, reject) => {
			resolvePromise = resolve;
			rejectPromise = reject;
		});
	};

	const resolve = (value?: TReturn): void => {
		if (!resolvePromise) {
			throw new Error('Promise has not been created yet. Call the function first.');
		}
		resolvePromise(value as TReturn);
	};

	const reject = (error: Error): void => {
		if (!rejectPromise) {
			throw new Error('Promise has not been created yet. Call the function first.');
		}
		rejectPromise(error);
	};

	const lastCall = (): TArgs | undefined => lastCallArgs;

	const wasCalled = (): boolean => called;

	return { fn, resolve, reject, lastCall, wasCalled };
}
