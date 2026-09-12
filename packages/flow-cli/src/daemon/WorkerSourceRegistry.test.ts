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
