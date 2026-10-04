/**
 * Flow-level label validation (Proposal 4): inherited by every step via union merge,
 * same shape/constraint as step-level `labels` (D#7, see SchemaValidator.labels.test.ts).
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

function flowWithFlowLevelLabels(labels: unknown): FlowDefinition {
	return {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
		inputs: {},
		labels,
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo hi' }],
	} as unknown as FlowDefinition;
}

function flowLabelIssues() {
	return collector.issues.filter(i => i.location?.field === 'labels' && i.location?.stepId === undefined);
}

describe('SchemaValidator - valid flow-level labels', () => {
	it('accepts a list of strings', () => {
		validator.validateSchema(flowWithFlowLevelLabels(['npm', 'linux']));
		expect(flowLabelIssues()).toHaveLength(0);
	});

	it('accepts an omitted labels field', () => {
		const flow = flowWithFlowLevelLabels(undefined);
		delete (flow as unknown as Record<string, unknown>)['labels'];
		validator.validateSchema(flow);
		expect(flowLabelIssues()).toHaveLength(0);
	});

	it('accepts an empty list, meaning no flow-wide pin', () => {
		validator.validateSchema(flowWithFlowLevelLabels([]));
		expect(flowLabelIssues()).toHaveLength(0);
	});
});

describe('SchemaValidator - unsupported flow-level label forms fail loudly', () => {
	it('rejects a bare string and names the expected form', () => {
		validator.validateSchema(flowWithFlowLevelLabels('npm'));

		const issues = flowLabelIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]!.severity).toBe('error');
		expect(issues[0]!.code).toBe(ValidationCode.INVALID_TYPE);
		expect(issues[0]!.message).toContain('must be a list');
		expect(issues[0]!.message).toContain("Flow 'test-flow'");
	});

	it('rejects a non-string entry', () => {
		validator.validateSchema(flowWithFlowLevelLabels(['npm', 42]));

		const issues = flowLabelIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]!.message).toContain('must all be strings');
	});

	it('rejects a blank label rather than letting it match everything', () => {
		validator.validateSchema(flowWithFlowLevelLabels(['npm', '   ']));

		const issues = flowLabelIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]!.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issues[0]!.message).toContain('blank label');
	});
});
