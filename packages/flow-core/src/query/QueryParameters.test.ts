import { describe, expect, it } from 'vitest';

import { InvalidQueryError } from '../errors.js';
import { optionalInteger, optionalString, readPageOffset } from './QueryParameters.js';

describe('optionalString', () => {
	it('returns undefined for an absent or empty value (the DSL sends empty strings for unset filters)', () => {
		expect(optionalString({}, 'flow')).toBeUndefined();
		expect(optionalString({ flow: '' }, 'flow')).toBeUndefined();
	});

	it('returns the value', () => {
		expect(optionalString({ flow: 'deploy' }, 'flow')).toBe('deploy');
	});

	it('refuses a repeated parameter and names it with the count', () => {
		expect(() => optionalString({ flow: ['a', 'b'] }, 'flow')).toThrow(InvalidQueryError);
		expect(() => optionalString({ flow: ['a', 'b'] }, 'flow')).toThrow("'flow' must be given once, got 2 values");
	});
});

describe('optionalInteger', () => {
	const bounds = { min: 1, max: 500 };

	it('returns undefined for an absent or empty value', () => {
		expect(optionalInteger({}, 'limit', bounds)).toBeUndefined();
		expect(optionalInteger({ limit: '' }, 'limit', bounds)).toBeUndefined();
	});

	it('parses digits, leading zeros included', () => {
		expect(optionalInteger({ limit: '25' }, 'limit', bounds)).toBe(25);
		expect(optionalInteger({ limit: '05' }, 'limit', bounds)).toBe(5);
	});

	it.each(['abc', '1e3', '1.5', '-1', '+3', ' 3', '0x10'])(
		'rejects %j, quoting the value and the accepted range',
		value => {
			expect(() => optionalInteger({ limit: value }, 'limit', bounds)).toThrow(
				`'limit' must be an integer between 1 and 500, got '${value}'.`
			);
		}
	);

	it('rejects values outside the bounds', () => {
		expect(() => optionalInteger({ limit: '0' }, 'limit', bounds)).toThrow(InvalidQueryError);
		expect(() => optionalInteger({ limit: '501' }, 'limit', bounds)).toThrow(InvalidQueryError);
	});

	it('words an unbounded maximum as ">= min"', () => {
		expect(() => optionalInteger({ offset: 'x' }, 'offset', { min: 0 })).toThrow(
			"'offset' must be an integer >= 0, got 'x'."
		);
	});

	it('rejects a repeated parameter', () => {
		expect(() => optionalInteger({ limit: ['1', '2'] }, 'limit', bounds)).toThrow("'limit' must be given once");
	});

	it('rejects digits beyond the safe integer range', () => {
		expect(() => optionalInteger({ offset: '99999999999999999999' }, 'offset', { min: 0 })).toThrow(
			InvalidQueryError
		);
	});
});

describe('readPageOffset', () => {
	it('is undefined without page or offset, and passes an offset through', () => {
		expect(readPageOffset({}, 20)).toBeUndefined();
		expect(readPageOffset({ offset: '7' }, 20)).toBe(7);
	});

	it('turns a zero-based page into an offset with the page size', () => {
		expect(readPageOffset({ page: '0' }, 20)).toBe(0);
		expect(readPageOffset({ page: '3' }, 20)).toBe(60);
	});

	it('refuses page together with offset, and a page that overflows', () => {
		expect(() => readPageOffset({ page: '1', offset: '2' }, 20)).toThrow(/cannot be combined/);
		expect(() => readPageOffset({ page: '9007199254740990' }, 20)).toThrow(/too large/);
	});
});
