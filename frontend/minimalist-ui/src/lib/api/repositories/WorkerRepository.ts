/**
 * Worker data access layer
 * Handles all worker-related API calls
 */

import { WorkerInfo } from '@/types/domain';
import { mockWorkers } from '@/lib/mock/mockData';

export class WorkerRepository {
  async getAllWorkers(): Promise<WorkerInfo[]> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<WorkerInfo[]>('/workers');
    return Promise.resolve(mockWorkers);
  }
}
