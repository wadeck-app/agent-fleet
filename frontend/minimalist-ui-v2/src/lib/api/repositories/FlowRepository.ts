/**
 * Flow data access layer
 * Handles all flow-related API calls
 */

import { FlowDefinition } from '@/types/domain';
import { mockFlows } from '@/lib/mock/mockData';

export class FlowRepository {
  async getAllFlows(): Promise<FlowDefinition[]> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<FlowDefinition[]>('/flows');
    return Promise.resolve(mockFlows);
  }

  async getFlowById(id: string): Promise<FlowDefinition> {
    const flow = mockFlows.find(f => f.id === id);
    if (!flow) throw new Error(`Flow ${id} not found`);
    return Promise.resolve(flow);
  }
}
