import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { WorkerRegistry } from './WorkerRegistry.js';

function fakeWorker(): WebSocket {
	return { readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

const minimal = { pid: 1234 };

describe('WorkerRegistry - hold (run-to-worker affinity)', () => {
	it('keeps heldBy across the ready a worker sends after each step', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		expect(registry.setHold(ws, 'run-1')).toBe(true);

		registry.markBusy(ws);
		registry.register(ws, minimal);

		expect(registry.describe(ws)?.heldBy).toBe('run-1');
		expect(registry.describe(ws)?.state).toBe('idle');
	});

	it('exposes heldBy in summarize() only while held, and ends the hold with null', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		expect(registry.summarize()[0]).not.toHaveProperty('heldBy');

		registry.setHold(ws, 'run-1');
		expect(registry.summarize()[0]?.heldBy).toBe('run-1');

		registry.setHold(ws, null);
		expect(registry.summarize()[0]).not.toHaveProperty('heldBy');
	});

	it('forgets the hold when the worker is removed, and does not resurrect a removed worker', () => {
		const registry = new WorkerRegistry();
		const ws = fakeWorker();
		registry.register(ws, minimal);
		registry.setHold(ws, 'run-1');
		registry.remove(ws);

		expect(registry.setHold(ws, 'run-2')).toBe(false);
		registry.register(ws, minimal);
		expect(registry.describe(ws)?.heldBy).toBeUndefined();
	});
});
