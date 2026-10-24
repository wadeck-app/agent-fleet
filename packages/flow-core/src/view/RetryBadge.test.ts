import { describe, expect, it } from 'vitest';

import { MAX_COUNTED_RETRIES, NO_RETRY_LEFT, RETRY_BADGE_VARIANTS, retryLabel, retryPoliciesOf } from './RetryBadge.js';

describe('retryPoliciesOf', () => {
	it('reads the retry budget and the failure loop budget of each step', () => {
		const policies = retryPoliciesOf({
			steps: [
				{ id: 'plain' },
				{ id: 'retried', retry: { maxAttempts: 2 } },
				{ id: 'looped', onFailure: { goto: 'plain', maxIterations: 4 } },
				{ id: 'defaultLoop', onFailure: { goto: 'plain' } },
				{ id: 'both', retry: { maxAttempts: 1 }, onFailure: { goto: 'plain', maxIterations: 2 } },
			],
		} as never);
		expect(policies).toEqual({
			plain: { retryBudget: 0 },
			retried: { retryBudget: 2 },
			looped: { retryBudget: 4 },
			defaultLoop: { retryBudget: 3 },
			both: { retryBudget: 3 },
		});
	});

	it('ignores an onFailure without goto', () => {
		const policies = retryPoliciesOf({ steps: [{ id: 'a', onFailure: { maxIterations: 9 } }] } as never);
		expect(policies['a']).toEqual({ retryBudget: 0 });
	});
});

describe('retryLabel', () => {
	const policies = { a: { retryBudget: 2 }, none: { retryBudget: 0 } };

	it('counts the retries as attempts - 1, 0 included', () => {
		expect(retryLabel({ status: 'completed', attempts: 1 }, policies['a'])).toBe('0 retry');
		expect(retryLabel({ status: 'completed', attempts: 2 }, policies['a'])).toBe('1 retry');
		expect(retryLabel({ status: 'completed', attempts: 3 }, policies['a'])).toBe('2 retries');
	});

	it('groups the counts above the bound', () => {
		expect(MAX_COUNTED_RETRIES).toBe(3);
		expect(retryLabel({ status: 'completed', attempts: 4 }, undefined)).toBe('3+ retries');
		expect(retryLabel({ status: 'completed', attempts: 40 }, undefined)).toBe('3+ retries');
	});

	it('says no retry left for a failed step that used its whole budget', () => {
		expect(retryLabel({ status: 'failed', attempts: 3 }, policies['a'])).toBe(NO_RETRY_LEFT);
		expect(retryLabel({ status: 'failed', attempts: 7 }, policies['a'])).toBe(NO_RETRY_LEFT);
	});

	it('says no retry left for a failed step that has no retry at all', () => {
		expect(retryLabel({ status: 'failed', attempts: 1 }, policies['none'])).toBe(NO_RETRY_LEFT);
	});

	it('keeps the count for a failed step that still had budget', () => {
		expect(retryLabel({ status: 'failed', attempts: 2 }, policies['a'])).toBe('1 retry');
	});

	it('does not claim exhaustion when the policy is unknown', () => {
		expect(retryLabel({ status: 'failed', attempts: 4 }, undefined)).toBe('retry policy unknown');
	});

	it('does not claim a count when the record has no attempts', () => {
		expect(retryLabel({ status: 'completed' }, policies['a'])).toBe('retries unknown');
		expect(retryLabel({ status: 'failed' }, policies['a'])).toBe('retries unknown');
	});

	it('shows a dash for a step that has not started', () => {
		expect(retryLabel({ status: 'pending' }, policies['a'])).toBe('-');
	});
});

describe('RETRY_BADGE_VARIANTS', () => {
	it('colours every counted text: green at 0, orange above, red when nothing is left', () => {
		expect(RETRY_BADGE_VARIANTS['0 retry']).toBe('success');
		expect(RETRY_BADGE_VARIANTS['1 retry']).toBe('warning');
		expect(RETRY_BADGE_VARIANTS['2 retries']).toBe('warning');
		expect(RETRY_BADGE_VARIANTS['3+ retries']).toBe('warning');
		expect(RETRY_BADGE_VARIANTS[NO_RETRY_LEFT]).toBe('danger');
	});

	it('covers every text retryLabel can return with a counted or terminal meaning', () => {
		const texts = new Set([1, 2, 3, 4].map(attempts => retryLabel({ status: 'completed', attempts }, undefined)));
		texts.add(retryLabel({ status: 'failed', attempts: 1 }, { retryBudget: 0 }));
		for (const text of texts) {
			expect(Object.keys(RETRY_BADGE_VARIANTS)).toContain(text);
		}
	});
});
