/**
 * An absolute `workingDir` replaces the workspace for script steps. With a workspace other than `in-place` (worktree,
 * pool, readonly) that silently runs the script in the user's real folder instead of the isolated one.
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

function flowWith(workspace: unknown, flowLevel: Record<string, unknown>, steps: unknown[]) {
	return {
		id: 'test-flow',
		version: '1.0.0',
		name: 'Test',
		description: 'Test',
		inputs: {},
		workspace,
		steps,
		...flowLevel,
	} as unknown as FlowDefinition;
}

const script = (extra: Record<string, unknown> = {}) => ({
	type: 'script',
	id: 's1',
	name: 'S1',
	script: 'echo',
	...extra,
});

function workingDirIssues() {
	return collector.issues.filter(i => i.code === ValidationCode.WORKSPACE_WORKINGDIR_ABSOLUTE);
}

describe('SchemaValidator - absolute workingDir with an isolated workspace', () => {
	it.each(['worktree', 'readonly', { provider: 'pool' }])(
		'warns for an absolute step workingDir with workspace %j',
		workspace => {
			validator.validateSchema(flowWith(workspace, {}, [script({ workingDir: '/srv/app' })]));

			const [issue] = workingDirIssues();
			expect(workingDirIssues()).toHaveLength(1);
			expect(issue!.severity).toBe('warning');
			expect(issue!.location?.stepId).toBe('s1');
			expect(issue!.location?.field).toBe('workingDir');
			expect(issue!.message).toContain('replaces the workspace');
			expect(issue!.message).toContain('model steps ignore');
			expect(issue!.suggestion).toContain('relative');
			expect(issue!.suggestion).toContain('Remove workingDir');
		}
	);

	it('warns for an absolute flow-level workingDir', () => {
		validator.validateSchema(flowWith('worktree', { workingDir: 'C:\\repo' }, [script()]));

		const [issue] = workingDirIssues();
		expect(workingDirIssues()).toHaveLength(1);
		expect(issue!.location?.field).toBe('workingDir');
		expect(issue!.location?.stepId).toBeUndefined();
	});

	it('does not warn for a relative workingDir', () => {
		validator.validateSchema(flowWith('worktree', { workingDir: 'sub' }, [script({ workingDir: './packages/a' })]));

		expect(workingDirIssues()).toEqual([]);
	});

	it('does not warn with workspace in-place', () => {
		validator.validateSchema(flowWith('in-place', { workingDir: '/srv' }, [script({ workingDir: '/srv/app' })]));

		expect(workingDirIssues()).toEqual([]);
	});
});
