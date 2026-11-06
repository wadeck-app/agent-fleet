import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetBuiltinPluginsForTests, registerBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

/**
 * Pins how a worker type that fails to load is rendered when the cause is NOT a PluginConfigurationError: a wiring mistake
 * or an arbitrary error of a built-in is reported as "a bug in flow", a failure of a plugin from disk with the on-disk advice.
 */

beforeEach(() => {
	resetWorkerTypeFixture();
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
});

const instances = () => new WorkerTypeInstances(new PluginLoader(), () => {});

function entry(overrides: Partial<WorkerSourceEntry>): WorkerSourceEntry {
	return {
		sourceId: 'laptop',
		provider: 'free',
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: '2026-11-06T00:00:00.000Z',
		...overrides,
	};
}

const messageOf = (promise: Promise<unknown>): Promise<string> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(err: unknown) => (err as Error).message
	);

const BUG = 'This is a bug in flow, not in your configuration: please report this error.';

describe('worker type load failures - characterization', () => {
	// Removed when PluginConfigurationError landed: the two tests that pinned a user-fixable command option error and a
	// bad inbound nudgeUrl as "a bug in flow". Their replacements are in PluginConfigurationError.test.ts.

	it('renders a wiring mistake as a bug in flow', async () => {
		const message = await messageOf(
			instances().get(entry({ plugin: 'command.default', options: { command: 'flow' } }), {
				issueLaunchToken: 'not a function' as never,
			})
		);

		expect(message).toBe(
			'Cannot load worker source "laptop": "command.default" is a built-in worker type of flow and failed: ' +
				'Error: the command worker type needs host.issueLaunchToken to be a function when given, got string. ' +
				'This is a wiring mistake in the daemon, not a configuration error -- please report it.. ' +
				BUG
		);
	});

	it('renders an arbitrary error of a built-in as a bug in flow', async () => {
		registerBuiltinPlugin('plugins.thing.default', {
			extensionPoint: 'worker-type',
			create: () => Promise.reject(new Error('boom')),
		});

		const message = await messageOf(instances().get(entry({ plugin: 'thing.default' })));

		expect(message).toBe(
			'Cannot load worker source "laptop": "thing.default" is a built-in worker type of flow and failed: Error: boom. ' +
				BUG
		);
	});

	it('renders a failure of a plugin from disk with the on-disk advice', async () => {
		const message = await messageOf(
			instances().get(entry({ plugin: 'fixture-sandbox.throws', pluginsDir: FIXTURE_PLUGINS_DIR }))
		);

		expect(message).toContain(
			'Cannot load worker source "laptop": worker-type plugin "fixture-sandbox.throws" from '
		);
		expect(message).toContain('failed: Error: fixture factory failure. Fix: make sure ');
		expect(message).toContain('To drop the source: flow worker source remove laptop.');
		expect(message).not.toContain('bug in flow');
	});
});
