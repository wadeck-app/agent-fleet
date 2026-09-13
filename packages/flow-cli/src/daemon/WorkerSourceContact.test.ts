import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));

const { CommandWorkerSource, InboundWorkerSource, contactDeclaredSources, resolveSourceProvider } =
	await import('./WorkerSourceContact.js');

const request = {
	daemonEndpoint: 'ws://127.0.0.1:4101',
	sourceId: 'laptop',
	projects: ['C:/proj'],
};

function fakeChild(pid: number | undefined) {
	return { pid, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } };
}

beforeEach(() => {
	spawnMock.mockReset();
	spawnMock.mockReturnValue(fakeChild(4242));
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('InboundWorkerSource', () => {
	// An inbound worker dials the daemon; there is nothing the daemon can initiate.
	it('resolves without spawning anything', async () => {
		await new InboundWorkerSource().obtainWorker(request);
		expect(spawnMock).not.toHaveBeenCalled();
	});
});

describe('CommandWorkerSource', () => {
	it('runs the configured command', async () => {
		await new CommandWorkerSource({ command: 'flow', args: ['worker'] }).obtainWorker(request);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(spawnMock.mock.calls[0]![0]).toBe('flow');
		expect(spawnMock.mock.calls[0]![1]).toEqual(['worker']);
	});

	it('passes the daemon endpoint and source through the environment', async () => {
		await new CommandWorkerSource({ command: 'flow' }).obtainWorker(request);

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect(env['FLOW_WORKER_SOURCE_ID']).toBe('laptop');
		expect(env['FLOW_DAEMON_WS_URL']).toBe('ws://127.0.0.1:4101');
		expect(env['FLOW_WORKER_PROJECTS']).toBe('C:/proj');
	});

	// The registry stores only a hash of the token (T-09), so the daemon cannot hand one
	// out. The declared command has to carry its own credential.
	it('does not invent a credential', async () => {
		await new CommandWorkerSource({ command: 'flow' }).obtainWorker(request);

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect(env['FLOW_WORKER_TOKEN']).toBeUndefined();
	});

	// The bug this pins down: the child inherited the daemon's own FLOW_DAEMON_MODE=1, and
	// FlowIndex turns any process carrying it into a daemon regardless of its arguments. So
	// `--command "flow worker"` produced a second daemon, which contacted its sources at startup and
	// spawned a third -- an unbounded chain of daemons, observed as 21 orphans in one run.
	it('does not let the child inherit daemon mode', async () => {
		process.env['FLOW_DAEMON_MODE'] = '1';
		try {
			await new CommandWorkerSource({ command: 'flow', args: ['worker'] }).obtainWorker(request);

			const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
			expect(env['FLOW_DAEMON_MODE']).toBeUndefined();
		} finally {
			delete process.env['FLOW_DAEMON_MODE'];
		}
	});

	it('fails loudly when no command is configured', async () => {
		await expect(new CommandWorkerSource({}).obtainWorker(request)).rejects.toThrow(/command/i);
	});

	it('fails loudly when the spawn produces no pid', async () => {
		spawnMock.mockReturnValue(fakeChild(undefined));

		await expect(new CommandWorkerSource({ command: 'flow' }).obtainWorker(request)).rejects.toThrow(/no pid/i);
	});
});

describe('resolveSourceProvider', () => {
	it('maps the two built-in providers', () => {
		expect(resolveSourceProvider('built-in:inbound', {})).toBeInstanceOf(InboundWorkerSource);
		expect(resolveSourceProvider('built-in:command', { command: 'flow' })).toBeInstanceOf(CommandWorkerSource);
	});

	// No fallback for an unrecognised value: a mistyped provider must not silently become
	// the inbound one, which would look like a worker that simply never turns up.
	it('fails loudly on an unknown provider, naming what is supported', () => {
		expect(() => resolveSourceProvider('built-in:telepathy', {})).toThrow(/built-in:inbound/);
		expect(() => resolveSourceProvider('built-in:telepathy', {})).toThrow(/built-in:telepathy/);
	});

	it('builds the host provider when the daemon supplies its host registry', () => {
		const provider = resolveSourceProvider('built-in:host', {}, { findHost: () => undefined });

		expect(typeof provider.obtainWorker).toBe('function');
	});

	// Refused rather than degraded: a host provider with no way to reach hosts would produce
	// nothing, which reads exactly like a machine that happens to be offline.
	it('refuses the host provider when it cannot reach hosts, and says it is a wiring bug', () => {
		expect(() => resolveSourceProvider('built-in:host', {})).toThrow(/report it/i);
	});
});

describe('contactDeclaredSources', () => {
	const entry = (sourceId: string, provider: string, options?: Record<string, unknown>) => ({
		sourceId,
		provider,
		labels: [],
		maxWorkers: 1,
		tokenHash: 'x',
		createdAt: '2026-01-01T00:00:00.000Z',
		...(options ? { options } : {}),
	});

	it('contacts every declared source', async () => {
		const reported: string[] = [];
		await contactDeclaredSources(
			[entry('a', 'built-in:command', { command: 'flow' }), entry('b', 'built-in:command', { command: 'flow' })],
			'ws://127.0.0.1:1',
			reported.push.bind(reported)
		);

		expect(spawnMock).toHaveBeenCalledTimes(2);
	});

	// One unreachable source must not stop the others, and must not pass unnoticed (D#25).
	it('reports a failing source by name and continues', async () => {
		const reported: string[] = [];
		await contactDeclaredSources(
			[entry('broken', 'built-in:command', {}), entry('fine', 'built-in:command', { command: 'flow' })],
			'ws://127.0.0.1:1',
			reported.push.bind(reported)
		);

		expect(reported.join(' ')).toContain('broken');
		expect(spawnMock).toHaveBeenCalledTimes(1);
	});

	it('reports an unknown provider rather than skipping it quietly', async () => {
		const reported: string[] = [];
		await contactDeclaredSources([entry('weird', 'nope')], 'ws://127.0.0.1:1', reported.push.bind(reported));

		expect(reported.join(' ')).toContain('weird');
	});

	it('does nothing when nothing is declared', async () => {
		const reported: string[] = [];
		await contactDeclaredSources([], 'ws://127.0.0.1:1', reported.push.bind(reported));

		expect(reported).toEqual([]);
		expect(spawnMock).not.toHaveBeenCalled();
	});
});
