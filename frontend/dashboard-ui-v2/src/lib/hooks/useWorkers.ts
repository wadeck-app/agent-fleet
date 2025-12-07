/**
 * Custom hook for worker management
 * Exposes worker service functionality to components
 */

import { useState, useEffect, useCallback } from 'react';
import { Worker, WorkerType, WorkerStatus } from '../../types';
import { WorkerService } from '../api/services/WorkerService';
import { WorkerRepository } from '../api/repositories/WorkerRepository';

const workerRepository = new WorkerRepository();
const workerService = new WorkerService(workerRepository);

export interface UseWorkersResult {
  workers: Worker[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getWorkerTypeLabel: (type: WorkerType) => string;
  getWorkerTypeColor: (type: WorkerType) => string;
  getWorkerStatusLabel: (status: WorkerStatus) => string;
  getWorkerStatusColor: (status: WorkerStatus) => string;
  calculateWorkerHealth: (worker: Worker) => number;
  formatDuration: (seconds: number) => string;
}

export function useWorkers(): UseWorkersResult {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await workerService.getAllWorkers();
      setWorkers(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkers();

    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      fetchWorkers();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchWorkers]);

  return {
    workers,
    loading,
    error,
    refetch: fetchWorkers,
    getWorkerTypeLabel: workerService.getWorkerTypeLabel.bind(workerService),
    getWorkerTypeColor: workerService.getWorkerTypeColor.bind(workerService),
    getWorkerStatusLabel: workerService.getWorkerStatusLabel.bind(workerService),
    getWorkerStatusColor: workerService.getWorkerStatusColor.bind(workerService),
    calculateWorkerHealth: workerService.calculateWorkerHealth.bind(workerService),
    formatDuration: workerService.formatDuration.bind(workerService),
  };
}
