/**
 * Metrics data access layer
 * Handles all metrics and system health related API calls
 */

import { SystemMetrics } from '../../../types';
import { mockSystemMetrics } from '../../../data/mockData';

// In-memory metrics store for mock mode
let currentMetrics = { ...mockSystemMetrics };

export class MetricsRepository {
  async getSystemMetrics(): Promise<SystemMetrics> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<SystemMetrics>('/metrics/system');

    // Simulate real-time updates
    currentMetrics = {
      ...currentMetrics,
      timestamp: new Date().toISOString(),
      cpu: {
        ...currentMetrics.cpu,
        usage: Math.max(10, Math.min(95, currentMetrics.cpu.usage + (Math.random() - 0.5) * 10))
      },
      memory: {
        ...currentMetrics.memory,
        percentage: Math.max(10, Math.min(95, currentMetrics.memory.percentage + (Math.random() - 0.5) * 5))
      }
    };

    return Promise.resolve({ ...currentMetrics });
  }

  async getHistoricalMetrics(_from: string, _to: string): Promise<SystemMetrics[]> {
    // Mock historical data
    return Promise.resolve([currentMetrics]);
  }
}
