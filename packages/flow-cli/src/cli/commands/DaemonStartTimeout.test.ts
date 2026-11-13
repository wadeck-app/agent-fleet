import { describe, expect, it } from 'vitest';

import { DAEMON_START_CAP_DEFAULT_MS, DAEMON_START_TIMEOUT_ENV, resolveDaemonStartCapMs } from './DaemonStartTimeout';

describe('resolveDaemonStartCapMs', () => {
	it('defaults to 60 s when the variable is not set', () => {
		expect(resolveDaemonStartCapMs({})).toBe(60_000);
		expect(DAEMON_START_CAP_DEFAULT_MS).toBe(60_000);
	});

	it('treats an empty value as not set', () => {
		expect(resolveDaemonStartCapMs({ [DAEMON_START_TIMEOUT_ENV]: '' })).toBe(60_000);
	});

	it('reads a positive integer number of milliseconds', () => {
		expect(resolveDaemonStartCapMs({ [DAEMON_START_TIMEOUT_ENV]: '120000' })).toBe(120_000);
	});

	it.each(['abc', '12s', '1.5', '0', '-5', ' '])('refuses %j, naming the variable and the value', value => {
		expect(() => resolveDaemonStartCapMs({ [DAEMON_START_TIMEOUT_ENV]: value })).toThrow(
			new RegExp(`${DAEMON_START_TIMEOUT_ENV}.*${JSON.stringify(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
		);
	});

	it('says what a valid value looks like', () => {
		expect(() => resolveDaemonStartCapMs({ [DAEMON_START_TIMEOUT_ENV]: 'soon' })).toThrow(
			/positive whole number of milliseconds/
		);
	});
});
