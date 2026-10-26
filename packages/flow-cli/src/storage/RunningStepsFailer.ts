import type { ExecutionState, StepStatus } from '../ipc/Protocol';
import { AttemptLedger } from './AttemptLedger';

/**
 * A finished execution has no step in progress: any step still `running` is failed with `error`.
 * The attempt that was in flight is lost with the execution: recorded as abandoned, with no figures.
 *
 * @param mask - hides declared secrets in the error before the attempt entry cuts it
 * @returns the steps of the finished execution (the input state is not changed)
 */
export function failRunningSteps(
	state: ExecutionState,
	error: string,
	mask: (text: string) => string
): ExecutionState['steps'] {
	const completedAt = new Date().toISOString();
	const steps = Object.fromEntries(
		Object.entries(state.steps).map(([id, step]) => [
			id,
			step.status === 'running'
				? { ...step, status: 'failed' as StepStatus, error: step.error ?? error, completedAt }
				: step,
		])
	);
	const settling = { ...state, steps };
	for (const [id, step] of Object.entries(state.steps)) {
		if (step.status === 'running') {
			AttemptLedger.settle(
				settling,
				id,
				{ outcome: 'abandoned', endReason: 'execution_ended', error: mask(error) },
				completedAt
			);
		}
	}
	return steps;
}
