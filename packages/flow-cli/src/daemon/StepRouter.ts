import type {
	StepDistributionProvider,
	StepPlacement,
	WorkerAcceptanceProvider,
	WorkerCandidate,
} from 'extension-points';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { workerSatisfiesLabels } from './LabelMatcher.js';
import type { RegisteredWorker } from './WorkerRegistry.js';

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
		if (step.requiresUserInterface && !worker.hasUserInterface) return false;

		if (!workerSatisfiesLabels(step.labels, worker.labels)) return false;

		// A daemon-created worker exists to serve this daemon's queue, so there is no
		// declared project set to check it against.
		if (worker.ephemeral) return true;

		// Serving a project is explicit for a worker the daemon did not create (D#9). With
		// no project to check against there is nothing to match, so the answer is no rather
		// than a guess -- a run from outside any project falls back to forked capacity.
		if (step.projectRoot === undefined) return false;
		return worker.attachedProjects.includes(step.projectRoot);
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
	order(candidates: WorkerCandidate[]): WorkerCandidate[] {
		const registered = candidates.filter(candidate => !candidate.ephemeral);
		const forked = candidates.filter(candidate => candidate.ephemeral);
		return [...registered, ...forked];
	}
}

/**
 * Chooses which connected worker a step goes to.
 *
 * Acceptance (S4) and ordering (S3) are asked separately and in that order, so a plugin
 * that only wants to express a preference cannot accidentally remove capacity.
 */
export class StepRouter {
	constructor(
		private readonly acceptance: WorkerAcceptanceProvider = new DefaultWorkerAcceptance(),
		private readonly distribution: StepDistributionProvider = new DefaultStepDistribution()
	) {}

	/**
	 * The connection to dispatch to, or undefined when no live worker may run this step.
	 *
	 * Undefined is not an error: it is how the caller learns it needs to obtain a worker.
	 */
	select(step: StepPlacement, candidates: RoutingCandidate[]): WebSocket | undefined {
		const byWorkerId = new Map(candidates.map(candidate => [candidate.worker.workerId, candidate]));

		const eligible = candidates.filter(candidate => this.acceptsSafely(step, candidate.worker));
		if (eligible.length === 0) return undefined;

		const ordered = this.orderSafely(eligible.map(candidate => candidate.worker));
		const first = ordered[0];
		// The provider is author-written, so an id it returns is not guaranteed to be one
		// we offered; an unknown one is dropped rather than trusted.
		return first !== undefined ? byWorkerId.get(first.workerId)?.ws : eligible[0]?.ws;
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
