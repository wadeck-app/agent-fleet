import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import { registerCostCommand } from './CostCommand';

// Aggregation is covered by CostReportBuilder.test.ts; this file covers what the command adds: options, the
// directory it reads, stdout, stderr and the exit code.

function exec(
	id: string,
	flowId: string,
	status: string,
	startedAt: string,
	usd?: number,
	extra: Record<string, unknown> = {}
): Record<string, unknown> {
	const attempt = {
		n: 1,
		origin: 'initial',
		startedAt,
		endedAt: startedAt,
		durationMs: 1,
		outcome: 'completed',
		endReason: 'completed',
		provider: 'opencode',
		model: 'm',
		...(usd === undefined ? {} : { usd }),
	};
	return {
		executionId: id,
		flowId,
		flowFile: `/tmp/${flowId}.yml`,
		status,
		currentSteps: [],
		startedAt,
		completedAt: startedAt,
		steps: {
			s: {
				status: 'completed',
				attempts: 1,
				attemptLog: [attempt],
				io: {
					inputs: {
						'inputs.taskId': { text: id.startsWith('aaa') ? '32' : '33', truncated: false, chars: 2 },
					},
					outputs: {},
				},
			},
		},
		...extra,
	};
}

describe('flow cost command', () => {
	let configDir: string;
	let fixture: RegisteredProjectFixture;
	let alphaId: string;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture().useAsProcessEnv();
		alphaId = (await fixture.register('alpha')).id;
		await fixture.register('beta');
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-cost-cmd-'));
		fs.mkdirSync(path.join(configDir, 'executions'));
		for (const e of [
			exec('aaa11111', 'flow-a', 'completed', '2026-10-01T10:00:00.000Z', 1, { projectId: alphaId }),
			exec('aaa22222', 'flow-b', 'failed', '2026-11-02T11:00:00.000Z'),
			exec('bbb33333', 'flow-a', 'completed', '2026-11-03T12:00:00.000Z', 3),
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
		fixture.dispose();
		vi.restoreAllMocks();
	});

	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerCostCommand(program, () => configDir);
		program.parse(['node', 'test', 'cost', ...args]);
	};
	const printed = (): string => logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const errors = (): string => errorSpy.mock.calls.flat().join(' ');
	const json = (): Record<string, any> => JSON.parse(String(writeSpy.mock.calls[0]![0]));

	it('prints a compact table, newest first, without a page limit', () => {
		run();
		const lines = printed().split('\n');
		expect(lines[0]).toContain('EXECUTION');
		expect(lines.slice(1).map(l => l.split(' ')[0])).toEqual(['bbb33333', 'aaa22222', 'aaa11111']);
		expect(lines.find(l => l.startsWith('aaa22222'))).toContain('unknown');
	});

	it('--json writes exactly one document on stdout with the echoed filters', () => {
		run('--json', '--flow', 'flow-a', '--since', '2026-09-01');
		expect(writeSpy).toHaveBeenCalledTimes(1);
		expect(String(writeSpy.mock.calls[0]![0]).endsWith('\n')).toBe(true);
		const doc = json();
		expect(doc).toMatchObject({ schema: 1, by: 'run', filters: { flow: 'flow-a', since: '2026-09-01' } });
		expect(doc['rows'].map((r: { executionId: string }) => r.executionId)).toEqual(['bbb33333', 'aaa11111']);
		expect(doc['rows'][0]).toMatchObject({ totalCostUsd: 3, totalCostComplete: true, inputs: { taskId: '33' } });
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('--since keeps only the runs started at or after the date', () => {
		run('--json', '--since', '2026-11-01');
		expect(json()['rows'].map((r: { executionId: string }) => r.executionId)).toEqual(['bbb33333', 'aaa22222']);
	});

	it('--status and -n apply, -n after the other filters', () => {
		run('--json', '--status', 'completed', '-n', '1');
		expect(json()['rows'].map((r: { executionId: string }) => r.executionId)).toEqual(['bbb33333']);
		expect(json()['filters']).toEqual({ status: 'completed', limit: 1 });
	});

	it('--by flow and --by input:<name> group the rows', () => {
		run('--json', '--by', 'flow');
		expect(json()['rows']).toEqual([
			expect.objectContaining({ flowId: 'flow-a', runs: 2, totalUsd: 4, medianUsdPerRun: 2, maxUsd: 3 }),
			expect.objectContaining({ flowId: 'flow-b', runs: 1, totalCostComplete: false }),
		]);
		writeSpy.mockClear();
		run('--json', '--by', 'input:taskId');
		expect(json()['by']).toBe('input:taskId');
		expect(json()['withoutInput']).toBe(0);
		expect(json()['rows'].map((r: { value: string }) => r.value)).toEqual(['33', '32']);
	});

	it('-p filters on the project and echoes its id', () => {
		run('--json', '-p', 'alpha');
		expect(json()['rows'].map((r: { executionId: string }) => r.executionId)).toEqual(['aaa11111']);
		expect(json()['filters']).toEqual({ project: 'alpha', projectId: alphaId });
	});

	it('exits 1 naming the flag and the value for a project that is not registered', () => {
		expect(() => run('-p', 'nope')).toThrow('exit');
		expect(errors()).toContain('--project "nope":');
	});

	it('exits 1 naming the value and an example for an invalid --since', () => {
		expect(() => run('--since', 'yesterday')).toThrow('exit');
		expect(errors()).toContain('Invalid --since "yesterday"');
		expect(errors()).toContain('--since 2026-11-01');
	});

	it('exits 1 listing the accepted forms for an unknown --by', () => {
		expect(() => run('--by', 'model')).toThrow('exit');
		expect(errors()).toContain('--by accepts: flow, input:<name>');
	});

	it('exits 1 for an invalid --limit', () => {
		expect(() => run('--limit', 'abc')).toThrow('exit');
		expect(errors()).toMatch(/Invalid limit.*non-negative integer/);
	});

	it('exits 1 with the directory and a hint when the executions directory cannot be read', () => {
		fs.rmSync(path.join(configDir, 'executions'), { recursive: true });
		// A file where the directory should be: readdir fails with ENOTDIR.
		fs.writeFileSync(path.join(configDir, 'executions'), 'x');
		expect(() => run()).toThrow('exit');
		expect(errors()).toContain('Cannot read the executions directory');
		expect(errors()).toContain(configDir);
	});

	it('warns on stderr about a damaged file and keeps stdout a clean document', () => {
		fs.writeFileSync(path.join(configDir, 'executions', 'broken01.json'), '{ not json');
		run('--json');
		expect(json()['rows']).toHaveLength(3);
		expect(errors()).toContain('1 execution file skipped');
	});

	it('says so when nothing matches (not an error)', () => {
		run('--flow', 'nope');
		expect(printed()).toBe('No executions match.');
	});
});
