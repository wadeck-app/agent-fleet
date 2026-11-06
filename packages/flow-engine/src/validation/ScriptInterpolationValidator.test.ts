import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { ScriptInterpolationValidator } from './ScriptInterpolationValidator';
import type { ValidationIssue } from './ValidationTypes';
import { ValidationCode } from './ValidationTypes';

const issues: ValidationIssue[] = [];
const validator = new ScriptInterpolationValidator({ addIssue: issue => issues.push(issue) });

function flow(steps: unknown[], inputs: Record<string, unknown> = { task: 'string' }): FlowDefinition {
	return { id: 'f', name: 'F', inputs, steps } as unknown as FlowDefinition;
}

function script(body: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> {
	return { id: 's', name: 'S', type: 'script', script: body, ...extra };
}

beforeEach(() => {
	issues.length = 0;
});

describe('ScriptInterpolationValidator - untrusted values in a script body', () => {
	it('warns on an input interpolated in the script body, with an actionable fix', () => {
		validator.validate(flow([script('echo "${{ inputs.task }}"')]));
		expect(issues).toHaveLength(1);
		expect(issues[0].code).toBe(ValidationCode.SCRIPT_BODY_INTERPOLATION);
		expect(issues[0].severity).toBe('warning');
		expect(issues[0].location).toEqual({ stepId: 's', field: 'script' });
		expect(issues[0].message).toContain('inputs.task');
		expect(issues[0].suggestion).toContain('env:');
		expect(issues[0].suggestion).toContain('$NAME');
	});

	it('reports each distinct reference once', () => {
		validator.validate(
			flow([script('echo ${{ inputs.task }} ${{inputs.task}} ${{ inputs.other }}')], { task: 'string', other: 'text' })
		);
		expect(issues).toHaveLength(2);
	});

	it('warns on the output of a model step', () => {
		validator.validate(
			flow([
				{ id: 'm', name: 'M', type: 'model', prompt: 'x' },
				script('echo ${{ steps.m.outputs.answer }}', { dependsOn: ['m'] }),
			])
		);
		expect(issues).toHaveLength(1);
		expect(issues[0].message).toContain('steps.m.outputs.answer');
	});

	it.each(['user_intervention', 'subflow', 'event'])('warns on the output of a %s step', type => {
		validator.validate(flow([{ id: 'u', name: 'U', type }, script('echo ${{ steps.u.outputs.v }}')]));
		expect(issues).toHaveLength(1);
	});

	it('trusts the output of a script step', () => {
		validator.validate(
			flow([script('echo a', { id: 'first' }), script('echo ${{ steps.first.outputs.y }}', { id: 'second' })])
		);
		expect(issues).toEqual([]);
	});

	it.each(['number', 'integer', 'boolean', 'percentage'])('does not flag a %s input (cannot carry shell syntax)', type => {
		validator.validate(flow([script('echo ${{ inputs.n }}')], { n: type }));
		expect(issues).toEqual([]);
	});

	it('does not flag a number input declared with the extended form', () => {
		validator.validate(flow([script('echo ${{ inputs.n }}')], { n: { type: 'number' } }));
		expect(issues).toEqual([]);
	});

	it('flags an undeclared (auto-discovered) input: it is a string', () => {
		validator.validate(flow([script('echo ${{ inputs.undeclared }}')], {}));
		expect(issues).toHaveLength(1);
	});

	it('does not flag env: values or context references', () => {
		validator.validate(
			flow([script('echo $TASK ${{ context.workspaceDir }}', { env: { TASK: '${{ inputs.task }}' } })])
		);
		expect(issues).toEqual([]);
	});

	it('does not flag the $${{ }} escape', () => {
		validator.validate(flow([script('echo $${{ inputs.task }}')]));
		expect(issues).toEqual([]);
	});

	it('does not flag model steps', () => {
		validator.validate(flow([{ id: 'm', name: 'M', type: 'model', prompt: '${{ inputs.task }}' }]));
		expect(issues).toEqual([]);
	});

	it('leaves password inputs to the secret rule (no duplicate warning)', () => {
		validator.validate(flow([script('echo ${{ inputs.API_TOKEN }}')], { API_TOKEN: 'password' }));
		expect(issues).toEqual([]);
	});

	it('tolerates malformed steps and a non-string script', () => {
		validator.validate(flow([null, 'x', script(42)]));
		expect(issues).toEqual([]);
	});
});
