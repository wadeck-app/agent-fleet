/**
 * Type guard to check if an error is an instance of Error
 */
export function isError(err: unknown): err is Error {
	return err instanceof Error;
}

/**
 * Safely extract an error message from an unknown error value
 * Handles Error instances, strings, and unknown types
 */
export function getErrorMessage(err: unknown): string {
	if (isError(err)) {
		return err.message;
	}
	if (typeof err === 'string') {
		return err;
	}
	if (typeof err === 'object' && err !== null && 'message' in err) {
		const message = (err as { message: unknown }).message;
		if (typeof message === 'string') {
			return message;
		}
	}
	return 'An unknown error occurred';
}

/**
 * Safely extract a full error for logging purposes
 * Always returns an Error instance
 */
export function normalizeError(err: unknown): Error {
	if (isError(err)) {
		return err;
	}
	if (typeof err === 'string') {
		return new Error(err);
	}
	if (typeof err === 'object' && err !== null && 'message' in err) {
		const message = (err as { message: unknown }).message;
		if (typeof message === 'string') {
			return new Error(message);
		}
	}
	return new Error('An unknown error occurred');
}
