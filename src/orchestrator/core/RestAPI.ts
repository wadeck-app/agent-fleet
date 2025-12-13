import express, { Express, Request, Response } from 'express';
import { TaskManager } from './TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';
import { TaskStatus } from '../../shared/types.js';
import { Logger } from '../../shared/Logger.js';
import { FlowRegistry } from '../../flow/registry/FlowRegistry.js';
import { WorkspaceManager } from '../../flow/workspace/WorkspaceManager.js';

export class RestAPI {
  private app: Express;
  private taskManager: TaskManager;
  private wsServer: WorkerWebSocketServer;
  private flowRegistry: FlowRegistry | null;
  private workspaceManager: WorkspaceManager | null;
  private port: number;
  private server: any;

  constructor(
    taskManager: TaskManager,
    wsServer: WorkerWebSocketServer,
    port: number = 3737,
    flowRegistry: FlowRegistry | null = null,
    workspaceManager: WorkspaceManager | null = null
  ) {
    this.taskManager = taskManager;
    this.wsServer = wsServer;
    this.flowRegistry = flowRegistry;
    this.workspaceManager = workspaceManager;
    this.port = port;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());

    // Logger middleware
    this.app.use((req, res, next) => {
      Logger.log(`[API] ${req.method} ${req.path}`);
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

    // Create a task (supports both regular and flow-based tasks)
    this.app.post('/tasks', async (req: Request, res: Response) => {
      try {
        const { description, priority, metadata, flowId, flowInputs, workspacePath } = req.body;

        if (!description) {
          res.status(400).json({ error: 'Description is required' });
          return;
        }

        // Validate flowId if provided
        if (flowId && this.flowRegistry && !this.flowRegistry.hasFlow(flowId)) {
          res.status(400).json({ error: `Flow '${flowId}' not found` });
          return;
        }

        const task = await this.taskManager.createTask(description, {
          priority,
          ...metadata
        });

        // Add flow-specific fields if flowId is provided
        if (flowId) {
          task.flowId = flowId;
          task.flowInputs = flowInputs || {};
        }

        // Add workspace path if provided (for manual workspace mode)
        if (workspacePath) {
          task.workspacePath = workspacePath;
        }

        // IMPORTANT: Update task in TaskManager's memory + storage
        // (createTask() saves before we add flowInputs/workspacePath)
        if (flowId || workspacePath) {
          await this.taskManager.updateTask(task);
        }

        // Try to assign the task to an available worker
        this.wsServer.tryAssignTasksToIdleWorkers();

        res.status(201).json(task);
      } catch (error) {
        Logger.error('[API] Error creating task:', error);
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
        Logger.error('[API] Error listing tasks:', error);
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
        Logger.error('[API] Error getting task:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Update task status
    this.app.patch('/tasks/:id/status', async (req: Request, res: Response) => {
      try {
        const { status } = req.body;

        if (!status) {
          res.status(400).json({ error: 'Status is required' });
          return;
        }

        await this.taskManager.updateTaskStatus(req.params.id, status as TaskStatus);
        const task = this.taskManager.getTask(req.params.id);

        res.json(task);
      } catch (error) {
        Logger.error('[API] Error updating task status:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Add a comment to a task
    this.app.post('/tasks/:id/comments', async (req: Request, res: Response) => {
      try {
        const { author, content } = req.body;

        if (!author || !content) {
          res.status(400).json({ error: 'Author and content are required' });
          return;
        }

        await this.taskManager.addComment(req.params.id, author, content);
        const task = this.taskManager.getTask(req.params.id);

        res.json(task);
      } catch (error) {
        Logger.error('[API] Error adding comment:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Delete a task
    this.app.delete('/tasks/:id', async (req: Request, res: Response) => {
      try {
        const deleted = await this.taskManager.deleteTask(req.params.id);

        if (!deleted) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        res.json({ message: 'Task deleted successfully' });
      } catch (error) {
        Logger.error('[API] Error deleting task:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Clear all tasks
    this.app.delete('/tasks', async (req: Request, res: Response) => {
      try {
        const count = await this.taskManager.clearAllTasks();
        res.json({ message: `Cleared ${count} tasks` });
      } catch (error) {
        Logger.error('[API] Error clearing tasks:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List workers
    this.app.get('/workers', (req: Request, res: Response) => {
      try {
        const workers = this.wsServer.getWorkers();
        res.json(workers);
      } catch (error) {
        Logger.error('[API] Error listing workers:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List available flows
    this.app.get('/flows', (req: Request, res: Response) => {
      try {
        if (!this.flowRegistry) {
          res.status(503).json({ error: 'Flow registry not available' });
          return;
        }

        const flows = this.flowRegistry.getAllFlows();
        res.json(flows);
      } catch (error) {
        Logger.error('[API] Error listing flows:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get a specific flow
    this.app.get('/flows/:id', (req: Request, res: Response) => {
      try {
        if (!this.flowRegistry) {
          res.status(503).json({ error: 'Flow registry not available' });
          return;
        }

        const flow = this.flowRegistry.getFlow(req.params.id);

        if (!flow) {
          res.status(404).json({ error: 'Flow not found' });
          return;
        }

        res.json(flow);
      } catch (error) {
        Logger.error('[API] Error getting flow:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get detailed execution trace for a task
    this.app.get('/tasks/:id/trace', (req: Request, res: Response) => {
      try {
        const task = this.taskManager.getTask(req.params.id);

        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }

        if (!task.flowResult || !task.flowResult.trace) {
          res.status(404).json({ error: 'No execution trace available for this task' });
          return;
        }

        res.json({
          taskId: task.id,
          flowId: task.flowId,
          status: task.flowResult.status,
          trace: task.flowResult.trace,
          outputs: task.flowResult.outputs,
          error: task.flowResult.error
        });
      } catch (error) {
        Logger.error('[API] Error getting task trace:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // List all active workspaces
    this.app.get('/workspaces', (req: Request, res: Response) => {
      try {
        if (!this.workspaceManager) {
          res.status(503).json({ error: 'Workspace manager not available' });
          return;
        }

        const workspaces = this.workspaceManager.getAllWorkspaces();
        res.json(workspaces);
      } catch (error) {
        Logger.error('[API] Error listing workspaces:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    // Get a specific workspace by ID
    this.app.get('/workspaces/:id', (req: Request, res: Response) => {
      try {
        if (!this.workspaceManager) {
          res.status(503).json({ error: 'Workspace manager not available' });
          return;
        }

        const workspace = this.workspaceManager.getWorkspace(req.params.id);

        if (!workspace) {
          res.status(404).json({ error: 'Workspace not found' });
          return;
        }

        res.json(workspace);
      } catch (error) {
        Logger.error('[API] Error getting workspace:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        Logger.log(`[API] REST API listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          Logger.log('[API] REST API stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
