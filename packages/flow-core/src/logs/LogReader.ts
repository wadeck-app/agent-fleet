import * as fs from 'node:fs';
import * as path from 'node:path';

import { logsDirOf } from '../config/FlowConfigLayout.js';
import { InvalidQueryError } from '../errors.js';
import { formatLogContent, tailLines } from './LogFormat.js';

const LOG_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LOG_FILE_RE = /^\d{4}-\d{2}-\d{2}\.ndjson$/;

export interface ReadLogsOptions {
	/** UTC calendar date `YYYY-MM-DD` (default: today). */
	date?: string;
	/** Keep the last N lines; 0 or negative keeps everything. */
	lines: number;
	/** Format entries as `HH:mm:ss.SSS [LEVEL] message` instead of raw NDJSON. */
	human?: boolean;
}

export interface LogReadResult {
	filePath: string;
	/** False when no log was written that day; `text` is then empty. */
	exists: boolean;
	text: string;
	/** Byte size of the whole file when it was read: the offset to hand to {@link readAppendedLog}. */
	size: number;
}

/** The UTC date LogWriter names its daily file with. */
export function todayLogDate(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

/** `YYYY-MM-DD.ndjson`: the file the daemon writes a day's log to. */
export function logFileName(date: string): string {
	return `${date}.ndjson`;
}

/** Whether `fileName` is a daily log file name (`YYYY-MM-DD.ndjson`), e.g. when rotating the logs directory. */
export function isLogFileName(fileName: string): boolean {
	return LOG_FILE_RE.test(fileName);
}

export function logFilePath(configDir: string, date: string): string {
	if (!LOG_DATE_RE.test(date)) {
		throw new InvalidQueryError(`Invalid log date '${date}': expected YYYY-MM-DD.`);
	}
	return path.join(logsDirOf(configDir), logFileName(date));
}

/**
 * Reads the tail of one day's daemon log. A day without a log file is a normal answer
 * (`exists: false`), not an error: the daemon may simply not have run.
 */
export function readLogs(configDir: string, options: ReadLogsOptions): LogReadResult {
	if (!Number.isInteger(options.lines)) {
		throw new InvalidQueryError(`Invalid lines '${String(options.lines)}': expected an integer.`);
	}
	const filePath = logFilePath(configDir, options.date ?? todayLogDate());
	if (!fs.existsSync(filePath)) {
		return { filePath, exists: false, text: '', size: 0 };
	}

	const content = fs.readFileSync(filePath, 'utf8');
	const tail = tailLines(content, options.lines);
	return {
		filePath,
		exists: true,
		text: options.human ? formatLogContent(tail) : tail,
		size: Buffer.byteLength(content, 'utf8'),
	};
}

/**
 * What was appended to a log file after byte `offset`, with the offset to continue from.
 * Null when nothing new (or the file vanished): the caller keeps its offset and tries again.
 */
export function readAppendedLog(
	filePath: string,
	offset: number,
	options: { human?: boolean } = {}
): { text: string; offset: number } | null {
	if (!fs.existsSync(filePath)) {
		return null;
	}
	const size = fs.statSync(filePath).size;
	if (size <= offset) {
		return null;
	}
	const buf = Buffer.alloc(size - offset);
	const fd = fs.openSync(filePath, 'r');
	try {
		fs.readSync(fd, buf, 0, buf.length, offset);
	} finally {
		fs.closeSync(fd);
	}
	const text = buf.toString('utf8');
	return { text: options.human ? formatLogContent(text) : text, offset: size };
}
