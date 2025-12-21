import type { WorkersData, Worker } from '@app/shared';
import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';

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
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (in repository)
 *
 * ===========================================================================================
 */

export class WorkersService {
	constructor(private readonly orchestratorRepository: OrchestratorRepository) {}

	/**
	 * Get workers data (transformed from orchestrator stats)
	 */
	async getWorkersData(): Promise<WorkersData> {
		try {
			const stats = await this.orchestratorRepository.getStats();

			// Transform workers list
			// Note: All workers in the list are connected (disconnected workers are removed)
			const workers: Worker[] = stats.workersList.map(w => ({
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
}
