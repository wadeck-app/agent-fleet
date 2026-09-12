import type { InteractivityDecision, InteractivityPolicyProvider, InteractivityRequest } from 'extension-points';

/**
 * Built-in S9: a `user_intervention` step fails at once when nothing can host a human.
 *
 * One rule, fully predictable (D#39). Waiting is the tempting alternative and is worse: a
 * step needing a terminal nobody has opened would hold the flow indefinitely with no
 * explanation, and no amount of provisioning fixes it -- a forked worker has no TTY, so the
 * daemon cannot create its way out of this. Failing immediately with the command to run puts
 * the one action that helps in front of the user.
 *
 * "Wait then fail" and "never fail" remain valid alternative S9 implementations rather than
 * competing designs (D#25 makes the same point for provisioning).
 */
export class DefaultInteractivityPolicy implements InteractivityPolicyProvider {
	decide({ stepId, interactiveWorkers }: InteractivityRequest): InteractivityDecision {
		// Routing only asks when it found no *idle* interactive worker. One that exists but is
		// busy will free up, so failing here would kill a step that was about to run.
		if (interactiveWorkers > 0) return { action: 'wait' };

		return {
			action: 'fail',
			reason:
				`Step "${stepId}" needs a person to answer it, but no connected worker has a user interface. ` +
				`Run "flow worker" in a terminal in this project and re-run the flow. ` +
				`A worker the daemon forks cannot serve this step: it has no terminal to ask in.`,
		};
	}
}
