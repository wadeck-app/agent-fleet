/** What routing found about a step with requirements that no idle worker could take. */
export interface RequirementWaitRequest {
	executionId: string;
	stepId: string;
	/** The requirements of the step (the flow's and its own). */
	required: string[];
	/**
	 * Connected workers, idle or busy, whose source guarantees all of them and that accept the step: a busy one frees up,
	 * so the step is queued, not unserved. A worker that refuses the step never will, so it is not counted.
	 */
	connectedServing: number;
	/**
	 * Sentences naming the closest workers and declared sources and what each lacks (worked out only when the step fails).
	 * Fixed words and declared names only, never text a plugin wrote.
	 */
	closest: () => string[];
	/** One sentence per source that could provide them whose latest contact failure is not older than the given time. */
	contactErrorsSince?: ((sinceMs: number) => string[]) | undefined;
}

/** The failure of a step whose requirements no worker met within the bound. */
export function describeRequirementFailure(
	request: RequirementWaitRequest,
	waitedMs: number,
	boundMs: number,
	contactErrors: string[]
): string {
	const closest = request.closest();
	return (
		`Step "${request.stepId}" requires ${request.required.join(', ')}, but no worker whose source guarantees all of them ` +
		`and accepts this step was available in the ${String(Math.round(waitedMs / 1000))}s it waited, and a step with requirements never runs on another worker. ` +
		`Check that a source providing them is declared (flow worker source list) and that its plugin can start workers (see the daemon log). ` +
		`If starting one takes longer than ${String(Math.round(boundMs / 1000))}s, raise worker.boundStepWaitSeconds in the daemon config.` +
		(closest.length === 0 ? '' : ` ${closest.join(' ')}`) +
		(contactErrors.length === 0 ? '' : ` ${contactErrors.join(' ')}`)
	);
}
