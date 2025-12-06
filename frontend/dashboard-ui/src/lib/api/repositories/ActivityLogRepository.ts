/**
 * Activity Log data access layer
 * Handles all activity log related API calls
 */

import { ActivityLogEntry } from '../../../types';
import { mockActivityLog } from '../../../data/mockData';

// In-memory activity log store for mock mode
let activityLog = [...mockActivityLog];

export class ActivityLogRepository {
  async getAllEntries(): Promise<ActivityLogEntry[]> {
    // Using mock data for development
    // To use real API, replace with: return apiClient.get<ActivityLogEntry[]>('/activity-log');
    return Promise.resolve([...activityLog]);
  }

  async addEntry(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): Promise<ActivityLogEntry> {
    const newEntry: ActivityLogEntry = {
      ...entry,
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    activityLog = [newEntry, ...activityLog];
    return Promise.resolve(newEntry);
  }

  async getEntriesByType(type: ActivityLogEntry['type']): Promise<ActivityLogEntry[]> {
    return Promise.resolve(activityLog.filter(entry => entry.type === type));
  }

  async getEntriesBySeverity(severity: ActivityLogEntry['severity']): Promise<ActivityLogEntry[]> {
    return Promise.resolve(activityLog.filter(entry => entry.severity === severity));
  }
}
