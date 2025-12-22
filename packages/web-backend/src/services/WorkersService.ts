import type { Worker, WorkersData } from '@app/shared';

import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

/**
 * ===========================================================================================
 * WORKERS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workers data.
 * Responsibilities:
 * - Transform orchestrator stats into workers DTO
 * - Calculate worker states and statistics
 * - Enrich worker data with computed fields
 * - Emit real-time events for worker state changes
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (in repository)
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 *
 * Future CRUD Operations (when implemented):
 * - createWorker() → emit 'worker:created'
 * - updateWorker() → emit 'worker:updated'
 * - deleteWorker() → emit 'worker:deleted'
 * - updateWorkerStatus() → emit 'worker:status_changed'
 * - recordHeartbeat() → emit 'worker:heartbeat'
 * - updateWorkerCapacity() → emit 'worker:capacity_changed'
 *
 * ===========================================================================================
 */

export class WorkersService {
	constructor(
		private readonly orchestratorRepository: OrchestratorRepository,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Get workers data (transformed from orchestrator stats)
	 */
	async getWorkersData(): Promise<WorkersData> {
		try {
			const stats = await this.orchestratorRepository.getStats();

			// Transform workers list
			// Note: All workers in the list are connected (disconnected workers are removed)
			const workers: Worker[] = stats.workersList.map((w: any) => ({
				workerId: w.id,
				type: w.type,
				connected: true, // Workers in the list are connected
				taskId: w.taskId ?? undefined, // Convert null to undefined
				state: w.taskId ? 'busy' : 'idle',
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
		} catch (error) {
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

	// ===========================================================================================
	// CRUD METHODS (TO BE IMPLEMENTED)
	// ===========================================================================================
	// When CRUD operations are implemented, use these as templates for event emission

	/**
	 * Create a new worker (PLACEHOLDER - not implemented)
	 * When implemented, emit 'worker:created' event
	 *
	 * @example
	 * ```typescript
	 * async createWorker(data: CreateWorkerDto): Promise<Worker> {
	 *   try {
	 *     const worker = await this.orchestratorRepository.createWorker(data);
	 *
	 *     // Emit event AFTER successful creation
	 *     this.eventBroadcaster.broadcast('worker:created', worker);
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
	 * When implemented, emit 'worker:status_changed' event
	 *
	 * @example
	 * ```typescript
	 * async updateWorkerStatus(workerId: string, status: string): Promise<Worker> {
	 *   try {
	 *     const worker = await this.orchestratorRepository.updateWorkerStatus(workerId, status);
	 *
	 *     // Emit event AFTER successful update
	 *     this.eventBroadcaster.broadcast('worker:status_changed', {
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
	 * When implemented, emit 'worker:heartbeat' event
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
	 *     this.eventBroadcaster.broadcast('worker:heartbeat', {
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
	 * When implemented, emit 'worker:capacity_changed' event
	 *
	 * @example
	 * ```typescript
	 * async updateWorkerCapacity(workerId: string, capacity: number): Promise<Worker> {
	 *   try {
	 *     const worker = await this.orchestratorRepository.updateWorkerCapacity(workerId, capacity);
	 *
	 *     // Emit event AFTER successful update
	 *     this.eventBroadcaster.broadcast('worker:capacity_changed', {
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
	 * When implemented, emit 'worker:deleted' event
	 *
	 * @example
	 * ```typescript
	 * async deleteWorker(workerId: string): Promise<void> {
	 *   try {
	 *     await this.orchestratorRepository.deleteWorker(workerId);
	 *
	 *     // Emit event AFTER successful deletion
	 *     this.eventBroadcaster.broadcast('worker:deleted', {
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
