import { describe, expect, it } from 'vitest';

import { buildDaemonHealth } from './DaemonHealth';

describe('buildDaemonHealth', () => {
	it('reports work in flight when the daemon is not idle', () => {
		expect(buildDaemonHealth({ isIdle: () => false, isDraining: () => false })).toEqual({
			status: 'ok',
			work_in_flight: true,
			draining: false,
		});
	});

	it('reports no work in flight when idle, even with idle workers connected', () => {
		expect(buildDaemonHealth({ isIdle: () => true, isDraining: () => false }).work_in_flight).toBe(false);
	});

	it('reports draining', () => {
		expect(buildDaemonHealth({ isIdle: () => true, isDraining: () => true }).draining).toBe(true);
	});
});
