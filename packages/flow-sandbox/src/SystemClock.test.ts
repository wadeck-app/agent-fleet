import { describe, expect, it } from 'vitest';

import { SystemClock } from './SystemClock';

describe('SystemClock', () => {
	it('reports epoch milliseconds between two readings of Date.now()', () => {
		const before = Date.now();
		const reading = new SystemClock().now();
		const after = Date.now();

		expect(reading).toBeGreaterThanOrEqual(before);
		expect(reading).toBeLessThanOrEqual(after);
	});
});
