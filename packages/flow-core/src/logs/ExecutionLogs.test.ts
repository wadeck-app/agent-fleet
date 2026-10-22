import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { InvalidQueryError } from '../errors.js';
import { makeExec } from '../testing/makeExec.js';
import { LOG_LEVELS, formatRecordedStepOutput, readExecutionLogs } from './ExecutionLogs.js';
import { logFilePath } from './LogReader.js';

const EXEC = 'abc12345';
const target = { executionId: EXEC, startedAt: '2026-10-18T22:00:00.000Z', completedAt: '2026-10-19T01:00:00.000Z' };

function line(executionId: string, stepId: string, level: string, message: string, timestamp: string): string {
	return JSON.stringify({ prefix: `[${executionId}|${stepId}]`, timestamp, level, message });
}

describe('readExecutionLogs', () => {
	let configDir: string;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-core-exec-logs-'));
		fs.mkdirSync(path.join(configDir, 'logs'));
	});

	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	const write = (date: string, ...lines: string[]): void => {
		fs.writeFileSync(logFilePath(configDir, date), lines.join('\n') + '\n');
	};

	it('keeps the lines of the execution only, across the days it ran, oldest first, with ISO timestamps', () => {
		write(
			'2026-10-18',
			line(EXEC, 'build', 'info', 'compiling', '2026-10-18T22:30:00.000Z'),
			line('other999', 'build', 'info', 'not mine', '2026-10-18T22:31:00.000Z')
		);
		write('2026-10-19', line(EXEC, '__execution', 'info', 'Execution completed', '2026-10-19T00:10:00.000Z'));
		const result = readExecutionLogs(configDir, target, { limit: 50 });
		expect(result.entries).toEqual([
			{ timestamp: '2026-10-18T22:30:00.000Z', level: 'info', stepId: 'build', message: 'compiling' },
			{
				timestamp: '2026-10-19T00:10:00.000Z',
				level: 'info',
				stepId: '__execution',
				message: 'Execution completed',
			},
		]);
		expect(result.total).toBe(2);
		expect(result.daysRead).toEqual(['2026-10-18', '2026-10-19']);
	});

	it('does not read a day outside the run window, nor mistake an id that merely starts with the same characters', () => {
		write('2026-10-17', line(EXEC, 'build', 'info', 'too early', '2026-10-17T10:00:00.000Z'));
		write('2026-10-18', line(`${EXEC}9`, 'build', 'info', 'longer id', '2026-10-18T22:30:00.000Z'));
		const result = readExecutionLogs(configDir, target, { limit: 50 });
		expect(result.entries).toEqual([]);
		expect(result.daysRead).toEqual(['2026-10-18']);
	});

	it('reads up to the given clock while the run is still going', () => {
		write('2026-10-20', line(EXEC, 'build', 'info', 'still running', '2026-10-20T08:00:00.000Z'));
		const running = { ...target, completedAt: null };
		const result = readExecutionLogs(configDir, running, { limit: 50 }, new Date('2026-10-20T09:00:00.000Z'));
		expect(result.entries.map(e => e.message)).toEqual(['still running']);
		expect(result.daysRead).toEqual(['2026-10-20']);
	});

	it('still reads the start day when the record says the run ended before it started (damaged clock)', () => {
		write('2026-10-18', line(EXEC, 'a', 'info', 'x', '2026-10-18T22:30:00.000Z'));
		const result = readExecutionLogs(
			configDir,
			{ ...target, completedAt: '2026-10-01T00:00:00.000Z' },
			{ limit: 5 }
		);
		expect(result.entries.map(e => e.message)).toEqual(['x']);
	});

	it('lists the steps that logged, whatever the step filter, so a UI can offer them', () => {
		write(
			'2026-10-18',
			line(EXEC, 'b', 'info', 'x', '2026-10-18T22:30:00.000Z'),
			line(EXEC, 'a', 'info', 'y', '2026-10-18T22:31:00.000Z'),
			line(EXEC, 'b', 'info', 'z', '2026-10-18T22:32:00.000Z')
		);
		const result = readExecutionLogs(configDir, target, { limit: 50, stepId: 'a' });
		expect(result.stepIds).toEqual(['a', 'b']);
		expect(result.entries.map(e => e.message)).toEqual(['y']);
		expect(result.total).toBe(1);
	});

	it('filters by level and by case-insensitive text in the message', () => {
		write(
			'2026-10-18',
			line(EXEC, 'a', 'info', 'Starting', '2026-10-18T22:30:00.000Z'),
			line(EXEC, 'a', 'error', 'Connection REFUSED', '2026-10-18T22:31:00.000Z'),
			line(EXEC, 'a', 'warning', 'refused once, retrying', '2026-10-18T22:32:00.000Z')
		);
		expect(readExecutionLogs(configDir, target, { limit: 50, level: 'error' }).total).toBe(1);
		expect(readExecutionLogs(configDir, target, { limit: 50, search: 'refused' }).total).toBe(2);
		expect(readExecutionLogs(configDir, target, { limit: 50, search: 'refused', level: 'warning' }).total).toBe(1);
	});

	it('pages from the end: page 0 is the latest lines, in chronological order', () => {
		write(
			'2026-10-18',
			...[1, 2, 3, 4, 5].map(n => line(EXEC, 'a', 'info', `m${n}`, `2026-10-18T22:3${n}:00.000Z`))
		);
		const latest = readExecutionLogs(configDir, target, { limit: 2 });
		expect(latest.entries.map(e => e.message)).toEqual(['m4', 'm5']);
		expect(latest.total).toBe(5);
		expect(readExecutionLogs(configDir, target, { limit: 2, page: 1 }).entries.map(e => e.message)).toEqual([
			'm2',
			'm3',
		]);
		expect(readExecutionLogs(configDir, target, { limit: 2, page: 2 }).entries.map(e => e.message)).toEqual(['m1']);
		expect(readExecutionLogs(configDir, target, { limit: 2, page: 3 }).entries).toEqual([]);
	});

	it('counts the lines it could not read instead of hiding them, and ignores daemon lines', () => {
		write(
			'2026-10-18',
			'{not json',
			JSON.stringify({ ts: '2026-10-18T22:30:00.000Z', level: 'info', msg: `daemon mentions [${EXEC}|a]` }),
			line(EXEC, 'a', 'info', 'ok', '2026-10-18T22:31:00.000Z'),
			`[${EXEC}|a] but not JSON`
		);
		const result = readExecutionLogs(configDir, target, { limit: 50 });
		expect(result.entries.map(e => e.message)).toEqual(['ok']);
		expect(result.unreadableLines).toBe(1);
	});

	it('answers with no days read when the daemon wrote no log in the window (not an error)', () => {
		const result = readExecutionLogs(configDir, target, { limit: 50 });
		expect(result).toMatchObject({ entries: [], total: 0, daysRead: [], stepIds: [] });
		expect(result.logsDir).toBe(path.join(configDir, 'logs'));
	});

	it('answers with no days read when the logs directory does not exist', () => {
		fs.rmSync(path.join(configDir, 'logs'), { recursive: true });
		expect(readExecutionLogs(configDir, target, { limit: 50 }).daysRead).toEqual([]);
	});

	it('refuses an unknown level, a bad limit or page, and an unreadable start date, saying what is accepted', () => {
		expect(() => readExecutionLogs(configDir, target, { limit: 50, level: 'warn' })).toThrow(InvalidQueryError);
		expect(() => readExecutionLogs(configDir, target, { limit: 50, level: 'warn' })).toThrow(
			new RegExp(LOG_LEVELS.join(', '))
		);
		expect(() => readExecutionLogs(configDir, target, { limit: 0 })).toThrow(/limit/);
		expect(() => readExecutionLogs(configDir, target, { limit: 5, page: -1 })).toThrow(/page/);
		expect(() => readExecutionLogs(configDir, { ...target, startedAt: 'yesterday' }, { limit: 5 })).toThrow(
			/startedAt/
		);
	});
});

describe('formatRecordedStepOutput', () => {
	const record = makeExec({
		executionId: EXEC,
		steps: {
			build: { status: 'failed', error: 'exit 1', stdout: 'out text', stderr: 'err text' },
			test: { status: 'completed' },
			lint: { status: 'failed', error: 'lint failed' },
		},
	});

	it('writes the error, stdout and stderr the execution record kept for failed steps, one block per step', () => {
		expect(formatRecordedStepOutput(record.steps)).toBe(
			[
				'[build] error: exit 1',
				'[build] stdout:',
				'out text',
				'[build] stderr:',
				'err text',
				'',
				'[lint] error: lint failed',
				'',
			].join('\n')
		);
	});

	it('keeps one step when asked, and is empty when that step recorded nothing', () => {
		expect(formatRecordedStepOutput(record.steps, 'lint')).toBe('[lint] error: lint failed\n');
		expect(formatRecordedStepOutput(record.steps, 'test')).toBe('');
		expect(formatRecordedStepOutput(record.steps, 'unknown')).toBe('');
	});
});
