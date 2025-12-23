/**
 * B2F Event Constants
 *
 * Backend-to-Frontend event type constants.
 *
 * These constants ensure type-safe event names throughout the application
 * and provide a single source of truth for B2F event types.
 *
 * Format: `b2f:[category]:[action]`
 *
 * Usage:
 * ```typescript
 * // Backend
 * import { B2F_TASK_CREATED } from '@app/shared-frontend-backend';
 * eventBroadcaster.broadcast(B2F_TASK_CREATED, task);
 *
 * // Frontend
 * import { B2F_TASK_CREATED } from '@app/shared-frontend-backend';
 * transport.subscribe(B2F_TASK_CREATED, handler);
 * ```
 */

// ===========================================================================================
// TASK EVENTS
// ===========================================================================================

/** Task created event */
export const B2F_TASK_CREATED = 'b2f:task:created' as const;

/** Task updated event */
export const B2F_TASK_UPDATED = 'b2f:task:updated' as const;

/** Task deleted event */
export const B2F_TASK_DELETED = 'b2f:task:deleted' as const;

/** Task status changed event */
export const B2F_TASK_STATUS_CHANGED = 'b2f:task:status_changed' as const;

/** Task assigned to worker event */
export const B2F_TASK_ASSIGNED = 'b2f:task:assigned' as const;

/** Task priority changed event */
export const B2F_TASK_PRIORITY_CHANGED = 'b2f:task:priority_changed' as const;

// ===========================================================================================
// WORKER EVENTS
// ===========================================================================================

/** Worker created event */
export const B2F_WORKER_CREATED = 'b2f:worker:created' as const;

/** Worker updated event */
export const B2F_WORKER_UPDATED = 'b2f:worker:updated' as const;

/** Worker deleted event */
export const B2F_WORKER_DELETED = 'b2f:worker:deleted' as const;

/** Worker status changed event */
export const B2F_WORKER_STATUS_CHANGED = 'b2f:worker:status_changed' as const;

/** Worker heartbeat event (periodic health check) */
export const B2F_WORKER_HEARTBEAT = 'b2f:worker:heartbeat' as const;

/** Worker capacity changed event */
export const B2F_WORKER_CAPACITY_CHANGED = 'b2f:worker:capacity_changed' as const;

/** Worker connected event */
export const B2F_WORKER_CONNECTED = 'b2f:worker:connected' as const;

/** Worker disconnected event */
export const B2F_WORKER_DISCONNECTED = 'b2f:worker:disconnected' as const;

/** Worker status event */
export const B2F_WORKER_STATUS = 'b2f:worker:status' as const;

// ===========================================================================================
// WORKSPACE EVENTS
// ===========================================================================================

/** Workspace created event */
export const B2F_WORKSPACE_CREATED = 'b2f:workspace:created' as const;

/** Workspace updated event */
export const B2F_WORKSPACE_UPDATED = 'b2f:workspace:updated' as const;

/** Workspace deleted event */
export const B2F_WORKSPACE_DELETED = 'b2f:workspace:deleted' as const;

/** Workspace status changed event */
export const B2F_WORKSPACE_STATUS_CHANGED = 'b2f:workspace:status_changed' as const;

/** Workspace quota exceeded event */
export const B2F_WORKSPACE_QUOTA_EXCEEDED = 'b2f:workspace:quota_exceeded' as const;

/** Workspace archived event */
export const B2F_WORKSPACE_ARCHIVED = 'b2f:workspace:archived' as const;
