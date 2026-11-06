/**
 * Wire facts the harness depends on, copied from `flow-cli/src/ipc/Protocol.ts` (flow-sandbox must not depend on
 * flow-cli). If the daemon protocol changes, the live harness check is what notices.
 */

export type JsonObject = Record<string, unknown>;

/** `WORKER_FEATURE_*` of flow-cli `Protocol.ts`: what the inner worker bundle implements. */
export const WORKER_FEATURES = ['sub-step-session-resume', 'secrets', 'project-id'] as const;

/** `MAX_WORKER_FRAME_BYTES` of flow-cli `WorkerFrameLimit.ts`: the daemon closes the socket on a bigger frame. */
export const MAX_FRAME_BYTES = 1024 * 1024;

/** Messages the inner worker may send, besides `ready` (see InsideMessageGuard for the rules of each). */
export const ASSIGNMENT_SCOPED_TYPES = [
	'log',
	'step_started',
	'step_progress',
	'step_completed',
	'step_failed',
	'inject_steps',
] as const;

export type AssignmentScopedType = (typeof ASSIGNMENT_SCOPED_TYPES)[number];

/** The step types a sandbox can run: a `user_intervention` step needs a person, the VM has none. */
export type SandboxStepType = 'model' | 'script';

/** The assignment the bridge is currently relaying; set when `assign` is forwarded inside. */
export interface ActiveAssignment {
	assignmentId: string;
	executionId: string;
	stepId: string;
	stepType: SandboxStepType;
}

export function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value !== '';
}
