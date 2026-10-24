import { describe, expect, it } from 'vitest';

import { injectedStepState } from './InjectedStepState.js';

describe('injectedStepState', () => {
	it('registers a pending injected step with its recorded dependencies and parent', () => {
		expect(injectedStepState({ id: 'a', type: 'script', depends: ['x', 'y'], parent: 'p' })).toEqual({
			status: 'pending',
			injected: true,
			dependsOn: ['x', 'y'],
			parent: 'p',
		});
	});

	it('leaves dependsOn and parent out when the step declares none', () => {
		expect(injectedStepState({ id: 'a', type: 'model' })).toEqual({ status: 'pending', injected: true });
	});
});

describe('injectedStepState wave', () => {
	it('records the wave of an injected sub-step, wave 0 included', () => {
		expect(injectedStepState({ id: 'a', type: 'script', parent: 'p', wave: 2 })).toMatchObject({ wave: 2 });
		expect(injectedStepState({ id: 'a', type: 'script', parent: 'p', wave: 0 })).toMatchObject({ wave: 0 });
	});

	it('leaves wave out when the step declares none', () => {
		expect(injectedStepState({ id: 'a', type: 'script' })).not.toHaveProperty('wave');
	});
});
