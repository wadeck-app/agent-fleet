import type { FlowScheduler } from 'flow-engine';
import { describe, expect, it } from 'vitest';

import type { ExecutionContext } from '../ipc/Protocol';
import { ExecutionRegistry } from './ExecutionRegistry.js';

function startedRegistry(executionId: string): ExecutionRegistry {
	const registry = new ExecutionRegistry();
	registry.start(executionId, {} as FlowScheduler, {} as ExecutionContext, []);
	return registry;
}

describe('ExecutionRegistry - worker type binding', () => {
	it('knows the worker type a run was bound to', () => {
		const registry = startedRegistry('e1');

		registry.bindWorkerType('e1', 'sandbox');

		expect(registry.boundWorkerTypeOf('e1')).toBe('sandbox');
	});

	it('knows no binding for a run that was not bound, and for an execution it never heard of', () => {
		const registry = startedRegistry('e1');

		expect([registry.boundWorkerTypeOf('e1'), registry.boundWorkerTypeOf('ghost')]).toEqual([undefined, undefined]);
	});

	it('keeps the binding of one run apart from the others', () => {
		const registry = startedRegistry('e1');
		registry.start('e2', {} as FlowScheduler, {} as ExecutionContext, []);

		registry.bindWorkerType('e1', 'sandbox');

		expect(registry.boundWorkerTypeOf('e2')).toBeUndefined();
	});

	// A run kept alive for `flow resume` is never removed, so its steps stay bound when it is resumed.
	it('keeps the binding of a run kept resumable', () => {
		const registry = startedRegistry('e1');
		registry.bindWorkerType('e1', 'sandbox');

		registry.markResumable('e1', 's1');

		expect(registry.boundWorkerTypeOf('e1')).toBe('sandbox');
	});

	it('forgets the binding with the execution', () => {
		const registry = startedRegistry('e1');
		registry.bindWorkerType('e1', 'sandbox');

		registry.remove('e1');

		expect(registry.boundWorkerTypeOf('e1')).toBeUndefined();
	});
});
