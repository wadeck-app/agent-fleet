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

/**
 * Bounds how long a step of a run bound to a worker type waits for a worker of that type.
 *
 * Such a step never runs on any other worker, so without a bound it would stay queued forever when nobody of the
 * type shows up (the source is not declared, its plugin cannot start workers). The clock only runs while NO worker
 * of the type is connected: one that is busy is a queue to wait in, not a worker that is missing.
 *
 * State is one start time per `executionId:stepId`, dropped when the step fails ({@link decide}), when it is handed to
 * a worker ({@link clear}) and when its execution is over ({@link forgetExecution}), so it cannot grow with the
 * executions a long-lived daemon has served.
 */
export class BoundStepWait {
	private readonly waitingSince = new Map<string, number>();

	constructor(
		private readonly waitMs: number = DEFAULT_BOUND_STEP_WAIT_MS,
		private readonly now: () => number = Date.now
	) {}

	/** Number of steps currently being timed. */
	get size(): number {
		return this.waitingSince.size;
	}

	decide(request: BoundStepWaitRequest): BoundStepWaitDecision {
		const key = keyOf(request.executionId, request.stepId);
		if (request.connectedOfType > 0) {
			this.waitingSince.delete(key);
			return { action: 'wait' };
		}

		const since = this.waitingSince.get(key) ?? this.now();
		this.waitingSince.set(key, since);
		const waitedMs = this.now() - since;
		if (waitedMs < this.waitMs) {
			return { action: 'wait' };
		}

		this.waitingSince.delete(key);
		return { action: 'fail', reason: describeFailure(request, waitedMs, this.waitMs) };
	}

	/** The step was handed to a worker: it is no longer waiting. */
	clear(executionId: string, stepId: string): void {
		this.waitingSince.delete(keyOf(executionId, stepId));
	}

	/** Forgets the steps of an execution that is over. */
	forgetExecution(executionId: string): void {
		for (const key of this.waitingSince.keys()) {
			if (key.startsWith(`${executionId}:`)) {
				this.waitingSince.delete(key);
			}
		}
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
