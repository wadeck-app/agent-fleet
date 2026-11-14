import { describe, expect, it } from 'vitest';

import { NO_IDLE_STOP_ENV, resolveIdleStopDisabled } from './resolveIdleStopDisabled.js';

describe('resolveIdleStopDisabled', () => {
	it('is false when the variable is unset or empty, so the idle stop applies', () => {
		expect(resolveIdleStopDisabled({})).toBe(false);
		expect(resolveIdleStopDisabled({ [NO_IDLE_STOP_ENV]: '' })).toBe(false);
	});

	it('is true for "1"', () => {
		expect(resolveIdleStopDisabled({ [NO_IDLE_STOP_ENV]: '1' })).toBe(true);
	});

	it.each(['0', 'true', 'yes', ' 1', '1 ', '2'])('refuses %j and names the variable and the accepted values', value => {
		expect(() => resolveIdleStopDisabled({ [NO_IDLE_STOP_ENV]: value })).toThrow(
			new RegExp(`${NO_IDLE_STOP_ENV}.*"1".*unset`)
		);
	});
});
