import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { WorkerRegistry } from './WorkerRegistry.js';

function fakeWorker(readyState = 1): WebSocket {
	return { readyState, OPEN: 1, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
}

const minimal = { pid: 1234 };

describe('WorkerRegistry - membership', () => {
	it('registers a worker as idle', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);

		expect(registry.getIdle()).toBe(ws);
		expect(registry.liveCount).toBe(1);
	});

	it('removes a worker', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.remove(ws);

		expect(registry.getIdle()).toBeUndefined();
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

		expect(registry.getIdle()).toBeUndefined();
	});

	it('returns the worker again once it goes back to idle', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.markBusy(ws);
		registry.markIdle(ws);

		expect(registry.getIdle()).toBe(ws);
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

	it('broadcasts to every registered worker', () => {
		const registry = new WorkerRegistry();
		const a = fakeWorker();
		const b = fakeWorker();
		registry.register(a, minimal);
		registry.register(b, minimal);

		registry.broadcast({ type: 'done' });

		expect(a.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
		expect(b.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
	});
});
