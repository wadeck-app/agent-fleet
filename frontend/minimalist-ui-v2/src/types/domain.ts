/**
 * Domain types for Agent Fleet orchestrator
 * Mirrors backend types from src/shared/types.ts
 */

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
  CANCELLED = 'cancelled',
}

export enum WorkerType {
  PM = 'pm',
  PO = 'po',
  DEV = 'dev',
  REVIEWER = 'reviewer',
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface TaskComment {
  timestamp: string;
  author: string;
  content: string;
}

export interface TaskHistoryEntry {
  timestamp: string;
  event: string;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  updatedAt: string;
  assignedTo: {
    workerId: string;
    workerType: WorkerType;
  } | null;
  comments: TaskComment[];
  metadata: Record<string, unknown>;
  history: TaskHistoryEntry[];
  flowId?: string;
  flowInputs?: Record<string, unknown>;
  flowResult?: {
    status: 'completed' | 'failed';
    outputs?: Record<string, unknown>;
    error?: string;
    trace?: unknown;
  };
  workspacePath?: string;
}

export interface WorkerInfo {
  id: string;
  type: WorkerType;
  taskId: string | null;
  connectedAt: string;
}

export interface FlowDefinition {
  id: string;
  name: string;
  description: string;
  inputs: Record<string, string>;
}

export interface OrchestratorStats {
  restPort: number;
  wsPort: number;
  workers: number;
  workersList: WorkerInfo[];
  tasks: {
    total: number;
    byStatus: Record<string, number>;
  };
}

export interface Workspace {
  id: string;
  path: string;
  mode: 'isolated' | 'shared' | 'manual';
  createdAt: string;
  lastUsedAt: string;
  usageCount: number;
}
