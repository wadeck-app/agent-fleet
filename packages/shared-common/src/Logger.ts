import { StateManager } from './StateManager.js';

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

/**
 * Dedicated logger that emits to StateManager for UI display
 * Use this instead of console.log when running with UI
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
	// Public API (backward compatible)
	// ============================================

	static log(...args: any[]): void {
		this.logWithLevel(LogLevel.INFO, ...args);
	}

	static debug(...args: any[]): void {
		this.logWithLevel(LogLevel.DEBUG, ...args);
	}

	static info(...args: any[]): void {
		this.logWithLevel(LogLevel.INFO, '[INFO]', ...args);
	}

	static error(...args: any[]): void {
		this.logWithLevel(LogLevel.ERROR, '[ERROR]', ...args);
	}

	static warn(...args: any[]): void {
		this.logWithLevel(LogLevel.WARN, '[WARN]', ...args);
	}

	// ============================================
	// New Structured Logging API
	// ============================================

	/**
	 * Log a structured message with component and context
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

		// Console output (formatted)
		const prefix = `[${level.toUpperCase()}] [${component}]`;
		const contextStr =
			entry.taskId || entry.workerId ? ` (task:${entry.taskId || 'N/A'}, worker:${entry.workerId || 'N/A'})` : '';
		console.log(`${prefix} ${message}${contextStr}`);

		// Emit to StateManager for UI streaming
		if (this.stateManager && this.enableStructuredLogging) {
			this.stateManager.emitLogMessage(JSON.stringify(entry));
		} else if (this.stateManager) {
			// Fallback to simple message (backward compatible)
			this.stateManager.emitLogMessage(`${prefix} ${message}${contextStr}`);
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
			// Legacy behavior: emit to state manager for UI (if initialized)
			if (this.stateManager) {
				this.stateManager.emitLogMessage(message);
			}
		}
	}
}
