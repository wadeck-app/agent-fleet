import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerHistoryCommand } from './HistoryCommand';

// Filtering, pagination and rendering are covered in flow-core (history/*.test.ts); this file only
// covers what the command adds: argument parsing, the directory it reads, stdout and the exit code.

function exec(id: string, flowId: string, status: string, startedAt: string): Record<string, unknown> {
	return {
		executionId: id,
		flowId,
		flowFile: `/tmp/${flowId}.yml`,
		status,
		currentSteps: [],
		startedAt,
		completedAt: startedAt,
		steps: {},
	};
}

describe('flow history command', () => {
	let configDir: string;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-history-cmd-'));
		fs.mkdirSync(path.join(configDir, 'executions'));
		for (const e of [
			exec('aaa11111', 'flow-a', 'completed', '2026-08-16T10:00:00.000Z'),
			exec('aaa22222', 'flow-b', 'failed', '2026-08-16T11:00:00.000Z'),
			exec('bbb33333', 'flow-a', 'failed', '2026-08-16T12:00:00.000Z'),
		]) {
			fs.writeFileSync(path.join(configDir, 'executions', `${String(e['executionId'])}.json`), JSON.stringify(e));
		}
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('exit');
		});
	});

	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerHistoryCommand(program, () => configDir);
		program.parse(['node', 'test', 'history', ...args]);
	};
	const printed = (): string => logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const json = (): unknown => JSON.parse(String(writeSpy.mock.calls[0]![0]));

	it('prints the table of the executions directory, newest first', () => {
		run();
		const out = printed();
		expect(out).toContain('EXECUTION');
		expect(out.indexOf('bbb33333')).toBeLessThan(out.indexOf('aaa11111'));
	});

	it('forwards --status, --flow and --limit to the table', () => {
		run('--status', 'failed', '--flow', 'flow-a');
		expect(printed()).toContain('bbb33333');
		expect(printed()).not.toContain('aaa22222');
		logSpy.mockClear();
		run('-n', '1');
		expect(printed()).toContain('bbb33333');
		expect(printed()).not.toContain('aaa11111');
	});

	it('--id prints the detail view of one execution', () => {
		run('--id', 'bbb');
		expect(printed()).toContain('Execution: bbb33333');
	});

	it('--json prints the same selection as the table, as raw records', () => {
		run('--json', '--status', 'failed', '--offset', '1');
		expect(json()).toEqual([expect.objectContaining({ executionId: 'aaa22222' })]);
	});

	it('--json --id prints a single record for a unique prefix and a list for an ambiguous one', () => {
		run('--json', '--id', 'bbb');
		expect(json()).toEqual(expect.objectContaining({ executionId: 'bbb33333' }));
		writeSpy.mockClear();
		run('--json', '--id', 'aaa');
		expect(json()).toHaveLength(2);
	});

	it('--json --id applies --status like the table does', () => {
		run('--json', '--id', 'aaa', '--status', 'failed');
		expect(json()).toEqual(expect.objectContaining({ executionId: 'aaa22222' }));
	});

	it('exits 1 with an actionable message for an invalid --limit', () => {
		expect(() => run('--limit', 'abc')).toThrow('exit');
		expect(errorSpy.mock.calls.flat().join(' ')).toMatch(/Invalid limit.*non-negative integer/);
	});

	it('reads nothing but the injected directory (empty history is not an error)', () => {
		const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-history-empty-'));
		try {
			const program = new Command();
			registerHistoryCommand(program, () => empty);
			program.parse(['node', 'test', 'history']);
			expect(printed()).toContain('No executions found.');
		} finally {
			fs.rmSync(empty, { recursive: true, force: true });
		}
	});
});
