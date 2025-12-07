import { Worker, LogEntry, Task, CreateTaskDTO } from '@/types/domain';

export class MockDataService {
  private workers: Worker[] = [];
  private logs: LogEntry[] = [];
  private tasks: Task[] = [];
  private logSubscribers: Set<(log: LogEntry) => void> = new Set();
  private workerSubscribers: Set<(workers: Worker[]) => void> = new Set();
  private taskSubscribers: Set<(tasks: Task[]) => void> = new Set();
  private logInterval?: NodeJS.Timeout;
  private workerUpdateInterval?: NodeJS.Timeout;

  constructor() {
    this.initializeMockData();
    this.startLogSimulation();
    this.startWorkerStatusSimulation();
  }

  private initializeMockData(): void {
    // Initialize workers
    this.workers = [
      {
        id: 'worker-001',
        name: 'flow-worker-alpha',
        type: 'flow',
        status: 'active',
        connectedAt: new Date(Date.now() - 3600000),
        lastActivity: new Date(),
        currentTask: 'Building React components',
        stats: {
          tasksCompleted: 12,
          tasksInProgress: 1,
          uptime: 3600,
        },
      },
      {
        id: 'worker-002',
        name: 'flow-worker-beta',
        type: 'flow',
        status: 'idle',
        connectedAt: new Date(Date.now() - 7200000),
        lastActivity: new Date(Date.now() - 300000),
        stats: {
          tasksCompleted: 8,
          tasksInProgress: 0,
          uptime: 7200,
        },
      },
      {
        id: 'worker-003',
        name: 'dev-worker-gamma',
        type: 'dev',
        status: 'active',
        connectedAt: new Date(Date.now() - 1800000),
        lastActivity: new Date(),
        currentTask: 'Running tests',
        stats: {
          tasksCompleted: 5,
          tasksInProgress: 1,
          uptime: 1800,
        },
      },
      {
        id: 'worker-004',
        name: 'test-worker-delta',
        type: 'test',
        status: 'error',
        connectedAt: new Date(Date.now() - 900000),
        lastActivity: new Date(Date.now() - 60000),
        stats: {
          tasksCompleted: 3,
          tasksInProgress: 0,
          uptime: 900,
        },
      },
    ];

    // Initialize tasks
    this.tasks = [
      {
        id: 'task-001',
        name: 'Build frontend components',
        type: 'flow',
        status: 'running',
        assignedTo: 'worker-001',
        createdAt: new Date(Date.now() - 1200000),
        startedAt: new Date(Date.now() - 600000),
        config: `name: build-frontend
steps:
  - name: setup
    action: npm install
  - name: build
    action: npm run build`,
      },
      {
        id: 'task-002',
        name: 'Run integration tests',
        type: 'flow',
        status: 'queued',
        createdAt: new Date(Date.now() - 300000),
        config: `name: integration-tests
steps:
  - name: test
    action: npm run test:integration`,
      },
      {
        id: 'task-003',
        name: 'Deploy to staging',
        type: 'command',
        status: 'completed',
        assignedTo: 'worker-002',
        createdAt: new Date(Date.now() - 3600000),
        startedAt: new Date(Date.now() - 3000000),
        completedAt: new Date(Date.now() - 2400000),
        config: `command: ./deploy.sh staging`,
      },
    ];

    // Add initial logs
    this.addLog('worker-001', 'info', 'Worker started successfully');
    this.addLog('worker-001', 'info', 'Connected to orchestrator at ws://localhost:8080');
    this.addLog('worker-002', 'info', 'Worker started successfully');
    this.addLog('worker-003', 'info', 'Worker started successfully');
    this.addLog('worker-003', 'success', 'Task completed: Generate API documentation');
    this.addLog('worker-004', 'error', 'Connection timeout - retrying...');
  }

  private startLogSimulation(): void {
    this.logInterval = setInterval(() => {
      const activeWorkers = this.workers.filter(w => w.status === 'active');
      if (activeWorkers.length === 0) return;

      const worker = activeWorkers[Math.floor(Math.random() * activeWorkers.length)];
      const messages = this.getRandomLogMessages(worker);
      const message = messages[Math.floor(Math.random() * messages.length)];
      const level = this.getRandomLogLevel();

      this.addLog(worker.id, level, message);
    }, 2000 + Math.random() * 3000); // Random interval between 2-5 seconds
  }

  private startWorkerStatusSimulation(): void {
    this.workerUpdateInterval = setInterval(() => {
      // Randomly update worker stats
      this.workers.forEach(worker => {
        if (worker.status === 'active') {
          worker.lastActivity = new Date();
          worker.stats.uptime += 10;
        }
      });

      // Occasionally change worker status
      if (Math.random() > 0.9) {
        const worker = this.workers[Math.floor(Math.random() * this.workers.length)];
        const statuses: Worker['status'][] = ['active', 'idle', 'error'];
        worker.status = statuses[Math.floor(Math.random() * statuses.length)];
      }

      this.notifyWorkerSubscribers();
    }, 10000); // Every 10 seconds
  }

  private getRandomLogMessages(worker: Worker): string[] {
    const messages = [
      `Processing task: ${worker.currentTask || 'unknown'}`,
      'Checking dependencies...',
      'Installing npm packages...',
      'Running build process...',
      'Executing test suite...',
      'Generating documentation...',
      'Analyzing code quality...',
      'Compiling TypeScript files...',
      'Bundling application...',
      'Optimizing assets...',
      'Running linter...',
      'Checking for updates...',
      'Validating configuration...',
      'Starting development server...',
      'Hot module replacement active',
      'Connected to database',
      'API server listening on port 3000',
      'WebSocket connection established',
      'Cache cleared successfully',
      'Deployment pipeline started',
    ];
    return messages;
  }

  private getRandomLogLevel(): LogEntry['level'] {
    const rand = Math.random();
    if (rand < 0.6) return 'info';
    if (rand < 0.75) return 'debug';
    if (rand < 0.85) return 'success';
    if (rand < 0.95) return 'warn';
    return 'error';
  }

  private addLog(workerId: string, level: LogEntry['level'], message: string): void {
    const log: LogEntry = {
      id: `log-${Date.now()}-${Math.random()}`,
      workerId,
      timestamp: new Date(),
      level,
      message,
    };

    this.logs.push(log);

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    this.notifyLogSubscribers(log);
  }

  // Public API
  getWorkers(): Worker[] {
    return [...this.workers];
  }

  getWorker(id: string): Worker | undefined {
    return this.workers.find(w => w.id === id);
  }

  getLogs(workerId?: string): LogEntry[] {
    if (workerId) {
      return this.logs.filter(log => log.workerId === workerId);
    }
    return [...this.logs];
  }

  getTasks(): Task[] {
    return [...this.tasks];
  }

  addTask(task: CreateTaskDTO): Task {
    const newTask: Task = {
      ...task,
      id: `task-${Date.now()}`,
      status: 'queued',
      createdAt: new Date(),
    };
    this.tasks.push(newTask);
    this.notifyTaskSubscribers();
    return newTask;
  }

  subscribeToLogs(callback: (log: LogEntry) => void): () => void {
    this.logSubscribers.add(callback);
    return () => this.logSubscribers.delete(callback);
  }

  subscribeToWorkers(callback: (workers: Worker[]) => void): () => void {
    this.workerSubscribers.add(callback);
    // Send initial data
    callback(this.getWorkers());
    return () => this.workerSubscribers.delete(callback);
  }

  subscribeToTasks(callback: (tasks: Task[]) => void): () => void {
    this.taskSubscribers.add(callback);
    // Send initial data
    callback(this.getTasks());
    return () => this.taskSubscribers.delete(callback);
  }

  private notifyLogSubscribers(log: LogEntry): void {
    this.logSubscribers.forEach(callback => callback(log));
  }

  private notifyWorkerSubscribers(): void {
    const workers = this.getWorkers();
    this.workerSubscribers.forEach(callback => callback(workers));
  }

  private notifyTaskSubscribers(): void {
    const tasks = this.getTasks();
    this.taskSubscribers.forEach(callback => callback(tasks));
  }

  destroy(): void {
    if (this.logInterval) clearInterval(this.logInterval);
    if (this.workerUpdateInterval) clearInterval(this.workerUpdateInterval);
    this.logSubscribers.clear();
    this.workerSubscribers.clear();
    this.taskSubscribers.clear();
  }
}

// Singleton instance
export const mockDataService = new MockDataService();
