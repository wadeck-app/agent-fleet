import type { CappedText, FlowGraphNode, StepDataLink } from 'flow-core';

import type { DetailRow } from './StepDetails.js';

/** Characters of a captured output shown before "Show more". */
export const PREVIEW_CHARS = 600;

export interface IOLinkView {
	stepId: string;
	label: string;
	/** Which outputs are read and where, e.g. `plan, in prompt`. */
	detail: string;
}

export interface IOView {
	inputs: { name: string; text: string }[];
	inputsNote: string;
	usesOutputOf: IOLinkView[];
	usedBy: IOLinkView[];
	declaredOutputs: { name: string; text: string }[];
	/** Output the record kept (failed steps only), stdout first. */
	captured: { title: string; capped: CappedText }[];
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

function capturedTitle(stream: string, capped: CappedText): string {
	return capped.truncated ? `${stream} (last ${capped.text.length} of ${capped.totalChars} characters)` : stream;
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
	return {
		inputs: io.declaredInputs.map(input => ({
			name: input.name,
			text:
				input.value ??
				`${input.length ?? 0} chars; ${input.references.length > 0 ? `uses ${input.references.join(', ')}` : 'no reference'}`,
		})),
		inputsNote: io.notes.inputs,
		usesOutputOf: io.usesOutputOf.map(link => linkView(link, labelOf)),
		usedBy: io.usedBy.map(link => linkView(link, labelOf)),
		declaredOutputs: io.declaredOutputs.map(output => ({
			name: output.name,
			text: output.source === undefined ? output.type : `${output.type}, from ${output.source}`,
		})),
		captured: [
			...(recorded.stdout ? [{ title: capturedTitle('stdout', recorded.stdout), capped: recorded.stdout }] : []),
			...(recorded.stderr ? [{ title: capturedTitle('stderr', recorded.stderr), capped: recorded.stderr }] : []),
		],
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
