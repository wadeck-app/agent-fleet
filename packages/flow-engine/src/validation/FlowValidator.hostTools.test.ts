import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { FlowValidator } from './FlowValidator';
import { ValidationCode } from './ValidationTypes';

type Raw = Record<string, unknown>;

const TOOL = {
	id: 'queue-task-show',
	description: 'Show a task of the queue by id (read only).',
	sideEffect: 'read',
	command: ['task', 'show', '{id}', '--json'],
	args: { id: { type: 'string', pattern: '^[A-Za-z0-9_-]{1,64}$', required: true } },
};

function flowOf(step: Raw, flowExtra: Raw = {}): FlowDefinition {
	return {
		id: 'f',
		name: 'F',
		description: 'd',
		workspace: 'in-place',
		steps: [{ id: 's', name: 's', type: 'model', model: 'haiku', prompt: 'hello', ...step }],
		...flowExtra,
	} as unknown as FlowDefinition;
}

const hostToolIssues = (flow: FlowDefinition, validator = new FlowValidator()): { code: string; severity: string }[] =>
	validator
		.validate(flow)
		.issues.filter(issue => issue.code.startsWith('HOST_TOOL'))
		.map(issue => ({ code: issue.code, severity: issue.severity }));

describe('FlowValidator - hostTools end to end', () => {
	it('accepts a model step with a valid host tool', () => {
		const result = new FlowValidator().validate(flowOf({ hostTools: [TOOL] }));
		expect(result.issues.filter(issue => issue.severity === 'error')).toEqual([]);
		expect(result.valid).toBe(true);
		expect(result.issues.filter(issue => issue.code.startsWith('HOST_TOOL'))).toEqual([]);
	});

	it('refuses sideEffect: write with the slice 1 message', () => {
		const result = new FlowValidator().validate(flowOf({ hostTools: [{ ...TOOL, sideEffect: 'write' }] }));
		expect(result.valid).toBe(false);
		const issue = result.issues.find(candidate => candidate.code === ValidationCode.HOST_TOOL_WRITE_UNSUPPORTED);
		expect(issue?.message).toContain('sideEffect: write is not supported yet (slice 3); use read');
	});

	it('refuses hostTools on a script step', () => {
		const result = new FlowValidator().validate(
			flowOf({ type: 'script', script: 'ls', shell: 'bash', hostTools: [TOOL] })
		);
		expect(result.valid).toBe(false);
		expect(hostToolIssues(flowOf({ type: 'script', script: 'ls', shell: 'bash', hostTools: [TOOL] }))).toEqual([
			{ code: ValidationCode.HOST_TOOL_STEP_TYPE, severity: 'error' },
		]);
	});

	it('reports the confined-profile finding as a warning that says the setting was not consulted, when no policy is passed', () => {
		const flow = flowOf({ hostTools: [TOOL], profile: 'agent' });
		const result = new FlowValidator().validate(flow);
		const issue = result.issues.find(
			candidate => candidate.code === ValidationCode.HOST_TOOL_UNDER_CONFINED_PROFILE
		);
		expect(issue?.severity).toBe('warning');
		expect(issue?.message).toContain('not consulted');
		expect(result.valid).toBe(true);
	});

	it('turns the same finding into an error when the injected policy says error', () => {
		const validator = new FlowValidator(undefined, [], undefined, {
			mode: 'error',
			description: 'error (validation.hostToolsUnderConfinedProfile = error)',
		});
		const result = validator.validate(flowOf({ hostTools: [TOOL], profile: 'agent' }));
		expect(result.valid).toBe(false);
		const issue = result.issues.find(
			candidate => candidate.code === ValidationCode.HOST_TOOL_UNDER_CONFINED_PROFILE
		);
		expect(issue?.severity).toBe('error');
		expect(issue?.message).toContain('error (validation.hostToolsUnderConfinedProfile = error)');
	});

	it('reports nothing about confinement for an unconfined step', () => {
		expect(hostToolIssues(flowOf({ hostTools: [TOOL] }))).toEqual([]);
	});
});
