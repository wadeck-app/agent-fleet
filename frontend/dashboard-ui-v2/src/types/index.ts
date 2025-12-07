// Type definitions matching the Agent Fleet backend

export enum TaskStatus {
  BACKLOG = 'backlog',
  REFINING = 'refining',
  REFINED = 'refined',
  PRIORITIZING = 'prioritizing',
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  TESTING = 'testing',
  REVIEW = 'review',
  REVIEWING = 'reviewing',
  CHANGES_REQUESTED = 'changes_requested',
  APPROVED = 'approved',
  MERGED = 'merged',
  BLOCKED = 'blocked',
  CANCELLED = 'cancelled'
}

export enum WorkerType {
  PM = 'pm',
  PO = 'po',
  DEV = 'dev',
  REVIEWER = 'reviewer',
  FLOW = 'flow'
}

export type WorkerStatus = 'active' | 'idle' | 'error' | 'disconnected';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface WorkerMetrics {
  tasksCompleted: number;
  tasksInProgress: number;
  avgTaskDuration: number;
  successRate: number;
  cpuUsage: number;
  memoryUsage: number;
}

export interface Worker {
  id: string;
  type: WorkerType;
  status: WorkerStatus;
  currentTask: Task | null;
  connectedAt: string;
  lastHeartbeat: string;
  metrics: WorkerMetrics;
  errorMessage?: string;
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  assignedTo: {
    workerId: string;
    workerType: WorkerType;
  } | null;
  flowId?: string;
  workspacePath?: string;
  progress?: number;
  estimatedDuration?: number;
}

export interface SystemMetrics {
  timestamp: string;
  cpu: {
    usage: number;
    cores: number;
  };
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
  };
  activeConnections: number;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: 'task' | 'worker' | 'system' | 'error';
  severity: 'info' | 'warning' | 'error' | 'success';
  message: string;
  details?: Record<string, any>;
}

export interface WorkspaceConfig {
  orchestratorUrl: string;
  autoReconnect: boolean;
  heartbeatInterval: number;
  theme: 'light' | 'dark';
  notificationsEnabled: boolean;
}

export interface DashboardState {
  workers: Worker[];
  tasks: Task[];
  systemMetrics: SystemMetrics;
  activityLog: ActivityLogEntry[];
  config: WorkspaceConfig;
}
