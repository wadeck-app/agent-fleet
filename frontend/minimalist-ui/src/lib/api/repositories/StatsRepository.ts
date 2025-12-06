/**
 * Stats data access layer
 * Handles orchestrator statistics API calls
 */

import { OrchestratorStats } from '@/types/domain';
import { mockStats } from '@/lib/mock/mockData';

export class StatsRepository {
  async getStats(): Promise<OrchestratorStats> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<OrchestratorStats>('/stats');
    return Promise.resolve(mockStats);
  }

  async getHealth(): Promise<{ status: string }> {
    return Promise.resolve({ status: 'healthy' });
  }
}
