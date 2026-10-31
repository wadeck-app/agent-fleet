import { assertValidStartDaemonOptions } from './StartDaemonOptions.js';

describe('assertValidStartDaemonOptions', () => {
	it('accepts options without an interval and a positive one', () => {
		expect(() => assertValidStartDaemonOptions({})).not.toThrow();
		expect(() => assertValidStartDaemonOptions({ idleCheckIntervalMs: 50 })).not.toThrow();
	});

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
		'refuses %s, which would silently mean never check',
		value => {
			expect(() => assertValidStartDaemonOptions({ idleCheckIntervalMs: value })).toThrow(
				/idleCheckIntervalMs must be a positive number of milliseconds/
			);
		}
	);
});
