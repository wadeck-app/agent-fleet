import {
	type ExecutionDetailView,
	type ExecutionStatus,
	type ExecutionSummary,
	type FlowSummary,
	type StepRetryPolicy,
	type StepView,
	executionLogsPath,
	outcomeLabel,
	requireTimestamp,
	retryLabel,
	statusTag,
	stepStatusTag,
} from 'flow-core';

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

/**
 * A history row plus the short ASCII status the table shows as it is ("ok, recovered") and the links of the run
 * (logsHref: a DSL string cannot be concatenated, so the path is built here from flow-core's contract). The flow name and the
 * id are sent whole: the table column truncates with an ellipsis when the viewport needs it.
 * Timestamps stay ISO 8601 (startedAt): the shell formats them (DataTable `format: datetime`), like everywhere in app-core.
 */
export function toExecutionRow(summary: ExecutionSummary) {
	return {
		...summary,
		startedAt: requireTimestamp(summary.startedAt),
		statusLabel: outcomeLabel(statusTag(summary.status), { recovered: summary.lastErrorRecovered }),
		logsHref: executionLogsPath(summary.executionId),
	};
}

/**
 * A step row: the short status word and the retry cell. `policy` is the retry budget the flow file declares for this step,
 * undefined when it is unknown (see retryLabel).
 */
export function toStepRow(step: StepView, policy: StepRetryPolicy | undefined) {
	const recovered = step.status === 'completed' && step.error !== undefined;
	return {
		...step,
		statusLabel: outcomeLabel(stepStatusTag(step.status), { recovered }),
		retryLabel: retryLabel(step, policy),
	};
}

/**
 * The detail plus a colour for its status badge (the only place the DSL can colour a status). `policies` are the retry
 * budgets of the flow file by step id, undefined when the file cannot be read.
 */
export function toExecutionDetailRow(
	detail: ExecutionDetailView,
	policies: Readonly<Record<string, StepRetryPolicy>> | undefined
) {
	const statusVariant = (STATUS_VARIANTS as Record<string, BadgeVariant | undefined>)[detail.status];
	if (statusVariant === undefined) {
		throw new Error(
			`No badge colour for the execution status '${detail.status}' (known: ${Object.keys(STATUS_VARIANTS).join(', ')}): add it to STATUS_VARIANTS.`
		);
	}
	return {
		...detail,
		// One row, so a DataTable shows the run start and end in the shell datetime format; null while the run is in progress.
		// The version of the definition that ran sits in the same row (version, then how it was chosen), so one table is the header.
		timing: [
			{
				startedAt: requireTimestamp(detail.startedAt),
				completedAt: detail.completedAt,
				version: detail.flowVersion ?? 'not recorded',
				definition: detail.versionNote,
			},
		],
		// A recovered error is not a success to read past: the badge says it and turns to warning.
		statusText: detail.lastErrorRecovered ? 'completed, recovered an error' : detail.status,
		statusVariant: detail.lastErrorRecovered ? 'warning' : statusVariant,
		logsHref: executionLogsPath(detail.executionId),
		steps: detail.steps.map(step => toStepRow(step, policies?.[step.stepId])),
	};
}

/** A flow row; its last start stays ISO 8601 for the shell to format, after a check that it is a date. */
export function toFlowRow(flow: FlowSummary) {
	return { ...flow, lastStartedAt: requireTimestamp(flow.lastStartedAt) };
}
