// Domain types shared between Orchestrator and Worker
import { z } from 'zod';

// TODO: This is a simplified version. Full FlowMetadata is in flow-engine package
export interface FlowMetadata {
	id: string;
	version: string;
	hash: string;
	name: string;
	description: string;
	inputs: Record<string, any>;
	workspace: any;
	isValid: boolean;
	validationErrors?: Array<{
		severity: 'error' | 'warning' | 'info';
		code: any; // ValidationCode from flow-engine, using any for compatibility
		message: string;
		location?: {
			stepId?: string;
			field?: string;
			path?: string;
		};
		suggestion?: string;
	}>;
	validationWarnings?: Array<{
		severity: 'error' | 'warning' | 'info';
		code: any; // ValidationCode from flow-engine, using any for compatibility
		message: string;
		location?: {
			stepId?: string;
			field?: string;
			path?: string;
		};
		suggestion?: string;
	}>;
	trigger?: FlowTrigger;
}

export enum TaskStatus {
	BACKLOG = 'backlog',
	REFINING = 'refining',
	REFINED = 'refined',
	PRIORITIZING = 'prioritizing',
	TODO = 'todo',
	IN_PROGRESS = 'in_progress',
	TESTING = 'testing',
	REVIEW = 'review',
	REVIEWING = 'reviewing',
	CHANGES_REQUESTED = 'changes_requested',
	APPROVED = 'approved',
	MERGED = 'merged',
	BLOCKED = 'blocked',
	CANCELLED = 'cancelled',
	AWAITING_USER = 'awaiting_user',
}

export interface Task {
	id: string;
	description: string;
	status: TaskStatus;
	priority: 'low' | 'medium' | 'high' | 'urgent';
	createdAt: string;
	updatedAt: string;
	assignedTo: {
		workerId: string;
	} | null;
	comments: TaskComment[];
	metadata: Record<string, any>;
	history: TaskHistoryEntry[];

	// Duration tracking
	startedAt?: string; // ISO 8601 timestamp when task was started (IN_PROGRESS)
	completedAt?: string; // ISO 8601 timestamp when task was completed (APPROVED/MERGED/CANCELLED)

	// Flow Engine integration
	flowId?: string;
	flowInputs?: Record<string, any>;
	flowResult?: {
		status: 'completed' | 'failed';
		outputs?: Record<string, any>;
		error?: string;
		trace?: any;
	};

	// Workspace configuration
	workspacePath?: string; // For manual workspace mode

	// User Intervention (Approach 3: Hybrid - lightweight references)
	activeInterventionId?: string; // ID of current pending intervention
	interventionHistory?: string[]; // IDs of past interventions

	// Ticket linkage
	ticketId?: string; // ID of the parent Ticket (if this Task was created from a ticket)
}

export interface TaskComment {
	timestamp: string;
	author: string;
	content: string;
}

export interface TaskHistoryEntry {
	timestamp: string;
	event: string;
	[key: string]: any;
}

export interface WorkerInfo {
	id: string;
	taskId: string | null;
	taskStartedAt: string | null; // ISO timestamp when current task started
	connectedAt: string;
}

/**
 * User Intervention types and interfaces
 * Supports approval, question, and choice interventions
 */
export type InterventionType = 'approval' | 'question' | 'choice';
export type InterventionStatus = 'pending' | 'answered' | 'timeout' | 'cancelled';
export type InterventionSourceType = 'flow_step' | 'agent_tool';

export interface InterventionSource {
	type: InterventionSourceType;
	stepId?: string;
	toolName?: string;
}

export interface InterventionValidation {
	pattern?: string;
	min?: number;
	max?: number;
}

export interface InterventionOption {
	id: string;
	label: string;
	description?: string;
}

export interface InterventionConfig {
	title: string;
	description?: string;

	// For approval
	allowReject?: boolean;

	// For question
	question?: string;
	responseType?: 'text' | 'number' | 'boolean';
	validation?: InterventionValidation;

	// For choice
	options?: InterventionOption[];
	allowMultiple?: boolean;
}

export interface InterventionTimeout {
	minutes: number;
	onTimeout: 'fail' | 'continue' | 'default';
	defaultValue?: any;
}

export interface InterventionResponse {
	value: any;
	answeredBy: string;
	answeredAt: string;
	comment?: string;
}

export interface Intervention {
	id: string;
	taskId: string;
	workerId?: string;
	flowId?: string;
	stepId?: string;

	type: InterventionType;
	status: InterventionStatus;

	createdAt: string;
	answeredAt?: string;
	timeoutAt?: string;

	source: InterventionSource;
	config: InterventionConfig;

	blocking: boolean;
	timeout?: InterventionTimeout;

	response?: InterventionResponse;
}

/**
 * Flow trigger configuration for event-based execution
 */
export interface FlowTrigger {
	type: 'event';
	event: string;
	filter?: Record<string, string | undefined>;
}

/**
 * Ticket status lifecycle
 */
export enum TicketStatus {
	BACKLOG = 'backlog',
	TODO = 'todo',
	IN_PROGRESS = 'in_progress',
	DONE = 'done',
	CANCELLED = 'cancelled',
	PENDING_INTEGRATION = 'pending_integration',
	INTEGRATED = 'integrated',
}

/**
 * Ticket - higher-level work item (Jira/GitLab-style) that can spawn Tasks
 */
export interface Ticket {
	id: string;
	projectId: string;
	title: string;
	description: string;
	status: TicketStatus;
	/** Free-form labels for categorization (autocompleted from project) */
	labels: string[];
	/** Key::value fields (GitLab-style) */
	fields: Record<string, string>;
	/** Direct parent ticket ID (supports N-level hierarchy) */
	parentId?: string;
	/** IDs of execution Tasks generated for this ticket */
	taskIds: string[];
	/** AI-generated implementation flow ID (stored in flows-custom.yml) */
	flowId?: string;
	/** Float order for drag-and-drop sorting (Jira midpoint strategy) */
	order: number;
	/** Optimistic locking version */
	version: number;
	createdAt: string;
	updatedAt: string;
}

/**
 * Schema for orchestrator stats response
 * Represents the data structure returned by the orchestrator
 */
export const OrchestratorStatsSchema = z.object({
	restPort: z.number(),
	wsPort: z.number(),
	// orchestrator version
	version: z.string(),
	// milliseconds since orchestrator start
	uptime: z.number().optional(),
	workers: z.number(),
	workersList: z.array(
		z.object({
			id: z.string(),
			// type: z.string(),
			// Can be null when worker is idle
			taskId: z.string().nullable(),
			// ISO 8601 timestamp
			connectedAt: z.string(),
		})
	),
	tasks: z.object({
		total: z.number(),
		byStatus: z.record(z.string(), z.number()),
	}),
});

export type OrchestratorStats = z.infer<typeof OrchestratorStatsSchema>;
