/**
 * Custom hook for system health monitoring
 * Exposes metrics service functionality to components
 */

import { useState, useEffect, useCallback } from 'react';
import { SystemMetrics } from '../../types';
import { MetricsService } from '../api/services/MetricsService';
import { MetricsRepository } from '../api/repositories/MetricsRepository';

const metricsRepository = new MetricsRepository();
const metricsService = new MetricsService(metricsRepository);

export interface UseSystemHealthResult {
  metrics: SystemMetrics | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getCpuStatusColor: (usage: number) => string;
  getMemoryStatusColor: (percentage: number) => string;
  formatBytes: (bytes: number) => string;
  formatPercentage: (value: number) => string;
  calculateSystemHealth: (metrics: SystemMetrics) => {
    status: 'healthy' | 'warning' | 'critical';
    score: number;
  };
}

export function useSystemHealth(): UseSystemHealthResult {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await metricsService.getSystemMetrics();
      setMetrics(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetrics();

    // Poll for updates every 5 seconds
    const interval = setInterval(() => {
      fetchMetrics();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return {
    metrics,
    loading,
    error,
    refetch: fetchMetrics,
    getCpuStatusColor: metricsService.getCpuStatusColor.bind(metricsService),
    getMemoryStatusColor: metricsService.getMemoryStatusColor.bind(metricsService),
    formatBytes: metricsService.formatBytes.bind(metricsService),
    formatPercentage: metricsService.formatPercentage.bind(metricsService),
    calculateSystemHealth: metricsService.calculateSystemHealth.bind(metricsService),
  };
}
