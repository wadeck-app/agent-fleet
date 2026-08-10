import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

vi.mock('node:child_process', () => ({
	spawn: vi.fn(() => {
		const emitter: {
			pid: number;
			killed: boolean;
			kill: ReturnType<typeof vi.fn>;
			on: ReturnType<typeof vi.fn>;
			stderr: { on: ReturnType<typeof vi.fn> };
		} = {
			pid: 12345,
			killed: false,
			kill: vi.fn(),
			on: vi.fn(),
			stderr: { on: vi.fn() },
		};
		return emitter;
	}),
}));

import { spawn } from 'node:child_process';
import { WorkerPool } from './WorkerPool.js';

const mockSpawn = vi.mocked(spawn);

function makeMockWs(): WebSocket {
	return { readyState: 1, send: vi.fn(), OPEN: 1 } as unknown as WebSocket;
}

describe('WorkerPool', () => {
	let pool: WorkerPool;

	beforeEach(() => {
		pool = new WorkerPool(3, 8080, 8081);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('canSpawn', () => {
		it('returns true when no workers are active', () => {
			expect(pool.canSpawn()).toBe(true);
		});

		it('returns true when activeCount is below concurrency limit', () => {
			pool.spawnWorker();
			pool.spawnWorker();
			expect(pool.canSpawn()).toBe(true);
		});

		it('returns false when at concurrency limit', () => {
			pool.spawnWorker();
			pool.spawnWorker();
			pool.spawnWorker();
			expect(pool.canSpawn()).toBe(false);
		});
	});

	describe('spawnWorker', () => {
		it('increments activeCount', () => {
			expect(pool.canSpawn()).toBe(true);
			pool.spawnWorker();
			pool.spawnWorker();
			pool.spawnWorker();
			expect(pool.canSpawn()).toBe(false);
		});

		it('calls spawn with worker environment variables', () => {
			pool.spawnWorker();
			expect(mockSpawn).toHaveBeenCalledWith(
				process.execPath,
				expect.any(Array),
				expect.objectContaining({
					env: expect.objectContaining({
						FLOW_DAEMON_PORT: '8080',
						FLOW_WS_PORT: '8081',
					}),
				})
			);
		});

		it('decrements activeCount on worker exit', () => {
			pool.spawnWorker();
			pool.spawnWorker();
			pool.spawnWorker();
			expect(pool.canSpawn()).toBe(false);

			// Simulate exit event
			const child = mockSpawn.mock.results[0]?.value as {
				on: (event: string, handler: () => void) => void;
			};
			let exitHandler: (() => void) | undefined;
			child.on = vi.fn((event: string, handler: () => void) => {
				if (event === 'exit') exitHandler = handler;
			});

			// Re-spawn to capture the handler
			const pool2 = new WorkerPool(1, 8080, 8081);
			pool2.spawnWorker();
			const child2 = mockSpawn.mock.results[mockSpawn.mock.results.length - 1]?.value as {
				on: ReturnType<typeof vi.fn>;
			};
			// Trigger exit handler
			const onCalls = child2.on.mock.calls as [string, () => void][];
			const exitCall = onCalls.find(([event]) => event === 'exit');
			if (exitCall) {
				exitCall[1]();
			}
			expect(pool2.canSpawn()).toBe(true);
		});
	});

	describe('registerWorker', () => {
		it('adds worker as idle', () => {
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			expect(pool.getIdleWorker()).toBe(ws);
		});

		it('registered worker is returned by getIdleWorker', () => {
			const ws1 = makeMockWs();
			const ws2 = makeMockWs();
			pool.registerWorker(ws1, 0);
			pool.registerWorker(ws2, 0);
			const idle = pool.getIdleWorker();
			expect(idle).toBeDefined();
		});

		it('registerWorker with spawned PID clears the connect timeout', () => {
			// spawnWorker sets a pending connect timeout for the spawned PID (12345 from the mock)
			pool.spawnWorker();
			const spawnedPid = 12345;

			const ws = makeMockWs();
			// Should not throw, and the worker should be registered as idle
			pool.registerWorker(ws, spawnedPid);
			expect(pool.getIdleWorker()).toBe(ws);
		});
	});

	describe('removeWorker', () => {
		it('removes worker from the pool', () => {
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			pool.removeWorker(ws);
			expect(pool.getIdleWorker()).toBeUndefined();
		});

		it('does not decrement activeCount (only the child exit handler does)', () => {
			pool.spawnWorker();
			pool.spawnWorker();
			pool.spawnWorker();
			expect(pool.canSpawn()).toBe(false);
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			pool.removeWorker(ws);
			// activeCount is unchanged — still at the concurrency limit
			expect(pool.canSpawn()).toBe(false);
		});
	});

	describe('getIdleWorker', () => {
		it('returns undefined when no workers registered', () => {
			expect(pool.getIdleWorker()).toBeUndefined();
		});

		it('returns undefined when all workers are busy', () => {
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			pool.markBusy(ws);
			expect(pool.getIdleWorker()).toBeUndefined();
		});

		it('returns idle worker', () => {
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			expect(pool.getIdleWorker()).toBe(ws);
		});
	});

	describe('markBusy', () => {
		it('markBusy changes worker state to busy', () => {
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			pool.markBusy(ws);
			expect(pool.getIdleWorker()).toBeUndefined();
		});
	});

	describe('hasActiveWorkers', () => {
		it('returns false when no workers registered', () => {
			expect(pool.hasActiveWorkers()).toBe(false);
		});

		it('returns false when all workers are idle', () => {
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			expect(pool.hasActiveWorkers()).toBe(false);
		});

		it('returns true when any worker is busy', () => {
			const ws1 = makeMockWs();
			const ws2 = makeMockWs();
			pool.registerWorker(ws1, 0);
			pool.registerWorker(ws2, 0);
			pool.markBusy(ws1);
			expect(pool.hasActiveWorkers()).toBe(true);
		});

		it('returns false after busy worker is removed', () => {
			const ws = makeMockWs();
			pool.registerWorker(ws, 0);
			pool.markBusy(ws);
			pool.removeWorker(ws);
			expect(pool.hasActiveWorkers()).toBe(false);
		});
	});

	describe('broadcastDone', () => {
		it('sends done message to all registered workers', () => {
			const ws1 = makeMockWs();
			const ws2 = makeMockWs();
			pool.registerWorker(ws1, 0);
			pool.registerWorker(ws2, 0);
			pool.broadcastDone();
			expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
			expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
		});

		it('does not send to workers not in OPEN state', () => {
			const ws = { readyState: 3, send: vi.fn(), OPEN: 1 } as unknown as WebSocket;
			pool.registerWorker(ws, 0);
			pool.broadcastDone();
			expect(ws.send).not.toHaveBeenCalled();
		});
	});
});
