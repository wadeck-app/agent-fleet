import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { FlowValidator, ValidationCode } from './FlowValidator';

function makeFlow(overrides: Record<string, unknown>): FlowDefinition {
	return {
		version: '1.0.0',
		id: 'secret-flow',
		name: 'Secret flow',
		description: 'Test',
		workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'never' },
		inputs: { API_TOKEN: { type: 'password', default: 'env://API_TOKEN' } },
		steps: [
			{
				id: 'call',
				name: 'Call',
				type: 'script',
				shell: 'bash',
				script: 'echo "$API_TOKEN" | wc -c',
				secrets: ['API_TOKEN'],
			},
		],
		...overrides,
	} as unknown as FlowDefinition;
}

describe('FlowValidator - secrets wiring', () => {
	it('accepts a password input with an env:// default without type mismatch or auto-discovery', () => {
		const flow = makeFlow({});
		const result = new FlowValidator().validate(flow);
		expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
		expect(result.issues.map(i => i.code)).not.toContain(ValidationCode.TYPE_MISMATCH);
		expect(result.issues.map(i => i.code)).not.toContain(ValidationCode.AUTO_DISCOVERED_INPUT);
	});

	it('does not treat a referenced password input as undeclared', () => {
		const flow = makeFlow({
			steps: [
				{
					id: 'call',
					name: 'Call',
					type: 'script',
					shell: 'bash',
					script: 'echo ok',
					env: { T: '${{ inputs.API_TOKEN }}' },
				},
			],
		});
		const result = new FlowValidator().validate(flow);
		expect(result.issues.filter(i => i.severity === 'error')).toEqual([]);
		expect(flow._autoDiscoveredInputs?.API_TOKEN.source).toBe('explicit');
	});

	it('reports secret errors in the validation result', () => {
		const result = new FlowValidator().validate(
			makeFlow({
				steps: [
					{ id: 'call', name: 'Call', type: 'script', shell: 'bash', script: 'echo ok', secrets: ['NOPE'] },
				],
			})
		);
		expect(result.valid).toBe(false);
		expect(result.issues.map(i => i.code)).toContain(ValidationCode.SECRET_UNKNOWN);
	});

	it('still reports secret errors when a later phase also fails', () => {
		const result = new FlowValidator().validate(
			makeFlow({
				steps: [
					{
						id: 'call',
						name: 'Call',
						type: 'script',
						shell: 'bash',
						script: 'echo ok',
						secrets: ['NOPE'],
						depends: ['ghost'],
					},
				],
			})
		);
		const codes = result.issues.map(i => i.code);
		expect(codes).toContain(ValidationCode.SECRET_UNKNOWN);
		expect(codes).toContain(ValidationCode.UNDEFINED_STEP);
	});

	it('still reports secret errors when schema validation finds critical errors', () => {
		const result = new FlowValidator().validate(makeFlow({ steps: [] }));
		expect(result.issues.map(i => i.code)).toContain(ValidationCode.EMPTY_COLLECTION);
		const withBadDefault = new FlowValidator().validate(
			makeFlow({ steps: [], inputs: { API_TOKEN: { type: 'password', default: 'literal-value' } } })
		);
		expect(withBadDefault.issues.map(i => i.code)).toContain(ValidationCode.SECRET_BAD_REFERENCE);
	});

	it('does not report a secret model-step reference as valid', () => {
		const result = new FlowValidator().validate(
			makeFlow({
				steps: [
					{ id: 'ask', name: 'Ask', type: 'model', model: 'haiku', prompt: 'token ${{ inputs.API_TOKEN }}' },
				],
			})
		);
		expect(result.issues.map(i => i.code)).toContain(ValidationCode.SECRET_FORBIDDEN_STEP);
	});
});
