import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { WorkerRegistry } from './WorkerRegistry.js';

function fakeWorker(readyState = 1): WebSocket {
	return { readyState, OPEN: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

const minimal = { pid: 1234 };

describe('WorkerRegistry - membership', () => {
	it('registers a worker as idle', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);

		expect(registry.listIdle().map(candidate => candidate.ws)).toEqual([ws]);
		expect(registry.liveCount).toBe(1);
	});

	it('removes a worker', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.remove(ws);

		expect(registry.listIdle()).toEqual([]);
		expect(registry.liveCount).toBe(0);
	});

	it('re-registering the same connection does not double count', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.register(ws, minimal);

		expect(registry.liveCount).toBe(1);
	});
});

describe('WorkerRegistry - idle/busy state', () => {
	it('does not return a busy worker as idle', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.markBusy(ws);

		expect(registry.listIdle()).toEqual([]);
	});

	it('returns the worker again once it goes back to idle', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.markBusy(ws);
		registry.markIdle(ws);

		expect(registry.listIdle().map(candidate => candidate.ws)).toEqual([ws]);
	});

	it('reports whether any worker is busy', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		expect(registry.hasBusyWorkers()).toBe(false);

		registry.markBusy(ws);
		expect(registry.hasBusyWorkers()).toBe(true);
	});

	// Marking an unregistered connection must not silently create an entry: that would
	// resurrect a worker that already disconnected.
	it('ignores state changes for an unregistered connection', () => {
		const registry = new WorkerRegistry();
		registry.markBusy(fakeWorker());
		registry.markIdle(fakeWorker());

		expect(registry.liveCount).toBe(0);
	});
});

describe('WorkerRegistry - capacity is counted from live connections (D#14)', () => {
	it('counts live and idle workers independently', () => {
		const registry = new WorkerRegistry();
		const a = fakeWorker();
		const b = fakeWorker();
		registry.register(a, minimal);
		registry.register(b, minimal);
		registry.markBusy(a);

		expect(registry.liveCount).toBe(2);
		expect(registry.idleCount).toBe(1);
	});

	it('drops the count when a worker disconnects, with no child-process bookkeeping', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.markBusy(ws);
		registry.remove(ws);

		expect(registry.liveCount).toBe(0);
		expect(registry.hasBusyWorkers()).toBe(false);
	});
});

describe('WorkerRegistry - registration metadata', () => {
	it('records source, labels, projects and interactivity', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, {
			pid: 1,
			sourceId: 'src-1',
			labels: ['gpu', 'linux'],
			attachedProjects: ['C:/proj'],
			hasUserInterface: true,
		});

		const info = registry.describe(ws);
		expect(info?.sourceId).toBe('src-1');
		expect(info?.labels).toEqual(['gpu', 'linux']);
		expect(info?.attachedProjects).toEqual(['C:/proj']);
		expect(info?.hasUserInterface).toBe(true);
	});

	// Defaults are documented, not inferred: a worker that claims nothing is headless,
	// unlabelled and attached to nothing until it says otherwise.
	it('defaults labels and projects to empty and hasUserInterface to false', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);

		const info = registry.describe(ws);
		expect(info?.labels).toEqual([]);
		expect(info?.attachedProjects).toEqual([]);
		expect(info?.hasUserInterface).toBe(false);
	});
});

// D#51-D#55: the daemon may idle down freely, but telling every connected worker to
// exit destroys the one the user launched in a terminal -- the core deliverable (D#48).
describe('WorkerRegistry - ephemeral vs externally launched workers', () => {
	it('defaults a worker to non-ephemeral, so an unknown worker is never killed', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);

		expect(registry.describe(ws)?.ephemeral).toBe(false);
	});

	it('records a daemon-created worker as ephemeral', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal, { ephemeral: true });

		expect(registry.describe(ws)?.ephemeral).toBe(true);
	});

	it('broadcastToEphemeral reaches only the workers the daemon created', () => {
		const registry = new WorkerRegistry();
		const forked = fakeWorker();
		const launchedByUser = fakeWorker();
		registry.register(forked, minimal, { ephemeral: true });
		registry.register(launchedByUser, minimal, { ephemeral: false });

		registry.broadcastToEphemeral({ type: 'done' });

		expect(forked.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
		expect(launchedByUser.send).not.toHaveBeenCalled();
	});

	it('re-registering keeps the ephemeral flag when not restated', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal, { ephemeral: true });
		// A forked worker sends `ready` again after each step.
		registry.register(ws, minimal);

		expect(registry.describe(ws)?.ephemeral).toBe(true);
	});
});

// Backs `flow worker list` (Q#9): live connections only, since only a connection proves
// a step can actually reach a worker (D#4).
describe('WorkerRegistry - summarize', () => {
	it('reports nothing when no worker is connected', () => {
		expect(new WorkerRegistry().summarize()).toEqual([]);
	});

	it('reports what each worker declared, plus its dispatch state', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(
			ws,
			{
				pid: 4242,
				sourceId: 'laptop',
				labels: ['gpu'],
				attachedProjects: ['C:/proj'],
				hasUserInterface: true,
			},
			{ ephemeral: false }
		);

		const [summary] = registry.summarize();
		expect(summary?.pid).toBe(4242);
		expect(summary?.sourceId).toBe('laptop');
		expect(summary?.labels).toEqual(['gpu']);
		expect(summary?.attachedProjects).toEqual(['C:/proj']);
		expect(summary?.hasUserInterface).toBe(true);
		expect(summary?.state).toBe('idle');
		expect(summary?.ephemeral).toBe(false);
		expect(summary?.workerId).toBe(registry.describe(ws)?.workerId);
	});

	it('reflects the busy state so the list is not misread as free capacity', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.markBusy(ws);

		expect(registry.summarize()[0]?.state).toBe('busy');
	});

	it('distinguishes a daemon-forked worker from one launched externally', () => {
		const registry = new WorkerRegistry();
		registry.register(fakeWorker(), minimal, { ephemeral: true });
		registry.register(fakeWorker(), minimal, { ephemeral: false });

		expect(
			registry
				.summarize()
				.map(w => w.ephemeral)
				.sort()
		).toEqual([false, true]);
	});

	it('drops a worker from the list as soon as it disconnects', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.remove(ws);

		expect(registry.summarize()).toEqual([]);
	});
});

describe('WorkerRegistry - sending', () => {
	it('sends a serialised message to an open connection', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker(1);
		registry.register(ws, minimal);

		expect(registry.send(ws, { type: 'done' })).toBe(true);
		expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
	});

	it('reports failure and does not send when the connection is not open', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker(3);
		registry.register(ws, minimal);

		expect(registry.send(ws, { type: 'done' })).toBe(false);
		expect(ws.send).not.toHaveBeenCalled();
	});

	// Closing an external worker's socket must not be confused with shutting it down: the
	// daemon needs the socket closed to exit, and the worker re-registers afterwards.
	it('closes external sockets without sending anything', () => {
		const registry = new WorkerRegistry();
		const forked = fakeWorker();
		const launchedByUser = fakeWorker();
		registry.register(forked, minimal, { ephemeral: true });
		registry.register(launchedByUser, minimal, { ephemeral: false });

		registry.disconnectExternal();

		expect(launchedByUser.close).toHaveBeenCalled();
		expect(launchedByUser.send).not.toHaveBeenCalled();
		// A forked worker is told to exit via broadcastToEphemeral instead.
		expect(forked.close).not.toHaveBeenCalled();
	});
});
