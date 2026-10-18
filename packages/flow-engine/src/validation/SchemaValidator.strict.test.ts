/**
 * `strict:` on `type: script` steps (bash errexit/nounset). Boolean only, bash only.
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

function strictIssues() {
	return collector.issues.filter(i => i.location?.field === 'strict');
}

const base = { type: 'script', id: 's1', name: 'S1', script: 'echo hi' };

describe('SchemaValidator - script step strict field', () => {
	it.each([true, false])('accepts strict: %s on shell: bash', strict => {
		validator.validateSchema(flowWithStep({ ...base, shell: 'bash', strict }));
		expect(strictIssues()).toHaveLength(0);
	});

	it('accepts an omitted strict field', () => {
		validator.validateSchema(flowWithStep({ ...base, shell: 'cmd' }));
		expect(strictIssues()).toHaveLength(0);
	});

	it.each(['false', 'yes', 0, 1, null, {}])('rejects non-boolean strict %j with an actionable error', strict => {
		validator.validateSchema(flowWithStep({ ...base, shell: 'bash', strict }));
		const issues = strictIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('error');
		expect(issues[0].code).toBe(ValidationCode.INVALID_TYPE);
		expect(issues[0].message).toContain("step 's1'");
		expect(issues[0].suggestion).toContain('true or false');
	});

	it.each(['cmd', 'pwsh'])('rejects strict (true or false) on shell: %s', shell => {
		for (const strict of [true, false]) {
			collector = new MockIssueCollector();
			validator = new SchemaValidator(collector);
			validator.validateSchema(flowWithStep({ ...base, shell, strict }));
			const issues = strictIssues();
			expect(issues).toHaveLength(1);
			expect(issues[0].severity).toBe('error');
			expect(issues[0].code).toBe(ValidationCode.INVALID_VALUE);
			expect(issues[0].message).toContain(`shell '${shell}'`);
			expect(issues[0].suggestion).toContain('Remove `strict`');
			expect(issues[0].suggestion).toContain('shell: bash');
		}
	});

	it('warns when strict is set without a shell field (platform-dependent shell)', () => {
		validator.validateSchema(flowWithStep({ ...base, strict: false }));
		const issues = strictIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0].severity).toBe('warning');
		expect(issues[0].suggestion).toContain('shell: bash');
	});
});
