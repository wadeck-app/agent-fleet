/**
 * Extension point S4 -- worker acceptance.
 *
 * Decides whether a given worker is *allowed* to run a given step. It answers one
 * question and returns one boolean, so an implementation cannot accidentally express a
 * preference: ordering candidates is S3's job (`step-distribution`), and the two are kept
 * apart because mixing them produces a plugin that silently serialises a parallel flow.
 *
 * This is **not** a security boundary. Labels are routing (T-07): a worker that reaches
 * this point has already authenticated, and a step it accepts runs with that worker's
 * privileges either way. Do not use an acceptance plugin to keep sensitive steps off an
 * untrusted worker -- don't connect the untrusted worker.
 */

/** The step being placed, reduced to what a placement decision may look at. */
export interface StepPlacement {
	stepId: string;
	/**
	 * Labels the step demands. All of them must be satisfied (AND), and a worker's extra
	 * labels never disqualify it: labels state what a step needs, not what a worker is
	 * reserved for (D#22).
	 */
	labels: string[];
	/** True for a step that needs a human at a terminal, i.e. `user_intervention` (D#60). */
	requiresUserInterface: boolean;
	/**
	 * Project this step's execution belongs to, or undefined when the run could not be
	 * attributed to one (D#10) -- a `flow run` from outside any project.
	 */
	projectRoot?: string;
}

/** The candidate worker, as it declared itself when registering. */
export interface WorkerCandidate {
	workerId: string;
	/** Routing labels the worker advertises. */
	labels: string[];
	/** Projects this worker serves. Attachment beyond its launch directory is opt-in (D#9). */
	attachedProjects: string[];
	/** Whether a human can interact with it. The worker alone decides this (D#33, D#36). */
	hasUserInterface: boolean;
	/**
	 * True when the daemon created this worker for its own queue, so it serves whatever
	 * the daemon dispatches rather than a declared set of projects.
	 */
	ephemeral: boolean;
	sourceId?: string;
}

export interface WorkerAcceptanceRequest {
	step: StepPlacement;
	worker: WorkerCandidate;
}

export interface WorkerAcceptanceProvider {
	/**
	 * True when this worker may run this step.
	 *
	 * Synchronous by design: it is called once per candidate inside the dispatch loop, and
	 * an implementation that needed to await something would stall every other execution's
	 * dispatch behind it.
	 */
	accepts(request: WorkerAcceptanceRequest): boolean;
}
