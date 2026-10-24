import { describe, expect, it } from 'vitest';

import type { FlowDefinition } from '../types';
import { SubStepDependencyValidator } from './SubStepDependencyValidator';
import { SubStepWaveValidator } from './SubStepWaveValidator';
import { ValidationCode, type ValidationIssue } from './ValidationTypes';

class MockIssueCollector {
	public issues: ValidationIssue[] = [];

	addIssue(issue: ValidationIssue): void {
		this.issues.push(issue);
	}
}

type StepSpec = Record<string, unknown> & { id: string };

function flowOf(...steps: StepSpec[]): FlowDefinition {
	return {
		id: 'f',
		version: '1.0.0',
		name: 'F',
		description: '',
		workspace: { mode: 'isolated', gitStrategy: 'main-only', reusePolicy: 'always' },
		inputs: {},
		steps: steps.map(s => ({ type: 'script', name: s.id, script: 'true', ...s })),
	} as unknown as FlowDefinition;
}

const impl = (extra: Record<string, unknown> = {}): StepSpec => ({
	id: 'impl',
	type: 'model',
	prompt: 'p',
	subStepStrategy: 'waves',
	...extra,
});
const sub = (id: string, wave: number | undefined, extra: Record<string, unknown> = {}): StepSpec => ({
	id,
	parent: 'impl',
	...(wave === undefined ? {} : { wave }),
	...extra,
});

function run(flow: FlowDefinition): ValidationIssue[] {
	const collector = new MockIssueCollector();
	new SubStepWaveValidator(collector).validate(flow);
	return collector.issues;
}

function codes(flow: FlowDefinition): string[] {
	return run(flow).map(i => i.code);
}

describe('SubStepWaveValidator', () => {
	it('no wave issue for a valid 3-wave flow', () => {
		const flow = flowOf(
			impl(),
			sub('a', 1),
			sub('b', 1),
			sub('r', 2, { type: 'model', prompt: 'p' }),
			{ id: 'v', parent: 'r' },
			sub('c', 3)
		);
		expect(run(flow)).toEqual([]);
	});

	it('accepts gaps and wave 0', () => {
		expect(run(flowOf(impl(), sub('a', 0), sub('b', 10), sub('c', 20)))).toEqual([]);
	});

	it('errors on a direct sub-step of a waves parent without wave', () => {
		const issues = run(flowOf(impl(), sub('a', 1), sub('c', 2), sub('b', undefined)));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			severity: 'error',
			code: ValidationCode.SUB_STEP_WAVE_MISSING,
			location: { stepId: 'b', field: 'wave' },
		});
		expect(issues[0]?.message).toContain("'impl' uses subStepStrategy: waves");
		expect(issues[0]?.suggestion).toContain('wave: 1');
	});

	it('errors on wave on a step without parent', () => {
		const issues = run(flowOf({ id: 'solo', wave: 1 }));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ severity: 'error', code: ValidationCode.SUB_STEP_WAVE_WITHOUT_PARENT });
	});

	it('errors on wave on a sub-step whose parent uses another strategy', () => {
		const flow = flowOf(impl({ subStepStrategy: 'wait-all' }), sub('a', 1), sub('b', 2));
		const issues = run(flow);
		expect(issues.map(i => i.code)).toEqual([
			ValidationCode.SUB_STEP_WAVE_STRATEGY_MISMATCH,
			ValidationCode.SUB_STEP_WAVE_STRATEGY_MISMATCH,
		]);
		expect(issues[0]?.message).toContain('wait-all');
		expect(issues[0]?.suggestion).toContain('subStepStrategy: waves');
	});

	it('errors on wave on a parent without any strategy (default restart-on-first-failure)', () => {
		const flow = flowOf(impl({ subStepStrategy: undefined }), sub('a', 1));
		expect(codes(flow)).toEqual([ValidationCode.SUB_STEP_WAVE_STRATEGY_MISMATCH]);
	});

	it('errors on wave on a nested sub-step and names the ancestor it inherits from', () => {
		const flow = flowOf(impl(), sub('a', 1), sub('r', 2), { id: 'v', parent: 'r', wave: 3 });
		const issues = run(flow);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ severity: 'error', code: ValidationCode.SUB_STEP_WAVE_NESTED });
		expect(issues[0]?.message).toContain("inherited from 'r'");
	});

	it.each([-1, 1.5, Number.NaN, '2', null])('errors on wave that is not a non-negative integer: %s', bad => {
		const flow = flowOf(impl(), sub('a', 1), sub('c', 2), { id: 'b', parent: 'impl', wave: bad });
		const issues = run(flow);
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ severity: 'error', code: ValidationCode.SUB_STEP_WAVE_INVALID });
		expect(issues[0]?.message).toContain(bad === null ? 'null' : JSON.stringify(bad));
	});

	it('warns when a waves parent has fewer than 2 distinct waves', () => {
		const issues = run(flowOf(impl(), sub('a', 1), sub('b', 1)));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ severity: 'warning', code: ValidationCode.SUB_STEP_WAVES_SINGLE_WAVE });
		expect(issues[0]?.suggestion).toContain('wait-all');
	});

	it('warns on depends to an earlier-wave sibling, with the removal as suggestion', () => {
		const issues = run(flowOf(impl(), sub('a', 1), sub('b', 2, { depends: ['a'] })));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({
			severity: 'warning',
			code: ValidationCode.WAVE_REDUNDANT_DEPENDS,
			location: { stepId: 'b', field: 'depends' },
		});
		expect(issues[0]?.suggestion).toContain("Remove 'a'");
	});

	it('errors on depends to a later-wave sibling (can never be satisfied)', () => {
		const issues = run(flowOf(impl(), sub('a', 1, { depends: ['b'] }), sub('b', 2)));
		expect(issues).toHaveLength(1);
		expect(issues[0]).toMatchObject({ severity: 'error', code: ValidationCode.WAVE_LATER_DEPENDS });
	});

	it('resolves depends on a nested sub-step to the wave of its ancestor', () => {
		const flow = flowOf(
			impl(),
			sub('a', 1),
			sub('r', 2),
			{ id: 'v', parent: 'r' },
			sub('c', 3, { depends: ['v'] })
		);
		expect(codes(flow)).toEqual([ValidationCode.WAVE_REDUNDANT_DEPENDS]);
	});

	it('allows depends inside the same wave (unchanged semantics)', () => {
		expect(run(flowOf(impl(), sub('a', 1), sub('b', 1, { depends: ['a'] }), sub('c', 2)))).toEqual([]);
	});

	it('does not touch depends on non-siblings', () => {
		const flow = flowOf(
			{ id: 'setup' },
			impl({ depends: ['setup'] }),
			sub('a', 1, { depends: ['setup'] }),
			sub('b', 2)
		);
		expect(run(flow)).toEqual([]);
	});

	describe('subStepStrategy values', () => {
		it.each(['restart-on-first-failure', 'wait-all', 'waves'])('accepts %s', strategy => {
			const flow = flowOf(impl({ subStepStrategy: strategy }));
			expect(codes(flow)).not.toContain(ValidationCode.SUB_STEP_STRATEGY_UNKNOWN);
		});

		it('errors on an unknown strategy and lists the valid values', () => {
			const issues = run(flowOf(impl({ subStepStrategy: 'wave' })));
			expect(issues).toHaveLength(1);
			expect(issues[0]).toMatchObject({
				severity: 'error',
				code: ValidationCode.SUB_STEP_STRATEGY_UNKNOWN,
				location: { stepId: 'impl', field: 'subStepStrategy' },
			});
			expect(issues[0]?.message).toContain('"wave"');
			expect(issues[0]?.suggestion).toContain('restart-on-first-failure, wait-all, waves');
		});
	});
});

describe('SubStepDependencyValidator next to waves', () => {
	it('wait-all depends warning unchanged, absent for waves', () => {
		const siblingDepends = (strategy: string): FlowDefinition =>
			flowOf(impl({ subStepStrategy: strategy }), sub('a', 1), sub('b', 1, { depends: ['a'] }), sub('c', 2));
		const collect = (flow: FlowDefinition): string[] => {
			const collector = new MockIssueCollector();
			new SubStepDependencyValidator(collector).validate(flow);
			return collector.issues.map(i => i.code);
		};
		expect(collect(siblingDepends('wait-all'))).toEqual([ValidationCode.SUB_STEP_SIBLING_DEPENDENCY]);
		expect(collect(siblingDepends('waves'))).toEqual([]);
	});
});
