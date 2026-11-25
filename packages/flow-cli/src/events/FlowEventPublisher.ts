/** The only event names flow publishes; consumers match them exactly (`queue wait <name>`). */
export const FLOW_EVENT_NAMES = [
	'flow.execution.started',
	'flow.execution.completed',
	'flow.execution.failed',
	'flow.execution.paused',
	'flow.execution.resumed',
	'flow.step.started',
	'flow.step.completed',
	'flow.step.failed',
	'flow.step.deferred',
] as const;

export type FlowEventName = (typeof FLOW_EVENT_NAMES)[number];

/**
 * What an event carries. Small on purpose: the queue persists payloads to its history files and
 * shows them in a dashboard, so there is never an input, an env value, a token or a step output.
 */
export interface FlowEventPayload {
	executionId: string;
	flowId: string;
	/** Step events only. */
	stepId?: string;
	status: 'running' | 'completed' | 'failed' | 'paused' | 'deferred';
	/** Step events only: 1 for the first run of the step, +1 per retry or relaunch. */
	attempt?: number;
	startedAt?: string;
	completedAt?: string;
	durationMs?: number;
	projectRoot?: string;
	/** Registry id of the project (project-sdk); additive next to projectRoot. */
	projectId?: string;
	/** First line of the (already masked) error, truncated. Failed events only. */
	error?: string;
	/** Step events that ended, all additive: cost of THIS attempt alone (a delta for a resumed claude session); absent when unknown. */
	costUsd?: number;
	/** Cost of the step over all its attempts so far; a lower bound when `stepTotalCostComplete` is false. */
	stepTotalCostUsd?: number;
	/** False when the cost of some attempt of the step is unknown. */
	stepTotalCostComplete?: boolean;
	/** True when the step cost includes an estimate priced locally from the token usage (codex reports none). */
	stepTotalCostEstimated?: boolean;
	/** Execution events that ended: cost of the whole run (sum of the step totals); a lower bound when `totalCostComplete` is false; absent when unknown. */
	totalCostUsd?: number;
	/** False when the cost of some attempt of the run is unknown. Absent when no step has a model cost. */
	totalCostComplete?: boolean;
	/** True when `totalCostUsd` includes an estimate priced locally from the token usage. Absent when no step has a model cost. */
	totalCostEstimated?: boolean;
	turns?: number;
	toolCalls?: number;
	endReason?: string;
	/** Pause and resume events: when the run was paused (ISO). */
	pausedAt?: string;
	/** Resume events only: when the run was resumed (ISO). */
	resumedAt?: string;
	/** Pause events: first line of the pause reason, truncated; absent when none was given. Deferred events: the worker's reason code. */
	reason?: string;
	/** Deferred events only: human text of the worker (first line, masked, truncated). */
	message?: string;
	/** Deferred events only: `ack` (the worker did not acknowledge in time), `answer` (acknowledged, no verdict in time) or `worker` (it said not ready). */
	phase?: 'ack' | 'answer' | 'worker';
	/** Deferred events only: seconds until the daemon asks the worker again. */
	retryAfterSeconds?: number;
	/** Deferred events only: declared source of the worker that was asked, when known. */
	workerSource?: string;
}

export type FlowEventsStatus =
	| { state: 'enabled'; via: 'daemon' | 'queue-start' | undefined }
	| { state: 'unavailable'; reason: string }
	| { state: 'disabled'; reason: string };

/** Outcome of declaring the events to the queue (mirrors the SDK's `RegisterResult.status`, plus `not-declared`). */
export type FlowEventsDeclaration =
	| { state: 'registered'; count: number }
	| { state: 'rejected'; reason: string; problems: { path: string; message: string }[] }
	| { state: 'unsupported' | 'dropped' | 'unknown'; reason: string }
	| { state: 'not-declared'; reason: string };

/**
 * Where the daemon announces its lifecycle events. A small seam over the queue SDK, so the
 * daemon and its tests never depend on a running queue.
 */
export interface FlowEventPublisher {
	/** Fire and forget. Must never throw into the run path. */
	publish(event: FlowEventName, payload: FlowEventPayload): void;
	/** Resolves when the pushes in flight have settled. Called once, at daemon shutdown. */
	flush(): Promise<void>;
	/** How events would be delivered; sends nothing. */
	status(): Promise<FlowEventsStatus>;
	/**
	 * Declares the events to the queue so it documents them (`queue events list`). Called once, at
	 * daemon start; idempotent and replaces the previous declaration. Never rejects.
	 */
	declareEvents(): Promise<FlowEventsDeclaration>;
}
