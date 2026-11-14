import { describe, expect, it } from 'vitest';

import { NearestName } from './NearestName';

describe('NearestName.of', () => {
	it.each([
		['commnad', ['command', 'cwd', 'env'], 'command'],
		['idd', ['id', 'status'], 'id'],
		['raed', ['read', 'write'], 'read'],
		['strin', ['enum', 'string', 'integer', 'boolean'], 'string'],
		['pattern', ['pattern', 'patern'], 'patern'],
	])('suggests %s -> %s', (name, candidates, expected) => {
		expect(NearestName.of(name, candidates)).toBe(expected);
	});

	it.each([
		['nothing close', 'zzzzzz', ['command', 'cwd']],
		['no candidates', 'id', []],
		['a short name two edits away', 'ab', ['xyz']],
	])('returns undefined for %s', (_label, name, candidates) => {
		expect(NearestName.of(name, candidates)).toBeUndefined();
	});

	it('never suggests the name itself', () => {
		expect(NearestName.of('id', ['id'])).toBeUndefined();
	});
});
