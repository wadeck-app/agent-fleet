/**
 * LogRepository - Data access layer for LogEntry entities
 * Abstracts the data source (MockDataService or real API)
 */

import { LogEntry } from '@/types/domain';
import { mockDataService } from '@/mock/MockDataService';

export class LogRepository {
  /**
   * Get all logs, optionally filtered by worker ID
   */
  async getLogs(workerId?: string): Promise<LogEntry[]> {
    // Currently using MockDataService
    // In production: apiClient.get<LogEntry[]>('/logs', { params: { workerId } })
    return Promise.resolve(mockDataService.getLogs(workerId));
  }

  /**
   * Subscribe to new log entries
   * Returns an unsubscribe function
   */
  subscribeToLogs(callback: (log: LogEntry) => void): () => void {
    // Currently using MockDataService's subscription mechanism
    // In production, this might use WebSocket or SSE
    return mockDataService.subscribeToLogs(callback);
  }
}

export const logRepository = new LogRepository();
