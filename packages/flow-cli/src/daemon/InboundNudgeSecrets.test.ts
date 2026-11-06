import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBuiltinPluginsForTests } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';

const sendNudgeMock = vi.fn();
vi.mock('./NudgeDispatch.js', () => ({ sendNudge: (...args: unknown[]) => sendNudgeMock(...args) }));

const { inboundWorkerTypePlugin } = await import('./InboundWorkerTypePlugin.js');
const { contactDeclaredSources } = await import('./WorkerSourceContact.js');
const { WorkerSourceRegistry } = await import('./WorkerSourceRegistry.js');
const { WorkerTypeInstances } = await import('./WorkerTypeInstances.js');

/**
 * Secrets and the nudgeUrl: entry data is never env-expanded, failure messages never echo userinfo or query values,
 * the daemon re-validates the URL after expansion, and declaration never echoes a URL that carries a credential.
 */

const ENDPOINT = 'ws://127.0.0.1:4101';
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'inbound-secrets-'));
	sendNudgeMock.mockReset();
	sendNudgeMock.mockResolvedValue(undefined);
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	vi.restoreAllMocks();
	__resetBuiltinPluginsForTests();
	rmSync(dir, { recursive: true, force: true });
	delete process.env['INBOUND_SECRET'];
	delete process.env['INBOUND_URL'];
});

const entry = (overrides: Record<string, unknown> = {}) => ({
	sourceId: 'terminal-1',
	provider: 'inbound',
	plugin: 'inbound.default',
	labels: [],
	maxWorkers: 1,
	tokenHash: 'h',
	createdAt: '2026-11-06T00:00:00.000Z',
	...overrides,
});

async function contact(e: ReturnType<typeof entry>): Promise<string[]> {
	const workerTypes = new WorkerTypeInstances(new PluginLoader(), () => {});
	const reported: string[] = [];
	await contactDeclaredSources([e], ENDPOINT, message => reported.push(message), { workerTypes });
	await workerTypes.disposeAll();
	return reported;
}

describe('fix 1 - the entry nudgeUrl is never env-expanded', () => {
	it('hands the plugin the LITERAL text of the entry URL and never reads the variable', async () => {
		process.env['INBOUND_SECRET'] = 's3cret-value';
		const create = vi.spyOn(inboundWorkerTypePlugin, 'create');
		const url = 'http://127.0.0.1:5555/nudge?${INBOUND_SECRET}';

		const reported = await contact(entry({ nudgeUrl: url }));

		expect(reported).toEqual([]);
		expect(create.mock.calls.map(call => (call[0] as { options: unknown }).options)).toEqual([{ nudgeUrl: url }]);
		expect(JSON.stringify(sendNudgeMock.mock.calls)).not.toContain('s3cret-value');
	});

	it('does not fail on a variable that is not set when it is in the entry URL', async () => {
		const reported = await contact(entry({ nudgeUrl: 'http://127.0.0.1:5555/${NOT_SET_ANYWHERE}' }));

		expect(reported).toEqual([]);
	});

	it('still expands ${NAME} in options.nudgeUrl, which the user declared', async () => {
		process.env['INBOUND_URL'] = 'http://127.0.0.1:6000/nudge';

		await contact(entry({ options: { nudgeUrl: '${INBOUND_URL}' } }));

		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:6000/nudge', ENDPOINT);
	});
});

describe('fix 2 - failure messages never echo userinfo or query values', () => {
	const provider = (nudgeUrl: string) => entry({ provider: 'built-in:inbound', plugin: undefined, nudgeUrl });

	it('prints scheme, host and path only, and marks a hidden query', async () => {
		sendNudgeMock.mockRejectedValue(new Error('boom'));

		const reported = await contact(provider('http://user:pw@127.0.0.1:5555/nudge?token=abc123'));

		expect(reported).toEqual([
			'could not obtain a worker from source "terminal-1": nudge to "terminal-1" at http://127.0.0.1:5555/nudge?… failed: boom',
		]);
	});

	it('keeps the URL as is in the message when it has no userinfo and no query (the pinned form)', async () => {
		sendNudgeMock.mockRejectedValue(new Error('boom'));

		const reported = await contact(provider('http://127.0.0.1:5555/nudge'));

		expect(reported).toEqual([
			'could not obtain a worker from source "terminal-1": nudge to "terminal-1" at http://127.0.0.1:5555/nudge failed: boom',
		]);
	});

	it('also redacts the URL the cause quotes, and a URL that cannot be parsed', async () => {
		sendNudgeMock.mockRejectedValue(new Error('invalid nudge URL "not a url?token=abc123": TypeError'));

		const reported = await contact(provider('not a url?token=abc123'));

		expect(reported).toEqual([
			'could not obtain a worker from source "terminal-1": nudge to "terminal-1" at <not a valid URL> failed: invalid nudge URL "<not a valid URL>": TypeError',
		]);
	});

	it.each([
		['http://user:pw@127.0.0.1:5555/nudge', 'a credential (user info)', 'pw'],
		['http://127.0.0.1:5555/nudge?token=abc123', 'a credential (query parameter "token")', 'abc123'],
		['ftp://127.0.0.1/nudge', 'not an http(s) URL', 'ftp'],
	])('validates the URL again after expansion, without echoing it: %s', async (expanded, problem, secret) => {
		process.env['INBOUND_URL'] = expanded;

		const [report] = await contact(entry({ options: { nudgeUrl: '${INBOUND_URL}' } }));

		expect(report).toContain(
			`the inbound worker type got a nudgeUrl that ${problem.startsWith('a credential') ? `carries ${problem}` : 'is not an http(s) URL (the value is not shown: it may hold a secret)'}.`
		);
		expect(report).toContain('Fix: flow worker source remove terminal-1, then declare it again');
		expect(report).not.toContain(secret);
		expect(sendNudgeMock).not.toHaveBeenCalled();
	});

	it('refuses a credential that came in through the entry URL after the copy', async () => {
		const [report] = await contact(entry({ nudgeUrl: 'http://127.0.0.1:5555/nudge?token=${INBOUND_SECRET}' }));

		expect(report).toContain('carries a credential (query parameter "token")');
		expect(sendNudgeMock).not.toHaveBeenCalled();
	});
});

describe('fix 3 and 4 - declaration', () => {
	const declare = (extra: Record<string, unknown>, provider = 'built-in:inbound') =>
		new WorkerSourceRegistry(dir).declare({
			sourceId: 'terminal-1',
			provider,
			labels: [],
			maxWorkers: 1,
			...extra,
		});
	const credentialMessage = (where: string) =>
		`Worker source "terminal-1": nudgeUrl carries a credential (${where}). A nudgeUrl never carries credentials: only host, port and path are used, so remove it.`;

	it('reports a credential before a bad scheme, and never echoes the value', () => {
		expect(() => declare({ nudgeUrl: 'ftp://u:pw@h/?token=x' })).toThrow(credentialMessage('user info'));
		expect(() => declare({ nudgeUrl: 'not a url?token=abc' })).toThrow(
			credentialMessage('query parameter "token"')
		);
	});

	it('still echoes a bad URL that carries no credential, to be actionable', () => {
		expect(() => declare({ nudgeUrl: 'ftp://host/x' })).toThrow(
			'Worker source "terminal-1": nudgeUrl "ftp://host/x" must be an http(s) URL, e.g. http://127.0.0.1:5555/nudge.'
		);
	});

	it('refuses a non-string options.nudgeUrl for the inbound plugin, saying what it was', () => {
		for (const [value, type] of [
			[42, 'number'],
			[true, 'boolean'],
			[['x'], 'array'],
			[null, 'null'],
		] as const) {
			expect(() => declare({ plugin: 'inbound.default', options: { nudgeUrl: value } }, 'inbound')).toThrow(
				`Worker source "terminal-1": options.nudgeUrl must be a string (an http(s) URL), got ${type}.`
			);
		}
	});

	it('does not read options.nudgeUrl for the provider form', () => {
		expect(declare({ options: { nudgeUrl: 42 } }).entry.provider).toBe('built-in:inbound');
	});
});
