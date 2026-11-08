import { describe, expect, it } from 'vitest';

import { WorkspaceKindList } from './WorkspaceKindList.js';

describe('WorkspaceKindList.normalise', () => {
	it('is undefined (no restriction) when nothing is declared', () => {
		expect(WorkspaceKindList.normalise(undefined, 'Plugin x: manifest workspaces')).toBeUndefined();
	});

	it('returns the kinds sorted, each once', () => {
		expect(WorkspaceKindList.normalise(['pool', 'in-place', 'pool'], 'where')).toEqual(['in-place', 'pool']);
	});

	it('refuses an unknown kind, naming it, the place, and every known kind', () => {
		expect(() => WorkspaceKindList.normalise(['poool'], 'Plugin x: manifest workspaces')).toThrow(
			/Plugin x: manifest workspaces.*"poool".*in-place, pool, readonly, worktree/s
		);
	});

	it('refuses what is not a list of strings, with the fix', () => {
		expect(() => WorkspaceKindList.normalise('pool', 'where')).toThrow(
			/where.*must be a list.*workspaces: \["pool"\]/s
		);
		expect(() => WorkspaceKindList.normalise([1], 'where')).toThrow(/where.*only strings/s);
	});

	it('refuses an empty list: it would accept no workspace at all, which is never meant', () => {
		expect(() => WorkspaceKindList.normalise([], 'where')).toThrow(/where.*empty.*remove/s);
	});
});
