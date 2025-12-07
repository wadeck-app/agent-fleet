import { Worker, Task, SystemMetrics, ActivityLogEntry, WorkerType, WorkerStatus, TaskStatus, Priority } from '../types';

// Mock Workers
export const mockWorkers: Worker[] = [
  {
    id: 'worker-flow-001',
    type: WorkerType.FLOW,
    status: 'active' as WorkerStatus,
    currentTask: null, // Will be populated dynamically
    connectedAt: new Date(Date.now() - 3600000).toISOString(),
    lastHeartbeat: new Date(Date.now() - 5000).toISOString(),
    metrics: {
      tasksCompleted: 23,
      tasksInProgress: 1,
      avgTaskDuration: 450,
      successRate: 95.6,
      cpuUsage: 45.2,
      memoryUsage: 512
    }
  },
  {
    id: 'worker-dev-001',
    type: WorkerType.DEV,
    status: 'active' as WorkerStatus,
    currentTask: null,
    connectedAt: new Date(Date.now() - 7200000).toISOString(),
    lastHeartbeat: new Date(Date.now() - 3000).toISOString(),
    metrics: {
      tasksCompleted: 47,
      tasksInProgress: 1,
      avgTaskDuration: 1250,
      successRate: 92.3,
      cpuUsage: 67.8,
      memoryUsage: 1024
    }
  },
  {
    id: 'worker-dev-002',
    type: WorkerType.DEV,
    status: 'idle' as WorkerStatus,
    currentTask: null,
    connectedAt: new Date(Date.now() - 1800000).toISOString(),
    lastHeartbeat: new Date(Date.now() - 2000).toISOString(),
    metrics: {
      tasksCompleted: 12,
      tasksInProgress: 0,
      avgTaskDuration: 980,
      successRate: 91.7,
      cpuUsage: 12.5,
      memoryUsage: 256
    }
  },
  {
    id: 'worker-reviewer-001',
    type: WorkerType.REVIEWER,
    status: 'active' as WorkerStatus,
    currentTask: null,
    connectedAt: new Date(Date.now() - 5400000).toISOString(),
    lastHeartbeat: new Date(Date.now() - 4000).toISOString(),
    metrics: {
      tasksCompleted: 34,
      tasksInProgress: 1,
      avgTaskDuration: 600,
      successRate: 97.1,
      cpuUsage: 34.5,
      memoryUsage: 384
    }
  },
  {
    id: 'worker-pm-001',
    type: WorkerType.PM,
    status: 'idle' as WorkerStatus,
    currentTask: null,
    connectedAt: new Date(Date.now() - 10800000).toISOString(),
    lastHeartbeat: new Date(Date.now() - 8000).toISOString(),
    metrics: {
      tasksCompleted: 56,
      tasksInProgress: 0,
      avgTaskDuration: 320,
      successRate: 98.2,
      cpuUsage: 8.3,
      memoryUsage: 192
    }
  },
  {
    id: 'worker-dev-003',
    type: WorkerType.DEV,
    status: 'error' as WorkerStatus,
    currentTask: null,
    connectedAt: new Date(Date.now() - 900000).toISOString(),
    lastHeartbeat: new Date(Date.now() - 60000).toISOString(),
    metrics: {
      tasksCompleted: 8,
      tasksInProgress: 1,
      avgTaskDuration: 1100,
      successRate: 75.0,
      cpuUsage: 0,
      memoryUsage: 0
    },
    errorMessage: 'Connection timeout - Worker not responding'
  }
];

// Mock Tasks
export const mockTasks: Task[] = [
  {
    id: 'task-001',
    description: 'Implement user authentication flow with JWT tokens',
    status: TaskStatus.IN_PROGRESS,
    priority: 'high' as Priority,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 300000).toISOString(),
    assignedTo: {
      workerId: 'worker-dev-001',
      workerType: WorkerType.DEV
    },
    flowId: 'dev-implementation-flow',
    progress: 65,
    estimatedDuration: 3600
  },
  {
    id: 'task-002',
    description: 'Review and approve database schema changes',
    status: TaskStatus.REVIEW,
    priority: 'high' as Priority,
    createdAt: new Date(Date.now() - 5400000).toISOString(),
    updatedAt: new Date(Date.now() - 120000).toISOString(),
    assignedTo: {
      workerId: 'worker-reviewer-001',
      workerType: WorkerType.REVIEWER
    },
    progress: 80,
    estimatedDuration: 1200
  },
  {
    id: 'task-003',
    description: 'Execute integration tests for payment module',
    status: TaskStatus.IN_PROGRESS,
    priority: 'urgent' as Priority,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 60000).toISOString(),
    assignedTo: {
      workerId: 'worker-flow-001',
      workerType: WorkerType.FLOW
    },
    flowId: 'testing-flow',
    progress: 45,
    estimatedDuration: 900
  },
  {
    id: 'task-004',
    description: 'Fix critical bug in order processing pipeline',
    status: TaskStatus.BLOCKED,
    priority: 'urgent' as Priority,
    createdAt: new Date(Date.now() - 1800000).toISOString(),
    updatedAt: new Date(Date.now() - 600000).toISOString(),
    assignedTo: {
      workerId: 'worker-dev-003',
      workerType: WorkerType.DEV
    },
    progress: 30
  },
  {
    id: 'task-005',
    description: 'Refactor dashboard components for better performance',
    status: TaskStatus.TODO,
    priority: 'medium' as Priority,
    createdAt: new Date(Date.now() - 900000).toISOString(),
    updatedAt: new Date(Date.now() - 900000).toISOString(),
    assignedTo: null
  },
  {
    id: 'task-006',
    description: 'Update API documentation for v2 endpoints',
    status: TaskStatus.TODO,
    priority: 'low' as Priority,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    assignedTo: null
  },
  {
    id: 'task-007',
    description: 'Optimize database queries for reports',
    status: TaskStatus.TODO,
    priority: 'medium' as Priority,
    createdAt: new Date(Date.now() - 10800000).toISOString(),
    updatedAt: new Date(Date.now() - 10800000).toISOString(),
    assignedTo: null
  },
  {
    id: 'task-008',
    description: 'Implement real-time notification system',
    status: TaskStatus.BACKLOG,
    priority: 'low' as Priority,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    assignedTo: null
  },
  {
    id: 'task-009',
    description: 'Security audit of authentication module',
    status: TaskStatus.TESTING,
    priority: 'high' as Priority,
    createdAt: new Date(Date.now() - 14400000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    assignedTo: {
      workerId: 'worker-dev-002',
      workerType: WorkerType.DEV
    },
    progress: 90,
    estimatedDuration: 1800
  },
  {
    id: 'task-010',
    description: 'Deploy hotfix for production login issue',
    status: TaskStatus.APPROVED,
    priority: 'urgent' as Priority,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: new Date(Date.now() - 180000).toISOString(),
    assignedTo: {
      workerId: 'worker-pm-001',
      workerType: WorkerType.PM
    }
  },
  {
    id: 'task-011',
    description: 'Add unit tests for payment gateway integration',
    status: TaskStatus.TODO,
    priority: 'medium' as Priority,
    createdAt: new Date(Date.now() - 21600000).toISOString(),
    updatedAt: new Date(Date.now() - 21600000).toISOString(),
    assignedTo: null
  },
  {
    id: 'task-012',
    description: 'Migrate legacy user data to new schema',
    status: TaskStatus.BACKLOG,
    priority: 'low' as Priority,
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    assignedTo: null
  }
];

// Connect tasks to workers
mockWorkers[0].currentTask = mockTasks[2]; // worker-flow-001 doing task-003
mockWorkers[1].currentTask = mockTasks[0]; // worker-dev-001 doing task-001
mockWorkers[3].currentTask = mockTasks[1]; // worker-reviewer-001 doing task-002
mockWorkers[5].currentTask = mockTasks[3]; // worker-dev-003 doing task-004

// Mock System Metrics
export const mockSystemMetrics: SystemMetrics = {
  timestamp: new Date().toISOString(),
  cpu: {
    usage: 42.5,
    cores: 8
  },
  memory: {
    used: 2368,
    total: 8192,
    percentage: 28.9
  },
  network: {
    bytesIn: 1250000,
    bytesOut: 980000
  },
  activeConnections: 6
};

// Mock Activity Log
export const mockActivityLog: ActivityLogEntry[] = [
  {
    id: 'log-001',
    timestamp: new Date(Date.now() - 30000).toISOString(),
    type: 'task',
    severity: 'success',
    message: 'Task "Execute integration tests" started by worker-flow-001',
    details: { taskId: 'task-003', workerId: 'worker-flow-001' }
  },
  {
    id: 'log-002',
    timestamp: new Date(Date.now() - 120000).toISOString(),
    type: 'worker',
    severity: 'info',
    message: 'Worker worker-dev-002 completed task successfully',
    details: { workerId: 'worker-dev-002', duration: 1250 }
  },
  {
    id: 'log-003',
    timestamp: new Date(Date.now() - 180000).toISOString(),
    type: 'error',
    severity: 'error',
    message: 'Worker worker-dev-003 connection timeout',
    details: { workerId: 'worker-dev-003', error: 'Connection timeout - Worker not responding' }
  },
  {
    id: 'log-004',
    timestamp: new Date(Date.now() - 300000).toISOString(),
    type: 'task',
    severity: 'info',
    message: 'New task "Implement user authentication" assigned to worker-dev-001',
    details: { taskId: 'task-001', workerId: 'worker-dev-001' }
  },
  {
    id: 'log-005',
    timestamp: new Date(Date.now() - 420000).toISOString(),
    type: 'system',
    severity: 'warning',
    message: 'High CPU usage detected (87.3%)',
    details: { cpuUsage: 87.3, threshold: 80 }
  },
  {
    id: 'log-006',
    timestamp: new Date(Date.now() - 600000).toISOString(),
    type: 'task',
    severity: 'success',
    message: 'Task "Security audit" completed successfully',
    details: { taskId: 'task-009', duration: 1820 }
  },
  {
    id: 'log-007',
    timestamp: new Date(Date.now() - 900000).toISOString(),
    type: 'worker',
    severity: 'success',
    message: 'New worker worker-dev-003 connected',
    details: { workerId: 'worker-dev-003', type: 'dev' }
  },
  {
    id: 'log-008',
    timestamp: new Date(Date.now() - 1200000).toISOString(),
    type: 'task',
    severity: 'warning',
    message: 'Task "Fix order processing bug" marked as blocked',
    details: { taskId: 'task-004', reason: 'Waiting for dependency' }
  },
  {
    id: 'log-009',
    timestamp: new Date(Date.now() - 1800000).toISOString(),
    type: 'system',
    severity: 'info',
    message: 'System backup completed successfully',
    details: { backupSize: '1.2GB', duration: 45 }
  },
  {
    id: 'log-010',
    timestamp: new Date(Date.now() - 2400000).toISOString(),
    type: 'task',
    severity: 'success',
    message: 'Review completed for "Database schema changes"',
    details: { taskId: 'task-002', reviewer: 'worker-reviewer-001' }
  }
];

// Available workflows
export const mockWorkflows = [
  { id: 'dev-implementation-flow', name: 'Development Implementation', description: 'Standard development workflow with testing' },
  { id: 'testing-flow', name: 'Testing Workflow', description: 'Run comprehensive test suite' },
  { id: 'code-review-flow', name: 'Code Review', description: 'Automated code review and quality checks' },
  { id: 'deployment-flow', name: 'Deployment Pipeline', description: 'Build, test, and deploy to production' },
  { id: 'hotfix-flow', name: 'Hotfix Workflow', description: 'Fast-track critical bug fixes' }
];
