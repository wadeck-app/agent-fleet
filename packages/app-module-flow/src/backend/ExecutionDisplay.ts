import {
	type ExecutionDetailView,
	type ExecutionStatus,
	type ExecutionSummary,
	type FlowSummary,
	type StepView,
	excerptOf,
	startedLabel,
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

/** A history row plus the strings the table shows as they are. Raw fields stay for the other consumers. */
export function toExecutionRow(summary: ExecutionSummary) {
	return {
		...summary,
		startedLabel: startedLabel(summary.startedAt),
		errorExcerpt: excerptOf(summary.lastError, MAX_ERROR_EXCERPT_LENGTH),
	};
}

export function toStepRow(step: StepView) {
	return {
		...step,
		errorExcerpt: excerptOf(step.error, MAX_ERROR_EXCERPT_LENGTH),
	};
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
		statusVariant,
		steps: detail.steps.map(toStepRow),
	};
}

export function toFlowRow(flow: FlowSummary) {
	return { ...flow, lastStartedLabel: startedLabel(flow.lastStartedAt) };
}
