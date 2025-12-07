/**
 * Mock data for development and testing
 * Provides realistic sample data for the UI
 */

import { Task, TaskStatus, WorkerInfo, WorkerType, FlowDefinition } from '@/types/domain';

export const mockWorkers: WorkerInfo[] = [
  {
    id: 'worker-dev-001',
    type: WorkerType.DEV,
    taskId: 'task-123',
    connectedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'worker-dev-002',
    type: WorkerType.DEV,
    taskId: null,
    connectedAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'worker-reviewer-001',
    type: WorkerType.REVIEWER,
    taskId: 'task-456',
    connectedAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'worker-pm-001',
    type: WorkerType.PM,
    taskId: null,
    connectedAt: new Date(Date.now() - 5400000).toISOString(),
  },
];

export const mockTasks: Task[] = [
  {
    id: 'task-123',
    description: 'Implement user authentication with JWT tokens and refresh mechanism',
    status: TaskStatus.IN_PROGRESS,
    priority: 'high',
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    assignedTo: {
      workerId: 'worker-dev-001',
      workerType: WorkerType.DEV,
    },
    comments: [],
    metadata: {},
    history: [],
    flowId: 'feature-development',
  },
  {
    id: 'task-456',
    description: 'Review PR #234: Add dark mode support to dashboard',
    status: TaskStatus.REVIEWING,
    priority: 'medium',
    createdAt: new Date(Date.now() - 43200000).toISOString(),
    updatedAt: new Date(Date.now() - 900000).toISOString(),
    assignedTo: {
      workerId: 'worker-reviewer-001',
      workerType: WorkerType.REVIEWER,
    },
    comments: [],
    metadata: {},
    history: [],
  },
  {
    id: 'task-789',
    description: 'Fix critical bug in payment processing flow',
    status: TaskStatus.TODO,
    priority: 'urgent',
    createdAt: new Date(Date.now() - 21600000).toISOString(),
    updatedAt: new Date(Date.now() - 21600000).toISOString(),
    assignedTo: null,
    comments: [],
    metadata: {},
    history: [],
  },
  {
    id: 'task-101',
    description: 'Update API documentation for v2.0 endpoints',
    status: TaskStatus.BACKLOG,
    priority: 'low',
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    updatedAt: new Date(Date.now() - 172800000).toISOString(),
    assignedTo: null,
    comments: [],
    metadata: {},
    history: [],
  },
  {
    id: 'task-202',
    description: 'Optimize database queries for user dashboard',
    status: TaskStatus.CHANGES_REQUESTED,
    priority: 'medium',
    createdAt: new Date(Date.now() - 259200000).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    assignedTo: null,
    comments: [],
    metadata: {},
    history: [],
    flowId: 'performance-optimization',
  },
  {
    id: 'task-303',
    description: 'Set up CI/CD pipeline for frontend deployment',
    status: TaskStatus.TESTING,
    priority: 'high',
    createdAt: new Date(Date.now() - 129600000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    assignedTo: {
      workerId: 'worker-dev-002',
      workerType: WorkerType.DEV,
    },
    comments: [],
    metadata: {},
    history: [],
  },
];

export const mockFlows: FlowDefinition[] = [
  {
    id: 'feature-development',
    name: 'Feature Development',
    description: 'Standard workflow for implementing new features',
    inputs: {
      feature_name: 'string',
      requirements: 'string',
    },
  },
  {
    id: 'bug-fix',
    name: 'Bug Fix',
    description: 'Workflow for identifying and fixing bugs',
    inputs: {
      bug_description: 'string',
      severity: 'string',
    },
  },
  {
    id: 'performance-optimization',
    name: 'Performance Optimization',
    description: 'Workflow for analyzing and improving performance',
    inputs: {
      target_component: 'string',
      metrics: 'string',
    },
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Automated code review and quality checks',
    inputs: {
      pr_number: 'string',
      review_depth: 'string',
    },
  },
];

export const mockStats = {
  restPort: 3737,
  wsPort: 3738,
  workers: mockWorkers.length,
  workersList: mockWorkers,
  tasks: {
    total: mockTasks.length,
    byStatus: {
      'backlog': 1,
      'todo': 1,
      'in_progress': 1,
      'testing': 1,
      'reviewing': 1,
      'changes_requested': 1,
    },
  },
};
