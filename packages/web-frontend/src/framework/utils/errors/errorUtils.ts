/**
 * Type guard to check if an error is an instance of Error
 */
export function isError(err: unknown): err is Error {
	return err instanceof Error;
}

/**
 * Type guard to check if an error is an API error with status and getUserMessage
 */
export function isApiError(err: unknown): err is { status: number; message: string; getUserMessage?: () => string } {
	return (
		typeof err === 'object' &&
		err !== null &&
		'status' in err &&
		typeof (err as { status: unknown }).status === 'number' &&
		'message' in err
	);
}

/**
 * Safely extract an error message from an unknown error value
 */
export function getErrorMessage(err: unknown): string {
	if (isApiError(err) && err.getUserMessage) {
		return err.getUserMessage();
	}
	if (isError(err)) {
		// Check if the message contains Zod validation errors (array format)
		try {
			const parsed = JSON.parse(err.message);
			if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
				// Extract first error message from Zod array
				return parsed[0].message;
			}
		} catch {
			// Not JSON or invalid format, use original message
		}
		return err.message;
	}
	if (typeof err === 'string') {
		// Check if the string is a Zod error array
		try {
			const parsed = JSON.parse(err);
			if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
				// Extract first error message from Zod array
				return parsed[0].message;
			}
		} catch {
			// Not JSON or invalid format, use original string
		}
		return err;
	}
	// Handle plain objects with message property (e.g., TransportError)
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
 */
export function normalizeError(err: unknown): Error {
	if (isError(err)) {
		return err;
	}
	if (typeof err === 'string') {
		return new Error(err);
	}
	return new Error('An unknown error occurred');
}

/**
 * Safely get the HTTP status code from an error
 */
export function getErrorStatus(err: unknown): number | undefined {
	if (isApiError(err)) {
		return err.status;
	}
	return undefined;
}
