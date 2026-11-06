import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBuiltinPluginsForTests, getBuiltinPlugin } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';

const spawnMock = vi.fn();
vi.mock('node:child_process', async importOriginal => ({
	...(await importOriginal<typeof import('node:child_process')>()),
	spawn: (...args: unknown[]) => spawnMock(...args),
}));

const { registerBuiltinWorkerTypes } = await import('./BuiltinWorkerTypes.js');
const { COMMAND_WORKER_TYPE_REF, buildCommandWorkerType, commandWorkerTypePlugin } =
	await import('./CommandWorkerTypePlugin.js');
const { CommandWorkerSource } = await import('./CommandWorkerSource.js');
const { contactDeclaredSources, resolveSourceProvider } = await import('./WorkerSourceContact.js');
const { WorkerSourceRegistry } = await import('./WorkerSourceRegistry.js');
const { WorkerTypeInstances } = await import('./WorkerTypeInstances.js');

const request = { daemonEndpoint: 'ws://127.0.0.1:4101', sourceId: 'laptop', projects: [] as string[] };
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'command-plugin-'));
	spawnMock.mockReset();
	spawnMock.mockReturnValue({ pid: 1, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } });
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
	rmSync(dir, { recursive: true, force: true });
});

describe('command worker-type plugin', () => {
	it('is a worker-type plugin registered under plugins.command.default', () => {
		registerBuiltinWorkerTypes();
		registerBuiltinWorkerTypes();

		expect(COMMAND_WORKER_TYPE_REF).toBe('plugins.command.default');
		expect(commandWorkerTypePlugin.extensionPoint).toBe('worker-type');
		expect(getBuiltinPlugin(COMMAND_WORKER_TYPE_REF)).toBe(commandWorkerTypePlugin);
	});

	it('builds an instance whose source runs the declared command, with the token minted by the host', async () => {
		const issueLaunchToken = vi.fn(() => 'minted');

		const instance = (await commandWorkerTypePlugin.create({
			sourceId: 'laptop',
			options: { command: 'flow', args: ['worker'] },
			host: { issueLaunchToken },
		})) as ReturnType<typeof buildCommandWorkerType>;
		await instance.source.obtainWorker(request);

		expect(spawnMock.mock.calls[0]!.slice(0, 2)).toEqual(['flow', ['worker']]);
		expect((spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env['FLOW_WORKER_TOKEN']).toBe(
			'minted'
		);
		expect(issueLaunchToken).toHaveBeenCalledExactlyOnceWith('laptop');
	});

	it('works without a token issuer, as the provider string does: no token variable', async () => {
		const instance = (await commandWorkerTypePlugin.create({
			sourceId: 'laptop',
			options: { command: 'flow' },
		})) as ReturnType<typeof buildCommandWorkerType>;
		await instance.source.obtainWorker(request);

		expect('FLOW_WORKER_TOKEN' in (spawnMock.mock.calls[0]![2] as { env: object }).env).toBe(false);
	});

	it('has no per-run hook, and dispose is idempotent', async () => {
		const instance = buildCommandWorkerType({ command: 'flow' });

		expect(instance.run).toBeUndefined();
		await expect(instance.dispose()).resolves.toBeUndefined();
		await expect(instance.dispose()).resolves.toBeUndefined();
	});

	// The compatible alias: the provider string builds the same source through the same builder.
	it('is what the built-in:command provider string builds', () => {
		expect(resolveSourceProvider('built-in:command', { command: 'flow' })).toBeInstanceOf(CommandWorkerSource);
	});

	it('serves a source declared with --plugin command.default and no pluginsDir, lending it the token issuer', async () => {
		const registry = new WorkerSourceRegistry(dir);
		const { warnings } = registry.declare({
			sourceId: 'laptop',
			provider: 'command',
			plugin: 'command.default',
			labels: [],
			maxWorkers: 1,
			options: { command: 'flow', args: ['worker'] },
		});
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
		const reported: string[] = [];

		await contactDeclaredSources(
			new WorkerSourceRegistry(dir).list(),
			request.daemonEndpoint,
			message => reported.push(message),
			{ workerTypes, issueLaunchToken: () => 'minted' }
		);
		await workerTypes.disposeAll();

		expect(warnings).toEqual([]);
		expect(reported).toEqual([]);
		expect(spawnMock.mock.calls[0]!.slice(0, 2)).toEqual(['flow', ['worker']]);
		expect((spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env['FLOW_WORKER_TOKEN']).toBe(
			'minted'
		);
	});
});

describe('WorkerSourceRegistry - the command worker type declared as a plugin', () => {
	const declaration = (options?: Record<string, unknown>, provider = 'command', plugin = 'command.default') => ({
		sourceId: 'laptop',
		provider,
		plugin,
		labels: [],
		maxWorkers: 1,
		...(options === undefined ? {} : { options }),
	});

	it('accepts a command option when the plugin is command.default (or plugins.command.default)', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(registry.declare(declaration({ command: 'flow' })).entry.plugin).toBe('command.default');
		expect(
			new WorkerSourceRegistry(mkdtempSync(join(tmpdir(), 'command-plugin-b-'))).declare({
				...declaration({ command: 'flow' }),
				plugin: 'plugins.command.default',
			}).entry.plugin
		).toBe('command.default');
	});

	it('refuses command.default without a command, with the same advice as built-in:command', () => {
		expect(() => new WorkerSourceRegistry(dir).declare(declaration({}))).toThrow(
			'Worker source "laptop" uses command.default but declares no command to run. Pass --command "<how to launch a worker>", e.g. --command "flow worker --source laptop --token <worker token>".'
		);
	});

	it('still refuses a command for a plugin that is not the command worker type', () => {
		expect(() =>
			new WorkerSourceRegistry(dir).declare(declaration({ command: 'flow' }, 'relay', 'relay.default'))
		).toThrow('declares a command, but provider "relay" never runs one');
	});
});

describe('command worker-type plugin - follow-ups from the review', () => {
	it('names the form in the missing-command error: built-in:command for the provider string, command.default for the plugin', async () => {
		const viaPlugin = (await commandWorkerTypePlugin.create({ sourceId: 'laptop', options: {} })) as ReturnType<
			typeof buildCommandWorkerType
		>;
		await expect(viaPlugin.source.obtainWorker(request)).rejects.toThrow(
			'source "laptop" uses command.default but declares no command to run. Add options.command to the source entry.'
		);

		await expect(resolveSourceProvider('built-in:command', {}).obtainWorker(request)).rejects.toThrow(
			'source "laptop" uses built-in:command but declares no command to run. Add options.command to the source entry.'
		);
	});

	const wiring = ' This is a wiring mistake in the daemon, not a configuration error -- please report it.';
	const fix = ' Fix: flow worker source remove laptop, then declare it again.';

	it.each([
		[
			'a host that is not an object',
			{ host: 'x', options: { command: 'flow' } },
			`the command worker type got a host that is not an object (string).${wiring}`,
		],
		[
			'an issueLaunchToken that is not a function',
			{ host: { issueLaunchToken: 'x' }, options: { command: 'flow' } },
			`the command worker type needs host.issueLaunchToken to be a function when given, got string.${wiring}`,
		],
		[
			'options that are not an object',
			{ options: 'x' },
			`the command worker type needs its options to be an object, got string.${fix}`,
		],
		[
			'a command that is not a string',
			{ options: { command: 42 } },
			`the command worker type needs options.command to be a string, got number.${fix}`,
		],
		[
			'args that are not strings',
			{ options: { command: 'flow', args: ['a', 1] } },
			`the command worker type needs options.args to be an array of strings.${fix}`,
		],
		[
			'a cwd that is not a string',
			{ options: { command: 'flow', cwd: 7 } },
			`the command worker type needs options.cwd to be a string, got number.${fix}`,
		],
	])('refuses %s with an actionable error', async (_label, context, message) => {
		await expect(commandWorkerTypePlugin.create({ sourceId: 'laptop', ...context })).rejects.toThrow(message);
	});

	it('still accepts no options at all: a missing command is reported when a worker is asked for', async () => {
		await expect(commandWorkerTypePlugin.create({ sourceId: 'laptop' })).resolves.toBeDefined();
	});
});
