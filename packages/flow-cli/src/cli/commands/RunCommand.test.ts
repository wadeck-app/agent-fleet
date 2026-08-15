import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { tailLogFile } from './RunCommand.js';

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-cmd-test-'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
	vi.restoreAllMocks();
});

function writeLog(file: string, entries: object[]): void {
	fs.writeFileSync(file, entries.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
}

describe('tailLogFile', () => {
	it('emits log lines matching executionId', () => {
		const logFile = path.join(tmpDir, 'test.ndjson');
		writeLog(logFile, [
			{ prefix: '[abc123|greet]', timestamp: '2026-08-15T00:00:00Z', level: 'info', message: 'hello' },
			{ prefix: '[abc123|build]', timestamp: '2026-08-15T00:00:01Z', level: 'info', message: 'world' },
		]);

		const received: Array<{ stepId: string; message: string }> = [];
		const newByte = tailLogFile(logFile, 'abc123', 0, (stepId, message) => received.push({ stepId, message }));

		expect(received).toHaveLength(2);
		expect(received[0]).toEqual({ stepId: 'greet', message: 'hello' });
		expect(received[1]).toEqual({ stepId: 'build', message: 'world' });
		expect(newByte).toBeGreaterThan(0);
	});

	it('filters out lines from other executionIds', () => {
		const logFile = path.join(tmpDir, 'test.ndjson');
		writeLog(logFile, [
			{ prefix: '[abc123|greet]', timestamp: '2026-08-15T00:00:00Z', level: 'info', message: 'mine' },
			{ prefix: '[other99|step1]', timestamp: '2026-08-15T00:00:01Z', level: 'info', message: 'not mine' },
		]);

		const received: string[] = [];
		tailLogFile(logFile, 'abc123', 0, (_, msg) => received.push(msg));

		expect(received).toEqual(['mine']);
	});

	it('filters out __execution lines', () => {
		const logFile = path.join(tmpDir, 'test.ndjson');
		writeLog(logFile, [
			{ prefix: '[abc123|__execution]', timestamp: '2026-08-15T00:00:00Z', level: 'info', message: 'Execution started' },
			{ prefix: '[abc123|greet]', timestamp: '2026-08-15T00:00:01Z', level: 'info', message: 'hello' },
		]);

		const received: string[] = [];
		tailLogFile(logFile, 'abc123', 0, (_, msg) => received.push(msg));

		expect(received).toEqual(['hello']);
	});

	it('returns correct lastByte for incremental reads', () => {
		const logFile = path.join(tmpDir, 'test.ndjson');
		writeLog(logFile, [
			{ prefix: '[abc123|greet]', timestamp: '2026-08-15T00:00:00Z', level: 'info', message: 'first' },
		]);

		const received: string[] = [];
		const byte1 = tailLogFile(logFile, 'abc123', 0, (_, msg) => received.push(msg));
		expect(received).toEqual(['first']);

		// Append a second line
		fs.appendFileSync(
			logFile,
			JSON.stringify({ prefix: '[abc123|greet]', timestamp: '2026-08-15T00:00:01Z', level: 'info', message: 'second' }) + '\n',
			'utf8'
		);

		const byte2 = tailLogFile(logFile, 'abc123', byte1, (_, msg) => received.push(msg));
		expect(received).toEqual(['first', 'second']);
		expect(byte2).toBeGreaterThan(byte1);
	});

	it('returns 0 when file does not exist', () => {
		const received: string[] = [];
		const result = tailLogFile(path.join(tmpDir, 'missing.ndjson'), 'abc123', 0, (_, msg) => received.push(msg));
		expect(result).toBe(0);
		expect(received).toHaveLength(0);
	});

	it('returns lastByte unchanged when no new content', () => {
		const logFile = path.join(tmpDir, 'test.ndjson');
		writeLog(logFile, [
			{ prefix: '[abc123|greet]', timestamp: '2026-08-15T00:00:00Z', level: 'info', message: 'hello' },
		]);

		const byte1 = tailLogFile(logFile, 'abc123', 0, () => {});
		const byte2 = tailLogFile(logFile, 'abc123', byte1, () => {});
		expect(byte2).toBe(byte1);
	});
});
