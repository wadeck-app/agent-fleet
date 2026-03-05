import type { Worker, WorkersData } from '@shared/api/workers.contract';

import { workersApi } from './workers.api';

/**
 * ===========================================================================================
 * WORKERS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workers.
 * Responsibilities:
 * - Call API endpoints
 * - Transform data if needed
 * - Handle errors
 *
 * Does NOT contain:
 * - React hooks (in useWorkers)
 * - UI components
 *
 * ===========================================================================================
 */

export class WorkersService {
	/**
	 * Get all workers
	 */
	async getWorkers(): Promise<WorkersData> {
		return workersApi.getWorkers();
	}

	/**
	 * Get a single worker by ID
	 * @param workerId Worker ID
	 */
	async getWorker(workerId: string): Promise<Worker> {
		return workersApi.getWorker(workerId);
	}

	/**
	 * Rename a worker
	 * @param workerId Worker ID
	 * @param name New name for the worker
	 * @param version Current version for optimistic locking (use 1 for first rename)
	 */
	async renameWorker(workerId: string, name: string, version: number): Promise<Worker> {
		return workersApi.updateWorkerName(workerId, name, version);
	}
}

// Export singleton instance
export const workersService = new WorkersService();
