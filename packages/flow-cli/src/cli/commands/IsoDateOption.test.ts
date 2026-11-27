import { describe, expect, it } from 'vitest';

import { IsoDateOption } from './IsoDateOption';

describe('IsoDateOption', () => {
	it('reads a date as UTC midnight and a datetime without offset as UTC', () => {
		expect(IsoDateOption.parse('2026-11-01', '--before')).toBe(Date.UTC(2026, 10, 1));
		expect(IsoDateOption.parse('2026-11-01T08:30:00', '--before')).toBe(Date.UTC(2026, 10, 1, 8, 30));
		expect(IsoDateOption.parse('2026-11-01T08:30:00+02:00', '--before')).toBe(Date.UTC(2026, 10, 1, 6, 30));
	});

	it('names the option and an example in the error', () => {
		expect(() => IsoDateOption.parse('soon', '--before')).toThrow(/Invalid --before "soon".*--before 2026-11-01/);
		expect(() => IsoDateOption.parse('2026-02-31', '--before')).toThrow(/Invalid --before/);
		expect(() => IsoDateOption.parse('2026-13-45T99:00', '--before')).toThrow(/Invalid --before/);
	});
});
