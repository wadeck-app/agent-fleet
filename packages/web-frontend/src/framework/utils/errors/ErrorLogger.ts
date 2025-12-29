import type { ErrorInfo } from 'react';

import type { AppError } from './AppError';
import { ErrorSeverity } from './AppError';

/**
 * ===========================================================================================
 * ERROR LOGGER - Centralized Error Logging Service
 * ===========================================================================================
 *
 * Provides centralized error logging with multiple destinations:
 * - Console logging (development)
 * - External service integration (production)
 * - Local storage for offline fallback
 * - Structured error context
 *
 * ===========================================================================================
 */

export interface ErrorLogEntry {
	timestamp: string;
	error: AppError;
	context?: Record<string, unknown>;
	componentStack?: string;
	userAgent?: string;
	url?: string;
}

export interface ErrorLoggerConfig {
	// Enable console logging
	enableConsole?: boolean;
	// Enable external service logging
	enableExternalService?: boolean;
	// External service endpoint
	externalServiceUrl?: string;
	// Enable local storage fallback
	enableLocalStorage?: boolean;
	// Maximum entries in local storage
	maxLocalStorageEntries?: number;
	// Minimum severity to log
	minSeverity?: ErrorSeverity;
	// Custom error handler
	customHandler?: (entry: ErrorLogEntry) => void;
}

class ErrorLoggerService {
	private config: ErrorLoggerConfig = {
		enableConsole: true,
		enableExternalService: false,
		enableLocalStorage: true,
		maxLocalStorageEntries: 50,
		minSeverity: ErrorSeverity.LOW,
	};

	private readonly STORAGE_KEY = 'app_error_logs';

	/**
	 * Configure the error logger
	 */
	configure(config: Partial<ErrorLoggerConfig>): void {
		this.config = { ...this.config, ...config };
	}

	/**
	 * Log an error
	 */
	logError(error: AppError, context?: Record<string, unknown>, errorInfo?: ErrorInfo): void {
		// Check if error severity meets minimum threshold
		if (this.shouldSkipLogging(error)) {
			return;
		}

		const entry: ErrorLogEntry = {
			timestamp: new Date().toISOString(),
			error,
			context,
			componentStack: errorInfo?.componentStack ?? undefined,
			userAgent: navigator.userAgent ?? undefined,
			url: window.location.href,
		};

		// Log to console
		if (this.config.enableConsole) {
			this.logToConsole(entry);
		}

		// Log to local storage
		if (this.config.enableLocalStorage) {
			this.logToLocalStorage(entry);
		}

		// Log to external service
		if (this.config.enableExternalService && this.config.externalServiceUrl) {
			this.logToExternalService(entry);
		}

		// Custom handler
		if (this.config.customHandler) {
			try {
				this.config.customHandler(entry);
			} catch (err) {
				console.error('Error in custom error handler:', err);
			}
		}
	}

	/**
	 * Check if error should be skipped based on severity
	 */
	private shouldSkipLogging(error: AppError): boolean {
		const severityOrder: Record<ErrorSeverity, number> = {
			[ErrorSeverity.LOW]: 1,
			[ErrorSeverity.MEDIUM]: 2,
			[ErrorSeverity.HIGH]: 3,
			[ErrorSeverity.CRITICAL]: 4,
		};

		const minSeverity = this.config.minSeverity || ErrorSeverity.LOW;
		return severityOrder[error.severity] < severityOrder[minSeverity];
	}

	/**
	 * Log to console with appropriate formatting
	 */
	private logToConsole(entry: ErrorLogEntry): void {
		const { error, context, componentStack } = entry;

		// Use appropriate console method based on severity
		const consoleMethod = this.getConsoleMethod(error.severity);

		consoleMethod(`[${error.severity}] ${error.code}: ${error.message}`, {
			timestamp: entry.timestamp,
			error: error.toJSON(),
			context,
			componentStack,
			url: entry.url,
		});
	}

	/**
	 * Get appropriate console method for severity
	 */
	private getConsoleMethod(severity: ErrorSeverity): typeof console.log {
		switch (severity) {
			case ErrorSeverity.LOW:
				return console.info;
			case ErrorSeverity.MEDIUM:
				return console.warn;
			case ErrorSeverity.HIGH:
			case ErrorSeverity.CRITICAL:
				return console.error;
			default:
				return console.log;
		}
	}

	/**
	 * Log to local storage for offline fallback
	 */
	private logToLocalStorage(entry: ErrorLogEntry): void {
		try {
			const logs = this.getLocalStorageLogs();
			logs.push(entry);

			// Limit number of entries
			const maxEntries = this.config.maxLocalStorageEntries || 50;
			if (logs.length > maxEntries) {
				logs.splice(0, logs.length - maxEntries);
			}

			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(logs));
		} catch (err) {
			// Storage quota exceeded or disabled
			console.warn('Failed to log to local storage:', err);
		}
	}

	/**
	 * Log to external service
	 */
	private async logToExternalService(entry: ErrorLogEntry): Promise<void> {
		if (!this.config.externalServiceUrl) {
			return;
		}

		try {
			await fetch(this.config.externalServiceUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					...entry,
					error: entry.error.toJSON(),
				}),
			});
		} catch (err) {
			// Fail silently - don't throw errors from error logger
			console.warn('Failed to log to external service:', err);
		}
	}

	/**
	 * Get logs from local storage
	 */
	getLocalStorageLogs(): ErrorLogEntry[] {
		try {
			const logs = localStorage.getItem(this.STORAGE_KEY);
			return logs ? JSON.parse(logs) : [];
		} catch (err) {
			console.warn('Failed to retrieve logs from local storage:', err);
			return [];
		}
	}

	/**
	 * Clear logs from local storage
	 */
	clearLocalStorageLogs(): void {
		try {
			localStorage.removeItem(this.STORAGE_KEY);
		} catch (err) {
			console.warn('Failed to clear logs from local storage:', err);
		}
	}

	/**
	 * Export logs as JSON
	 */
	exportLogs(): string {
		const logs = this.getLocalStorageLogs();
		return JSON.stringify(logs, null, 2);
	}

	/**
	 * Get error statistics
	 */
	getErrorStats(): {
		total: number;
		bySeverity: Record<ErrorSeverity, number>;
		byCode: Record<string, number>;
	} {
		const logs = this.getLocalStorageLogs();

		const stats = {
			total: logs.length,
			bySeverity: {
				[ErrorSeverity.LOW]: 0,
				[ErrorSeverity.MEDIUM]: 0,
				[ErrorSeverity.HIGH]: 0,
				[ErrorSeverity.CRITICAL]: 0,
			},
			byCode: {} as Record<string, number>,
		};

		logs.forEach(log => {
			stats.bySeverity[log.error.severity]++;
			stats.byCode[log.error.code] = (stats.byCode[log.error.code] || 0) + 1;
		});

		return stats;
	}
}

// Export singleton instance
export const errorLogger = new ErrorLoggerService();

// Export type for testing
export type { ErrorLoggerService };
