/**
 * Worker business logic and data transformation
 */

import { Worker, WorkerType, WorkerStatus } from '../../../types';
import { WorkerRepository } from '../repositories/WorkerRepository';

export class WorkerService {
  constructor(private repository: WorkerRepository) {}

  async getAllWorkers(): Promise<Worker[]> {
    return this.repository.getAllWorkers();
  }

  async getActiveWorkers(): Promise<Worker[]> {
    const workers = await this.getAllWorkers();
    return workers.filter(worker => worker.status === 'active');
  }

  async getWorkersByType(type: WorkerType): Promise<Worker[]> {
    return this.repository.getWorkersByType(type);
  }

  getWorkerTypeLabel(type: WorkerType): string {
    const labels: Record<WorkerType, string> = {
      [WorkerType.PM]: 'Project Manager',
      [WorkerType.PO]: 'Product Owner',
      [WorkerType.DEV]: 'Developer',
      [WorkerType.REVIEWER]: 'Reviewer',
      [WorkerType.FLOW]: 'Flow Worker'
    };
    return labels[type];
  }

  getWorkerTypeColor(type: WorkerType): string {
    const colors: Record<WorkerType, string> = {
      [WorkerType.PM]: '#8b5cf6',
      [WorkerType.PO]: '#3b82f6',
      [WorkerType.DEV]: '#10b981',
      [WorkerType.REVIEWER]: '#f59e0b',
      [WorkerType.FLOW]: '#06b6d4'
    };
    return colors[type];
  }

  getWorkerStatusLabel(status: WorkerStatus): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  getWorkerStatusColor(status: WorkerStatus): string {
    const colors: Record<WorkerStatus, string> = {
      active: '#10b981',
      idle: '#64748b',
      error: '#ef4444',
      disconnected: '#6b7280'
    };
    return colors[status];
  }

  calculateWorkerHealth(worker: Worker): number {
    // Calculate a health score based on various metrics
    const { metrics, status } = worker;

    if (status === 'error' || status === 'disconnected') {
      return 0;
    }

    const successRateScore = metrics.successRate;
    const cpuScore = Math.max(0, 100 - metrics.cpuUsage);
    const activeScore = status === 'active' ? 100 : 50;

    return Math.round((successRateScore + cpuScore + activeScore) / 3);
  }

  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }
}
