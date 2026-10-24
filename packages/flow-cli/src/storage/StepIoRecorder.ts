import type { RecordedValue, StepIoRecord } from 'flow-core';
import type { StepRecordLimits } from 'flow-engine';
import { DEFAULT_STEP_RECORD_LIMITS } from 'flow-engine';

import type { StepIoCapture } from '../ipc/Protocol';

/** Sizes in characters; see {@link StepRecordLimits}. Documented in `flow docs` (Section 10). */
export type StepIoLimits = StepRecordLimits;

export const DEFAULT_IO_LIMITS: StepIoLimits = DEFAULT_STEP_RECORD_LIMITS;

/** Masks the exact secret values of an execution out of a text. */
export type TextMasker = (executionId: string, text: string) => string;

type Keep = 'head' | 'tail';

function asText(value: unknown): string {
	return typeof value === 'string' ? value : (JSON.stringify(value) ?? '');
}

/**
 * Turns what a step received and produced into the capped, masked record kept in the execution file.
 *
 * Every text is masked BEFORE it is cut: cutting first could split a secret so that no variant matches
 * any more and a prefix of it would be stored. Nothing is dropped silently: past a cap a value is cut
 * (or emptied) and marked `truncated` with the length of the original.
 */
export class StepIoRecorder {
	constructor(
		private readonly maskText: TextMasker,
		private readonly limits: StepIoLimits = DEFAULT_IO_LIMITS
	) {}

	/** @param usedByOthers characters already stored by the other steps of the execution (the execution budget). */
	record(params: {
		executionId: string;
		capture: StepIoCapture | undefined;
		outputs: Record<string, unknown>;
		usedByOthers: number;
	}): StepIoRecord {
		const { executionId, capture, outputs } = params;
		let budget = Math.max(0, Math.min(this.limits.perStep, this.limits.perExecution - params.usedByOthers));
		let storedChars = 0;
		let truncated = false;

		const take = (raw: unknown, keep: Keep): RecordedValue => {
			const masked = this.maskText(executionId, asText(raw));
			const room = Math.min(this.limits.perValue, budget);
			const text =
				masked.length <= room ? masked : keep === 'head' ? masked.slice(0, room) : tailOf(masked, room);
			const cut = text.length < masked.length;
			budget -= text.length;
			storedChars += text.length;
			truncated ||= cut;
			return { text, truncated: cut, chars: masked.length };
		};
		const takeAll = (values: Record<string, unknown>): Record<string, RecordedValue> =>
			Object.fromEntries(Object.entries(values).map(([key, value]) => [key, take(value, 'head')]));

		const recordedInputs = takeAll(capture?.inputs ?? {});
		const recordedOutputs = takeAll(outputs);
		const stdout = capture?.stdout === undefined ? undefined : take(capture.stdout, 'tail');
		const stderr = capture?.stderr === undefined ? undefined : take(capture.stderr, 'tail');
		return {
			inputs: recordedInputs,
			outputs: recordedOutputs,
			...(stdout !== undefined ? { stdout } : {}),
			...(stderr !== undefined ? { stderr } : {}),
			truncated,
			storedChars,
		};
	}
}

// `slice(-0)` is the whole string, which is the opposite of an empty room.
function tailOf(text: string, room: number): string {
	return room === 0 ? '' : text.slice(-room);
}
