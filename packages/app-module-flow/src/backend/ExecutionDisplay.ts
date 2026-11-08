import {
	type ExecutionDetailView,
	type ExecutionStatus,
	type ExecutionSummary,
	type FlowSummary,
	SKIPPED_LABEL,
	type StepRetryPolicy,
	type StepView,
	WAITING_FOR_WORKSPACE_LABEL,
	executionLogsPath,
	isRecoveredStep,
	outcomeLabel,
	requireTimestamp,
	retryHint,
	retryLabel,
	runStatusHint,
	statusTag,
	stepStatusHint,
	stepStatusTag,
} from 'flow-core';

import { costNotes, hasAttemptRows, toAttemptRows, withCostHint } from './StepAttemptRows.js';

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
		statusLabel: outcomeLabel(statusTag(summary.status, summary.waitingForWorkspace === true), {
			recovered: summary.lastErrorRecovered,
		}),
		// The tooltip of the status cell (DataTable `title: '{statusHint}'`); '' = none, a blank title is not shown.
		statusHint: runStatusHint(summary) ?? '',
		logsHref: executionLogsPath(summary.executionId),
	};
}

/**
 * A step row: the short status word, the cost cell (flow-core costLabel, the step total over all attempts; a dash for a step
 * without model cost, never $0) and the retry cell. `policy` is the retry budget the flow file declares for this step,
 * undefined when it is unknown (see retryLabel).
 */
export function toStepRow(step: StepView, policy: StepRetryPolicy | undefined) {
	const skipped = step.skipped === true;
	// A failed attempt in the history (or, on older records, an error left on the completed step): see isRecoveredStep.
	const recovered = isRecoveredStep(step);
	const retries = skipped ? '-' : retryLabel(step, policy);
	const expandable = hasAttemptRows(step);
	return {
		...step,
		// A step that did not run is stored as completed: it says skipped, not ok, and has no retries to count.
		statusLabel: skipped ? SKIPPED_LABEL : outcomeLabel(stepStatusTag(step.status), { recovered }),
		costLabel: withCostHint(step.costLabel ?? '-', expandable),
		// Row panel (DataTable expansionCondition/expansion): the attempts, only for a step that ran 2+ times or has an unknown cost.
		expandable,
		attemptRows: expandable ? toAttemptRows(step.attemptHistory ?? []) : [],
		costNotes: expandable ? costNotes(step.attemptHistory ?? []) : '',
		retryLabel: retries,
		// Tooltips of the Status and Retries cells (DataTable `title`); '' = none.
		statusHint: stepStatusHint(step) ?? '',
		retryHint: retryHint(retries) ?? '',
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
	const statusHint = runStatusHint(detail) ?? '';
	const waiting = detail.waitingForWorkspace === true;
	return {
		...detail,
		// A Badge has no tooltip: the page wraps it in a Tooltip when hasStatusHint, and shows it bare when lacksStatusHint
		// (the DSL has no negation for $if).
		statusHint,
		hasStatusHint: statusHint !== '',
		lacksStatusHint: statusHint === '',
		// One row, so a DataTable shows the run start and end in the shell datetime format; null while the run is in progress.
		// The version of the definition that ran sits in the same row (version, then how it was chosen), so one table is the header.
		timing: [
			{
				startedAt: requireTimestamp(detail.startedAt),
				completedAt: detail.completedAt,
				version: detail.flowVersion ?? 'not recorded',
				totalCost: detail.totalCostLabel ?? '-',
				definition: detail.versionNote,
			},
		],
		// A recovered error is not a success to read past: the badge says it and turns to warning.
		// A run that waits for a workspace is stored as queued: the badge says what it waits for and turns to warning.
		statusText: waiting
			? WAITING_FOR_WORKSPACE_LABEL
			: detail.lastErrorRecovered
				? 'completed, recovered an error'
				: detail.status,
		statusVariant: waiting || detail.lastErrorRecovered ? 'warning' : statusVariant,
		// The reason as visible text (the page shows it under the header when not empty; '' = the run does not wait).
		workspaceWaitText: detail.workspaceWait?.message ?? '',
		logsHref: executionLogsPath(detail.executionId),
		steps: detail.steps.map(step => toStepRow(step, policies?.[step.stepId])),
	};
}

/** A flow row; its last start stays ISO 8601 for the shell to format, after a check that it is a date. */
export function toFlowRow(flow: FlowSummary) {
	return { ...flow, lastStartedAt: requireTimestamp(flow.lastStartedAt) };
}
