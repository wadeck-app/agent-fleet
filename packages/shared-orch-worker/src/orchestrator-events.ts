/**
 * ===========================================================================================
 * ORCHESTRATOR-TO-BACKEND (O→B) EVENT TYPES
 * ===========================================================================================
 *
 * Type-safe event protocol for Orchestrator → Backend communication.
 * All event types are prefixed with O2B_ for clarity and discoverability.
 *
 * Events supported:
 * - worker.status: Worker status changed (idle, busy, stopped, error)
 * - worker.log: Worker emitted a log message
 * - worker.connected: New worker connected
 * - worker.disconnected: Worker disconnected
 * - task.created: New task created
 * - task.updated: Task updated
 * - task.completed: Task completed successfully
 * - task.failed: Task failed with error
 * - task.status_changed: Task status changed
 *
 * ===========================================================================================
 */
import { z } from 'zod';

// ===========================================================================================
// WORKER EVENTS
// ===========================================================================================

/**
 * O2B_WorkerStatus: Worker status changed
 */
export const O2B_WorkerStatusEventSchema = z.object({
	type: z.literal('worker.status'),
	data: z.object({
		workerId: z.string(),
		status: z.enum(['idle', 'busy', 'stopped', 'error']),
		taskId: z.string().nullable().optional(),
		timestamp: z.string(),
	}),
});

export type O2B_WorkerStatusEvent = z.infer<typeof O2B_WorkerStatusEventSchema>;

/**
 * O2B_WorkerLog: Worker emitted a log message
 */
export const O2B_WorkerLogEventSchema = z.object({
	type: z.literal('worker.log'),
	data: z.object({
		workerId: z.string(),
		level: z.enum(['info', 'warn', 'error', 'debug']),
		message: z.string(),
		timestamp: z.string(),
	}),
});

export type O2B_WorkerLogEvent = z.infer<typeof O2B_WorkerLogEventSchema>;

/**
 * O2B_WorkerConnected: New worker connected
 */
export const O2B_WorkerConnectedEventSchema = z.object({
	type: z.literal('worker.connected'),
	data: z.object({
		workerId: z.string(),
		// workerType: z.string(),
		connectedAt: z.string(),
		timestamp: z.string(),
	}),
});

export type O2B_WorkerConnectedEvent = z.infer<typeof O2B_WorkerConnectedEventSchema>;

/**
 * O2B_WorkerDisconnected: Worker disconnected
 */
export const O2B_WorkerDisconnectedEventSchema = z.object({
	type: z.literal('worker.disconnected'),
	data: z.object({
		workerId: z.string(),
		reason: z.string().optional(),
		timestamp: z.string(),
	}),
});

export type O2B_WorkerDisconnectedEvent = z.infer<typeof O2B_WorkerDisconnectedEventSchema>;

// ===========================================================================================
// TASK EVENTS
// ===========================================================================================

/**
 * O2B_TaskCreated: New task created
 */
export const O2B_TaskCreatedEventSchema = z.object({
	type: z.literal('task.created'),
	data: z.object({
		taskId: z.string(),
		task: z.any(), // Full Task object
		timestamp: z.string(),
	}),
});

export type O2B_TaskCreatedEvent = z.infer<typeof O2B_TaskCreatedEventSchema>;

/**
 * O2B_TaskUpdated: Task updated
 */
export const O2B_TaskUpdatedEventSchema = z.object({
	type: z.literal('task.updated'),
	data: z.object({
		taskId: z.string(),
		task: z.any(), // Full Task object
		timestamp: z.string(),
	}),
});

export type O2B_TaskUpdatedEvent = z.infer<typeof O2B_TaskUpdatedEventSchema>;

/**
 * O2B_TaskCompleted: Task completed successfully
 */
export const O2B_TaskCompletedEventSchema = z.object({
	type: z.literal('task.completed'),
	data: z.object({
		taskId: z.string(),
		workerId: z.string().optional(),
		result: z.unknown().optional(),
		duration: z.number().optional(),
		timestamp: z.string(),
	}),
});

export type O2B_TaskCompletedEvent = z.infer<typeof O2B_TaskCompletedEventSchema>;

/**
 * O2B_TaskFailed: Task failed with error
 */
export const O2B_TaskFailedEventSchema = z.object({
	type: z.literal('task.failed'),
	data: z.object({
		taskId: z.string(),
		workerId: z.string().optional(),
		error: z.string(),
		timestamp: z.string(),
	}),
});

export type O2B_TaskFailedEvent = z.infer<typeof O2B_TaskFailedEventSchema>;

/**
 * O2B_TaskStatusChanged: Task status changed
 */
export const O2B_TaskStatusChangedEventSchema = z.object({
	type: z.literal('task.status_changed'),
	data: z.object({
		taskId: z.string(),
		previousStatus: z.string(),
		newStatus: z.string(),
		timestamp: z.string(),
	}),
});

export type O2B_TaskStatusChangedEvent = z.infer<typeof O2B_TaskStatusChangedEventSchema>;

// ===========================================================================================
// UNION TYPE FOR ALL O→B EVENTS
// ===========================================================================================

/**
 * Union type for all O→B events
 */
export type O2BEvent =
	| O2B_WorkerStatusEvent
	| O2B_WorkerLogEvent
	| O2B_WorkerConnectedEvent
	| O2B_WorkerDisconnectedEvent
	| O2B_TaskCreatedEvent
	| O2B_TaskUpdatedEvent
	| O2B_TaskCompletedEvent
	| O2B_TaskFailedEvent
	| O2B_TaskStatusChangedEvent;

/**
 * Extract event type string from O2BEvent
 */
export type O2BEventType = O2BEvent['type'];

/**
 * Extract event data type for a given event type
 * This enables type-safe event handling:
 *
 * @example
 * ```typescript
 * client.on<'task.completed'>('task.completed', (data: O2BEventData<'task.completed'>) => {
 *   // data is typed as { taskId: string, workerId?: string, ... }
 * });
 * ```
 */
export type O2BEventData<T extends O2BEventType> = Extract<O2BEvent, { type: T }>['data'];

// ===========================================================================================
// VALIDATION HELPERS
// ===========================================================================================

/**
 * Map of all event schemas for validation
 */
export const O2B_EVENT_SCHEMAS = {
	'worker.status': O2B_WorkerStatusEventSchema,
	'worker.log': O2B_WorkerLogEventSchema,
	'worker.connected': O2B_WorkerConnectedEventSchema,
	'worker.disconnected': O2B_WorkerDisconnectedEventSchema,
	'task.created': O2B_TaskCreatedEventSchema,
	'task.updated': O2B_TaskUpdatedEventSchema,
	'task.completed': O2B_TaskCompletedEventSchema,
	'task.failed': O2B_TaskFailedEventSchema,
	'task.status_changed': O2B_TaskStatusChangedEventSchema,
} as const;

/**
 * Validate an O2B event against its schema
 */
export function validateO2BEvent(event: unknown): O2BEvent {
	const eventObj = event as { type: string };
	const schema = O2B_EVENT_SCHEMAS[eventObj.type as keyof typeof O2B_EVENT_SCHEMAS];
	if (!schema) {
		throw new Error(`Unknown O2B event type: ${eventObj.type}`);
	}
	return schema.parse(event) as O2BEvent;
}
