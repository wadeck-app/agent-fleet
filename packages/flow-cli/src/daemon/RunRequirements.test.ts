import type { FlowDefinition } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import { requirementsForStep, resolveRunRequirements } from './RunRequirements.js';

function flow(overrides: Record<string, unknown>, steps: Record<string, unknown>[]): FlowDefinition {
	return { id: 'f', version: '1.0.0', name: 'F', steps, ...overrides } as unknown as FlowDefinition;
}

const script = (id: string, extra: Record<string, unknown> = {}) => ({
	type: 'script',
	id,
	name: id,
	script: 'true',
	...extra,
});

describe('resolveRunRequirements', () => {
	it('is undefined when neither the flow nor any step requires anything', () => {
		expect(resolveRunRequirements(flow({}, [script('a')]))).toBeUndefined();
		expect(resolveRunRequirements(flow({ requires: [] }, [script('a', { requires: [] })]))).toBeUndefined();
	});

	it('merges the flow set into every declared step, sorted and without duplicates', () => {
		const resolved = resolveRunRequirements(
			flow({ requires: ['net=filtered', 'fs=confined'] }, [
				script('a'),
				script('b', { requires: ['env=clean', 'fs=confined'] }),
			])
		);

		expect(resolved).toEqual({
			run: ['fs=confined', 'net=filtered'],
			steps: { a: ['fs=confined', 'net=filtered'], b: ['env=clean', 'fs=confined', 'net=filtered'] },
		});
	});

	it('keeps a step own requirement when the flow has none', () => {
		const resolved = resolveRunRequirements(flow({}, [script('a'), script('b', { requires: ['sandbox'] })]));

		expect(resolved).toEqual({ run: [], steps: { a: [], b: ['sandbox'] } });
	});

	it('fails naming the flow when the flow requires is malformed', () => {
		expect(() => resolveRunRequirements(flow({ requires: 'fs=confined' }, [script('a')]))).toThrow(
			/Flow "f".*must be a list/
		);
	});

	it('fails naming the step when a step requires is malformed', () => {
		expect(() => resolveRunRequirements(flow({}, [script('a', { requires: ['a b'] })]))).toThrow(
			/Step "a".*Invalid requirement/
		);
	});
});

describe('requirementsForStep', () => {
	const recorded = { run: ['fs=confined'], steps: { a: ['env=clean', 'fs=confined'] } };

	it('uses the recorded set of a declared step and ignores what its config says now (a resume never resolves again)', () => {
		expect(requirementsForStep(recorded, 'a', ['gpu'])).toEqual(['env=clean', 'fs=confined']);
	});

	it('gives an injected step the requirements of the run plus its own', () => {
		expect(requirementsForStep(recorded, 'injected', undefined)).toEqual(['fs=confined']);
		expect(requirementsForStep(recorded, 'injected', ['gpu'])).toEqual(['fs=confined', 'gpu']);
	});

	it('gives a run that required nothing no requirement, and still honours an injected step own', () => {
		expect(requirementsForStep(undefined, 'a', undefined)).toEqual([]);
		expect(requirementsForStep(undefined, 'injected', ['gpu'])).toEqual(['gpu']);
	});

	it('fails naming the step when an injected step requires is malformed', () => {
		expect(() => requirementsForStep(recorded, 'injected', 'gpu')).toThrow(/Step "injected".*must be a list/);
	});
});

describe('profiles in resolveRunRequirements', () => {
	const agent = ['env=clean', 'fs=confined'];

	it('expands a flow-level profile into the run set and into every step', () => {
		const resolved = resolveRunRequirements(flow({ profile: 'agent' }, [script('a'), script('b')]));

		expect(resolved).toEqual({
			run: agent,
			steps: { a: agent, b: agent },
			profiles: { run: 'agent', steps: {} },
		});
	});

	it('unions the flow profile, the flow requires, the step profile and the step requires', () => {
		const resolved = resolveRunRequirements(
			flow({ profile: 'agent', requires: ['sandbox'] }, [
				script('a'),
				script('b', { profile: 'untrusted-code', requires: ['gpu'] }),
			])
		);

		expect(resolved?.run).toEqual([...agent, 'sandbox'].sort());
		expect(resolved?.steps.a).toEqual([...agent, 'sandbox'].sort());
		expect(resolved?.steps.b).toEqual([...agent, 'gpu', 'ports=private', 'sandbox'].sort());
		expect(resolved?.profiles).toEqual({ run: 'agent', steps: { b: 'untrusted-code' } });
	});

	it('a step-only profile leaves the run set and the other steps untouched', () => {
		const resolved = resolveRunRequirements(flow({}, [script('a'), script('b', { profile: 'inspect' })]));

		expect(resolved?.run).toEqual([]);
		expect(resolved?.steps.a).toEqual([]);
		expect(resolved?.steps.b).toEqual(['env=clean', 'fs=confined', 'fs=readonly-enforced']);
		expect(resolved?.profiles).toEqual({ steps: { b: 'inspect' } });
	});

	it('has no profiles field when none is declared (record unchanged for flows that use only requires)', () => {
		const resolved = resolveRunRequirements(flow({ requires: ['sandbox'] }, [script('a')]));

		expect(resolved).toEqual({ run: ['sandbox'], steps: { a: ['sandbox'] } });
	});

	it('fails naming the flow and the known profiles for an unknown flow profile', () => {
		expect(() => resolveRunRequirements(flow({ profile: 'agnt' }, [script('a')]))).toThrow(
			/Flow "f".*unknown profile "agnt".*Did you mean "agent"\?/s
		);
	});

	it('fails naming the step for an unknown step profile', () => {
		expect(() => resolveRunRequirements(flow({}, [script('a', { profile: 'nope' })]))).toThrow(
			/Step "a".*unknown profile "nope"/s
		);
	});
});

describe('profiles in requirementsForStep', () => {
	const recorded = {
		run: ['env=clean', 'fs=confined'],
		steps: { a: ['env=clean', 'fs=confined'] },
	};

	it('an injected step inherits the flow-level profile through the recorded run set', () => {
		expect(requirementsForStep(recorded, 'injected', undefined, undefined)).toEqual(recorded.run);
	});

	it('an injected step adds the expansion of its own profile', () => {
		expect(requirementsForStep(recorded, 'injected', undefined, 'untrusted-code')).toEqual([
			'env=clean',
			'fs=confined',
			'ports=private',
		]);
	});

	it('a declared step uses its recorded set and ignores a profile its config shows now (resume uses the stored set)', () => {
		expect(requirementsForStep(recorded, 'a', undefined, 'hermetic-test')).toEqual(recorded.steps.a);
	});

	it('fails naming the step when an injected step profile is unknown', () => {
		expect(() => requirementsForStep(recorded, 'injected', undefined, 'nope')).toThrow(
			/Step "injected".*unknown profile "nope"/s
		);
	});
});
