import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendNudgeMock = vi.fn();
vi.mock('./NudgeDispatch.js', () => ({ sendNudge: (...args: unknown[]) => sendNudgeMock(...args) }));

const { contactDeclaredSources } = await import('./WorkerSourceContact.js');
const { WorkerSourceRegistry } = await import('./WorkerSourceRegistry.js');
const { declareSelf } = await import('../worker/SelfDeclaration.js');

/**
 * Pins what a declared `built-in:inbound` source does TODAY, through the entry point the daemon uses
 * (`contactDeclaredSources`), for both ways such an entry comes to exist: declared by a user, and written by a worker
 * about itself (SelfDeclaration). `nudgeUrl` is a top-level entry field that workers write themselves.
 */

const ENDPOINT = 'ws://127.0.0.1:4101';
let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'inbound-characterization-'));
	sendNudgeMock.mockReset();
	sendNudgeMock.mockResolvedValue(undefined);
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

function declare(extra: { nudgeUrl?: string; options?: Record<string, unknown> } = {}, sourceId = 'terminal-1') {
	new WorkerSourceRegistry(dir).declare({
		sourceId,
		provider: 'built-in:inbound',
		labels: [],
		maxWorkers: 1,
		...extra,
	});
	return new WorkerSourceRegistry(dir).list();
}

async function contact(entries: ReturnType<typeof declare>): Promise<string[]> {
	const reported: string[] = [];
	await contactDeclaredSources(entries, ENDPOINT, message => reported.push(message));
	return reported;
}

describe('a declared built-in:inbound source - characterization', () => {
	it('sends one nudge carrying the daemon endpoint to the declared nudgeUrl', async () => {
		const reported = await contact(declare({ nudgeUrl: 'http://127.0.0.1:5555/nudge' }));

		expect(reported).toEqual([]);
		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:5555/nudge', ENDPOINT);
	});

	it('sends nothing, and reports nothing, when the source has no nudgeUrl: the worker dials in by itself', async () => {
		const reported = await contact(declare());

		expect(reported).toEqual([]);
		expect(sendNudgeMock).not.toHaveBeenCalled();
	});

	it('reports a failed nudge with the exact message naming the source and the URL', async () => {
		sendNudgeMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

		const reported = await contact(declare({ nudgeUrl: 'http://127.0.0.1:5555/nudge' }));

		expect(reported).toEqual([
			'could not obtain a worker from source "terminal-1": nudge to "terminal-1" at http://127.0.0.1:5555/nudge failed: connect ECONNREFUSED',
		]);
	});

	it('serves an entry a worker wrote about itself, nudge included', async () => {
		const handle = declareSelf(dir, {
			projects: ['C:/proj'],
			labels: ['gpu'],
			pid: 4321,
			nudgeUrl: 'http://127.0.0.1:6000/nudge',
		});

		const entries = new WorkerSourceRegistry(dir).list();
		const reported = await contact(entries);

		expect(handle?.sourceId).toBe('terminal-4321');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({
			sourceId: 'terminal-4321',
			provider: 'built-in:inbound',
			options: { projects: ['C:/proj'] },
			nudgeUrl: 'http://127.0.0.1:6000/nudge',
			pid: 4321,
		});
		expect(entries[0]).not.toHaveProperty('plugin');
		expect(reported).toEqual([]);
		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:6000/nudge', ENDPOINT);
	});

	it('serves an entry from an old worker-sources.json that predates the plugin fields', async () => {
		writeFileSync(
			join(dir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'old-terminal',
						provider: 'built-in:inbound',
						labels: [],
						maxWorkers: 1,
						nudgeUrl: 'http://127.0.0.1:7000/nudge',
						tokenHash: 'deadbeef',
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			}),
			'utf8'
		);

		const reported = await contact(new WorkerSourceRegistry(dir).list());

		expect(reported).toEqual([]);
		expect(sendNudgeMock).toHaveBeenCalledExactlyOnceWith('http://127.0.0.1:7000/nudge', ENDPOINT);
	});

	it('refuses at declaration a command and a literal credential in the options', () => {
		const registry = new WorkerSourceRegistry(dir);
		const base = { sourceId: 'terminal-1', provider: 'built-in:inbound', labels: [], maxWorkers: 1 };

		expect(() => registry.declare({ ...base, options: { command: 'flow' } })).toThrow(
			'Worker source "terminal-1" declares a command, but provider "built-in:inbound" never runs one. Use --provider built-in:command to have the daemon launch a worker itself.'
		);
		expect(() => registry.declare({ ...base, options: { token: 'abc123' } })).toThrow(
			'Literal credential value in worker source "terminal-1" options: sensitive field "token" must use ${ENV_VAR} interpolation, not a literal value'
		);
		expect(registry.list()).toEqual([]);
	});

	// Today nudgeUrl is not checked at declaration: it is stored as given, and a bad one only fails when contacted.
	it('stores any nudgeUrl as given, even one that is not a URL or carries a token in its query', () => {
		const entries = new WorkerSourceRegistry(dir).declare({
			sourceId: 'terminal-1',
			provider: 'built-in:inbound',
			labels: [],
			maxWorkers: 1,
			nudgeUrl: 'not a url?token=abc123',
		});

		expect(entries.entry.nudgeUrl).toBe('not a url?token=abc123');
		expect(entries.warnings).toEqual([]);
	});
});
