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
	return new WorkerTypeCatalog({ list: () => entries }, { isRequirementOnly: () => false });
}

describe('WorkerTypeCatalog - requirement-only sources', () => {
	const exclusiveIds = (...ids: string[]) => ({
		isRequirementOnly: (entry: WorkerSourceEntry) => ids.includes(entry.sourceId),
	});

	it('answers exclusive for the workers of the sources the exclusivity says are', () => {
		const catalog = new WorkerTypeCatalog(
			{ list: () => [source('sbx', 'sandbox.exec'), source('farm', 'gpu.farm')] },
			exclusiveIds('sbx')
		);
		const isRequirementOnly = catalog.requirementOnlyLookup();

		expect([isRequirementOnly('sbx'), isRequirementOnly('farm')]).toEqual([true, false]);
	});

	// Documented limit: a connection whose source was removed keeps its sourceId but no entry says anything about it.
	it('answers not exclusive for a worker with no source or a source that is not declared', () => {
		const catalog = new WorkerTypeCatalog({ list: () => [source('sbx', 'sandbox.exec')] }, exclusiveIds('sbx'));
		const isRequirementOnly = catalog.requirementOnlyLookup();

		expect([isRequirementOnly(undefined), isRequirementOnly('gone')]).toEqual([false, false]);
	});

	it('reads the sources once per lookup, not once per worker', () => {
		let reads = 0;
		const catalog = new WorkerTypeCatalog(
			{
				list: () => {
					reads++;
					return [source('sbx', 'sandbox.exec')];
				},
			},
			exclusiveIds('sbx')
		);
		const isRequirementOnly = catalog.requirementOnlyLookup();
		isRequirementOnly('sbx');
		isRequirementOnly('sbx');

		expect(reads).toBe(1);
	});
});

describe('WorkerTypeCatalog - guarantees', () => {
	const guaranteeing = {
		guaranteesOf: (entry: WorkerSourceEntry) => (entry.sourceId === 'sbx' ? ['fs=confined'] : []),
	};

	it('reads the guarantees of each declared source from its built instance', () => {
		const catalog = new WorkerTypeCatalog(
			{ list: () => [source('sbx', 'sandbox.docker'), source('other', 'other.x')] },
			{ isRequirementOnly: () => false },
			guaranteeing
		);
		const lookup = catalog.guaranteeLookup();

		expect([lookup('sbx'), lookup('other')]).toEqual([['fs=confined'], []]);
	});

	// A worker that names no source, or a source that is not declared, has nothing vouching for it.
	it('gives no guarantee to a worker without a source or with an undeclared source', () => {
		const catalog = new WorkerTypeCatalog(
			{ list: () => [source('sbx', 'sandbox.docker')] },
			{ isRequirementOnly: () => false },
			guaranteeing
		);
		const lookup = catalog.guaranteeLookup();

		expect([lookup(undefined), lookup('gone')]).toEqual([[], []]);
	});

	it('guarantees nothing when built without a guarantee source (fail-closed)', () => {
		const lookup = catalogOf(source('sbx', 'sandbox.docker')).guaranteeLookup();

		expect(lookup('sbx')).toEqual([]);
	});

	it('is read once per call, over the sources declared right now', () => {
		let calls = 0;
		const catalog = new WorkerTypeCatalog(
			{ list: () => [source('sbx', 'sandbox.docker')] },
			{ isRequirementOnly: () => false },
			{ guaranteesOf: () => (calls++, ['x']) }
		);
		const lookup = catalog.guaranteeLookup();
		lookup('sbx');
		lookup('sbx');

		expect(calls).toBe(1);
	});
});

describe('WorkerTypeCatalog - workspace kinds', () => {
	const catalogWith = (kinds: Record<string, string[] | undefined>): WorkerTypeCatalog =>
		new WorkerTypeCatalog(
			{ list: () => [source('sbx', 'sandbox.docker'), source('open', 'other.x'), source('host', undefined)] },
			{ isRequirementOnly: () => false },
			{ guaranteesOf: () => [], workspacesOf: entry => kinds[entry.sourceId] }
		);

	it('reads the kinds each declared source accepts, undefined meaning no restriction', () => {
		const lookup = catalogWith({ sbx: ['pool'], open: undefined }).workspaceLookup();

		expect([lookup('sbx'), lookup('open'), lookup('host')]).toEqual([['pool'], undefined, undefined]);
	});

	it('accepts nothing from a source no longer declared, and does not restrict a worker with no source', () => {
		const lookup = catalogWith({}).workspaceLookup();

		expect([lookup('gone'), lookup(undefined)]).toEqual([[], undefined]);
	});

	it('restricts nothing when the catalog has no workspace source (a wiring without the feature)', () => {
		const lookup = catalogOf(source('sbx', 'sandbox.docker')).workspaceLookup();

		expect(lookup('sbx')).toBeUndefined();
	});
});
