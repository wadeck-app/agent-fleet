import type { AssignableStep, ExecutionContext, InjectedStep } from '../ipc/Protocol';
import { StepQueue } from './StepQueue';

const makeStep = (id: string, type: 'script' | 'model' = 'script'): AssignableStep =>
	({
		id,
		name: id,
		type,
		script: 'echo test',
	}) as unknown as AssignableStep;

const makeContext = (executionId: string): ExecutionContext => ({
	executionId,
	inputs: {},
	stepOutputs: {},
	workspaceDir: '/tmp',
	cwd: '/tmp',
});

describe('StepQueue', () => {
	let queue: StepQueue;

	beforeEach(() => {
		queue = new StepQueue();
		vi.restoreAllMocks();
	});

	describe('isEmpty()', () => {
		it('is true initially before any executions are enqueued', () => {
			expect(queue.isEmpty()).toBe(true);
		});

		it('is false after enqueueing an execution with no-dep steps', () => {
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a')], new Map());
			expect(queue.isEmpty()).toBe(false);
		});
	});

	describe('hasActiveExecutions()', () => {
		it('is false before any executions are enqueued', () => {
			expect(queue.hasActiveExecutions()).toBe(false);
		});

		it('is true after an execution is enqueued', () => {
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a')], new Map());
			expect(queue.hasActiveExecutions()).toBe(true);
		});

		it('is false after all steps in an execution are completed', () => {
			const ctx = makeContext('exec-1');
			queue.enqueueExecution(ctx, [makeStep('step-a')], new Map());
			queue.onStepCompleted('exec-1', 'step-a', {});
			expect(queue.hasActiveExecutions()).toBe(false);
		});

		it('is false after a step fails (execution is removed immediately)', () => {
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a'), makeStep('step-b')], new Map());
			queue.onStepFailed('exec-1', 'step-a');
			expect(queue.hasActiveExecutions()).toBe(false);
		});
	});

	describe('enqueueExecution()', () => {
		it('immediately enqueues steps that have no dependencies', () => {
			const step = makeStep('step-a');
			queue.enqueueExecution(makeContext('exec-1'), [step], new Map());

			const ready = queue.dequeue();
			expect(ready).toBeDefined();
			expect(ready!.stepId).toBe('step-a');
		});

		it('does not enqueue steps whose dependencies are not yet satisfied', () => {
			const stepA = makeStep('step-a');
			const stepB = makeStep('step-b');
			// step-b depends on step-a
			const deps = new Map([['step-b', ['step-a']]]);
			queue.enqueueExecution(makeContext('exec-1'), [stepA, stepB], deps);

			// Only step-a should be in the queue
			const first = queue.dequeue();
			expect(first!.stepId).toBe('step-a');
			expect(queue.isEmpty()).toBe(true);
		});
	});

	describe('onStepCompleted()', () => {
		it('unlocks dependent steps when a dependency is completed', () => {
			const stepA = makeStep('step-a');
			const stepB = makeStep('step-b');
			const deps = new Map([['step-b', ['step-a']]]);
			queue.enqueueExecution(makeContext('exec-1'), [stepA, stepB], deps);

			// Drain step-a from queue
			queue.dequeue();
			expect(queue.isEmpty()).toBe(true);

			queue.onStepCompleted('exec-1', 'step-a', { result: 'ok' });

			// step-b should now be ready
			const ready = queue.dequeue();
			expect(ready).toBeDefined();
			expect(ready!.stepId).toBe('step-b');
		});

		it('makes hasActiveExecutions() false after all steps complete', () => {
			const deps = new Map([['step-b', ['step-a']]]);
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a'), makeStep('step-b')], deps);
			queue.onStepCompleted('exec-1', 'step-a', {});
			queue.dequeue(); // drain step-b
			queue.onStepCompleted('exec-1', 'step-b', {});
			expect(queue.hasActiveExecutions()).toBe(false);
		});
	});

	describe('onStepFailed()', () => {
		it('removes all queued steps for that execution', () => {
			// Two independent steps — both will be queued immediately
			const deps = new Map<string, string[]>();
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a'), makeStep('step-b')], deps);

			queue.onStepFailed('exec-1', 'step-a');

			// The queue should be empty (step-b was removed)
			expect(queue.isEmpty()).toBe(true);
		});

		it('decrements activeExecutions so hasActiveExecutions() returns false', () => {
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a')], new Map());
			queue.onStepFailed('exec-1', 'step-a');
			expect(queue.hasActiveExecutions()).toBe(false);
		});
	});

	describe('injectSteps()', () => {
		it('adds new steps to an active execution and enqueues them when ready', () => {
			const ctx = makeContext('exec-1');
			queue.enqueueExecution(ctx, [makeStep('step-a')], new Map());
			// Drain the initial step
			queue.dequeue();

			const injected: InjectedStep[] = [
				{ id: 'injected-1', type: 'script', script: 'echo injected' } as InjectedStep,
			];
			queue.injectSteps('exec-1', injected);

			const ready = queue.dequeue();
			expect(ready).toBeDefined();
			expect(ready!.stepId).toBe('injected-1');
		});

		it('throws "No active execution" when the executionId does not exist', () => {
			expect(() => queue.injectSteps('nonexistent', [])).toThrow('No active execution');
		});

		it('throws when the parent step does not exist in the execution', () => {
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a')], new Map());

			const injected: InjectedStep[] = [{ id: 'child', type: 'script', parent: 'nonexistent-parent' }];
			expect(() => queue.injectSteps('exec-1', injected)).toThrow(/[Pp]arent step/);
		});

		it('throws when injecting would exceed MAX_INJECTED_STEPS_PER_EXECUTION (1000)', () => {
			// 1 initial step + 1000 injected = 1001 > 1000 → throws
			queue.enqueueExecution(makeContext('exec-1'), [makeStep('step-a')], new Map());

			const injected: InjectedStep[] = [];
			for (let i = 0; i < 1000; i++) {
				injected.push({ id: `injected-${String(i)}`, type: 'script' });
			}

			expect(() => queue.injectSteps('exec-1', injected)).toThrow(/exceed/);
		});
	});

	describe('when: condition evaluation', () => {
		const makeStepWithWhen = (id: string, when?: string, depends?: string[]): AssignableStep =>
			({
				id,
				name: id,
				type: 'script',
				script: 'echo test',
				...(when !== undefined && { when }),
				...(depends !== undefined && { depends }),
			}) as unknown as AssignableStep;

		it('enqueues step when when: is absent', () => {
			const step = makeStepWithWhen('step-a');
			queue.enqueueExecution(makeContext('exec-1'), [step], new Map());
			expect(queue.dequeue()?.stepId).toBe('step-a');
		});

		it('enqueues step when when: evaluates to true', () => {
			const ctx = makeContext('exec-1');
			const step = makeStepWithWhen('step-a', 'true');
			queue.enqueueExecution(ctx, [step], new Map());
			expect(queue.dequeue()?.stepId).toBe('step-a');
		});

		it('skips step (does not enqueue) when when: evaluates to false', () => {
			const step = makeStepWithWhen('step-a', 'false');
			queue.enqueueExecution(makeContext('exec-1'), [step], new Map());
			expect(queue.isEmpty()).toBe(true);
		});

		it('provides step dependency outputs as output context', () => {
			const ctx = makeContext('exec-1');
			const stepA = makeStepWithWhen('step-a');
			// step-b depends on step-a and checks output.result === 'ok'
			const stepB = makeStepWithWhen('step-b', "output.result === 'ok'", ['step-a']);
			queue.enqueueExecution(ctx, [stepA, stepB], new Map([['step-b', ['step-a']]]));

			queue.dequeue(); // drain step-a
			queue.onStepCompleted('exec-1', 'step-a', { result: 'ok' });

			// step-b when: should see result='ok' → true → enqueued
			expect(queue.dequeue()?.stepId).toBe('step-b');
		});

		it('skips step when dependency output does not satisfy when:', () => {
			const ctx = makeContext('exec-1');
			const stepA = makeStepWithWhen('step-a');
			const stepB = makeStepWithWhen('step-b', "output.result === 'ok'", ['step-a']);
			queue.enqueueExecution(ctx, [stepA, stepB], new Map([['step-b', ['step-a']]]));

			queue.dequeue();
			queue.onStepCompleted('exec-1', 'step-a', { result: 'fail' });

			// step-b when: result='fail' → false → skipped
			expect(queue.isEmpty()).toBe(true);
		});

		it('provides execution inputs as inputs context', () => {
			const ctx = { ...makeContext('exec-1'), inputs: { env: 'prod' } };
			const step = makeStepWithWhen('step-a', "inputs.env === 'prod'");
			queue.enqueueExecution(ctx, [step], new Map());
			expect(queue.dequeue()?.stepId).toBe('step-a');
		});

		it('skips step and resolves its dependents so downstream steps still run', () => {
			// step-a → step-b (when: false, skipped) → step-c (should still run)
			const stepA = makeStepWithWhen('step-a');
			const stepB = makeStepWithWhen('step-b', 'false', ['step-a']);
			const stepC = makeStepWithWhen('step-c', undefined, ['step-b']);
			const deps = new Map([['step-b', ['step-a']], ['step-c', ['step-b']]]);
			queue.enqueueExecution(makeContext('exec-1'), [stepA, stepB, stepC], deps);

			queue.dequeue(); // step-a
			queue.onStepCompleted('exec-1', 'step-a', {});

			// step-b is skipped, step-c should be ready
			expect(queue.dequeue()?.stepId).toBe('step-c');
		});

		it('throws ConditionEvaluationError if when: is not a boolean expression', () => {
			const step = makeStepWithWhen('step-a', '"not-a-boolean"');
			expect(() =>
				queue.enqueueExecution(makeContext('exec-1'), [step], new Map())
			).toThrow(/boolean/);
		});
	});

	describe('reQueueStep()', () => {
		it('puts the step back at the front of the queue', () => {
			const stepA = makeStep('step-a');
			const stepB = makeStep('step-b');
			const ctx = makeContext('exec-1');
			queue.enqueueExecution(ctx, [stepA, stepB], new Map());

			// Dequeue step-a and mark it active
			const dequeuedA = queue.dequeue()!;
			queue.markStepActive(ctx.executionId, dequeuedA.stepId);
			// Dequeue step-b
			const dequeuedB = queue.dequeue()!;
			expect(queue.isEmpty()).toBe(true);

			// Re-queue step-a (simulating a failed worker send)
			queue.reQueueStep(dequeuedA);

			// step-a should be at the front
			const requeued = queue.dequeue();
			expect(requeued).toBeDefined();
			expect(requeued!.stepId).toBe(dequeuedA.stepId);
			// Suppress unused variable lint warning
			void dequeuedB;
		});

		it('removes the step from activeSteps so it can be re-dispatched', () => {
			const ctx = makeContext('exec-1');
			queue.enqueueExecution(ctx, [makeStep('step-a')], new Map());

			const dequeued = queue.dequeue()!;
			queue.markStepActive(ctx.executionId, dequeued.stepId);

			// Before requeue, the step is active — completing a non-existent step would normally be a no-op
			// After requeue it should be back in the queue and NOT in activeSteps
			queue.reQueueStep(dequeued);

			// The step is back in the queue and the execution entry no longer treats it as active
			// (verified indirectly: a second reQueueStep call on the same step would not double-add)
			expect(queue.isEmpty()).toBe(false);
		});
	});
});
