import { describe, expect, it } from 'vitest';

import { summarizeDaemon } from './DaemonDigest.js';
import type { WorkerSummary } from './WorkerSummary.js';

const worker = (workerId: string, state: 'idle' | 'busy'): WorkerSummary => ({
	workerId,
	pid: 1,
	state,
	labels: [],
	attachedProjects: [],
	hasUserInterface: false,
	ephemeral: false,
});
const running = { running: true, pid: 4242, port: 51234, startedAt: '2026-10-22T10:00:00.000Z' } as const;

describe('summarizeDaemon', () => {
	it('tells the daemon is down, in red, with what to do about it (the start command, not the long reason)', () => {
		const digest = summarizeDaemon({
			workers: [],
			daemon: { running: false, reason: 'Daemon is not running (no port file found in /cfg)' },
		});
		expect(digest).toEqual({
			daemonLabel: 'Daemon stopped',
			daemonVariant: 'danger',
			workersLabel: 'No worker',
			workersVariant: 'default',
			hint: 'Daemon is not running: run "flow start" or a flow.',
		});
	});

	it('counts connected workers and how many are busy', () => {
		const digest = summarizeDaemon({
			workers: [worker('a', 'busy'), worker('b', 'idle'), worker('c', 'idle')],
			daemon: running,
		});
		expect(digest).toEqual({
			daemonLabel: 'Daemon running',
			daemonVariant: 'success',
			workersLabel: '3 workers',
			workersVariant: 'info',
			hint: '1 busy, 2 idle',
		});
	});

	it('says one worker in the singular', () => {
		expect(summarizeDaemon({ workers: [worker('a', 'idle')], daemon: running }).workersLabel).toBe('1 worker');
	});

	it('warns when the daemon runs but no worker is connected, and points to the Workers page', () => {
		expect(summarizeDaemon({ workers: [], daemon: running })).toMatchObject({
			daemonVariant: 'success',
			workersLabel: 'No worker',
			workersVariant: 'warning',
			hint: 'The daemon holds no worker connection: open Workers to see the declared sources.',
		});
	});
});
