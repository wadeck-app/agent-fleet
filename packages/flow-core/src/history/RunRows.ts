import type { ExecutionState } from '../execution/ExecutionState.js';
import { ellipsize, excerptOf, requireTimestamp, statusTag } from '../view/CellText.js';
import { formatDuration } from './ExecutionFormat.js';
import type { FlowSummary } from './FlowSummaries.js';

/** Longest error line sent: the table truncates it visually, this only bounds what travels. */
export const MAX_FAILURE_LINE_LENGTH = 160;
const NO_ERROR_TEXT = 'No error message recorded';
/**
 * Longest flow name in a row of a narrow table. A dsl-ui DataTable cell never shrinks below its text (a column `width` or
 * `truncate` only applies above 320px), so the name is cut here to keep three columns inside a 240px card.
 */
export const FLOW_LABEL_LENGTH = 12;
/** Longest `summary` of a failure: one column of a narrow table holds about 30 characters. */
export const FAILURE_SUMMARY_LENGTH = 30;

export interface LatestRunRow {
	executionId: string;
	flowId: string;
	/** The flow name cut to {@link FLOW_LABEL_LENGTH} characters. */
	flowLabel: string;
	statusLabel: string;
	startedAt: string;
}

export interface FailureRow {
	executionId: string;
	flowId: string;
	/** First non-empty line of the error. */
	error: string;
	/** "flow: first error line" cut to {@link FAILURE_SUMMARY_LENGTH} characters, for one narrow column. */
	summary: string;
	startedAt: string;
}

export interface ActiveRunRow {
	executionId: string;
	flowId: string;
	flowLabel: string;
	statusLabel: string;
	/** Time since the run started, as text ("3m20s"): a duration, not a timestamp. */
	elapsed: string;
}

export interface FlowRow {
	flowId: string;
	flowLabel: string;
	runs: number;
	failed: number;
}

function flowLabelOf(flowId: string): string {
	return ellipsize(flowId, FLOW_LABEL_LENGTH);
}

/** The `limit` newest runs (`runs` are newest first) as table rows: short status word, ISO start time. */
export function latestRuns(runs: readonly ExecutionState[], limit: number): LatestRunRow[] {
	return runs.slice(0, limit).map(run => ({
		executionId: run.executionId,
		flowId: run.flowId,
		flowLabel: flowLabelOf(run.flowId),
		statusLabel: statusTag(run.status),
		startedAt: requireTimestamp(run.startedAt),
	}));
}

/** What went wrong in a failed run: the run's own error, else the error of its first failed step. */
function errorOf(run: ExecutionState): string | undefined {
	return run.lastError ?? Object.values(run.steps).find(step => step.status === 'failed' && step.error)?.error;
}

function firstLine(text: string | undefined): string {
	const line = text?.split('\n').find(candidate => candidate.trim() !== '');
	return line === undefined ? NO_ERROR_TEXT : excerptOf(line, MAX_FAILURE_LINE_LENGTH);
}

/** The `limit` newest failed runs, each with the first line of its error. */
export function recentFailures(runs: readonly ExecutionState[], limit: number): FailureRow[] {
	return runs
		.filter(run => run.status === 'failed')
		.slice(0, limit)
		.map(run => {
			const error = firstLine(errorOf(run));
			return {
				executionId: run.executionId,
				flowId: run.flowId,
				error,
				summary: ellipsize(`${run.flowId}: ${error}`, FAILURE_SUMMARY_LENGTH),
				startedAt: requireTimestamp(run.startedAt),
			};
		});
}

/** Runs not finished (running, waiting or retrying), newest first, with the time elapsed since they started. */
export function activeRuns(runs: readonly ExecutionState[], now: number, limit: number): ActiveRunRow[] {
	const nowIso = new Date(now).toISOString();
	return runs
		.filter(run => run.status !== 'completed' && run.status !== 'failed')
		.slice(0, limit)
		.map(run => ({
			executionId: run.executionId,
			flowId: run.flowId,
			flowLabel: flowLabelOf(run.flowId),
			statusLabel: statusTag(run.status),
			elapsed: formatDuration(requireTimestamp(run.startedAt), nowIso),
		}));
}

/** The `limit` flows that ran most recently (`flows` come sorted that way from summarizeFlows), with their counts. */
export function flowRows(flows: readonly FlowSummary[], limit: number): FlowRow[] {
	return flows.slice(0, limit).map(flow => ({
		flowId: flow.flowId,
		flowLabel: flowLabelOf(flow.flowId),
		runs: flow.executionCount,
		failed: flow.failedCount,
	}));
}
