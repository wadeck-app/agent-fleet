/**
 * ===========================================================================================
 * REMOTE ORCHESTRATOR ADAPTER
 * ===========================================================================================
 *
 * Remote mode implementation of OrchestratorClient.
 * Communicates with orchestrator-server via transport layer (WebSocket/REST).
 *
 * Features:
 * - Automatic transport selection (WebSocket → REST+SSE → Long-polling)
 * - Type-safe B→O requests via transport
 * - Type-safe O→B event subscription
 * - Request ID generation and correlation
 * - Error handling and propagation
 *
 * Architecture:
 * RemoteAdapter → TransportFactory → OrchestratorTransport → orchestrator-server
 *
 * @example
 * ```typescript
 * const adapter = new RemoteOrchestratorAdapter({
 *   url: 'http://localhost:3737',
 *   transportMode: 'auto',
 * });
 *
 * await adapter.connect();
 *
 * const task = await adapter.createTask('New task', { priority: 'high' });
 *
 * adapter.on('task.created', (data) => {
 *   console.log('Task created:', data.taskId);
 * });
 * ```
 *
 * ===========================================================================================
 */
import { EventEmitter } from 'events';

import type { B2ORequest, B2OResponse, O2BEventData, O2BEventType , Task, WorkerInfo } from '@app/shared-orch-backend';

import type { OrchestratorClient, OrchestratorConfig, TaskFilters, WorkerFilters } from '../OrchestratorClient.js';
import type { OrchestratorTransport } from '../transport/OrchestratorTransport.js';
import type { TransportMode } from '../transport/TransportFactory.js';
import { TransportFactory } from '../transport/TransportFactory.js';

/**
 * Remote orchestrator configuration
 */
export interface RemoteOrchestratorAdapterConfig {
	/** Orchestrator server URL */
	url: string;
	/** Transport mode (default: 'auto') */
	transportMode?: TransportMode;
	/** Connection timeout in ms (default: 5000) */
	connectionTimeout?: number;
}

/**
 * Remote Orchestrator Adapter
 *
 * Communicates with remote orchestrator via network transport.
 */
export class RemoteOrchestratorAdapter implements OrchestratorClient {
	private transport: OrchestratorTransport | null = null;
	private eventEmitter = new EventEmitter();
	private requestIdCounter = 0;

	constructor(private config: RemoteOrchestratorAdapterConfig) {}

	// ===========================================================================================
	// LIFECYCLE
	// ===========================================================================================

	async connect(): Promise<void> {
		if (this.transport) {
			return;
		}

		// Create transport using factory
		this.transport = await TransportFactory.create({
			url: this.config.url,
			mode: this.config.transportMode ?? 'auto',
			connectionTimeout: this.config.connectionTimeout,
		});

		// Route O→B events from transport to local EventEmitter
		this.transport.onEvent(event => {
			this.eventEmitter.emit(event.type, event.data);
		});

		console.log('[RemoteAdapter] Connected to orchestrator');
	}

	async disconnect(): Promise<void> {
		if (!this.transport) {
			return;
		}

		await this.transport.disconnect();
		this.transport = null;
		this.eventEmitter.removeAllListeners();

		console.log('[RemoteAdapter] Disconnected from orchestrator');
	}

	// ===========================================================================================
	// B→O REQUEST METHODS
	// ===========================================================================================

	async createTask(description: string, metadata?: Record<string, unknown>): Promise<Task> {
		const response = await this.sendRequest({
			method: 'createTask',
			params: { description, metadata },
		});

		return response.result as Task;
	}

	async getTask(taskId: string): Promise<Task | null> {
		const response = await this.sendRequest({
			method: 'getTask',
			params: { taskId },
		});

		return response.result as Task | null;
	}

	async getTasks(filters?: TaskFilters): Promise<Task[]> {
		const response = await this.sendRequest({
			method: 'getTasks',
			params: filters,
		});

		return response.result as Task[];
	}

	async getWorkers(filters?: WorkerFilters): Promise<WorkerInfo[]> {
		const response = await this.sendRequest({
			method: 'getWorkers',
			params: filters,
		});

		return response.result as WorkerInfo[];
	}

	async getStats(): Promise<any> {
		const response = await this.sendRequest({
			method: 'getStats',
			params: {},
		});

		return response.result;
	}

	async updateConfig(config: Partial<OrchestratorConfig>): Promise<void> {
		await this.sendRequest({
			method: 'updateConfig',
			params: { config },
		});
	}

	async renameWorker(workerId: string, name: string): Promise<void> {
		await this.sendRequest({
			method: 'renameWorker',
			params: { workerId, name },
		});
	}

	// ===========================================================================================
	// O→B EVENT SUBSCRIPTION
	// ===========================================================================================

	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		// Subscribe to event type on transport (only once)
		if (this.eventEmitter.listenerCount(event) === 0 && this.transport) {
			this.transport.subscribe(event);
		}

		this.eventEmitter.on(event, handler);
	}

	off<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		this.eventEmitter.off(event, handler);

		// Unsubscribe from transport if no more listeners
		if (this.eventEmitter.listenerCount(event) === 0 && this.transport) {
			this.transport.unsubscribe(event);
		}
	}

	// ===========================================================================================
	// INTERNAL HELPERS
	// ===========================================================================================

	/**
	 * Send B→O request via transport
	 *
	 * @param request - Request data (method + params)
	 * @returns Response from orchestrator
	 * @throws Error if request fails or transport not connected
	 */
	private async sendRequest(request: Omit<B2ORequest, 'id'>): Promise<B2OResponse> {
		if (!this.transport) {
			throw new Error('Not connected to orchestrator. Call connect() first.');
		}

		// Generate unique request ID
		const id = this.generateRequestId();

		const fullRequest: B2ORequest = {
			id,
			method: request.method,
			params: request.params,
		};

		// Send request via transport
		const response = await this.transport.request(fullRequest);

		// Check for errors
		if (response.error) {
			throw new Error(`${response.error.code}: ${response.error.message}`);
		}

		return response;
	}

	/**
	 * Generate unique request ID
	 *
	 * @returns Request ID
	 */
	private generateRequestId(): string {
		this.requestIdCounter++;
		return `req-${Date.now()}-${this.requestIdCounter}`;
	}
}
