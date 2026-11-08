import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition, FlowStep } from '../types';
import { RequirementValidator } from './RequirementValidator';
import { ValidationCode } from './ValidationTypes';

let collector: MockIssueCollector;

beforeEach(() => {
	collector = new MockIssueCollector();
});

function flow(profile: unknown): FlowDefinition {
	return { id: 'f', name: 'F', profile, steps: [] } as unknown as FlowDefinition;
}

function step(profile: unknown): FlowStep {
	return { type: 'script', id: 's1', name: 'S1', script: 'echo', profile } as unknown as FlowStep;
}

describe('RequirementValidator - profile (offline)', () => {
	it.each(['agent', 'inspect', 'untrusted-code', 'hermetic-test'])(
		'accepts the built-in %s at flow and step level',
		name => {
			const validator = new RequirementValidator(collector);
			validator.validateFlow(flow(name));
			validator.validateStep(step(name));
			expect(collector.issues).toHaveLength(0);
		}
	);

	it('accepts an absent profile', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow(undefined));
		validator.validateStep(step(undefined));
		expect(collector.issues).toHaveLength(0);
	});

	it('flow: an unknown profile is an error with the known list and a did-you-mean', () => {
		new RequirementValidator(collector).validateFlow(flow('agnt'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.INVALID_VALUE,
			location: { field: 'profile' },
		});
		expect(collector.issues[0]!.message).toContain(`Flow 'f'`);
		expect(collector.issues[0]!.message).toContain('unknown profile "agnt"');
		expect(collector.issues[0]!.message).toContain('agent, hermetic-test, inspect, untrusted-code');
		expect(collector.issues[0]!.message).toContain('Did you mean "agent"?');
	});

	it('step: an unknown profile is located on the step', () => {
		new RequirementValidator(collector).validateStep(step('nope-nope'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			code: ValidationCode.INVALID_VALUE,
			location: { stepId: 's1', field: 'profile' },
		});
		expect(collector.issues[0]!.message).toContain(`Step 's1'`);
		expect(collector.issues[0]!.suggestion).toContain('Write one of');
	});

	it.each([[['agent']], [1], [{}]])('a non-string %j is an INVALID_TYPE asking for one name', value => {
		new RequirementValidator(collector).validateFlow(flow(value));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			code: ValidationCode.INVALID_TYPE,
			location: { field: 'profile' },
		});
		expect(collector.issues[0]!.message).toContain('profile must be a single name');
	});

	it('says that the availability of the guarantees is checked at run start', () => {
		new RequirementValidator(collector).validateFlow(flow('nope'));
		expect(collector.issues[0]!.suggestion).toContain('run start');
	});
});

describe('RequirementValidator - profile against declared guarantees (daemon)', () => {
	const ALL = ['clean=run', 'env=clean', 'fs=confined', 'net=filtered', 'ports=private', 'sandbox'];

	it('accepts a profile whose requirements are all declared', () => {
		new RequirementValidator(collector, ALL).validateFlow(flow('untrusted-code'));
		expect(collector.issues).toHaveLength(0);
	});

	// What the sandbox plugin declares today (plugin.config.js GUARANTEES).
	const SANDBOX_TODAY = ['clean=run', 'env=clean', 'fs=confined', 'ports=private', 'sandbox'];

	it.each(['agent', 'untrusted-code', 'hermetic-test'])(
		'accepts %s against what the sandbox plugin declares today',
		name => {
			new RequirementValidator(collector, SANDBOX_TODAY).validateFlow(flow(name));
			expect(collector.issues).toHaveLength(0);
		}
	);

	it('refuses a profile whose requirement no declared source guarantees, naming the profile and the missing entries', () => {
		const declared = ['clean=run', 'env=clean', 'fs=confined', 'ports=private', 'sandbox'];
		new RequirementValidator(collector, declared).validateStep(step('inspect'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.INVALID_VALUE,
			location: { stepId: 's1', field: 'profile' },
		});
		expect(collector.issues[0]!.message).toContain(`profile "inspect"`);
		expect(collector.issues[0]!.message).toContain('fs=readonly-enforced');
		expect(collector.issues[0]!.message).not.toContain('net=filtered');
		expect(collector.issues[0]!.message).toContain('Declared guarantees: clean=run');
		expect(collector.issues[0]!.suggestion).toContain('flow worker source list');
	});

	it('says no source declares anything when the declared list is empty', () => {
		new RequirementValidator(collector, []).validateFlow(flow('agent'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('no worker source declares any guarantee');
	});

	it('an unknown profile reports the name once, not the guarantee check', () => {
		new RequirementValidator(collector, ALL).validateFlow(flow('agnt'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('unknown profile');
	});
});
