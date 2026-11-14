import { describe, expect, it } from 'vitest';

import { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ReadyStep } from './ReadyStepQueue.js';
import { StepPlacementBuilder } from './StepPlacementBuilder.js';

function ready(executionId: string, stepId: string): ReadyStep {
	return {
		stepId,
		stepConfig: { id: stepId, type: 'script' } as never,
		executionContext: { executionId } as never,
	};
}

describe('StepPlacementBuilder - workspace kind', () => {
	it('carries the kind recorded for the run, for declared and injected steps alike', () => {
		const registry = new ExecutionRegistry();
		registry.bindWorkspaceKind('e1', 'pool');
		const builder = new StepPlacementBuilder(registry);

		expect(builder.describe(ready('e1', 'declared')).workspaceKind).toBe('pool');
		expect(builder.describe(ready('e1', 'injected-later')).workspaceKind).toBe('pool');
	});

	it('carries none when the kind of the run is unknown (the routing then fails closed on restricted sources)', () => {
		const placement = new StepPlacementBuilder(new ExecutionRegistry()).describe(ready('e1', 's'));

		expect(placement).not.toHaveProperty('workspaceKind');
	});
});

describe('StepPlacementBuilder - implicit confinement', () => {
	const agent = ['env=clean', 'fs=confined'];

	function registryWithImplicit(): ExecutionRegistry {
		const registry = new ExecutionRegistry();
		registry.bindRequirements('e1', { run: [], steps: { m: agent }, implicit: { requires: agent, steps: ['m'] } });
		return registry;
	}
	const injected = (type: string): ReadyStep => ({
		stepId: 'injected',
		stepConfig: { id: 'injected', type } as never,
		executionContext: { executionId: 'e1' } as never,
	});

	it('requires the implicit set of an injected model step: it inherits the rule of its parent', () => {
		expect(new StepPlacementBuilder(registryWithImplicit()).describe(injected('model')).requires).toEqual(agent);
	});

	it('requires the implicit set of an injected script step: code the agent adds must stay in the sandbox', () => {
		expect(new StepPlacementBuilder(registryWithImplicit()).describe(injected('script')).requires).toEqual(agent);
	});

	it('still requires nothing of a script step the flow defines', () => {
		const registry = new ExecutionRegistry();
		registry.bindRequirements('e1', {
			run: [],
			steps: { m: agent, s: [] },
			implicit: { requires: agent, steps: ['m'] },
		});
		const placement = new StepPlacementBuilder(registry).describe({
			stepId: 's',
			stepConfig: { id: 's', type: 'script' } as never,
			executionContext: { executionId: 'e1' } as never,
		});

		expect(placement).not.toHaveProperty('requires');
	});

	it('adds nothing to an injected script step of a run recorded without implicit set', () => {
		const registry = new ExecutionRegistry();
		registry.bindRequirements('e1', { run: [], steps: { m: [] } });

		expect(new StepPlacementBuilder(registry).describe(injected('script'))).not.toHaveProperty('requires');
	});
});
