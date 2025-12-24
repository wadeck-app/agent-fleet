// /**
//  * ===========================================================================================
//  * MOCK ORCHESTRATOR
//  * ===========================================================================================
//  *
//  * Mock orchestrator instance for unit tests.
//  * Provides a minimal implementation that satisfies the LibraryAdapter requirements.
//  *
//  * Features:
//  * - Mock TaskManager with default responses
//  * - Mock WorkerWebSocketServer
//  * - EventEmitter for state management
//  * - Configurable via options
//  *
//  * @example
//  * ```typescript
//  * // Default mock
//  * const orchestrator = createMockOrchestrator();
//  *
//  * // Custom mock with overrides
//  * const orchestrator = createMockOrchestrator({
//  *   taskManager: {
//  *     createTask: async () => ({ id: 'custom-123', ... }),
//  *   },
//  * });
//  * ```
//  *
//  * ===========================================================================================
//  */
// import { EventEmitter } from 'events';
// import { TaskStatus } from 'shared-orch-worker/index';
// import type { Task, WorkerInfo } from 'shared-orch-worker/index';
//
// /**
//  * Options for creating a mock orchestrator
//  */
// export interface MockOrchestratorOptions {
// 	/**
// 	 * Override TaskManager methods
// 	 */
// 	taskManager?: {
// 		createTask?: (description: string, metadata: Record<string, unknown>) => Promise<Task>;
// 		getTask?: (taskId: string) => Task | null;
// 		getAllTasks?: () => Task[];
// 		// Add other methods as needed
// 	};
//
// 	/**
// 	 * Override WsServer methods
// 	 */
// 	wsServer?: {
// 		getWorkers?: () => WorkerInfo[];
// 		getPort?: () => number;
// 		// Add other methods as needed
// 	};
//
// 	/**
// 	 * Override startTime
// 	 */
// 	startTime?: Date;
// }
//
// /**
//  * Create a default mock task
//  */
// export function createMockTask(overrides?: Partial<Task>): Task {
// 	return {
// 		id: `task-${Date.now()}`,
// 		status: TaskStatus.TODO,
// 		description: 'Mock task',
// 		metadata: {},
// 		createdAt: new Date().toISOString(),
// 		updatedAt: new Date().toISOString(),
// 		priority: 'medium',
// 		assignedTo: null,
// 		comments: [],
// 		history: [],
// 		...overrides,
// 	} as Task;
// }
//
// /**
//  * Create a default mock worker
//  */
// export function createMockWorker(overrides?: Partial<WorkerInfo>): WorkerInfo {
// 	return {
// 		id: `worker-${Date.now()}`,
// 		type: 'mock-worker',
// 		connectedAt: new Date().toISOString(),
// 		taskId: null,
// 		...overrides,
// 	} as WorkerInfo;
// }
//
// /**
//  * Create a mock orchestrator instance
//  *
//  * @param options - Configuration options for the mock
//  * @returns Mock orchestrator instance
//  *
//  * @example
//  * ```typescript
//  * const orchestrator = createMockOrchestrator({
//  *   taskManager: {
//  *     createTask: async (desc) => createMockTask({ description: desc }),
//  *   },
//  * });
//  *
//  * const adapter = new LibraryOrchestratorAdapter(orchestrator);
//  * ```
//  */
// export function createMockOrchestrator(options?: MockOrchestratorOptions) {
// 	// Create a shared EventEmitter for state management
// 	const stateManager = new EventEmitter();
//
// 	// Default TaskManager implementation
// 	const defaultTaskManager = {
// 		createTask: async (description: string, metadata: Record<string, unknown>): Promise<Task> => {
// 			return createMockTask({ description, metadata });
// 		},
// 		getTask: (_taskId: string): Task | null => {
// 			return null; // Default: task not found
// 		},
// 		getAllTasks: (): Task[] => {
// 			return []; // Default: no tasks
// 		},
// 		stateManager,
// 	};
//
// 	// Default WsServer implementation
// 	const defaultWsServer = {
// 		getWorkers: (): WorkerInfo[] => {
// 			return []; // Default: no workers
// 		},
// 		getPort: (): number => {
// 			return 3738; // Default port
// 		},
// 	};
//
// 	// Merge options with defaults
// 	const taskManager = {
// 		...defaultTaskManager,
// 		...(options?.taskManager || {}),
// 		stateManager, // Always use the shared stateManager
// 	};
//
// 	const wsServer = {
// 		...defaultWsServer,
// 		...(options?.wsServer || {}),
// 	};
//
// 	// Return mock orchestrator
// 	return {
// 		getTaskManager: () => taskManager,
// 		getWsServer: () => wsServer,
// 		startTime: options?.startTime || new Date(),
// 		start: async () => {
// 			// No-op for mock
// 		},
// 		stop: async () => {
// 			// No-op for mock
// 		},
// 	};
// }
