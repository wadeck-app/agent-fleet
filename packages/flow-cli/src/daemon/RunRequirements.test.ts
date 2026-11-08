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
