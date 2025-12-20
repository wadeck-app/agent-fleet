/**
 * StateSnapshotService Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTest } from '../../test-utils/index.js';
import { StateSnapshotService } from './StateSnapshotService.js';
import { TaskManager } from '../core/TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { Task, TaskStatus, WorkerType, WorkerInfo } from '../../shared/types.js';

// Mock dependencies
vi.mock('../core/TaskManager.js');
vi.mock('../websocket/WorkerWebSocketServer.js');

describe('StateSnapshotService', () => {
  let service: StateSnapshotService;
  let mockTaskManager: TaskManager;
  let mockWsServer: WorkerWebSocketServer;

  const mockTasks: Task[] = [
    {
      id: 'task-1',
      description: 'Task 1',
      status: TaskStatus.IN_PROGRESS,
      priority: 'high',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:05:00.000Z',
      assignedTo: { workerId: 'worker-1', workerType: WorkerType.DEV },
      comments: [],
      metadata: {},
      history: []
    },
    {
      id: 'task-2',
      description: 'Task 2',
      status: TaskStatus.MERGED,
      priority: 'medium',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:10:00.000Z',
      assignedTo: null,
      comments: [],
      metadata: {},
      history: []
    },
    {
      id: 'task-3',
      description: 'Task 3',
      status: TaskStatus.BLOCKED,
      priority: 'low',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:03:00.000Z',
      assignedTo: null,
      comments: [],
      metadata: {},
      history: []
    }
  ];

  const mockWorkers: WorkerInfo[] = [
    {
      id: 'worker-1',
      type: WorkerType.DEV,
      connectedAt: '2024-01-01T00:00:00.000Z',
      taskId: 'task-1',
    },
    {
      id: 'worker-2',
      type: WorkerType.DEV,
      connectedAt: '2024-01-01T00:00:00.000Z',
      taskId: null,
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock TaskManager
    mockTaskManager = {
      getAllTasks: vi.fn().mockReturnValue(mockTasks),
      getStats: vi.fn().mockReturnValue({
        total: 3,
        byStatus: {
          [TaskStatus.IN_PROGRESS]: 1,
          [TaskStatus.MERGED]: 1,
          [TaskStatus.BLOCKED]: 1
        }
      })
    } as any;

    // Mock WorkerWebSocketServer
    mockWsServer = {
      getWorkers: vi.fn().mockReturnValue(mockWorkers)
    } as any;

    // Mock process.env for version
    process.env.npm_package_version = '1.2.3';

    service = new StateSnapshotService(mockTaskManager, mockWsServer);
  });

  describe('getSnapshot', () => {
    it('should return a complete orchestrator snapshot', () => {
      const snapshot = service.getSnapshot();

      expect(snapshot).toBeDefined();
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.orchestrator).toBeDefined();
      expect(snapshot.tasks).toBeDefined();
      expect(snapshot.workers).toBeDefined();
      expect(snapshot.metrics).toBeDefined();
    });

    it('should include orchestrator status information', () => {
      const snapshot = service.getSnapshot();

      expect(snapshot.orchestrator.status).toBe('ready');
      expect(snapshot.orchestrator.version).toBe('1.2.3');
      expect(snapshot.orchestrator.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should include all tasks and statistics', () => {
      const snapshot = service.getSnapshot();

      expect(snapshot.tasks.all).toHaveLength(3);
      expect(snapshot.tasks.total).toBe(3);
      expect(snapshot.tasks.byStatus[TaskStatus.IN_PROGRESS]).toBe(1);
      expect(snapshot.tasks.byStatus[TaskStatus.MERGED]).toBe(1);
      expect(snapshot.tasks.byStatus[TaskStatus.BLOCKED]).toBe(1);
    });

    it('should include worker information and utilization', () => {
      const snapshot = service.getSnapshot();

      expect(snapshot.workers.all).toHaveLength(2);
      expect(snapshot.workers.connected).toBe(2);
      expect(snapshot.workers.idle).toBe(1); // worker-2 has no taskId
      expect(snapshot.workers.busy).toBe(1); // worker-1 has task-1
    });

    it('should calculate metrics correctly', () => {
      const snapshot = service.getSnapshot();

      expect(snapshot.metrics.taskThroughput.total).toBe(3);
      expect(snapshot.metrics.taskThroughput.completed).toBe(1); // MERGED
      expect(snapshot.metrics.taskThroughput.failed).toBe(1); // BLOCKED
      expect(snapshot.metrics.taskThroughput.inProgress).toBe(1); // IN_PROGRESS

      expect(snapshot.metrics.workerUtilization.total).toBe(2);
      expect(snapshot.metrics.workerUtilization.idle).toBe(1);
      expect(snapshot.metrics.workerUtilization.busy).toBe(1);
    });

    it('should calculate average task duration for completed tasks', () => {
      const snapshot = service.getSnapshot();

      // Task 2 took 10 minutes (600000ms)
      expect(snapshot.metrics.averageTaskDuration).toBe(600000);
    });

    it('should handle zero completed tasks', () => {
      // Override mock to return no completed tasks
      vi.mocked(mockTaskManager.getAllTasks).mockReturnValue([
        { ...mockTasks[0] } // Only in-progress task
      ]);

      const snapshot = service.getSnapshot();

      expect(snapshot.metrics.averageTaskDuration).toBe(0);
    });

    it('should use default version when npm_package_version is not set', () => {
      delete process.env.npm_package_version;

      const newService = new StateSnapshotService(mockTaskManager, mockWsServer);
      const snapshot = newService.getSnapshot();

      expect(snapshot.orchestrator.version).toBe('0.0.0');
    });
  });

  describe('getUptime', () => {
    it('should return uptime in milliseconds', () => {
      const before = Date.now();
      const uptime = service.getUptime();
      const after = Date.now();

      expect(uptime).toBeGreaterThanOrEqual(0);
      expect(uptime).toBeLessThanOrEqual(after - before + 100); // Allow small margin
    });

    it('should increase over time', async () => {
      const uptime1 = service.getUptime();

      // Wait 100ms
      await new Promise(resolve => setTimeout(resolve, 100));

      const uptime2 = service.getUptime();

      expect(uptime2).toBeGreaterThan(uptime1);
    });
  });

  describe('updateStartTime', () => {
    it('should update the start time', () => {
      const newStartTime = new Date('2024-01-01T12:00:00.000Z');
      service.updateStartTime(newStartTime);

      const uptime = service.getUptime();
      const expectedUptime = Date.now() - newStartTime.getTime();

      expect(uptime).toBeCloseTo(expectedUptime, -2); // Within 100ms
    });
  });
});
