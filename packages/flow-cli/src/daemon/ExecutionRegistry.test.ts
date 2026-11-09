import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import type { ExecutionContext } from '../ipc/Protocol';
import { ExecutionRegistry } from './ExecutionRegistry.js';

function startedRegistry(executionId: string): ExecutionRegistry {
	const registry = new ExecutionRegistry();
	registry.start(executionId, {} as FlowScheduler, {} as ExecutionContext, []);
	return registry;
}

describe('ExecutionRegistry - what a run is bound to', () => {
	it('knows the requirements recorded for a run, none for a run without and for an unknown execution', () => {
		const registry = startedRegistry('e1');
		registry.start('e2', {} as FlowScheduler, {} as ExecutionContext, []);
		const recorded = { run: ['fs=confined'], steps: { a: ['fs=confined'] } };

		registry.bindRequirements('e1', recorded);

		expect([
			registry.requirementsOf('e1'),
			registry.requirementsOf('e2'),
			registry.requirementsOf('ghost'),
		]).toEqual([recorded, undefined, undefined]);
	});

	it('keeps the requirements of a run kept resumable, and forgets them with the execution', () => {
		const registry = startedRegistry('e1');
		registry.bindRequirements('e1', { run: ['x'], steps: {} });

		registry.markResumable('e1', 's1');
		expect(registry.requirementsOf('e1')).toEqual({ run: ['x'], steps: {} });

		registry.remove('e1');
		expect(registry.requirementsOf('e1')).toBeUndefined();
	});
});

describe('ExecutionRegistry - workspace kind', () => {
	it('knows the workspace kind of a run, none for an unknown execution, and forgets it with the execution', () => {
		const registry = startedRegistry('e1');

		registry.bindWorkspaceKind('e1', 'pool');
		expect([registry.workspaceKindOf('e1'), registry.workspaceKindOf('ghost')]).toEqual(['pool', undefined]);

		registry.remove('e1');
		expect(registry.workspaceKindOf('e1')).toBeUndefined();
	});
});
