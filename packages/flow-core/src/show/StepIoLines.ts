import type { RecordedValue, StepState } from '../execution/ExecutionState.js';

// The lines `flow show <id> --io` prints under a step: what it received and produced, as recorded by the daemon.
// ASCII only; the values were masked and capped when they were recorded.

const STEP_INDENT = '      ';
const VALUE_INDENT = '        ';
const TEXT_INDENT = '          ';

function indentText(text: string): string[] {
	return text.split('\n').map(line => TEXT_INDENT + line);
}

function truncationNote(value: RecordedValue, tail: boolean): string {
	return `truncated, ${String(value.text.length)} of ${String(value.chars)} chars kept${tail ? ', tail' : ''}`;
}

function valueLines(name: string, value: RecordedValue, tail: boolean): string[] {
	if (value.truncated) {
		return [`${VALUE_INDENT}${name} (${truncationNote(value, tail)}):`, ...indentText(value.text)];
	}
	if (value.text.includes('\n')) {
		return [`${VALUE_INDENT}${name}:`, ...indentText(value.text)];
	}
	return [`${VALUE_INDENT}${name}: ${value.text}`];
}

function sectionLines(title: string, values: Record<string, RecordedValue>): string[] {
	const entries = Object.entries(values);
	if (entries.length === 0) {
		return [`${STEP_INDENT}${title}: (none)`];
	}
	return [`${STEP_INDENT}${title}:`, ...entries.flatMap(([name, value]) => valueLines(name, value, false))];
}

function streamLines(name: string, value: RecordedValue | undefined): string[] {
	if (value === undefined || (value.text === '' && !value.truncated)) {
		return [];
	}
	if (value.truncated) {
		return [`${STEP_INDENT}${name} (${truncationNote(value, true)}):`, ...indentText(value.text)];
	}
	return [`${STEP_INDENT}${name}:`, ...indentText(value.text)];
}

/** Empty for a step that has not started; says so, rather than staying silent, for a record without `io`. */
export function renderStepIoLines(step: StepState): string[] {
	if (step.status === 'pending') {
		return [];
	}
	const io = step.io;
	if (io === undefined) {
		return [`${STEP_INDENT}inputs/outputs: not recorded for this run (record written by an older flow)`];
	}
	return [
		...sectionLines('inputs', io.inputs),
		...sectionLines('outputs', io.outputs),
		...streamLines('stdout', io.stdout),
		...streamLines('stderr', io.stderr),
	];
}
