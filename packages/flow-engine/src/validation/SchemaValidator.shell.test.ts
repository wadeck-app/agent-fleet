/**
 * `shell:` on `type: script` steps makes the execution shell explicit (bash/cmd/pwsh).
 * Omitting it keeps today's implicit platform-dependent behavior for backward compatibility,
 * but is flagged with a warning since behavior then depends on platform and script line count.
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

function shellIssues() {
	return collector.issues.filter(i => i.location?.field === 'shell');
}

describe('SchemaValidator - script step shell field', () => {
	it.each(['bash', 'cmd', 'pwsh'])('accepts shell: %s with no error', shell => {
		validator.validateSchema(flowWithStep({ type: 'script', id: 's1', name: 'S1', script: 'echo hi', shell }));

		expect(shellIssues()).toHaveLength(0);
	});

	it('rejects an unknown shell value with an actionable error', () => {
		validator.validateSchema(
			flowWithStep({ type: 'script', id: 's1', name: 'S1', script: 'echo hi', shell: 'xyz' })
		);

		const issues = shellIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]?.severity).toBe('error');
		expect(issues[0]?.code).toBe(ValidationCode.INVALID_VALUE);
		expect(issues[0]?.message).toBe("unknown shell 'xyz', expected one of: bash, cmd, pwsh");
	});

	it('warns (not errors) when shell is omitted on a script step, and the flow still validates', () => {
		const result = validator.validateSchema(flowWithStep({ type: 'script', id: 's1', name: 'S1', script: 'echo hi' }));

		const issues = shellIssues();
		expect(issues).toHaveLength(1);
		expect(issues[0]?.severity).toBe('warning');
		expect(issues[0]?.message).toBe(
			"step 's1' has no shell: field; behavior depends on the executing platform and script line count"
		);
		expect(result.stepIds.has('s1')).toBe(true);
	});

	it('does not report any shell issue for a model step without shell', () => {
		validator.validateSchema(flowWithStep({ type: 'model', id: 'm1', name: 'M1', prompt: 'hello' }));

		expect(shellIssues()).toHaveLength(0);
	});
});
