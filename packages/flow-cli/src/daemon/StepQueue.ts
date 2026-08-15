import type { AssignableStep, ExecutionContext, InjectedStep } from '../ipc/Protocol';

export interface ReadyStep {
	stepId: string;
	stepConfig: AssignableStep;
	executionContext: ExecutionContext;
}

interface ExecutionEntry {
	context: ExecutionContext;
	steps: Map<string, AssignableStep>;
	pendingDeps: Map<string, Set<string>>;
	completedSteps: Set<string>;
	failedSteps: Set<string>;
	activeSteps: Set<string>;
	// parent → Set<childStepId> for UI rendering (v1: metadata only, no scheduling impact)
	parentToChildren: Map<string, Set<string>>;
	// child → parentStepId
	childToParent: Map<string, string>;
}

// Hard cap on injected steps per execution — prevents a rogue Claude process
// from accumulating unbounded Map entries via repeated provideSteps calls.
const MAX_INJECTED_STEPS_PER_EXECUTION = 1000;

export class StepQueue {
	private readonly queue: ReadyStep[] = [];
	private readonly executions = new Map<string, ExecutionEntry>();
	private activeExecutions = 0;

	enqueueExecution(context: ExecutionContext, steps: AssignableStep[], depends: Map<string, string[]>): void {
		const entry: ExecutionEntry = {
			context,
			steps: new Map(steps.map(s => [s.id, s])),
			pendingDeps: new Map(steps.map(s => [s.id, new Set(depends.get(s.id) ?? [])])),
			completedSteps: new Set(),
			failedSteps: new Set(),
			activeSteps: new Set(),
			parentToChildren: new Map(),
			childToParent: new Map(),
		};
		this.executions.set(context.executionId, entry);
		this.activeExecutions++;
		this.enqueueReady(entry);
	}

	injectSteps(executionId: string, injectedSteps: InjectedStep[]): void {
		const entry = this.executions.get(executionId);
		if (!entry) {
			throw new Error(`No active execution found for id: ${executionId}`);
		}

		const totalAfterInject = entry.steps.size + injectedSteps.length;
		if (totalAfterInject > MAX_INJECTED_STEPS_PER_EXECUTION) {
			throw new Error(
				`Execution ${executionId} would exceed the maximum step count (${MAX_INJECTED_STEPS_PER_EXECUTION}) after injection`
			);
		}
		// D36: maxChildDepth (default: 10) is not yet enforced. Tracked for v2.
		// The step count cap (MAX_INJECTED_STEPS_PER_EXECUTION) provides a global safety bound in v1.

		// Build a combined set of all IDs for validation (existing + new batch)
		const allKnownIds = new Set([...entry.steps.keys(), ...injectedSteps.map(s => s.id)]);

		for (const injected of injectedSteps) {
			if (entry.steps.has(injected.id)) {
				throw new Error(`Step id '${injected.id}' already exists in execution ${executionId}`);
			}
			if (injected.parent !== undefined && !allKnownIds.has(injected.parent)) {
				throw new Error(`Parent step '${injected.parent}' does not exist in execution ${executionId}`);
			}
			if (injected.depends) {
				for (const dep of injected.depends) {
					if (!allKnownIds.has(dep)) {
						throw new Error(`Dependency step '${dep}' does not exist in execution ${executionId}`);
					}
				}
			}
		}

		// Add all steps first (so cross-references within the batch work after validation)
		for (const injected of injectedSteps) {
			const step = injected as unknown as AssignableStep;
			entry.steps.set(injected.id, step);
			entry.pendingDeps.set(injected.id, new Set(injected.depends ?? []));

			// Track parent-child relationships
			if (injected.parent !== undefined) {
				if (!entry.parentToChildren.has(injected.parent)) {
					entry.parentToChildren.set(injected.parent, new Set());
				}
				entry.parentToChildren.get(injected.parent)!.add(injected.id);
				entry.childToParent.set(injected.id, injected.parent);
			}
		}

		this.enqueueReady(entry);
	}

	dequeue(): ReadyStep | undefined {
		return this.queue.shift();
	}

	isEmpty(): boolean {
		return this.queue.length === 0;
	}

	hasActiveExecutions(): boolean {
		return this.activeExecutions > 0;
	}

	onStepCompleted(executionId: string, stepId: string, output: Record<string, unknown>): void {
		const entry = this.executions.get(executionId);
		if (!entry) {
			process.stderr.write(`[StepQueue] onStepCompleted: no entry for execution ${executionId} (step ${stepId}) — late message after cleanup\n`);
			return;
		}

		entry.completedSteps.add(stepId);
		entry.activeSteps.delete(stepId);
		entry.context.stepOutputs[stepId] = output;

		// Remove completed step from all pending dependency sets
		for (const [sid, deps] of entry.pendingDeps) {
			deps.delete(stepId);
		}

		// Check if execution is fully done
		// Note: failedSteps is NOT checked here — onStepFailed already deletes the execution
		// before this path can be reached with any failed steps (M5: no dead code needed).
		const allDone = [...entry.steps.keys()].every(
			sid => entry.completedSteps.has(sid)
		);
		if (allDone) {
			this.executions.delete(executionId);
			this.activeExecutions--;
			return;
		}

		this.enqueueReady(entry);
	}

	onStepFailed(executionId: string, stepId: string): void {
		const entry = this.executions.get(executionId);
		if (!entry) {
			process.stderr.write(`[StepQueue] onStepFailed: no entry for execution ${executionId} (step ${stepId}) — late message after cleanup\n`);
			return;
		}

		entry.failedSteps.add(stepId);
		entry.activeSteps.delete(stepId);
		// Mark execution failed: remove from active executions immediately
		this.executions.delete(executionId);
		this.activeExecutions--;
		// Remove any queued steps for this execution
		for (let i = this.queue.length - 1; i >= 0; i--) {
			if (this.queue[i]!.executionContext.executionId === executionId) {
				this.queue.splice(i, 1);
			}
		}
	}

	reQueueStep(step: ReadyStep): void {
		// Put step back at front of queue so it gets reassigned immediately
		this.queue.unshift(step);
		// Also restore it in pendingDeps so it's tracked as ready (not active)
		const entry = this.executions.get(step.executionContext.executionId);
		if (entry) {
			entry.activeSteps.delete(step.stepId);
		}
	}

	markStepActive(executionId: string, stepId: string): void {
		const entry = this.executions.get(executionId);
		if (!entry) {
			throw new Error(`[StepQueue] markStepActive: no entry for execution ${executionId} (step ${stepId}) — dequeue returned a step for an unknown execution`);
		}
		entry.activeSteps.add(stepId);
	}

	private enqueueReady(entry: ExecutionEntry): void {
		// D30: when: condition expressions are not evaluated in v1. Steps are enqueued
		// solely based on depends being satisfied. Tracked for v2 (ConditionEvaluator).
		for (const [stepId, deps] of entry.pendingDeps) {
			if (
				deps.size === 0 &&
				!entry.completedSteps.has(stepId) &&
				!entry.failedSteps.has(stepId) &&
				!entry.activeSteps.has(stepId)
			) {
				const stepConfig = entry.steps.get(stepId)!;
				entry.pendingDeps.delete(stepId);
				this.queue.push({ stepId, stepConfig, executionContext: entry.context });
			}
		}
	}
}
