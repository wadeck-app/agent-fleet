import type { ExecutionState } from '../ipc/Protocol';

/**
 * A change of state the execution store has just recorded. `state` is the record as written,
 * so declared secrets are already masked in it.
 */
export type ExecutionTransition =
	| { kind: 'execution-started'; state: ExecutionState }
	| { kind: 'execution-completed'; state: ExecutionState }
	| { kind: 'execution-failed'; state: ExecutionState }
	/** `flow pause`: `state.paused` holds the pause. */
	| { kind: 'execution-paused'; state: ExecutionState }
	/** `flow unpause`: the pause is gone from `state`, so it carries when it began and when it ended. */
	| { kind: 'execution-unpaused'; state: ExecutionState; pausedAt: string; resumedAt: string }
	| { kind: 'step-started'; state: ExecutionState; stepId: string }
	| { kind: 'step-completed'; state: ExecutionState; stepId: string }
	| { kind: 'step-failed'; state: ExecutionState; stepId: string }
	/** A queued step is kept back because the worker it was to go to is not ready; nothing is written to the record. */
	| { kind: 'step-deferred'; state: ExecutionState; stepId: string; deferral: StepDeferral };

/** Why a queued step is kept back by a worker that is not ready (one `flow.step.deferred` event). Text already secret-masked. */
export interface StepDeferral {
	/** Short code chosen by the worker, or by the daemon for its own timeouts. */
	reason: string;
	/** Human text, verbatim from the worker (masked), or the daemon's own for its timeouts. */
	message: string;
	/** Which timer or party produced it: the alive ack timed out, the answer timed out, or the worker itself said not ready. */
	phase: 'ack' | 'answer' | 'worker';
	/** When the daemon asks again. */
	retryAfterSeconds: number;
	/** Declared source of the worker that was asked, when known. */
	workerSource?: string;
}

/** Told about every real transition, once. Must not throw into the store. */
export interface ExecutionTransitionListener {
	onTransition(transition: ExecutionTransition): void;
}
