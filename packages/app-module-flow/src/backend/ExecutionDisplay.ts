import {
	type ExecutionDetailView,
	type ExecutionStatus,
	type ExecutionSummary,
	type FlowSummary,
	type StepView,
	excerptOf,
	outcomeLabel,
	runLabel,
	shortStarted,
	statusTag,
	stepStatusTag,
} from 'flow-core';

/**
 * Longest error shown in a table cell. The dsl-ui DataTable ignores a column's width/truncate and wraps a cell
 * anywhere, so the excerpt is cut here; the full error stays in the detail page and in `lastError`/`error`.
 */
export const MAX_ERROR_EXCERPT_LENGTH = 30;

type BadgeVariant = 'success' | 'danger' | 'info' | 'warning';

// Typed against ExecutionStatus so a status added to flow-core fails the build here instead of rendering uncoloured.
// @formatter:off
const STATUS_VARIANTS: Record<ExecutionStatus, BadgeVariant> = {
	queued: 'warning',
	running: 'info',
	completed: 'success',
	failed: 'danger',
	're-queued': 'warning',
};
// @formatter:on

const RECOVERED_PREFIX = 'recovered: ';

/** One line of the error; the text of a run (or step) that went on to complete says it was recovered. */
function errorExcerptOf(error: string | undefined, recovered: boolean): string {
	if (error === undefined) {
		return '';
	}
	return recovered
		? `${RECOVERED_PREFIX}${excerptOf(error, MAX_ERROR_EXCERPT_LENGTH - RECOVERED_PREFIX.length)}`
		: excerptOf(error, MAX_ERROR_EXCERPT_LENGTH);
}

/**
 * A history row plus the short ASCII strings the table shows as they are ("Oct 18 16:15", "build_task rsvl5t",
 * "ok, recovered"). Raw fields stay for the other consumers.
 */
export function toExecutionRow(summary: ExecutionSummary) {
	return {
		...summary,
		startedLabel: shortStarted(summary.startedAt),
		runLabel: runLabel(summary.flowId, summary.executionId),
		statusLabel: outcomeLabel(statusTag(summary.status), { recovered: summary.lastErrorRecovered }),
		errorExcerpt: errorExcerptOf(summary.lastError, summary.lastErrorRecovered),
	};
}

export function toStepRow(step: StepView) {
	const recovered = step.status === 'completed' && step.error !== undefined;
	return {
		...step,
		statusLabel: outcomeLabel(stepStatusTag(step.status), { recovered, attempts: step.attempts }),
		errorExcerpt: errorExcerptOf(step.error, recovered),
	};
}

const STATUS_FILTERS = [
	['all', 'All', undefined],
	['running', 'Running', 'running'],
	['queued', 'Queued', 'queued'],
	['completed', 'Completed', 'completed'],
	['failed', 'Failed', 'failed'],
] as const;

/** Labels of the status links; the DSL cannot style the active link, so its label carries it: "[Failed]". */
export function toStatusFilters(activeStatus: string | undefined): Record<string, string> {
	return Object.fromEntries(
		STATUS_FILTERS.map(([key, label, status]) => [key, status === activeStatus ? `[${label}]` : label])
	);
}

/** The detail plus a colour for its status badge (the only place the DSL can colour a status). */
export function toExecutionDetailRow(detail: ExecutionDetailView) {
	const statusVariant = (STATUS_VARIANTS as Record<string, BadgeVariant | undefined>)[detail.status];
	if (statusVariant === undefined) {
		throw new Error(
			`No badge colour for the execution status '${detail.status}' (known: ${Object.keys(STATUS_VARIANTS).join(', ')}): add it to STATUS_VARIANTS.`
		);
	}
	return {
		...detail,
		// A recovered error is not a success to read past: the badge says it and turns to warning.
		statusText: detail.lastErrorRecovered ? 'completed, recovered an error' : detail.status,
		statusVariant: detail.lastErrorRecovered ? 'warning' : statusVariant,
		steps: detail.steps.map(toStepRow),
	};
}

export function toFlowRow(flow: FlowSummary) {
	return { ...flow, lastStartedLabel: shortStarted(flow.lastStartedAt) };
}
