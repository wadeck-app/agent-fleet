import type { StepPlacement } from 'extension-points';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { RegisteredWorker } from './WorkerRegistry.js';
import type { WorkerTypeCatalog, WorkspaceKindsLookup } from './WorkerTypeCatalog.js';

/**
 * The part of the hard routing filter about the workspace kind: a step that requires something is never placed on a
 * worker whose source does not accept the kind of its run's workspace (`workspaces` of the source, see
 * `WorkerTypeInstances.workspacesOf`). Steps that require nothing are not touched, like the requirement filter.
 *
 * Fail-closed: a source that cannot be read leaves no candidate; a run whose kind is unknown (absent from the placement)
 * is served only by sources that declare no restriction. A router wired without the lookup restricts nothing, the same
 * as a source that declares no `workspaces`.
 */
export class WorkspaceKindFilter {
	constructor(private readonly workerTypes: Partial<Pick<WorkerTypeCatalog, 'workspaceLookup'>>) {}

	/** The candidates whose source accepts the kind of the step's run; all of them when the step requires nothing. */
	filter<T extends { worker: RegisteredWorker }>(step: StepPlacement, candidates: T[]): T[] {
		if ((step.requires?.length ?? 0) === 0 || this.workerTypes.workspaceLookup === undefined) {
			return candidates;
		}
		const lookup = this.read(step);
		return lookup === undefined
			? []
			: candidates.filter(candidate => accepts(step, lookup(candidate.worker.sourceId)));
	}

	/** True when the step requires something and the source of this worker does not accept the kind of its run's workspace. */
	refuses(step: StepPlacement, worker: RegisteredWorker): boolean {
		return this.filter(step, [{ worker }]).length === 0;
	}

	private read(step: StepPlacement): WorkspaceKindsLookup | undefined {
		try {
			return this.workerTypes.workspaceLookup?.();
		} catch (err) {
			process.stderr.write(
				`[StepRouter] cannot tell which workspace kinds the workers' sources accept for step ${step.stepId}, so it is placed nowhere for now: ${normalizeError(err).message}\n`
			);
			return undefined;
		}
	}
}

function accepts(step: StepPlacement, kinds: readonly string[] | undefined): boolean {
	return kinds === undefined || (step.workspaceKind !== undefined && kinds.includes(step.workspaceKind));
}
