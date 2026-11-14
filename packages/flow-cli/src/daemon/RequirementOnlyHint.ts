import type { StepPlacement } from 'extension-points';

import type { LogWriter } from '../storage/LogWriter';
import type { ReadyStep } from './ReadyStepQueue.js';
import type { StepRouter } from './StepRouter.js';
import type { WorkerRegistry } from './WorkerRegistry.js';
import type { RequirementOnlyLookup } from './WorkerTypeCatalog.js';

/** The most workers named in the hint. */
const MAX_WORKERS_NAMED = 5;

/**
 * Once per step that requires nothing and found no worker: names, in the execution log, the connected workers of
 * requirement-only sources that would have taken it, and the fix. Without it the step just waits (or runs on a forked host
 * worker) and nothing says why a connected sandbox worker stays idle.
 */
export class RequirementOnlyHint {
	/** `executionId:stepId` of the steps already told. */
	private readonly reported = new Set<string>();

	constructor(
		private readonly registry: Pick<WorkerRegistry, 'listConnected'>,
		private readonly router: Pick<StepRouter, 'refusalOf'>,
		private readonly logWriter: Pick<LogWriter, 'writeExecution'>
	) {}

	report(step: ReadyStep, placement: StepPlacement, isRequirementOnly: RequirementOnlyLookup): void {
		const key = `${step.executionContext.executionId}:${step.stepId}`;
		if (this.reported.has(key)) {
			return;
		}
		const skipped = this.registry
			.listConnected()
			.filter(
				worker => isRequirementOnly(worker.sourceId) && this.router.refusalOf(placement, worker) === undefined
			);
		if (skipped.length === 0) {
			return;
		}
		this.reported.add(key);
		const names = skipped.slice(0, MAX_WORKERS_NAMED).map(worker => worker.workerId);
		const more = skipped.length - names.length;
		this.logWriter.writeExecution(
			step.executionContext.executionId,
			`Step '${step.stepId}' is not run by the connected worker(s) ${names.join(', ')}${more > 0 ? ` and ${String(more)} more` : ''}: their sources declare guarantees, so they serve only steps that require them. Add requires: [<guarantee>] or profile: <name> to the step (or the flow) to run it there (flow worker source list shows the guarantees); otherwise it waits for a host worker (one is forked when none is connected).`,
			'warning'
		);
	}

	/** Forgets the steps of an execution that is over. */
	forgetExecution(executionId: string): void {
		for (const key of [...this.reported]) {
			if (key.startsWith(`${executionId}:`)) {
				this.reported.delete(key);
			}
		}
	}
}
