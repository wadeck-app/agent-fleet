import { describe, expect, it } from 'vitest';

import { isRecord } from './isRecord';

describe('isRecord', () => {
	it('accepts plain objects', () => {
		expect(isRecord({})).toBe(true);
		expect(isRecord({ a: 1 })).toBe(true);
	});

	it('rejects arrays, null and primitives', () => {
		expect(isRecord([])).toBe(false);
		expect(isRecord(null)).toBe(false);
		expect(isRecord(undefined)).toBe(false);
		expect(isRecord('text')).toBe(false);
		expect(isRecord(42)).toBe(false);
	});
});
