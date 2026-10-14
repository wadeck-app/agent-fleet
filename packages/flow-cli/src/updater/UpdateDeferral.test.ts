import { describe, expect, it } from 'vitest';

import { UPDATE_RETRY_MS, decideUpdate } from './UpdateDeferral';

describe('decideUpdate', () => {
	it('applies now when the daemon is unreachable (nothing to disrupt)', () => {
		expect(decideUpdate(null)).toBe('apply-now');
	});

	it('applies now when the daemon has no work in flight, even with idle workers connected', () => {
		expect(decideUpdate({ status: 'ok', work_in_flight: false, draining: false })).toBe('apply-now');
	});

	it('defers while work is in flight', () => {
		expect(decideUpdate({ status: 'ok', work_in_flight: true, draining: false })).toEqual({
			defer: true,
			retryIn: UPDATE_RETRY_MS,
		});
	});

	it('defers, rather than guessing, when the daemon health predates work_in_flight', () => {
		expect(decideUpdate({ status: 'ok', running_executions: 3 })).toEqual({
			defer: true,
			retryIn: UPDATE_RETRY_MS,
		});
	});
});
