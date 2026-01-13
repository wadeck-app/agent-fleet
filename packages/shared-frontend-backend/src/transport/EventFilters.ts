/**
 * Event Filters - Type-safe subscription filters
 *
 * This module defines filters for B2F events, allowing clients to subscribe
 * to specific subsets of events based on criteria (e.g., taskId, workerId).
 *
 * Design Goals:
 * - Type-safe: Each event declares its supported filters
 * - Required vs Optional: Some events require filters (e.g., trace updates)
 * - Extensible: Easy to add new filters for future events
 *
 * Usage:
 * ```typescript
 * // Backend - filtering before broadcast
 * eventBroadcaster.broadcast(B2F_TASK_TRACE_UPDATED, payload, { taskId: 'task-123' });
 *
 * // Frontend - subscribe with required filters
 * transport.subscribe(B2F_TASK_TRACE_UPDATED, handler, { taskId: currentTaskId });
 * ```
 */
import type {
	B2F_DASHBOARD_UPDATED,
	B2F_INTERVENTIONS_UPDATED,
	B2F_INTERVENTION_ANSWERED,
	B2F_INTERVENTION_CANCELLED,
	B2F_INTERVENTION_CREATED,
	B2F_INTERVENTION_TIMEOUT,
	B2F_INTERVENTION_UPDATED,
	B2F_TASKS_UPDATED,
	B2F_TASK_ASSIGNED,
	B2F_TASK_CREATED,
	B2F_TASK_DELETED,
	B2F_TASK_PRIORITY_CHANGED,
	B2F_TASK_STATUS_CHANGED,
	B2F_TASK_UPDATED,
	B2F_WORKERS_UPDATED,
	B2F_WORKER_CAPACITY_CHANGED,
	B2F_WORKER_CONNECTED,
	B2F_WORKER_CREATED,
	B2F_WORKER_DELETED,
	B2F_WORKER_DISCONNECTED,
	B2F_WORKER_HEARTBEAT,
	B2F_WORKER_STATUS,
	B2F_WORKER_STATUS_CHANGED,
	B2F_WORKER_UPDATED,
	B2F_WORKSPACES_UPDATED,
	B2F_WORKSPACE_ARCHIVED,
	B2F_WORKSPACE_CREATED,
	B2F_WORKSPACE_DELETED,
	B2F_WORKSPACE_QUOTA_EXCEEDED,
	B2F_WORKSPACE_STATUS_CHANGED,
	B2F_WORKSPACE_UPDATED,
} from './B2FEventConstants';

// ===========================================================================================
// NEW EVENT: Task Trace Updated
// ===========================================================================================

/**
 * Task trace updated event (real-time log streaming)
 * Emitted every ~500ms during task execution with incremental trace updates
 * REQUIRES taskId filter to avoid spamming all clients
 */
export const B2F_TASK_TRACE_UPDATED = 'b2f:task:trace_updated' as const;

// ===========================================================================================
// EVENT FILTER DEFINITIONS
// ===========================================================================================

/**
 * Marker type for events that don't support filters
 */
export type NoFilter = void;

/**
 * Filter for task-specific events
 * Used when subscribing to events for a specific task
 */
export interface TaskFilter {
	taskId: string;
}

/**
 * Filter for worker-specific events
 * Used when subscribing to events for a specific worker
 */
export interface WorkerFilter {
	workerId: string;
}

/**
 * Filter for workspace-specific events
 * Used when subscribing to events for a specific workspace
 */
export interface WorkspaceFilter {
	workspaceId: string;
}

/**
 * Filter for intervention-specific events
 * Used when subscribing to events for a specific intervention
 */
export interface InterventionFilter {
	interventionId: string;
}

// ===========================================================================================
// EVENT FILTER MAPPING
// ===========================================================================================

/**
 * Maps each B2F event to its filter type
 *
 * - NoFilter: Event doesn't support/require filters (broadcast to all)
 * - TaskFilter: Event requires taskId filter
 * - WorkerFilter: Event requires workerId filter
 * - etc.
 *
 * Type safety ensures:
 * 1. Backend must provide filter data when broadcasting filtered events
 * 2. Frontend must provide required filters when subscribing
 * 3. TypeScript catches mismatches at compile time
 */
export type B2FEventFilters = {
	// Task Events - Aggregate (no filter needed)
	[B2F_TASKS_UPDATED]: NoFilter;
	[B2F_TASK_CREATED]: NoFilter;
	[B2F_TASK_UPDATED]: NoFilter;
	[B2F_TASK_DELETED]: NoFilter;
	[B2F_TASK_STATUS_CHANGED]: NoFilter;
	[B2F_TASK_ASSIGNED]: NoFilter;
	[B2F_TASK_PRIORITY_CHANGED]: NoFilter;

	// Task Events - Filtered (requires taskId)
	[B2F_TASK_TRACE_UPDATED]: TaskFilter; // REQUIRES taskId filter

	// Worker Events - Aggregate (no filter needed)
	[B2F_WORKERS_UPDATED]: NoFilter;
	[B2F_WORKER_CREATED]: NoFilter;
	[B2F_WORKER_UPDATED]: NoFilter;
	[B2F_WORKER_DELETED]: NoFilter;
	[B2F_WORKER_STATUS_CHANGED]: NoFilter;
	[B2F_WORKER_HEARTBEAT]: NoFilter;
	[B2F_WORKER_CAPACITY_CHANGED]: NoFilter;
	[B2F_WORKER_CONNECTED]: NoFilter;
	[B2F_WORKER_DISCONNECTED]: NoFilter;
	[B2F_WORKER_STATUS]: NoFilter;

	// Workspace Events - Aggregate (no filter needed)
	[B2F_WORKSPACES_UPDATED]: NoFilter;
	[B2F_WORKSPACE_CREATED]: NoFilter;
	[B2F_WORKSPACE_UPDATED]: NoFilter;
	[B2F_WORKSPACE_DELETED]: NoFilter;
	[B2F_WORKSPACE_STATUS_CHANGED]: NoFilter;
	[B2F_WORKSPACE_QUOTA_EXCEEDED]: NoFilter;
	[B2F_WORKSPACE_ARCHIVED]: NoFilter;

	// Dashboard Events (no filter needed)
	[B2F_DASHBOARD_UPDATED]: NoFilter;

	// Intervention Events - Aggregate (no filter needed)
	[B2F_INTERVENTIONS_UPDATED]: NoFilter;
	[B2F_INTERVENTION_CREATED]: NoFilter;
	[B2F_INTERVENTION_UPDATED]: NoFilter;
	[B2F_INTERVENTION_ANSWERED]: NoFilter;
	[B2F_INTERVENTION_TIMEOUT]: NoFilter;
	[B2F_INTERVENTION_CANCELLED]: NoFilter;
};

// ===========================================================================================
// HELPER TYPES
// ===========================================================================================

/**
 * Extract all B2F event names
 */
export type B2FEvent = keyof B2FEventFilters;

/**
 * Get filter type for a specific event
 * Returns NoFilter if event doesn't support filters
 */
export type FilterForEvent<T extends B2FEvent> = B2FEventFilters[T];

/**
 * Check if an event requires filters
 * Returns true if event filter is NOT NoFilter
 */
export type EventRequiresFilter<T extends B2FEvent> = B2FEventFilters[T] extends NoFilter ? false : true;

/**
 * Get all events that require a specific filter type
 * Example: EventsWithFilter<TaskFilter> returns all events that filter by taskId
 */
export type EventsWithFilter<F> = {
	[K in B2FEvent]: B2FEventFilters[K] extends F ? K : never;
}[B2FEvent];

// ===========================================================================================
// SUBSCRIPTION TYPES
// ===========================================================================================

/**
 * Subscription data stored in TransportSession
 * Includes optional filter for targeted event delivery
 */
export interface Subscription<T extends B2FEvent = B2FEvent> {
	event: T;
	filter?: B2FEventFilters[T] extends NoFilter ? never : B2FEventFilters[T];
}

/**
 * Type-safe subscription options
 * - If event requires filter, filter is mandatory
 * - If event doesn't support filter, filter is forbidden
 */
export type SubscriptionOptions<T extends B2FEvent> = B2FEventFilters[T] extends NoFilter
	? { filter?: never } // No filter allowed
	: { filter: B2FEventFilters[T] }; // Filter required

/**
 * Helper to match event payload against subscription filter
 * Returns true if payload matches filter criteria
 */
export function matchesFilter<T extends B2FEvent>(
	event: T,
	filter: B2FEventFilters[T] | undefined,
	payload: any
): boolean {
	// No filter = match all
	if (!filter || filter === undefined) {
		return true;
	}

	// Type guard helpers - use unknown as intermediate step for type safety
	const filterObj = filter as unknown as Record<string, unknown>;

	// Task filter
	if ('taskId' in filterObj) {
		return payload.taskId === (filterObj as unknown as TaskFilter).taskId;
	}

	// Worker filter
	if ('workerId' in filterObj) {
		return payload.workerId === (filterObj as unknown as WorkerFilter).workerId;
	}

	// Workspace filter
	if ('workspaceId' in filterObj) {
		return payload.workspaceId === (filterObj as unknown as WorkspaceFilter).workspaceId;
	}

	// Intervention filter
	if ('interventionId' in filterObj) {
		return payload.interventionId === (filterObj as unknown as InterventionFilter).interventionId;
	}

	// Unknown filter type = no match (fail safe)
	return false;
}
