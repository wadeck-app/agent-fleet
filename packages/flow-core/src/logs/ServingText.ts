import type { ExecutionState, RecordedValue, StepIoRecord, StepState } from '../execution/ExecutionState.js';
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

interface Served {
	fields: readonly StepTextField[];
	withFeedback: boolean;
	withIo: boolean;
}

function stripValue(value: RecordedValue): RecordedValue {
	return { ...value, text: stripForServing(value.text) };
}

function stripValues(values: Record<string, RecordedValue>): Record<string, RecordedValue> {
	return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, stripValue(value)]));
}

/** A copy of the recorded inputs, outputs and stream tails with terminal control stripped; `chars` still counts the original. */
export function stripIoForServing(io: StepIoRecord): StepIoRecord {
	return {
		...io,
		inputs: stripValues(io.inputs),
		outputs: stripValues(io.outputs),
		...(io.stdout !== undefined ? { stdout: stripValue(io.stdout) } : {}),
		...(io.stderr !== undefined ? { stderr: stripValue(io.stderr) } : {}),
	};
}

function stripStep(step: StepState, { fields, withFeedback, withIo }: Served): StepState {
	const copy: StepState = { ...step };
	for (const field of fields) {
		const value = step[field];
		if (value !== undefined) {
			copy[field] = stripForServing(value);
		}
	}
	if (withIo && step.io !== undefined) {
		copy.io = stripIoForServing(step.io);
	}
	if (withFeedback && step.relaunches !== undefined) {
		copy.relaunches = step.relaunches.map(({ at, feedback }) => ({ at, feedback: stripForServing(feedback) }));
	}
	return copy;
}

function stripRecord(record: ExecutionState, served: Served): ExecutionState {
	return {
		...record,
		...(record.lastError !== undefined ? { lastError: stripForServing(record.lastError) } : {}),
		steps: Object.fromEntries(Object.entries(record.steps).map(([id, step]) => [id, stripStep(step, served)])),
	};
}

/**
 * A copy of the record with only the error texts served (`lastError` and the `error` of each step): what the rows of
 * a list and the dashboard digest read, without scanning every step output.
 */
export function stripErrorsForServing(record: ExecutionState): ExecutionState {
	return stripRecord(record, { fields: ['error'], withFeedback: false, withIo: false });
}

/**
 * A copy of the record with `lastError` and, for each step, `error`, `stdout`, `stderr`, the relaunch feedback and
 * the recorded inputs, outputs and stream tails (`io`) served. Done before anything is rendered or cut from the record. The stored record is not touched.
 */
export function stripRecordForServing(record: ExecutionState): ExecutionState {
	return stripRecord(record, { fields: ['error', 'stdout', 'stderr'], withFeedback: true, withIo: true });
}
