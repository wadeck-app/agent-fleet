/**
 * Metrics business logic and data transformation
 */

import { SystemMetrics } from '../../../types';
import { MetricsRepository } from '../repositories/MetricsRepository';

export class MetricsService {
  constructor(private repository: MetricsRepository) {}

  async getSystemMetrics(): Promise<SystemMetrics> {
    return this.repository.getSystemMetrics();
  }

  getCpuStatusColor(usage: number): string {
    if (usage >= 80) return '#ef4444'; // High usage - red
    if (usage >= 60) return '#f59e0b'; // Medium usage - yellow
    return '#10b981'; // Low usage - green
  }

  getMemoryStatusColor(percentage: number): string {
    if (percentage >= 80) return '#ef4444'; // High usage - red
    if (percentage >= 60) return '#f59e0b'; // Medium usage - yellow
    return '#10b981'; // Low usage - green
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  formatPercentage(value: number): string {
    return `${Math.round(value * 10) / 10}%`;
  }

  calculateSystemHealth(metrics: SystemMetrics): {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
  } {
    const cpuScore = metrics.cpu.usage <= 70 ? 100 : Math.max(0, 100 - (metrics.cpu.usage - 70) * 3);
    const memoryScore = metrics.memory.percentage <= 70 ? 100 : Math.max(0, 100 - (metrics.memory.percentage - 70) * 3);

    const score = Math.round((cpuScore + memoryScore) / 2);

    let status: 'healthy' | 'warning' | 'critical';
    if (score >= 70) status = 'healthy';
    else if (score >= 40) status = 'warning';
    else status = 'critical';

    return { status, score };
  }
}
