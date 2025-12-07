/**
 * useLogs - Custom hook for log data
 * Exposes log service functionality to React components
 */

import { useState, useEffect, useCallback } from 'react';
import { LogEntry } from '@/types/domain';
import { logService } from '../api/services/LogService';

export function useLogs(workerId?: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch initial logs
  useEffect(() => {
    let isMounted = true;

    const fetchLogs = async () => {
      try {
        setLoading(true);
        const data = await logService.getLogs(workerId);
        if (isMounted) {
          setLogs(data);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err as Error);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchLogs();

    return () => {
      isMounted = false;
    };
  }, [workerId]);

  // Subscribe to new log entries
  useEffect(() => {
    const unsubscribe = logService.subscribeToLogs((newLog) => {
      setLogs((prev) => {
        // Filter by workerId if specified
        if (workerId && newLog.workerId !== workerId) {
          return prev;
        }
        return [...prev, newLog];
      });
    });

    return unsubscribe;
  }, [workerId]);

  // Filter logs by search term
  const filterLogs = useCallback(
    (searchTerm: string) => {
      return logService.filterLogs(logs, searchTerm);
    },
    [logs]
  );

  // Get logs for terminal display
  const getTerminalLines = useCallback(() => {
    return logService.transformToTerminalLines(logs);
  }, [logs]);

  // Clear logs
  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return {
    logs,
    loading,
    error,
    filterLogs,
    getTerminalLines,
    clearLogs,
    // Service helper methods
    formatTimestamp: logService.formatTimestamp,
    getLevelSymbol: logService.getLevelSymbol,
    getLevelColor: logService.getLevelColor,
  };
}
