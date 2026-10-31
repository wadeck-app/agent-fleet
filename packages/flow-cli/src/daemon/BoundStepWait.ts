import { RetryBackoff } from './RetryBackoff.js';
import type { WorkerTypeCatalog } from './WorkerTypeCatalog.js';

/** What the daemon needs to restrict a run to a worker type: where types come from, and how long a missing one is waited for. */
export interface WorkerTypeRouting {
	workerTypes: Pick<WorkerTypeCatalog, 'typeLookup' | 'knownTypes'>;
	/** `worker.boundStepWaitSeconds`, in milliseconds. */
	boundStepWaitMs: number;
}

/** What routing found about a step of a run bound to a worker type that no idle worker could take. */
export interface BoundStepWaitRequest {
	executionId: string;
	stepId: string;
	/** The worker type the run is bound to. */
	workerType: string;
	/** Connected workers of that type, idle or busy: a busy one frees up, so the step is queued, not unserved. */
	connectedOfType: number;
	/** Worker types the declared sources stand for, to say what the run could have been bound to. */
	knownTypes: string[];
}

export type BoundStepWaitDecision = { action: 'wait' } | { action: 'fail'; reason: string };

/** How long a step of a bound run waits for a worker of its type to exist. Obtaining one (a sandbox) takes a while. */
export const DEFAULT_BOUND_STEP_WAIT_MS = 120_000;

/** How long after the first failed dispatch pass of a series the timer of a step that is still waiting asks again (it doubles from there). */
export const DEADLINE_RETRY_MS = 5_000;

/**
 * Bounds how long a step of a run bound to a worker type waits for a worker of that type.
 *
 * Such a step never runs on any other worker, so without a bound it would stay queued forever when nobody of the
 * type shows up (the source is not declared, its plugin cannot start workers). The clock only runs while NO worker
 * of the type is connected: one that is busy is a queue to wait in, not a worker that is missing.
 *
 * State is one start time and one timer per `executionId:stepId`, dropped when the step fails ({@link decide}), when it
 * is handed to a worker ({@link clear}), when a worker of the type connects, when its execution is over
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

	decide(request: BoundStepWaitRequest): BoundStepWaitDecision {
		const key = keyOf(request.executionId, request.stepId);
		if (request.connectedOfType > 0) {
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
		return { action: 'fail', reason: describeFailure(request, waitedMs, this.waitMs) };
	}

	/** The step was handed to a worker: it is no longer waiting. */
	clear(executionId: string, stepId: string): void {
		this.forget(keyOf(executionId, stepId));
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

function describeFailure(request: BoundStepWaitRequest, waitedMs: number, boundMs: number): string {
	const known =
		request.knownTypes.length === 0
			? 'no worker source with a plugin is declared, so no worker type exists yet'
			: `known worker types: ${request.knownTypes.join(', ')}`;
	return (
		`Step "${request.stepId}" belongs to a run bound to worker type "${request.workerType}" (the flow's workerType field), ` +
		`but no worker of that type was connected in the ${String(Math.round(waitedMs / 1000))}s it waited, and a step of a bound run never runs on another worker. ` +
		`${known}. ` +
		`Check that a source of that type is declared (flow worker source list) and that its plugin can start workers (see the daemon log). ` +
		`If starting one takes longer than ${String(Math.round(boundMs / 1000))}s, raise worker.boundStepWaitSeconds in the daemon config.`
	);
}
