import { type ExecutionState, renderStepIoLines } from 'flow-core';

const NO_STEP_STARTED = 'No step has started yet.';

/**
 * What each started step received and produced, as one text grouped by step: a header line, then flow-core's
 * `renderStepIoLines` (the lines of `flow show --io`). The DSL has no repeater, so one text in one collapsed section
 * is the smallest page that can show it. The record must be the served one (terminal control stripped, values masked
 * when recorded). A step without a recording says so; a pending step has nothing to show and is left out.
 */
export function renderStepsIoText(record: ExecutionState): string {
	const blocks = Object.entries(record.steps)
		.map(([stepId, step]) => ({ stepId, status: step.status, lines: renderStepIoLines(step) }))
		.filter(block => block.lines.length > 0)
		.map(block => [`${block.stepId} (${block.status})`, ...block.lines].join('\n'));
	return blocks.length === 0 ? NO_STEP_STARTED : blocks.join('\n\n');
}
