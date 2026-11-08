import { describe, expect, it } from 'vitest';

import {
	buildWorkspaceDeclaration,
	changeWorkspaceProvider,
	getProviderOptionKeys,
	isCountInRange,
	parseCount,
	readWorkspaceDeclaration,
	setWorkspaceOption,
} from './workspaceDeclaration';

describe('readWorkspaceDeclaration', () => {
	it('reads the string form', () => {
		expect(readWorkspaceDeclaration('worktree')).toEqual({ provider: 'worktree', options: {}, unsupported: null });
	});

	it('reads the object form', () => {
		expect(readWorkspaceDeclaration({ provider: 'pool', dir: 'pools', count: 3 })).toEqual({
			provider: 'pool',
			options: { dir: 'pools', count: 3 },
			unsupported: null,
		});
	});

	it('flags the legacy block', () => {
		const result = readWorkspaceDeclaration({ mode: 'isolated', gitStrategy: 'any' });
		expect(result.provider).toBeNull();
		expect(result.unsupported).toBe('legacy block');
	});

	it('flags an unknown provider in string and object forms', () => {
		expect(readWorkspaceDeclaration('my-instance').unsupported).toBe('my-instance');
		expect(readWorkspaceDeclaration({ provider: 'my-instance', x: 1 })).toEqual({
			provider: 'my-instance',
			options: { x: 1 },
			unsupported: 'my-instance',
		});
	});
});

describe('buildWorkspaceDeclaration', () => {
	it('stores the plain string without options', () => {
		expect(buildWorkspaceDeclaration('in-place', {})).toBe('in-place');
	});

	it('stores the object form once an option has a value', () => {
		expect(buildWorkspaceDeclaration('worktree', { baseDir: '.wt' })).toEqual({
			provider: 'worktree',
			baseDir: '.wt',
		});
	});

	it('removes empty options and falls back to the string form', () => {
		expect(buildWorkspaceDeclaration('pool', { dir: '', prefix: '  ', count: undefined })).toBe('pool');
		expect(buildWorkspaceDeclaration('pool', { dir: '', prefix: 'p-' })).toEqual({
			provider: 'pool',
			prefix: 'p-',
		});
	});
});

describe('parseCount', () => {
	it('parses integers', () => {
		expect(parseCount('12')).toBe(12);
		expect(parseCount(' 5 ')).toBe(5);
	});

	it('returns undefined for empty or invalid text', () => {
		expect(parseCount('')).toBeUndefined();
		expect(parseCount('abc')).toBeUndefined();
		expect(parseCount('1.5')).toBeUndefined();
		expect(parseCount('-2')).toBeUndefined();
	});

	it('checks the 1-1000 range', () => {
		expect(isCountInRange(1)).toBe(true);
		expect(isCountInRange(1000)).toBe(true);
		expect(isCountInRange(0)).toBe(false);
		expect(isCountInRange(1001)).toBe(false);
	});
});

describe('changeWorkspaceProvider', () => {
	it('keeps only the options the new provider has', () => {
		expect(changeWorkspaceProvider({ provider: 'pool', dir: 'd', prefix: 'p', count: 2 }, 'worktree')).toEqual({
			provider: 'worktree',
			prefix: 'p',
		});
	});

	it('returns the plain string when nothing is kept', () => {
		expect(changeWorkspaceProvider({ mode: 'isolated' }, 'in-place')).toBe('in-place');
	});
});

describe('setWorkspaceOption', () => {
	it('upgrades the string form to the object form', () => {
		expect(setWorkspaceOption('worktree', 'baseDir', '.wt')).toEqual({ provider: 'worktree', baseDir: '.wt' });
	});

	it('removes the option when cleared and goes back to the string form', () => {
		expect(setWorkspaceOption({ provider: 'worktree', baseDir: '.wt' }, 'baseDir', '')).toBe('worktree');
	});

	it('parses count to a number and drops it when unparsable', () => {
		expect(setWorkspaceOption('pool', 'count', '4')).toEqual({ provider: 'pool', count: 4 });
		expect(setWorkspaceOption({ provider: 'pool', count: 4 }, 'count', 'x')).toBe('pool');
	});

	it('preserves options it does not edit', () => {
		expect(setWorkspaceOption({ provider: 'pool', extra: true }, 'dir', 'd')).toEqual({
			provider: 'pool',
			extra: true,
			dir: 'd',
		});
	});

	it('fails loudly on a legacy block', () => {
		expect(() => setWorkspaceOption({ mode: 'isolated' }, 'dir', 'x')).toThrow(/no provider/);
	});
});

describe('getProviderOptionKeys', () => {
	it('lists the editable options per provider', () => {
		expect(getProviderOptionKeys('worktree')).toEqual(['baseDir', 'prefix']);
		expect(getProviderOptionKeys('pool')).toEqual(['dir', 'prefix', 'count']);
		expect(getProviderOptionKeys('in-place')).toEqual(['dir']);
		expect(getProviderOptionKeys('readonly')).toEqual(['dir']);
		expect(getProviderOptionKeys('custom')).toEqual([]);
	});
});
