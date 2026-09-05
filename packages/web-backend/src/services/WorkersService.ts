import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { createLogger } from 'shared-common/logger';

import type { WorkerFlows } from '@app/shared/api/flows.contract';
import {
	type EventSubscriptionsResponse,
	type UpdateWorkerNameRequest,
	type Worker,
	type WorkersData,
	type WorkersListQuery,
	type WorkersListResponse,
} from '@app/shared/api/workers.contract';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';
import { B2F_WORKER_UPDATED } from '@app/shared/transport';

import type { WorkersRepository } from '../repositories/WorkersRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

const log = createLogger('WorkersService');

/**
 * ===========================================================================================
 * WORKERS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workers data.
 * Responsibilities:
 * - Fetch data from OrchestratorClient
 * - Transform orchestrator stats into workers DTO
 * - Calculate worker states and statistics
 * - Enrich worker data with computed fields
 * - Emit real-time events for worker state changes
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 *
 * Future CRUD Operations (when implemented):
 * - createWorker() → emit 'b2f:worker:created'
 * - updateWorker() → emit 'b2f:worker:updated'
 * - deleteWorker() → emit 'b2f:worker:deleted'
 * - updateWorkerStatus() → emit 'b2f:worker:status_changed'
 * - recordHeartbeat() → emit 'b2f:worker:heartbeat'
 * - updateWorkerCapacity() → emit 'b2f:worker:capacity_changed'
 *
 * ===========================================================================================
 */

export class WorkersService {
	constructor(
		// private readonly orchestratorClient: OrchestratorClient,
		private readonly orchestratorWrapper: OrchestratorWrapper,
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly workersRepository: WorkersRepository
	) {}

	/**
	 * Get workers data (transformed from orchestrator stats)
	 */
	async getWorkersData(): Promise<WorkersData> {
		try {
			// const stats = await this.orchestratorClient.getStats();
			const stats = await this.orchestratorWrapper.getStats();

			// Fetch all worker metadata
			const allMetadata = await this.workersRepository.findAll();
			const metadataMap = new Map(allMetadata.map(m => [m.workerId, m]));

			// Transform workers list
			// Note: All workers in the list are connected (disconnected workers are removed)
			const workers: Worker[] = stats.workersList.map((w: any) => ({
				workerId: w.id,
				name: metadataMap.get(w.id)?.name, // Merge name from metadata
				version: metadataMap.get(w.id)?.version, // Merge version from metadata
				connected: true, // Workers in the list are connected
				taskId: w.taskId ?? undefined, // Convert null to undefined
				state: w.taskId ? 'busy' : 'idle',
				taskStartedAt: w.taskStartedAt ?? undefined, // Convert null to undefined
				// MVP: These would come from actual tracking
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
			}));

			// Calculate summary stats
			const connected = workers.length; // All workers in list are connected
			const disconnected = 0; // Would need separate tracking
			const idle = workers.filter(w => w.state === 'idle').length;
			const busy = workers.filter(w => w.state === 'busy').length;

			// Average load (percentage of workers that are busy)
			const avgLoad = connected > 0 ? Math.round((busy / connected) * 100) : 0;

			const workersData: WorkersData = {
				timestamp: new Date().toISOString(),
				summary: {
					total: workers.length,
					connected,
					disconnected,
					idle,
					busy,
					avgLoad,
				},
				workers,
			};

			return workersData;
		} catch (_error) {
			// Orchestrator is offline - return empty workers data
			return {
				timestamp: new Date().toISOString(),
				summary: {
					total: 0,
					connected: 0,
					disconnected: 0,
					idle: 0,
					busy: 0,
					avgLoad: 0,
				},
				workers: [],
			};
		}
	}

	/**
	 * Get workers list with pagination, sorting, and search support
	 * (New Data2 architecture)
	 */
	async getWorkersList(query: WorkersListQuery): Promise<WorkersListResponse> {
		try {
			// Fetch all workers from orchestrator
			const stats = await this.orchestratorWrapper.getStats();

			// Fetch all worker metadata
			const allMetadata = await this.workersRepository.findAll();
			const metadataMap = new Map(allMetadata.map(m => [m.workerId, m]));

			let workers: Worker[] = stats.workersList.map((w: any) => ({
				workerId: w.id,
				name: metadataMap.get(w.id)?.name, // Merge name from metadata
				version: metadataMap.get(w.id)?.version, // Merge version from metadata
				connected: true,
				taskId: w.taskId ?? undefined,
				state: w.taskId ? 'busy' : 'idle',
				taskStartedAt: w.taskStartedAt ?? undefined, // Convert null to undefined
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
			}));

			// Apply search if provided
			if (query.search) {
				workers = this.applySearch(workers, query.search);
			}

			// Apply sorting if provided
			if (query.sortBy && query.sortOrder) {
				workers = this.applySorting(workers, query.sortBy, query.sortOrder);
			}

			// Apply pagination
			const page = query.page || 1;
			const pageSize = query.pageSize || 10;
			const total = workers.length;
			const totalPages = Math.ceil(total / pageSize);
			const start = (page - 1) * pageSize;
			const paginatedWorkers = workers.slice(start, start + pageSize);

			return {
				items: paginatedWorkers,
				pagination: {
					total,
					page,
					pageSize,
					totalPages,
				},
			};
		} catch (error) {
			// Orchestrator is offline - return empty list
			log.error('Failed to fetch workers list:', error);
			return {
				items: [],
				pagination: {
					total: 0,
					page: query.page || 1,
					pageSize: query.pageSize || 10,
					totalPages: 0,
				},
			};
		}
	}

	/**
	 * Apply search filter across worker fields
	 */
	private applySearch(workers: Worker[], searchQuery: string): Worker[] {
		const lowerQuery = searchQuery.toLowerCase().trim();
		if (!lowerQuery) return workers;

		return workers.filter(
			w =>
				w.workerId.toLowerCase().includes(lowerQuery) ||
				w.name?.toLowerCase().includes(lowerQuery) ||
				w.state.toLowerCase().includes(lowerQuery) ||
				w.taskId?.toLowerCase().includes(lowerQuery)
		);
	}

	/**
	 * Apply sorting to workers
	 */
	private applySorting(workers: Worker[], sortBy: string, sortOrder: string): Worker[] {
		const isDescending = sortOrder === 'desc';

		return [...workers].sort((a, b) => {
			const aVal = (a as any)[sortBy];
			const bVal = (b as any)[sortBy];

			if (aVal === null || aVal === undefined) return 1;
			if (bVal === null || bVal === undefined) return -1;

			let comparison = 0;
			if (typeof aVal === 'boolean') {
				comparison = aVal === bVal ? 0 : aVal ? 1 : -1;
			} else if (typeof aVal === 'string' && typeof bVal === 'string') {
				comparison = aVal.localeCompare(bVal);
			} else if (typeof aVal === 'number' && typeof bVal === 'number') {
				comparison = aVal - bVal;
			} else {
				comparison = String(aVal).localeCompare(String(bVal));
			}

			return isDescending ? -comparison : comparison;
		});
	}

	/**
	 * Get a single worker by ID
	 * @param workerId Worker ID
	 * @returns Worker data with projectId and workspacePath if connected
	 * @throws NotFoundException if worker not found in orchestrator and has no metadata
	 */
	async getWorker(workerId: string): Promise<Worker> {
		let runtimeWorker: any = null;
		let workerWorkspace: any = null;

		// Try to fetch runtime data from orchestrator
		try {
			const stats = await this.orchestratorWrapper.getStats();
			runtimeWorker = stats.workersList.find((w: any) => w.id === workerId);

			// If worker is connected, fetch workspace info
			if (runtimeWorker) {
				const orchestrator = this.orchestratorWrapper.getOrchestrator();
				const wsServer = orchestrator.getWsServer();
				const connectedWorkspaces = wsServer?.getConnectionManager().getConnectedWorkspaces() ?? [];
				workerWorkspace = connectedWorkspaces.find((w: any) => w.workerId === workerId);
			}
		} catch (error) {
			// Orchestrator is offline - will check metadata below
			log.debug('Orchestrator unavailable, checking metadata for worker:', workerId);
		}

		// Fetch worker metadata (name, version)
		const metadata = await this.workersRepository.findByWorkerId(workerId);

		// If worker not found in orchestrator and has no metadata, throw NotFoundException
		if (!runtimeWorker && !metadata) {
			throw new NotFoundException(`Worker ${workerId} not found`, ERROR_CODES.RESOURCE_NOT_FOUND, { workerId });
		}

		// Build worker response
		if (runtimeWorker) {
			// Worker is connected - merge runtime + workspace + metadata
			const worker: Worker = {
				workerId,
				name: metadata?.name,
				version: metadata?.version,
				connected: true,
				taskId: runtimeWorker.taskId ?? undefined,
				state: runtimeWorker.taskId ? 'busy' : 'idle',
				taskStartedAt: runtimeWorker.taskStartedAt ?? undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
				projectId: workerWorkspace?.projectId,
				workspacePath: workerWorkspace?.workspacePath,
			};
			return worker;
		} else {
			// Worker is disconnected - only metadata available
			const worker: Worker = {
				workerId,
				name: metadata?.name,
				version: metadata?.version,
				connected: false,
				state: 'idle',
				taskId: undefined,
				taskStartedAt: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
				projectId: undefined,
				workspacePath: undefined,
			};
			return worker;
		}
	}

	/**
	 * Get flows for a specific worker
	 */
	async getWorkerFlows(workerId: string): Promise<WorkerFlows> {
		try {
			// Check if orchestratorWrapper is available (library mode)
			if (!this.orchestratorWrapper) {
				return [];
			}

			// Access FlowDiscoveryRegistry via OrchestratorWrapper (library mode)
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			const wsServer = orchestrator.getWsServer();

			if (!wsServer) {
				return [];
			}

			const flowDiscoveryRegistry = wsServer.getConnectionManager().getFlowDiscoveryRegistry();
			const workerFlows = flowDiscoveryRegistry.getWorkerFlows(workerId);

			return workerFlows || [];
		} catch (_error) {
			// Orchestrator is offline or worker not found - return empty flows
			return [];
		}
	}

	/**
	 * Get all active event subscriptions registered by connected workers
	 */
	async getEventSubscriptions(): Promise<EventSubscriptionsResponse> {
		try {
			const orchestrator = this.orchestratorWrapper.getOrchestrator();
			const registry = orchestrator.getEventSubscriptionRegistry();
			// Strip undefined filter values -- orchestrator uses undefined as wildcard,
			// but the API contract only exposes concrete string key=value pairs
			const subscriptions = registry.getAll().map(sub => ({
				...sub,
				filter: sub.filter
					? (Object.fromEntries(
							Object.entries(sub.filter).filter(
								(entry): entry is [string, string] => entry[1] !== undefined
							)
						) as Record<string, string>)
					: undefined,
			}));
			return { subscriptions };
		} catch (_error) {
			return { subscriptions: [] };
		}
	}

	/**
	 * Update worker name with optimistic locking
	 * Emits 'b2f:worker:updated' event after successful update
	 * @param workerId Worker ID
	 * @param data Update data containing name and version
	 * @param connId Connection ID to exclude from broadcast (prevents echo to origin client)
	 */
	async updateWorkerName(workerId: string, data: UpdateWorkerNameRequest, connId?: string): Promise<Worker> {
		// 1. Validate worker exists in orchestrator (runtime data)
		const stats = await this.orchestratorWrapper.getStats();
		const runtimeWorker = stats.workersList.find((w: any) => w.id === workerId);

		if (!runtimeWorker) {
			throw new NotFoundException(`Worker ${workerId} not found`, ERROR_CODES.RESOURCE_NOT_FOUND, { workerId });
		}

		// 2. Get current metadata (null if first time renaming)
		const currentMetadata = await this.workersRepository.findByWorkerId(workerId);

		// 3. Optimistic locking check
		if (currentMetadata) {
			// Metadata exists - check version matches
			if (currentMetadata.version !== data.version) {
				throw new ConflictException(
					`Worker has been modified by another user. Expected version ${data.version}, but current version is ${currentMetadata.version}.`,
					ERROR_CODES.VERSION_MISMATCH,
					{ expectedVersion: data.version, currentVersion: currentMetadata.version }
				);
			}
		} else {
			// First time - version must be 1
			if (data.version !== 1) {
				throw new ConflictException(
					`Worker has no metadata yet. Expected version 1 for first rename, but got ${data.version}.`,
					ERROR_CODES.VERSION_MISMATCH,
					{ expectedVersion: 1, receivedVersion: data.version }
				);
			}
		}

		// 4. Calculate new version
		const newVersion = currentMetadata ? currentMetadata.version + 1 : 1;

		// 5. Update or create metadata with new version
		const updatedMetadata = await this.workersRepository.updateName(workerId, data.name, newVersion);

		// 6. Build updated worker object
		const updatedWorker: Worker = {
			workerId,
			name: data.name,
			version: updatedMetadata.version,
			connected: true,
			taskId: runtimeWorker.taskId ?? undefined,
			state: runtimeWorker.taskId ? 'busy' : 'idle',
			uptime: undefined,
			lastHeartbeat: undefined,
			tasksCompleted: undefined,
			successRate: undefined,
		};

		// 7. Emit event AFTER successful update (for other frontends, excluding origin)
		log.info('Broadcasting B2F_WORKER_UPDATED event for worker:', workerId, 'connId:', connId);
		this.eventBroadcaster.broadcastExcept(B2F_WORKER_UPDATED, updatedWorker, connId);
		log.info('Event broadcasted successfully (origin excluded)');

		return updatedWorker;
	}

	// ===========================================================================================
	// CRUD METHODS (TO BE IMPLEMENTED)
	// ===========================================================================================
	// When CRUD operations are implemented, use these as templates for event emission

	/**
	 * Create a new worker (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:worker:created' event
	 *
	 * @example
	 * ```typescript
	 * async createWorker(data: CreateWorkerDto): Promise<Worker> {
	 *   try {
	 *     const worker = await this.orchestratorRepository.createWorker(data);
	 *
	 *     // Emit event AFTER successful creation
	 *     this.eventBroadcaster.broadcast('b2f:worker:created', worker);
	 *
	 *     return worker;
	 *   } catch (error) {
	 *     console.error('[WorkersService] Failed to create worker:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Update worker status (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:worker:status_changed' event
	 *
	 * @example
	 * ```typescript
	 * async updateWorkerStatus(workerId: string, status: string): Promise<Worker> {
	 *   try {
	 *     const worker = await this.orchestratorRepository.updateWorkerStatus(workerId, status);
	 *
	 *     // Emit event AFTER successful update
	 *     this.eventBroadcaster.broadcast('b2f:worker:status_changed', {
	 *       workerId: worker.workerId,
	 *       status: worker.state,
	 *     });
	 *
	 *     return worker;
	 *   } catch (error) {
	 *     console.error('[WorkersService] Failed to update worker status:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Record worker heartbeat (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:worker:heartbeat' event
	 *
	 * @example
	 * ```typescript
	 * async recordHeartbeat(workerId: string): Promise<void> {
	 *   try {
	 *     const timestamp = Date.now();
	 *     await this.orchestratorRepository.recordHeartbeat(workerId, timestamp);
	 *
	 *     // Get worker status
	 *     const worker = await this.orchestratorRepository.getWorker(workerId);
	 *
	 *     // Emit heartbeat event (periodic health check)
	 *     this.eventBroadcaster.broadcast('b2f:worker:heartbeat', {
	 *       workerId,
	 *       timestamp,
	 *       status: worker.state,
	 *     });
	 *   } catch (error) {
	 *     console.error('[WorkersService] Failed to record heartbeat:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Update worker capacity (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:worker:capacity_changed' event
	 *
	 * @example
	 * ```typescript
	 * async updateWorkerCapacity(workerId: string, capacity: number): Promise<Worker> {
	 *   try {
	 *     const worker = await this.orchestratorRepository.updateWorkerCapacity(workerId, capacity);
	 *
	 *     // Emit event AFTER successful update
	 *     this.eventBroadcaster.broadcast('b2f:worker:capacity_changed', {
	 *       workerId: worker.workerId,
	 *       capacity,
	 *     });
	 *
	 *     return worker;
	 *   } catch (error) {
	 *     console.error('[WorkersService] Failed to update worker capacity:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */

	/**
	 * Delete worker (PLACEHOLDER - not implemented)
	 * When implemented, emit 'b2f:worker:deleted' event
	 *
	 * @example
	 * ```typescript
	 * async deleteWorker(workerId: string): Promise<void> {
	 *   try {
	 *     await this.orchestratorRepository.deleteWorker(workerId);
	 *
	 *     // Emit event AFTER successful deletion
	 *     this.eventBroadcaster.broadcast('b2f:worker:deleted', {
	 *       workerId,
	 *       deletedAt: Date.now(),
	 *     } as any); // Type assertion needed as Worker requires all fields
	 *
	 *   } catch (error) {
	 *     console.error('[WorkersService] Failed to delete worker:', error);
	 *     throw error;
	 *   }
	 * }
	 * ```
	 */
}
