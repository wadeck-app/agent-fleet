import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBuiltinPluginsForTests } from '../config/BuiltinPluginRegistry.js';
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

const { DEFAULT_LAUNCH_TOKEN_TTL_MS, LaunchTokenIssuer, MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE } =
	await import('./LaunchTokenIssuer.js');
const { LaunchCredentialSource } = await import('./LaunchCredentialSource.js');
const { CommandWorkerSource } = await import('./CommandWorkerSource.js');
const { contactDeclaredSources } = await import('./WorkerSourceContact.js');
const { WorkerTypeInstances } = await import('./WorkerTypeInstances.js');

const ENDPOINT = 'ws://127.0.0.1:4101';
const request = { daemonEndpoint: ENDPOINT, sourceId: 'box', projects: [] as string[] };
let fixture: WorkerTypeFixtureState;
let clock: number;
let issuer: InstanceType<typeof LaunchTokenIssuer>;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	__resetBuiltinPluginsForTests();
	clock = 1_000_000;
	issuer = new LaunchTokenIssuer(DEFAULT_LAUNCH_TOKEN_TTL_MS, () => clock);
	spawnMock.mockReset();
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
});

const diskEntry = {
	sourceId: 'box',
	provider: 'free',
	plugin: 'fixture-sandbox.sandbox',
	pluginsDir: FIXTURE_PLUGINS_DIR,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: '2026-11-06T00:00:00.000Z',
};

describe('LaunchTokenIssuer.revoke', () => {
	it('makes the credential unusable', () => {
		const token = issuer.issue('box');

		issuer.revoke('box', token);

		expect(issuer.consume('box', token)).toBe(false);
	});

	it('is idempotent, and a no-op for an unknown or spent credential', () => {
		const spent = issuer.issue('box');
		issuer.consume('box', spent);

		expect(() => {
			issuer.revoke('box', spent);
			issuer.revoke('box', spent);
			issuer.revoke('box', 'never-issued');
		}).not.toThrow();
	});

	it("does not revoke another source's credential", () => {
		const token = issuer.issue('box');

		issuer.revoke('other', token);

		expect(issuer.consume('box', token)).toBe(true);
	});

	it('frees the slot it held', () => {
		const tokens = Array.from({ length: MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE }, () => issuer.issue('box'));
		expect(() => issuer.issue('box')).toThrow(/outstanding/);

		issuer.revoke('box', tokens[0]!);

		expect(() => issuer.issue('box')).not.toThrow();
	});
});

describe('a launch that fails gives its credential back', () => {
	it('a plugin that fails 40 times in a row keeps reporting its own error, never the cap message', async () => {
		fixture.failObtain = true;
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
		const reports: string[] = [];

		for (let i = 0; i < 40; i++) {
			await contactDeclaredSources([diskEntry], ENDPOINT, message => reports.push(message), {
				workerTypes,
				issueLaunchToken: id => issuer.issue(id),
				revokeLaunchToken: (id, token) => issuer.revoke(id, token),
			});
		}
		await workerTypes.disposeAll();

		expect(reports).toHaveLength(40);
		expect(new Set(reports)).toEqual(
			new Set(['could not obtain a worker from source "box": fixture obtain failure: docker is not running'])
		);
	});

	it('revokes the credential of the failed ask', async () => {
		fixture.failObtain = true;
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});

		await contactDeclaredSources([diskEntry], ENDPOINT, () => {}, {
			workerTypes,
			issueLaunchToken: id => issuer.issue(id),
			revokeLaunchToken: (id, token) => issuer.revoke(id, token),
		});
		await workerTypes.disposeAll();

		const token = (fixture.obtained[0]!.request as { authToken: string }).authToken;
		expect(issuer.consume('box', token)).toBe(false);
	});

	it('rethrows a plugin error that embeds the request WITHOUT the credential, in message, cause and stack', async () => {
		fixture.failObtainEmbeddingRequest = true;
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
		const reports: string[] = [];

		await contactDeclaredSources([diskEntry], ENDPOINT, message => reports.push(message), {
			workerTypes,
			issueLaunchToken: id => issuer.issue(id),
			revokeLaunchToken: (id, token) => issuer.revoke(id, token),
		});
		await workerTypes.disposeAll();

		const token = (fixture.obtained[0]!.request as { authToken: string }).authToken;
		expect(reports).toHaveLength(1);
		expect(reports[0]).not.toContain(token);
		expect(reports[0]).toContain('<redacted>');
		expect(reports[0]).toContain('"sourceId":"box"');
	});

	it('the wrapper rethrows a fresh error: no cause, no stack that holds the credential', async () => {
		const seen: string[] = [];
		const inner = {
			obtainWorker: (r: { authToken?: string }) => {
				seen.push(r.authToken!);
				return Promise.reject(
					Object.assign(new Error(`failed with ${r.authToken!}`), { cause: new Error(r.authToken) })
				);
			},
		};
		const wrapper = new LaunchCredentialSource(
			inner,
			id => issuer.issue(id),
			(id, token) => issuer.revoke(id, token)
		);

		const error = await wrapper.obtainWorker(request).then(
			() => undefined,
			(err: unknown) => err as Error
		);

		expect(error?.message).toBe('failed with <redacted>');
		expect(error?.cause).toBeUndefined();
		expect(error?.stack).not.toContain(seen[0]);
	});

	it('redacts a thrown value that is not an Error', async () => {
		const wrapper = new LaunchCredentialSource(
			{
				obtainWorker: r => Promise.reject(`boom ${r.authToken!}` as unknown as Error),
			},
			id => issuer.issue(id)
		);

		const error = await wrapper.obtainWorker(request).then(
			() => undefined,
			(err: unknown) => err as Error
		);

		expect(error?.message).toBe('boom <redacted>');
	});

	it('a command that spawns no pid gives its credential back', async () => {
		spawnMock.mockReturnValue({ pid: undefined, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } });
		const issued: string[] = [];
		const revoked: [string, string][] = [];
		const source = new CommandWorkerSource(
			{ command: 'flow' },
			id => {
				const token = issuer.issue(id);
				issued.push(token);
				return token;
			},
			undefined,
			(id, token) => {
				revoked.push([id, token]);
				issuer.revoke(id, token);
			}
		);

		await expect(source.obtainWorker(request)).rejects.toThrow('the command produced no pid');

		expect(revoked).toEqual([['box', issued[0]]]);
		expect(issuer.consume('box', issued[0]!)).toBe(false);
	});

	it('a command whose spawn throws gives its credential back and rethrows the error', async () => {
		spawnMock.mockImplementation(() => {
			throw new Error('spawn EINVAL');
		});
		const revoked: [string, string][] = [];
		const source = new CommandWorkerSource(
			{ command: 'flow' },
			() => 'tok',
			undefined,
			(id, token) => revoked.push([id, token])
		);

		await expect(source.obtainWorker(request)).rejects.toThrow('spawn EINVAL');

		expect(revoked).toEqual([['box', 'tok']]);
	});

	it('a command that starts keeps its credential outstanding for the worker to spend', async () => {
		spawnMock.mockReturnValue({ pid: 7, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } });
		const revoked: unknown[] = [];

		await new CommandWorkerSource(
			{ command: 'flow' },
			() => 'tok',
			undefined,
			(...args) => revoked.push(args)
		).obtainWorker(request);

		expect(revoked).toEqual([]);
	});
});

describe('a disk plugin without a token issuer', () => {
	it('fails the ask with an actionable wiring message instead of silently getting no credential', async () => {
		const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
		const reports: string[] = [];

		await contactDeclaredSources([diskEntry], ENDPOINT, message => reports.push(message), { workerTypes });
		await workerTypes.disposeAll();

		expect(reports).toEqual([
			'could not obtain a worker from source "box": worker source "box" is a plugin loaded from a directory, which gets a launch credential for each worker it is asked for, but the daemon was not wired to mint one. ' +
				'This is a wiring mistake in the daemon, not a configuration error -- please report it.',
		]);
		expect(fixture.obtained).toEqual([]);
	});
});

describe('the wrapper owns request.authToken', () => {
	it('overwrites an authToken the request already carries with the daemon-minted one', async () => {
		const received: (string | undefined)[] = [];
		const wrapper = new LaunchCredentialSource(
			{
				obtainWorker: r => {
					received.push(r.authToken);
					return Promise.resolve();
				},
			},
			() => 'daemon-minted'
		);

		await wrapper.obtainWorker({ ...request, authToken: 'preset-by-someone' });

		expect(received).toEqual(['daemon-minted']);
	});
});
