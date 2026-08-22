import { type ChildProcess, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import type { WebSocket } from 'ws';

import { WorkerPool } from './WorkerPool';

// Mock node:fs to control existsSync in constructor path-detection tests.
// The outer beforeEach sets mockReturnValue(true) so the constructor always
// finds devWorkerPath and succeeds for tests that don't care about path selection.
vi.mock('node:fs', async importOriginal => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, existsSync: vi.fn() };
});

// Mock node:child_process to intercept spawn calls in spawnWorker tests.
vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn() };
});

function makeMockChild(): ChildProcess {
	const emitter = new EventEmitter();
	const child = emitter as unknown as ChildProcess;
	(child as unknown as Record<string, unknown>).pid = 42;
	(child as unknown as Record<string, unknown>).kill = vi.fn();
	(child as unknown as Record<string, unknown>).killed = false;
	(child as unknown as Record<string, unknown>).stderr = new EventEmitter();
	return child;
}

const makeWs = (): WebSocket => ({ readyState: 1 /* OPEN */, send: vi.fn(), OPEN: 1 }) as unknown as WebSocket;

describe('WorkerPool', () => {
	let pool: WorkerPool;

	beforeEach(() => {
		// existsSync returns true → constructor always picks devWorkerPath (Worker.js).
		// Tests that need different path behavior use mockReturnValueOnce to override specific calls.
		vi.mocked(existsSync).mockReturnValue(true);
		// Provide a safe mock for spawn so spawnWorker() in tests doesn't create real processes.
		vi.mocked(spawn).mockImplementation(() => makeMockChild());
		pool = new WorkerPool(3, 3000, 3001);
		vi.restoreAllMocks();
	});

	describe('canSpawn()', () => {
		it('returns true when activeCount is below the concurrency limit', () => {
			// No workers spawned → activeCount = 0, limit = 3
			expect(pool.canSpawn()).toBe(true);
		});

		it('returns false when concurrency limit is 0', () => {
			const limitZeroPool = new WorkerPool(0, 3000, 3001);
			expect(limitZeroPool.canSpawn()).toBe(false);
		});
	});

	describe('registerWorker()', () => {
		it('marks the worker as idle so getIdleWorker() returns it', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			expect(pool.getIdleWorker()).toBe(ws);
		});

		it('rejects registration from a PID not spawned by this pool', () => {
			const ws = { ...makeWs(), terminate: vi.fn() } as unknown as WebSocket;
			// Do NOT add 9999 to spawnedPids — simulate an external process
			pool.registerWorker(ws, 9999);
			expect((ws as any).terminate).toHaveBeenCalledTimes(1);
			expect(pool.getIdleWorker()).toBeUndefined();
		});
	});

	describe('getIdleWorker()', () => {
		it('returns an idle worker', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			expect(pool.getIdleWorker()).toBe(ws);
		});

		it('returns undefined when all registered workers are busy', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			pool.markBusy(ws);
			expect(pool.getIdleWorker()).toBeUndefined();
		});
	});

	describe('markBusy()', () => {
		it('marks the worker as busy so it is no longer returned by getIdleWorker()', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			pool.markBusy(ws);
			expect(pool.getIdleWorker()).toBeUndefined();
		});
	});

	describe('markIdle()', () => {
		it('marks the worker as idle again after being busy', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			pool.markBusy(ws);
			pool.markIdle(ws);
			expect(pool.getIdleWorker()).toBe(ws);
		});
	});

	describe('hasActiveWorkers()', () => {
		it('returns false when no workers are registered', () => {
			expect(pool.hasActiveWorkers()).toBe(false);
		});

		it('returns false when all registered workers are idle', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			expect(pool.hasActiveWorkers()).toBe(false);
		});

		it('returns true when at least one worker is busy', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			pool.markBusy(ws);
			expect(pool.hasActiveWorkers()).toBe(true);
		});
	});

	describe('removeWorker()', () => {
		it('removes the worker from the pool so it is no longer returned by getIdleWorker()', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			pool.removeWorker(ws);
			expect(pool.getIdleWorker()).toBeUndefined();
		});

		it('removes a busy worker so hasActiveWorkers() returns false', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			pool.markBusy(ws);
			pool.removeWorker(ws);
			expect(pool.hasActiveWorkers()).toBe(false);
		});
	});

	describe('sendToWorker()', () => {
		it('calls ws.send with the JSON-serialised message when readyState is OPEN', () => {
			const ws = makeWs();
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			const result = pool.sendToWorker(ws, { type: 'idle' });
			expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'idle' }));
			expect(result).toBe(true);
		});

		it('does NOT call ws.send when readyState is not OPEN', () => {
			const ws = makeWs();
			// Override readyState to CLOSING (2)
			(ws as unknown as Record<string, unknown>)['readyState'] = 2;
			(pool as any).spawnedPids.add(1234);
			pool.registerWorker(ws, 1234);
			const result = pool.sendToWorker(ws, { type: 'idle' });
			expect(ws.send).not.toHaveBeenCalled();
			expect(result).toBe(false);
		});
	});

	describe('broadcastDone()', () => {
		it('sends a done message to all registered workers', () => {
			const ws1 = makeWs();
			const ws2 = makeWs();
			(pool as any).spawnedPids.add(1);
			(pool as any).spawnedPids.add(2);
			pool.registerWorker(ws1, 1);
			pool.registerWorker(ws2, 2);

			pool.broadcastDone();

			expect(ws1.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
			expect(ws2.send).toHaveBeenCalledWith(JSON.stringify({ type: 'done' }));
		});
	});

	// ---------------------------------------------------------------------------
	// Constructor path detection
	// ---------------------------------------------------------------------------
	// The outer beforeEach sets existsSync to return true by default (dev path is found).
	// mockReturnValueOnce overrides specific call slots to simulate different scenarios.

	describe('constructor path detection', () => {
		it('dev mode: devWorkerPath exists → workerPath contains Worker.js and tsxLoaderPath is non-null', () => {
			// First existsSync call (devWorkerPath) returns true → dev mode selected.
			// mockReturnValueOnce takes priority over the default mockReturnValue(true).
			vi.mocked(existsSync).mockReturnValueOnce(true);

			const testPool = new WorkerPool(3, 3000, 3001);

			expect((testPool as any).workerPath).toContain('Worker.js');
			expect((testPool as any).tsxLoaderPath).not.toBeNull();
			// tsx loader path must be a file:// URL pointing to loader.mjs
			expect((testPool as any).tsxLoaderPath as string).toMatch(/tsx.*loader\.mjs/);
		});

		it('bundled mode: devWorkerPath missing, bundledWorkerPath exists → workerPath contains worker.cjs and tsxLoaderPath is null', () => {
			// First call (devWorkerPath): miss → falls through to bundled check.
			// Second call (bundledWorkerPath): hit via default mockReturnValue(true).
			vi.mocked(existsSync).mockReturnValueOnce(false);

			const testPool = new WorkerPool(3, 3000, 3001);

			expect((testPool as any).workerPath).toContain('worker.cjs');
			expect((testPool as any).tsxLoaderPath).toBeNull();
		});

		it('neither exists: constructor throws with message containing "Worker not found"', () => {
			// Both devWorkerPath and bundledWorkerPath are missing.
			vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(false);

			expect(() => new WorkerPool(3, 3000, 3001)).toThrow('Worker not found');
		});

		it('bundled mode spawn: spawnWorker() does NOT pass --import flag (no tsx loader)', () => {
			vi.useFakeTimers();

			try {
				// Set up bundled mode: devWorkerPath missing, bundledWorkerPath present (default true).
				vi.mocked(existsSync).mockReturnValueOnce(false);
				vi.mocked(spawn).mockImplementation(() => makeMockChild());

				const testPool = new WorkerPool(3, 3000, 3001);
				expect((testPool as any).tsxLoaderPath).toBeNull();

				testPool.spawnWorker();

				expect(spawn).toHaveBeenCalledOnce();
				const spawnArgs = vi.mocked(spawn).mock.calls[0]![1] as string[];
				// Bundled mode: no tsx loader → no --import flag
				expect(spawnArgs).not.toContain('--import');
				// Only the worker path itself should be in the args array
				expect(spawnArgs).toHaveLength(1);
				expect(spawnArgs[0]!).toContain('worker.cjs');

				// Emit exit on the mock child to clear the connect timeout before restoring timers
				const mockChild = vi.mocked(spawn).mock.results[0]!.value as unknown as EventEmitter;
				mockChild.emit('exit');
			} finally {
				vi.useRealTimers();
			}
		});
	});
});
