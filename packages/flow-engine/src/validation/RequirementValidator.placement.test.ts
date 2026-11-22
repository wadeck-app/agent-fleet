import { MockIssueCollector } from 'flow-engine/test-utils/mocks';
import { beforeEach, describe, expect, it } from 'vitest';

import type { FlowDefinition, FlowStep } from '../types';
import { RequirementValidator } from './RequirementValidator';
import { ValidationCode } from './ValidationTypes';

let collector: MockIssueCollector;

beforeEach(() => {
	collector = new MockIssueCollector();
});

function flow(extra: Record<string, unknown>): FlowDefinition {
	return { id: 'f', name: 'F', steps: [], ...extra } as unknown as FlowDefinition;
}

function step(placement: unknown): FlowStep {
	return { type: 'script', id: 's1', name: 'S1', script: 'echo', placement } as unknown as FlowStep;
}

const PLACEMENTS = { main: ['sandbox'], linux: ['os=linux'] };

describe('RequirementValidator - placements (offline)', () => {
	it('accepts declared placements, a default and a step choice', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow({ placements: PLACEMENTS, placement: 'main' }));
		validator.validateStep(step('linux'));
		expect(collector.issues).toHaveLength(0);
	});

	it('accepts no placement at all', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow({}));
		validator.validateStep(step(undefined));
		expect(collector.issues).toHaveLength(0);
	});

	it('step: an unknown name is an error with the declared names and a did-you-mean', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow({ placements: PLACEMENTS }));
		validator.validateStep(step('lnux'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.INVALID_VALUE,
			location: { stepId: 's1', field: 'placement' },
		});
		expect(collector.issues[0]!.message).toContain('unknown placement "lnux"');
		expect(collector.issues[0]!.message).toContain('Declared placements: linux, main.');
		expect(collector.issues[0]!.message).toContain('Did you mean "linux"?');
	});

	it('flow: an unknown default is an error', () => {
		new RequirementValidator(collector).validateFlow(flow({ placements: PLACEMENTS, placement: 'mian' }));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('Did you mean "main"?');
		expect(collector.issues[0]!.location).toEqual({ field: 'placement' });
	});

	it('a step placement without any declared placements says so', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow({}));
		validator.validateStep(step('main'));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('the flow declares no placements');
	});

	it('a non-string placement is a type error', () => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow({ placements: PLACEMENTS }));
		validator.validateStep(step(['main']));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({ code: ValidationCode.INVALID_TYPE });
	});

	it.each([[[]], [{}], ['main'], [null]])('placements %j (empty or not a map) is an error', placements => {
		new RequirementValidator(collector).validateFlow(flow({ placements }));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.INVALID_TYPE,
			location: { field: 'placements' },
		});
	});

	it.each([[[]], ['sandbox'], [null]])('a placement whose value is %j is an error, reported once', value => {
		const validator = new RequirementValidator(collector);
		validator.validateFlow(flow({ placements: { main: value }, placement: 'main' }));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('placement "main" must be a non-empty list');
		expect(collector.issues[0]!.location).toEqual({ field: 'placements.main' });
	});

	it('a malformed entry in a placement uses the requires syntax check', () => {
		new RequirementValidator(collector).validateFlow(flow({ placements: { main: ['a|b'] } }));
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]).toMatchObject({ code: ValidationCode.INVALID_VALUE });
		expect(collector.issues[0]!.message).toContain("placement 'main'");
	});

	it('with declared guarantees, an entry no source guarantees is an error', () => {
		new RequirementValidator(collector, ['sandbox', 'os=linux']).validateFlow(
			flow({ placements: { main: ['sandbxo'] } })
		);
		expect(collector.issues).toHaveLength(1);
		expect(collector.issues[0]!.message).toContain('unknown requirement "sandbxo"');
	});
});
