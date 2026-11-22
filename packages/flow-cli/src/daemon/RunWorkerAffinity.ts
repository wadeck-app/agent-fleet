/**
 * Remembers, per execution, the worker that served its most recent step, so the router can prefer it for the next one
 * (soft stickiness, S1 of the run placement plan).
 *
 * A memory only: it never decides whether a step runs and never excludes a worker. One entry per live execution, dropped
 * by {@link forgetExecution} when the run ends, so it cannot grow with the runs a daemon has served.
 */
export class RunWorkerAffinity {
	private readonly lastWorkerByExecution = new Map<string, string>();

	/** Records the worker a step of the execution was just handed to. */
	record(executionId: string, workerId: string): void {
		this.lastWorkerByExecution.set(executionId, workerId);
	}

	/** The worker that served the previous step of the execution, or undefined when no step ran yet. */
	preferredWorkerOf(executionId: string): string | undefined {
		return this.lastWorkerByExecution.get(executionId);
	}

	/** Forgets an execution that is over. */
	forgetExecution(executionId: string): void {
		this.lastWorkerByExecution.delete(executionId);
	}

	/** How many executions are remembered, to assert that nothing leaks. */
	get size(): number {
		return this.lastWorkerByExecution.size;
	}
}
