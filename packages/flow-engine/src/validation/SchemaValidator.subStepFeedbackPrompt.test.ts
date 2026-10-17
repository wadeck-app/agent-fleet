/**
 * `subStepFeedbackPrompt:` on a model step customises the message that delivers failed
 * sub-step feedback into the parent's resumed session. It must reference the feedback, or the
 * message would silently carry nothing.
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SchemaValidator } from './SchemaValidator';
import { ValidationCode } from './ValidationTypes';

let collector: MockIssueCollector;
let validator: SchemaValidator;

beforeEach(() => {
	collector = new MockIssueCollector();
	validator = new SchemaValidator(collector);
});

function flowWithStep(step: Record<string, unknown>): FlowDefinition {
	return {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
		inputs: {},
		steps: [step],
	} as unknown as FlowDefinition;
}

function issues() {
	return collector.issues.filter(i => i.location?.field === 'subStepFeedbackPrompt');
}

describe('SchemaValidator - model step subStepFeedbackPrompt field', () => {
	it('accepts a template that references ${{ subStepFeedback }}', () => {
		validator.validateSchema(
			flowWithStep({
				type: 'model',
				id: 'm1',
				name: 'M1',
				prompt: 'hi',
				subStepFeedbackPrompt: 'Fix this:\n${{ subStepFeedback }}',
			})
		);

		expect(issues()).toHaveLength(0);
	});

	it('reports nothing when omitted', () => {
		validator.validateSchema(flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi' }));

		expect(issues()).toHaveLength(0);
	});

	it('rejects a template that never references subStepFeedback (the feedback would be dropped)', () => {
		validator.validateSchema(
			flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi', subStepFeedbackPrompt: 'Try again.' })
		);

		const found = issues();
		expect(found).toHaveLength(1);
		expect(found[0]?.severity).toBe('error');
		expect(found[0]?.code).toBe(ValidationCode.INVALID_VALUE);
		expect(found[0]?.message).toContain("'m1'");
		expect(found[0]?.suggestion).toContain('${{ subStepFeedback }}');
	});

	it('rejects a blank or non-string value', () => {
		validator.validateSchema(
			flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi', subStepFeedbackPrompt: '  ' })
		);
		validator.validateSchema(
			flowWithStep({ type: 'model', id: 'm2', name: 'M2', prompt: 'hi', subStepFeedbackPrompt: 42 })
		);

		expect(issues()).toHaveLength(2);
		expect(issues().every(i => i.severity === 'error')).toBe(true);
	});
});
