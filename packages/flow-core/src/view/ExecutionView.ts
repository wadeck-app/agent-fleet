import { versionColumnOf, versionNoteOf } from '../definitions/RecordedVersion.js';
import type { ExecutionState, StepState } from '../execution/ExecutionState.js';
import { type CostTotal, formatStepCost, sumStepCosts, summarizeStepCost } from '../execution/StepCost.js';
import { formatDuration } from '../history/ExecutionFormat.js';
import { type ProjectLookup, projectLabelOf } from '../project/ProjectLabel.js';
import type { ResolvedExecution } from '../show/ExecutionDetail.js';
import { type StepAttemptView, toStepAttemptViews } from './StepAttemptViews.js';

export type { StepAttemptView } from './StepAttemptViews.js';

/** What a row of the executions table needs. Steps are counted, not sent: the list can hold hundreds of runs. */
export interface ExecutionSummary {
	executionId: string;
	flowId: string;
	flowFile: string;
	status: string;
	startedAt: string;
	completedAt: string | null;
	/** `running` for an unfinished run, same wording as `flow history`. */
	duration: string;
	lastError?: string;
	/** True when `lastError` belongs to a retry that later succeeded: the run completed. */
	lastErrorRecovered: boolean;
	projectRoot?: string;
	/** Registry id of the project; absent on records written before project ids existed. */
	projectId?: string;
	/** `name (id)` (see projectLabelOf) for display; absent when the record has no project. */
	projectLabel?: string;
	/** Version of the definition that ran; absent on records written before flow versions existed. */
	flowVersion?: string;
	/** `flowVersion`, or `-` when it was not recorded: the text of a table cell. */
	versionLabel: string;
	stepCount: number;
	failedStepCount: number;
}

export interface StepView {
	stepId: string;
	status: string;
	injected: boolean;
	startedAt?: string;
	completedAt?: string;
	duration: string;
	attempts?: number;
	error?: string;
	model?: string;
	/**
	 * Cost of the whole step over all its attempts (a lower bound when `costComplete` is false). BREAKING MEANING:
	 * before attempts were recorded it was the cost of the last attempt only; that value is `lastAttemptCostUsd`.
	 */
	costUsd?: number;
	/** Cost of the last attempt alone; absent when unknown. */
	lastAttemptCostUsd?: number;
	/** False when some attempt cost is unknown: `costUsd` is then a lower bound or absent. Absent for a step without model cost. */
	costComplete?: boolean;
	/** Ready-to-print cost: `$0.0075`, `$2.7900+ (2 attempts unknown)`, `unknown`. Never `$0` for an unknown cost. */
	costLabel?: string;
	/** Settled attempts, oldest first; absent on records written before attempts were logged. */
	attemptHistory?: StepAttemptView[];
	sourceId?: string;
	workerId?: string;
	relaunches: { at: string; feedback: string }[];
}

export interface ExecutionDetailView extends ExecutionSummary {
	filePath: string;
	currentSteps: string[];
	steps: StepView[];
	/** Sum of the step totals; a lower bound when `totalCostComplete` is false. */
	totalCostUsd?: number;
	/** False when some attempt cost of the run is unknown. Absent when no step has a model cost. */
	totalCostComplete?: boolean;
	/** Ready-to-print total, same wording as {@link StepView.costLabel}. */
	totalCostLabel?: string;
	/** How the version was chosen and which definition ran (or that it was not recorded). */
	versionNote: string;
	/** The text `flow show` prints for this execution (failed steps carry the tail of their output). */
	text: string;
}

export function toExecutionSummary(record: ExecutionState, projectLookup?: ProjectLookup): ExecutionSummary {
	const projectLabel = projectLabelOf(record, projectLookup);
	const steps = Object.values(record.steps);
	return {
		executionId: record.executionId,
		flowId: record.flowId,
		flowFile: record.flowFile,
		status: record.status,
		startedAt: record.startedAt,
		completedAt: record.completedAt,
		duration: formatDuration(record.startedAt, record.completedAt),
		...(record.lastError !== undefined ? { lastError: record.lastError } : {}),
		lastErrorRecovered: record.lastError !== undefined && record.status === 'completed',
		...(record.projectRoot !== undefined ? { projectRoot: record.projectRoot } : {}),
		...(record.projectId !== undefined ? { projectId: record.projectId } : {}),
		...(projectLabel !== undefined ? { projectLabel } : {}),
		...(record.flowVersion !== undefined ? { flowVersion: record.flowVersion } : {}),
		versionLabel: versionColumnOf(record),
		stepCount: steps.length,
		failedStepCount: steps.filter(step => step.status === 'failed').length,
	};
}

function toStepView(stepId: string, step: StepState): StepView {
	const meta = step.meta as { model?: string } | undefined;
	const cost = summarizeStepCost(step);
	const label = formatStepCost(cost);
	const attemptHistory = toStepAttemptViews(step, cost);
	return {
		stepId,
		status: step.status,
		injected: step.injected === true,
		...(step.startedAt !== undefined ? { startedAt: step.startedAt } : {}),
		...(step.completedAt !== undefined ? { completedAt: step.completedAt } : {}),
		duration: step.startedAt ? formatDuration(step.startedAt, step.completedAt ?? null) : '-',
		...(step.attempts !== undefined ? { attempts: step.attempts } : {}),
		...(step.error !== undefined ? { error: step.error } : {}),
		...(meta?.model !== undefined ? { model: meta.model } : {}),
		...(cost.totalUsd !== undefined ? { costUsd: cost.totalUsd } : {}),
		...(cost.lastAttemptUsd !== undefined ? { lastAttemptCostUsd: cost.lastAttemptUsd } : {}),
		...(label !== undefined ? { costComplete: cost.complete, costLabel: label } : {}),
		...(attemptHistory !== undefined ? { attemptHistory } : {}),
		...(step.sourceId !== undefined ? { sourceId: step.sourceId } : {}),
		...(step.workerId !== undefined ? { workerId: step.workerId } : {}),
		relaunches: (step.relaunches ?? []).map(({ at, feedback }) => ({ at, feedback })),
	};
}

/** Whitelist projection: step `meta` (session ids, session file paths) never leaves the machine through the API. */
export function toExecutionDetail(
	{ record, filePath }: ResolvedExecution,
	text: string,
	projectLookup?: ProjectLookup
): ExecutionDetailView {
	const steps = Object.entries(record.steps).map(([stepId, step]) => toStepView(stepId, step));
	const total: CostTotal = sumStepCosts(Object.values(record.steps).map(step => summarizeStepCost(step)));
	const totalLabel = formatStepCost(total);
	return {
		...toExecutionSummary(record, projectLookup),
		filePath,
		currentSteps: record.currentSteps,
		steps,
		...(total.totalUsd !== undefined ? { totalCostUsd: total.totalUsd } : {}),
		...(totalLabel !== undefined ? { totalCostComplete: total.complete, totalCostLabel: totalLabel } : {}),
		versionNote: versionNoteOf(record),
		text,
	};
}
