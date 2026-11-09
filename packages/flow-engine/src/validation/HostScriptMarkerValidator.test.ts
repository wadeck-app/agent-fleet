import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { HostScriptMarkerValidator } from './HostScriptMarkerValidator';
import { SchemaValidator } from './SchemaValidator';
import { ValidationCode } from './ValidationTypes';

function flowOf(...steps: Record<string, unknown>[]): FlowDefinition {
	return { id: 'f', name: 'F', description: 'd', steps } as unknown as FlowDefinition;
}

const script = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	type: 'script',
	id,
	name: id,
	script: 'ls',
	shell: 'bash',
	...extra,
});
const model = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
	type: 'model',
	id,
	name: id,
	prompt: 'p',
	...extra,
});

function run(definition: FlowDefinition): MockIssueCollector['issues'] {
	const collector = new MockIssueCollector();
	const validator = new HostScriptMarkerValidator(collector);
	for (const step of definition.steps) {
		validator.validateStep(step);
	}
	validator.validateFlow(definition);
	return collector.issues;
}

describe('HostScriptMarkerValidator - the value of host', () => {
	it.each([true, false])('accepts host: %s on a script step without any issue', value => {
		expect(run(flowOf(script('s1', { host: value })))).toEqual([]);
	});

	it('says nothing for a script without host', () => {
		expect(run(flowOf(script('s1')))).toEqual([]);
	});

	it.each([
		['the string "true"', 'true'],
		['the string "false"', 'false'],
		['a number', 1],
		['null', null],
		['a list', [true]],
	])('refuses %s, naming the step and the literal to write', (_label, value) => {
		const issues = run(flowOf(script('s1', { host: value })));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.INVALID_TYPE,
			location: { stepId: 's1', field: 'host' },
		});
		expect(issues[0]!.message).toContain("'s1'");
		expect(issues[0]!.suggestion).toContain('host: true');
		expect(issues[0]!.suggestion).toContain('host: false');
	});

	it.each(['${{ inputs.where }}', 'true${{ inputs.x }}', '  ${{steps.a.outputs.b}}'])(
		'refuses the template %j: the marker is a static fact of the definition',
		value => {
			const issues = run(flowOf(script('s1', { host: value })));
			expect(issues).toHaveLength(1);
			expect(issues[0]).toMatchObject({ severity: 'error', location: { stepId: 's1', field: 'host' } });
			expect(issues[0]!.message).toMatch(/static|literal/i);
			expect(issues[0]!.message).toMatch(/inputs|outputs|computed/i);
		}
	);
});

describe('HostScriptMarkerValidator - the kind of step', () => {
	it.each([
		['model', model('m1', { host: true })],
		['subflow', { type: 'subflow', id: 'm1', name: 'm1', flowId: 'other', host: true }],
		['user_intervention', { type: 'user_intervention', id: 'm1', name: 'm1', interventionType: 'approval', host: true }],
	])('refuses host on a %s step, naming it and the fix', (_kind, step) => {
		const issues = run(flowOf(step));
		const errors = issues.filter(issue => issue.severity === 'error');
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ location: { stepId: 'm1', field: 'host' } });
		expect(errors[0]!.message).toContain("'m1'");
		expect(errors[0]!.suggestion).toMatch(/Remove `host`/);
		expect(errors[0]!.suggestion).toMatch(/script step/);
	});

	it('refuses host: false on a model step too (the field does not exist there)', () => {
		expect(run(flowOf(model('m1', { host: false }))).filter(i => i.severity === 'error')).toHaveLength(1);
	});
});

describe('HostScriptMarkerValidator - HOST_SCRIPT_WITH_MODEL_STEPS warning', () => {
	it('warns once per host script step when the flow also has a model step, naming the step, the risk and both fixes', () => {
		const issues = run(flowOf(model('m1'), script('a', { host: true }), script('b', { host: true }), script('c')));
		const warnings = issues.filter(issue => issue.code === ValidationCode.HOST_SCRIPT_WITH_MODEL_STEPS);
		expect(warnings).toHaveLength(2);
		expect(warnings.map(w => w.location?.stepId)).toEqual(['a', 'b']);
		for (const warning of warnings) {
			expect(warning.severity).toBe('warning');
			expect(warning.message).toContain('user\'s rights');
			expect(warning.message).toMatch(/\.git/);
			expect(warning.message).toMatch(/package scripts/);
			expect(warning.suggestion).toContain('Remove `host: true`');
			expect(warning.suggestion).toMatch(/does not read files an agent wrote/);
		}
		expect(warnings[0]!.message).toContain("'a'");
	});

	it('does not warn without a model step', () => {
		expect(run(flowOf(script('a', { host: true }), script('b'))).map(i => i.code)).toEqual([]);
	});

	it('does not warn for host: false or an unmarked script next to a model step', () => {
		expect(run(flowOf(model('m1'), script('a', { host: false }), script('b')))).toEqual([]);
	});

	it('does not warn for a malformed marker (the error is enough)', () => {
		const issues = run(flowOf(model('m1'), script('a', { host: 'true' })));
		expect(issues.map(i => i.severity)).toEqual(['error']);
	});

	it('SchemaValidator reports errors and warning of the marker alongside its other checks', () => {
		const collector = new MockIssueCollector();
		new SchemaValidator(collector).validateSchema(flowOf(model('m1'), script('a', { host: true })));
		expect(collector.issues.filter(i => i.code === ValidationCode.HOST_SCRIPT_WITH_MODEL_STEPS)).toHaveLength(1);

		const bad = new MockIssueCollector();
		new SchemaValidator(bad).validateSchema(flowOf(model('m1', { host: true })));
		expect(bad.issues.filter(i => i.severity === 'error' && i.location?.field === 'host')).toHaveLength(1);
	});
});
