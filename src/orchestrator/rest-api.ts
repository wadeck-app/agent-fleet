import express, { Express, Request, Response } from 'express';
import { TaskManager } from './task-manager.js';
import { WorkerWebSocketServer } from './websocket-server.js';
import { TaskStatus } from '../shared/types.js';

export class RestAPI {
  private app: Express;
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer;
  private port: number;
  private server: any;

  constructor(
    taskManager: TaskManager,
    wsServer: WorkerWebSocketServer,
    port: number = 3737
  ) {
    this.taskManager = taskManager;
    this.wsServer = wsServer;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // Logger middleware
    this.app.use((req, res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'ok' });
    });

    // Statistics
    this.app.get('/stats', (req: Request, res: Response) => {
      const taskStats = this.taskManager.getStats();
      const workers = this.wsServer.getWorkers();

      res.json({
        restPort: this.port,
        wsPort: this.wsServer.getPort(),
        workers: workers.length,
        workersList: workers,
        tasks: taskStats
      });
    });

    // Create a task
    this.app.post('/tasks', (req: Request, res: Response) => {
      try {
        const { description, priority, metadata } = req.body;

        if (!description) {
          res.status(400).json({ error: 'Description is required' });
          return;
        }

        const task = this.taskManager.createTask(description, {
          priority,
          ...metadata
        });

        // Try to assign the task to an available worker
        this.wsServer.tryAssignTasksToIdleWorkers();

        res.status(201).json(task);
      } catch (error) {
        console.error('[API] Error creating task:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List all tasks
    this.app.get('/tasks', (req: Request, res: Response) => {
      try {
        const { status } = req.query;

        let tasks;
        if (status) {
          tasks = this.taskManager.getTasksByStatus(status as TaskStatus);
        } else {
          tasks = this.taskManager.getAllTasks();
        }

        res.json(tasks);
      } catch (error) {
        console.error('[API] Error listing tasks:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get a specific task
    this.app.get('/tasks/:id', (req: Request, res: Response) => {
      try {
        const task = this.taskManager.getTask(req.params.id);

        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        res.json(task);
      } catch (error) {
        console.error('[API] Error getting task:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Update task status
    this.app.patch('/tasks/:id/status', (req: Request, res: Response) => {
      try {
        const { status } = req.body;

        if (!status) {
          res.status(400).json({ error: 'Status is required' });
          return;
        }

        this.taskManager.updateTaskStatus(req.params.id, status as TaskStatus);
        const task = this.taskManager.getTask(req.params.id);

        res.json(task);
      } catch (error) {
        console.error('[API] Error updating task status:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Add a comment to a task
    this.app.post('/tasks/:id/comments', (req: Request, res: Response) => {
      try {
        const { author, content } = req.body;

        if (!author || !content) {
          res.status(400).json({ error: 'Author and content are required' });
          return;
        }

        this.taskManager.addComment(req.params.id, author, content);
        const task = this.taskManager.getTask(req.params.id);

        res.json(task);
      } catch (error) {
        console.error('[API] Error adding comment:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Delete a task
    this.app.delete('/tasks/:id', (req: Request, res: Response) => {
      try {
        const deleted = this.taskManager.deleteTask(req.params.id);

        if (!deleted) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        res.json({ message: 'Task deleted successfully' });
      } catch (error) {
        console.error('[API] Error deleting task:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Clear all tasks
    this.app.delete('/tasks', (req: Request, res: Response) => {
      try {
        const count = this.taskManager.clearAllTasks();
        res.json({ message: `Cleared ${count} tasks` });
      } catch (error) {
        console.error('[API] Error clearing tasks:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List workers
    this.app.get('/workers', (req: Request, res: Response) => {
      try {
        const workers = this.wsServer.getWorkers();
        res.json(workers);
      } catch (error) {
        console.error('[API] Error listing workers:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`[API] REST API listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('[API] REST API stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
