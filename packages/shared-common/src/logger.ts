type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ANSI color codes
const colors = {
	reset: '\x1b[0m',
	gray: '\x1b[90m',
	orange: '\x1b[33m',
	red: '\x1b[31m',
	bold: '\x1b[1m',
};

class Logger {
	private level: LogLevel;

	constructor() {
		this.level = (process.env.LOG_LEVEL as LogLevel) || 'debug';
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
		return levels.indexOf(level) >= levels.indexOf(this.level);
	}

	private getTimestamp(): string {
		const now = new Date();
		const time = now.toTimeString().split(' ')[0];
		const ms = now.getMilliseconds().toString().padStart(3, '0');
		return `${time}.${ms}`;
	}

	debug(message: string, ...args: unknown[]) {
		if (this.shouldLog('debug')) {
			console.debug(
				`${colors.gray}[${this.getTimestamp()}] [${'DEBUG'.padStart(5)}] ${message}${colors.reset}`,
				...args
			);
		}
	}

	info(message: string, ...args: unknown[]) {
		if (this.shouldLog('info')) {
			console.info(`[${this.getTimestamp()}] [${'INFO'.padStart(5)}] ${message}`, ...args);
		}
	}

	warn(message: string, ...args: unknown[]) {
		if (this.shouldLog('warn')) {
			console.warn(
				`${colors.orange}[${this.getTimestamp()}] [${'WARN'.padStart(5)}] ${message}${colors.reset}`,
				...args
			);
		}
	}

	error(message: string, ...args: unknown[]) {
		if (this.shouldLog('error')) {
			console.error(
				`${colors.bold}${colors.red}[${this.getTimestamp()}] [${'ERROR'.padStart(5)}] ${message}${colors.reset}`,
				...args
			);
		}
	}
}

export const logger = new Logger();
