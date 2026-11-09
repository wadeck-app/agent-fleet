import { describe, expect, it } from 'vitest';

import { InjectedHostMarkerGuard } from './InjectedHostMarkerGuard';

describe('InjectedHostMarkerGuard', () => {
	it('finds nothing in steps without the marker, or with host: false', () => {
		expect(InjectedHostMarkerGuard.find([{ id: 'a', type: 'script', script: 'ls' }])).toEqual([]);
		expect(InjectedHostMarkerGuard.find([{ id: 'a', type: 'script', script: 'ls', host: false }])).toEqual([]);
	});

	it.each([true, 'true', 'True', 1, '${{ inputs.x }}', null, {}, [true]])(
		'finds a step whose host is %j: anything but the literal false is a way out of the confinement',
		value => {
			expect(InjectedHostMarkerGuard.find([{ id: 'a', type: 'script', script: 'ls', host: value }])).toEqual([
				{ stepId: 'a', path: 'a' },
			]);
		}
	);

	it('finds it on a model step too (no step kind is exempt)', () => {
		expect(InjectedHostMarkerGuard.find([{ id: 'm', type: 'model', prompt: 'p', host: true }])).toHaveLength(1);
	});

	it('finds it at any depth of nested step lists, reporting the path', () => {
		const found = InjectedHostMarkerGuard.find([
			{
				id: 'outer',
				type: 'script',
				script: 'ls',
				steps: [{ id: 'mid', type: 'script', script: 'ls', subSteps: [{ id: 'deep', type: 'script', host: true }] }],
			},
		]);
		expect(found).toEqual([{ stepId: 'deep', path: 'outer > mid > deep' }]);
	});

	it('finds it in a nested step even when the enclosing step is marked itself', () => {
		const found = InjectedHostMarkerGuard.find([
			{ id: 'p', type: 'script', host: true, steps: [{ id: 'c', type: 'script', host: true }] },
		]);
		expect(found.map(entry => entry.stepId)).toEqual(['p', 'c']);
	});

	it('does not mistake an env variable called host for the marker', () => {
		expect(InjectedHostMarkerGuard.find([{ id: 'a', type: 'script', script: 'ls', env: { host: 'x' } }])).toEqual([]);
	});

	it('describes the refusal: step, why, and what to do', () => {
		const message = InjectedHostMarkerGuard.refusal([{ stepId: 'deep', path: 'outer > deep' }]);
		expect(message).toContain("'deep'");
		expect(message).toContain('outer > deep');
		expect(message).toContain("run's confinement");
		expect(message).toMatch(/Remove `host`/);
	});
});
