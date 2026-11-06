import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBuiltinPluginsForTests } from '../config/BuiltinPluginRegistry.js';
import { PluginLoader } from '../config/PluginLoader.js';

const sendNudgeMock = vi.fn();
vi.mock('./NudgeDispatch.js', () => ({ sendNudge: (...args: unknown[]) => sendNudgeMock(...args) }));

const { contactDeclaredSources } = await import('./WorkerSourceContact.js');
const { WorkerSourceRegistry } = await import('./WorkerSourceRegistry.js');
const { WorkerTypeInstances } = await import('./WorkerTypeInstances.js');

/**
 * A nudgeUrl never carries credentials, period: only host, port and path are used, so there is nothing a credential
 * could be for. Not even as a ${NAME} reference, whatever form the URL is written in.
 */

const ENDPOINT = 'ws://127.0.0.1:4101';
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'inbound-credentials-'));
	sendNudgeMock.mockReset();
	sendNudgeMock.mockResolvedValue(undefined);
	__resetBuiltinPluginsForTests();
});

afterEach(() => {
	__resetBuiltinPluginsForTests();
	rmSync(dir, { recursive: true, force: true });
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

const declareProvider = (nudgeUrl: string) =>
	new WorkerSourceRegistry(dir).declare({
		sourceId: 'terminal-1',
		provider: 'built-in:inbound',
		labels: [],
		maxWorkers: 1,
		nudgeUrl,
	});
const declarePlugin = (nudgeUrl: string) =>
	new WorkerSourceRegistry(dir).declare({
		sourceId: 'terminal-1',
		provider: 'inbound',
		plugin: 'inbound.default',
		labels: [],
		maxWorkers: 1,
		options: { nudgeUrl },
	});
const message = (where: string) =>
	`Worker source "terminal-1": nudgeUrl carries a credential (${where}). A nudgeUrl never carries credentials: only host, port and path are used, so remove it.`;

describe('(a) user info is read the way the URL parser reads it', () => {
	it.each(['http:user:pw@127.0.0.1:5555/nudge', 'http:/user:pw@127.0.0.1:5555/nudge', 'http://user@127.0.0.1/nudge'])(
		'refuses %s at declaration, in both forms',
		url => {
			expect(() => declareProvider(url)).toThrow(message('user info'));
			expect(() => declarePlugin(url)).toThrow(message('user info'));
		}
	);

	it('refuses user info written as ${NAME} references: there is no whitelist', () => {
		expect(() => declarePlugin('http://${NUDGE_USER}:${NUDGE_PASS}@127.0.0.1:5555/nudge')).toThrow(
			message('user info')
		);
	});

	it('refuses it again after expansion, without echoing it', async () => {
		process.env['INBOUND_URL'] = 'http:user:pw@127.0.0.1:5555/nudge';

		const [report] = await contact(entry({ options: { nudgeUrl: '${INBOUND_URL}' } }));

		expect(report).toContain('carries a credential (user info)');
		expect(report).not.toContain('pw');
		expect(sendNudgeMock).not.toHaveBeenCalled();
	});
});

describe('(b) credential key names are compared without case, "-" and "_"', () => {
	it.each([
		'access_token',
		'api-key',
		'api_key',
		'private_key',
		'bearer_token',
		'API_KEY',
		'Access-Token',
		'apiKey',
		'key',
	])('refuses the query key %s, even with a ${NAME} value', key => {
		for (const value of ['abc', '${NUDGE_SECRET}']) {
			expect(() => declareProvider(`http://127.0.0.1:5555/nudge?${key}=${value}`)).toThrow(
				message(`query parameter "${key}"`)
			);
		}
	});

	it('keeps a query that has no credential-named key', () => {
		expect(declareProvider('http://127.0.0.1:5555/nudge?mode=fast').entry.nudgeUrl).toBe(
			'http://127.0.0.1:5555/nudge?mode=fast'
		);
	});
});

describe('(d) the conflict message does not echo credentials', () => {
	it('prints both URLs redacted when a hand-edited entry holds two different values', async () => {
		const [report] = await contact(
			entry({
				nudgeUrl: 'http://user:pw@127.0.0.1:5555/nudge?token=abc123',
				options: { nudgeUrl: 'http://127.0.0.1:6666/other?key=zzz' },
			})
		);

		expect(report).toContain(
			'nudgeUrl is set twice with different values (entry "http://127.0.0.1:5555/nudge?…", options "http://127.0.0.1:6666/other?…").'
		);
		expect(report).not.toContain('pw');
		expect(report).not.toContain('abc123');
		expect(report).not.toContain('zzz');
	});
});
