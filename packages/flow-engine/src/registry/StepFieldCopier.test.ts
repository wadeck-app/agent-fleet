import { describe, expect, it } from 'vitest';

import { MODEL_STEP_FIELDS, SCRIPT_STEP_FIELDS, copyStepFields } from './StepFieldCopier';

const HOST_TOOLS = [{ id: 't', description: 'd', sideEffect: 'read', command: ['x'] }];

describe('StepFieldCopier - hostTools', () => {
	it('carries hostTools of a model step exactly as written (no default added)', () => {
		const copy = copyStepFields(MODEL_STEP_FIELDS, { id: 's', hostTools: HOST_TOOLS });
		expect(copy['hostTools']).toEqual(HOST_TOOLS);
	});

	it('leaves hostTools absent when the step does not write it', () => {
		const copy = copyStepFields(MODEL_STEP_FIELDS, { id: 's' });
		expect(Object.keys(copy)).not.toContain('hostTools');
	});

	it('does not carry hostTools on a script step (the field is for model steps)', () => {
		expect(SCRIPT_STEP_FIELDS).not.toHaveProperty('hostTools');
	});
});
