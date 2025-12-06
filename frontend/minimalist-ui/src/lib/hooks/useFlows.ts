/**
 * Custom hook for flow management
 * Exposes flow repository functionality to components
 */

import { useState, useEffect, useCallback } from 'react';
import { FlowDefinition } from '@/types/domain';
import { FlowRepository } from '../api/repositories/FlowRepository';

const flowRepository = new FlowRepository();

export interface UseFlowsResult {
  flows: FlowDefinition[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFlows(): UseFlowsResult {
  const [flows, setFlows] = useState<FlowDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await flowRepository.getAllFlows();
      setFlows(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFlows();
  }, [fetchFlows]);

  return {
    flows,
    loading,
    error,
    refetch: fetchFlows,
  };
}
