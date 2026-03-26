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

/**
 * Tasks data updated event (aggregate)
 * Used for reactive updates of entire task list (like dashboard)
 * Replaces direct orchestrator WebSocket connection
 */
export const B2F_TASKS_UPDATED = 'b2f:tasks:updated' as const;

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

/**
 * Task trace updated event (real-time log streaming)
 * Emitted every ~500ms during task execution with incremental trace updates
 * REQUIRES taskId filter to avoid spamming all clients
 * @see EventFilters.ts for filter requirements
 */
export const B2F_TASK_TRACE_UPDATED = 'b2f:task:trace_updated' as const;

// ===========================================================================================
// WORKER EVENTS
// ===========================================================================================

/**
 * Workers data updated event (aggregate)
 * Used for reactive updates of entire worker list (like dashboard)
 * Replaces direct orchestrator WebSocket connection
 */
export const B2F_WORKERS_UPDATED = 'b2f:workers:updated' as const;

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

/**
 * Workspaces data updated event (aggregate)
 * Used for reactive updates of entire workspace list
 * Emitted when workers connect/disconnect or workspace metadata changes
 */
export const B2F_WORKSPACES_UPDATED = 'b2f:workspaces:updated' as const;

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

// ===========================================================================================
// WORKSPACE SCRIPT EVENTS
// ===========================================================================================

/** Workspace script created event */
export const B2F_WORKSPACE_SCRIPT_CREATED = 'b2f:workspace_script:created' as const;

/** Workspace script updated event */
export const B2F_WORKSPACE_SCRIPT_UPDATED = 'b2f:workspace_script:updated' as const;

/** Workspace script deleted event */
export const B2F_WORKSPACE_SCRIPT_DELETED = 'b2f:workspace_script:deleted' as const;

/** Script process started event */
export const B2F_SCRIPT_PROCESS_STARTED = 'b2f:script_process:started' as const;

/** Script process stopped event */
export const B2F_SCRIPT_PROCESS_STOPPED = 'b2f:script_process:stopped' as const;

/**
 * Script process log updated event (real-time log streaming)
 * Emitted when new log entries are available
 * REQUIRES scriptId filter to avoid spamming all clients
 * @see EventFilters.ts for filter requirements
 */
export const B2F_SCRIPT_PROCESS_LOG_UPDATED = 'b2f:script_process:log_updated' as const;

/** Script process error event */
export const B2F_SCRIPT_PROCESS_ERROR = 'b2f:script_process:error' as const;

// =============================================================================
// Dashboard Events
// =============================================================================

/** Dashboard data updated event */
export const B2F_DASHBOARD_UPDATED = 'b2f:dashboard:updated' as const;

// ===========================================================================================
// PROJECT EVENTS
// ===========================================================================================

/**
 * Projects data updated event (aggregate)
 * Used for reactive updates of entire project list
 */
export const B2F_PROJECTS_UPDATED = 'b2f:projects:updated' as const;

/** Project created event */
export const B2F_PROJECT_CREATED = 'b2f:project:created' as const;

/** Project updated event */
export const B2F_PROJECT_UPDATED = 'b2f:project:updated' as const;

/** Project deleted event */
export const B2F_PROJECT_DELETED = 'b2f:project:deleted' as const;

/** Project board updated event (tasks grouped by status) */
export const B2F_PROJECT_BOARD_UPDATED = 'b2f:project:board_updated' as const;

// ===========================================================================================
// INTERVENTION EVENTS
// ===========================================================================================

/**
 * Interventions data updated event (aggregate)
 * Used for reactive updates of entire intervention list
 */
export const B2F_INTERVENTIONS_UPDATED = 'b2f:interventions:updated' as const;

/** Intervention created event */
export const B2F_INTERVENTION_CREATED = 'b2f:intervention:created' as const;

/** Intervention updated event */
export const B2F_INTERVENTION_UPDATED = 'b2f:intervention:updated' as const;

/** Intervention answered event */
export const B2F_INTERVENTION_ANSWERED = 'b2f:intervention:answered' as const;

/** Intervention timeout event */
export const B2F_INTERVENTION_TIMEOUT = 'b2f:intervention:timeout' as const;

/** Intervention cancelled event */
export const B2F_INTERVENTION_CANCELLED = 'b2f:intervention:cancelled' as const;

// ===========================================================================================
// TICKET EVENTS
// ===========================================================================================

/**
 * Tickets LIST needs to refresh.
 * Broadcast when: ticket created, ticket deleted, reorder, or a list-visible field changed
 * (title, status, labels). List pages subscribe to this event only.
 * NOT broadcast for description/fields/flowId/taskIds changes (not visible in the list).
 */
export const B2F_TICKETS_UPDATED = 'b2f:tickets:updated' as const;

/**
 * A specific ticket was created.
 * Broadcast on every createTicket(). Always paired with B2F_TICKETS_UPDATED.
 * Payload: full Ticket object.
 */
export const B2F_TICKET_CREATED = 'b2f:ticket:created' as const;

/**
 * A specific ticket was updated (any field).
 * Broadcast on every updateTicket() and reorderTicket().
 * Payload: { ticketId } — use as server-side filter so only the detail page
 * for that specific ticket receives it. NOT broadcast on create or delete.
 */
export const B2F_TICKET_UPDATED = 'b2f:ticket:updated' as const;

/**
 * A specific ticket was deleted.
 * Broadcast on deleteTicket(). Always paired with B2F_TICKETS_UPDATED.
 * Payload: { id } — detail pages should navigate away on receiving this.
 */
export const B2F_TICKET_DELETED = 'b2f:ticket:deleted' as const;

/**
 * A ticket's status field specifically changed.
 * Broadcast alongside B2F_TICKET_UPDATED when status changes, for subscribers
 * that only care about status transitions (e.g. kanban boards, flow triggers).
 * Payload: { ticketId, oldStatus, newStatus }.
 */
export const B2F_TICKET_STATUS_CHANGED = 'b2f:ticket:status_changed' as const;

/** Ticket comment added event — carries the full comment so subscribers can append without re-fetching */
export const B2F_TICKET_COMMENT_ADDED = 'b2f:ticket:comment_added' as const;

/** Flow feedback submitted for a ticket */
export const B2F_TICKET_FEEDBACK_SUBMITTED = 'b2f:ticket:feedback_submitted' as const;

/**
 * A new flow proposal was created or updated for a ticket (async redesign completed).
 * Broadcast by FlowProposalsService after the FlowDesignerAgent finishes.
 * Payload: { ticketId } — use as server-side filter so only the affected ticket's UI receives it.
 * Use this instead of B2F_TICKET_UPDATED to avoid refreshing Flow Design tab on unrelated updates.
 */
export const B2F_FLOW_PROPOSAL_UPDATED = 'b2f:flow:proposal_updated' as const;
