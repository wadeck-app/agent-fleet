import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SubStepDependencyValidator } from './SubStepDependencyValidator';
import { ValidationCode, type ValidationIssue } from './ValidationTypes';

class MockIssueCollector {
	public issues: ValidationIssue[] = [];

	addIssue(issue: ValidationIssue): void {
		this.issues.push(issue);
	}
}

function flowOf(parentStrategy: string | undefined, childDepends: string[] = ['b']): FlowDefinition {
	return {
		id: 'f',
		version: '1.0.0',
		name: 'F',
		description: '',
		workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'always' },
		inputs: {},
		steps: [
			{
				type: 'model',
				id: 'impl',
				name: 'impl',
				prompt: 'p',
				...(parentStrategy === undefined ? {} : { subStepStrategy: parentStrategy }),
			},
			{ type: 'script', id: 'a', name: 'a', parent: 'impl', script: 'true' },
			{ type: 'script', id: 'b', name: 'b', parent: 'impl', script: 'true' },
			{ type: 'script', id: 'c', name: 'c', parent: 'impl', depends: childDepends, script: 'true' },
		],
	} as FlowDefinition;
}

function run(flow: FlowDefinition): ValidationIssue[] {
	const collector = new MockIssueCollector();
	new SubStepDependencyValidator(collector).validate(flow);
	return collector.issues;
}

describe('SubStepDependencyValidator', () => {
	it('warns when a wait-all parent has a sub-step depending on a sibling', () => {
		const issues = run(flowOf('wait-all'));
		expect(issues).toHaveLength(1);
		const [issue] = issues;
		expect(issue.severity).toBe('warning');
		expect(issue.code).toBe(ValidationCode.SUB_STEP_SIBLING_DEPENDENCY);
		expect(issue.location).toEqual({ stepId: 'c', field: 'depends' });
		expect(issue.message).toContain("'impl'");
		expect(issue.message).toContain("'c'");
		expect(issue.message).toContain("'b'");
		expect(issue.message).toContain('not run');
		expect(issue.suggestion).toContain('restart-on-first-failure');
		expect(issue.suggestion).toContain('depends');
	});

	it('emits one warning per sibling dependency', () => {
		expect(run(flowOf('wait-all', ['a', 'b']))).toHaveLength(2);
	});

	it('does not warn with the default strategy (restart-on-first-failure)', () => {
		expect(run(flowOf(undefined))).toEqual([]);
	});

	it('does not warn with an explicit restart-on-first-failure strategy', () => {
		expect(run(flowOf('restart-on-first-failure'))).toEqual([]);
	});

	it('does not warn when the dependency is not a sibling', () => {
		const flow = flowOf('wait-all', ['outside']);
		flow.steps.push({
			type: 'script',
			id: 'outside',
			name: 'o',
			script: 'true',
		} as FlowDefinition['steps'][number]);
		expect(run(flow)).toEqual([]);
	});

	it('does not warn when no sub-step declares depends', () => {
		expect(run(flowOf('wait-all', []))).toEqual([]);
	});
});
