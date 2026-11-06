import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetBuiltinPluginsForTests } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';
import {
	FIXTURE_PLUGINS_DIR,
	type WorkerTypeFixtureState,
	resetWorkerTypeFixture,
} from '../test-utils/WorkerTypeFixture.js';
import {
	DEFAULT_LAUNCH_TOKEN_TTL_MS,
	LaunchTokenIssuer,
	MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE,
} from './LaunchTokenIssuer.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';

/**
 * A plugin loaded from a directory gets a launch credential in request.authToken, minted by the daemon for each
 * obtainWorker call. It never receives the minting service itself, and a built-in worker type is unchanged.
 */

const ENDPOINT = 'ws://127.0.0.1:4101';
let fixture: WorkerTypeFixtureState;
let clock: number;
let issuer: LaunchTokenIssuer;
let logs: string[];
let reports: string[];
let workerTypes: WorkerTypeInstances;

beforeEach(() => {
	fixture = resetWorkerTypeFixture();
	__resetBuiltinPluginsForTests();
	clock = 1_000_000;
	issuer = new LaunchTokenIssuer(DEFAULT_LAUNCH_TOKEN_TTL_MS, () => clock);
	logs = [];
	reports = [];
	workerTypes = new WorkerTypeInstances(new PluginLoader(), (_level, message) => logs.push(message));
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
});

const diskEntry = (sourceId = 'box') => ({
	sourceId,
	provider: 'free',
	plugin: 'fixture-sandbox.sandbox',
	pluginsDir: FIXTURE_PLUGINS_DIR,
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: '2026-11-06T00:00:00.000Z',
});

const contact = (sourceId = 'box', issueLaunchToken: (id: string) => string = id => issuer.issue(id)) =>
	contactDeclaredSources([diskEntry(sourceId)], ENDPOINT, message => reports.push(message), {
		workerTypes,
		issueLaunchToken,
	});

const tokens = (): string[] =>
	fixture.obtained.map(item => (item.request as { authToken?: string }).authToken).filter((t): t is string => !!t);

describe('a plugin from disk receives a launch credential', () => {
	it('in request.authToken, 32 random bytes as hex, next to the usual fields', async () => {
		await contact();

		expect(reports).toEqual([]);
		const [request] = fixture.obtained.map(item => item.request as Record<string, unknown>);
		expect(Object.keys(request!).sort()).toEqual(['authToken', 'daemonEndpoint', 'projects', 'sourceId']);
		expect(request!['authToken']).toMatch(/^[0-9a-f]{64}$/);
	});

	it('minted per obtainWorker call: two asks, two different credentials', async () => {
		await contact();
		await contact();

		const [first, second] = tokens();
		expect(tokens()).toHaveLength(2);
		expect(first).not.toBe(second);
	});

	it('mints nothing when obtainWorker is never called', async () => {
		let minted = 0;

		await workerTypes.get(diskEntry(), {
			issueLaunchToken: id => {
				minted++;
				return issuer.issue(id);
			},
		});
		await workerTypes.disposeAll();

		expect(minted).toBe(0);
		expect(fixture.obtained).toEqual([]);
	});

	it('is unusable for another source, and the failed replay does not spend it', async () => {
		await contact('box');
		const [token] = tokens();

		expect(issuer.consume('other', token!)).toBe(false);
		expect(issuer.consume('box', token!)).toBe(true);
	});

	it('is unusable after first use', async () => {
		await contact('box');
		const [token] = tokens();

		expect(issuer.consume('box', token!)).toBe(true);
		expect(issuer.consume('box', token!)).toBe(false);
	});

	it('is refused once expired', async () => {
		await contact('box');
		const [token] = tokens();

		clock += DEFAULT_LAUNCH_TOKEN_TTL_MS;

		expect(issuer.consume('box', token!)).toBe(false);
	});

	it('does not give the plugin the minting service: it receives only sourceId and options', async () => {
		await contact();

		expect(fixture.created).toEqual([{ sourceId: 'box', options: undefined }]);
	});

	// Was: 'gives it no credential when the daemon cannot mint one' (silent). Now an actionable wiring error, tested in
	// LaunchCredentialRevocation.test.ts.

	it('never writes the credential to a log or to a report, also when the cap refuses', async () => {
		for (let i = 0; i < MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE + 2; i++) {
			await contact();
		}

		const everything = [...logs, ...reports].join('\n');
		expect(tokens().length).toBe(MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE);
		for (const token of tokens()) {
			expect(everything).not.toContain(token);
		}
		expect(reports.length).toBe(2);
	});
});

describe('LaunchTokenIssuer - cap on outstanding credentials per source', () => {
	it('refuses the next credential of a source at the cap, with a message that says why and what to do', () => {
		for (let i = 0; i < MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE; i++) {
			issuer.issue('box');
		}

		expect(() => issuer.issue('box')).toThrow(
			`source "box" already has ${String(MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE)} launch credentials outstanding (each is spent when its worker registers and expires after 120 s), so no new one is minted. ` +
				"The workers it launched are not registering: check the source's launch and its logs, or wait for the credentials to expire."
		);
	});

	it('counts per source: another source is not affected', () => {
		for (let i = 0; i < MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE; i++) {
			issuer.issue('box');
		}

		expect(() => issuer.issue('other')).not.toThrow();
	});

	it('frees a slot when a credential is spent, and all of them when they expire', () => {
		const first = issuer.issue('box');
		for (let i = 1; i < MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE; i++) {
			issuer.issue('box');
		}
		expect(() => issuer.issue('box')).toThrow(/outstanding/);

		expect(issuer.consume('box', first)).toBe(true);
		expect(() => issuer.issue('box')).not.toThrow();
		expect(() => issuer.issue('box')).toThrow(/outstanding/);

		clock += DEFAULT_LAUNCH_TOKEN_TTL_MS;
		expect(() => issuer.issue('box')).not.toThrow();
	});

	it('names no credential in its message', () => {
		const issued: string[] = [];
		for (let i = 0; i < MAX_OUTSTANDING_LAUNCH_TOKENS_PER_SOURCE; i++) {
			issued.push(issuer.issue('box'));
		}

		const message = (() => {
			try {
				issuer.issue('box');
				return '';
			} catch (err) {
				return (err as Error).message;
			}
		})();

		for (const token of issued) {
			expect(message).not.toContain(token);
		}
	});
});
