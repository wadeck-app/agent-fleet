/**
 * Worker business logic and data transformation
 */

import { WorkerInfo, WorkerType } from '@/types/domain';
import { WorkerRepository } from '../repositories/WorkerRepository';

export class WorkerService {
  constructor(private repository: WorkerRepository) {}

  async getAllWorkers(): Promise<WorkerInfo[]> {
    const workers = await this.repository.getAllWorkers();
    return this.sortWorkersByType(workers);
  }

  async getActiveWorkers(): Promise<WorkerInfo[]> {
    const workers = await this.getAllWorkers();
    return workers.filter((worker) => worker.taskId !== null);
  }

  async getIdleWorkers(): Promise<WorkerInfo[]> {
    const workers = await this.getAllWorkers();
    return workers.filter((worker) => worker.taskId === null);
  }

  private sortWorkersByType(workers: WorkerInfo[]): WorkerInfo[] {
    const typeOrder = { dev: 0, reviewer: 1, pm: 2, po: 3 };
    return [...workers].sort((a, b) => {
      const typeDiff = typeOrder[a.type] - typeOrder[b.type];
      if (typeDiff !== 0) return typeDiff;
      return new Date(a.connectedAt).getTime() - new Date(b.connectedAt).getTime();
    });
  }

  getWorkerTypeLabel(type: WorkerType): string {
    const labels: Record<WorkerType, string> = {
      [WorkerType.DEV]: 'Developer',
      [WorkerType.REVIEWER]: 'Reviewer',
      [WorkerType.PM]: 'Project Manager',
      [WorkerType.PO]: 'Product Owner',
    };
    return labels[type];
  }

  getWorkerTypeColor(type: WorkerType): string {
    const colors: Record<WorkerType, string> = {
      [WorkerType.DEV]: '#8b5cf6',
      [WorkerType.REVIEWER]: '#f59e0b',
      [WorkerType.PM]: '#3b82f6',
      [WorkerType.PO]: '#10b981',
    };
    return colors[type];
  }

  getWorkerStatusLabel(worker: WorkerInfo): string {
    return worker.taskId ? 'Active' : 'Idle';
  }
}
