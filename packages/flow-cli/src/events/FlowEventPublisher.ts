/** The only event names flow publishes; consumers match them exactly (`queue wait <name>`). */
export const FLOW_EVENT_NAMES = [
	'flow.execution.started',
	'flow.execution.completed',
	'flow.execution.failed',
	'flow.step.started',
	'flow.step.completed',
	'flow.step.failed',
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
	status: 'running' | 'completed' | 'failed';
	/** Step events only: 1 for the first run of the step, +1 per retry or relaunch. */
	attempt?: number;
	startedAt?: string;
	completedAt?: string;
	durationMs?: number;
	projectRoot?: string;
	/** First line of the (already masked) error, truncated. Failed events only. */
	error?: string;
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
