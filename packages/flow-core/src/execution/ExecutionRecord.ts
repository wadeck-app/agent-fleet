import type { StepMeta } from 'flow-engine/types';

// Single source of truth for the persisted execution shape: ExecutionStore (writer, flow-cli)
// and every reader (history, show, app-module) use these types.

// 're-queued' is reserved for v2 crash recovery. Unreachable in v1 but kept for backward compat.
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 're-queued';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepState {
	status: StepStatus;
	startedAt?: string;
	completedAt?: string;
	/** True when this step was injected dynamically via provideSteps during execution. */
	injected?: boolean;
	/** Error message if the step failed. */
	error?: string;
	/** Full stdout captured during the step's execution, when the step failed. */
	stdout?: string;
	/** Full stderr captured during the step's execution, when the step failed. */
	stderr?: string;
	/** Execution metadata reported by the worker on step_completed (cost/tokens/duration). */
	meta?: StepMeta;
	/** Number of times the step was started (retries, onFailure loops, resumes); absent on records written before this existed. */
	attempts?: number;
	/** Wall-clock time spent in attempts before the current one, so retries stay visible in `flow show`. */
	priorAttemptsMs?: number;
	/** One entry per relaunch of this step caused by a failed sub-step, with the feedback it was resumed with (truncated). */
	relaunches?: { at: string; feedback: string }[];
	/**
	 * Which source supplied the worker that ran this step, and which worker it was
	 * (T-06). Without this, a step's outcome cannot be attributed to the machine that
	 * produced it. Absent for steps that never started.
	 */
	sourceId?: string;
	workerId?: string;
}

export interface ExecutionState {
	executionId: string;
	flowFile: string;
	flowId: string;
	status: ExecutionStatus;
	currentSteps: string[];
	startedAt: string;
	completedAt: string | null;
	steps: Record<string, StepState>;
	/** Error message from the last failed step, surfaced to the CLI on flow failure. */
	lastError?: string;
	/**
	 * Project this run belongs to, so the projects with active runs can be listed (D#10).
	 *
	 * The daemon is a per-user machine-wide singleton serving every project at once, so
	 * without recording it per execution there is no way to answer "what is running, and
	 * where" -- the daemon's own cwd says nothing.
	 */
	projectRoot?: string;
}

/** An execution as read back from disk. Same shape as what the daemon writes. */
export type ExecutionRecord = ExecutionState;
export type StepStateRecord = StepState;
