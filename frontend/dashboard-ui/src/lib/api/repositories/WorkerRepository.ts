/**
 * Worker data access layer
 * Handles all worker-related API calls
 */

import { Worker } from '../../../types';
import { mockWorkers } from '../../../data/mockData';

// In-memory worker store for mock mode
let workers = [...mockWorkers];

export class WorkerRepository {
  async getAllWorkers(): Promise<Worker[]> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<Worker[]>('/workers');
    return Promise.resolve([...workers]);
  }

  async getWorkerById(id: string): Promise<Worker> {
    const worker = workers.find(w => w.id === id);
    if (!worker) throw new Error(`Worker ${id} not found`);
    return Promise.resolve(worker);
  }

  async getWorkersByStatus(status: string): Promise<Worker[]> {
    return Promise.resolve(workers.filter(worker => worker.status === status));
  }

  async getWorkersByType(type: string): Promise<Worker[]> {
    return Promise.resolve(workers.filter(worker => worker.type === type));
  }

  async updateWorker(id: string, data: Partial<Worker>): Promise<Worker> {
    const index = workers.findIndex(w => w.id === id);
    if (index === -1) throw new Error(`Worker ${id} not found`);

    workers[index] = { ...workers[index], ...data };
    return Promise.resolve(workers[index]);
  }
}
