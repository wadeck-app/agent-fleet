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

describe('DeclaredGuarantees.guaranteesOf', () => {
	it('gives the sorted manifest declaration of one source, empty for a plugin that declares none', async () => {
		const { guarantees } = build([source('sbx', 'p.x'), source('plain', 'q.y')], {
			sbx: ['fs=confined', 'env=clean'],
			plain: [],
		});
		await guarantees.refresh();

		expect(guarantees.guaranteesOf('sbx')).toEqual(['env=clean', 'fs=confined']);
		expect(guarantees.guaranteesOf('plain')).toEqual([]);
	});

	it('is undefined for a source that is not a plugin source, not declared, not read yet or unreadable (never an empty list that looks like "nothing")', async () => {
		const { guarantees } = build([source('host'), source('broken', 'p.x'), source('later', 'q.y')], {
			broken: new Error('cannot read'),
		});
		expect(guarantees.guaranteesOf('later')).toBeUndefined();
		await guarantees.refresh();

		expect(guarantees.guaranteesOf('host')).toBeUndefined();
		expect(guarantees.guaranteesOf('broken')).toBeUndefined();
		expect(guarantees.guaranteesOf('nobody')).toBeUndefined();
	});
});

describe('DeclaredGuarantees - which covering sources serve a project', () => {
	const AGENT = ['env=clean', 'fs=confined'];

	function withProjects(sourceId: string, projects: unknown): WorkerSourceEntry {
		return {
			...source(sourceId, 'p.x'),
			...(projects === undefined ? {} : { options: { projects } }),
		} as WorkerSourceEntry;
	}

	async function ready(entries: WorkerSourceEntry[], declared: Record<string, string[]>) {
		const { guarantees } = build(entries, declared);
		await guarantees.refresh();
		return guarantees;
	}

	it('a source whose projects option lists the project serves it', async () => {
		const guarantees = await ready([withProjects('sbx', 'test-tasks,other')], { sbx: AGENT });

		expect(guarantees.providersOfAllForProject(AGENT, 'test-tasks')).toEqual({ serving: ['sbx'], elsewhere: [] });
	});

	it('a source whose projects option lists other projects serves elsewhere only, and is named as such', async () => {
		const guarantees = await ready([withProjects('sbx', 'test-tasks')], { sbx: AGENT });

		expect(guarantees.providersOfAllForProject(AGENT, 'test-flow')).toEqual({ serving: [], elsewhere: ['sbx'] });
	});

	it('a source with no projects option serves every project', async () => {
		const guarantees = await ready([withProjects('sbx', undefined)], { sbx: AGENT });

		expect(guarantees.providersOfAllForProject(AGENT, 'anything')).toEqual({ serving: ['sbx'], elsewhere: [] });
	});

	it('reads the projects option as a list of strings too', async () => {
		const guarantees = await ready([withProjects('sbx', ['a', 'b'])], { sbx: AGENT });

		expect(guarantees.providersOfAllForProject(AGENT, 'b').serving).toEqual(['sbx']);
		expect(guarantees.providersOfAllForProject(AGENT, 'c').serving).toEqual([]);
	});

	it('a projects option of another shape serves no project (fail closed)', async () => {
		const guarantees = await ready([withProjects('sbx', 42)], { sbx: AGENT });

		expect(guarantees.providersOfAllForProject(AGENT, 'a')).toEqual({ serving: [], elsewhere: ['sbx'] });
	});

	it('only the sources that guarantee the whole set are listed', async () => {
		const guarantees = await ready([withProjects('half', 'a'), withProjects('full', 'b')], {
			half: ['fs=confined'],
			full: AGENT,
		});

		expect(guarantees.providersOfAllForProject(AGENT, 'a')).toEqual({ serving: [], elsewhere: ['full'] });
	});

	it('a mixed machine: the unrestricted and the matching sources serve, the others are elsewhere', async () => {
		const guarantees = await ready(
			[withProjects('all', undefined), withProjects('mine', 'a'), withProjects('theirs', 'b')],
			{ all: AGENT, mine: AGENT, theirs: AGENT }
		);

		expect(guarantees.providersOfAllForProject(AGENT, 'a')).toEqual({ serving: ['all', 'mine'], elsewhere: ['theirs'] });
	});

	describe('a run without a project id', () => {
		it('is served by a covering source when no source on the machine restricts its projects', async () => {
			const guarantees = await ready([withProjects('sbx', undefined)], { sbx: AGENT });

			expect(guarantees.providersOfAllForProject(AGENT, undefined)).toEqual({ serving: ['sbx'], elsewhere: [] });
		});

		it('is served by none as soon as one source declares a projects restriction, whichever it is', async () => {
			const guarantees = await ready([withProjects('all', undefined), withProjects('other', 'b')], {
				all: AGENT,
				other: [],
			});

			expect(guarantees.providersOfAllForProject(AGENT, undefined)).toEqual({ serving: [], elsewhere: ['all'] });
		});
	});
});
