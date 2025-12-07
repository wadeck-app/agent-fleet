/**
 * Activity Log business logic and data transformation
 */

import { ActivityLogEntry } from '../../../types';
import { ActivityLogRepository } from '../repositories/ActivityLogRepository';

export class ActivityLogService {
  constructor(private repository: ActivityLogRepository) {}

  async getAllEntries(): Promise<ActivityLogEntry[]> {
    return this.repository.getAllEntries();
  }

  async addEntry(entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): Promise<ActivityLogEntry> {
    return this.repository.addEntry(entry);
  }

  getSeverityColor(severity: ActivityLogEntry['severity']): string {
    const colors: Record<ActivityLogEntry['severity'], string> = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };
    return colors[severity];
  }

  getSeverityIcon(severity: ActivityLogEntry['severity']): string {
    const icons: Record<ActivityLogEntry['severity'], string> = {
      info: 'ℹ️',
      success: '✓',
      warning: '⚠️',
      error: '✗'
    };
    return icons[severity];
  }

  getTypeLabel(type: ActivityLogEntry['type']): string {
    const labels: Record<ActivityLogEntry['type'], string> = {
      task: 'Task',
      worker: 'Worker',
      system: 'System',
      error: 'Error'
    };
    return labels[type];
  }

  formatTimestamp(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffDay > 0) return `${diffDay}d ago`;
    if (diffHour > 0) return `${diffHour}h ago`;
    if (diffMin > 0) return `${diffMin}m ago`;
    return 'Just now';
  }
}
