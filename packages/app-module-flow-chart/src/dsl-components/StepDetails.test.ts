import { describe, expect, it } from 'vitest';

import { describeStep } from './StepDetails.js';
import { node } from './testing/GraphFixtures.js';

describe('describeStep', () => {
	it('lists status, kind, duration and attempts first, in that order', () => {
		const { rows } = describeStep(
			node('build', { kind: 'script', status: 'completed', durationLabel: '12.3s', attempts: 2 })
		);
		expect(rows.map(r => r.label)).toEqual(['Status', 'Kind', 'Duration', 'Attempts']);
		expect(rows.map(r => r.value)).toEqual(['completed', 'script', '12.3s', '2']);
	});

	it('says "not run" for a node of a definition drawn without a run, and omits what is unknown', () => {
		const { rows } = describeStep(node('build'));
		expect(rows.map(r => `${r.label}=${r.value}`)).toEqual(['Status=not run', 'Kind=script']);
	});

	it('labels the known meta keys in plain words', () => {
		const { rows } = describeStep(
			node('ask', {
				kind: 'model',
				meta: {
					provider: 'claude',
					model: 'opus',
					workerId: 'w-1',
					when: 'steps.a.failed',
					onFailureGoto: 'a',
					costUsd: 0.5,
				},
			})
		);
		const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]));
		expect(byLabel).toMatchObject({
			Provider: 'claude',
			Model: 'opus',
			Worker: 'w-1',
			Condition: 'steps.a.failed',
			'On failure, goes back to': 'a',
			'Cost (USD)': '0.5',
		});
	});

	it('formats start and end times as dates and keeps an unparsable one as is', () => {
		const { rows } = describeStep(
			node('a', { meta: { startedAt: '2026-08-16T12:00:00.000Z', completedAt: 'soon' } })
		);
		const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]));
		expect(byLabel['Started']).toBe(new Date('2026-08-16T12:00:00.000Z').toLocaleString());
		expect(byLabel['Completed']).toBe('soon');
	});

	it('shows a meta key it does not know under its own name instead of dropping it', () => {
		const { rows } = describeStep(node('a', { meta: { futureField: 'x' } }));
		expect(rows).toContainEqual({ label: 'futureField', value: 'x' });
	});

	it('does not repeat the error and the node type among the rows: the error has its own block', () => {
		const detail = describeStep(node('a', { meta: { error: 'exit 1', type: 'script' } }));
		expect(detail.error).toBe('exit 1');
		expect(detail.rows.map(r => r.label)).not.toContain('error');
		expect(detail.rows.map(r => r.label)).not.toContain('type');
	});

	it('has no error block when the step did not fail', () => {
		expect(describeStep(node('a')).error).toBeUndefined();
	});
});
