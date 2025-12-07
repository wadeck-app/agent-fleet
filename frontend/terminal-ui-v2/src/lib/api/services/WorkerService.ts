/**
 * WorkerService - Business logic and data transformation for Workers
 * Contains helper methods for formatting and filtering worker data
 */

import { Worker } from '@/types/domain';
import { WorkerRepository, workerRepository } from '../repositories/WorkerRepository';

export class WorkerService {
  constructor(private repository: WorkerRepository = workerRepository) {}

  /**
   * Get all workers
   */
  async getAllWorkers(): Promise<Worker[]> {
    return this.repository.getAllWorkers();
  }

  /**
   * Get a single worker by ID
   */
  async getWorkerById(id: string): Promise<Worker | undefined> {
    return this.repository.getWorkerById(id);
  }

  /**
   * Subscribe to worker updates
   */
  subscribeToWorkers(callback: (workers: Worker[]) => void): () => void {
    return this.repository.subscribeToWorkers(callback);
  }

  /**
   * Get workers by status
   */
  async getWorkersByStatus(status: Worker['status']): Promise<Worker[]> {
    const workers = await this.getAllWorkers();
    return workers.filter((worker) => worker.status === status);
  }

  /**
   * Get worker statistics
   */
  async getWorkerStats(): Promise<{
    total: number;
    active: number;
    idle: number;
    error: number;
    offline: number;
  }> {
    const workers = await this.getAllWorkers();
    return {
      total: workers.length,
      active: workers.filter((w) => w.status === 'active').length,
      idle: workers.filter((w) => w.status === 'idle').length,
      error: workers.filter((w) => w.status === 'error').length,
      offline: workers.filter((w) => w.status === 'offline').length,
    };
  }

  /**
   * Get human-readable worker type label
   */
  getWorkerTypeLabel(type: Worker['type']): string {
    const labels: Record<Worker['type'], string> = {
      flow: 'Flow',
      dev: 'Development',
      test: 'Test',
    };
    return labels[type];
  }

  /**
   * Get worker type color for UI
   */
  getWorkerTypeColor(type: Worker['type']): string {
    const colors: Record<Worker['type'], string> = {
      flow: 'blue',
      dev: 'green',
      test: 'purple',
    };
    return colors[type];
  }

  /**
   * Get human-readable worker status label
   */
  getWorkerStatusLabel(status: Worker['status']): string {
    const labels: Record<Worker['status'], string> = {
      active: 'Active',
      idle: 'Idle',
      error: 'Error',
      offline: 'Offline',
    };
    return labels[status];
  }

  /**
   * Get worker status color for UI
   */
  getWorkerStatusColor(status: Worker['status']): string {
    const colors: Record<Worker['status'], string> = {
      active: 'success',
      idle: 'info',
      error: 'error',
      offline: 'gray',
    };
    return colors[status];
  }

  /**
   * Format uptime for display
   */
  formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}

export const workerService = new WorkerService();
