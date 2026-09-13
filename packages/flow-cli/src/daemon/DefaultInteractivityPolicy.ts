import type { InteractivityDecision, InteractivityPolicyProvider, InteractivityRequest } from 'extension-points';

/**
 * How long a `user_intervention` step waits for an interactive worker before giving up.
 *
 * Must outlast one full reconnect backoff of a waiting worker (MAX_RECONNECT_DELAY_MS in
 * WorkerLaunch, 30s), or the wait cannot achieve what it exists for.
 */
export const DEFAULT_INTERACTIVE_WAIT_MS = 45_000;

/**
 * Built-in S9: a `user_intervention` step waits a bounded time for somebody able to answer it,
 * then fails with the command that would have made it runnable.
 *
 * This used to fail immediately (D#39), on the premise that waiting could never help: a forked
 * worker has no TTY, so the daemon could not create its way out. That premise no longer holds, in
 * two ways. An approval plugin decides for itself whether it needs a terminal -- file-approval does
 * not -- so a headless worker can be interactive. And an idle daemon stops and disconnects external
 * workers, so a `flow worker` is *always* briefly absent just after a run brings a fresh daemon up:
 * failing at once made the step unwinnable, marked failed a second before its worker re-registered.
 *
 * The bound keeps what D#39 was protecting: a step blocked on a terminal nobody will ever open ends
 * with something to act on instead of hanging forever.
 */
export class DefaultInteractivityPolicy implements InteractivityPolicyProvider {
	private readonly waitMs: number;

	constructor(waitMs: number = DEFAULT_INTERACTIVE_WAIT_MS) {
		this.waitMs = waitMs;
	}

	decide({ stepId, interactiveWorkers, waitingMs }: InteractivityRequest): InteractivityDecision {
		// Routing only asks when it found no *idle* interactive worker. One that exists but is
		// busy will free up, so failing here would kill a step that was about to run.
		if (interactiveWorkers > 0) return { action: 'wait' };

		if (waitingMs < this.waitMs) return { action: 'wait' };

		const waitedSeconds = Math.round(waitingMs / 1000);
		return {
			action: 'fail',
			reason:
				`Step "${stepId}" needs a person to answer it. No connected worker declared a user interface ` +
				`in the ${String(waitedSeconds)}s it waited. ` +
				`Run "flow worker" in this project and re-run the flow; it must print "interactive: true". ` +
				`If it prints "interactive: false", configure an approval plugin -- plugins.cli-approval needs ` +
				`a terminal, plugins.file-approval answers from a file and works without one. ` +
				`A worker the daemon forks cannot serve this step.`,
		};
	}
}
