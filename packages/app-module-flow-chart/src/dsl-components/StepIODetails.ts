import type { CappedText, FlowGraphNode, RecordedValue, StepDataLink } from 'flow-core';

import type { DetailRow } from './StepDetails.js';

/** Characters of a captured output shown before "Show more". */
export const PREVIEW_CHARS = 600;

export interface IOLinkView {
	stepId: string;
	label: string;
	/** Which outputs are read and where, e.g. `plan, in prompt`. */
	detail: string;
}

/** A value shown in a monospace block, with the visible note when it is cut. */
export interface ValueBlock {
	title: string;
	capped: CappedText;
	/** Set when the text is only part of the original, e.g. `truncated, 5000 chars (11 shown)`. */
	note?: string;
}

export interface IOView {
	/** Declared inputs without a recorded value (or all of them for an older record). */
	inputs: { name: string; text: string }[];
	/** Resolved inputs the daemon recorded, declared ones first. */
	recordedInputs: ValueBlock[];
	inputsNote: string;
	usesOutputOf: IOLinkView[];
	usedBy: IOLinkView[];
	/** Declared outputs without a recorded value. */
	declaredOutputs: { name: string; text: string }[];
	recordedOutputs: ValueBlock[];
	/** stdout then stderr: the recorded tails, else the output kept for a failed step of an older record. */
	captured: ValueBlock[];
	outputsNote: string;
	/** Facts of the run the record holds, beyond the rows of the details panel. */
	run: DetailRow[];
	relaunches: string[];
}

function linkView(link: StepDataLink, labelOf: (stepId: string) => string): IOLinkView {
	const where = `in ${link.fields.join(', ')}`;
	return {
		stepId: link.stepId,
		label: labelOf(link.stepId),
		detail: link.outputs.length > 0 ? `${link.outputs.join(', ')}, ${where}` : where,
	};
}

// The label counts the CLEANED text (terminal control stripped, secrets hidden), as the route cuts after cleaning:
// "last 2000 of 30880 characters" is 2000 of the 30880 characters the panel could show, not of the raw capture.
function capturedTitle(stream: string, capped: CappedText): string {
	return capped.truncated ? `${stream} (last ${capped.text.length} of ${capped.totalChars} characters)` : stream;
}

function valueBlock(title: string, value: RecordedValue): ValueBlock {
	return {
		title,
		capped: { text: value.text, truncated: value.truncated, totalChars: value.chars },
		...(value.truncated ? { note: `truncated, ${value.chars} chars (${value.text.length} shown)` } : {}),
	};
}

/** What the panel shows about the inputs and outputs of a step; undefined when the node carries no `io` (older API). */
export function describeIO(step: FlowGraphNode, labelOf: (stepId: string) => string): IOView | undefined {
	const io = step.io;
	if (io === undefined) {
		return undefined;
	}
	const { recorded } = io;
	const run: DetailRow[] = [];
	if (recorded.exitCode !== undefined) {
		run.push({ label: 'Exit code', value: String(recorded.exitCode) });
	}
	if (recorded.sessionId !== undefined) {
		run.push({ label: 'Session', value: recorded.sessionId });
	}
	if (recorded.ttftMs !== undefined) {
		run.push({ label: 'First token', value: `${recorded.ttftMs} ms` });
	}
	if (recorded.tokens !== undefined) {
		const t = recorded.tokens;
		run.push({
			label: 'Tokens',
			value: `${t.input} in, ${t.output} out, ${t.cacheRead} cache read, ${t.cacheWrite} cache write`,
		});
	}
	const recordedIo = recorded.io;
	const recordedInputKeys = new Set(Object.keys(recordedIo?.inputs ?? {}));
	const recordedOutputKeys = new Set(Object.keys(recordedIo?.outputs ?? {}));
	// A model step's stdout is its final response; the CLI's own stdout is the transport.
	const stdoutLabel = step.kind === 'model' ? 'final response' : 'stdout';
	const captured: ValueBlock[] =
		recordedIo === undefined
			? [
					...(recorded.stdout
						? [{ title: capturedTitle('stdout', recorded.stdout), capped: recorded.stdout }]
						: []),
					...(recorded.stderr
						? [{ title: capturedTitle('stderr', recorded.stderr), capped: recorded.stderr }]
						: []),
				]
			: [
					...(recordedIo.stdout ? [valueBlock(stdoutLabel, recordedIo.stdout)] : []),
					...(recordedIo.stderr ? [valueBlock('stderr', recordedIo.stderr)] : []),
				];
	return {
		inputs: io.declaredInputs
			.filter(input => !recordedInputKeys.has(input.name))
			.map(input => ({
				name: input.name,
				text:
					input.value ??
					`${input.length ?? 0} chars; ${input.references.length > 0 ? `uses ${input.references.join(', ')}` : 'no reference'}`,
			})),
		recordedInputs: Object.entries(recordedIo?.inputs ?? {}).map(([key, value]) => valueBlock(key, value)),
		inputsNote: io.notes.inputs,
		usesOutputOf: io.usesOutputOf.map(link => linkView(link, labelOf)),
		usedBy: io.usedBy.map(link => linkView(link, labelOf)),
		declaredOutputs: io.declaredOutputs
			.filter(output => !recordedOutputKeys.has(output.name))
			.map(output => ({
				name: output.name,
				text: output.source === undefined ? output.type : `${output.type}, from ${output.source}`,
			})),
		recordedOutputs: Object.entries(recordedIo?.outputs ?? {}).map(([key, value]) => valueBlock(key, value)),
		captured,
		outputsNote: io.notes.outputs,
		run,
		relaunches: recorded.relaunches.map(relaunch => `${relaunch.at}: ${relaunch.feedback}`),
	};
}

/** The text to show now: the beginning until "Show more" is used, then everything the API sent. */
export function previewOf(capped: CappedText, expanded: boolean): { text: string; hiddenChars: number } {
	if (expanded || capped.text.length <= PREVIEW_CHARS) {
		return { text: capped.text, hiddenChars: 0 };
	}
	return { text: capped.text.slice(0, PREVIEW_CHARS), hiddenChars: capped.text.length - PREVIEW_CHARS };
}
