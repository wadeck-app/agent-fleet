import type { AttemptKind, FlowGraphNode } from 'flow-core';

export interface DetailRow {
	label: string;
	value: string;
	/** Tooltip of the value. */
	title?: string;
	/** The value is an ISO 8601 date: the panel writes it with DateText (the user's date settings live in React, not here). */
	isDate?: true;
}

export interface StepDetail {
	rows: DetailRow[];
	/** The step's error text, shown apart because it can be long. */
	error: string | undefined;
	/** Why the step did not run (or did not run to the end), when the run's path says so; absent for a step that ran. */
	outcome: { text: string; basis: 'recorded' | 'inferred' } | undefined;
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
// flow-core's ready-to-print step cost (total over attempts, "unknown" or "+" when incomplete); replaces the raw costUsd.
const COST_LABEL_KEY = 'costLabel';
const ATTEMPT_KIND_WORDS: Record<AttemptKind, string> = {
	retry: 'retries',
	loop: 'loop passes',
	relaunch: 'relaunched after a failed sub-step',
	rerun: 're-run',
};
const DATE_KEYS = new Set(['startedAt', 'completedAt']);

function formatValue(key: string, value: string | number | boolean): { value: string; isDate?: true } {
	if (DATE_KEYS.has(key) && typeof value === 'string') {
		// An unparsable date is shown as it came: the panel must not hide what the run recorded.
		return Number.isNaN(new Date(value).getTime()) ? { value } : { value, isDate: true };
	}
	return { value: String(value) };
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
	if (step.path?.ordinal !== undefined) {
		rows.push({ label: 'Run order', value: String(step.path.ordinal) });
	}
	if (step.durationLabel !== undefined) {
		rows.push({ label: 'Duration', value: step.durationLabel });
	}
	if (step.attempts !== undefined && step.attempts > 1) {
		const kind = step.path?.attemptKind;
		rows.push({
			label: 'Attempts',
			value:
				kind === undefined ? String(step.attempts) : `${step.attempts} (${ATTEMPT_KIND_WORDS[kind]}, inferred)`,
		});
	}

	const meta = step.meta ?? {};
	const costLabel = meta[COST_LABEL_KEY];
	// describeIO (metrics block, with the last attempt) shows the cost when the node carries it: one Cost row in the panel.
	const costInMetrics = step.io?.recorded.costLabel !== undefined;
	for (const key of Object.keys(META_LABELS)) {
		if (key === 'costUsd' && costInMetrics) {
			continue;
		}
		if (key === 'costUsd' && costLabel !== undefined) {
			rows.push({ label: 'Cost', value: String(costLabel) });
			continue;
		}
		const value = meta[key];
		if (value !== undefined) {
			rows.push({ label: META_LABELS[key]!, ...formatValue(key, value) });
		}
	}
	const error = meta['error'];
	const path = step.path;
	return {
		rows,
		error: error === undefined ? undefined : String(error),
		outcome:
			path === undefined || path.outcome === 'ran' || path.outcome === 'running'
				? undefined
				: { text: path.reason, basis: path.basis },
	};
}
