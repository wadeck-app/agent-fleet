/**
 * ===========================================================================================
 * APP ERROR - Centralized Error Handling
 * ===========================================================================================
 *
 * Structured error class with error codes for consistent error handling across the app.
 * - Type-safe error codes
 * - User-friendly error messages
 * - Optional original error for debugging
 * - HTTP status code mapping
 *
 * ===========================================================================================
 */

/**
 * Error codes for different error scenarios
 */
export enum ErrorCode {
	// Network errors
	NETWORK_ERROR = 'NETWORK_ERROR',
	TIMEOUT = 'TIMEOUT',
	CONNECTION_REFUSED = 'CONNECTION_REFUSED',

	// API errors
	API_ERROR = 'API_ERROR',
	UNAUTHORIZED = 'UNAUTHORIZED',
	FORBIDDEN = 'FORBIDDEN',
	NOT_FOUND = 'NOT_FOUND',
	CONFLICT = 'CONFLICT',
	UNPROCESSABLE_ENTITY = 'UNPROCESSABLE_ENTITY',
	SERVER_ERROR = 'SERVER_ERROR',

	// Validation errors
	VALIDATION_ERROR = 'VALIDATION_ERROR',
	INVALID_INPUT = 'INVALID_INPUT',
	REQUIRED_FIELD = 'REQUIRED_FIELD',

	// Business logic errors
	DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
	RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
	OPERATION_FAILED = 'OPERATION_FAILED',

	// Client errors
	UNKNOWN_ERROR = 'UNKNOWN_ERROR',
	PARSE_ERROR = 'PARSE_ERROR',
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
	LOW = 'LOW', // Info/warning level
	MEDIUM = 'MEDIUM', // User action required
	HIGH = 'HIGH', // Critical error
	CRITICAL = 'CRITICAL', // App-breaking error
}

/**
 * Centralized application error class
 */
export class AppError extends Error {
	public readonly code: string;
	public readonly severity: ErrorSeverity;
	public readonly statusCode?: number;
	public readonly originalError?: Error;
	public readonly timestamp: Date;
	public readonly context?: Record<string, unknown>;

	constructor(
		message: string,
		// violations-suppress: ts/no-union-with-string string fallback for unknown error codes from external APIs
		codeOrOptions?:
			| ErrorCode
			| string
			| {
					code?: ErrorCode | string; // violations-suppress: ts/no-union-with-string accepts unknown error codes from external sources
					severity?: ErrorSeverity;
					statusCode?: number;
					originalError?: Error;
					context?: Record<string, unknown>;
			  },
		options?: {
			severity?: ErrorSeverity;
			statusCode?: number;
			originalError?: Error;
			context?: Record<string, unknown>;
		}
	) {
		super(message);
		this.name = 'AppError';

		// Support both old and new signatures
		if (typeof codeOrOptions === 'string') {
			// Old signature: (message, code, options)
			this.code = codeOrOptions;
			this.severity = options?.severity || this.inferSeverity(codeOrOptions as ErrorCode);
			this.statusCode = options?.statusCode;
			this.originalError = options?.originalError;
			this.context = options?.context;
		} else if (codeOrOptions && typeof codeOrOptions === 'object') {
			// New signature: (message, { code, severity, ... })
			this.code = codeOrOptions.code || ErrorCode.UNKNOWN_ERROR;
			this.severity =
				codeOrOptions.severity ||
				this.inferSeverity((codeOrOptions.code as ErrorCode) || ErrorCode.UNKNOWN_ERROR);
			this.statusCode = codeOrOptions.statusCode;
			this.originalError = codeOrOptions.originalError;
			this.context = codeOrOptions.context;
		} else {
			// Default: (message)
			this.code = ErrorCode.UNKNOWN_ERROR;
			this.severity = this.inferSeverity(ErrorCode.UNKNOWN_ERROR);
		}

		this.timestamp = new Date();

		// Maintains proper stack trace for where our error was thrown (only available on V8)
		const ErrorConstructor = Error as unknown as {
			captureStackTrace?: (target: object, constructor: Function) => void;
		};
		if (ErrorConstructor.captureStackTrace) {
			ErrorConstructor.captureStackTrace(this, AppError);
		}
	}

	/**
	 * Infer severity from error code
	 */
	private inferSeverity(code: ErrorCode): ErrorSeverity {
		switch (code) {
			case ErrorCode.NETWORK_ERROR:
			case ErrorCode.TIMEOUT:
			case ErrorCode.CONNECTION_REFUSED:
			case ErrorCode.SERVER_ERROR:
				return ErrorSeverity.HIGH;

			case ErrorCode.UNAUTHORIZED:
			case ErrorCode.FORBIDDEN:
				return ErrorSeverity.MEDIUM;

			case ErrorCode.VALIDATION_ERROR:
			case ErrorCode.INVALID_INPUT:
			case ErrorCode.REQUIRED_FIELD:
			case ErrorCode.NOT_FOUND:
				return ErrorSeverity.LOW;

			case ErrorCode.UNKNOWN_ERROR:
			case ErrorCode.PARSE_ERROR:
				return ErrorSeverity.CRITICAL;

			default:
				throw new Error(`Unexpected switch value`);
		}
	}

	/**
	 * Get user-friendly message based on error code
	 */
	public getUserMessage(): string {
		// Return custom message if provided
		if (this.message && this.message !== this.code) {
			return this.message;
		}

		// Default messages by error code
		switch (this.code) {
			case ErrorCode.NETWORK_ERROR:
				return 'Unable to connect to the server. Please check your internet connection.';
			case ErrorCode.TIMEOUT:
				return 'The request took too long to complete. Please try again.';
			case ErrorCode.CONNECTION_REFUSED:
				return 'Connection to server was refused. The server may be down.';
			case ErrorCode.UNAUTHORIZED:
				return 'You need to log in to access this resource.';
			case ErrorCode.FORBIDDEN:
				return 'You do not have permission to access this resource.';
			case ErrorCode.NOT_FOUND:
				return 'The requested resource was not found.';
			case ErrorCode.CONFLICT:
				return 'This operation conflicts with existing data.';
			case ErrorCode.UNPROCESSABLE_ENTITY:
				return 'The data you provided could not be processed.';
			case ErrorCode.SERVER_ERROR:
				return 'An error occurred on the server. Please try again later.';
			case ErrorCode.VALIDATION_ERROR:
				return 'Please check your input and try again.';
			case ErrorCode.INVALID_INPUT:
				return 'The provided input is invalid.';
			case ErrorCode.REQUIRED_FIELD:
				return 'Please fill in all required fields.';
			case ErrorCode.DUPLICATE_ENTRY:
				return 'This entry already exists.';
			case ErrorCode.RESOURCE_NOT_FOUND:
				return 'The requested item could not be found.';
			case ErrorCode.OPERATION_FAILED:
				return 'The operation could not be completed.';
			case ErrorCode.PARSE_ERROR:
				return 'Failed to process the server response.';
			default:
				throw new Error(`Unexpected switch value`);
		}
	}

	/**
	 * Check if error is network-related
	 */
	public isNetworkError(): boolean {
		return [ErrorCode.NETWORK_ERROR, ErrorCode.TIMEOUT, ErrorCode.CONNECTION_REFUSED].includes(
			this.code as ErrorCode
		);
	}

	/**
	 * Check if error is authentication-related
	 */
	public isAuthError(): boolean {
		return [ErrorCode.UNAUTHORIZED, ErrorCode.FORBIDDEN].includes(this.code as ErrorCode);
	}

	/**
	 * Check if error is validation-related
	 */
	public isValidationError(): boolean {
		return [ErrorCode.VALIDATION_ERROR, ErrorCode.INVALID_INPUT, ErrorCode.REQUIRED_FIELD].includes(
			this.code as ErrorCode
		);
	}

	/**
	 * Convert to JSON for logging/reporting
	 */
	public toJSON() {
		return {
			name: this.name,
			message: this.message,
			userMessage: this.getUserMessage(),
			code: this.code,
			severity: this.severity,
			statusCode: this.statusCode,
			timestamp: this.timestamp.toISOString(),
			context: this.context,
			stack: this.stack,
			originalError: this.originalError
				? {
						message: this.originalError.message,
						stack: this.originalError.stack,
					}
				: undefined,
		};
	}
}

/**
 * Factory functions for common error scenarios
 */
export const createNetworkError = (message?: string, originalError?: Error) =>
	new AppError(message || 'Network error occurred', ErrorCode.NETWORK_ERROR, { originalError });

export const createValidationError = (message: string, context?: Record<string, unknown>) =>
	new AppError(message, ErrorCode.VALIDATION_ERROR, { context });

export const createNotFoundError = (resource: string) =>
	new AppError(`${resource} not found`, ErrorCode.RESOURCE_NOT_FOUND);

export const createUnauthorizedError = () => new AppError('Unauthorized access', ErrorCode.UNAUTHORIZED);

export const createServerError = (message?: string, statusCode?: number) =>
	new AppError(message || 'Server error', ErrorCode.SERVER_ERROR, { statusCode });

/**
 * Convert HTTP status code to AppError
 */
export const fromHttpError = (statusCode: number, message?: string, originalError?: Error): AppError => {
	let code: ErrorCode;

	switch (statusCode) {
		case 400:
			code = ErrorCode.INVALID_INPUT;
			break;
		case 401:
			code = ErrorCode.UNAUTHORIZED;
			break;
		case 403:
			code = ErrorCode.FORBIDDEN;
			break;
		case 404:
			code = ErrorCode.NOT_FOUND;
			break;
		case 409:
			code = ErrorCode.CONFLICT;
			break;
		case 422:
			code = ErrorCode.UNPROCESSABLE_ENTITY;
			break;
		case 500:
		case 502:
		case 503:
		case 504:
			code = ErrorCode.SERVER_ERROR;
			break;
		default:
			code = ErrorCode.API_ERROR;
	}

	return new AppError(message || `HTTP ${statusCode} error`, code, {
		statusCode,
		originalError,
	});
};

/**
 * Convert unknown error to AppError
 */
export const toAppError = (error: unknown): AppError => {
	// Already an AppError
	if (error instanceof AppError) {
		return error;
	}

	// Standard Error
	if (error instanceof Error) {
		return new AppError(String(error), ErrorCode.UNKNOWN_ERROR, {
			originalError: error,
		});
	}

	// String error
	if (typeof error === 'string') {
		return new AppError(error, ErrorCode.UNKNOWN_ERROR);
	}

	// Unknown error type
	return new AppError('An unknown error occurred', ErrorCode.UNKNOWN_ERROR, {
		context: { rawError: error },
	});
};
