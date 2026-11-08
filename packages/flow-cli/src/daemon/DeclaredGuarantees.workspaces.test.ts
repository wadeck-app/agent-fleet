import { describe, expect, it } from 'vitest';

import { DeclaredGuarantees } from './DeclaredGuarantees.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

function source(sourceId: string): WorkerSourceEntry {
	return {
		sourceId,
		provider: 'x',
		labels: [],
		maxWorkers: 1,
		plugin: `${sourceId}.impl`,
		pluginsDir: '/plugins',
		tokenHash: 'h',
		createdAt: '2026-11-08T00:00:00.000Z',
	} as WorkerSourceEntry;
}

function build(workspaces: Record<string, string[] | undefined | Error>, withReader = true) {
	const logged: string[] = [];
	const declared = new DeclaredGuarantees(
		{ list: () => Object.keys(workspaces).map(source) },
		{
			declaredGuarantees: async () => ['sandbox'],
			...(withReader
				? {
						declaredWorkspaces: async (entry: WorkerSourceEntry) => {
							const value = workspaces[entry.sourceId];
							if (value instanceof Error) throw value;
							return value;
						},
					}
				: {}),
		},
		message => logged.push(message)
	);
	return { declared, logged };
}

describe('DeclaredGuarantees - workspace kinds', () => {
	it('answers from the static declaration once read, undefined meaning no restriction', async () => {
		const { declared } = build({ a: ['pool'], b: undefined });
		await declared.refresh();

		expect(declared.workspacesOf('a')).toEqual(['pool']);
		expect(declared.workspacesOf('b')).toBeUndefined();
	});

	it('accepts a kind when the source lists it or declares no restriction', async () => {
		const { declared } = build({ a: ['pool'], b: undefined });
		await declared.refresh();

		expect([
			declared.acceptsWorkspace('a', 'pool'),
			declared.acceptsWorkspace('a', 'in-place'),
			declared.acceptsWorkspace('b', 'in-place'),
		]).toEqual([true, false, true]);
	});

	it('refuses an unknown kind (undefined) from a restricted source only: fail closed', async () => {
		const { declared } = build({ a: ['pool'], b: undefined });
		await declared.refresh();

		expect([declared.acceptsWorkspace('a', undefined), declared.acceptsWorkspace('b', undefined)]).toEqual([
			false,
			true,
		]);
	});

	it('treats a source whose declaration is unreadable as unread, with the fix logged, and keeps its guarantees unread too', async () => {
		const { declared, logged } = build({ a: new Error('bad kind "poool"') });
		await declared.refresh();

		expect(declared.unread()).toEqual(['a']);
		expect(logged.join('\n')).toMatch(/bad kind "poool"/);
	});

	it('treats a reader without workspace support as no restriction', async () => {
		const { declared } = build({ a: ['pool'] }, false);
		await declared.refresh();

		expect(declared.workspacesOf('a')).toBeUndefined();
	});
});
