import { describe, expect, it } from 'vitest';

import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

function source(sourceId: string, plugin?: string): WorkerSourceEntry {
	return {
		sourceId,
		provider: 'x',
		labels: [],
		maxWorkers: 1,
		...(plugin === undefined ? {} : { plugin, pluginsDir: '/plugins' }),
		tokenHash: 'h',
		createdAt: '2026-11-08T00:00:00.000Z',
	} as WorkerSourceEntry;
}

function build(entries: WorkerSourceEntry[], declared: Record<string, string[] | Error>) {
	const logged: string[] = [];
	const reads: string[] = [];
	const guarantees = new DeclaredGuarantees(
		{ list: () => entries },
		{
			declaredGuarantees: async entry => {
				reads.push(entry.sourceId);
				const value = declared[entry.sourceId];
				if (value instanceof Error) throw value;
				return value ?? [];
			},
		},
		message => logged.push(message)
	);
	return { guarantees, logged, reads };
}

describe('DeclaredGuarantees', () => {
	it('knows nothing before the first refresh, and says the declaration of a plugin source is not read yet', () => {
		const { guarantees } = build([source('sbx', 'sandbox.docker')], { sbx: ['fs=confined'] });

		expect(guarantees.entries()).toEqual([]);
		expect(guarantees.unread()).toEqual(['sbx']);
	});

	it('unions the declarations of the declared plugin sources, sorted', async () => {
		const { guarantees } = build([source('a', 'p.x'), source('b', 'q.y'), source('host')], {
			a: ['net=filtered', 'fs=confined'],
			b: ['fs=confined', 'env=clean'],
		});
		await guarantees.refresh();

		expect(guarantees.entries()).toEqual(['env=clean', 'fs=confined', 'net=filtered']);
		expect(guarantees.unread()).toEqual([]);
	});

	it('names the sources that declare an entry', async () => {
		const { guarantees } = build([source('a', 'p.x'), source('b', 'q.y')], {
			a: ['fs=confined'],
			b: ['fs=confined', 'env=clean'],
		});
		await guarantees.refresh();

		expect(guarantees.providersOf('fs=confined')).toEqual(['a', 'b']);
		expect(guarantees.providersOf('env=clean')).toEqual(['b']);
		expect(guarantees.providersOf('gpu')).toEqual([]);
	});

	it('does not read a declaration twice for an unchanged source', async () => {
		const { guarantees, reads } = build([source('a', 'p.x')], { a: ['x'] });
		await guarantees.refresh();
		await guarantees.refresh();

		expect(reads).toEqual(['a']);
	});

	it('reports a source whose declaration cannot be read, keeps the others, and tries it again next time', async () => {
		const declared: Record<string, string[] | Error> = { a: new Error('boom'), b: ['env=clean'] };
		const { guarantees, logged, reads } = build([source('a', 'p.x'), source('b', 'q.y')], declared);
		await guarantees.refresh();

		expect(guarantees.entries()).toEqual(['env=clean']);
		expect(guarantees.unread()).toEqual(['a']);
		expect(logged.join('\n')).toContain('boom');

		declared['a'] = ['fs=confined'];
		await guarantees.refresh();

		expect(reads).toEqual(['a', 'b', 'a']);
		expect(guarantees.entries()).toEqual(['env=clean', 'fs=confined']);
		expect(guarantees.unread()).toEqual([]);
	});

	it('forgets a source that is no longer declared', async () => {
		let entries = [source('a', 'p.x')];
		const guarantees = new DeclaredGuarantees(
			{ list: () => entries },
			{ declaredGuarantees: async () => ['fs=confined'] },
			() => {}
		);
		await guarantees.refresh();
		entries = [];

		expect(guarantees.entries()).toEqual([]);
		expect(guarantees.providersOf('fs=confined')).toEqual([]);
	});

	it('reads again a source declared again with another plugin', async () => {
		let entries = [source('a', 'p.x')];
		const reads: string[] = [];
		const guarantees = new DeclaredGuarantees(
			{ list: () => entries },
			{
				declaredGuarantees: async entry => {
					reads.push(entry.plugin ?? '');
					return [entry.plugin === 'p.x' ? 'one' : 'two'];
				},
			},
			() => {}
		);
		await guarantees.refresh();
		entries = [source('a', 'p.y')];
		await guarantees.refresh();

		expect(reads).toEqual(['p.x', 'p.y']);
		expect(guarantees.entries()).toEqual(['two']);
	});
});

describe('DeclaredGuarantees - which sources can provide a whole requirement set', () => {
	const entries = [source('a', 'p.x'), source('b', 'q.y'), source('c', 'r.z')];
	const declared = { a: ['fs=confined'], b: ['fs=confined', 'net=filtered', 'env=clean'], c: [] };

	it('names the sources that declare every entry, not one source per entry', async () => {
		const { guarantees } = build(entries, declared);
		await guarantees.refresh();

		expect(guarantees.providersOfAll(['fs=confined', 'net=filtered'])).toEqual(['b']);
		expect(guarantees.providersOfAll(['fs=confined'])).toEqual(['a', 'b']);
		expect(guarantees.providersOfAll(['gpu'])).toEqual([]);
	});

	it('ranks the sources by what they lack, fewest first, then by id', async () => {
		const { guarantees } = build(entries, declared);
		await guarantees.refresh();

		expect(guarantees.shortfalls(['fs=confined', 'net=filtered'])).toEqual([
			{ sourceId: 'b', missing: [] },
			{ sourceId: 'a', missing: ['net=filtered'] },
			{ sourceId: 'c', missing: ['fs=confined', 'net=filtered'] },
		]);
	});
});
