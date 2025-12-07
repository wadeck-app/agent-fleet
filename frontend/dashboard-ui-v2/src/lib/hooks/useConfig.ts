/**
 * Custom hook for workspace configuration management
 * Manages theme and app configuration
 */

import { useState, useEffect, useCallback } from 'react';
import { WorkspaceConfig } from '../../types';

const DEFAULT_CONFIG: WorkspaceConfig = {
  orchestratorUrl: 'ws://localhost:8080',
  autoReconnect: true,
  heartbeatInterval: 5000,
  theme: 'light',
  notificationsEnabled: true
};

export interface UseConfigResult {
  config: WorkspaceConfig;
  updateConfig: (newConfig: Partial<WorkspaceConfig>) => void;
  resetConfig: () => void;
}

export function useConfig(): UseConfigResult {
  const [config, setConfig] = useState<WorkspaceConfig>(() => {
    // Load from localStorage if available
    const stored = localStorage.getItem('agent-fleet-config');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  // Apply theme when config changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', config.theme);
  }, [config.theme]);

  // Save to localStorage when config changes
  useEffect(() => {
    localStorage.setItem('agent-fleet-config', JSON.stringify(config));
  }, [config]);

  const updateConfig = useCallback((newConfig: Partial<WorkspaceConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
  }, []);

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  return {
    config,
    updateConfig,
    resetConfig,
  };
}
