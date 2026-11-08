import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition, FlowStep } from '../types';
import { RequirementValidator } from './RequirementValidator';
import { ValidationCode } from './ValidationTypes';

let collector: MockIssueCollector;

beforeEach(() => {
	collector = new MockIssueCollector();
});

function flow(requires: unknown): FlowDefinition {
	return { id: 'f', name: 'F', requires, steps: [] } as unknown as FlowDefinition;
}

function step(requires: unknown): FlowStep {
	return { type: 'script', id: 's1', name: 'S1', script: 'echo', requires } as unknown as FlowStep;
}

describe('RequirementValidator - syntax (offline, no known list)', () => {
	it('accepts keyword, key=value and duplicates, at flow and step level', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow(['sandbox', 'fs=confined', 'sandbox']));
		validator.validateStep(step(['sandbox', 'fs=confined', 'fs=confined']));
		expect(collector.issues).toHaveLength(0);
	});

	it('accepts absent requires', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow(undefined));
		validator.validateStep(step(undefined));
		expect(collector.issues).toHaveLength(0);
	});

	it('accepts an unknown key when no known list is given', () => {
		new RequirementValidator(collector).validateFlow(flow(['whatever=1']));
		expect(collector.issues).toHaveLength(0);
	});

	it('flow: a non-list is an error located on the flow field', () => {
		new RequirementValidator(collector).validateFlow(flow('sandbox'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.INVALID_TYPE,
			location: { field: 'requires' },
		});
		expect(collector.issues[0]!.message).toContain('must be a list');
		expect(collector.issues[0]!.suggestion).toBeTruthy();
	});

	it('step: a non-string entry is an error located on the step', () => {
		new RequirementValidator(collector).validateStep(step([1]));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.INVALID_TYPE,
			location: { stepId: 's1', field: 'requires' },
		});
	});

	it('reports every malformed entry, not only the first', () => {
		new RequirementValidator(collector).validateFlow(flow(['a b', 'x|y', 'ok']));
		expect(collector.issues).toHaveLength(2);
		expect(collector.issues.every(i => i.code === ValidationCode.INVALID_VALUE)).toBe(true);
		expect(collector.issues[0]!.message).toContain('Invalid requirement');
	});
});

describe('RequirementValidator - with known guarantees', () => {
	const known = ['fs=confined', 'env=clean', 'sandbox'];

	it('accepts entries in the list', () => {
		const validator = new RequirementValidator(collector, known);
		validator.validateFlow(flow(['fs=confined', 'sandbox']));
		validator.validateStep(step(['env=clean']));
		expect(collector.issues).toHaveLength(0);
	});

	it('rejects an unknown entry, lists known ones and proposes the near match', () => {
		new RequirementValidator(collector, known).validateStep(step(['fs=confind']));
		expect(collector.issues).toHaveLength(1);
		const issue = collector.issues[0]!;
		expect(issue).toMatchObject({ severity: 'error', location: { stepId: 's1', field: 'requires' } });
		expect(issue.message).toContain('unknown requirement "fs=confind"');
		expect(issue.message).toContain('fs=confined, env=clean, sandbox');
		expect(issue.suggestion).toContain('Did you mean "fs=confined"?');
	});

	it('rejects an unknown entry at flow level without a near match', () => {
		new RequirementValidator(collector, known).validateFlow(flow(['gpu=a100']));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.suggestion).not.toContain('Did you mean');
		expect(collector.issues[0]!.location).toEqual({ field: 'requires' });
	});

	it('caps the listed known entries at 10', () => {
		const many = Array.from({ length: 12 }, (_, i) => `k${i}=v`);
		new RequirementValidator(collector, many).validateFlow(flow(['zzzzzz']));
		const message = collector.issues[0]!.message;
		expect(message).toContain('k9=v');
		expect(message).not.toContain('k10=v');
		expect(message).toContain('2 more');
	});

	it('empty list: says no worker source declares any guarantee', () => {
		new RequirementValidator(collector, []).validateFlow(flow(['sandbox']));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('no worker source declares any guarantee');
	});

	it('a malformed entry is reported once, as syntax, not as unknown', () => {
		new RequirementValidator(collector, known).validateFlow(flow(['a b']));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('Invalid requirement');
	});
});
