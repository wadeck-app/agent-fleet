import { Command } from 'commander';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { RegisteredProjectFixture } from '../../test-utils/RegisteredProjectFixture';
import { registerPruneCommand } from './PruneCommand';

// Every test works on a temp config dir: the real store is never read or written.

function record(
	id: string,
	flowId: string,
	status: string,
	startedAt: string,
	extra: Record<string, unknown> = {}
): Record<string, unknown> {
	return {
		executionId: id,
		flowId,
		flowFile: `/tmp/${flowId}.yml`,
		status,
		currentSteps: [],
		startedAt,
		completedAt: status === 'running' ? null : startedAt,
		steps: {},
		...extra,
	};
}

describe('flow prune command', () => {
	let configDir: string;
	let fixture: RegisteredProjectFixture;
	let alphaId: string;
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let writeSpy: ReturnType<typeof vi.spyOn>;
	const storeFile = (id: string): string => path.join(configDir, 'executions', `${id}.json`);
	const stored = (): string[] =>
		fs
			.readdirSync(path.join(configDir, 'executions'))
			.filter(name => name.endsWith('.json'))
			.map(name => name.replace('.json', ''))
			.sort();

	beforeEach(async () => {
		fixture = new RegisteredProjectFixture().useAsProcessEnv();
		alphaId = (await fixture.register('alpha')).id;
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-prune-cmd-'));
		fs.mkdirSync(path.join(configDir, 'executions'));
		for (const r of [
			record('aaaaaaa1', 'probe', 'completed', '2026-10-01T10:00:00.000Z', { projectId: alphaId }),
			record('aaaaaaa2', 'probe', 'failed', '2026-11-02T11:00:00.000Z'),
			record('aaaaaaa3', 'real', 'completed', '2026-11-03T12:00:00.000Z'),
			record('aaaaaaa4', 'other', 'failed', '2026-09-03T12:00:00.000Z'),
			record('aaaaaaa5', 'probe', 'running', '2026-09-01T12:00:00.000Z'),
			record('aaaaaaa6', 'probe', 'queued', '2026-09-01T13:00:00.000Z'),
			record('aaaaaaa7', 'probe', 'running', '2026-09-01T14:00:00.000Z', {
				paused: { since: '2026-09-01T14:01:00.000Z' },
			}),
		]) {
			fs.writeFileSync(storeFile(String(r['executionId'])), JSON.stringify(r));
		}
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('exit');
		});
		process.exitCode = undefined;
	});

	afterEach(() => {
		fs.rmSync(configDir, { recursive: true, force: true });
		fixture.dispose();
		vi.restoreAllMocks();
		process.exitCode = undefined;
	});

	const run = (...args: string[]): void => {
		const program = new Command();
		program.exitOverride();
		registerPruneCommand(program, () => configDir);
		program.parse(['node', 'test', 'prune', ...args]);
	};
	const printed = (): string => logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
	const errors = (): string => errorSpy.mock.calls.flat().join(' ');
	const json = (): Record<string, any> => JSON.parse(String(writeSpy.mock.calls[0]![0]));
	const ALL = ['aaaaaaa1', 'aaaaaaa2', 'aaaaaaa3', 'aaaaaaa4', 'aaaaaaa5', 'aaaaaaa6', 'aaaaaaa7'];

	it('requires at least one filter and deletes nothing', () => {
		expect(() => run('--yes')).toThrow('exit');
		expect(errors()).toContain('needs at least one filter');
		expect(stored()).toEqual(ALL);
	});

	it('FLOW_PROJECT alone is not a filter', () => {
		process.env['FLOW_PROJECT'] = alphaId;
		try {
			expect(() => run('--yes')).toThrow('exit');
			expect(errors()).toContain('needs at least one filter');
		} finally {
			delete process.env['FLOW_PROJECT'];
		}
		expect(stored()).toEqual(ALL);
	});

	it('without --yes behaves as a dry run and says how to delete', () => {
		run('--flow', 'probe');
		expect(printed()).toContain('Would delete 2 executions (dry run)');
		expect(printed()).toContain('Nothing deleted, rerun with --yes');
		expect(stored()).toEqual(ALL);
	});

	it('--dry-run wins over --yes and lists id, flow, status and start', () => {
		run('--flow', 'probe', '--dry-run', '--yes');
		expect(printed()).toContain('aaaaaaa1  probe  completed  2026-10-01T10:00:00.000Z');
		expect(printed()).toContain('--dry-run');
		expect(stored()).toEqual(ALL);
	});

	it('--yes deletes the matching finished runs of a repeated --flow and keeps the others', () => {
		run('--flow', 'probe', '--flow', 'other', '--yes');
		expect(printed()).toContain('Deleted 3 executions');
		expect(printed()).toContain('Left in place');
		expect(stored()).toEqual(['aaaaaaa3', 'aaaaaaa5', 'aaaaaaa6', 'aaaaaaa7']);
		expect(process.exitCode).toBeUndefined();
	});

	it('refuses queued, running and paused runs, lists them, and exits 0', () => {
		run('--flow', 'probe', '--yes', '--json');
		const doc = json();
		expect(doc['deleted'].map((d: { executionId: string }) => d.executionId).sort()).toEqual([
			'aaaaaaa1',
			'aaaaaaa2',
		]);
		expect(doc['refused'].map((d: { executionId: string }) => d.executionId).sort()).toEqual([
			'aaaaaaa5',
			'aaaaaaa6',
			'aaaaaaa7',
		]);
		expect(doc['refused'][0]['reason']).toEqual(expect.any(String));
		expect(process.exitCode).toBeUndefined();
		expect(stored()).toEqual(['aaaaaaa3', 'aaaaaaa4', 'aaaaaaa5', 'aaaaaaa6', 'aaaaaaa7']);
	});

	it('--status running only refuses: nothing deleted and exit code 1', () => {
		run('--status', 'running', '--yes');
		expect(printed()).toContain('No finished execution matches');
		expect(printed()).toContain('aaaaaaa5');
		expect(process.exitCode).toBe(1);
		expect(stored()).toEqual(ALL);
	});

	it('--status failed selects only failed runs', () => {
		run('--status', 'failed', '--yes');
		expect(stored()).toEqual(['aaaaaaa1', 'aaaaaaa3', 'aaaaaaa5', 'aaaaaaa6', 'aaaaaaa7']);
	});

	it('rejects an unknown status', () => {
		expect(() => run('--status', 'cancelled')).toThrow('exit');
		expect(errors()).toContain('Invalid --status "cancelled"');
	});

	it('--before is strict, accepts a date or a datetime, and rejects garbage', () => {
		run('--before', '2026-10-01T10:00:00Z', '--yes');
		expect(stored()).toEqual(['aaaaaaa1', 'aaaaaaa2', 'aaaaaaa3', 'aaaaaaa5', 'aaaaaaa6', 'aaaaaaa7']);
		expect(() => run('--before', 'yesterday')).toThrow('exit');
		expect(errors()).toContain('Invalid --before "yesterday"');
	});

	it('-p selects the executions of that project only', () => {
		run('-p', 'alpha', '--yes');
		expect(stored()).toEqual(ALL.filter(id => id !== 'aaaaaaa1'));
	});

	it('an unknown project exits 1 and deletes nothing', () => {
		expect(() => run('-p', 'nope', '--yes')).toThrow('exit');
		expect(stored()).toEqual(ALL);
	});

	it('--json dry run: one document with wouldDelete, reminder on stderr', () => {
		run('--flow', 'probe', '--json');
		expect(writeSpy).toHaveBeenCalledTimes(1);
		const doc = json();
		expect(doc).toMatchObject({ schema: 1, dryRun: true });
		expect(doc['deleted']).toBeUndefined();
		expect(doc['wouldDelete'][0]).toEqual({
			executionId: 'aaaaaaa2',
			flowId: 'probe',
			status: 'failed',
			startedAt: '2026-11-02T11:00:00.000Z',
		});
		expect(errors()).toContain('rerun with --yes');
		expect(logSpy).not.toHaveBeenCalled();
	});

	it('warns about an unreadable file and never deletes it', () => {
		fs.writeFileSync(storeFile('zzzzzzz1'), '{broken');
		run('--flow', 'probe', '--yes');
		expect(errors()).toContain('1 execution file skipped');
		expect(fs.existsSync(storeFile('zzzzzzz1'))).toBe(true);
	});

	it('an empty selection says so and exits 0', () => {
		run('--flow', 'does-not-exist', '--yes');
		expect(printed()).toContain('nothing to delete');
		expect(process.exitCode).toBeUndefined();
	});
});
