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

const PLACEMENTS = { main: ['sandbox'], linux: ['os=linux'] };

describe('resolveRunRequirements - placements', () => {
	it('the flow default placement reaches every step that names none', () => {
		const resolved = resolveRunRequirements(
			flow({ placements: PLACEMENTS, placement: 'main' }, [script('a'), script('b', { requires: ['x=1'] })])
		);
		expect(resolved).toEqual({ run: ['sandbox'], steps: { a: ['sandbox'], b: ['sandbox', 'x=1'] } });
	});

	it('a step placement REPLACES the default (the G2 override), flow requires stay added', () => {
		const resolved = resolveRunRequirements(
			flow({ placements: PLACEMENTS, placement: 'main', requires: ['fs=confined'] }, [
				script('a'),
				script('b', { placement: 'linux' }),
			])
		);
		expect(resolved).toEqual({
			run: ['fs=confined', 'sandbox'],
			steps: { a: ['fs=confined', 'sandbox'], b: ['fs=confined', 'os=linux'] },
		});
	});

	it('a step placement without a flow default adds only to that step', () => {
		const resolved = resolveRunRequirements(
			flow({ placements: PLACEMENTS }, [script('a'), script('b', { placement: 'linux' })])
		);
		expect(resolved).toEqual({ run: [], steps: { a: [], b: ['os=linux'] } });
	});

	it('an injected step inherits the default placement and nothing else', () => {
		const recorded = resolveRunRequirements(
			flow({ placements: PLACEMENTS, placement: 'main' }, [script('a', { placement: 'linux' })])
		);
		expect(requirementsForStep(recorded, 'injected', undefined)).toEqual(['sandbox']);
		expect(requirementsForStep(recorded, 'a', undefined)).toEqual(['os=linux']);
	});

	it('fails naming the step when its placement is unknown (guard for a path that skipped the validator)', () => {
		expect(() =>
			resolveRunRequirements(flow({ placements: PLACEMENTS }, [script('a', { placement: 'lnux' })]))
		).toThrow(/Step "a": unknown placement "lnux".*Did you mean "linux"\?/);
	});
});
