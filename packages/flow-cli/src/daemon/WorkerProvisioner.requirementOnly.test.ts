import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';
import type { ForkWorkerSource } from './ForkWorkerSource.js';
import { WorkerProvisioner } from './WorkerProvisioner.js';
import { WorkerRegistry } from './WorkerRegistry.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeCatalog } from './WorkerTypeCatalog.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

/**
 * The rule end to end, from the instance a plugin built to the concurrency count: a source that declares guarantees is
 * requirement-only, so its connected worker leaves room to fork a host worker (default limit 1).
 */

const entry = (sourceId: string, implementation: string): WorkerSourceEntry => ({
	sourceId,
	provider: 'fixture',
	plugin: `fixture-sandbox.${implementation}`,
	pluginsDir: FIXTURE_PLUGINS_DIR,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: '2026-11-09T00:00:00.000Z',
});

const fakeWorker = (): WebSocket =>
	({ readyState: 1, OPEN: 1, send: vi.fn(), terminate: vi.fn() }) as unknown as WebSocket;

const fakeSource = (): ForkWorkerSource =>
	({ pendingCount: 0, hasSpawned: () => true, acknowledgeConnection: vi.fn() }) as unknown as ForkWorkerSource;

let sources: WorkerSourceEntry[];
let instances: WorkerTypeInstances;

beforeEach(() => {
	resetWorkerTypeFixture();
	sources = [entry('guarded', 'confined'), entry('plain', 'sandbox')];
	instances = new WorkerTypeInstances(new PluginLoader(), () => {});
});

function provisionerOver(registry: WorkerRegistry): WorkerProvisioner {
	const catalog = new WorkerTypeCatalog({ list: () => sources }, instances, instances);
	return new WorkerProvisioner(
		1,
		registry,
		fakeSource(),
		{ authenticate: () => ({ ok: true }) } as never,
		{ find: () => undefined, list: () => [] } as never,
		undefined,
		undefined,
		() => catalog.requirementOnlyLookup()
	);
}

describe('WorkerProvisioner - workers of a source that declares guarantees', () => {
	it('do not use the concurrency limit once the instance is built, so a host worker can still be forked', async () => {
		await Promise.all(sources.map(source => instances.get(source, { issueLaunchToken: () => 't' })));
		const registry = new WorkerRegistry();
		registry.register(fakeWorker(), { pid: 1, sourceId: 'guarded' });

		expect(provisionerOver(registry).canProvision()).toBe(true);
	});

	it('still count when the source declares no guarantees', async () => {
		await Promise.all(sources.map(source => instances.get(source, { issueLaunchToken: () => 't' })));
		const registry = new WorkerRegistry();
		registry.register(fakeWorker(), { pid: 1, sourceId: 'plain' });

		expect(provisionerOver(registry).canProvision()).toBe(false);
	});
});
