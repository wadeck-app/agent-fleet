import type { ReadyItem } from 'flow-engine';

import type { AssignableStep, ExecutionContext } from '../ipc/Protocol';

export interface ReadyStep {
	stepId: string;
	stepConfig: AssignableStep;
	executionContext: ExecutionContext;
}

/** Central queue of ready steps across all executions. */
export class ReadyStepQueue {
	private readonly steps: ReadyStep[] = [];

	get length(): number {
		return this.steps.length;
	}

	/** Queues the steps a scheduler reports as ready. */
	enqueueItems(items: ReadyItem[], context: ExecutionContext): void {
		for (const item of items) {
			this.steps.push({
				stepId: item.stepId,
				stepConfig: item.step as unknown as AssignableStep,
				executionContext: context,
			});
		}
	}

	shift(): ReadyStep | undefined {
		return this.steps.shift();
	}

	/** Puts a step back at the head, ahead of everything else. */
	unshift(...steps: ReadyStep[]): void {
		this.steps.unshift(...steps);
	}

	/** Drops every queued step of an execution. */
	purge(executionId: string): void {
		for (let i = this.steps.length - 1; i >= 0; i--) {
			if (this.steps[i]!.executionContext.executionId === executionId) {
				this.steps.splice(i, 1);
			}
		}
	}
}
