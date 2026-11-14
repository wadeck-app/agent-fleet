import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	WORKER_LOG_MAX_LINES,
	isWorkerLogFileName,
	listRecentWorkerLogs,
	originOfWorkerLogKey,
	readWorkerLogByKey,
	readWorkerLogs,
	workerLogFileName,
	workerLogFileNameOfKey,
	workerLogFileNameOfWorkerId,
	workerLogKeyOf,
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
		expect(isWorkerLogFileName('worker-3f2a9c1e-77b0-4d51-9d0a-0123456789ab.log')).toBe(true);
		expect(isWorkerLogFileName('worker-.log')).toBe(false);
		expect(isWorkerLogFileName('worker-../x.log')).toBe(false);
		expect(isWorkerLogFileName('notes.log')).toBe(false);
	});

	it('keys the file of any other worker by its worker id, and refuses a key that could leave the directory', () => {
		expect(workerLogFileNameOfWorkerId('3f2a-77b0')).toBe('worker-3f2a-77b0.log');
		expect(workerLogKeyOf({ workerId: 'w-1', pid: 7, ephemeral: true })).toBe('7');
		expect(workerLogKeyOf({ workerId: 'w-1', pid: 7, ephemeral: false })).toBe('w-1');
		for (const bad of ['', '../x', 'a/b', 'a\\b', 'a.b', '-x', 'x'.repeat(101)]) {
			expect(() => workerLogFileNameOfKey(bad), bad).toThrow(/Invalid worker log key/);
		}
		expect(originOfWorkerLogKey('4242')).toBe('started by the daemon');
		expect(originOfWorkerLogKey('3f2a-77b0')).toBe('external');
	});
});

describe('readWorkerLogByKey (a worker that is gone, or no daemon)', () => {
	it('reads the file of a pid key and of a worker id key', () => {
		writeLog(4242, 'x\ny\n');
		fs.writeFileSync(path.join(workerLogsDirOf(configDir), 'worker-w-9.log'), 'z\n');
		expect(readWorkerLogByKey(configDir, '4242', 10)?.lines).toEqual(['x', 'y']);
		expect(readWorkerLogByKey(configDir, 'w-9', 10)?.lines).toEqual(['z']);
	});

	it('is undefined for a missing file and for a key that is not a key (never reaches the file system)', () => {
		expect(readWorkerLogByKey(configDir, '999', 10)).toBeUndefined();
		expect(readWorkerLogByKey(configDir, '../../etc/passwd', 10)).toBeUndefined();
	});
});

describe('listRecentWorkerLogs', () => {
	function put(name: string, content: string, ageMs: number): void {
		const dir = workerLogsDirOf(configDir);
		fs.mkdirSync(dir, { recursive: true });
		const file = path.join(dir, name);
		fs.writeFileSync(file, content);
		const when = new Date(Date.now() - ageMs);
		fs.utimesSync(file, when, when);
	}

	it('lists the files newest first with origin, size, time and last line, skipping the live keys, directories and foreign files', () => {
		put('worker-100.log', 'a\nold last\n', 5000);
		put('worker-w-7.log', '2026 dmn connected\n2026 dmn disconnected: code 1006\n', 1000);
		put('worker-live.log', 'x\n', 10);
		put('notes.log', 'x', 10);
		fs.mkdirSync(path.join(workerLogsDirOf(configDir), 'worker-999.log'));

		const recent = listRecentWorkerLogs(configDir, new Set(['live']));

		expect(recent.map(entry => entry.key)).toEqual(['w-7', '100']);
		expect(recent[0]).toMatchObject({
			origin: 'external',
			lastLine: '2026 dmn disconnected: code 1006',
			sizeBytes: Buffer.byteLength('2026 dmn connected\n2026 dmn disconnected: code 1006\n'),
		});
		expect(recent[0]).not.toHaveProperty('pid');
		expect(recent[1]).toMatchObject({ origin: 'started by the daemon', pid: 100, lastLine: 'old last' });
	});

	it('is empty when nothing was ever captured, has an empty last line for an empty file, cuts a long last line, honours the limit', () => {
		expect(listRecentWorkerLogs(configDir)).toEqual([]);
		put('worker-1.log', '', 300);
		put('worker-2.log', `${'x'.repeat(500)}\n`, 200);
		put('worker-3.log', 'c\n', 100);
		const all = listRecentWorkerLogs(configDir);
		expect(all.find(entry => entry.key === '1')?.lastLine).toBe('');
		expect(all.find(entry => entry.key === '2')?.lastLine).toHaveLength(200);
		expect(listRecentWorkerLogs(configDir, new Set(), 2).map(entry => entry.key)).toEqual(['3', '2']);
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
			sizeBytes: 8,
			modifiedAt: fs.statSync(file).mtime.toISOString(),
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

	it('reads an external worker from its worker id file, never from the file of its pid', () => {
		writeLog(4242, 'stale pid file\n');
		const dir = workerLogsDirOf(configDir);
		fs.writeFileSync(path.join(dir, workerLogFileNameOfWorkerId('w-1')), 'dmn line\n');
		const view = readWorkerLogs(configDir, { ...forked, ephemeral: false }, 10);
		expect(view).toMatchObject({ available: true, lines: ['dmn line'] });
		expect(view.filePath).toBe(path.join(dir, 'worker-w-1.log'));
	});

	it('explains an external worker whose file is gone, naming its version and the fix', () => {
		const view = readWorkerLogs(configDir, { ...forked, ephemeral: false, version: 'sandbox-exec-m7' }, 10);
		expect(view.available).toBe(false);
		expect(view.reason).toContain('version sandbox-exec-m7');
		expect(view.reason).toContain(path.join('workers', 'worker-w-1.log'));
		expect(view.reason).toMatch(/restart the daemon/);
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
