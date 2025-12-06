/**
 * WorkerRepository - Data access layer for Worker entities
 * Abstracts the data source (MockDataService or real API)
 */

import { Worker } from '@/types/domain';
import { mockDataService } from '@/mock/MockDataService';

export class WorkerRepository {
  /**
   * Get all workers
   */
  async getAllWorkers(): Promise<Worker[]> {
    // Currently using MockDataService
    // In production, this would call: apiClient.get<Worker[]>('/workers')
    return Promise.resolve(mockDataService.getWorkers());
  }

  /**
   * Get a single worker by ID
   */
  async getWorkerById(id: string): Promise<Worker | undefined> {
    // Currently using MockDataService
    // In production: apiClient.get<Worker>(`/workers/${id}`)
    return Promise.resolve(mockDataService.getWorker(id));
  }

  /**
   * Subscribe to worker updates
   * Returns an unsubscribe function
   */
  subscribeToWorkers(callback: (workers: Worker[]) => void): () => void {
    // Currently using MockDataService's subscription mechanism
    // In production, this might use WebSocket or SSE
    return mockDataService.subscribeToWorkers(callback);
  }
}

export const workerRepository = new WorkerRepository();
