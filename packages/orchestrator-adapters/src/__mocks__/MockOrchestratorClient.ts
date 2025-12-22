/**
 * ===========================================================================================
 * MOCK ORCHESTRATOR CLIENT
 * ===========================================================================================
 *
 * Test double for OrchestratorClient interface.
 * Used in unit tests to avoid depending on real orchestrator.
 *
 * Features:
 * - Implements full OrchestratorClient interface
 * - Configurable mock responses for all methods
 * - Call history tracking for assertions
 * - Event emission for testing event handlers
 * - Default mock data generation
 *
 * @example
 * ```typescript
 * const mock = new MockOrchestratorClient();
 *
 * // Configure mock response
 * mock.setMockResponse('createTask', {
 *   id: 'task-123',
 *   status: 'pending',
 *   description: 'Test task',
 * });
 *
 * // Make calls
 * const task = await mock.createTask('Test task');
 *
 * // Assert calls
 * expect(mock.callHistory).toHaveLength(1);
 * expect(mock.callHistory[0].method).toBe('createTask');
 *
 * // Emit events
 * mock.emitEvent('task.created', { taskId: 'task-123', ... });
 * ```
 *
 * ===========================================================================================
 */
import { EventEmitter } from 'events';

import type { O2BEventData, O2BEventType, OrchestratorStats, Task, WorkerInfo } from '@app/shared-orch-backend';

import type { OrchestratorClient, OrchestratorConfig, TaskFilters, WorkerFilters } from '../OrchestratorClient.js';

/**
 * Call record for history tracking
 */
export interface CallRecord {
	method: string;
	args: unknown[];
	timestamp: number;
}

/**
 * Mock Orchestrator Client
 *
 * Test double implementation of OrchestratorClient.
 */
export class MockOrchestratorClient implements OrchestratorClient {
	private eventEmitter = new EventEmitter();
	private mockResponses = new Map<string, any>();
	private connected = false;

	/**
	 * Call history for assertions
	 * Each entry records method name, arguments, and timestamp
	 */
	public callHistory: CallRecord[] = [];

	// ===========================================================================================
	// LIFECYCLE
	// ===========================================================================================

	async connect(): Promise<void> {
		this.callHistory.push({
			method: 'connect',
			args: [],
			timestamp: Date.now(),
		});

		this.connected = true;
	}

	async disconnect(): Promise<void> {
		this.callHistory.push({
			method: 'disconnect',
			args: [],
			timestamp: Date.now(),
		});

		this.connected = false;
		this.eventEmitter.removeAllListeners();
	}

	// ===========================================================================================
	// B→O REQUEST METHODS
	// ===========================================================================================

	async createTask(description: string, metadata?: Record<string, unknown>): Promise<Task> {
		this.callHistory.push({
			method: 'createTask',
			args: [description, metadata],
			timestamp: Date.now(),
		});

		const mockResponse = this.mockResponses.get('createTask');
		if (mockResponse) {
			return typeof mockResponse === 'function' ? mockResponse(description, metadata) : mockResponse;
		}

		// Default mock response
		return {
			id: `task-${Date.now()}`,
			status: 'pending' as any,
			description,
			metadata: metadata || {},
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			priority: 'medium',
			assignedTo: null,
			comments: [],
			history: [],
		};
	}

	async getTask(taskId: string): Promise<Task | null> {
		this.callHistory.push({
			method: 'getTask',
			args: [taskId],
			timestamp: Date.now(),
		});

		const mockResponse = this.mockResponses.get('getTask');
		if (mockResponse !== undefined) {
			return typeof mockResponse === 'function' ? mockResponse(taskId) : mockResponse;
		}

		// Default: return null (task not found)
		return null;
	}

	async getTasks(filters?: TaskFilters): Promise<Task[]> {
		this.callHistory.push({
			method: 'getTasks',
			args: [filters],
			timestamp: Date.now(),
		});

		const mockResponse = this.mockResponses.get('getTasks');
		if (mockResponse) {
			return typeof mockResponse === 'function' ? mockResponse(filters) : mockResponse;
		}

		// Default: empty array
		return [];
	}

	async getWorkers(filters?: WorkerFilters): Promise<WorkerInfo[]> {
		this.callHistory.push({
			method: 'getWorkers',
			args: [filters],
			timestamp: Date.now(),
		});

		const mockResponse = this.mockResponses.get('getWorkers');
		if (mockResponse) {
			return typeof mockResponse === 'function' ? mockResponse(filters) : mockResponse;
		}

		// Default: empty array
		return [];
	}

	async getStats(): Promise<OrchestratorStats> {
		this.callHistory.push({
			method: 'getStats',
			args: [],
			timestamp: Date.now(),
		});

		const mockResponse = this.mockResponses.get('getStats');
		if (mockResponse) {
			return typeof mockResponse === 'function' ? mockResponse() : mockResponse;
		}

		// Default mock stats
		return {
			restPort: 3738,
			wsPort: 3738,
			uptime: 0,
			workers: 0,
			workersList: [],
			tasks: {
				total: 0,
				byStatus: {},
			},
		};
	}

	async updateConfig(config: Partial<OrchestratorConfig>): Promise<void> {
		this.callHistory.push({
			method: 'updateConfig',
			args: [config],
			timestamp: Date.now(),
		});

		const mockResponse = this.mockResponses.get('updateConfig');
		if (mockResponse) {
			if (typeof mockResponse === 'function') {
				return mockResponse(config);
			}
		}

		// Default: no-op
	}

	async renameWorker(workerId: string, name: string): Promise<void> {
		this.callHistory.push({
			method: 'renameWorker',
			args: [workerId, name],
			timestamp: Date.now(),
		});

		const mockResponse = this.mockResponses.get('renameWorker');
		if (mockResponse) {
			if (typeof mockResponse === 'function') {
				return mockResponse(workerId, name);
			}
		}

		// Default: no-op
	}

	// ===========================================================================================
	// O→B EVENT SUBSCRIPTION
	// ===========================================================================================

	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		this.callHistory.push({
			method: 'on',
			args: [event],
			timestamp: Date.now(),
		});

		this.eventEmitter.on(event, handler);
	}

	off<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		this.callHistory.push({
			method: 'off',
			args: [event],
			timestamp: Date.now(),
		});

		this.eventEmitter.off(event, handler);
	}

	// ===========================================================================================
	// MOCK CONFIGURATION HELPERS
	// ===========================================================================================

	/**
	 * Set mock response for a method
	 *
	 * @param method - Method name (e.g., 'createTask', 'getTasks')
	 * @param response - Mock response value or factory function
	 *
	 * @example
	 * ```typescript
	 * // Static response
	 * mock.setMockResponse('createTask', { id: 'task-123', ... });
	 *
	 * // Dynamic response (function)
	 * mock.setMockResponse('createTask', (description, metadata) => ({
	 *   id: `task-${Date.now()}`,
	 *   description,
	 *   metadata,
	 * }));
	 * ```
	 */
	setMockResponse(method: string, response: any): void {
		this.mockResponses.set(method, response);
	}

	/**
	 * Clear a specific mock response
	 *
	 * @param method - Method name to clear
	 */
	clearMockResponse(method: string): void {
		this.mockResponses.delete(method);
	}

	/**
	 * Clear all mock responses
	 */
	clearAllMockResponses(): void {
		this.mockResponses.clear();
	}

	/**
	 * Emit an O→B event for testing event handlers
	 *
	 * @param event - Event type
	 * @param data - Event data
	 *
	 * @example
	 * ```typescript
	 * mock.emitEvent('task.created', {
	 *   taskId: 'task-123',
	 *   task: { ... },
	 *   timestamp: new Date().toISOString(),
	 * });
	 * ```
	 */
	emitEvent<T extends O2BEventType>(event: T, data: O2BEventData<T>): void {
		this.eventEmitter.emit(event, data);
	}

	/**
	 * Clear call history
	 * Useful between test cases
	 */
	clearCallHistory(): void {
		this.callHistory = [];
	}

	/**
	 * Get calls for a specific method
	 *
	 * @param method - Method name
	 * @returns Array of call records for that method
	 *
	 * @example
	 * ```typescript
	 * const createTaskCalls = mock.getCallsFor('createTask');
	 * expect(createTaskCalls).toHaveLength(3);
	 * expect(createTaskCalls[0].args[0]).toBe('First task description');
	 * ```
	 */
	getCallsFor(method: string): CallRecord[] {
		return this.callHistory.filter(call => call.method === method);
	}

	/**
	 * Check if method was called
	 *
	 * @param method - Method name
	 * @returns true if method was called at least once
	 */
	wasCalled(method: string): boolean {
		return this.callHistory.some(call => call.method === method);
	}

	/**
	 * Get number of times method was called
	 *
	 * @param method - Method name
	 * @returns Call count
	 */
	getCallCount(method: string): number {
		return this.callHistory.filter(call => call.method === method).length;
	}

	/**
	 * Check if client is connected
	 */
	isConnected(): boolean {
		return this.connected;
	}
}
