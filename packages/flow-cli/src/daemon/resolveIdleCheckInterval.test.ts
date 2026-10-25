import { describe, expect, it } from 'vitest';

import { IDLE_CHECK_INTERVAL_ENV, resolveIdleCheckInterval } from './resolveIdleCheckInterval.js';

describe('resolveIdleCheckInterval', () => {
	it('is undefined when the variable is unset or empty, so the default applies', () => {
		expect(resolveIdleCheckInterval({})).toBeUndefined();
		expect(resolveIdleCheckInterval({ [IDLE_CHECK_INTERVAL_ENV]: '' })).toBeUndefined();
	});

	it('reads a positive whole number of milliseconds', () => {
		expect(resolveIdleCheckInterval({ [IDLE_CHECK_INTERVAL_ENV]: '250' })).toBe(250);
	});

	it.each(['0', '-5', '1.5', 'soon', '10s', '9999999999'])('refuses %j and names the variable', value => {
		expect(() => resolveIdleCheckInterval({ [IDLE_CHECK_INTERVAL_ENV]: value })).toThrow(IDLE_CHECK_INTERVAL_ENV);
	});
});
