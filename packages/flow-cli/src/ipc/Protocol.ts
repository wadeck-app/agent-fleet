import type { FlowStep, LiveLogEntry } from 'flow-engine/src/types.js';

// Narrowed step type for CLI — excludes UserInterventionStep (not assignable in v1)
export type AssignableStep = Extract<FlowStep, { type: 'model' | 'script' | 'subflow' }>;

// CLI-specific execution context (NOT FlowExecutionContext from flow-engine)
export interface ExecutionContext {
	executionId: string;
	inputs: Record<string, string>;
	stepOutputs: Record<string, Record<string, unknown>>;
	workspaceDir: string;
}

// ── Channel 1: CLI ↔ Daemon (singleton-daemon-kit HTTP) ─────────────────────

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

// ── Channel 2: Daemon ↔ Worker (WebSocket) ──────────────────────────────────

export type DaemonToWorker =
	| { type: 'assign'; stepId: string; stepConfig: AssignableStep; executionContext: ExecutionContext }
	| { type: 'idle' } // v2: not yet sent by daemon — Worker handles as no-op
	| { type: 'done' };

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

// ── Execution state file (executions/<id>.json) ──────────────────────────────

// 're-queued' is reserved for v2 crash recovery (D12). It is unreachable in v1
// but kept in the type so future state files remain backward-compatible.
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 're-queued';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepState {
	status: StepStatus;
	startedAt?: string;
	completedAt?: string;
	iterations?: number;
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
