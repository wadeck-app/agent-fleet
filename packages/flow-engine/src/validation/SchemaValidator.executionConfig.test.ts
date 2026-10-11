/**
 * `execution.skipPermissions` was removed in favor of a per-step `skipPermissions`: it never
 * reached the model CLI through the daemon-dispatched `flow run` path (only the separate
 * in-process FlowExecutor wired `flow.execution` at all), so a flow author relying on it got no
 * error and no suppressed prompt. Reported at validation time so an existing flow fails loudly
 * instead of silently losing a setting it already thought it had.
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

function flowWithExecution(execution: unknown): FlowDefinition {
	return {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
		inputs: {},
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo hi' }],
		execution,
	} as unknown as FlowDefinition;
}

function executionIssues() {
	return collector.issues.filter(i => i.location?.field === 'execution.skipPermissions');
}

describe('SchemaValidator - execution.skipPermissions is rejected', () => {
	it('fails loudly when a flow still sets the removed flow-level field', () => {
		validator.validateSchema(flowWithExecution({ skipPermissions: true }));

		const issues = executionIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]?.severity).toBe('error');
		expect(issues[0]?.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issues[0]?.suggestion).toContain('steps[].skipPermissions');
	});

	it('accepts execution with only streamJson/verbose', () => {
		validator.validateSchema(flowWithExecution({ streamJson: true, verbose: false }));
		expect(executionIssues()).toHaveLength(0);
	});

	it('accepts an omitted execution block', () => {
		const flow = flowWithExecution(undefined);
		delete (flow as unknown as Record<string, unknown>)['execution'];
		validator.validateSchema(flow);
		expect(executionIssues()).toHaveLength(0);
	});
});
