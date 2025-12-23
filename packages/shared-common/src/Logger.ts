import { StateManager } from './StateManager.js';

/* eslint-disable no-console */

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
}

/**
 * Structured log entry for UI streaming and analysis
 */
export interface StructuredLogEntry {
	timestamp: string;
	level: 'debug' | 'info' | 'warn' | 'error';
	component: string; // 'orchestrator', 'worker', 'task-manager', etc.
	message: string;
	context?: Record<string, any>;
	taskId?: string;
	workerId?: string;
}

// ANSI color codes (matching backend logger)
const colors = {
	reset: '\x1b[0m',
	gray: '\x1b[90m',
	orange: '\x1b[33m',
	red: '\x1b[31m',
	bold: '\x1b[1m',
};

/**
 * Dedicated logger that emits to StateManager for UI display
 * Use this instead of console.log when running with UI
 * Formats logs consistently with backend: [HH:MM:SS.ms] [LEVEL] [component] message
 */
export class Logger {
	private static stateManager: StateManager | null = null;
	private static logLevel: LogLevel = LogLevel.INFO; // Default: INFO and above
	private static enableStructuredLogging: boolean = true;

	static initialize(stateManager: StateManager): void {
		this.stateManager = stateManager;
	}

	static setLogLevel(level: LogLevel): void {
		this.logLevel = level;
	}

	static setStructuredLogging(enabled: boolean): void {
		this.enableStructuredLogging = enabled;
	}

	// ============================================
	// Timestamp Formatting (backend compatible)
	// ============================================

	private static getTimestamp(): string {
		const now = new Date();
		const time = now.toTimeString().split(' ')[0];
		const ms = now.getMilliseconds().toString().padStart(3, '0');
		return `${time}.${ms}`;
	}

	// ============================================
	// Public API (backward compatible)
	// ============================================

	static log(...args: any[]): void {
		this.logWithLevel(LogLevel.INFO, ...args);
	}

	static debug(...args: any[]): void {
		this.logWithLevel(LogLevel.DEBUG, ...args);
	}

	static info(...args: any[]): void {
		this.logWithLevel(LogLevel.INFO, ...args);
	}

	static error(...args: any[]): void {
		this.logWithLevel(LogLevel.ERROR, ...args);
	}

	static warn(...args: any[]): void {
		this.logWithLevel(LogLevel.WARN, ...args);
	}

	// ============================================
	// New Structured Logging API
	// ============================================

	/**
	 * Log a structured message with component and context
	 * Format: [HH:MM:SS.ms] [LEVEL] [component] message
	 */
	static logStructured(
		level: 'debug' | 'info' | 'warn' | 'error',
		component: string,
		message: string,
		context?: {
			taskId?: string;
			workerId?: string;
			[key: string]: any;
		}
	): void {
		// Map string level to LogLevel enum
		const logLevelMap = {
			debug: LogLevel.DEBUG,
			info: LogLevel.INFO,
			warn: LogLevel.WARN,
			error: LogLevel.ERROR,
		};

		// Skip if below log level
		if (logLevelMap[level] < this.logLevel) {
			return;
		}

		const entry: StructuredLogEntry = {
			timestamp: new Date().toISOString(),
			level,
			component,
			message,
			context: context ? { ...context } : undefined,
			taskId: context?.taskId,
			workerId: context?.workerId,
		};

		// Console output (formatted consistently with backend)
		const levelStr = level.toUpperCase();
		const timestamp = this.getTimestamp();
		const formattedMessage = `[${timestamp}] [${levelStr.padStart(5)}] [${component}] ${message}`;

		// Apply color codes
		let coloredMessage: string;
		switch (level) {
			case 'debug':
				coloredMessage = `${colors.gray}${formattedMessage}${colors.reset}`;
				break;
			case 'warn':
				coloredMessage = `${colors.orange}${formattedMessage}${colors.reset}`;
				break;
			case 'error':
				coloredMessage = `${colors.bold}${colors.red}${formattedMessage}${colors.reset}`;
				break;
			case 'info':
			default:
				coloredMessage = formattedMessage;
		}

		// Output to console
		if (level === 'error') {
			console.error(coloredMessage);
		} else if (level === 'warn') {
			console.warn(coloredMessage);
		} else if (level === 'debug') {
			console.debug(coloredMessage);
		} else {
			console.info(coloredMessage);
		}

		// Emit to StateManager for UI streaming
		if (this.stateManager && this.enableStructuredLogging) {
			this.stateManager.emitLogMessage(JSON.stringify(entry));
		} else if (this.stateManager) {
			// Fallback to formatted message (without ANSI codes for state manager)
			this.stateManager.emitLogMessage(formattedMessage);
		}
	}

	// ============================================
	// Private Methods
	// ============================================

	private static logWithLevel(level: LogLevel, ...args: any[]): void {
		// Skip if below log level
		if (level < this.logLevel) {
			return;
		}

		// Format the message
		const message = args
			.map(arg => {
				if (typeof arg === 'object') {
					return JSON.stringify(arg);
				}
				return String(arg);
			})
			.join(' ');

		// Map LogLevel to string
		const levelStr = LogLevel[level].toLowerCase() as 'debug' | 'info' | 'warn' | 'error';

		// Use structured logging if enabled
		if (this.enableStructuredLogging) {
			this.logStructured(levelStr, 'system', message);
		} else {
			// Legacy behavior: format with timestamp and emit to state manager
			const timestamp = this.getTimestamp();
			const formattedMessage = `[${timestamp}] [${levelStr.toUpperCase().padStart(5)}] ${message}`;

			if (this.stateManager) {
				this.stateManager.emitLogMessage(formattedMessage);
			}
		}
	}
}
