import { describe, expect, it } from 'vitest';

import { parseTimeout } from './RunArgumentParser';

describe('parseTimeout', () => {
	it.each([
		['5000ms', 5000],
		['30s', 30_000],
		['30', 30_000],
		['10m', 600_000],
		['1h', 3_600_000],
	])('parses %s', (value, expected) => {
		expect(parseTimeout(value)).toBe(expected);
	});

	it('rejects an invalid value with the accepted formats', () => {
		expect(() => parseTimeout('soon')).toThrow('Invalid timeout: soon. Use e.g. 10m, 30s, 5000ms');
	});
});
