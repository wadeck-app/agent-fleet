/**
 * ===========================================================================================
 * ORCHESTRATOR CLIENT INTERFACE
 * ===========================================================================================
 *
 * Unified interface for Backend → Orchestrator communication.
 * Works in both library mode (direct access) and remote mode (network transport).
 *
 * Features:
 * - Type-safe method calls using B2OMethods
 * - Type-safe event subscription using O2BEventType and O2BEventData
 * - Lifecycle management (connect/disconnect)
 * - Consistent API regardless of deployment mode
 *
 * ===========================================================================================
 */
import { OrchestratorStats, Task, WorkerInfo } from 'shared-orch-worker/domain-types';
import { O2BEventData, O2BEventType } from 'shared-orch-worker/orchestrator-events';

/**
 * Task filters for getTasks()
 */
export interface TaskFilters {
	status?: string;
	workerId?: string;
	priority?: 'low' | 'medium' | 'high' | 'urgent';
}

/**
 * Worker filters for getWorkers()
 */
export interface WorkerFilters {
	type?: string;
	status?: 'idle' | 'busy';
}

/**
 * Orchestrator configuration (partial update)
 */
export interface OrchestratorConfig {
	[key: string]: unknown;
}

/**
 * Main OrchestratorClient interface
 * Implemented by LibraryAdapter and RemoteAdapter
 */
export interface OrchestratorClient {
	// ===========================================================================================
	// B→O REQUEST METHODS
	// ===========================================================================================

	/**
	 * Create a new task
	 */
	createTask(description: string, metadata?: Record<string, unknown>): Promise<Task>;

	/**
	 * Get a task by ID
	 */
	getTask(taskId: string): Promise<Task | null>;

	/**
	 * Get all tasks with optional filters
	 */
	getTasks(filters?: TaskFilters): Promise<Task[]>;

	/**
	 * Get all workers with optional filters
	 */
	getWorkers(filters?: WorkerFilters): Promise<WorkerInfo[]>;

	/**
	 * Get orchestrator statistics
	 */
	getStats(): Promise<OrchestratorStats>;

	/**
	 * Update orchestrator configuration
	 */
	updateConfig(config: Partial<OrchestratorConfig>): Promise<void>;

	/**
	 * Rename a worker
	 */
	renameWorker(workerId: string, name: string): Promise<void>;

	// ===========================================================================================
	// O→B EVENT SUBSCRIPTION
	// ===========================================================================================

	/**
	 * Subscribe to an O→B event
	 * Type-safe: handler receives correctly-typed event data
	 *
	 * @example
	 * ```typescript
	 * client.on('task.completed', (data) => {
	 *   // data is typed as O2BEventData<'task.completed'>
	 *   console.log(`Task ${data.taskId} completed`);
	 * });
	 * ```
	 */
	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void;

	/**
	 * Unsubscribe from an O→B event
	 */
	off<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void;

	// ===========================================================================================
	// LIFECYCLE MANAGEMENT
	// ===========================================================================================

	/**
	 * Connect to orchestrator
	 * - Library mode: no-op (already connected)
	 * - Remote mode: establish network connection
	 */
	connect(): Promise<void>;

	/**
	 * Disconnect from orchestrator
	 * - Library mode: no-op
	 * - Remote mode: close network connection
	 */
	disconnect(): Promise<void>;
}
