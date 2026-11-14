import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkerLogFile, pruneWorkerLogs } from './WorkerLogFile.js';

let dir: string;
const fixedNow = () => new Date('2026-11-14T10:00:00.000Z');

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-log-file-'));
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const identity = (text: string) => text;

function read(file: WorkerLogFile): string[] {
	return fs.readFileSync(file.filePath, 'utf8').split('\n').filter(Boolean);
}

describe('WorkerLogFile', () => {
	it('writes one line per output line, tagged with time and stream, in <dir>/worker-<pid>.log', () => {
		const file = new WorkerLogFile(dir, 7, identity, vi.fn(), { now: fixedNow });
		file.append('stdout', 'hello\nworld\n');
		file.append('stderr', 'oops\n');
		expect(file.filePath).toBe(path.join(dir, 'worker-7.log'));
		expect(read(file)).toEqual([
			'2026-11-14T10:00:00.000Z out hello',
			'2026-11-14T10:00:00.000Z out world',
			'2026-11-14T10:00:00.000Z err oops',
		]);
	});

	it('is keyed by worker id for a worker that is not a pid, and tags what the daemon observed as dmn', () => {
		const file = new WorkerLogFile(dir, '3f2a-77b0', identity, vi.fn(), { now: fixedNow });
		file.append('daemon', 'connected\n');
		file.append('stdout', 'shipped\n');
		expect(file.filePath).toBe(path.join(dir, 'worker-3f2a-77b0.log'));
		expect(read(file)).toEqual(['2026-11-14T10:00:00.000Z dmn connected', '2026-11-14T10:00:00.000Z out shipped']);
	});

	it('refuses a worker id that could leave the directory', () => {
		expect(() => new WorkerLogFile(dir, '../evil', identity, vi.fn())).toThrow(/Invalid worker log key/);
	});

	it('joins a line split across chunks and flushes an open line on close', () => {
		const file = new WorkerLogFile(dir, 7, identity, vi.fn(), { now: fixedNow });
		file.append('stdout', 'par');
		file.append('stdout', 'tial\nnext');
		expect(read(file)).toEqual(['2026-11-14T10:00:00.000Z out partial']);
		file.close();
		expect(read(file)).toEqual(['2026-11-14T10:00:00.000Z out partial', '2026-11-14T10:00:00.000Z out next']);
	});

	it('masks each line with the injected masker, even a secret split across two chunks', () => {
		const mask = (text: string) => text.replaceAll('hunter2-secret', '***');
		const file = new WorkerLogFile(dir, 7, mask, vi.fn(), { now: fixedNow });
		file.append('stderr', 'token=hunter2');
		file.append('stderr', '-secret failed\n');
		const content = fs.readFileSync(file.filePath, 'utf8');
		expect(content).toContain('err token=*** failed');
		expect(content).not.toContain('hunter2');
	});

	it('starts a fresh file when a worker reuses a pid', () => {
		new WorkerLogFile(dir, 7, identity, vi.fn(), { now: fixedNow }).append('stdout', 'old\n');
		const second = new WorkerLogFile(dir, 7, identity, vi.fn(), { now: fixedNow });
		expect(read(second)).toEqual([]);
	});

	it('caps the file: past the limit the oldest half goes, at a line boundary, and the newest lines stay', () => {
		const file = new WorkerLogFile(dir, 7, identity, vi.fn(), { now: fixedNow, maxBytes: 2000 });
		for (let i = 0; i < 200; i++) {
			file.append('stdout', `line-${String(i).padStart(3, '0')}\n`);
		}
		const lines = read(file);
		expect(fs.statSync(file.filePath).size).toBeLessThanOrEqual(2000);
		expect(lines.at(-1)).toMatch(/ out line-199$/);
		expect(lines[0]).toMatch(/ out line-\d{3}$/);
		expect(lines.length).toBeLessThan(200);
		expect(lines.length).toBeGreaterThan(20);
	});

	it('reports a failure once, names the file, and never throws', () => {
		const log = vi.fn();
		// A file where the directory should be: mkdir fails.
		const blocker = path.join(dir, 'blocker');
		fs.writeFileSync(blocker, '');
		const file = new WorkerLogFile(path.join(blocker, 'sub'), 7, identity, log, { now: fixedNow });
		expect(() => {
			file.append('stdout', 'a\n');
			file.append('stdout', 'b\n');
			file.close();
		}).not.toThrow();
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('error', expect.stringContaining('worker-7.log'));
		expect(log).toHaveBeenCalledWith('error', expect.stringContaining('will not be captured'));
	});
});

describe('pruneWorkerLogs', () => {
	const DAY = 24 * 60 * 60 * 1000;

	function touch(name: string, ageMs: number, now: number): string {
		const file = path.join(dir, name);
		fs.writeFileSync(file, 'x');
		const time = new Date(now - ageMs);
		fs.utimesSync(file, time, time);
		return file;
	}

	it('deletes worker log files older than the retention and keeps recent ones and unrelated files', () => {
		const now = Date.now();
		const old = touch('worker-1.log', 8 * DAY, now);
		const recent = touch('worker-2.log', 1 * DAY, now);
		const other = touch('notes.txt', 30 * DAY, now);
		pruneWorkerLogs(dir, vi.fn(), 7 * DAY, now);
		expect(fs.existsSync(old)).toBe(false);
		expect(fs.existsSync(recent)).toBe(true);
		expect(fs.existsSync(other)).toBe(true);
	});

	it('is silent when the directory does not exist (nothing was ever captured)', () => {
		const log = vi.fn();
		pruneWorkerLogs(path.join(dir, 'missing'), log);
		expect(log).not.toHaveBeenCalled();
	});

	it('logs, and does not throw, when the directory cannot be listed', () => {
		const log = vi.fn();
		const file = path.join(dir, 'a-file');
		fs.writeFileSync(file, '');
		expect(() => pruneWorkerLogs(file, log)).not.toThrow();
		expect(log).toHaveBeenCalledWith('error', expect.stringContaining(file));
	});
});
