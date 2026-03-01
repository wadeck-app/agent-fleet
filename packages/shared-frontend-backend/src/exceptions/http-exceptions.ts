/**
 * ===========================================================================================
 * HTTP EXCEPTIONS WITH ERROR CODES
 * ===========================================================================================
 *
 * Standardized error response format:
 * {
 *   error: string;           // Human-readable message
 *   code: string;            // Machine-readable code (e.g., "RESOURCE_NOT_FOUND")
 *   timestamp: string;       // ISO 8601 timestamp
 *   statusCode: number;      // HTTP status code
 *   details?: any;           // Optional additional context
 * }
 *
 * ===========================================================================================
 */

/**
 * Base HTTP Exception class
 * All custom HTTP exceptions extend from this
 */
export class HttpException extends Error {
	constructor(
		public readonly statusCode: number,
		message: string,
		public readonly code: string,
		public readonly details?: any
	) {
		super(message);
		this.name = this.constructor.name;
		// Maintains proper stack trace for where error was thrown (V8 only)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Convert exception to standard error response format
	 */
	toJSON(): ErrorResponse {
		return {
			error: this.message,
			code: this.code,
			statusCode: this.statusCode,
			timestamp: new Date().toISOString(),
			...(this.details && { details: this.details }),
		};
	}
}

/**
 * Standard error response interface
 */
export interface ErrorResponse {
	error: string;
	code: string;
	statusCode: number;
	timestamp: string;
	details?: any;
}

/**
 * ===========================================================================================
 * ERROR CODES - Machine-readable error identifiers
 * ===========================================================================================
 */
//FIXME no need to have code PER entity... that's a waste of code/time/readability
export const ERROR_CODES = {
	// 400 - Bad Request
	BAD_REQUEST: 'BAD_REQUEST',
	INVALID_INPUT: 'INVALID_INPUT',
	VALIDATION_FAILED: 'VALIDATION_FAILED',

	// 401 - Unauthorized
	UNAUTHORIZED: 'UNAUTHORIZED',
	INVALID_TOKEN: 'INVALID_TOKEN',
	TOKEN_EXPIRED: 'TOKEN_EXPIRED',

	// 403 - Forbidden
	FORBIDDEN: 'FORBIDDEN',
	INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

	// 404 - Not Found
	RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
	INGREDIENT_NOT_FOUND: 'INGREDIENT_NOT_FOUND',
	BOOK_NOT_FOUND: 'BOOK_NOT_FOUND',
	PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',

	// 409 - Conflict
	RESOURCE_CONFLICT: 'RESOURCE_CONFLICT',
	VERSION_MISMATCH: 'VERSION_MISMATCH',
	DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
	DUPLICATE_ISBN: 'DUPLICATE_ISBN',
	RESOURCE_IN_USE: 'RESOURCE_IN_USE',

	// 422 - Unprocessable Entity
	UNPROCESSABLE_ENTITY: 'UNPROCESSABLE_ENTITY',
	BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',

	// 500 - Internal Server Error
	INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
	DATABASE_ERROR: 'DATABASE_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * ===========================================================================================
 * EXCEPTION CLASSES
 * ===========================================================================================
 */

/**
 * 400 Bad Request
 * Client sent invalid data
 */
export class BadRequestException extends HttpException {
	constructor(message: string, code: ErrorCode = ERROR_CODES.BAD_REQUEST, details?: any) {
		super(400, message, code, details);
	}
}

/**
 * 401 Unauthorized
 * Authentication required or failed
 */
export class UnauthorizedException extends HttpException {
	constructor(message = 'Unauthorized', code: ErrorCode = ERROR_CODES.UNAUTHORIZED, details?: any) {
		super(401, message, code, details);
	}
}

/**
 * 403 Forbidden
 * Client doesn't have permission
 */
export class ForbiddenException extends HttpException {
	constructor(message = 'Forbidden', code: ErrorCode = ERROR_CODES.FORBIDDEN, details?: any) {
		super(403, message, code, details);
	}
}

/**
 * 404 Not Found
 * Resource doesn't exist
 */
export class NotFoundException extends HttpException {
	constructor(message: string, code: ErrorCode = ERROR_CODES.RESOURCE_NOT_FOUND, details?: any) {
		super(404, message, code, details);
	}
}

/**
 * 409 Conflict
 * Resource conflict (e.g., version mismatch, duplicate)
 */
export class ConflictException extends HttpException {
	constructor(message: string, code: ErrorCode = ERROR_CODES.RESOURCE_CONFLICT, details?: any) {
		super(409, message, code, details);
	}
}

/**
 * 422 Unprocessable Entity
 * Validation failed (semantic errors)
 */
export class UnprocessableEntityException extends HttpException {
	constructor(message: string, code: ErrorCode = ERROR_CODES.UNPROCESSABLE_ENTITY, details?: any) {
		super(422, message, code, details);
	}
}

/**
 * 500 Internal Server Error
 * Unexpected server error
 */
export class InternalServerErrorException extends HttpException {
	constructor(message = 'Internal Server Error', code: ErrorCode = ERROR_CODES.INTERNAL_SERVER_ERROR, details?: any) {
		super(500, message, code, details);
	}
}
