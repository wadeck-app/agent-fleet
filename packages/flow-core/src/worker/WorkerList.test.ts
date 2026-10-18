import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkerListError, describeRunningDaemon, formatWorkerLine, readWorkerList } from './WorkerList.js';
import type { WorkerSummary } from './WorkerSummary.js';

// vi.hoisted: the mock factory below runs before module-level consts exist.
const kit = vi.hoisted(() => {
	class DaemonNotRunningError extends Error {}
	return {
		DaemonNotRunningError,
		send: vi.fn(),
		readPortFile: vi.fn(),
	};
});

vi.mock('@wadeck-app/singleton-daemon-kit', () => ({
	DaemonNotRunningError: kit.DaemonNotRunningError,
	createDaemonClient: () => ({ send: kit.send }),
	readPortFile: kit.readPortFile,
}));

const worker = (overrides: Partial<WorkerSummary> = {}): WorkerSummary => ({
	workerId: 'w1',
	pid: 10,
	state: 'idle',
	labels: [],
	attachedProjects: [],
	hasUserInterface: false,
	ephemeral: false,
	...overrides,
});

describe('formatWorkerLine', () => {
	it('prints "-" placeholders and "external" origin for a bare worker', () => {
		expect(formatWorkerLine(worker())).toBe(
			'w1\tidle\tpid=10\tversion=-\texternal\tlabels=-\tshells=-\tinteractive=false'
		);
	});

	it('prints version, labels, shells, source and interactivity', () => {
		const line = formatWorkerLine(
			worker({
				version: '2026.1',
				labels: ['gpu', 'linux'],
				shellCapabilities: ['bash', 'pwsh'],
				sourceId: 'src-1',
				hasUserInterface: true,
				state: 'busy',
			})
		);
		expect(line).toBe(
			'w1\tbusy\tpid=10\tversion=2026.1\tsrc-1\tlabels=gpu,linux\tshells=bash,pwsh\tinteractive=true'
		);
	});

	it('labels a daemon-created worker as daemon-forked whatever its source', () => {
		expect(formatWorkerLine(worker({ ephemeral: true, sourceId: 'src-1' }))).toContain('\tdaemon-forked\t');
	});

	it('treats empty shell capabilities like none', () => {
		expect(formatWorkerLine(worker({ shellCapabilities: [] }))).toContain('shells=-');
	});
});

describe('describeRunningDaemon', () => {
	beforeEach(() => {
		kit.readPortFile.mockReset();
	});

	it('does not read the port file when the identity is not needed', async () => {
		expect(await describeRunningDaemon('/cfg', false)).toEqual({
			running: true,
			pid: undefined,
			port: undefined,
			startedAt: undefined,
		});
		expect(kit.readPortFile).not.toHaveBeenCalled();
	});

	it('returns pid, port and start time from the port file', async () => {
		kit.readPortFile.mockResolvedValue({ pid: 1, port: 2, startedAt: '2026-10-18T10:00:00.000Z' });
		expect(await describeRunningDaemon('/cfg', true)).toEqual({
			running: true,
			pid: 1,
			port: 2,
			startedAt: '2026-10-18T10:00:00.000Z',
		});
	});

	it('degrades to "details unavailable" when the port file is missing or unreadable', async () => {
		const unknown = { running: true, pid: undefined, port: undefined, startedAt: undefined };
		kit.readPortFile.mockResolvedValueOnce(null);
		expect(await describeRunningDaemon('/cfg', true)).toEqual(unknown);
		kit.readPortFile.mockRejectedValueOnce(new Error('EACCES'));
		expect(await describeRunningDaemon('/cfg', true)).toEqual(unknown);
	});
});

describe('readWorkerList', () => {
	beforeEach(() => {
		kit.send.mockReset();
		kit.readPortFile.mockReset();
	});

	it('returns the workers the daemon reports', async () => {
		kit.send.mockResolvedValue([worker()]);
		const result = await readWorkerList('/cfg');
		expect(result.workers).toEqual([worker()]);
		expect(result.daemon.running).toBe(true);
		expect(kit.send).toHaveBeenCalledWith('workers', undefined);
	});

	it('identifies the daemon only when the list is empty', async () => {
		kit.readPortFile.mockResolvedValue({ pid: 1, port: 2, startedAt: '2026-10-18T10:00:00.000Z' });
		kit.send.mockResolvedValue([]);
		expect((await readWorkerList('/cfg')).daemon).toMatchObject({ running: true, pid: 1, port: 2 });
	});

	it('reports a missing daemon as an empty list with the reason, not as a failure', async () => {
		kit.send.mockRejectedValue(new kit.DaemonNotRunningError('Daemon is not running (no port file)'));
		const result = await readWorkerList('/cfg');
		expect(result.workers).toEqual([]);
		expect(result.daemon).toEqual({ running: false, reason: 'Daemon is not running (no port file)' });
	});

	it('explains an outdated daemon (unknown command) with the restart hint', async () => {
		kit.send.mockRejectedValue(new Error('unknown command: workers'));
		await expect(readWorkerList('/cfg')).rejects.toThrow(/flow stop.*flow start.*flow cli update/);
		await expect(readWorkerList('/cfg')).rejects.toMatchObject({ kind: 'daemon-outdated' });
	});

	it('wraps any other daemon error with its own message', async () => {
		kit.send.mockRejectedValue(new Error('socket hang up'));
		const error = await readWorkerList('/cfg').catch((e: unknown) => e);
		expect(error).toBeInstanceOf(WorkerListError);
		expect(error).toMatchObject({ kind: 'daemon-error', message: 'socket hang up' });
	});
});
