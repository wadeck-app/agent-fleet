import type { SchedulerState } from './SchedulerState';
import type { ReadyItem } from './SchedulerTypes';
import type { WhenConditionEvaluator } from './WhenConditionEvaluator';

/** Takes the steps whose dependencies are all met out of the pending set, settling those a `when:` skips. */
export class ReadyStepCollector {
	constructor(
		private readonly state: SchedulerState,
		private readonly whenEvaluator: WhenConditionEvaluator
	) {}

	collect(): ReadyItem[] {
		const { pendingDeps, inFlightSteps, steps, completedSteps } = this.state;
		const ready: ReadyItem[] = [];
		const skipped: string[] = [];

		for (const [stepId, deps] of pendingDeps) {
			if (deps.size === 0 && !inFlightSteps.has(stepId)) {
				const step = steps.get(stepId);
				if (!step) {
					throw new Error(`FlowScheduler: unknown stepId "${stepId}" in collectReady()`);
				}
				pendingDeps.delete(stepId);

				if (step.when !== undefined) {
					const shouldRun = this.whenEvaluator.evaluate(step);
					if (!shouldRun) {
						completedSteps.add(stepId);
						skipped.push(stepId);
						continue;
					}
				}

				ready.push({ stepId, step });
			}
		}

		// Propagate skipped steps so their dependents become ready
		if (skipped.length > 0) {
			for (const skippedId of skipped) {
				for (const deps of pendingDeps.values()) {
					deps.delete(skippedId);
				}
			}
			ready.push(...this.collect());
		}

		return ready;
	}
}
