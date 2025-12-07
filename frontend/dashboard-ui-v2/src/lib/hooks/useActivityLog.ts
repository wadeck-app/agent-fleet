/**
 * Custom hook for activity log management
 * Exposes activity log service functionality to components
 */

import { useState, useEffect, useCallback } from 'react';
import { ActivityLogEntry } from '../../types';
import { ActivityLogService } from '../api/services/ActivityLogService';
import { ActivityLogRepository } from '../api/repositories/ActivityLogRepository';

const activityLogRepository = new ActivityLogRepository();
const activityLogService = new ActivityLogService(activityLogRepository);

export interface UseActivityLogResult {
  entries: ActivityLogEntry[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addEntry: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>) => Promise<ActivityLogEntry>;
  getSeverityColor: (severity: ActivityLogEntry['severity']) => string;
  getSeverityIcon: (severity: ActivityLogEntry['severity']) => string;
  getTypeLabel: (type: ActivityLogEntry['type']) => string;
  formatTimestamp: (timestamp: string) => string;
}

export function useActivityLog(): UseActivityLogResult {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await activityLogService.getAllEntries();
      setEntries(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const addEntry = useCallback(
    async (entry: Omit<ActivityLogEntry, 'id' | 'timestamp'>): Promise<ActivityLogEntry> => {
      const newEntry = await activityLogService.addEntry(entry);
      await fetchEntries();
      return newEntry;
    },
    [fetchEntries]
  );

  return {
    entries,
    loading,
    error,
    refetch: fetchEntries,
    addEntry,
    getSeverityColor: activityLogService.getSeverityColor.bind(activityLogService),
    getSeverityIcon: activityLogService.getSeverityIcon.bind(activityLogService),
    getTypeLabel: activityLogService.getTypeLabel.bind(activityLogService),
    formatTimestamp: activityLogService.formatTimestamp.bind(activityLogService),
  };
}
