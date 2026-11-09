import type { StepPlacement, WorkerCandidate } from 'extension-points';

/** The longest label or shell name printed in a reason, and how many labels are listed before "and N more". */
const MAX_NAME_LENGTH = 80;
const MAX_LABELS_LISTED = 5;

/** A name the flow declared, quoted (so a quote or a newline in it cannot break the sentence) and capped. */
function quoted(name: string): string {
	const capped = name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
	return JSON.stringify(capped);
}

/**
 * Why the DEFAULT worker acceptance (S4) would refuse a worker for a step, as a short phrase made only of what the flow
 * declared (labels, shell; quoted and capped) and fixed words; undefined when it would accept. Diagnostics for a failure
 * message: it never decides anything, and mirrors `DefaultWorkerAcceptance.accepts` check for check (a test runs both over
 * a grid, reason text included, so they cannot drift apart).
 */
export function explainDefaultRefusal(step: StepPlacement, worker: WorkerCandidate): string | undefined {
	if (step.requiresUserInterface && !worker.hasUserInterface) {
		return 'the step needs a terminal and this worker has none';
	}
	const missing = step.labels.filter(label => !worker.labels.includes(label));
	if (missing.length > 0) {
		const listed = missing.slice(0, MAX_LABELS_LISTED).map(quoted).join(', ');
		const rest = missing.length - MAX_LABELS_LISTED;
		return `it lacks the label${missing.length > 1 ? 's' : ''} ${listed}${rest > 0 ? ` and ${String(rest)} more` : ''}`;
	}
	if (step.shellKind !== undefined && !worker.shellCapabilities.includes(step.shellKind)) {
		return `it cannot run the shell ${quoted(step.shellKind)}`;
	}
	if (worker.ephemeral) {
		return undefined;
	}
	if (step.projectId === undefined || !worker.attachedProjectIds.includes(step.projectId)) {
		return "it does not serve this step's project";
	}
	return undefined;
}
