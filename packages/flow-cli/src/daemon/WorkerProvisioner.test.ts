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

function sourceCaps(caps: Record<string, number>, labels: Record<string, string[]> = {}) {
	return {
		find: (sourceId: string) =>
			caps[sourceId] === undefined
				? undefined
				: { maxWorkers: caps[sourceId], labels: labels[sourceId] ?? [], sourceId },
		list: () =>
			Object.keys(caps).map(sourceId => ({
				sourceId,
				maxWorkers: caps[sourceId]!,
				labels: labels[sourceId] ?? [],
			})),
	};
}

describe('WorkerProvisioner - source labels (D#30)', () => {
	// Labels are declared once on the source and every worker from it carries them. Without
	// this, `flow worker source add gpu-box --labels gpu` has no effect on routing at all and
	// each worker would have to re-declare them, which is what D#30 rules out.
	it('gives a worker the labels its source declared', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			5,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll(),
			sourceCaps({ 'gpu-box': 2 }, { 'gpu-box': ['gpu', 'linux'] })
		);
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 1, sourceId: 'gpu-box', authToken: 't' });

		expect(registry.describe(ws)?.labels).toEqual(['gpu', 'linux']);
	});

	// A worker may still add its own; the source's are not a replacement for what the machine
	// knows about itself.
	it('keeps the labels the worker declared as well', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			5,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll(),
			sourceCaps({ 'gpu-box': 2 }, { 'gpu-box': ['gpu'] })
		);
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 1, sourceId: 'gpu-box', authToken: 't', labels: ['fast'] });

		expect(registry.describe(ws)?.labels.sort()).toEqual(['fast', 'gpu']);
	});

	it('does not repeat a label the worker already declared', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			5,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll(),
			sourceCaps({ 'gpu-box': 2 }, { 'gpu-box': ['gpu'] })
		);
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 1, sourceId: 'gpu-box', authToken: 't', labels: ['gpu'] });

		expect(registry.describe(ws)?.labels).toEqual(['gpu']);
	});

	// A worker naming no source has nothing to inherit -- the zero-config `flow worker` case.
	it('leaves a sourceless worker with only its own labels', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(5, registry, fakeSource({ hasSpawned: () => false }));
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 1, authToken: 't', labels: ['mine'] });

		expect(registry.describe(ws)?.labels).toEqual(['mine']);
	});

	// Re-registration happens after every step. Inheriting again must not accumulate.
	it('does not accumulate labels across re-registrations', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			5,
			registry,
			fakeSource({ hasSpawned: () => false }),
			allowAll(),
			sourceCaps({ 'gpu-box': 2 }, { 'gpu-box': ['gpu'] })
		);
		const ws = fakeWorker();

		provisioner.registerWorker(ws, { pid: 1, sourceId: 'gpu-box', authToken: 't' });
		provisioner.registerWorker(ws, { pid: 1, sourceId: 'gpu-box', authToken: 't' });

		expect(registry.describe(ws)?.labels).toEqual(['gpu']);
	});
});

describe('WorkerProvisioner - provisioning plan (S8)', () => {
	it('offers the S8 provider the room left under the concurrency limit', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(3, registry, fakeSource());
		registry.register(fakeWorker(), { pid: 1 });

		expect(provisioner.planProvisioning(5, 0).fork).toBe(2);
	});

	it('asks for nothing when the limit is already committed', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(1, registry, fakeSource());
		registry.register(fakeWorker(), { pid: 1 });

		expect(provisioner.planProvisioning(5, 10_000).fork).toBe(0);
	});

	// The warning exists to name the absentee (D#25). A source that did deliver is not one,
	// and naming it would send the user to check a machine that is working.
	it('offers only the sources with nothing connected', () => {
		const registry = new WorkerRegistry();
		const provisioner = makeProvisioner(
			4,
			registry,
			fakeSource(),
			allowAll(),
			sourceCaps({ delivered: 1, absent: 1 })
		);
		registry.register(fakeWorker(), { pid: 1, sourceId: 'delivered' });

		const warning = provisioner.planProvisioning(1, 60_000).warning ?? '';

		expect(warning).toContain('absent');
		expect(warning).not.toContain('delivered');
	});

	// The declared sources are what the default implementation waits for, so they have to
	// reach it -- a plan built without them would fork instantly and never use them.
	it('passes the declared sources through to the decision', () => {
		const provisioner = makeProvisioner(
			4,
			new WorkerRegistry(),
			fakeSource(),
			allowAll(),
			sourceCaps({ laptop: 1 })
		);

		expect(provisioner.planProvisioning(1, 0).fork).toBe(0);
		expect(provisioner.planProvisioning(1, 60_000).warning).toContain('laptop');
	});
});

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
		expect(registry.listIdle().map(candidate => candidate.ws)).toEqual([ws]);
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
