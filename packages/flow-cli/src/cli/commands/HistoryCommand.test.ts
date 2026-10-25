import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
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

	describe('execution files that cannot be used', () => {
		const damage = (): string => {
			const file = path.join(configDir, 'executions', 'broken01.json');
			fs.writeFileSync(file, '{ not json');
			return file;
		};

		it('says on stderr which file was skipped and why, and still prints the table', () => {
			const file = damage();
			run();
			expect(printed()).toContain('bbb33333');
			const warning = errorSpy.mock.calls.flat().join(' ');
			expect(warning).toContain('1 execution file skipped');
			expect(warning).toContain(file);
			expect(warning).toContain('not valid JSON');
		});

		it('also warns with --json, keeping stdout a clean JSON document', () => {
			damage();
			run('--json');
			expect(json()).toHaveLength(3);
			expect(errorSpy.mock.calls.flat().join(' ')).toContain('1 execution file skipped');
		});

		it('stays silent when every file is readable', () => {
			run();
			expect(errorSpy).not.toHaveBeenCalled();
		});
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

describe('flow history command and projects', () => {
	let configDir: string;
	let fixture: RegisteredProjectFixture;
	let alphaId: string;
	let betaId: string;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture().useAsProcessEnv();
		alphaId = (await fixture.register('alpha', { aliases: ['al'] })).id;
		betaId = (await fixture.register('beta')).id;
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-history-project-'));
		fs.mkdirSync(path.join(configDir, 'executions'));
		const records: Record<string, unknown>[] = [
			{ ...exec('aaa11111', 'flow-a', 'completed', '2026-08-16T10:00:00.000Z'), projectId: alphaId },
			{ ...exec('bbb22222', 'flow-a', 'completed', '2026-08-16T11:00:00.000Z'), projectId: betaId },
			{ ...exec('old33333', 'flow-a', 'completed', '2026-08-16T12:00:00.000Z'), projectRoot: '/old/root' },
		];
		for (const record of records) {
			fs.writeFileSync(
				path.join(configDir, 'executions', `${String(record['executionId'])}.json`),
				JSON.stringify(record)
			);
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
		fixture.dispose();
	});

	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerHistoryCommand(program, () => configDir);
		program.parse(['node', 'test', 'history', ...args]);
	};
	const printed = (): string => logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const errors = (): string => errorSpy.mock.calls.flat().join(' ');

	it('-p filters on the project given by name, alias or id', () => {
		for (const ref of ['alpha', 'al', alphaId]) {
			logSpy.mockClear();
			run('-p', ref);
			expect(printed()).toContain('aaa11111');
			expect(printed()).not.toContain('bbb22222');
			expect(printed()).not.toContain('old33333');
		}
	});

	it('FLOW_PROJECT filters like --project, and the flag wins over it', () => {
		process.env['FLOW_PROJECT'] = 'beta';
		run();
		expect(printed()).toContain('bbb22222');
		expect(printed()).not.toContain('aaa11111');
		logSpy.mockClear();
		run('--project', 'alpha');
		expect(printed()).toContain('aaa11111');
		expect(printed()).not.toContain('bbb22222');
	});

	it('does not filter by the cwd: without flag or variable every execution is listed', () => {
		run();
		expect(printed()).toContain('aaa11111');
		expect(printed()).toContain('bbb22222');
		expect(printed()).toContain('old33333');
	});

	it('exits 1 naming the flag and the value for a project that is not registered', () => {
		expect(() => run('-p', 'nope')).toThrow('exit');
		expect(errors()).toContain('--project "nope":');
	});

	it('names FLOW_PROJECT when the variable is the one that does not resolve', () => {
		process.env['FLOW_PROJECT'] = 'nope';
		expect(() => run()).toThrow('exit');
		expect(errors()).toContain('FLOW_PROJECT="nope":');
	});

	it('--id shows the project as name (id), and the bare root with a dash for an old record', () => {
		run('--id', 'aaa');
		expect(printed()).toContain(`Project:   alpha (${alphaId})`);
		logSpy.mockClear();
		run('--id', 'old');
		expect(printed()).toContain('Project:   /old/root (-)');
	});

	it('--json prints projectId in the raw record', () => {
		run('--json', '-p', 'alpha');
		const records = JSON.parse(String(writeSpy.mock.calls[0]![0])) as Record<string, unknown>[];
		expect(records).toEqual([expect.objectContaining({ executionId: 'aaa11111', projectId: alphaId })]);
	});
});
