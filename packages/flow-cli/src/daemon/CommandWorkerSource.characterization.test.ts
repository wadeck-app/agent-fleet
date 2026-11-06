import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const { contactDeclaredSources } = await import('./WorkerSourceContact.js');
const { WorkerSourceRegistry } = await import('./WorkerSourceRegistry.js');

/**
 * Pins what a declared `built-in:command` source does TODAY, through the entry point the daemon uses
 * (`contactDeclaredSources`) and the registry it reads, so that moving the kind behind the worker-type contract cannot
 * change it unnoticed. The Docker sandbox harness and exec wrappers are launched through this kind.
 */

let dir: string;
let stderrListener: ((data: Buffer) => void) | undefined;
let child: { pid: number | undefined; unref: ReturnType<typeof vi.fn>; on: ReturnType<typeof vi.fn>; stderr: unknown };

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'command-characterization-'));
	stderrListener = undefined;
	child = {
		pid: 4242,
		unref: vi.fn(),
		on: vi.fn(),
		stderr: {
			on: (event: string, listener: (data: Buffer) => void) => {
				if (event === 'data') stderrListener = listener;
			},
		},
	};
	spawnMock.mockReset();
	spawnMock.mockReturnValue(child);
});

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env['FLOW_DAEMON_MODE'];
	rmSync(dir, { recursive: true, force: true });
});

function declare(options: Record<string, unknown>, sourceId = 'laptop') {
	const registry = new WorkerSourceRegistry(dir);
	registry.declare({ sourceId, provider: 'built-in:command', labels: [], maxWorkers: 1, options });
	return new WorkerSourceRegistry(dir).list();
}

async function contact(
	entries: ReturnType<typeof declare>,
	issueLaunchToken?: (sourceId: string) => string
): Promise<string[]> {
	const reported: string[] = [];
	await contactDeclaredSources(
		entries,
		'ws://127.0.0.1:4101',
		message => reported.push(message),
		issueLaunchToken === undefined ? {} : { issueLaunchToken }
	);
	return reported;
}

describe('a declared built-in:command source - characterization', () => {
	it('spawns the command with exactly these options: shell, hidden stdin/stdout, piped stderr, cwd only when declared', async () => {
		const reported = await contact(declare({ command: 'flow', args: ['worker', '--x'], cwd: 'C:/work' }));

		expect(reported).toEqual([]);
		expect(spawnMock).toHaveBeenCalledTimes(1);
		const [command, args, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
		expect(command).toBe('flow');
		expect(args).toEqual(['worker', '--x']);
		expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio']);
		expect(options['cwd']).toBe('C:/work');
		expect(options['shell']).toBe(true);
		expect(options['stdio']).toEqual(['ignore', 'ignore', 'pipe']);
	});

	it('passes no cwd and no args when none are declared', async () => {
		await contact(declare({ command: 'flow' }));

		const [, args, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
		expect(args).toEqual([]);
		expect(Object.keys(options).sort()).toEqual(['env', 'shell', 'stdio']);
	});

	it('adds exactly the four launch variables to the daemon environment, with a token minted per launch', async () => {
		const issued: string[] = [];
		await contact(declare({ command: 'flow' }), sourceId => {
			issued.push(sourceId);
			return 'one-shot';
		});

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string | undefined> }).env;
		expect(env['FLOW_DAEMON_WS_URL']).toBe('ws://127.0.0.1:4101');
		expect(env['FLOW_WORKER_SOURCE_ID']).toBe('laptop');
		// A source contacted at startup has no project yet: the list is empty, not absent.
		expect(env['FLOW_WORKER_PROJECTS']).toBe('');
		expect(env['FLOW_WORKER_TOKEN']).toBe('one-shot');
		expect(issued).toEqual(['laptop']);
		const added = Object.keys(env).filter(key => !(key in process.env));
		expect(added.sort()).toEqual([
			'FLOW_DAEMON_WS_URL',
			'FLOW_WORKER_PROJECTS',
			'FLOW_WORKER_SOURCE_ID',
			'FLOW_WORKER_TOKEN',
		]);
	});

	it('adds no token variable when the daemon cannot mint one', async () => {
		await contact(declare({ command: 'flow' }));

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string | undefined> }).env;
		expect('FLOW_WORKER_TOKEN' in env).toBe(false);
	});

	it('removes FLOW_DAEMON_MODE from the child environment and keeps the rest of the daemon environment', async () => {
		process.env['FLOW_DAEMON_MODE'] = '1';
		await contact(declare({ command: 'flow' }));

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string | undefined> }).env;
		expect('FLOW_DAEMON_MODE' in env).toBe(false);
		expect(env['PATH']).toBe(process.env['PATH']);
	});

	it('detaches the child and prefixes its stderr with the source id', async () => {
		const written: string[] = [];
		vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string) => {
			written.push(chunk);
			return true;
		}) as typeof process.stderr.write);

		await contact(declare({ command: 'flow' }));
		stderrListener!(Buffer.from('boom\n'));

		expect(child.unref).toHaveBeenCalledOnce();
		expect(written).toEqual(['[source laptop] boom\n']);
	});

	it('reports a missing command by source with the exact message', async () => {
		const entries = declare({ command: 'flow' });
		const entryWithoutCommand = [{ ...entries[0]!, options: {} }];

		const reported = await contact(entryWithoutCommand);

		expect(reported).toEqual([
			'could not obtain a worker from source "laptop": source "laptop" uses built-in:command but declares no command to run. Add options.command to the source entry.',
		]);
		expect(spawnMock).not.toHaveBeenCalled();
	});

	it('reports a spawn without a pid with the exact message', async () => {
		child.pid = undefined;

		const reported = await contact(declare({ command: 'flow' }));

		expect(reported).toEqual([
			'could not obtain a worker from source "laptop": source "laptop": the command produced no pid, so no worker will join',
		]);
	});

	it('refuses at declaration a source without a command, and a literal credential in its options', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() =>
			registry.declare({ sourceId: 'laptop', provider: 'built-in:command', labels: [], maxWorkers: 1 })
		).toThrow(
			'Worker source "laptop" uses built-in:command but declares no command to run. Pass --command "<how to launch a worker>", e.g. --command "flow worker --source laptop --token <worker token>".'
		);
		expect(() =>
			registry.declare({
				sourceId: 'laptop',
				provider: 'built-in:command',
				labels: [],
				maxWorkers: 1,
				options: { command: 'flow', token: 'abc123' },
			})
		).toThrow(
			'Literal credential value in worker source "laptop" options: sensitive field "token" must use ${ENV_VAR} interpolation, not a literal value'
		);
		expect(registry.list()).toEqual([]);
	});

	it('serves an entry from an old worker-sources.json that predates the plugin fields', async () => {
		writeFileSync(
			join(dir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'laptop',
						provider: 'built-in:command',
						options: { command: 'flow', args: ['worker'] },
						labels: [],
						maxWorkers: 1,
						tokenHash: 'deadbeef',
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			}),
			'utf8'
		);

		const reported = await contact(new WorkerSourceRegistry(dir).list());

		expect(reported).toEqual([]);
		expect(spawnMock.mock.calls[0]!.slice(0, 2)).toEqual(['flow', ['worker']]);
	});
});
