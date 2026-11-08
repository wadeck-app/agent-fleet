import { describe, expect, it } from 'vitest';

import { WorkspaceOptionsReader } from './WorkspaceOptionsReader';

describe('WorkspaceOptionsReader', () => {
	const reader = new WorkspaceOptionsReader('pool', ['dir', 'count']);

	it('returns the options when all are accepted', () => {
		expect(reader.read({ dir: 'x', count: 2 })).toEqual({ dir: 'x', count: 2 });
	});

	it('accepts no options at all', () => {
		expect(reader.read(undefined)).toEqual({});
		expect(reader.read({})).toEqual({});
	});

	it('refuses an unknown option naming the provider and what is accepted', () => {
		expect(() => reader.read({ dir: 'x', cuont: 2 })).toThrow(
			/workspace provider "pool".*unknown option "cuont".*Accepted options: dir, count/s
		);
	});

	it('refuses options that are not an object', () => {
		expect(() => reader.read('x')).toThrow(/workspace provider "pool".*options must be an object/s);
		expect(() => reader.read(['x'])).toThrow(/options must be an object/);
	});

	it('says there are no options when the provider accepts none', () => {
		expect(() => new WorkspaceOptionsReader('x', []).read({ a: 1 })).toThrow(/accepts no options/);
	});

	describe('typed getters', () => {
		it('reads a positive integer', () => {
			expect(WorkspaceOptionsReader.positiveInteger('pool', 'count', 3)).toBe(3);
			expect(WorkspaceOptionsReader.positiveInteger('pool', 'count', undefined)).toBeUndefined();
		});

		it.each([0, -1, 1.5, '3', null])('refuses %j as a positive integer', value => {
			expect(() => WorkspaceOptionsReader.positiveInteger('pool', 'count', value)).toThrow(
				/"count" must be a positive integer/
			);
		});

		it('reads a boolean', () => {
			expect(WorkspaceOptionsReader.boolean('pool', 'requireClean', true)).toBe(true);
			expect(WorkspaceOptionsReader.boolean('pool', 'requireClean', undefined)).toBe(false);
			expect(() => WorkspaceOptionsReader.boolean('pool', 'requireClean', 'yes')).toThrow(
				/must be true or false/
			);
		});

		it('reads a non-empty string', () => {
			expect(WorkspaceOptionsReader.string('pool', 'prefix', 'p-')).toBe('p-');
			expect(WorkspaceOptionsReader.string('pool', 'prefix', undefined)).toBeUndefined();
			expect(() => WorkspaceOptionsReader.string('pool', 'prefix', '')).toThrow(
				/"prefix" must be a non-empty string/
			);
		});
	});
});
