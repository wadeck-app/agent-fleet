/**
 * Extension point S9 -- interactivity policy.
 *
 * Decides what happens to a step that needs a human when no connected worker can host one.
 *
 * Scoped to `user_intervention` only (D#61). "Interactive model step" is not a declarable
 * category -- interactivity is a property of the worker, not of the step (D#60) -- so a
 * model step landing on a headless worker simply runs headless. There is nothing to fail.
 */

export interface InteractivityRequest {
	stepId: string;
	/**
	 * How long the step has been waiting for an interactive worker, in milliseconds.
	 *
	 * Present so a policy *can* wait; the built-in default does not, because a step that
	 * blocks a whole flow on a terminal nobody has opened is better reported at once.
	 */
	waitingMs: number;
	/** Connected workers that declared a user interface. Zero is why this is being asked. */
	interactiveWorkers: number;
}

/**
 * Waiting keeps the step queued and asks again later; failing ends it with `reason`.
 *
 * `reason` is required on the failing branch rather than optional: the whole value of this
 * decision to the user is being told which of their workers could have run the step and why
 * none did. A blank failure would leave a step marked failed with nothing to act on.
 */
export type InteractivityDecision = { action: 'wait' } | { action: 'fail'; reason: string };

export interface InteractivityPolicyProvider {
	decide(request: InteractivityRequest): InteractivityDecision;
}
