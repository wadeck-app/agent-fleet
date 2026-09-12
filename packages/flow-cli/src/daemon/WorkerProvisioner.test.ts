import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import type { ForkWorkerSource } from './ForkWorkerSource.js';
import { WorkerProvisioner } from './WorkerProvisioner.js';
import { WorkerRegistry } from './WorkerRegistry.js';

function fakeWorker(): WebSocket {
	return { readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
}

function fakeSource(overrides: Partial<ForkWorkerSource> = {}): ForkWorkerSource {
	return {
		pendingCount: 0,
		hasSpawned: () => true,
		acknowledgeConnection: vi.fn(),
		obtainWorker: vi.fn().mockResolvedValue(undefined),
		...overrides,
	} as unknown as ForkWorkerSource;
}

/** Defaults auth to permissive and sources to empty, so capacity tests stay focused. */
function makeProvisioner(
	limit: number,
	registry: WorkerRegistry,
	source: ForkWorkerSource,
	auth: unknown = allowAll(),
	sources: unknown = sourceCaps({})
): WorkerProvisioner {
	return new WorkerProvisioner(limit, registry, source, auth as never, sources as never);
}

describe('WorkerProvisioner - capacity (D#14)', () => {
	it('allows provisioning below the limit', () => {
		const provisioner = makeProvisioner(2, new WorkerRegistry(), fakeSource());
		expect(provisioner.canProvision()).toBe(true);
	});

	it('never provisions when the limit is zero', () => {
		const provisioner = makeProvisioner(0, new WorkerRegistry(), fakeSource());
		expect(provisioner.canProvision()).toBe(false);
	});

	// Counted from live connections, not from child-process lifecycle: an inbound worker
	// has no child process the daemon could observe.
	it('counts live connections towards the limit', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(1, registry, fakeSource());
		registry.register(fakeWorker(), { pid: 1 });

		expect(provisioner.canProvision()).toBe(false);
	});

	it('counts a busy worker towards the limit just like an idle one', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(1, registry, fakeSource());
		const ws = fakeWorker();
		registry.register(ws, { pid: 1 });
		registry.markBusy(ws);

		expect(provisioner.canProvision()).toBe(false);
	});

	// Otherwise every queued step would spawn another worker before the first connects.
	it('counts workers already asked for but not yet connected', () => {
		const provisioner = makeProvisioner(1, new WorkerRegistry(), fakeSource({ pendingCount: 1 }));
		expect(provisioner.canProvision()).toBe(false);
	});

	it('frees capacity again once a worker disconnects', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(1, registry, fakeSource());
		const ws = fakeWorker();
		registry.register(ws, { pid: 1 });
		registry.remove(ws);

		expect(provisioner.canProvision()).toBe(true);
	});
});

describe('WorkerProvisioner - provisioning', () => {
	it('asks the source for a worker', async () => {
		const source = fakeSource();
		await makeProvisioner(1, new WorkerRegistry(), source).provision();
		expect(source.obtainWorker).toHaveBeenCalledTimes(1);
	});

	it('propagates a source failure rather than reporting phantom capacity', async () => {
		const source = fakeSource({ obtainWorker: vi.fn().mockRejectedValue(new Error('no pid')) });
		await expect(makeProvisioner(1, new WorkerRegistry(), source).provision()).rejects.toThrow(/no pid/);
	});
});

function allowAll() {
	return { authenticate: vi.fn().mockReturnValue({ ok: true }) };
}

function denyAll(reason = 'bad token') {
	return { authenticate: vi.fn().mockReturnValue({ ok: false, reason }) };
}

function sourceCaps(caps: Record<string, number>) {
	return {
		find: (sourceId: string) => (caps[sourceId] === undefined ? undefined : { maxWorkers: caps[sourceId] }),
	};
}

describe('WorkerProvisioner - externally launched workers (Phase 2a)', () => {
	it('admits a worker it did not spawn when authentication succeeds', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			2,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll() as never,
			sourceCaps({ laptop: 2 }) as never
		);
		const ws = fakeWorker();

		expect(provisioner.registerWorker(ws, { pid: 999, sourceId: 'laptop', authToken: 't' })).toBe(true);
		// Not ephemeral: it must survive the daemon's idle shutdown (D#51).
		expect(registry.describe(ws)?.ephemeral).toBe(false);
	});

	it('refuses and terminates a worker whose credential is rejected', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			2,
			registry,
			fakeSource({ hasSpawned: () => false }),
			denyAll() as never,
			sourceCaps({ laptop: 2 }) as never
		);
		const ws = fakeWorker();

		expect(provisioner.registerWorker(ws, { pid: 999, sourceId: 'laptop', authToken: 'wrong' })).toBe(false);
		expect(ws.terminate).toHaveBeenCalled();
		expect(registry.liveCount).toBe(0);
	});

	// A forked worker is recognised by provenance and needs no token.
	it('does not require a credential from a worker it spawned', () => {
		const registry = new WorkerRegistry();
		const authenticator = allowAll();
		const provisioner = makeProvisioner(
			2,
			registry,
			fakeSource({ hasSpawned: () => true }),
			authenticator as never,
			sourceCaps({}) as never
		);

		expect(provisioner.registerWorker(fakeWorker(), { pid: 42 })).toBe(true);
		expect(authenticator.authenticate).not.toHaveBeenCalled();
	});

	// D#64 / T-03: one registrant must not be able to absorb every dispatched step.
	it('refuses a worker beyond its source cap', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			10,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll() as never,
			sourceCaps({ laptop: 1 }) as never
		);

		expect(provisioner.registerWorker(fakeWorker(), { pid: 1, sourceId: 'laptop', authToken: 't' })).toBe(true);
		const second = fakeWorker();
		expect(provisioner.registerWorker(second, { pid: 2, sourceId: 'laptop', authToken: 't' })).toBe(false);
		expect(second.terminate).toHaveBeenCalled();
		expect(registry.liveCount).toBe(1);
	});

	it('counts the cap per source, not globally', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			10,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll() as never,
			sourceCaps({ laptop: 1, desktop: 1 }) as never
		);

		expect(provisioner.registerWorker(fakeWorker(), { pid: 1, sourceId: 'laptop', authToken: 't' })).toBe(true);
		expect(provisioner.registerWorker(fakeWorker(), { pid: 2, sourceId: 'desktop', authToken: 't' })).toBe(true);
		expect(registry.liveCount).toBe(2);
	});

	it('refuses a worker naming a source that was never declared', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			10,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll() as never,
			sourceCaps({}) as never
		);

		expect(provisioner.registerWorker(fakeWorker(), { pid: 1, sourceId: 'ghost', authToken: 't' })).toBe(false);
	});
});

describe('WorkerProvisioner - registration admission', () => {
	it('admits a worker this daemon spawned', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(1, registry, fakeSource({ hasSpawned: () => true }));
		const ws = fakeWorker();

		expect(provisioner.registerWorker(ws, { pid: 42 })).toBe(true);
		expect(registry.getIdle()).toBe(ws);
	});

	// Until token authentication lands, provenance is the only signal available -- an
	// unrecognised process could otherwise cancel a real worker's connect timeout.
	it('refuses and terminates a worker it did not spawn', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(1, registry, fakeSource({ hasSpawned: () => false }));
		const ws = fakeWorker();

		expect(provisioner.registerWorker(ws, { pid: 999 })).toBe(false);
		expect(ws.terminate).toHaveBeenCalled();
		expect(registry.liveCount).toBe(0);
	});

	it('acknowledges the connection so the orphan timer is cleared', () => {
		const source = fakeSource();
		const provisioner = makeProvisioner(1, new WorkerRegistry(), source);
		provisioner.registerWorker(fakeWorker(), { pid: 42 });

		expect(source.acknowledgeConnection).toHaveBeenCalledWith(42);
	});

	it('records what the worker declared', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(1, registry, fakeSource());
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 42, labels: ['gpu'], hasUserInterface: true });

		expect(registry.describe(ws)?.labels).toEqual(['gpu']);
		expect(registry.describe(ws)?.hasUserInterface).toBe(true);
	});
});
