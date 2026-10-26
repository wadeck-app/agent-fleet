import type { StepState } from '../ipc/Protocol';

/** Feedback kept per relaunch in the execution record (truncated). */
const MAX_RELAUNCH_FEEDBACK_CHARS = 2000;

export interface StepStartParams {
	/** The step was reopened by `markExecutionResumed`: this start is a `resume`. */
	resumed: boolean;
	/** Set when this start re-runs a parent because a sub-step failed; kept in `relaunches`. */
	relaunchFeedback?: string;
	/** What a start after the first is: a `retry`, or a `loop` (any other re-run). Ignored for a first start. */
	reRunKind: 'retry' | 'loop';
	/** Which source and worker took the step. */
	provenance?: { sourceId?: string; workerId?: string };
}

/**
 * The record of a step that starts running. Existing fields (e.g. `injected: true`) are preserved, the
 * attempt counters grow, and everything left by the previous attempt (error, output, io) is cleared.
 */
export function startStepEntry(previous: StepState | undefined, params: StepStartParams): StepState {
	const previousMs =
		previous?.startedAt && previous.completedAt
			? new Date(previous.completedAt).getTime() - new Date(previous.startedAt).getTime()
			: 0;
	const relaunches =
		params.relaunchFeedback === undefined
			? previous?.relaunches
			: [
					...(previous?.relaunches ?? []),
					{
						at: new Date().toISOString(),
						feedback: params.relaunchFeedback.slice(0, MAX_RELAUNCH_FEEDBACK_CHARS),
					},
				];
	const attempts = (previous?.attempts ?? 0) + 1;
	return {
		...previous,
		attempts,
		priorAttemptsMs: (previous?.priorAttemptsMs ?? 0) + previousMs,
		...(relaunches === undefined ? {} : { relaunches }),
		// Moved into the attemptLog entry when this attempt settles
		runningAttempt:
			params.relaunchFeedback !== undefined
				? { origin: 'relaunch', relaunchIndex: relaunches!.length - 1 }
				: params.resumed
					? { origin: 'resume' }
					: { origin: attempts === 1 ? 'first' : params.reRunKind },
		status: 'running',
		startedAt: new Date().toISOString(),
		// A new attempt: the previous one's failure must not linger on a step that may now succeed
		error: undefined,
		stdout: undefined,
		stderr: undefined,
		io: undefined,
		completedAt: undefined,
		// A step that now runs is no longer "not run"
		skippedReason: undefined,
		...(params.provenance?.sourceId !== undefined ? { sourceId: params.provenance.sourceId } : {}),
		...(params.provenance?.workerId !== undefined ? { workerId: params.provenance.workerId } : {}),
	};
}
