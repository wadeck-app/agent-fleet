/**
 * `requires` wiring in SchemaValidator and FlowValidator; the rules themselves are in RequirementValidator.test.ts.
 */
import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { FlowValidator } from './FlowValidator';
import { SchemaValidator } from './SchemaValidator';

function flow(flowRequires: unknown, stepRequires: unknown): FlowDefinition {
	return {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		workspace: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
		inputs: {},
		requires: flowRequires,
		steps: [{ type: 'script', id: 's1', name: 'S1', script: 'echo hi', requires: stepRequires }],
	} as unknown as FlowDefinition;
}

const requiresIssues = (collector: MockIssueCollector) =>
	collector.issues.filter(i => i.location?.field === 'requires');

describe('SchemaValidator - requires', () => {
	it('reports a bad flow-level and a bad step-level requires', () => {
		const collector = new MockIssueCollector();
		new SchemaValidator(collector).validateSchema(flow('sandbox', ['a b']));
		const issues = requiresIssues(collector);
		expect(issues.map(i => i.location?.stepId)).toEqual([undefined, 's1']);
	});

	it('syntax-only without the 4th param: an unknown key is accepted', () => {
		const collector = new MockIssueCollector();
		new SchemaValidator(collector).validateSchema(flow(['zz=1'], ['zz=2']));
		expect(requiresIssues(collector)).toHaveLength(0);
	});

	it('checks the known guarantees when the 4th param is given', () => {
		const collector = new MockIssueCollector();
		new SchemaValidator(collector, [], undefined, ['sandbox']).validateSchema(flow(['sandbox'], ['zz=2']));
		expect(requiresIssues(collector).map(i => i.location?.stepId)).toEqual(['s1']);
	});

	it('FlowValidator passes the known guarantees down', () => {
		const result = new FlowValidator(undefined, [], undefined, ['sandbox']).validate(flow(['nope'], undefined));
		expect(JSON.stringify(result)).toContain('unknown requirement \\"nope\\"');
	});
});

describe('SchemaValidator - profile', () => {
	it('reports an unknown flow-level and step-level profile, accepts a known one', () => {
		const collector = new MockIssueCollector();
		const definition = flow(undefined, undefined) as unknown as { profile: string; steps: { profile: string }[] };
		definition.profile = 'agnt';
		definition.steps[0]!.profile = 'untrusted-code';
		new SchemaValidator(collector).validateSchema(definition as unknown as FlowDefinition);
		const issues = collector.issues.filter(i => i.location?.field === 'profile');
		expect(issues).toHaveLength(1);
		expect(issues[0]!.location?.stepId).toBeUndefined();
		expect(issues[0]!.message).toContain('Did you mean "agent"?');
	});

	it('checks the expansion against the declared guarantees given as 4th param', () => {
		const collector = new MockIssueCollector();
		const definition = flow(undefined, undefined) as unknown as { profile: string };
		definition.profile = 'agent';
		new SchemaValidator(collector, [], undefined, ['fs=confined']).validateSchema(
			definition as unknown as FlowDefinition
		);
		const issues = collector.issues.filter(i => i.location?.field === 'profile');
		expect(issues).toHaveLength(1);
		expect(issues[0]!.message).toContain('requires "env=clean",');
	});
});
