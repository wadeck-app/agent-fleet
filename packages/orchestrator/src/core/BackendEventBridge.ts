/**
 * BackendEventBridge - Simple event emitter pattern for orchestrator-to-backend communication
 *
 * This class allows the orchestrator to notify the backend when events occur
 * (worker connects, task starts, etc.) without tight coupling between layers.
 *
 * The backend (via OrchestratorWrapper) registers a handler to receive events,
 * and the orchestrator calls sendToBackend() when events occur.
 */
import { createLogger } from 'shared-common/logger';
import type { Task } from 'shared-orch-worker/domain-types';

const log = createLogger('BackendEventBridge');

/**
 * Event types that can be sent to the backend
 */
export type BackendEventType =
	| 'worker_connected'
	| 'worker_disconnected'
	| 'task_assigned'
	| 'task_started'
	| 'task_trace_update'
	| 'intervention_requested'
	| 'task_completed';

/**
 * Event data for worker_connected
 */
export interface WorkerConnectedEvent {
	workerId: string;
	connectedAt: string;
	capabilities?: Record<string, unknown>;
}

/**
 * Event data for worker_disconnected
 */
export interface WorkerDisconnectedEvent {
	workerId: string;
}

/**
 * Event data for task_assigned
 */
export interface TaskAssignedEvent {
	taskId: string;
	workerId: string;
}

/**
 * Event data for task_started
 */
export interface TaskStartedEvent {
	taskId: string;
}

/**
 * Event data for task_trace_update
 */
export interface TaskTraceUpdateEvent {
	taskId: string;
	traceChunk: unknown;
}

/**
 * Event data for intervention_requested
 */
export interface InterventionRequestedEvent {
	taskId: string;
	interventionData: unknown;
}

/**
 * Event data for task_completed
 */
export interface TaskCompletedEvent {
	taskId: string;
	flowResult: Task['flowResult'];
}

/**
 * Union type for all event data
 */
export type BackendEventData =
	| { event: 'worker_connected'; data: WorkerConnectedEvent }
	| { event: 'worker_disconnected'; data: WorkerDisconnectedEvent }
	| { event: 'task_assigned'; data: TaskAssignedEvent }
	| { event: 'task_started'; data: TaskStartedEvent }
	| { event: 'task_trace_update'; data: TaskTraceUpdateEvent }
	| { event: 'intervention_requested'; data: InterventionRequestedEvent }
	| { event: 'task_completed'; data: TaskCompletedEvent };

/**
 * Handler function type for receiving events
 */
export type BackendEventHandler = (event: string, data: unknown) => Promise<void>;

/**
 * BackendEventBridge - Simple event emitter for orchestrator-to-backend events
 *
 * Usage:
 * 1. Orchestrator creates BackendEventBridge instance
 * 2. Backend (via OrchestratorWrapper) calls registerHandler() to listen
 * 3. Orchestrator calls sendToBackend() when events occur
 */
export class BackendEventBridge {
	private handlers: BackendEventHandler[] = [];

	/**
	 * Register a handler to receive events
	 *
	 * @param handler - Function that will be called for each event
	 */
	registerHandler(handler: BackendEventHandler): void {
		this.handlers.push(handler);
	}

	/**
	 * Remove a previously registered handler
	 *
	 * @param handler - Handler function to remove
	 */
	unregisterHandler(handler: BackendEventHandler): void {
		const index = this.handlers.indexOf(handler);
		if (index !== -1) {
			this.handlers.splice(index, 1);
		}
	}

	/**
	 * Send event to all registered handlers
	 *
	 * Calls all handlers and logs errors but doesn't fail.
	 * This ensures that orchestrator operations continue even if backend handlers fail.
	 *
	 * @param event - Event type name
	 * @param data - Event data payload
	 */
	async sendToBackend(event: string, data: unknown): Promise<void> {
		// Call all handlers, log errors but don't fail
		for (const handler of this.handlers) {
			try {
				await handler(event, data);
			} catch (error) {
				log.error(`Handler failed for event ${event}:`, error);
			}
		}
	}

	/**
	 * Get the number of registered handlers
	 *
	 * @returns Number of handlers
	 */
	getHandlerCount(): number {
		return this.handlers.length;
	}
}
