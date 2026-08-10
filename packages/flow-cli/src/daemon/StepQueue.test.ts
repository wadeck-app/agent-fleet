import { describe, expect, it } from 'vitest';

import type { AssignableStep, ExecutionContext, InjectedStep } from '../ipc/Protocol.js';
import { StepQueue } from './StepQueue.js';

function makeScriptStep(id: string): AssignableStep {
	return { id, name: id, type: 'script', script: 'echo test' };
}

function makeContext(executionId: string): ExecutionContext {
	return { executionId, inputs: {}, stepOutputs: {}, workspaceDir: '/tmp' };
}

describe('StepQueue', () => {
	it('enqueues steps with no dependencies immediately', () => {
		const q = new StepQueue();
		const ctx = makeContext('exec1');
		const step = makeScriptStep('s1');
		q.enqueueExecution(ctx, [step], new Map([['s1', []]]));
		expect(q.isEmpty()).toBe(false);
		expect(q.dequeue()?.stepId).toBe('s1');
	});

	it('withholds steps until dependencies complete', () => {
		const q = new StepQueue();
		const ctx = makeContext('exec2');
		const s1 = makeScriptStep('s1');
		const s2 = makeScriptStep('s2');
		q.enqueueExecution(
			ctx,
			[s1, s2],
			new Map([
				['s1', []],
				['s2', ['s1']],
			])
		);
		expect(q.dequeue()?.stepId).toBe('s1');
		expect(q.isEmpty()).toBe(true);
		q.onStepCompleted('exec2', 's1', {});
		expect(q.isEmpty()).toBe(false);
		expect(q.dequeue()?.stepId).toBe('s2');
	});

	it('marks execution as complete when all steps done', () => {
		const q = new StepQueue();
		const ctx = makeContext('exec3');
		const step = makeScriptStep('s1');
		q.enqueueExecution(ctx, [step], new Map([['s1', []]]));
		expect(q.hasActiveExecutions()).toBe(true);
		q.dequeue();
		q.onStepCompleted('exec3', 's1', {});
		expect(q.hasActiveExecutions()).toBe(false);
	});

	it('removes execution on step failure', () => {
		const q = new StepQueue();
		const ctx = makeContext('exec4');
		const s1 = makeScriptStep('s1');
		const s2 = makeScriptStep('s2');
		q.enqueueExecution(
			ctx,
			[s1, s2],
			new Map([
				['s1', []],
				['s2', []],
			])
		);
		q.dequeue(); // dequeue s1
		q.dequeue(); // dequeue s2
		q.onStepFailed('exec4', 's1');
		expect(q.hasActiveExecutions()).toBe(false);
	});

	it('handles parallel steps across executions', () => {
		const q = new StepQueue();
		const ctx1 = makeContext('e1');
		const ctx2 = makeContext('e2');
		q.enqueueExecution(ctx1, [makeScriptStep('a')], new Map([['a', []]]));
		q.enqueueExecution(ctx2, [makeScriptStep('b')], new Map([['b', []]]));
		const ids = [q.dequeue()?.stepId, q.dequeue()?.stepId].sort();
		expect(ids).toEqual(['a', 'b']);
	});

	describe('injectSteps', () => {
		it('adds new steps to active execution and enqueues ready ones', () => {
			const q = new StepQueue();
			const ctx = makeContext('exec-inject-1');
			const s1 = makeScriptStep('s1');
			q.enqueueExecution(ctx, [s1], new Map([['s1', []]]));
			q.dequeue(); // s1 is now active

			const injected: InjectedStep[] = [{ id: 'injected-1', type: 'script' }];
			q.injectSteps('exec-inject-1', injected);

			expect(q.isEmpty()).toBe(false);
			expect(q.dequeue()?.stepId).toBe('injected-1');
		});

		it('respects depends within injected steps referencing existing steps', () => {
			const q = new StepQueue();
			const ctx = makeContext('exec-inject-2');
			const s1 = makeScriptStep('s1');
			const s2 = makeScriptStep('s2');
			// s2 keeps execution alive while we inject
			q.enqueueExecution(
				ctx,
				[s1, s2],
				new Map([
					['s1', []],
					['s2', []],
				])
			);
			q.dequeue(); // dequeue s1
			q.dequeue(); // dequeue s2
			q.onStepCompleted('exec-inject-2', 's1', {}); // s1 done, s2 still active

			// Inject a step that depends on s1 (already completed, but s2 still active so execution alive)
			const injected: InjectedStep[] = [{ id: 'injected-dep', type: 'script', depends: ['s2'] }];
			q.injectSteps('exec-inject-2', injected);

			// injected-dep depends on s2, which is still active — should be withheld
			expect(q.isEmpty()).toBe(true);

			// When s2 completes, injected-dep should be ready
			q.onStepCompleted('exec-inject-2', 's2', {});
			expect(q.isEmpty()).toBe(false);
			expect(q.dequeue()?.stepId).toBe('injected-dep');
		});

		it('throws when execution id not found', () => {
			const q = new StepQueue();
			expect(() => q.injectSteps('nonexistent', [{ id: 's1', type: 'script' }])).toThrow('No active execution');
		});

		it('throws when injected step id already exists', () => {
			const q = new StepQueue();
			const ctx = makeContext('exec-inject-3');
			const s1 = makeScriptStep('s1');
			q.enqueueExecution(ctx, [s1], new Map([['s1', []]]));

			expect(() => q.injectSteps('exec-inject-3', [{ id: 's1', type: 'script' }])).toThrow(
				"Step id 's1' already exists"
			);
		});

		it('throws when parent step does not exist', () => {
			const q = new StepQueue();
			const ctx = makeContext('exec-inject-4');
			const s1 = makeScriptStep('s1');
			q.enqueueExecution(ctx, [s1], new Map([['s1', []]]));

			expect(() =>
				q.injectSteps('exec-inject-4', [{ id: 'child', type: 'script', parent: 'nonexistent' }])
			).toThrow("Parent step 'nonexistent' does not exist");
		});

		it('throws when dependency step does not exist', () => {
			const q = new StepQueue();
			const ctx = makeContext('exec-inject-5');
			const s1 = makeScriptStep('s1');
			q.enqueueExecution(ctx, [s1], new Map([['s1', []]]));

			expect(() =>
				q.injectSteps('exec-inject-5', [{ id: 'child', type: 'script', depends: ['missing-dep'] }])
			).toThrow("Dependency step 'missing-dep' does not exist");
		});

		it('throws when injected steps would exceed the max step cap', () => {
			const q = new StepQueue();
			const ctx = makeContext('exec-cap');
			// Enqueue an initial step so the execution is alive
			const s1 = makeScriptStep('s1');
			q.enqueueExecution(ctx, [s1], new Map([['s1', []]]));
			q.dequeue(); // s1 active, execution alive

			// Try to inject 1000 steps (cap is 1000 total, already have 1)
			const injected = Array.from({ length: 1000 }, (_, i) => ({
				id: `injected-${i}`,
				type: 'script' as const,
			}));
			expect(() => q.injectSteps('exec-cap', injected)).toThrow('exceed the maximum step count');
		});

		it('tracks parent-child metadata without affecting scheduling', () => {
			const q = new StepQueue();
			const ctx = makeContext('exec-inject-6');
			const s1 = makeScriptStep('s1');
			q.enqueueExecution(ctx, [s1], new Map([['s1', []]]));
			q.dequeue();

			const injected: InjectedStep[] = [{ id: 'child-step', type: 'script', parent: 's1' }];
			q.injectSteps('exec-inject-6', injected);

			// child-step should still be enqueued despite having a parent
			expect(q.isEmpty()).toBe(false);
			const step = q.dequeue();
			expect(step?.stepId).toBe('child-step');
		});
	});

	it('propagates stepOutputs on completion', () => {
		const q = new StepQueue();
		const ctx = makeContext('exec5');
		const s1 = makeScriptStep('s1');
		const s2 = makeScriptStep('s2');
		q.enqueueExecution(
			ctx,
			[s1, s2],
			new Map([
				['s1', []],
				['s2', ['s1']],
			])
		);
		q.dequeue();
		q.onStepCompleted('exec5', 's1', { stdout: 'hello' });
		const next = q.dequeue();
		expect(next?.executionContext.stepOutputs['s1']).toEqual({ stdout: 'hello' });
	});
});
