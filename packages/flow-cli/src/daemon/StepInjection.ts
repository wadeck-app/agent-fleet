import type { SchedulerStep } from 'flow-engine';
import type { FlowStep } from 'flow-engine';

import type { InjectedStep } from '../ipc/Protocol';
import type { DaemonSecrets } from './DaemonSecrets.js';
import type { ExecutionRegistry } from './ExecutionRegistry.js';
import type { ReadyStepQueue } from './ReadyStepQueue.js';

export const DEFAULT_MAX_INJECTED_STEPS = 20;
export const DEFAULT_MAX_STEPS_PER_EXECUTION = 50;

/** Validates and queues the steps a worker adds to a running execution (inject_steps). */
export class StepInjection {
	constructor(
		private readonly executions: ExecutionRegistry,
		private readonly queue: ReadyStepQueue,
		private readonly daemonSecrets: DaemonSecrets,
		private readonly maxInjectedSteps: number,
		private readonly maxStepsPerExecution: number
	) {}

	/** Called by Daemon for inject_steps messages. */
	injectSteps(executionId: string, injectedSteps: InjectedStep[]): void {
		const scheduler = this.executions.scheduler(executionId);
		if (!scheduler) {
			throw new Error(`No active execution found for id: ${executionId}`);
		}

		// Per-call limit check applies to the full requested batch (before dedup)
		if (injectedSteps.length > this.maxInjectedSteps) {
			throw new Error(
				`provideSteps: ${injectedSteps.length} steps exceeds per-call limit of ${this.maxInjectedSteps}`
			);
		}

		const allKnownIds = new Set([...this.executions.knownStepIds(executionId), ...injectedSteps.map(s => s.id)]);

		// Separate steps into those to skip (existing non-in-flight) and those to inject.
		// Idempotent: a step that already exists and is not in-flight is a no-op (loop re-run scenario).
		const stepsToInject: InjectedStep[] = [];
		for (const injected of injectedSteps) {
			if (this.executions.knownStepIds(executionId).has(injected.id)) {
				if (scheduler.isInFlight(injected.id)) {
					throw new Error(
						`Step id '${injected.id}' is currently in-flight in execution ${executionId} and cannot be re-injected`
					);
				}
				// Non-in-flight existing step: treat as no-op (idempotent re-injection after loop reset)
				continue;
			}
			// A step added while the flow runs was not scanned for secrets at start: refuse it
			// rather than run it with an empty value.
			this.daemonSecrets.assertInjectable(executionId, injected as unknown as FlowStep);
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
			// A sub-step of a waves parent needs a valid wave: refuse it here, before the step count is touched
			scheduler.assertInjectable(injected as SchedulerStep);
			stepsToInject.push(injected);
		}

		// Limit check uses only genuinely new steps
		const totalAfterInject = this.executions.stepCount(executionId) + stepsToInject.length;
		if (totalAfterInject > this.maxStepsPerExecution) {
			throw new Error(
				`Execution ${executionId} would exceed max steps per execution (${this.maxStepsPerExecution}) after injection`
			);
		}

		this.executions.setStepCount(executionId, totalAfterInject);

		if (stepsToInject.length === 0) {
			return;
		}

		const context = this.executions.context(executionId)!;
		// Pass `parent` through -- FlowScheduler.inject() registers parent-child relationships natively
		const newReady = scheduler.inject(stepsToInject as SchedulerStep[]);
		this.queue.enqueueItems(newReady, context);
	}
}
