import type { StepStatus } from '../execution/ExecutionState.js';

/** What the execution record says of one step, for placing its log lines in time and in the sub-step tree. */
export interface LogRecordStep {
	stepId: string;
	status: StepStatus;
	startedAt?: string;
	completedAt?: string;
	/** Times the step was started; absent on records written before the field existed. */
	attempts?: number;
	/** Injected sub-steps only: the step it belongs to. */
	parent?: string;
}
