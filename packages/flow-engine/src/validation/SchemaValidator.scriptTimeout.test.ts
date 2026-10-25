/**
 * `timeout:` on `type: script` steps, in seconds. Omit it for no limit; 0, negatives, non-numbers and
 * values a timer cannot hold (Node clamps those to 1 ms) are errors.
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SchemaValidator } from './SchemaValidator';

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

const base = { type: 'script', id: 's1', name: 'S1', script: 'echo hi', shell: 'bash' };

describe('SchemaValidator - script step timeout field', () => {
	it.each([1, 90, 0.5, 3600])('accepts %s seconds', timeout => {
		validator.validateSchema(flowWithStep({ ...base, timeout }));
		expect(timeoutIssues()).toHaveLength(0);
	});

	it('reports nothing when omitted', () => {
		validator.validateSchema(flowWithStep(base));
		expect(timeoutIssues()).toHaveLength(0);
	});

	it.each([0, -5, '30', null, true, Number.NaN, 3_000_000])('rejects %s with an actionable error', timeout => {
		validator.validateSchema(flowWithStep({ ...base, timeout }));
		const issues = timeoutIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('error');
		expect(issues[0].message).toContain("Script step 's1'");
		expect(issues[0].message).toContain('seconds');
		expect(issues[0].suggestion).toBeTruthy();
	});
});
