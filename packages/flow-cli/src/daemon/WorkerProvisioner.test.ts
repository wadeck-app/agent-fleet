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

describe('WorkerProvisioner - re-registration', () => {
	// A worker sends `ready` again after every step. Counting it against its own source
	// cap refuses it the moment it finishes one, destroying the worker the user launched.
	it('allows a capped source to re-register the same connection', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			10,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll() as never,
			sourceCaps({ capped: 1 }) as never
		);
		const ws = fakeWorker();

		expect(provisioner.registerWorker(ws, { pid: 1, sourceId: 'capped', authToken: 't' })).toBe(true);
		// Second `ready` from the same socket, as sent after each completed step.
		expect(provisioner.registerWorker(ws, { pid: 1, sourceId: 'capped', authToken: 't' })).toBe(true);
		expect(ws.terminate).not.toHaveBeenCalled();
		expect(registry.liveCount).toBe(1);
	});

	it('keeps the ephemeral flag across re-registration', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(10, registry, fakeSource({ hasSpawned: () => true }));
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 42 });
		provisioner.registerWorker(ws, { pid: 42 });

		expect(registry.describe(ws)?.ephemeral).toBe(true);
	});

	it('does not re-authenticate a connection already admitted', () => {
		const registry = new WorkerRegistry();
		const authenticator = allowAll();
		const provisioner = makeProvisioner(
			10,
			registry,
			fakeSource({ hasSpawned: () => false }),
			authenticator as never,
			sourceCaps({ laptop: 1 }) as never
		);
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 1, sourceId: 'laptop', authToken: 't' });
		provisioner.registerWorker(ws, { pid: 1, sourceId: 'laptop', authToken: 't' });

		expect(authenticator.authenticate).toHaveBeenCalledTimes(1);
	});

	// A different socket for the same one-slot source must still be refused.
	it('still enforces the cap for a second distinct connection', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			10,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll() as never,
			sourceCaps({ capped: 1 }) as never
		);
		const first = fakeWorker();
		const second = fakeWorker();

		provisioner.registerWorker(first, { pid: 1, sourceId: 'capped', authToken: 't' });

		expect(provisioner.registerWorker(second, { pid: 2, sourceId: 'capped', authToken: 't' })).toBe(false);
		expect(second.terminate).toHaveBeenCalled();
	});
});

describe('WorkerProvisioner - worker naming no source', () => {
	// The zero-config path for `flow worker`: a loopback worker presenting the daemon
	// token needs no declared source, or the core deliverable would require setup first.
	it('admits a loopback worker with no source when the credential is accepted', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			2,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll() as never,
			sourceCaps({}) as never
		);
		const ws = fakeWorker();

		expect(provisioner.registerWorker(ws, { pid: 999, authToken: 'daemon-token' })).toBe(true);
		expect(registry.describe(ws)?.ephemeral).toBe(false);
	});

	it('still refuses it when the credential is rejected', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			2,
			registry,
			fakeSource({ hasSpawned: () => false }),
			denyAll('no credential') as never,
			sourceCaps({}) as never
		);
		const ws = fakeWorker();

		expect(provisioner.registerWorker(ws, { pid: 999 })).toBe(false);
		expect(ws.terminate).toHaveBeenCalled();
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
	// Not spawning it is no longer grounds for refusal on its own -- that is the whole
	// point of S7. What matters is whether its credential is accepted.
	it('refuses and terminates a worker it did not spawn when the credential fails', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			1,
			registry,
			fakeSource({ hasSpawned: () => false }),
			denyAll('worker presented no credential') as never
		);
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
