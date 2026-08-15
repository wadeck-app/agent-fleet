import type { LiveLogEntry } from 'flow-engine/types';
import * as fs from 'node:fs';
import * as path from 'node:path';

const HARD_CAP = 120;

interface LogLine {
	prefix: string;
	timestamp: string;
	level: string;
	message: string;
}

// LogWriter does NOT use executionId in file paths (files are date-based).
// executionId appears only inside NDJSON line content. Special values like
// '__hook' and '__execution' are valid callers, so no format validation here.
export class LogWriter {
	private lastRotationDate: string = '';

	constructor(
		private readonly logsDir: string,
		private readonly retainDays: number = 30
	) {}

	write(executionId: string, stepId: string, entry: LiveLogEntry): void {
		let timestamp: string;
		try {
			timestamp = new Date(entry.timestamp).toISOString();
		} catch {
			timestamp = new Date().toISOString();
		}
		const line: LogLine = {
			prefix: `[${executionId}|${stepId}]`,
			timestamp,
			level: entry.level,
			message: entry.message,
		};
		const filePath = path.join(this.logsDir, `${this.todayDate()}.ndjson`);
		try {
			fs.appendFileSync(filePath, JSON.stringify(line) + '\n', 'utf8');
		} catch (err) {
			process.stderr.write(`[LogWriter] failed to write log: ${String(err)}\n`);
		}
		this.rotate();
	}

	writeExecution(executionId: string, message: string, level: LiveLogEntry['level'] = 'info'): void {
		const line: LogLine = {
			prefix: `[${executionId}|__execution]`,
			timestamp: new Date().toISOString(),
			level,
			message,
		};
		const filePath = path.join(this.logsDir, `${this.todayDate()}.ndjson`);
		try {
			fs.appendFileSync(filePath, JSON.stringify(line) + '\n', 'utf8');
		} catch (err) {
			process.stderr.write(`[LogWriter] failed to write log: ${String(err)}\n`);
		}
		this.rotate();
	}

	private todayDate(): string {
		return new Date().toISOString().slice(0, 10);
	}

	private rotate(): void {
		const today = this.todayDate();
		if (this.lastRotationDate === today) return; // already rotated today

		const limit = Math.min(this.retainDays, HARD_CAP);
		let files: string[];
		try {
			files = fs
				.readdirSync(this.logsDir)
				.filter(f => /^\d{4}-\d{2}-\d{2}\.ndjson$/.test(f))
				.sort();
		} catch {
			return;
		}
		while (files.length > limit) {
			const oldest = files.shift()!;
			try {
				fs.unlinkSync(path.join(this.logsDir, oldest));
			} catch {
				// ignore deletion errors
			}
		}
		this.lastRotationDate = today;
	}
}
