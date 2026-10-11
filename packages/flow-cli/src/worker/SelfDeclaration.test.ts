import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkerSourceRegistry } from '../daemon/WorkerSourceRegistry.js';
import { SelfDeclarationManager, declareSelf } from './SelfDeclaration.js';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'self-declaration-'));
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
	rmSync(dir, { recursive: true, force: true });
});

describe('declareSelf', () => {
	// D#5's first kind of entry. Until now a `flow worker` started by hand left no trace at all, so
	// a daemon starting later had no idea it existed and nothing could list it.
	it('records the worker in the registry with its projects and labels', () => {
		const handle = declareSelf(dir, { projects: ['C:/proj'], labels: ['gpu'], pid: process.pid });

		const entries = new WorkerSourceRegistry(dir).list();
		expect(entries).toHaveLength(1);
		expect(entries[0]?.provider).toBe('built-in:inbound');
		expect(entries[0]?.labels).toEqual(['gpu']);
		expect(entries[0]?.options).toMatchObject({ projects: ['C:/proj'] });
		expect(entries[0]?.pid).toBe(process.pid);
		expect(handle?.sourceId).toBe(entries[0]?.sourceId);
	});

	// Declared is not available (D#4): this entry says a worker exists, never that it can take a step.
	it('declares capacity of one, so it cannot claim to be a fleet', () => {
		declareSelf(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });

		expect(new WorkerSourceRegistry(dir).list()[0]?.maxWorkers).toBe(1);
	});

	it('removes its entry when released', () => {
		const handle = declareSelf(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });

		handle?.release();

		expect(new WorkerSourceRegistry(dir).list()).toEqual([]);
	});

	it('is safe to release twice', () => {
		const handle = declareSelf(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });

		handle?.release();
		expect(() => handle?.release()).not.toThrow();
	});

	// Two terminals on the same project must both be recorded, so one id per process.
	it('gives each process its own entry', () => {
		declareSelf(dir, { projects: ['C:/proj'], labels: [], pid: 111 });
		declareSelf(dir, { projects: ['C:/proj'], labels: [], pid: 222 });

		expect(new WorkerSourceRegistry(dir).list()).toHaveLength(2);
	});

	// Being unable to record itself must never stop a worker from working: registration is what
	// makes it usable, and this only makes it visible. But it is said out loud, not swallowed.
	it('warns and carries on when the registry cannot be written', () => {
		const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		vi.spyOn(WorkerSourceRegistry.prototype, 'declare').mockImplementation(() => {
			throw new Error('disk full');
		});

		const handle = declareSelf(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });

		expect(handle).toBeUndefined();
		expect(warn.mock.calls.map(call => call.join(' ')).join('\n')).toMatch(/disk full/);
	});
});

describe('SelfDeclarationManager', () => {
	// A worker whose first attempt failed used to warn once, at startup, and then run forever
	// looking exactly like a healthy, discoverable worker -- the degraded state was never
	// surfaced again. Retrying must both keep saying so and recover on its own.
	it('declares immediately when the registry is writable', () => {
		vi.useFakeTimers();
		const manager = new SelfDeclarationManager(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });

		expect(manager.sourceId).toBeDefined();
		expect(new WorkerSourceRegistry(dir).list()).toHaveLength(1);
	});

	it('retries on a timer and recovers once the registry becomes writable again', () => {
		vi.useFakeTimers();
		const warn = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const declareSpy = vi.spyOn(WorkerSourceRegistry.prototype, 'declare').mockImplementation(() => {
			throw new Error('disk full');
		});

		const manager = new SelfDeclarationManager(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });
		expect(manager.sourceId).toBeUndefined();
		const failedAttempts = declareSpy.mock.calls.length;

		// Still failing on the next few ticks -- each one must warn again, not just the first.
		vi.advanceTimersByTime(30_000);
		vi.advanceTimersByTime(30_000);
		expect(declareSpy.mock.calls.length).toBeGreaterThan(failedAttempts);
		expect(warn.mock.calls.filter(call => call.join(' ').includes('disk full')).length).toBeGreaterThan(1);

		// The underlying problem clears; the next retry must pick it up without a restart.
		declareSpy.mockRestore();
		vi.advanceTimersByTime(30_000);

		expect(manager.sourceId).toBeDefined();
		expect(new WorkerSourceRegistry(dir).list()).toHaveLength(1);
		expect(warn.mock.calls.some(call => call.join(' ').includes('recovered'))).toBe(true);
	});

	it('stops retrying once released, even if it never succeeded', () => {
		vi.useFakeTimers();
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const declareSpy = vi.spyOn(WorkerSourceRegistry.prototype, 'declare').mockImplementation(() => {
			throw new Error('disk full');
		});

		const manager = new SelfDeclarationManager(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });
		manager.release();
		const callsAtRelease = declareSpy.mock.calls.length;

		vi.advanceTimersByTime(120_000);

		expect(declareSpy.mock.calls.length).toBe(callsAtRelease);
	});

	it('releases the registry entry once declared', () => {
		vi.useFakeTimers();
		const manager = new SelfDeclarationManager(dir, { projects: ['C:/proj'], labels: [], pid: process.pid });

		manager.release();

		expect(new WorkerSourceRegistry(dir).list()).toEqual([]);
	});
});
