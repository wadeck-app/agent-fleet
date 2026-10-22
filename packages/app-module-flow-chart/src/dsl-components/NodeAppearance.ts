import type { FlowGraphNode } from 'flow-core';

import { type StatusStyle, statusStyle } from './StatusStyle.js';

// A step the run did not execute is recorded as `completed` (skipped by the scheduler) or `pending` (never reached):
// drawn as such, the chart would show green boxes for steps that never ran. The path decides what the reader sees.
// Written out in full: Tailwind finds classes by scanning source text.
const SKIPPED: StatusStyle = {
	label: 'skipped',
	glyph: '[~]',
	nodeClass: 'border-dashed border-border bg-surface text-muted',
	badgeClass: 'bg-muted-bg text-muted',
};
const NOT_REACHED: StatusStyle = {
	label: 'not reached',
	glyph: '[-]',
	nodeClass: 'border-dashed border-border bg-muted-bg text-muted',
	badgeClass: 'bg-muted-bg text-muted',
};

/** The look of a node: its status, unless the run's path says the step did not run. */
export function nodeStyle(step: FlowGraphNode): StatusStyle {
	const outcome = step.path?.outcome;
	if (outcome === 'skipped') {
		return SKIPPED;
	}
	return outcome === 'not-reached' ? NOT_REACHED : statusStyle(step.status);
}

/** Entries of the legend and of the summary that exist only because of the path. */
export const PATH_LEGEND: readonly StatusStyle[] = [SKIPPED, NOT_REACHED];
