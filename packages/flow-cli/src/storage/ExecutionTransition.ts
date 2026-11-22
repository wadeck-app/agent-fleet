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
	| { kind: 'step-failed'; state: ExecutionState; stepId: string };

/** Told about every real transition, once. Must not throw into the store. */
export interface ExecutionTransitionListener {
	onTransition(transition: ExecutionTransition): void;
}
