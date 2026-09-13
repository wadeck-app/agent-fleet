import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

let dir: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'worker-sources-'));
});

afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const declaration = {
	sourceId: 'laptop',
	provider: 'built-in:inbound',
	labels: ['gpu'],
	maxWorkers: 2,
};

describe('WorkerSourceRegistry - declaring', () => {
	it('stores an entry and returns the token exactly once', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { token, entry } = registry.declare(declaration);

		expect(token).toMatch(/^[0-9a-f]{64}$/);
		expect(entry.sourceId).toBe('laptop');
		expect(entry.labels).toEqual(['gpu']);
		expect(entry.maxWorkers).toBe(2);
	});

	// T-09: the secret must not be recoverable from the file.
	it('never persists the token itself', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { token } = registry.declare(declaration);

		const raw = readFileSync(join(dir, 'worker-sources.json'), 'utf8');
		expect(raw).not.toContain(token);
		expect(raw).toContain('tokenHash');
	});

	it('rejects a duplicate sourceId instead of silently overwriting', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare(declaration);

		expect(() => registry.declare(declaration)).toThrow(/already declared/i);
	});

	it('rejects a blank sourceId', () => {
		const registry = new WorkerSourceRegistry(dir);
		expect(() => registry.declare({ ...declaration, sourceId: '  ' })).toThrow(/sourceId/i);
	});

	// D#64: an unbounded source could absorb every dispatched step (T-03).
	it('rejects a non-positive maxWorkers', () => {
		const registry = new WorkerSourceRegistry(dir);
		expect(() => registry.declare({ ...declaration, maxWorkers: 0 })).toThrow(/maxWorkers/i);
		expect(() => registry.declare({ ...declaration, maxWorkers: -1 })).toThrow(/maxWorkers/i);
	});

	// D#63: the CLI exists so the `command` S1 implementation is reachable. Declaring such a source
	// with no command to run produced an entry that only failed much later, at contact time, inside
	// the daemon -- where the user never sees it.
	it('rejects a built-in:command source that declares no command', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare({ ...declaration, provider: 'built-in:command' })).toThrow(/command/i);
		expect(() =>
			registry.declare({ ...declaration, provider: 'built-in:command', options: { command: '   ' } })
		).toThrow(/command/i);
	});

	it('stores the command a built-in:command source must run', () => {
		const registry = new WorkerSourceRegistry(dir);

		const { entry } = registry.declare({
			...declaration,
			provider: 'built-in:command',
			options: { command: 'flow worker', args: ['--verbose'], cwd: 'C:/proj' },
		});

		expect(entry.options).toEqual({ command: 'flow worker', args: ['--verbose'], cwd: 'C:/proj' });
	});

	// Accepting a command a provider will never run is config that looks applied and is not.
	it('refuses a command for a provider that does not run one', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() =>
			registry.declare({ ...declaration, provider: 'built-in:inbound', options: { command: 'flow worker' } })
		).toThrow(/built-in:command/);
	});

	it('rejects labels that are not a list of non-empty strings', () => {
		const registry = new WorkerSourceRegistry(dir);
		expect(() => registry.declare({ ...declaration, labels: 'gpu' as unknown as string[] })).toThrow(/list/i);
		expect(() => registry.declare({ ...declaration, labels: [''] })).toThrow(/empty/i);
	});
});

describe('WorkerSourceRegistry - reading back', () => {
	it('persists across instances', () => {
		new WorkerSourceRegistry(dir).declare(declaration);

		const reloaded = new WorkerSourceRegistry(dir);
		expect(reloaded.list().map(e => e.sourceId)).toEqual(['laptop']);
	});

	it('returns an empty list when nothing has been declared', () => {
		expect(new WorkerSourceRegistry(dir).list()).toEqual([]);
	});

	it('removes an entry', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare(declaration);

		expect(registry.remove('laptop')).toBe(true);
		expect(registry.list()).toEqual([]);
	});

	it('reports removal of an unknown source rather than pretending it worked', () => {
		expect(new WorkerSourceRegistry(dir).remove('nope')).toBe(false);
	});
});

describe('WorkerSourceRegistry - token verification (T-09)', () => {
	it('accepts the issued token', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { token } = registry.declare(declaration);

		expect(registry.verifyToken('laptop', token)).toBe(true);
	});

	it('rejects a wrong token', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare(declaration);

		expect(registry.verifyToken('laptop', 'f'.repeat(64))).toBe(false);
	});

	it('rejects a token for an undeclared source', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { token } = registry.declare(declaration);

		expect(registry.verifyToken('other', token)).toBe(false);
	});
});

describe('WorkerSourceRegistry - source credential (T-04, T-11)', () => {
	// A fake *source* manufactures capacity wholesale rather than absorbing one step, so its
	// credential is separate from the one workers present.
	it('issues a source token distinct from the worker token', () => {
		const registry = new WorkerSourceRegistry(dir);

		const { token, sourceToken } = registry.declare(declaration);

		expect(sourceToken).toBeTruthy();
		expect(sourceToken).not.toBe(token);
	});

	it('accepts the issued source token for source registration', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { sourceToken } = registry.declare(declaration);

		expect(registry.verifySourceToken('laptop', sourceToken)).toBe(true);
	});

	// The property the split exists for: neither credential works in the other role, so
	// stealing a worker's token does not let the thief register as a manufacturer.
	it('refuses a worker token presented as a source credential', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { token } = registry.declare(declaration);

		expect(registry.verifySourceToken('laptop', token)).toBe(false);
	});

	it('refuses a source token presented as a worker credential', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { sourceToken } = registry.declare(declaration);

		expect(registry.verifyToken('laptop', sourceToken)).toBe(false);
	});

	it('refuses a source token for a different source', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { sourceToken } = registry.declare(declaration);

		expect(registry.verifySourceToken('other', sourceToken)).toBe(false);
	});

	// An entry written before the split has no source hash. Treating "absent" as "matches"
	// would turn a missing credential into a universal one.
	it('refuses source registration for an entry that carries no source hash', () => {
		const registry = new WorkerSourceRegistry(dir);
		const { sourceToken } = registry.declare(declaration);
		const file = join(dir, 'worker-sources.json');
		const state = JSON.parse(readFileSync(file, 'utf8')) as { sources: Record<string, unknown>[] };
		delete state.sources[0]!['sourceTokenHash'];
		writeFileSync(file, JSON.stringify(state), 'utf8');

		expect(new WorkerSourceRegistry(dir).verifySourceToken('laptop', sourceToken)).toBe(false);
	});
});

describe('WorkerSourceRegistry - malformed state', () => {
	// A corrupt registry must not be read as "no sources declared": that would silently
	// drop every declared source and look like a configuration that never existed.
	it('fails loudly on unparseable JSON, naming the file', () => {
		writeFileSync(join(dir, 'worker-sources.json'), '{ not json', 'utf8');

		expect(() => new WorkerSourceRegistry(dir).list()).toThrow(/worker-sources\.json/);
	});

	it('fails loudly when the file is not a list of entries', () => {
		writeFileSync(join(dir, 'worker-sources.json'), '{"sources": "nope"}', 'utf8');

		expect(() => new WorkerSourceRegistry(dir).list()).toThrow(/worker-sources\.json/);
	});
});

describe('WorkerSourceRegistry - a worker that declared itself', () => {
	const declaration = {
		sourceId: 'terminal-4242',
		provider: 'built-in:inbound',
		labels: [],
		maxWorkers: 1,
	};

	// D#5's first kind of entry: "a worker that is already alive and waiting to be contacted". Its
	// pid is what tells a later reader whether it is still that -- alive -- or a leftover.
	it('records the pid of the process that declared it', () => {
		const registry = new WorkerSourceRegistry(dir);

		const { entry } = registry.declare({ ...declaration, pid: process.pid });

		expect(entry.pid).toBe(process.pid);
		expect(new WorkerSourceRegistry(dir).list()[0]?.pid).toBe(process.pid);
	});

	// A worker killed with no chance to clean up must not leave capacity declared forever.
	it('prunes an entry whose process is gone', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare({ ...declaration, sourceId: 'terminal-dead', pid: 999_999_998 });
		registry.declare({ ...declaration, sourceId: 'terminal-alive', pid: process.pid });

		const removed = registry.pruneDead();

		expect(removed).toEqual(['terminal-dead']);
		expect(new WorkerSourceRegistry(dir).list().map(e => e.sourceId)).toEqual(['terminal-alive']);
	});

	// An entry with no pid describes a machine or a command, not a process on this host: whether
	// some local pid is alive says nothing about it.
	it('never prunes an entry that declares no pid', () => {
		const registry = new WorkerSourceRegistry(dir);
		registry.declare({ sourceId: 'laptop', provider: 'built-in:inbound', labels: [], maxWorkers: 1 });

		expect(registry.pruneDead()).toEqual([]);
		expect(new WorkerSourceRegistry(dir).list()).toHaveLength(1);
	});

	it('reports nothing pruned when the registry is empty', () => {
		expect(new WorkerSourceRegistry(dir).pruneDead()).toEqual([]);
	});
});

/**
 * `built-in:host` was the relay provider's name before the rename. It is refused rather than
 * aliased: it never had a relay process to talk to, so an entry naming it never worked, and
 * quietly mapping it onto `built-in:relay` would present capacity that is not there.
 */
describe('WorkerSourceRegistry - the retired built-in:host provider', () => {
	it('refuses a declaration naming it, pointing at built-in:relay', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare({ ...declaration, provider: 'built-in:host' })).toThrow(/built-in:relay/);
	});

	it('tells the user to re-declare the source rather than edit anything', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.declare({ ...declaration, provider: 'built-in:host' })).toThrow(
			/flow worker source add laptop --provider built-in:relay/
		);
	});

	// The entry may already sit in the file from before the rename; reading must not pass it on.
	it('refuses an entry already persisted with it, on any read', () => {
		writeFileSync(
			join(dir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'build-box',
						provider: 'built-in:host',
						labels: [],
						maxWorkers: 1,
						tokenHash: 'x',
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			}),
			'utf8'
		);
		const registry = new WorkerSourceRegistry(dir);

		expect(() => registry.list()).toThrow(/built-in:relay/);
		expect(() => registry.find('build-box')).toThrow(/built-in:relay/);
		expect(() => registry.verifySourceToken('build-box', 'anything')).toThrow(/built-in:relay/);
	});

	// Removal is the remedy the error names, so it must not be blocked by the entry it removes.
	it('still lets the stale entry be removed', () => {
		writeFileSync(
			join(dir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'build-box',
						provider: 'built-in:host',
						labels: [],
						maxWorkers: 1,
						tokenHash: 'x',
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			}),
			'utf8'
		);
		const registry = new WorkerSourceRegistry(dir);

		expect(registry.remove('build-box')).toBe(true);
		expect(registry.list()).toEqual([]);
	});

	it('accepts built-in:relay', () => {
		const registry = new WorkerSourceRegistry(dir);

		expect(registry.declare({ ...declaration, provider: 'built-in:relay' }).entry.provider).toBe('built-in:relay');
	});
});
