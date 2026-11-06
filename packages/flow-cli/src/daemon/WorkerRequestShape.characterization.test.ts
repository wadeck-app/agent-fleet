import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBuiltinPluginsForTests, registerBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';

const spawnMock = vi.fn();
vi.mock('node:child_process', async importOriginal => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { contactDeclaredSources } = await import('./WorkerSourceContact.js');
const { WorkerTypeInstances } = await import('./WorkerTypeInstances.js');

/**
 * Pins the request a worker source is asked to obtain a worker with TODAY: no authToken for any plugin source, and the
 * one launch credential a built-in:command source gets reaches its child through the environment, minted once.
 */

const ENDPOINT = 'ws://127.0.0.1:4101';
let fixture: WorkerTypeFixtureState;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	__resetBuiltinPluginsForTests();
	spawnMock.mockReset();
	spawnMock.mockReturnValue({ pid: 1, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } });
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
});

const entry = (overrides: Record<string, unknown>) => ({
	sourceId: 'box',
	provider: 'free',
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: '2026-11-06T00:00:00.000Z',
	...overrides,
});

describe('the request a source is asked to obtain a worker with - characterization', () => {
	// CHANGED by M6.0 (was: exactly { daemonEndpoint, sourceId, projects: [] } and nothing minted): a plugin loaded from disk now gets
	// a launch credential per ask in request.authToken. The built-in cases below are unchanged.
	it('is { daemonEndpoint, sourceId, projects: [], authToken } for a plugin loaded from disk when the daemon can mint tokens', async () => {
		const issueLaunchToken = vi.fn(() => 'minted');
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});

		await contactDeclaredSources(
			[entry({ plugin: 'fixture-sandbox.sandbox', pluginsDir: FIXTURE_PLUGINS_DIR })],
			ENDPOINT,
			() => {},
			{ workerTypes, issueLaunchToken }
		);
		await workerTypes.disposeAll();

		expect(fixture.obtained.map(item => item.request)).toEqual([
			{ daemonEndpoint: ENDPOINT, sourceId: 'box', projects: [], authToken: 'minted' },
		]);
		expect(issueLaunchToken).toHaveBeenCalledExactlyOnceWith('box');
	});

	it('is the same for a built-in worker type, which gets the token service through its host instead', async () => {
		const requests: unknown[] = [];
		registerBuiltinPlugin('plugins.thing.default', {
			extensionPoint: 'worker-type',
			create: () =>
				Promise.resolve({
					source: {
						obtainWorker: (request: unknown) => {
							requests.push(request);
							return Promise.resolve();
						},
					},
					dispose: () => Promise.resolve(),
				}),
		});
		const issueLaunchToken = vi.fn(() => 'minted');
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});

		await contactDeclaredSources([entry({ plugin: 'thing.default' })], ENDPOINT, () => {}, {
			workerTypes,
			issueLaunchToken,
		});

		expect(requests).toEqual([{ daemonEndpoint: ENDPOINT, sourceId: 'box', projects: [] }]);
		expect(issueLaunchToken).not.toHaveBeenCalled();
	});

	it('mints exactly one launch credential per launch of a built-in:command source, and passes it in the child environment', async () => {
		const issueLaunchToken = vi.fn(() => 'minted');

		await contactDeclaredSources(
			[entry({ provider: 'built-in:command', options: { command: 'flow' } })],
			ENDPOINT,
			() => {},
			{ issueLaunchToken }
		);

		expect(issueLaunchToken).toHaveBeenCalledExactlyOnceWith('box');
		expect((spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env['FLOW_WORKER_TOKEN']).toBe(
			'minted'
		);
	});
});
