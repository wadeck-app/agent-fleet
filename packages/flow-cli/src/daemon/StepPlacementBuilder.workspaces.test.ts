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
