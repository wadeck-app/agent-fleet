import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	WORKER_LOG_MAX_LINES,
	isWorkerLogFileName,
	readWorkerLogs,
	workerLogFileName,
	workerLogsDirOf,
} from './WorkerLogs.js';

let configDir: string;

beforeEach(() => {
	configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-logs-'));
});

afterEach(() => {
	fs.rmSync(configDir, { recursive: true, force: true });
});

const forked = { workerId: 'w-1', pid: 4242, ephemeral: true };

function writeLog(pid: number, content: string): string {
	const dir = workerLogsDirOf(configDir);
	fs.mkdirSync(dir, { recursive: true });
	const file = path.join(dir, workerLogFileName(pid));
	fs.writeFileSync(file, content);
	return file;
}

describe('worker log file naming', () => {
	it('keys the file by pid under logs/workers', () => {
		expect(workerLogFileName(4242)).toBe('worker-4242.log');
		expect(workerLogsDirOf(configDir)).toBe(path.join(configDir, 'logs', 'workers'));
	});

	it('recognises only the files the writer owns', () => {
		expect(isWorkerLogFileName('worker-1.log')).toBe(true);
		expect(isWorkerLogFileName('2026-11-14.ndjson')).toBe(false);
		expect(isWorkerLogFileName('worker-x.log')).toBe(false);
		expect(isWorkerLogFileName('notes.log')).toBe(false);
	});
});

describe('readWorkerLogs', () => {
	it('returns the last N lines, oldest first, and says the rest was cut', () => {
		const file = writeLog(4242, 'a\nb\nc\nd\n');
		expect(readWorkerLogs(configDir, forked, 2)).toEqual({
			workerId: 'w-1',
			available: true,
			lines: ['c', 'd'],
			truncated: true,
			filePath: file,
		});
	});

	it('returns every line when there are fewer than asked', () => {
		writeLog(4242, 'a\nb\n');
		const view = readWorkerLogs(configDir, forked, 200);
		expect(view.lines).toEqual(['a', 'b']);
		expect(view.truncated).toBe(false);
	});

	it('is available with no line for an empty file', () => {
		writeLog(4242, '');
		expect(readWorkerLogs(configDir, forked, 10)).toMatchObject({ available: true, lines: [] });
	});

	it('explains an external worker, even when a file with its pid exists', () => {
		writeLog(4242, 'stale\n');
		const view = readWorkerLogs(configDir, { ...forked, ephemeral: false }, 10);
		expect(view.available).toBe(false);
		expect(view.lines).toEqual([]);
		expect(view.reason).toMatch(/not started by the daemon/);
	});

	it('explains a forked worker whose file is gone, naming the path and the fix', () => {
		const view = readWorkerLogs(configDir, forked, 10);
		expect(view.available).toBe(false);
		expect(view.reason).toContain(path.join('workers', 'worker-4242.log'));
		expect(view.reason).toMatch(/restart the daemon/);
	});

	it('rejects a line count outside 1..max', () => {
		for (const bad of [0, -1, 1.5, WORKER_LOG_MAX_LINES + 1, Number.NaN]) {
			expect(() => readWorkerLogs(configDir, forked, bad), String(bad)).toThrow(/Invalid lines/);
		}
	});

	it('throws a read failure other than a missing file instead of hiding it', () => {
		// A directory where the file should be: EISDIR.
		fs.mkdirSync(path.join(workerLogsDirOf(configDir), workerLogFileName(4242)), { recursive: true });
		expect(() => readWorkerLogs(configDir, forked, 10)).toThrow();
	});
});
