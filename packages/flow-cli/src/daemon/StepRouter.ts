import { cacheFilePath, readCache } from '@wadeck-app/shared-updater';
import type {
	StepDistributionProvider,
	StepPlacement,
	WorkerAcceptanceProvider,
	WorkerCandidate,
} from 'extension-points';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { flowConfigDir } from '../config/FlowConfigDir.js';
import { workerSatisfiesLabels } from './LabelMatcher.js';
import { missingRequirements } from './RequirementMatcher.js';
import { workerSatisfiesShell } from './ShellMatcher.js';
import { explainDefaultRefusal } from './WorkerRefusal.js';
import type { RegisteredWorker } from './WorkerRegistry.js';
import type { ExclusiveLookup, GuaranteeLookup, WorkerTypeCatalog, WorkerTypeLookup } from './WorkerTypeCatalog.js';
import { WorkspaceKindFilter } from './WorkspaceKindFilter.js';

/**
 * What the router asks the worker type catalog. `guaranteeLookup` may be missing (a router built before requirements
 * existed): a step that requires something is then placed nowhere, never anywhere.
 */
export type WorkerTypeKnowledge = Pick<WorkerTypeCatalog, 'typeLookup' | 'exclusiveLookup'> &
	Partial<Pick<WorkerTypeCatalog, 'guaranteeLookup' | 'workspaceLookup'>>;

/** No worker has a type: what a router built without a catalog knows. */
const NO_WORKER_TYPES: WorkerTypeKnowledge = {
	typeLookup: () => () => undefined,
	exclusiveLookup: () => () => false,
};

/** An idle worker together with the connection to reach it. */
export interface RoutingCandidate {
	ws: WebSocket;
	worker: RegisteredWorker;
}

/**
 * Built-in S4: permissive, and deliberately so.
 *
 * A worker takes any step for a project it serves. Labels only gate the steps that
 * actually demand them (D#22) -- with labels greenfield, an exclusive default would leave
 * every freshly launched worker inert and make the whole feature look broken.
 *
 * Not a security boundary (T-07). Every worker here has already authenticated, and a step
 * runs with that worker's privileges whichever way this answers.
 */
export class DefaultWorkerAcceptance implements WorkerAcceptanceProvider {
	accepts({ step, worker }: { step: StepPlacement; worker: WorkerCandidate }): boolean {
		// Only a worker with a terminal can prompt a human (D#32).
		if (step.requiresUserInterface && !worker.hasUserInterface) {
			return false;
		}

		if (!workerSatisfiesLabels(step.labels, worker.labels)) {
			return false;
		}

		if (!workerSatisfiesShell(step.shellKind, worker.shellCapabilities)) {
			return false;
		}

		// A daemon-created worker exists to serve this daemon's queue, so there is no
		// declared project set to check it against.
		if (worker.ephemeral) {
			return true;
		}

		// Serving a project is explicit for a worker the daemon did not create (D#9), and by registry id: a folder
		// path is not an identity. With no project id to check against there is nothing to match, so the answer
		// is no rather than a guess.
		if (step.projectId === undefined) {
			return false;
		}
		return worker.attachedProjectIds.includes(step.projectId);
	}
}

/**
 * Built-in S3: a worker someone launched is tried before one the daemon would fork (D#23).
 *
 * Existing idle capacity costs nothing to use, while forking spends a process. Ordering
 * only -- every candidate is returned, because preference must never cap parallelism
 * (D#24).
 */
export class DefaultStepDistribution implements StepDistributionProvider {
	/**
	 * @param configDir - where this daemon's updater cache lives. Defaults to the real
	 *        `flow` config dir (`flowConfigDir()`) so production needs no wiring; a
	 *        test passes its own tmp dir to control what `readLatestVersion` sees without
	 *        touching the developer's real cache file.
	 */
	constructor(private readonly configDir: string = flowConfigDir()) {}

	order(candidates: WorkerCandidate[]): WorkerCandidate[] {
		const registered = this.preferUpToDate(candidates.filter(candidate => !candidate.ephemeral));
		const forked = this.preferUpToDate(candidates.filter(candidate => candidate.ephemeral));
		return [...registered, ...forked];
	}

	/**
	 * Lowest-priority tie-break, applied only *within* a group the criteria above already
	 * treat as equal (registered vs. forked) -- never across them, so it can only reorder
	 * candidates that were already interchangeable.
	 *
	 * A candidate whose self-reported `version` matches this daemon's own idea of the
	 * latest `flow-cli` (its updater cache, kept fresh by the daemon's own periodic
	 * check -- see `Daemon.ts`) sorts first within the group. Pure preference, not a gate
	 * (D#24): every candidate is still returned, in every case, including when the latest
	 * version is unknown (no cache yet) or when every candidate in the group is stale --
	 * waiting for a worker to self-restart must never block or shrink dispatch.
	 */
	private preferUpToDate(group: WorkerCandidate[]): WorkerCandidate[] {
		const latestVersion = this.readLatestVersion();
		if (latestVersion === undefined) {
			return group;
		}

		const versioned = group as (WorkerCandidate & { version?: string })[];
		const upToDate = versioned.filter(candidate => candidate.version === latestVersion);
		if (upToDate.length === 0 || upToDate.length === versioned.length) {
			return group;
		}

		const stale = versioned.filter(candidate => candidate.version !== latestVersion);
		return [...upToDate, ...stale];
	}

	/** This daemon's own idea of the latest `flow-cli` version, or undefined when unknown. */
	private readLatestVersion(): string | undefined {
		const cache = readCache(cacheFilePath(this.configDir));
		return cache?.latestVersion ?? undefined;
	}
}

/**
 * Chooses which connected worker a step goes to.
 *
 * Acceptance (S4) and ordering (S3) are asked separately and in that order, so a plugin
 * that only wants to express a preference cannot accidentally remove capacity.
 */
export class StepRouter {
	/**
	 * @param workerTypes where a worker's type comes from (see {@link WorkerTypeCatalog}). Without it no worker has a
	 *        type, so a step bound to a worker type is placed nowhere: the safe answer to a missing wiring.
	 */
	constructor(
		private readonly acceptance: WorkerAcceptanceProvider = new DefaultWorkerAcceptance(),
		private readonly distribution: StepDistributionProvider = new DefaultStepDistribution(),
		private readonly workerTypes: WorkerTypeKnowledge = NO_WORKER_TYPES
	) {
		this.workspaceKinds = new WorkspaceKindFilter(workerTypes);
	}

	private readonly workspaceKinds: WorkspaceKindFilter;

	/**
	 * The connection to dispatch to, or undefined when no live worker may run this step.
	 *
	 * Undefined is not an error: it is how the caller learns it needs to obtain a worker.
	 *
	 * @param typeOf which type a worker is of, when the caller already has the answer (and reports its own failure to
	 *        get it); otherwise it is asked of the catalog this router was built with.
	 *
	 * @param isExclusive which workers are of an exclusive type, when the caller already has the answer; otherwise it is
	 *        asked of the catalog this router was built with. Only read for a step that is not bound.
	 *
	 * A step bound to a worker type is first narrowed to the workers of that type; a step that is not bound is first
	 * stripped of the workers of an exclusive type (they serve only runs bound to their type) -- before S4 and S3, which
	 * can neither widen the set back nor be consulted about the others.
	 */
	select(
		step: StepPlacement,
		allCandidates: RoutingCandidate[],
		typeOf?: WorkerTypeLookup,
		isExclusive?: ExclusiveLookup,
		guaranteesOf?: GuaranteeLookup
	): WebSocket | undefined {
		// Both are hard filters, before S4 and S3: the guarantees of the source, then the workspace kinds it accepts.
		const candidates = this.workspaceKinds.filter(
			step,
			this.withRequirements(step, this.servableBy(step, allCandidates, typeOf, isExclusive), guaranteesOf)
		);
		const byWorkerId = new Map(candidates.map(candidate => [candidate.worker.workerId, candidate]));

		const eligible = candidates.filter(candidate => this.acceptsSafely(step, candidate.worker));
		if (eligible.length === 0) {
			return undefined;
		}

		const ordered = this.orderSafely(eligible.map(candidate => candidate.worker));
		const first = ordered[0];
		// The provider is author-written, so an id it returns is not guaranteed to be one
		// we offered; an unknown one is dropped rather than trusted.
		return first !== undefined ? byWorkerId.get(first.workerId)?.ws : eligible[0]?.ws;
	}

	/**
	 * Why a connected worker does not take a step, or undefined when it does: for a failure message only. It asks the same
	 * acceptance (S4) as {@link select}, so it changes who may receive a step in no way; the reason is fixed words and the
	 * labels or shell the flow declared, never text a plugin wrote.
	 */
	refusalOf(step: StepPlacement, worker: RegisteredWorker): string | undefined {
		if (this.acceptsSafely(step, worker)) {
			return undefined;
		}
		const isDefault = this.acceptance instanceof DefaultWorkerAcceptance;
		return (
			(isDefault ? explainDefaultRefusal(step, worker) : undefined) ?? 'the worker-acceptance plugin refused it'
		);
	}

	/**
	 * The requirements of the step a worker's source does not guarantee, for a failure message; empty when the step
	 * requires nothing or the worker meets all of it. Reads the same guarantees as {@link select} and consults no plugin.
	 * A guarantee source that cannot be read leaves the worker with none (the requirements are then all missing).
	 */
	missingRequirementsOf(step: StepPlacement, worker: RegisteredWorker, given?: GuaranteeLookup): string[] {
		const required = step.requires ?? [];
		if (required.length === 0) {
			return [];
		}
		let guaranteesOf: GuaranteeLookup | undefined = given;
		try {
			guaranteesOf ??= this.workerTypes.guaranteeLookup?.();
		} catch {
			guaranteesOf = undefined;
		}
		return missingRequirements(required, guaranteesOf?.(worker.sourceId) ?? []);
	}

	/** True when the step requires something and the source of this worker does not accept the kind of its run's workspace. */
	refusesWorkspace(step: StepPlacement, worker: RegisteredWorker): boolean {
		return this.workspaceKinds.refuses(step, worker);
	}

	/**
	 * HARD filter, applied before S4 and S3 so a replaceable acceptance plugin cannot widen the set back: only the
	 * candidates whose source guarantees every requirement of the step stay. The guarantees are those of the worker's
	 * authenticated source (its built instance), never the labels the worker declares.
	 *
	 * Fail-closed: a guarantee source that cannot be read, or none wired, leaves no candidate for a step that requires
	 * something, and says so on stderr (the step then waits or fails with its bound like any unplaced step).
	 */
	private withRequirements(
		step: StepPlacement,
		candidates: RoutingCandidate[],
		given?: GuaranteeLookup
	): RoutingCandidate[] {
		const required = step.requires ?? [];
		if (required.length === 0) {
			return candidates;
		}
		let guaranteesOf = given;
		try {
			guaranteesOf ??= this.workerTypes.guaranteeLookup?.();
		} catch (err) {
			process.stderr.write(
				`[StepRouter] cannot tell what the workers' sources guarantee for step ${step.stepId}, so it is placed nowhere for now: ${normalizeError(err).message}\n`
			);
			return [];
		}
		if (guaranteesOf === undefined) {
			process.stderr.write(
				`[StepRouter] step ${step.stepId} requires ${required.join(', ')} but this router has no guarantee source, so it is placed nowhere. This is a wiring mistake in the daemon, please report it.\n`
			);
			return [];
		}
		const lookup = guaranteesOf;
		return candidates.filter(
			candidate => missingRequirements(required, lookup(candidate.worker.sourceId)).length === 0
		);
	}

	/**
	 * The candidates whose type is the one the step's run is bound to; for a run that is not bound, those that are not of
	 * an exclusive type (a worker with no source is never exclusive).
	 *
	 * A lookup that throws (the source registry cannot be read) leaves no worker of any type: the step stays unplaced
	 * and the reason is reported, rather than the failure aborting the dispatch loop of every execution. For a step that
	 * is not bound the same failure keeps off every worker that names a source (fail-closed: it may be exclusive) and
	 * leaves the workers that name none.
	 */
	private servableBy(
		step: StepPlacement,
		candidates: RoutingCandidate[],
		given?: WorkerTypeLookup,
		givenExclusive?: ExclusiveLookup
	): RoutingCandidate[] {
		if (step.boundWorkerType === undefined) {
			// Asking for guarantees is an explicit opt-in (like binding by workerType): exclusivity is not applied, and
			// the requirement filter that follows keeps only the sources that guarantee all of it.
			return (step.requires?.length ?? 0) > 0
				? candidates
				: this.withoutExclusive(step, candidates, givenExclusive);
		}
		let typeOf: WorkerTypeLookup;
		try {
			typeOf = given ?? this.workerTypes.typeLookup();
		} catch (err) {
			process.stderr.write(
				`[StepRouter] cannot tell which workers are of type "${step.boundWorkerType}" for step ${step.stepId}, so it is placed nowhere for now: ${normalizeError(err).message}\n`
			);
			return [];
		}
		return candidates.filter(candidate => typeOf(candidate.worker.sourceId) === step.boundWorkerType);
	}

	private withoutExclusive(
		step: StepPlacement,
		candidates: RoutingCandidate[],
		given?: ExclusiveLookup
	): RoutingCandidate[] {
		let isExclusive: ExclusiveLookup;
		try {
			isExclusive = given ?? this.workerTypes.exclusiveLookup();
		} catch (err) {
			process.stderr.write(
				`[StepRouter] cannot tell which workers are of an exclusive worker type for step ${step.stepId}, so only workers that name no source may take it for now: ${normalizeError(err).message}
`
			);
			return candidates.filter(candidate => candidate.worker.sourceId === undefined);
		}
		return candidates.filter(candidate => !isExclusive(candidate.worker.sourceId));
	}

	/**
	 * Asks S4 about one worker, treating a throw as a refusal.
	 *
	 * Plugins run in-process in v1, so a throw here would otherwise abort the dispatch loop
	 * and stall every execution -- but it must not quietly place the step either, so the
	 * failure is reported with the worker it happened for.
	 */
	private acceptsSafely(step: StepPlacement, worker: RegisteredWorker): boolean {
		try {
			return this.acceptance.accepts({ step, worker });
		} catch (err) {
			process.stderr.write(
				`[StepRouter] the worker-acceptance plugin failed for worker ${worker.workerId} on step ${step.stepId}, so the worker was skipped: ${normalizeError(err).message}\n`
			);
			return false;
		}
	}

	/**
	 * Asks S3 for an order, verifying it returned the same set it was given.
	 *
	 * A provider that drops a candidate produces a flow running below its declared
	 * parallelism -- a symptom no result reveals, which is why the contract is checked here
	 * instead of trusted (D#24). A violating order is reported and not used.
	 */
	private orderSafely(eligible: RegisteredWorker[]): WorkerCandidate[] {
		let ordered: WorkerCandidate[];
		try {
			ordered = this.distribution.order(eligible);
		} catch (err) {
			process.stderr.write(
				`[StepRouter] the step-distribution plugin failed, so the default order was used: ${normalizeError(err).message}\n`
			);
			return eligible;
		}

		const offered = new Set(eligible.map(worker => worker.workerId));
		const returned = new Set(ordered.map(worker => worker.workerId));
		const sameSet = offered.size === returned.size && [...offered].every(workerId => returned.has(workerId));
		if (!sameSet) {
			process.stderr.write(
				`[StepRouter] the step-distribution plugin returned a different candidate set (${String(offered.size)} offered, ${String(returned.size)} returned). It may only reorder candidates, never add or drop them, so its order was ignored.\n`
			);
			return eligible;
		}
		return ordered;
	}
}
