import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidQueryError } from '../errors.js';
import { isLogFileName, logFileName, logFilePath, readAppendedLog, readLogs, todayLogDate } from './LogReader.js';

describe('LogReader', () => {
	let configDir: string;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-core-logs-'));
		fs.mkdirSync(path.join(configDir, 'logs'));
	});

	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	const write = (date: string, content: string): string => {
		const file = logFilePath(configDir, date);
		fs.writeFileSync(file, content);
		return file;
	};

	describe('todayLogDate', () => {
		it('is the UTC calendar date, the same one LogWriter names its files with', () => {
			expect(todayLogDate(new Date('2026-10-18T23:59:59.000Z'))).toBe('2026-10-18');
		});
	});

	describe('logFilePath', () => {
		it('is <configDir>/logs/<date>.ndjson', () => {
			expect(logFilePath('/cfg', '2026-10-18')).toBe(path.join('/cfg', 'logs', '2026-10-18.ndjson'));
		});
		it('rejects a date that could escape the logs directory', () => {
			expect(() => logFilePath('/cfg', '../x')).toThrow(InvalidQueryError);
			expect(() => logFilePath('/cfg', '2026-10-18')).not.toThrow();
		});
	});

	describe('readLogs', () => {
		it('reports a missing file with its path instead of failing', () => {
			const result = readLogs(configDir, { date: '2026-01-01', lines: 50 });
			expect(result).toEqual({
				exists: false,
				filePath: logFilePath(configDir, '2026-01-01'),
				text: '',
				size: 0,
			});
		});

		it('returns the last n raw lines and the byte size to follow from', () => {
			const content = 'a\nb\nc\n';
			write('2026-10-18', content);
			const result = readLogs(configDir, { date: '2026-10-18', lines: 2 });
			expect(result.exists).toBe(true);
			expect(result.text).toBe('b\nc\n');
			expect(result.size).toBe(Buffer.byteLength(content));
		});

		it('returns everything when lines is 0', () => {
			write('2026-10-18', 'a\nb\nc\n');
			expect(readLogs(configDir, { date: '2026-10-18', lines: 0 }).text).toBe('a\nb\nc\n');
		});

		it('formats lines for humans when asked', () => {
			write('2026-10-18', JSON.stringify({ ts: '2026-10-18T10:00:00.000Z', msg: 'hello' }) + '\n');
			const result = readLogs(configDir, { date: '2026-10-18', lines: 5, human: true });
			expect(result.text).toMatch(/\[INFO \] hello\n$/);
		});

		it('defaults to today', () => {
			write(todayLogDate(), 'x\n');
			expect(readLogs(configDir, { lines: 5 }).text).toBe('x\n');
		});

		it('rejects a non-integer line count', () => {
			expect(() => readLogs(configDir, { lines: Number.NaN })).toThrow(/lines/);
		});
	});

	describe('readAppendedLog', () => {
		it('returns only what was appended after the offset, with the new offset', () => {
			const file = write('2026-10-18', 'a\n');
			fs.appendFileSync(file, 'b\nc\n');
			expect(readAppendedLog(file, 2)).toEqual({ text: 'b\nc\n', offset: 6 });
		});

		it('returns null when nothing was appended or the file is gone', () => {
			const file = write('2026-10-18', 'a\n');
			expect(readAppendedLog(file, 2)).toBeNull();
			expect(readAppendedLog(path.join(configDir, 'logs', 'nope.ndjson'), 0)).toBeNull();
		});

		it('human-formats the appended text when asked', () => {
			const file = write('2026-10-18', '');
			fs.appendFileSync(file, JSON.stringify({ ts: '2026-10-18T10:00:00.000Z', msg: 'late' }) + '\n');
			expect(readAppendedLog(file, 0, { human: true })?.text).toMatch(/\[INFO \] late\n$/);
		});
	});
});

describe('logFileName', () => {
	it('is what isLogFileName recognises', () => {
		expect(logFileName('2026-10-18')).toBe('2026-10-18.ndjson');
		expect(isLogFileName(logFileName('2026-10-18'))).toBe(true);
	});
});

describe('isLogFileName', () => {
	it('accepts daily log files only', () => {
		expect(isLogFileName('2026-10-18.ndjson')).toBe(true);
		expect(isLogFileName('2026-10-18.log')).toBe(false);
		expect(isLogFileName('notes.ndjson')).toBe(false);
		expect(isLogFileName('../2026-10-18.ndjson')).toBe(false);
	});
});
