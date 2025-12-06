export interface Worker {
  id: string;
  name: string;
  type: 'flow' | 'dev' | 'test';
  status: 'active' | 'idle' | 'error' | 'offline';
  connectedAt: Date;
  lastActivity: Date;
  currentTask?: string;
  stats: {
    tasksCompleted: number;
    tasksInProgress: number;
    uptime: number;
  };
}

export interface LogEntry {
  id: string;
  workerId: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  name: string;
  type: 'flow' | 'command';
  status: 'queued' | 'running' | 'completed' | 'failed';
  assignedTo?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  config: string; // YAML/JSON
}

export interface WorkspaceConfig {
  orchestratorUrl: string;
  autoReconnect: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  maxLogEntries: number;
  theme: 'dark' | 'light';
}
