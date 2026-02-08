/**
 * Regression test: auto-discovered inputs must NOT leak between flows
 * when the same FlowValidator instance validates multiple flows sequentially.
 *
 * Bug: TemplateValidator.autoDiscoveredInputs was never cleared between
 * calls to validateTemplates(), causing inputs from flow A to appear
 * in flow B's _autoDiscoveredInputs.
 */
import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { FlowValidator } from './FlowValidator';

function makeFlow(overrides: Partial<FlowDefinition> & { id: string }): FlowDefinition {
	return {
		version: '1.0.0',
		name: overrides.id,
		description: 'Test',
		workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
		inputs: {},
		steps: [],
		...overrides,
	};
}

describe('AutoDiscovery leak regression', () => {
	it('should NOT leak auto-discovered inputs from flow A into flow B', () => {
		const validator = new FlowValidator();

		// Flow A: references undeclared inputs (extra_param, other_param)
		const flowA = makeFlow({
			id: 'flow-a',
			inputs: { task: 'string' },
			steps: [
				{
					id: 'step1',
					name: 'Step 1',
					type: 'model' as const,
					model: 'haiku',
					prompt: '${{ inputs.task }} ${{ inputs.extra_param }} ${{ inputs.other_param }}',
				},
			],
		});

		// Flow B: only references its own declared input
		const flowB = makeFlow({
			id: 'flow-b',
			inputs: { task: 'string' },
			steps: [
				{
					id: 'step1',
					name: 'Step 1',
					type: 'model' as const,
					model: 'haiku',
					prompt: '${{ inputs.task }}',
				},
			],
		});

		// Validate flow A first — should auto-discover extra_param and other_param
		validator.validate(flowA);
		expect(flowA._autoDiscoveredInputs).toBeDefined();
		expect(Object.keys(flowA._autoDiscoveredInputs!)).toContain('extra_param');
		expect(Object.keys(flowA._autoDiscoveredInputs!)).toContain('other_param');

		// Validate flow B — should NOT contain extra_param or other_param
		validator.validate(flowB);
		expect(flowB._autoDiscoveredInputs).toBeDefined();
		const flowBInputNames = Object.keys(flowB._autoDiscoveredInputs!);
		expect(flowBInputNames).toContain('task');
		expect(flowBInputNames).not.toContain('extra_param');
		expect(flowBInputNames).not.toContain('other_param');
	});

	it('should correctly auto-discover inputs for each flow independently', () => {
		const validator = new FlowValidator();

		const flow1 = makeFlow({
			id: 'flow-1',
			inputs: {},
			steps: [
				{
					id: 'step1',
					name: 'Step 1',
					type: 'model' as const,
					model: 'haiku',
					prompt: '${{ inputs.alpha }}',
				},
			],
		});

		const flow2 = makeFlow({
			id: 'flow-2',
			inputs: {},
			steps: [
				{
					id: 'step1',
					name: 'Step 1',
					type: 'model' as const,
					model: 'haiku',
					prompt: '${{ inputs.beta }}',
				},
			],
		});

		validator.validate(flow1);
		validator.validate(flow2);

		// flow1 should only have alpha
		expect(Object.keys(flow1._autoDiscoveredInputs!)).toEqual(expect.arrayContaining(['alpha']));
		expect(Object.keys(flow1._autoDiscoveredInputs!)).not.toContain('beta');

		// flow2 should only have beta
		expect(Object.keys(flow2._autoDiscoveredInputs!)).toEqual(expect.arrayContaining(['beta']));
		expect(Object.keys(flow2._autoDiscoveredInputs!)).not.toContain('alpha');
	});
});
