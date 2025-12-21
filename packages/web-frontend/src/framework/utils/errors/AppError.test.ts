import { describe, expect, it } from 'vitest';

import {
	AppError,
	ErrorCode,
	ErrorSeverity,
	createNetworkError,
	createNotFoundError,
	createServerError,
	createUnauthorizedError,
	createValidationError,
	fromHttpError,
	toAppError,
} from './AppError';

describe('AppError', () => {
	describe('constructor', () => {
		it('should create an error with default values', () => {
			const error = new AppError('Test error');

			expect(error.message).toBe('Test error');
			expect(error.code).toBe(ErrorCode.UNKNOWN_ERROR);
			expect(error.severity).toBe(ErrorSeverity.CRITICAL);
			expect(error.name).toBe('AppError');
			expect(error.timestamp).toBeInstanceOf(Date);
		});

		it('should create an error with custom code and options', () => {
			const originalError = new Error('Original');
			const error = new AppError('Custom error', ErrorCode.VALIDATION_ERROR, {
				severity: ErrorSeverity.LOW,
				statusCode: 400,
				originalError,
				context: { field: 'email' },
			});

			expect(error.message).toBe('Custom error');
			expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
			expect(error.severity).toBe(ErrorSeverity.LOW);
			expect(error.statusCode).toBe(400);
			expect(error.originalError).toBe(originalError);
			expect(error.context).toEqual({ field: 'email' });
		});
	});

	describe('inferSeverity', () => {
		it('should infer HIGH severity for network errors', () => {
			const error = new AppError('Network error', ErrorCode.NETWORK_ERROR);
			expect(error.severity).toBe(ErrorSeverity.HIGH);
		});

		it('should infer MEDIUM severity for auth errors', () => {
			const error = new AppError('Unauthorized', ErrorCode.UNAUTHORIZED);
			expect(error.severity).toBe(ErrorSeverity.MEDIUM);
		});

		it('should infer LOW severity for validation errors', () => {
			const error = new AppError('Invalid input', ErrorCode.VALIDATION_ERROR);
			expect(error.severity).toBe(ErrorSeverity.LOW);
		});

		it('should infer CRITICAL severity for unknown errors', () => {
			const error = new AppError('Unknown', ErrorCode.UNKNOWN_ERROR);
			expect(error.severity).toBe(ErrorSeverity.CRITICAL);
		});
	});

	describe('getUserMessage', () => {
		it('should return custom message when provided', () => {
			const error = new AppError('Custom message', ErrorCode.NETWORK_ERROR);
			expect(error.getUserMessage()).toBe('Custom message');
		});

		it('should return default message for NETWORK_ERROR', () => {
			const error = new AppError('', ErrorCode.NETWORK_ERROR);
			expect(error.getUserMessage()).toContain('connect to the server');
		});

		it('should return default message for UNAUTHORIZED', () => {
			const error = new AppError('', ErrorCode.UNAUTHORIZED);
			expect(error.getUserMessage()).toContain('log in');
		});

		it('should return default message for VALIDATION_ERROR', () => {
			const error = new AppError('', ErrorCode.VALIDATION_ERROR);
			expect(error.getUserMessage()).toContain('check your input');
		});
	});

	describe('helper methods', () => {
		it('should identify network errors', () => {
			const networkError = new AppError('Network', ErrorCode.NETWORK_ERROR);
			const validationError = new AppError('Validation', ErrorCode.VALIDATION_ERROR);

			expect(networkError.isNetworkError()).toBe(true);
			expect(validationError.isNetworkError()).toBe(false);
		});

		it('should identify auth errors', () => {
			const authError = new AppError('Unauthorized', ErrorCode.UNAUTHORIZED);
			const validationError = new AppError('Validation', ErrorCode.VALIDATION_ERROR);

			expect(authError.isAuthError()).toBe(true);
			expect(validationError.isAuthError()).toBe(false);
		});

		it('should identify validation errors', () => {
			const validationError = new AppError('Invalid', ErrorCode.VALIDATION_ERROR);
			const networkError = new AppError('Network', ErrorCode.NETWORK_ERROR);

			expect(validationError.isValidationError()).toBe(true);
			expect(networkError.isValidationError()).toBe(false);
		});
	});

	describe('toJSON', () => {
		it('should serialize error to JSON', () => {
			const originalError = new Error('Original');
			const error = new AppError('Test error', ErrorCode.VALIDATION_ERROR, {
				statusCode: 400,
				originalError,
				context: { field: 'email' },
			});

			const json = error.toJSON();

			expect(json.name).toBe('AppError');
			expect(json.message).toBe('Test error');
			expect(json.code).toBe(ErrorCode.VALIDATION_ERROR);
			expect(json.severity).toBe(ErrorSeverity.LOW);
			expect(json.statusCode).toBe(400);
			expect(json.context).toEqual({ field: 'email' });
			expect(json.originalError).toBeDefined();
			expect(json.originalError?.message).toBe('Original');
		});
	});

	describe('factory functions', () => {
		it('should create network error', () => {
			const error = createNetworkError('Connection failed');

			expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
			expect(error.message).toBe('Connection failed');
		});

		it('should create validation error with context', () => {
			const error = createValidationError('Invalid email', { field: 'email' });

			expect(error.code).toBe(ErrorCode.VALIDATION_ERROR);
			expect(error.message).toBe('Invalid email');
			expect(error.context).toEqual({ field: 'email' });
		});

		it('should create not found error', () => {
			const error = createNotFoundError('User');

			expect(error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
			expect(error.message).toBe('User not found');
		});

		it('should create unauthorized error', () => {
			const error = createUnauthorizedError();

			expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
		});

		it('should create server error', () => {
			const error = createServerError('Internal error', 500);

			expect(error.code).toBe(ErrorCode.SERVER_ERROR);
			expect(error.statusCode).toBe(500);
		});
	});

	describe('fromHttpError', () => {
		it('should convert 400 to INVALID_INPUT', () => {
			const error = fromHttpError(400, 'Bad request');

			expect(error.code).toBe(ErrorCode.INVALID_INPUT);
			expect(error.statusCode).toBe(400);
		});

		it('should convert 401 to UNAUTHORIZED', () => {
			const error = fromHttpError(401);

			expect(error.code).toBe(ErrorCode.UNAUTHORIZED);
			expect(error.statusCode).toBe(401);
		});

		it('should convert 404 to NOT_FOUND', () => {
			const error = fromHttpError(404);

			expect(error.code).toBe(ErrorCode.NOT_FOUND);
			expect(error.statusCode).toBe(404);
		});

		it('should convert 500 to SERVER_ERROR', () => {
			const error = fromHttpError(500);

			expect(error.code).toBe(ErrorCode.SERVER_ERROR);
			expect(error.statusCode).toBe(500);
		});

		it('should handle unknown status codes', () => {
			const error = fromHttpError(418);

			expect(error.code).toBe(ErrorCode.API_ERROR);
			expect(error.statusCode).toBe(418);
		});
	});

	describe('toAppError', () => {
		it('should return AppError as-is', () => {
			const original = new AppError('Test', ErrorCode.VALIDATION_ERROR);
			const converted = toAppError(original);

			expect(converted).toBe(original);
		});

		it('should convert Error to AppError', () => {
			const error = new Error('Test error');
			const appError = toAppError(error);

			expect(appError).toBeInstanceOf(AppError);
			expect(appError.message).toBe('Test error');
			expect(appError.code).toBe(ErrorCode.UNKNOWN_ERROR);
			expect(appError.originalError).toBe(error);
		});

		it('should convert string to AppError', () => {
			const appError = toAppError('String error');

			expect(appError).toBeInstanceOf(AppError);
			expect(appError.message).toBe('String error');
			expect(appError.code).toBe(ErrorCode.UNKNOWN_ERROR);
		});

		it('should convert unknown type to AppError', () => {
			const appError = toAppError({ foo: 'bar' });

			expect(appError).toBeInstanceOf(AppError);
			expect(appError.message).toBe('An unknown error occurred');
			expect(appError.code).toBe(ErrorCode.UNKNOWN_ERROR);
		});
	});
});
