import { isLogFileName, logFileName, todayLogDate } from 'flow-core';
import type { LiveLogEntry } from 'flow-engine/types';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { ExecutionMasks } from '../secrets/ExecutionMasks';

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
		private readonly retainDays: number = 30,
		// Hides the exact values of the execution's declared secrets in every line written.
		private readonly masks: ExecutionMasks = new ExecutionMasks()
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
			message: this.masks.mask(executionId, entry.message),
		};
		const filePath = path.join(this.logsDir, logFileName(this.todayDate()));
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
			message: this.masks.mask(executionId, message),
		};
		const filePath = path.join(this.logsDir, logFileName(this.todayDate()));
		try {
			fs.appendFileSync(filePath, JSON.stringify(line) + '\n', 'utf8');
		} catch (err) {
			process.stderr.write(`[LogWriter] failed to write log: ${String(err)}\n`);
		}
		this.rotate();
	}

	private todayDate(): string {
		return todayLogDate();
	}

	private rotate(): void {
		const today = this.todayDate();
		// already rotated today
		if (this.lastRotationDate === today) {
			return;
		}

		const limit = Math.min(this.retainDays, HARD_CAP);
		let files: string[];
		try {
			files = fs.readdirSync(this.logsDir).filter(isLogFileName).sort();
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
