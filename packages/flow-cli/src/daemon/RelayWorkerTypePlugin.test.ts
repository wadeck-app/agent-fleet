import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { __resetBuiltinPluginsForTests, getBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';
import type { RegisteredRelay } from './RelayRegistry.js';
import { RelayWorkerSource } from './RelayWorkerSource.js';
import {
	RELAY_WORKER_TYPE_REF,
	buildRelayWorkerType,
	registerBuiltinWorkerTypes,
	relayWorkerTypePlugin,
} from './RelayWorkerTypePlugin.js';
import { contactDeclaredSources, resolveSourceProvider } from './WorkerSourceContact.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

const request = { daemonEndpoint: 'ws://127.0.0.1:4101', sourceId: 'build-box', projects: [] as string[] };

function acceptingRelay(): { relay: RegisteredRelay; sent: Record<string, unknown>[] } {
	const sent: Record<string, unknown>[] = [];
	const handlers: ((data: Buffer) => void)[] = [];
	const ws = {
		send: (raw: string) => {
			const message = JSON.parse(raw) as Record<string, unknown>;
			sent.push(message);
			setImmediate(() => {
				for (const handler of handlers) {
					handler(
						Buffer.from(
							JSON.stringify({
								type: 'provide_worker_ack',
								requestId: message['requestId'],
								accepted: true,
							})
						)
					);
				}
			});
		},
		on: (_event: string, handler: (data: Buffer) => void) => handlers.push(handler),
		off: vi.fn(),
	} as unknown as WebSocket;
	return { relay: { ws, sourceId: 'build-box', capacity: 1 }, sent };
}

beforeEach(() => {
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
});

describe('relay worker-type plugin', () => {
	it('is a worker-type plugin whose factory builds an instance over the relay source', async () => {
		const { relay, sent } = acceptingRelay();

		const instance = (await relayWorkerTypePlugin.create({
			sourceId: 'build-box',
			options: {},
			host: { findRelay: () => relay },
		})) as ReturnType<typeof buildRelayWorkerType>;

		expect(relayWorkerTypePlugin.extensionPoint).toBe('worker-type');
		await instance.source.obtainWorker(request);
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({ type: 'provide_worker', projects: [], labels: [] });
	});

	it('has no per-run hook: a relay holds nothing to clean up after a run', () => {
		const instance = buildRelayWorkerType(() => undefined);

		expect(instance.run).toBeUndefined();
	});

	it('dispose is idempotent and never throws', async () => {
		const instance = buildRelayWorkerType(() => undefined);

		await expect(instance.dispose()).resolves.toBeUndefined();
		await expect(instance.dispose()).resolves.toBeUndefined();
	});

	it('refuses to be built without the daemon host service, naming the plugin and saying it is a wiring mistake', async () => {
		await expect(relayWorkerTypePlugin.create({ sourceId: 'build-box', options: {} })).rejects.toThrow(
			/relay worker type.*findRelay.*report it/is
		);
		await expect(relayWorkerTypePlugin.create({ sourceId: 'build-box', options: {}, host: {} })).rejects.toThrow(
			/findRelay/
		);
	});

	it('registers statically under its type reference, and registering twice is harmless', () => {
		registerBuiltinWorkerTypes();
		registerBuiltinWorkerTypes();

		expect(RELAY_WORKER_TYPE_REF).toBe('plugins.relay.default');
		expect(getBuiltinPlugin(RELAY_WORKER_TYPE_REF)).toBe(relayWorkerTypePlugin);
	});

	// The compatible alias: the existing provider string keeps working and is built by the same code.
	it('is what the built-in:relay provider string builds', () => {
		const provider = resolveSourceProvider('built-in:relay', {}, { findRelay: () => undefined });

		expect(provider).toBeInstanceOf(RelayWorkerSource);
	});

	// Through the real seams: contact -> WorkerTypeInstances -> registry -> plugin factory -> RelayWorkerSource.
	it('serves a source declared with plugin relay.default, lending it the relay lookup', async () => {
		registerBuiltinWorkerTypes();
		const { relay, sent } = acceptingRelay();
		const entry: WorkerSourceEntry = {
			sourceId: 'build-box',
			provider: 'relay',
			plugin: 'relay.default',
			pluginsDir: process.cwd(),
			labels: [],
			maxWorkers: 1,
			tokenHash: 'h',
			createdAt: '2026-11-06T00:00:00.000Z',
		};
		const logged: string[] = [];
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), (_level, message) => logged.push(message));
		const reported: string[] = [];

		await contactDeclaredSources([entry], request.daemonEndpoint, message => reported.push(message), {
			findRelay: () => relay,
			workerTypes,
		});
		await workerTypes.disposeAll();

		expect(reported).toEqual([]);
		expect(sent).toHaveLength(1);
		expect(logged.some(message => message.includes('built-in registry'))).toBe(true);
	});
});
