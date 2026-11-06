import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	__resetBuiltinPluginsForTests,
	getBuiltinPlugin,
	registerBuiltinPlugin,
} from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';

const sendNudgeMock = vi.fn();
vi.mock('./NudgeDispatch.js', () => ({ sendNudge: (...args: unknown[]) => sendNudgeMock(...args) }));

const { registerBuiltinWorkerTypes } = await import('./BuiltinWorkerTypes.js');
const { INBOUND_WORKER_TYPE_REF, buildInboundWorkerType, inboundWorkerTypePlugin } =
	await import('./InboundWorkerTypePlugin.js');
const { InboundWorkerSource } = await import('./InboundWorkerSource.js');
const { contactDeclaredSources, resolveSourceProvider } = await import('./WorkerSourceContact.js');
const { WorkerSourceRegistry } = await import('./WorkerSourceRegistry.js');
const { WorkerTypeInstances } = await import('./WorkerTypeInstances.js');

const ENDPOINT = 'ws://127.0.0.1:4101';
const request = { daemonEndpoint: ENDPOINT, sourceId: 'terminal-1', projects: [] as string[] };
const URL_A = 'http://127.0.0.1:5555/nudge';
const URL_B = 'http://127.0.0.1:6666/nudge';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'inbound-plugin-'));
	sendNudgeMock.mockReset();
	sendNudgeMock.mockResolvedValue(undefined);
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
	rmSync(dir, { recursive: true, force: true });
});

function entry(overrides: Record<string, unknown> = {}) {
	return {
		sourceId: 'terminal-1',
		provider: 'inbound',
		plugin: 'inbound.default',
		labels: [],
		maxWorkers: 1,
		tokenHash: 'h',
		createdAt: '2026-11-06T00:00:00.000Z',
		...overrides,
	};
}

describe('inbound worker-type plugin', () => {
	it('is a worker-type plugin registered under plugins.inbound.default', () => {
		registerBuiltinWorkerTypes();
		registerBuiltinWorkerTypes();

		expect(INBOUND_WORKER_TYPE_REF).toBe('plugins.inbound.default');
		expect(inboundWorkerTypePlugin.extensionPoint).toBe('worker-type');
		expect(getBuiltinPlugin(INBOUND_WORKER_TYPE_REF)).toBe(inboundWorkerTypePlugin);
	});

	it('builds an instance whose source nudges the url of its options, and does nothing without one', async () => {
		const withUrl = (await inboundWorkerTypePlugin.create({
			sourceId: 'terminal-1',
			options: { nudgeUrl: URL_A },
		})) as ReturnType<typeof buildInboundWorkerType>;
		await withUrl.source.obtainWorker(request);
		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith(URL_A, ENDPOINT);

		sendNudgeMock.mockClear();
		const without = (await inboundWorkerTypePlugin.create({ sourceId: 'terminal-1', options: {} })) as ReturnType<
			typeof buildInboundWorkerType
		>;
		await without.source.obtainWorker(request);
		expect(sendNudgeMock).not.toHaveBeenCalled();
	});

	it('has no per-run hook, and dispose is idempotent', async () => {
		const instance = buildInboundWorkerType(URL_A);

		expect(instance.run).toBeUndefined();
		await expect(instance.dispose()).resolves.toBeUndefined();
		await expect(instance.dispose()).resolves.toBeUndefined();
	});

	it('refuses options that are not an object with a string nudgeUrl, naming the plugin and the fix', async () => {
		await expect(inboundWorkerTypePlugin.create({ sourceId: 's', options: { nudgeUrl: 42 } })).rejects.toThrow(
			'the inbound worker type needs options.nudgeUrl to be a string (an http(s) URL), got number. Fix: flow worker source remove s, then declare it again with a URL.'
		);
		await expect(inboundWorkerTypePlugin.create({ sourceId: 's', options: 'x' })).rejects.toThrow(
			'the inbound worker type needs its options to be an object, got string.'
		);
	});

	it('is what the built-in:inbound provider string builds', () => {
		expect(resolveSourceProvider('built-in:inbound', {}, {}, URL_A)).toBeInstanceOf(InboundWorkerSource);
	});
});

describe('WorkerTypeInstances - the inbound entry nudgeUrl', () => {
	async function contact(e: ReturnType<typeof entry>): Promise<string[]> {
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
		const reported: string[] = [];
		await contactDeclaredSources([e], ENDPOINT, message => reported.push(message), { workerTypes });
		await workerTypes.disposeAll();
		return reported;
	}

	it('uses the top-level nudgeUrl of the entry when the options have none', async () => {
		expect(await contact(entry({ nudgeUrl: URL_A }))).toEqual([]);
		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith(URL_A, ENDPOINT);
	});

	it('uses options.nudgeUrl alone, expanding ${NAME} from the daemon environment', async () => {
		process.env['INBOUND_TEST_URL'] = URL_B;
		try {
			expect(await contact(entry({ options: { nudgeUrl: '${INBOUND_TEST_URL}' } }))).toEqual([]);
		} finally {
			delete process.env['INBOUND_TEST_URL'];
		}
		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith(URL_B, ENDPOINT);
	});

	it('accepts the same value in both places', async () => {
		expect(await contact(entry({ nudgeUrl: URL_A, options: { nudgeUrl: URL_A } }))).toEqual([]);
		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith(URL_A, ENDPOINT);
	});

	it('refuses two different values, naming both and the fix, and nudges nothing', async () => {
		const reported = await contact(entry({ nudgeUrl: URL_A, options: { nudgeUrl: URL_B } }));

		expect(reported).toEqual([
			`could not obtain a worker from source "terminal-1": Worker source "terminal-1": nudgeUrl is set twice with different values (entry "${URL_A}", options "${URL_B}"). ` +
				'Keep one: flow worker source remove terminal-1, then declare it again.',
		]);
		expect(sendNudgeMock).not.toHaveBeenCalled();
	});

	it('does not leak the entry to the plugin: it sees sourceId and options only', async () => {
		const create = vi.spyOn(inboundWorkerTypePlugin, 'create');

		await contact(entry({ nudgeUrl: URL_A, tokenHash: 'secret-hash', sourceTokenHash: 'secret-2' }));

		expect(create.mock.calls.map(call => call[0])).toEqual([
			{ sourceId: 'terminal-1', options: { nudgeUrl: URL_A }, host: {} },
		]);
	});

	it('adds no nudgeUrl to the options of another built-in worker type', async () => {
		const seen: unknown[] = [];
		registerBuiltinPlugin('plugins.other.default', {
			extensionPoint: 'worker-type',
			create: context => {
				seen.push(context);
				return Promise.resolve({
					source: { obtainWorker: () => Promise.resolve() },
					dispose: () => Promise.resolve(),
				});
			},
		});

		await contact(entry({ plugin: 'other.default', nudgeUrl: URL_A }));

		expect(seen).toEqual([{ sourceId: 'terminal-1', options: undefined, host: {} }]);
	});
});

describe('WorkerSourceRegistry - the inbound worker type declared as a plugin', () => {
	const declaration = (extra: Record<string, unknown> = {}) => ({
		sourceId: 'terminal-1',
		provider: 'inbound',
		plugin: 'inbound.default',
		labels: [],
		maxWorkers: 1,
		...extra,
	});
	const declare = (extra?: Record<string, unknown>) => new WorkerSourceRegistry(dir).declare(declaration(extra));

	it('accepts inbound.default (or plugins.inbound.default) with no directory, with or without a nudgeUrl', () => {
		expect(declare().warnings).toEqual([]);
		expect(declare({ sourceId: 'b', nudgeUrl: URL_A, options: { nudgeUrl: URL_A } }).entry.plugin).toBe(
			'inbound.default'
		);
		expect(declare({ sourceId: 'c', plugin: 'plugins.inbound.default' }).entry.plugin).toBe('inbound.default');
	});

	it.each(['not a url', 'ftp://host/x', 'file:///etc/passwd'])('refuses the nudgeUrl %s', value => {
		for (const where of ['entry', 'options'] as const) {
			expect(() => declare(where === 'entry' ? { nudgeUrl: value } : { options: { nudgeUrl: value } })).toThrow(
				`Worker source "terminal-1": nudgeUrl "${value}" must be an http(s) URL, e.g. http://127.0.0.1:5555/nudge.`
			);
		}
	});

	it('refuses a credential in the nudgeUrl, without echoing it, and accepts a ${NAME} reference instead', () => {
		expect(() => declare({ nudgeUrl: 'http://user:pw@127.0.0.1:5555/nudge' })).toThrow(
			'Worker source "terminal-1": nudgeUrl carries a credential (user info). Write ${NAME} instead of the literal value and set NAME in the daemon environment.'
		);
		expect(() => declare({ options: { nudgeUrl: 'http://127.0.0.1:5555/nudge?token=abc123' } })).toThrow(
			'Worker source "terminal-1": nudgeUrl carries a credential (query parameter "token"). Write ${NAME} instead of the literal value and set NAME in the daemon environment.'
		);
		expect(
			declare({ options: { nudgeUrl: 'http://127.0.0.1:5555/nudge?token=${NUDGE_TOKEN}' } }).entry.plugin
		).toBe('inbound.default');
	});

	it('refuses two different nudgeUrl values with the same message the daemon uses', () => {
		expect(() => declare({ nudgeUrl: URL_A, options: { nudgeUrl: URL_B } })).toThrow(
			`Worker source "terminal-1": nudgeUrl is set twice with different values (entry "${URL_A}", options "${URL_B}"). Keep one: flow worker source remove terminal-1, then declare it again.`
		);
	});
});
