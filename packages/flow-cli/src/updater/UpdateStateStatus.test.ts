import type { UpdateState } from '@wadeck-app/shared-updater';
import { describe, expect, it } from 'vitest';

import { describeUpdateState } from './UpdateStateStatus';

const BASE: UpdateState = { status: 'success', currentVersion: '1', timestamp: 1_000_000 };

describe('describeUpdateState', () => {
	it('reports a success with the target version', () => {
		expect(describeUpdateState({ ...BASE, status: 'success', targetVersion: '2' })).toBe('updated to 2');
	});

	it('reports a deferral with the retry delay, singular and plural', () => {
		expect(describeUpdateState({ ...BASE, status: 'deferred', retryAt: 1_000_000 + 60_000 })).toContain(
			'in 1 minute'
		);
		expect(describeUpdateState({ ...BASE, status: 'deferred', retryAt: 1_000_000 + 300_000 })).toContain(
			'in 5 minutes'
		);
	});

	it('reports a failure with its error', () => {
		expect(describeUpdateState({ ...BASE, status: 'failed', error: 'boom' })).toBe('update failed -- boom');
	});

	it('reports a rollback with the restored version', () => {
		expect(describeUpdateState({ ...BASE, status: 'rolled-back', previousVersion: '0' })).toContain(
			'rolled back to 0'
		);
	});

	// shared-updater >= 2026.10.25-020: the journal written before `npm install -g`. A run that ends on it
	// could not repair the interrupted install; this must be an actionable message, not an exception.
	it('reports an unrepaired interrupted install with the pid and the command to retry', () => {
		const message = describeUpdateState({
			...BASE,
			status: 'applying',
			pid: 4242,
			previousVersion: '0',
			targetVersion: '2',
		});
		expect(message).toContain('interrupted');
		expect(message).toContain('4242');
		expect(message).toContain('flow cli update');
	});

	it('fails fast on a status it does not know', () => {
		// violations-suppress: ts/no-unsafe-type-cast deliberately feeds a status the type does not allow
		const unknown = { ...BASE, status: 'bogus' } as unknown as UpdateState;
		expect(() => describeUpdateState(unknown)).toThrow('unrecognized state status: bogus');
	});
});
