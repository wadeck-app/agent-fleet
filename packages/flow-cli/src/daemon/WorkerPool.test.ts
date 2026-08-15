import type { WebSocket } from 'ws';
import { WorkerPool } from './WorkerPool';

const makeWs = (): WebSocket =>
    ({ readyState: 1 /* OPEN */, send: vi.fn(), OPEN: 1 }) as unknown as WebSocket;

describe('WorkerPool', () => {
    let pool: WorkerPool;

    beforeEach(() => {
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
});
