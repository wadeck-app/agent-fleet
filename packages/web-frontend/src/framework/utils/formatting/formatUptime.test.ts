import { describe, expect, it } from 'vitest';

import { formatUptime } from './formatUptime';

describe('formatUptime', () => {
	it('should format uptime with hours and minutes', () => {
		// 1h 30m = 5400000ms
		expect(formatUptime(5400000)).toBe('1h 30m');
	});

	it('should format uptime with only minutes when less than 1 hour', () => {
		// 45m = 2700000ms
		expect(formatUptime(2700000)).toBe('45m');
	});

	it('should format uptime with hours and zero minutes', () => {
		// 2h 0m = 7200000ms
		expect(formatUptime(7200000)).toBe('2h 0m');
	});

	it('should format uptime with hours and minutes', () => {
		// 2h 5m = 7500000ms
		expect(formatUptime(7500000)).toBe('2h 5m');
	});

	it('should format zero uptime', () => {
		expect(formatUptime(0)).toBe('0m');
	});

	it('should handle large uptime values', () => {
		// 24h = 86400000ms
		expect(formatUptime(86400000)).toBe('24h 0m');
	});

	it('should floor fractional minutes', () => {
		// 1m 30s = 90000ms should be "1m" not "1.5m"
		expect(formatUptime(90000)).toBe('1m');
	});
});
