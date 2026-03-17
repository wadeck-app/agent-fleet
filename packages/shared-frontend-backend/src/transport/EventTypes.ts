import type { DashboardData } from '../api/dashboard.contract';
import type { Intervention } from '../api/interventions.contract';
import type { Project, ProjectBoardData, ProjectsData } from '../api/projects.contract';
import type { Task, TasksData } from '../api/tasks.contract';
import type { Ticket, TicketComment } from '../api/tickets.contract';
import type { Worker, WorkersData } from '../api/workers.contract';
import type { ScriptLogEntry, ScriptProcess, WorkspaceScript } from '../api/workspaceScripts.contract';
import type { Workspace } from '../api/workspaces.contract';

//FIXME this whole typing structure is too complicated. I don't care to know about the abbreviation/type/action kind of things
// it's only useful for readability.

/**
 * CRUD Event Types
 * Standard lifecycle events for all resources
 */
export type CrudEventType = 'created' | 'updated' | 'deleted' | 'status_changed';

/**
 * Resource Event Helper Type
 * Generates typed event names for CRUD operations on a resource
 *
 * @template Resource - Resource name (e.g., 'task', 'worker')
 * @template Data - Data type for this resource
 *
 * @example
 * ResourceEvent<'task', Task> generates:
 * {
 *   'task:created': Task;
 *   'task:updated': Task;
 *   'task:deleted': Task;
 *   'task:status_changed': Task;
 * }
 */
export type ResourceEvent<Resource extends string, Data> = {
	[K in CrudEventType as `b2f:${Resource}:${K}`]: Data;
};

/**
 * Business Events
 * Domain-specific events beyond standard CRUD operations
 *
 * These events capture important business logic state changes that clients
 * may want to react to differently than generic CRUD events.
 */
export interface BusinessEvents {
	/** Task assigned to a worker */
	'b2f:task:assigned': {
		taskId: string;
		workerId: string;
		assignedAt: number;
	};

	/** Task priority changed */
	'b2f:task:priority_changed': {
		taskId: string;
		oldPriority: number;
		newPriority: number;
	};

	/** Task trace updated (real-time log streaming) */
	'b2f:task:trace_updated': {
		taskId: string;
		stepsCount: number;
	};

	/** Worker heartbeat (periodic health check) */
	'b2f:worker:heartbeat': {
		workerId: string;
		timestamp: number;
		status: string;
	};

	/** Worker capacity changed */
	'b2f:worker:capacity_changed': {
		workerId: string;
		capacity: number;
	};

	/** Worker connected (lifecycle event) */
	'b2f:worker:connected': Worker;

	/** Worker disconnected (lifecycle event) */
	'b2f:worker:disconnected': Worker;

	/** Workspace quota exceeded */
	'b2f:workspace:quota_exceeded': {
		workspaceId: string;
		quotaType: string;
		usage: number;
		limit: number;
	};

	/** Workspace archived */
	'b2f:workspace:archived': {
		workspaceId: string;
		archivedAt: number;
	};

	/** Dashboard data updated (aggregate) */
	'b2f:dashboard:updated': DashboardData;

	/** Tasks data updated (aggregate) - replaces direct orchestrator WebSocket */
	'b2f:tasks:updated': TasksData;

	/** Workers data updated (aggregate) - replaces direct orchestrator WebSocket */
	'b2f:workers:updated': WorkersData;

	/** Workspaces data updated (aggregate) */
	'b2f:workspaces:updated': Workspace[];

	/** Interventions data updated (aggregate) */
	'b2f:interventions:updated': Intervention[];

	/** Intervention created */
	'b2f:intervention:created': Intervention;

	/** Intervention updated */
	'b2f:intervention:updated': Intervention;

	/** Intervention answered */
	'b2f:intervention:answered': Intervention;

	/** Intervention timeout */
	'b2f:intervention:timeout': Intervention;

	/** Intervention cancelled */
	'b2f:intervention:cancelled': Intervention;

	/** Projects data updated (aggregate) */
	'b2f:projects:updated': ProjectsData;

	/** Project created */
	'b2f:project:created': Project;

	/** Project updated */
	'b2f:project:updated': Project;

	/** Project deleted */
	'b2f:project:deleted': Project;

	/** Project board data updated */
	'b2f:project:board_updated': ProjectBoardData;

	/** Workspace script created */
	'b2f:workspace_script:created': WorkspaceScript;

	/** Workspace script updated */
	'b2f:workspace_script:updated': WorkspaceScript;

	/** Workspace script deleted */
	'b2f:workspace_script:deleted': WorkspaceScript;

	/** Script process started */
	'b2f:script_process:started': ScriptProcess;

	/** Script process stopped */
	'b2f:script_process:stopped': ScriptProcess;

	/** Script process log updated (real-time log streaming) */
	'b2f:script_process:log_updated': {
		scriptId: string;
		logs: ScriptLogEntry[];
	};

	/** Script process error */
	'b2f:script_process:error': {
		scriptId: string;
		processId: string;
		error: string;
	};

	/** Tickets list updated (aggregate) */
	'b2f:tickets:updated': Record<string, never>;

	/** Comment added to a ticket — carries the full comment so subscribers can append without re-fetching */
	'b2f:ticket:comment_added': TicketComment;

	/** Flow feedback submitted for a ticket */
	'b2f:ticket:feedback_submitted': {
		ticketId: string;
		feedbackId: string;
		rating: number;
	};

	/** A new flow proposal was created or updated (async redesign completed) */
	'b2f:flow:proposal_updated': {
		ticketId: string;
	};
}

/**
 * Event Types Registry
 * Complete mapping of all available event types to their data types
 *
 * This combines:
 * - CRUD events for tasks (task:created, task:updated, etc.)
 * - CRUD events for workers (worker:created, worker:updated, etc.)
 * - CRUD events for workspaces (workspace:created, workspace:updated, etc.)
 * - CRUD events for projects (project:created, project:updated, etc.)
 * - Business-specific events (task:assigned, worker:heartbeat, etc.)
 */
export type EventTypes = ResourceEvent<'task', Task> &
	ResourceEvent<'worker', Worker> &
	ResourceEvent<'workspace', Workspace> &
	ResourceEvent<'project', Project> &
	ResourceEvent<'ticket', Ticket> &
	BusinessEvents;

/**
 * Event Type Union
 * All valid event type strings
 *
 * @example
 * const eventType: EventType = 'task:created'; // ✅ Valid
 * const eventType: EventType = 'invalid:event'; // ❌ Type error
 */
export type EventType = keyof EventTypes;

/**
 * Event Data Extractor
 * Extract the data type for a specific event type
 *
 * @template T - Event type string
 *
 * @example
 * type TaskCreatedData = EventData<'task:created'>; // → Task
 * type HeartbeatData = EventData<'worker:heartbeat'>; // → { workerId: string; timestamp: number; status: string }
 */
export type EventData<T extends EventType> = EventTypes[T];

/**
 * Event Filter
 * Type-safe filter for subscribing to specific events
 *
 * @example
 * // Subscribe to all task events
 * const taskEvents: EventType[] = [
 *   'task:created',
 *   'task:updated',
 *   'task:deleted',
 *   'task:status_changed'
 * ];
 *
 * // Subscribe to specific business events
 * const businessEvents: EventType[] = [
 *   'task:assigned',
 *   'worker:heartbeat'
 * ];
 */
export type EventFilter = EventType | EventType[];

/**
 * Resource name extractor
 * Extract resource name from event type
 *
 * @example
 * ResourceName<'task:created'> // → 'task'
 * ResourceName<'worker:heartbeat'> // → 'worker'
 */
export type ResourceName<T extends EventType> = T extends `${infer R}:${string}` ? R : never;

/**
 * Events for Resource
 * Get all event types for a specific resource
 *
 * @example
 * type TaskEvents = EventsForResource<'task'>;
 * // → 'task:created' | 'task:updated' | 'task:deleted' | 'task:status_changed' | 'task:assigned' | 'task:priority_changed'
 */
export type EventsForResource<R extends string> = Extract<EventType, `${R}:${string}`>;
