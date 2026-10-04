/**
 * `timeout:` on `type: model` steps bounds how long a model step can hang (see
 * ModelStepExecutor's withModelTimeout). Minutes, mirroring UserInterventionStep.timeout.minutes.
 * 0 is rejected rather than treated as "no timeout" -- omit the field for that instead.
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

function timeoutIssues() {
	return collector.issues.filter(i => i.location?.field === 'timeout');
}

describe('SchemaValidator - model step timeout field', () => {
	it('accepts a positive number with no error', () => {
		validator.validateSchema(flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi', timeout: 10 }));

		expect(timeoutIssues()).toHaveLength(0);
	});

	it('does not report any issue when timeout is omitted', () => {
		validator.validateSchema(flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi' }));

		expect(timeoutIssues()).toHaveLength(0);
	});

	it('rejects 0 with an actionable error (use omission for "no timeout", not 0)', () => {
		validator.validateSchema(flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi', timeout: 0 }));

		const issues = timeoutIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]?.severity).toBe('error');
		expect(issues[0]?.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issues[0]?.message).toBe("Model step 'm1' timeout must be a positive number of minutes");
	});

	it('rejects a negative number', () => {
		validator.validateSchema(flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi', timeout: -5 }));

		expect(timeoutIssues()).toHaveLength(1);
	});

	it('rejects a non-number value', () => {
		validator.validateSchema(flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hi', timeout: '10' }));

		expect(timeoutIssues()).toHaveLength(1);
	});
});
