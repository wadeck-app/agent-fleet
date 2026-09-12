/**
 * Label validation: routing labels must be a list of non-empty strings (D#7).
 *
 * Reported at validation time so an unsupported form fails before the flow runs,
 * rather than surfacing as a step dispatched somewhere the author did not intend.
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

function flowWithLabels(labels: unknown): FlowDefinition {
	return {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
		inputs: {},
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo hi', labels }],
	} as unknown as FlowDefinition;
}

function labelIssues() {
	return collector.issues.filter(i => i.location?.field === 'labels');
}

describe('SchemaValidator - valid labels', () => {
	it('accepts a list of strings', () => {
		validator.validateSchema(flowWithLabels(['gpu', 'linux']));
		expect(labelIssues()).toHaveLength(0);
	});

	it('accepts an omitted labels field', () => {
		const flow = flowWithLabels(undefined);
		delete (flow.steps[0] as unknown as Record<string, unknown>)['labels'];
		validator.validateSchema(flow);
		expect(labelIssues()).toHaveLength(0);
	});

	it('accepts an empty list, meaning the step runs anywhere', () => {
		validator.validateSchema(flowWithLabels([]));
		expect(labelIssues()).toHaveLength(0);
	});
});

describe('SchemaValidator - unsupported label forms fail loudly', () => {
	// The trap: read as a single label, "a || b" would silently AND its atoms.
	it('rejects a bare string and names the expected form', () => {
		validator.validateSchema(flowWithLabels('a || b'));

		const issues = labelIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]!.severity).toBe('error');
		expect(issues[0]!.code).toBe(ValidationCode.INVALID_TYPE);
		expect(issues[0]!.message).toContain('must be a list');
		expect(issues[0]!.message).toContain('a || b');
		expect(issues[0]!.suggestion).toMatch(/AND/);
	});

	it('rejects a non-string entry', () => {
		validator.validateSchema(flowWithLabels(['gpu', 42]));

		const issues = labelIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]!.message).toContain('must all be strings');
	});

	it('rejects a blank label rather than letting it match everything', () => {
		validator.validateSchema(flowWithLabels(['gpu', '   ']));

		const issues = labelIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]!.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issues[0]!.message).toContain('blank label');
	});

	it('names the offending step', () => {
		validator.validateSchema(flowWithLabels('gpu'));
		expect(labelIssues()[0]!.location?.stepId).toBe('s1');
	});
});
