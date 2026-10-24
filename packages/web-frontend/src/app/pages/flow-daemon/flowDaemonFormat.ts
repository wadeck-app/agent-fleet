import type { BadgeProps } from '@framework/components/primitives/Badge';
import { formatDateFull } from '@framework/utils/formatting/DateFormat';
import { FLOW_EXECUTION_STATUSES } from '@shared/api/flow-daemon.contract';
import type { FlowExecutionLogsResponse } from '@shared/api/flow-daemon.contract';

/**
 * ===========================================================================================
 * FLOW DAEMON FORMAT HELPERS
 * ===========================================================================================
 *
 * Pure presentation helpers shared by the flow daemon pages. No React, no I/O.
 *
 * ===========================================================================================
 */

export type FlowExecutionStatus = (typeof FLOW_EXECUTION_STATUSES)[number];

/** Step statuses (flow-core StepStatus); the badge is shared by executions and steps. */
const FLOW_STEP_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

/** Every status the badge can display: execution statuses plus step-only ones, without duplicates. */
const KNOWN_BADGE_STATUSES = [...new Set<string>([...FLOW_EXECUTION_STATUSES, ...FLOW_STEP_STATUSES])];

/** Sentinel for "no filter" in Select components (Radix forbids empty item values). */
export const ALL_FILTER_VALUE = 'all';

export function isFlowExecutionStatus(value: string): value is FlowExecutionStatus {
	return FLOW_EXECUTION_STATUSES.some(status => status === value);
}

/** Converts a Select value to a status filter; `all` means no filter. Fails on anything else. */
export function toStatusFilter(value: string): FlowExecutionStatus | undefined {
	if (value === ALL_FILTER_VALUE) {
		return undefined;
	}
	if (!isFlowExecutionStatus(value)) {
		throw new Error(
			`Unknown execution status filter '${value}'. Expected one of: ${FLOW_EXECUTION_STATUSES.join(', ')}.`
		);
	}
	return value;
}

/**
 * Badge variant for a status. The backend sends the status as a free string; a status this
 * frontend does not know fails loudly so that the missing variant gets added.
 */
export function getStatusBadgeVariant(status: string): NonNullable<BadgeProps['variant']> {
	switch (status) {
		case 'completed':
			return 'success';
		case 'failed':
			return 'destructive';
		case 'running':
			return 'info';
		case 'queued':
			return 'secondary';
		// Step not started yet: neutral, distinct from the filled 'queued' execution badge
		case 'pending':
			return 'outline';
		case 're-queued':
			return 'warning';
		default:
			throw new Error(
				`Unknown execution status '${status}'. Expected one of: ${KNOWN_BADGE_STATUSES.join(', ')}. ` +
					'Add a badge variant for it in getStatusBadgeVariant (flowDaemonFormat.ts).'
			);
	}
}

/** UTC date-time `YYYY-MM-DD HH:MM:SS`, or the raw value when it is not a valid date (never hides data). */
export function formatTimestamp(value: string | null | undefined): string {
	if (value === null || value === undefined || value === '') {
		return '-';
	}
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return formatDateFull(date);
}

export function formatCostUsd(cost: number | undefined): string {
	if (cost === undefined) {
		return '-';
	}
	return `$${cost.toFixed(4)}`;
}

/** UTC day `YYYY-MM-DD` (the log files are partitioned by UTC day). */
export function toUtcDay(now: Date): string {
	return now.toISOString().slice(0, 10);
}

/** Number of zero-based pages for `total` items; at least 1 so the pager never shows "of 0". */
export function countPages(total: number, limit: number): number {
	if (limit <= 0) {
		throw new Error(`Page size must be positive, got ${limit}.`);
	}
	return Math.max(1, Math.ceil(total / limit));
}

/** Pseudo step holding the daemon log lines about the run itself. */
export const EXECUTION_LOG_STEP_ID = '__execution';

export const FLOW_LOG_LEVELS = ['debug', 'info', 'warning', 'error'] as const;

/** Label of a step in the log step filter. */
export function formatLogStepLabel(stepId: string): string {
	return stepId === EXECUTION_LOG_STEP_ID ? `Run events (${EXECUTION_LOG_STEP_ID})` : stepId;
}

/** One daemon log line as text; the raw timestamp is kept (never hides data). */
export function formatLogEntryLine(entry: FlowExecutionLogsResponse['entries'][number]): string {
	return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.stepId}: ${entry.message}`;
}

/**
 * Explicit explanations for a log list that is empty or possibly incomplete.
 * When no log file covers the run, the "filters" notice would be misleading, so it is not added.
 */
export function getExecutionLogNotices(logs: FlowExecutionLogsResponse, hasActiveFilter: boolean): string[] {
	const notices: string[] = [];
	if (logs.daysRead.length === 0) {
		notices.push(
			`No daemon log file covers this run: the daemon writes one file per day under ${logs.logsDir} and rotates old ones away, or it never logged this run.`
		);
	} else if (logs.total === 0 && hasActiveFilter) {
		notices.push('No log line matches the filters: clear the step, level or text to see the run again.');
	}
	if (logs.unreadableLines > 0) {
		notices.push(
			`${logs.unreadableLines} line(s) could not be read (damaged log file): this list may be incomplete.`
		);
	}
	return notices;
}

export function formatStepCounts(failedStepCount: number, stepCount: number): string {
	return `${failedStepCount}/${stepCount}`;
}

const SHORT_ID_LENGTH = 8;

/** First characters of a long id (e.g. a UUID) followed by "..."; short ids are returned unchanged. */
export function shortenId(id: string): string {
	return id.length > SHORT_ID_LENGTH ? `${id.slice(0, SHORT_ID_LENGTH)}...` : id;
}

/** Worker or source that ran a step, e.g. `source-a / worker-1`. */
export function formatStepRunner(sourceId: string | undefined, workerId: string | undefined): string {
	const parts = [sourceId, workerId].filter((part): part is string => part !== undefined && part !== '');
	return parts.length === 0 ? '-' : parts.join(' / ');
}
