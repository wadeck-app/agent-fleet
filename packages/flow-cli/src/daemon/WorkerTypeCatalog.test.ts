import { describe, expect, it } from 'vitest';

import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WorkerTypeCatalog } from './WorkerTypeCatalog.js';

function source(sourceId: string, plugin?: string): WorkerSourceEntry {
	return {
		sourceId,
		provider: plugin === undefined ? 'built-in:inbound' : 'sandbox',
		labels: [],
		maxWorkers: 1,
		...(plugin === undefined ? {} : { plugin, pluginsDir: '/plugins' }),
		tokenHash: 'h',
		sourceTokenHash: 'h',
		createdAt: '2026-01-01T00:00:00.000Z',
	} as WorkerSourceEntry;
}

function catalogOf(...entries: WorkerSourceEntry[]): WorkerTypeCatalog {
	return new WorkerTypeCatalog({ list: () => entries });
}

describe('WorkerTypeCatalog', () => {
	// The type is the plugin id of the ref, so two implementations of one plugin are the same type.
	it('names the type of a plugin source after the plugin id of its ref', () => {
		const lookup = catalogOf(source('sbx-1', 'sandbox.docker')).typeLookup();
		expect(lookup('sbx-1')).toBe('sandbox');
	});

	it('gives the same type to two sources of one plugin, whatever the implementation', () => {
		const lookup = catalogOf(source('a', 'sandbox.docker'), source('b', 'sandbox.podman')).typeLookup();
		expect([lookup('a'), lookup('b')]).toEqual(['sandbox', 'sandbox']);
	});

	// A host worker must never be mistaken for a typed one.
	it('gives no type to a source without a plugin, to an unknown source and to a worker without a source', () => {
		const lookup = catalogOf(source('host', undefined)).typeLookup();
		expect([lookup('host'), lookup('nobody'), lookup(undefined)]).toEqual([undefined, undefined, undefined]);
	});

	it('lists the known types once each, sorted', () => {
		const catalog = catalogOf(
			source('a', 'sandbox.docker'),
			source('b', 'gpu.farm'),
			source('c', 'sandbox.podman'),
			source('host', undefined)
		);
		expect(catalog.knownTypes()).toEqual(['gpu', 'sandbox']);
	});

	it('lists no type when no plugin source is declared', () => {
		expect(catalogOf(source('host', undefined)).knownTypes()).toEqual([]);
	});
});
