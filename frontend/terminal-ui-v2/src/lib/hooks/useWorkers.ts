/**
 * useWorkers - Custom hook for worker data
 * Exposes worker service functionality to React components
 */

import { useState, useEffect, useCallback } from 'react';
import { Worker } from '@/types/domain';
import { workerService } from '../api/services/WorkerService';

export function useWorkers() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Fetch workers on mount
  useEffect(() => {
    let isMounted = true;

    const fetchWorkers = async () => {
      try {
        setLoading(true);
        const data = await workerService.getAllWorkers();
        if (isMounted) {
          setWorkers(data);
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

    fetchWorkers();

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to worker updates
  useEffect(() => {
    const unsubscribe = workerService.subscribeToWorkers((updatedWorkers) => {
      setWorkers(updatedWorkers);
    });

    return unsubscribe;
  }, []);

  // Get worker by ID
  const getWorkerById = useCallback(
    (id: string) => {
      return workers.find((w) => w.id === id);
    },
    [workers]
  );

  // Get workers by status
  const getWorkersByStatus = useCallback(
    (status: Worker['status']) => {
      return workers.filter((w) => w.status === status);
    },
    [workers]
  );

  return {
    workers,
    loading,
    error,
    getWorkerById,
    getWorkersByStatus,
    // Service helper methods
    getWorkerTypeLabel: workerService.getWorkerTypeLabel,
    getWorkerTypeColor: workerService.getWorkerTypeColor,
    getWorkerStatusLabel: workerService.getWorkerStatusLabel,
    getWorkerStatusColor: workerService.getWorkerStatusColor,
    formatUptime: workerService.formatUptime,
  };
}
