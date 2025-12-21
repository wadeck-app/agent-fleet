import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, ErrorCode, ErrorSeverity } from './AppError';
import { errorLogger } from './ErrorLogger';

describe('ErrorLogger', () => {
	beforeEach(() => {
		// Clear local storage before each test
		errorLogger.clearLocalStorageLogs();

		// Reset configuration
		errorLogger.configure({
			enableConsole: false, // Disable console for tests
			enableExternalService: false,
			enableLocalStorage: true,
			maxLocalStorageEntries: 50,
			minSeverity: ErrorSeverity.LOW,
		});
	});

	describe('logError', () => {
		it('should log error to local storage', () => {
			const error = new AppError('Test error', ErrorCode.UNKNOWN_ERROR);

			errorLogger.logError(error);

			const logs = errorLogger.getLocalStorageLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0]!.error.message).toBe('Test error');
			expect(logs[0]!.error.code).toBe(ErrorCode.UNKNOWN_ERROR);
		});

		it('should include context in log entry', () => {
			const error = new AppError('Test error', ErrorCode.VALIDATION_ERROR);
			const context = { field: 'email', value: 'invalid' };

			errorLogger.logError(error, context);

			const logs = errorLogger.getLocalStorageLogs();
			expect(logs[0]!.context).toEqual(context);
		});

		it('should include component stack from ErrorInfo', () => {
			const error = new AppError('Component error', ErrorCode.UNKNOWN_ERROR);
			const errorInfo = {
				componentStack: 'at Component\n  at Parent',
			};

			errorLogger.logError(error, undefined, errorInfo);

			const logs = errorLogger.getLocalStorageLogs();
			expect(logs[0]!.componentStack).toBe('at Component\n  at Parent');
		});

		it('should skip logging errors below minimum severity', () => {
			errorLogger.configure({ minSeverity: ErrorSeverity.HIGH });

			const lowError = new AppError('Low severity', ErrorCode.VALIDATION_ERROR);
			const highError = new AppError('High severity', ErrorCode.NETWORK_ERROR);

			errorLogger.logError(lowError);
			errorLogger.logError(highError);

			const logs = errorLogger.getLocalStorageLogs();
			expect(logs).toHaveLength(1);
			expect(logs[0]!.error.severity).toBe(ErrorSeverity.HIGH);
		});

		it('should limit number of entries in local storage', () => {
			errorLogger.configure({ maxLocalStorageEntries: 3 });

			for (let i = 0; i < 5; i++) {
				const error = new AppError(`Error ${i}`, ErrorCode.UNKNOWN_ERROR);
				errorLogger.logError(error);
			}

			const logs = errorLogger.getLocalStorageLogs();
			expect(logs).toHaveLength(3);
			// Should keep the most recent entries
			expect(logs[0]!.error.message).toBe('Error 2');
			expect(logs[2]!.error.message).toBe('Error 4');
		});

		it('should call custom handler if provided', () => {
			const customHandler = vi.fn();
			errorLogger.configure({ customHandler });

			const error = new AppError('Test', ErrorCode.UNKNOWN_ERROR);
			errorLogger.logError(error);

			expect(customHandler).toHaveBeenCalledOnce();
			expect(customHandler.mock.calls[0]![0].error.message).toBe('Test');
		});
	});

	describe('getErrorStats', () => {
		it('should return empty stats when no errors logged', () => {
			const stats = errorLogger.getErrorStats();

			expect(stats.total).toBe(0);
			expect(stats.bySeverity[ErrorSeverity.LOW]).toBe(0);
		});

		it('should count errors by severity', () => {
			const lowError = new AppError('Low', ErrorCode.VALIDATION_ERROR);
			const highError1 = new AppError('High 1', ErrorCode.NETWORK_ERROR);
			const highError2 = new AppError('High 2', ErrorCode.SERVER_ERROR);

			errorLogger.logError(lowError);
			errorLogger.logError(highError1);
			errorLogger.logError(highError2);

			const stats = errorLogger.getErrorStats();

			expect(stats.total).toBe(3);
			expect(stats.bySeverity[ErrorSeverity.LOW]).toBe(1);
			expect(stats.bySeverity[ErrorSeverity.HIGH]).toBe(2);
		});

		it('should count errors by code', () => {
			const error1 = new AppError('Error 1', ErrorCode.VALIDATION_ERROR);
			const error2 = new AppError('Error 2', ErrorCode.VALIDATION_ERROR);
			const error3 = new AppError('Error 3', ErrorCode.NETWORK_ERROR);

			errorLogger.logError(error1);
			errorLogger.logError(error2);
			errorLogger.logError(error3);

			const stats = errorLogger.getErrorStats();

			expect(stats.byCode[ErrorCode.VALIDATION_ERROR]).toBe(2);
			expect(stats.byCode[ErrorCode.NETWORK_ERROR]).toBe(1);
		});
	});

	describe('exportLogs', () => {
		it('should export logs as JSON string', () => {
			const error = new AppError('Test', ErrorCode.UNKNOWN_ERROR);
			errorLogger.logError(error);

			const exported = errorLogger.exportLogs();
			const parsed = JSON.parse(exported);

			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed).toHaveLength(1);
			expect(parsed[0].error.message).toBe('Test');
		});
	});

	describe('clearLocalStorageLogs', () => {
		it('should clear all logs from local storage', () => {
			const error = new AppError('Test', ErrorCode.UNKNOWN_ERROR);
			errorLogger.logError(error);

			expect(errorLogger.getLocalStorageLogs()).toHaveLength(1);

			errorLogger.clearLocalStorageLogs();

			expect(errorLogger.getLocalStorageLogs()).toHaveLength(0);
		});
	});

	describe('configure', () => {
		it('should update configuration', () => {
			errorLogger.configure({
				minSeverity: ErrorSeverity.CRITICAL,
				maxLocalStorageEntries: 10,
			});

			// Test that configuration is applied by logging a non-critical error
			const error = new AppError('Test', ErrorCode.VALIDATION_ERROR);
			errorLogger.logError(error);

			const logs = errorLogger.getLocalStorageLogs();
			expect(logs).toHaveLength(0); // Should be skipped due to minSeverity
		});
	});
});
