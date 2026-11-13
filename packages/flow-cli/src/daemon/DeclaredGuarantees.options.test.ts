import { describe, expect, it } from 'vitest';

import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

function source(sourceId: string, options?: Record<string, unknown>): WorkerSourceEntry {
	return {
		sourceId,
		provider: 'x',
		labels: [],
		maxWorkers: 1,
		plugin: `${sourceId}.impl`,
		pluginsDir: '/plugins',
		...(options === undefined ? {} : { options }),
		tokenHash: 'h',
		createdAt: '2026-11-14T00:00:00.000Z',
	} as WorkerSourceEntry;
}

function build(entries: WorkerSourceEntry[], accepted: string[] | undefined | Error, withReader = true) {
	const logged: string[] = [];
	let current = entries;
	const declared = new DeclaredGuarantees(
		{ list: () => current },
		{
			declaredGuarantees: async () => ['sandbox'],
			...(withReader
				? {
						declaredOptions: async () => {
							if (accepted instanceof Error) throw accepted;
							return accepted;
						},
					}
				: {}),
		},
		message => logged.push(message)
	);
	return {
		declared,
		logged,
		replace: (next: WorkerSourceEntry[]) => {
			current = next;
		},
	};
}

describe('DeclaredGuarantees - option names', () => {
	it('warns once, with the nearest option and the fix, about a stored option the manifest does not declare', async () => {
		const { declared, logged } = build([source('sbx', { project: 'a' })], ['image', 'projects']);

		await declared.refresh();
		await declared.refresh();

		expect(logged).toHaveLength(1);
		expect(logged[0]).toContain('worker source "sbx"');
		expect(logged[0]).toContain('option "project"');
		expect(logged[0]).toContain('Did you mean "projects"?');
		expect(logged[0]).toContain('Accepted options: image, projects.');
		expect(logged[0]).toMatch(/flow worker source remove sbx/);
	});

	it('does not change the answers: the source is still read as unrestricted', async () => {
		const { declared } = build([source('sbx', { project: 'a' })], ['image', 'projects']);
		await declared.refresh();

		expect(declared.providersOfAllForProject(['sandbox'], 'other')).toEqual({ serving: ['sbx'], elsewhere: [] });
	});

	it('says nothing when every stored option is declared', async () => {
		const { declared, logged } = build([source('sbx', { projects: 'a', image: 'x' })], ['image', 'projects']);
		await declared.refresh();

		expect(logged).toEqual([]);
	});

	it('says nothing, and checks nothing, when the manifest declares no options (older plugins)', async () => {
		const { declared, logged } = build([source('sbx', { whatever: 'a' })], undefined);
		await declared.refresh();

		expect(logged).toEqual([]);
		expect(declared.unknownOptionsOf('sbx')).toEqual([]);
	});

	it('says nothing for a reader without option support', async () => {
		const { declared, logged } = build([source('sbx', { project: 'a' })], ['projects'], false);
		await declared.refresh();

		expect(logged).toEqual([]);
	});

	it('exposes the unknown names of a source for the listing', async () => {
		const { declared } = build([source('sbx', { project: 'a', image: 'x' })], ['image', 'projects']);
		await declared.refresh();

		expect(declared.unknownOptionsOf('sbx')).toEqual([{ name: 'project', near: ['projects'] }]);
	});

	it('warns again when the source is declared again with other option names', async () => {
		const { declared, logged, replace } = build([source('sbx', { project: 'a' })], ['projects']);
		await declared.refresh();
		replace([source('sbx', { projekt: 'a' })]);
		await declared.refresh();

		expect(logged).toHaveLength(2);
		expect(logged[1]).toContain('"projekt"');
	});

	it('treats a source whose option declaration cannot be read as unread, with the message logged', async () => {
		const { declared, logged } = build([source('sbx')], new Error('bad option name'));
		await declared.refresh();

		expect(declared.unread()).toEqual(['sbx']);
		expect(logged.join('\n')).toContain('bad option name');
	});
});

describe('DeclaredGuarantees - projectsOf', () => {
	it('lists the projects a source declares, undefined when it declares none', async () => {
		const { declared } = build(
			[source('a', { projects: 'p1,p2' }), source('b'), source('c', { projects: ['p3'] })],
			undefined
		);

		expect([declared.projectsOf('a'), declared.projectsOf('b'), declared.projectsOf('c')]).toEqual([
			['p1', 'p2'],
			undefined,
			['p3'],
		]);
	});
});
