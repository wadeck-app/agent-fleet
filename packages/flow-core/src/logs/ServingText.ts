import type { ExecutionState, StepState } from '../execution/ExecutionState.js';
import { stripAnsi } from './AnsiStrip.js';

// What every HTTP route of the app-modules applies to free text that came from a run (output, errors, log lines):
// terminal control sequences are stripped, nothing else. There is NO secret detection here: guessing a secret from its
// name or its shape is not protection. Secrets are masked by exact value when the daemon WRITES the record and the
// logs (declared secrets only), so what is served is what is stored.
//
// Truncation by the caller comes AFTER stripping, so that a cut cannot split an escape sequence.

/** Strips terminal control sequences. Never throws. */
export function stripForServing(text: string): string {
	return stripAnsi(text);
}

type StepTextField = 'error' | 'stdout' | 'stderr';

function stripStep(step: StepState, fields: readonly StepTextField[], withFeedback: boolean): StepState {
	const copy: StepState = { ...step };
	for (const field of fields) {
		const value = step[field];
		if (value !== undefined) {
			copy[field] = stripForServing(value);
		}
	}
	if (withFeedback && step.relaunches !== undefined) {
		copy.relaunches = step.relaunches.map(({ at, feedback }) => ({ at, feedback: stripForServing(feedback) }));
	}
	return copy;
}

function stripRecord(record: ExecutionState, fields: readonly StepTextField[], withFeedback: boolean): ExecutionState {
	return {
		...record,
		...(record.lastError !== undefined ? { lastError: stripForServing(record.lastError) } : {}),
		steps: Object.fromEntries(
			Object.entries(record.steps).map(([id, step]) => [id, stripStep(step, fields, withFeedback)])
		),
	};
}

/**
 * A copy of the record with only the error texts served (`lastError` and the `error` of each step): what the rows of
 * a list and the dashboard digest read, without scanning every step output.
 */
export function stripErrorsForServing(record: ExecutionState): ExecutionState {
	return stripRecord(record, ['error'], false);
}

/**
 * A copy of the record with `lastError` and, for each step, `error`, `stdout`, `stderr` and the relaunch feedback
 * served. Done before anything is rendered or cut from the record. The stored record is not touched.
 */
export function stripRecordForServing(record: ExecutionState): ExecutionState {
	return stripRecord(record, ['error', 'stdout', 'stderr'], true);
}
