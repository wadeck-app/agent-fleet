import { type ExecutionRecord, type ResolvedExecution, type StepStateRecord, formatDuration } from 'flow-core';

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
	costUsd?: number;
	sourceId?: string;
	workerId?: string;
	relaunches: { at: string; feedback: string }[];
}

export interface ExecutionDetailView extends ExecutionSummary {
	filePath: string;
	currentSteps: string[];
	steps: StepView[];
	totalCostUsd?: number;
	/** The text `flow show` prints for this execution (failed steps carry the tail of their output). */
	text: string;
}

export function toExecutionSummary(record: ExecutionRecord): ExecutionSummary {
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
		stepCount: steps.length,
		failedStepCount: steps.filter(step => step.status === 'failed').length,
	};
}

function toStepView(stepId: string, step: StepStateRecord): StepView {
	const meta = step.meta as { model?: string; cost?: { usd: number } } | undefined;
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
		...(meta?.cost !== undefined ? { costUsd: meta.cost.usd } : {}),
		...(step.sourceId !== undefined ? { sourceId: step.sourceId } : {}),
		...(step.workerId !== undefined ? { workerId: step.workerId } : {}),
		relaunches: (step.relaunches ?? []).map(({ at, feedback }) => ({ at, feedback })),
	};
}

/** Whitelist projection: step `meta` (session ids, session file paths) never leaves the machine through the API. */
export function toExecutionDetail({ record, filePath }: ResolvedExecution, text: string): ExecutionDetailView {
	const steps = Object.entries(record.steps).map(([stepId, step]) => toStepView(stepId, step));
	const costs = steps.flatMap(step => (step.costUsd === undefined ? [] : [step.costUsd]));
	return {
		...toExecutionSummary(record),
		filePath,
		currentSteps: record.currentSteps,
		steps,
		...(costs.length > 0 ? { totalCostUsd: costs.reduce((sum, usd) => sum + usd, 0) } : {}),
		text,
	};
}
