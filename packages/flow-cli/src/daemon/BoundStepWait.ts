import type { DeclaredGuarantees } from './DeclaredGuarantees.js';
import { type RequirementWaitRequest, describeRequirementFailure } from './RequirementWaitFailure.js';
import { RetryBackoff } from './RetryBackoff.js';
import type { SourceContactErrors } from './SourceContactErrors.js';
import type { WorkerTypeCatalog } from './WorkerTypeCatalog.js';

/** What the dispatcher needs to place the steps of a run, and to say why a step with requirements could not be placed. */
export interface BoundStepRouting {
	/** Where the requirement-only sources and the guarantees of the workers' sources come from. */
	workerTypes: WorkerTypeRouting['workerTypes'];
	/** Bounds the wait of a step with requirements for a worker that meets them. */
	wait: BoundStepWait;
	/** Where the contact failures of the sources are kept. */
	contactErrors: WorkerTypeRouting['contactErrors'];
	/**
	 * What the declared sources may provide, to decide the fate of a step with requirements. Absent (a dispatcher built
	 * before requirements existed): such a step is failed with a wiring error, never placed.
	 */
	declaredGuarantees?: Pick<DeclaredGuarantees, 'entries' | 'providersOfAll' | 'shortfalls' | 'unread'> &
		Partial<Pick<DeclaredGuarantees, 'workspacesOf' | 'acceptsWorkspace'>>;
}

/** What the daemon needs to route steps with requirements: where guarantees come from, and how long a missing worker is waited for. */
export interface WorkerTypeRouting {
	/** `guaranteeLookup` is what a requirement is matched against (the real catalog has it); without it no worker meets one. */
	workerTypes: Pick<WorkerTypeCatalog, 'requirementOnlyLookup'> & Partial<Pick<WorkerTypeCatalog, 'guaranteeLookup'>>;
	/** `worker.boundStepWaitSeconds`, in milliseconds. */
	boundStepWaitMs: number;
	/** Where the last contact error of each source is kept, to say why no worker came. */
	contactErrors: Pick<SourceContactErrors, 'sinceFor'>;
	/** What the declared sources may provide: read at run start (which requirements exist) and at dispatch. */
	declaredGuarantees: Pick<
		DeclaredGuarantees,
		'entries' | 'providersOfAll' | 'providersOfAllForProject' | 'projectsOf' | 'shortfalls' | 'unread' | 'refresh' | 'workspacesOf' | 'acceptsWorkspace'
	>;
}

export type BoundStepWaitDecision = { action: 'wait' } | { action: 'fail'; reason: string };

/** How long a step with requirements waits for a worker that meets them. Obtaining one (a sandbox) takes a while. */
export const DEFAULT_BOUND_STEP_WAIT_MS = 120_000;

/** How long after the first failed dispatch pass of a series the timer of a step that is still waiting asks again (it doubles from there). */
export const DEADLINE_RETRY_MS = 5_000;

/**
 * Bounds how long a step with requirements waits for a worker that meets them.
 *
 * Such a step never runs on a worker that does not meet them, so without a bound it would stay queued forever when
 * nobody who does shows up (the source is not declared, its plugin cannot start workers). The clock only runs while NO
 * worker that meets the requirements and accepts the step is connected: one that is busy is a queue to wait in, not a
 * worker that is missing.
 *
 * State is one start time and one timer per `executionId:stepId`, dropped when the step fails ({@link decideRequirement}),
 * when it is handed to a worker ({@link clearRequirement}), when a serving worker connects, when its execution is over
 * ({@link forgetExecution}) and when the daemon stops ({@link stop}), so it cannot grow with the executions a
 * long-lived daemon has served.
 *
 * The timer is what makes the bound real: dispatch runs on events (a worker registering, a step becoming ready) and
 * on the demand re-check, which stops while workers are being forked. With nothing connected and a fork that failed,
 * no event would ever come to notice the bound has passed, so the timer asks for the pass itself.
 */
export class BoundStepWait {
	private readonly waitingSince = new Map<string, number>();
	private readonly deadlines = new Map<string, ReturnType<typeof setTimeout>>();
	/** Delay and stderr line for a dispatch pass asked for by a deadline timer that threw; shared, a pass fails for every step. */
	private readonly retryBackoff = new RetryBackoff('[BoundStepWait]', DEADLINE_RETRY_MS);

	/**
	 * @param onDeadline Runs a dispatch pass; called when the bound of a waiting step may have passed. Without it
	 *        nothing is scheduled and the bound is only noticed by passes that happen anyway.
	 */
	constructor(
		private readonly waitMs: number = DEFAULT_BOUND_STEP_WAIT_MS,
		private readonly now: () => number = Date.now,
		private readonly onDeadline?: () => void
	) {}

	/** Number of steps currently being timed. */
	get size(): number {
		return this.waitingSince.size;
	}

	/**
	 * Decides the fate of a step with requirements (`requires:`) that found no idle worker: the clock runs only while NO
	 * worker that meets the requirements and accepts the step is connected.
	 */
	decideRequirement(request: RequirementWaitRequest): BoundStepWaitDecision {
		return this.bounded(
			keyOf(request.executionId, request.stepId),
			request.connectedServing > 0,
			(since, waitedMs) =>
				describeRequirementFailure(request, waitedMs, this.waitMs, request.contactErrorsSince?.(since) ?? [])
		);
	}

	/** The step with requirements was handed to a worker: it is no longer waiting. */
	clearRequirement(executionId: string, stepId: string): void {
		this.forget(keyOf(executionId, stepId));
	}

	private bounded(
		key: string,
		hasCapacity: boolean,
		describe: (sinceMs: number, waitedMs: number) => string
	): BoundStepWaitDecision {
		if (hasCapacity) {
			this.forget(key);
			return { action: 'wait' };
		}

		const since = this.waitingSince.get(key) ?? this.now();
		this.waitingSince.set(key, since);
		const waitedMs = this.now() - since;
		if (waitedMs < this.waitMs) {
			this.armDeadline(key, this.waitMs - waitedMs);
			return { action: 'wait' };
		}

		this.forget(key);
		return { action: 'fail', reason: describe(since, waitedMs) };
	}

	/** Forgets the steps of an execution that is over. */
	forgetExecution(executionId: string): void {
		for (const key of this.waitingSince.keys()) {
			if (key.startsWith(`${executionId}:`)) {
				this.forget(key);
			}
		}
	}

	/** Drops every wait and timer, for the daemon stop: nothing may fire against collaborators that are torn down. */
	stop(): void {
		for (const key of [...this.waitingSince.keys()]) {
			this.forget(key);
		}
	}

	private forget(key: string): void {
		this.waitingSince.delete(key);
		this.clearDeadline(key);
	}

	private clearDeadline(key: string): void {
		const timer = this.deadlines.get(key);
		if (timer !== undefined) {
			clearTimeout(timer);
			this.deadlines.delete(key);
		}
	}

	private armDeadline(key: string, inMs: number): void {
		if (this.onDeadline === undefined || this.deadlines.has(key)) {
			return;
		}
		const timer = setTimeout(() => {
			this.deadlines.delete(key);
			try {
				this.onDeadline?.();
				this.retryBackoff.succeeded();
			} catch (err) {
				// A throw here would be an uncaught exception, and the daemon has no handler for those. The pass failed,
				// not the step: it is still waiting and its bound is still to be enforced, which only a pass can do (it
				// owns failing the step). So the failure is reported, never swallowed, and a pass is asked for again
				// after a delay that grows while it keeps failing, for as long as the step waits (a pass that settled it
				// has dropped it from here). The delay and the stderr line are shared by every waiting step, so a
				// permanent error costs one line every 30s whatever their number (see RetryBackoff).
				const retryMs = this.retryBackoff.failed(`dispatch pass for step "${key}" on its deadline`, err);
				if (this.waitingSince.has(key)) {
					// A timer the failing pass armed itself before throwing (`decide` does, for a step that still waits) is
					// replaced, not kept: it would fire at the short delay and the backoff would never apply.
					this.clearDeadline(key);
					this.armDeadline(key, retryMs);
				}
			}
		}, inMs);
		// Never the reason the daemon stays up: idle shutdown is decided elsewhere.
		timer.unref?.();
		this.deadlines.set(key, timer);
	}
}

function keyOf(executionId: string, stepId: string): string {
	return `${executionId}:${stepId}`;
}
