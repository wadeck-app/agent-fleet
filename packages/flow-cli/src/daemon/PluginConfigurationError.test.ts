import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetBuiltinPluginsForTests, registerBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';
import { FIXTURE_PLUGINS_DIR, resetWorkerTypeFixture } from '../test-utils/WorkerTypeFixture.js';
import { nudgeUrlConflict } from './InboundNudgeOption.js';
import { PluginConfigurationError } from './PluginConfigurationError.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

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

describe('PluginConfigurationError', () => {
	it('is an Error that keeps its message and cause, and is recognisable by class and name', () => {
		const cause = new Error('inner');
		const error = new PluginConfigurationError('bad option. Fix: do x.', { cause });

		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('PluginConfigurationError');
		expect(error.message).toBe('bad option. Fix: do x.');
		expect(error.cause).toBe(cause);
	});

	it('is what the inbound nudgeUrl conflict throws', () => {
		expect(nudgeUrlConflict('s', 'http://a/', 'http://b/')).toBeInstanceOf(PluginConfigurationError);
	});
});

describe('how a worker type load failure is rendered', () => {
	it('renders a user-fixable command option error as a configuration error with its fix, not as a bug', async () => {
		const message = await messageOf(
			instances().get(entry({ plugin: 'command.default', options: { command: 42 } }))
		);

		expect(message).toBe(
			'Cannot load worker source "laptop": configuration error in its built-in worker type "command.default": ' +
				'the command worker type needs options.command to be a string, got number. Fix: flow worker source remove laptop, then declare it again.'
		);
		expect(message).not.toContain('bug in flow');
	});

	it('renders a bad inbound nudgeUrl as a configuration error, still without echoing the credential', async () => {
		const message = await messageOf(
			instances().get(entry({ plugin: 'inbound.default', options: { nudgeUrl: 'http://u:pw@h/x?token=abc' } }))
		);

		expect(message).toBe(
			'Cannot load worker source "laptop": configuration error in its built-in worker type "inbound.default": ' +
				'the inbound worker type got a nudgeUrl that carries a credential (user info). A nudgeUrl never carries credentials: only host, port and path are used. ' +
				'Fix: flow worker source remove laptop, then declare it again with an http(s) URL that has no credentials.'
		);
		expect(message).not.toMatch(/pw|abc|bug in flow/);
	});

	it('keeps the original error as the cause', async () => {
		const original = new PluginConfigurationError('nope. Fix: x.');
		registerBuiltinPlugin('plugins.thing.default', {
			extensionPoint: 'worker-type',
			create: () => Promise.reject(original),
		});

		const error = await instances()
			.get(entry({ plugin: 'thing.default' }))
			.then(
				() => undefined,
				(err: unknown) => err as Error
			);

		expect(error?.cause).toBe(original);
		expect(error?.message).toBe(
			'Cannot load worker source "laptop": configuration error in its built-in worker type "thing.default": nope. Fix: x.'
		);
	});

	it('still renders a wiring mistake as a bug in flow', async () => {
		const message = await messageOf(
			instances().get(entry({ plugin: 'command.default', options: { command: 'flow' } }), {
				issueLaunchToken: 'not a function' as never,
			})
		);

		expect(message).toContain('This is a bug in flow, not in your configuration: please report this error.');
		expect(message).toContain('wiring mistake in the daemon');
	});

	it('still renders an arbitrary error of a built-in as a bug in flow', async () => {
		registerBuiltinPlugin('plugins.thing.default', {
			extensionPoint: 'worker-type',
			create: () => Promise.reject(new Error('boom')),
		});

		expect(await messageOf(instances().get(entry({ plugin: 'thing.default' })))).toBe(
			'Cannot load worker source "laptop": "thing.default" is a built-in worker type of flow and failed: Error: boom. ' +
				'This is a bug in flow, not in your configuration: please report this error.'
		);
	});

	// Decision: the class is flow-cli internal and not part of worker-type/v1, and a plugin from disk cannot import it
	// (it is plain JS beside no node_modules), so an error that merely CALLS itself PluginConfigurationError is not
	// honoured. The on-disk advice is already the right one for a plugin from a directory.
	it('does not treat a plugin from disk throwing something named PluginConfigurationError as a configuration error', async () => {
		const message = await messageOf(
			instances().get(entry({ plugin: 'fixture-sandbox.configerror', pluginsDir: FIXTURE_PLUGINS_DIR }))
		);

		expect(message).toContain(
			'failed: PluginConfigurationError: fixture says the options are wrong. Fix: change them.. Fix: make sure '
		);
		expect(message).toContain('To drop the source: flow worker source remove laptop.');
		expect(message).not.toContain('configuration error in its built-in');
		expect(message).not.toContain('bug in flow');
	});
});
