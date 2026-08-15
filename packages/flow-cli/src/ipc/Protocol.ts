import type { FlowStep, LiveLogEntry } from 'flow-engine/types';

// subflow excluded: not supported in v1 (rejected in CommandHandler before enqueue)
export type AssignableStep = Extract<FlowStep, { type: 'model' | 'script' }>;

export interface ExecutionContext {
	executionId: string;
	inputs: Record<string, string>;
	stepOutputs: Record<string, Record<string, unknown>>;
	workspaceDir: string;
}

export type ClientCommand = {
	type: 'run';
	flowFile: string;
	flowId?: string;
	inputs?: Record<string, string>;
	quiet?: boolean;
	cwd: string;
};

export type DaemonResponse =
	| { type: 'execution_started'; executionId: string }
	| { type: 'error'; message: string; code: string };

export type DaemonToWorker =
	| { type: 'assign'; stepId: string; stepConfig: AssignableStep; executionContext: ExecutionContext }
	// { type: 'idle' } is never sent by the daemon in v1 but is kept for forward compatibility.
	// Worker handles it as a no-op.
	| { type: 'idle' }
	| { type: 'done' };

/**
 * Unvalidated wire format for steps arriving from worker processes via provideSteps.
 * Open-ended ([key: string]: unknown) to accept arbitrary step fields before schema validation.
 * Contrast with AssignableStep, which is the daemon-side typed form after casting.
 */
export interface InjectedStep {
	id: string;
	type: 'model' | 'script' | 'subflow';
	parent?: string;
	depends?: string[];
	[key: string]: unknown;
}

export type WorkerToDaemon =
	| { type: 'ready'; pid: number }
	| { type: 'log'; executionId: string; stepId: string; entry: LiveLogEntry }
	| { type: 'step_completed'; executionId: string; stepId: string; output: Record<string, unknown> }
	| { type: 'step_failed'; executionId: string; stepId: string; error: string }
	| { type: 'inject_steps'; executionId: string; steps: InjectedStep[] };

// 're-queued' is reserved for v2 crash recovery. Unreachable in v1 but kept for backward compat.
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 're-queued';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepState {
	status: StepStatus;
	startedAt?: string;
	completedAt?: string;
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
}
