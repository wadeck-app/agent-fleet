import type { StepPlacement, WorkerCandidate } from 'extension-points';
import type { WorkerSummary } from 'flow-core';

import type { StepRouter } from './StepRouter.js';
import type { WorkerTypeLookup } from './WorkerTypeCatalog.js';

/** What the acceptance rules see of a connected worker listed by the registry (absent lists are empty). */
export function candidateOfSummary(worker: WorkerSummary): WorkerCandidate {
	return {
		workerId: worker.workerId,
		labels: worker.labels,
		attachedProjectIds: worker.attachedProjectIds ?? [],
		attachedProjects: worker.attachedProjects,
		hasUserInterface: worker.hasUserInterface,
		ephemeral: worker.ephemeral,
		shellCapabilities: worker.shellCapabilities ?? [],
		...(worker.sourceId === undefined ? {} : { sourceId: worker.sourceId }),
	};
}

/**
 * Why the DEFAULT worker acceptance (S4) would refuse a worker for a step, as a short phrase made only of what the flow
 * declared (labels, shell) and fixed words; undefined when it would accept. Diagnostics for a failure message: it never
 * decides anything, and mirrors `DefaultWorkerAcceptance.accepts` check for check (a test runs both over a grid so they
 * cannot drift apart).
 */
export function explainDefaultRefusal(step: StepPlacement, worker: WorkerCandidate): string | undefined {
	if (step.requiresUserInterface && !worker.hasUserInterface) {
		return 'the step needs a terminal and this worker has none';
	}
	const missing = step.labels.filter(label => !worker.labels.includes(label));
	if (missing.length > 0) {
		const quoted = missing.map(label => `"${label}"`).join(', ');
		return `it lacks the label${missing.length > 1 ? 's' : ''} ${quoted}`;
	}
	if (step.shellKind !== undefined && !worker.shellCapabilities.includes(step.shellKind)) {
		return `it cannot run the shell "${step.shellKind}"`;
	}
	if (worker.ephemeral) {
		return undefined;
	}
	if (step.projectId === undefined || !worker.attachedProjectIds.includes(step.projectId)) {
		return "it does not serve this step's project";
	}
	return undefined;
}

/**
 * Splits the connected workers of the type a step is bound to (`step.boundWorkerType`) into those that would accept it
 * (idle or busy: they can free up for it) and, for those that would not, a `<worker id> (<reason>)` each. A worker that
 * refuses the step never will, so it must not hold the wait for a worker of the type open. Read-only: who may receive a
 * step is decided by `StepRouter.select`.
 */
export function tallyAcceptance(
	router: Pick<StepRouter, 'refusalOf'>,
	step: StepPlacement,
	connected: WorkerSummary[],
	typeOf: WorkerTypeLookup
): { accepting: number; refusals: string[] } {
	const ofType = connected.filter(worker => typeOf(worker.sourceId) === step.boundWorkerType);
	const refusals: string[] = [];
	for (const worker of ofType) {
		const reason = router.refusalOf(step, candidateOfSummary(worker));
		if (reason !== undefined) {
			refusals.push(`${worker.workerId} (${reason})`);
		}
	}
	return { accepting: ofType.length - refusals.length, refusals };
}
