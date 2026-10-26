import { describe, expect, it } from 'vitest';

import { describeStep } from './StepDetails.js';
import { node } from './testing/GraphFixtures.js';

describe('describeStep', () => {
	it('lists duration and attempts first, without repeating the status the badge already shows', () => {
		const { rows } = describeStep(
			node('build', { kind: 'script', status: 'completed', durationLabel: '12.3s', attempts: 2 })
		);
		expect(rows.map(r => `${r.label}=${r.value}`)).toEqual(['Kind=script', 'Duration=12.3s', 'Attempts=2']);
	});

	it('leaves out the attempts of a step that ran once', () => {
		const { rows } = describeStep(node('build', { durationLabel: '1s', attempts: 1 }));
		expect(rows.map(r => r.label)).not.toContain('Attempts');
	});

	it('shows only the kind for a node of a definition drawn without a run', () => {
		const { rows } = describeStep(node('build'));
		expect(rows.map(r => `${r.label}=${r.value}`)).toEqual(['Kind=script']);
	});

	it('says once that a step is not in the current flow file, instead of printing the kind and raw flags', () => {
		const { rows } = describeStep(node('old', { kind: 'removed', meta: { type: 'removed', removed: true } }));
		expect(rows).toEqual([{ label: 'Flow file', value: 'step no longer declared' }]);
	});

	it('says once that a step was injected at run time', () => {
		const { rows } = describeStep(node('extra', { kind: 'injected', meta: { type: 'injected', injected: true } }));
		expect(rows).toEqual([{ label: 'Flow file', value: 'created at run time' }]);
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

	it('shows the ready-to-print cost label of the step, else the raw cost as a fallback', () => {
		const rowsOf = (meta: Record<string, string | number | boolean>) =>
			Object.fromEntries(describeStep(node('a', { meta })).rows.map(r => [r.label, r.value]));
		const labelled = rowsOf({ costUsd: 2.79, costLabel: '$2.7900+ (2 attempts unknown)' });
		expect(labelled['Cost']).toBe('$2.7900+ (2 attempts unknown)');
		expect(labelled['Cost (USD)']).toBeUndefined();
		expect(rowsOf({ costLabel: 'unknown' })['Cost']).toBe('unknown');
		expect(rowsOf({ costUsd: 0.5 })['Cost (USD)']).toBe('0.5');
	});

	it('formats start and end times as dates and keeps an unparsable one as is', () => {
		const { rows } = describeStep(
			node('a', { meta: { startedAt: '2026-08-16T12:00:00.000Z', completedAt: 'soon' } })
		);
		const byLabel = Object.fromEntries(rows.map(r => [r.label, r.value]));
		expect(byLabel['Started']).toBe(new Date('2026-08-16T12:00:00.000Z').toLocaleString());
		expect(byLabel['Completed']).toBe('soon');
	});

	it('does not dump a meta key it does not know: the panel lists curated facts only', () => {
		const { rows } = describeStep(node('a', { meta: { futureField: 'x' } }));
		expect(rows.map(r => r.label)).not.toContain('futureField');
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

	it('adds the run order and explains why a step did not run, with how sure the chart is', () => {
		const ran = describeStep(
			node('a', {
				attempts: 3,
				path: {
					outcome: 'ran',
					basis: 'recorded',
					reason: 'Ran.',
					ordinal: 2,
					attempts: 3,
					attemptKind: 'loop',
				},
			})
		);
		expect(ran.rows).toContainEqual({ label: 'Run order', value: '2' });
		expect(ran.rows).toContainEqual({ label: 'Attempts', value: '3 (loop passes, inferred)' });
		expect(ran.outcome).toBeUndefined();

		const skipped = describeStep(
			node('b', { path: { outcome: 'skipped', basis: 'inferred', reason: 'Probably skipped: x.' } })
		);
		expect(skipped.outcome).toEqual({ text: 'Probably skipped: x.', basis: 'inferred' });
	});
});
