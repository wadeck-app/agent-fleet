import { SandboxError } from '../SandboxError';

function describeCase(label: string | undefined): string {
	return label === undefined ? '' : ` [case: ${label}]`;
}

/**
 * The SandboxError thrown by `action`. Fails the test when it returns or throws anything else.
 * Pass `label` when several cases run in one test, so a failure names the case.
 */
export function failure(action: () => unknown, label?: string): SandboxError {
	try {
		action();
	} catch (error) {
		if (error instanceof SandboxError) return error;
		throw new Error(`Expected a SandboxError, got ${String(error)}${describeCase(label)}`);
	}
	throw new Error(`Expected the call to throw, but it returned${describeCase(label)}`);
}

/** The error of the given class that `promise` rejects with. Fails the test when it resolves or rejects otherwise. */
export async function rejectionOf<T extends Error>(
	errorType: abstract new (...args: never[]) => T,
	promise: Promise<unknown>,
	label?: string
): Promise<T> {
	try {
		await promise;
	} catch (error) {
		if (error instanceof errorType) return error;
		throw new Error(`Expected a ${errorType.name}, got ${String(error)}${describeCase(label)}`);
	}
	throw new Error(`Expected the promise to reject, but it resolved${describeCase(label)}`);
}

/** The SandboxError that `promise` rejects with. */
export function rejection(promise: Promise<unknown>, label?: string): Promise<SandboxError> {
	return rejectionOf(SandboxError, promise, label);
}
