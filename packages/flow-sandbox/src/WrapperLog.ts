import * as fs from 'node:fs';

import type { SandboxLog } from './SandboxLog';

/**
 * The log of a wrapper process: stderr (the daemon forwards it as `[source <id>] ...`) plus, when asked, a file.
 * `tag` names the variant in every line (`exec`, `harness`).
 */
export class WrapperLog implements SandboxLog {
	constructor(
		private readonly tag: string,
		private readonly logFile: string | undefined
	) {}

	info(message: string): void {
		this.write('info', message);
	}

	warn(message: string): void {
		this.write('warn', message);
	}

	private write(level: string, message: string): void {
		const line = `${new Date().toISOString()} [${this.tag}] ${level}: ${message}\n`;
		process.stderr.write(line);
		if (this.logFile !== undefined) fs.appendFileSync(this.logFile, line);
	}
}
