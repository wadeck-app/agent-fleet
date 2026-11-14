import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { describe, expect, it } from 'vitest';

import type { HostToolsConfinementPolicy } from '../hosttools/HostToolsConfinementPolicy';
import type { FlowDefinition } from '../types';
import { HostToolsConfinementValidator } from './HostToolsConfinementValidator';
import { ValidationCode } from './ValidationTypes';

type Raw = Record<string, unknown>;

const WARN: HostToolsConfinementPolicy = {
	mode: 'warn',
	description: 'warning (validation.hostToolsUnderConfinedProfile=warn, default)',
};
const ERROR: HostToolsConfinementPolicy = {
	mode: 'error',
	description: 'error (validation.hostToolsUnderConfinedProfile = error)',
};

const TOOLS = [{ id: 't', description: 'd', sideEffect: 'read', command: ['x'] }];

function flowOf(flowExtra: Raw, ...steps: Raw[]): FlowDefinition {
	return { id: 'f', name: 'F', description: 'd', steps, ...flowExtra } as unknown as FlowDefinition;
}

const model = (extra: Raw = {}): Raw => ({
	id: 's',
	type: 'model',
	name: 's',
	prompt: 'p',
	hostTools: TOOLS,
	...extra,
});

function run(flow: FlowDefinition, policy = WARN, implicit: readonly string[] = []): MockIssueCollector['issues'] {
	const collector = new MockIssueCollector();
	new HostToolsConfinementValidator(collector, policy, implicit).validateFlow(flow);
	return collector.issues;
}

describe('HostToolsConfinementValidator - which steps are confined', () => {
	it.each([
		['step profile agent', flowOf({}, model({ profile: 'agent' })), 'profile "agent"'],
		['step profile inspect', flowOf({}, model({ profile: 'inspect' })), 'profile "inspect"'],
		['step profile untrusted-code', flowOf({}, model({ profile: 'untrusted-code' })), 'profile "untrusted-code"'],
		['step profile hermetic-test', flowOf({}, model({ profile: 'hermetic-test' })), 'profile "hermetic-test"'],
		['flow profile agent', flowOf({ profile: 'agent' }, model()), 'flow profile "agent"'],
		['flow profile hermetic-test', flowOf({ profile: 'hermetic-test' }, model()), 'flow profile "hermetic-test"'],
		['step requires fs=confined', flowOf({}, model({ requires: ['fs=confined'] })), 'requires "fs=confined"'],
		[
			'flow requires fs=confined',
			flowOf({ requires: ['sandbox', 'fs=confined'] }, model()),
			'flow requires "fs=confined"',
		],
	])('reports hostTools under %s', (_label, flow, reason) => {
		const issues = run(flow);
		expect(issues).toHaveLength(1);
		expect(issues[0]!.code).toBe(ValidationCode.HOST_TOOL_UNDER_CONFINED_PROFILE);
		expect(issues[0]!.message).toContain(reason);
		expect(issues[0]!.message).toContain("Step 's'");
		expect(issues[0]!.location).toMatchObject({ stepId: 's', field: 'hostTools' });
	});

	it('reports hostTools when the caller adds an implicit confinement (the daemon agent profile)', () => {
		const issues = run(flowOf({}, model()), WARN, ['env=clean', 'fs=confined']);
		expect(issues).toHaveLength(1);
		expect(issues[0]!.message).toContain('implicit requirements');
	});

	it.each([
		['no requirement at all', flowOf({}, model())],
		['requires that is not a confinement', flowOf({}, model({ requires: ['sandbox', 'env=clean'] }))],
		[
			'a step without hostTools under a confined profile',
			flowOf({ profile: 'agent' }, model({ hostTools: undefined })),
		],
		[
			'hostTools on a script step (another validator refuses it)',
			flowOf({ profile: 'agent' }, { id: 's', type: 'script', script: 'ls', hostTools: TOOLS }),
		],
	])('says nothing for %s', (_label, flow) => {
		expect(run(flow)).toEqual([]);
	});

	it('does not throw on a malformed profile or requires (RequirementValidator reports them)', () => {
		expect(run(flowOf({ profile: 'agnt' }, model({ requires: 'fs=confined' })))).toEqual([]);
		expect(run(flowOf({ profile: 12 }, model({ requires: [3] })))).toEqual([]);
	});

	it('reports each confined step with hostTools, once', () => {
		const flow = flowOf(
			{ profile: 'agent' },
			model({ id: 'a' }),
			model({ id: 'b', profile: 'inspect' }),
			model({ id: 'c', hostTools: undefined })
		);
		const issues = run(flow);
		expect(issues.map(issue => issue.location?.stepId)).toEqual(['a', 'b']);
	});
});

describe('HostToolsConfinementValidator - the mode comes from the caller', () => {
	it('is a warning in warn mode and carries the description it was given', () => {
		const issue = run(flowOf({}, model({ profile: 'agent' })), WARN)[0]!;
		expect(issue.severity).toBe('warning');
		expect(issue.message).toContain('warning (validation.hostToolsUnderConfinedProfile=warn, default)');
		expect(issue.message).toContain('Fix:');
		expect(issue.message).toContain('validation.hostToolsUnderConfinedProfile: error');
	});

	it('is an error in error mode and carries the description it was given', () => {
		const issue = run(flowOf({}, model({ profile: 'agent' })), ERROR)[0]!;
		expect(issue.severity).toBe('error');
		expect(issue.message).toContain('error (validation.hostToolsUnderConfinedProfile = error)');
		expect(issue.message).toContain('validation.hostToolsUnderConfinedProfile: warn');
	});

	it('names the user config file where the setting lives', () => {
		expect(run(flowOf({}, model({ profile: 'agent' })))[0]!.message).toContain('~/.config/flow/config.yml');
	});

	it('refuses a mode that is neither warn nor error instead of choosing one', () => {
		const broken = { mode: 'ignore', description: 'x' } as unknown as HostToolsConfinementPolicy;
		expect(() => run(flowOf({}, model({ profile: 'agent' })), broken)).toThrow(/mode/);
	});
});
