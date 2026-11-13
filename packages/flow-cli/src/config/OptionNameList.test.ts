import { describe, expect, it } from 'vitest';

import { OptionNameList } from './OptionNameList.js';

describe('OptionNameList.normalise', () => {
	it('is undefined when nothing is declared (no check)', () => {
		expect(OptionNameList.normalise(undefined, 'where')).toBeUndefined();
	});

	it('returns the names sorted, each once', () => {
		expect(OptionNameList.normalise(['projects', 'image', 'projects'], 'where')).toEqual(['image', 'projects']);
	});

	it('accepts an empty list: the implementation takes no option', () => {
		expect(OptionNameList.normalise([], 'where')).toEqual([]);
	});

	it('refuses something that is not a list, naming the place and the fix', () => {
		expect(() => OptionNameList.normalise('projects', 'Plugin x: manifest options')).toThrow(
			/Plugin x: manifest options must be a list.*options: \["projects"\]/s
		);
	});

	it('refuses an entry that is not a non-empty string without surrounding space or "="', () => {
		for (const bad of [3, '', ' projects', 'projects=a']) {
			expect(() => OptionNameList.normalise(['image', bad], 'Plugin x: manifest options')).toThrow(
				/Plugin x: manifest options.*option name/s
			);
		}
	});
});
