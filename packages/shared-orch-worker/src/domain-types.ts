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
	connectedAt: string;
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
