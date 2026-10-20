import type { FlowGraphNode } from 'flow-core';

export interface DetailRow {
	label: string;
	value: string;
}

export interface StepDetail {
	rows: DetailRow[];
	/** The step's error text, shown apart because it can be long. */
	error: string | undefined;
}

// Order is the order of display. A key not listed here is not shown (no raw dump of the record's meta).
const META_LABELS: Record<string, string> = {
	provider: 'Provider',
	model: 'Model',
	workerId: 'Worker',
	sourceId: 'Worker source',
	startedAt: 'Started',
	completedAt: 'Completed',
	when: 'Condition',
	onFailureGoto: 'On failure, goes back to',
	onFailureMaxIterations: 'Max iterations',
	retryMaxAttempts: 'Max attempts',
	flowId: 'Sub-flow',
	interventionType: 'Intervention',
	blocking: 'Blocking',
	parent: 'Parent step',
	labels: 'Labels',
	costUsd: 'Cost (USD)',
};
const DATE_KEYS = new Set(['startedAt', 'completedAt']);

function formatValue(key: string, value: string | number | boolean): string {
	if (DATE_KEYS.has(key) && typeof value === 'string') {
		const date = new Date(value);
		// violations-suppress: ts/no-locale-date shows the reader's own timezone; @wadeck-app/dsl-ui exports no shared date formatter
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
	}
	return String(value);
}

/** The facts the details panel shows for one step, as label/value rows. */
export function describeStep(step: FlowGraphNode): StepDetail {
	// The status is the badge of the panel; a removed or injected node says so once, here, not through its kind and raw flags.
	const rows: DetailRow[] = [];
	if (step.kind === 'removed') {
		rows.push({ label: 'Flow file', value: 'step no longer declared' });
	} else if (step.kind === 'injected') {
		rows.push({ label: 'Flow file', value: 'created at run time' });
	} else {
		rows.push({ label: 'Kind', value: step.kind });
	}
	if (step.durationLabel !== undefined) {
		rows.push({ label: 'Duration', value: step.durationLabel });
	}
	if (step.attempts !== undefined && step.attempts > 1) {
		rows.push({ label: 'Attempts', value: String(step.attempts) });
	}

	const meta = step.meta ?? {};
	for (const key of Object.keys(META_LABELS)) {
		const value = meta[key];
		if (value !== undefined) {
			rows.push({ label: META_LABELS[key]!, value: formatValue(key, value) });
		}
	}
	const error = meta['error'];
	return { rows, error: error === undefined ? undefined : String(error) };
}
