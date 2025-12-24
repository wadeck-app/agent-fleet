import express, { type Express, type Request, type Response } from 'express';
import { WorkspaceManager } from 'flow-engine/workspace/WorkspaceManager';
import { Server as HttpServer, IncomingMessage } from 'http';
import { logger } from 'shared-common/logger';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { Duplex } from 'stream';
import { WebSocket, WebSocketServer } from 'ws';

import { UIClientHook } from '../ui-client/UIClientHook';
import { UIWebSocketServer } from '../websocket/UIWebSocketServer';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer';
import { TaskManager } from './TaskManager';

export class RestAPI {
	private app: Express;
	private taskManager: TaskManager;
	private wsServer: WorkerWebSocketServer;
	private workspaceManager: WorkspaceManager | null;
	private port: number;
	private server: HttpServer | null = null;
	private startTime: number;
	private uiWebSocketServer: WebSocketServer | null = null;
	private uiWSHandler: UIWebSocketServer | null = null;

	constructor(
		taskManager: TaskManager,
		wsServer: WorkerWebSocketServer,
		port: number = 3737,
		workspaceManager: WorkspaceManager | null = null,
		uiClientHook?: UIClientHook
	) {
		this.taskManager = taskManager;
		this.wsServer = wsServer;
		this.workspaceManager = workspaceManager;
		this.port = port;
		this.startTime = Date.now();
		this.app = express();
		this.setupMiddleware();
		this.setupRoutes();

		// Setup UI WebSocket server if UIClientHook is provided
		if (uiClientHook) {
			this.setupUIWebSocket(uiClientHook);
		}
	}

	private setupMiddleware(): void {
		this.app.use(express.json());

		// logger middleware
		this.app.use((req, res, next) => {
			logger.info(`[API] ${req.method} ${req.path}`);
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
			const uptime = Date.now() - this.startTime;

			res.json({
				restPort: this.port,
				wsPort: this.wsServer.getPort(),
				uptime,
				workers: workers.length,
				workersList: workers,
				tasks: taskStats,
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

				// Note: Flow validation is now done by workers, not orchestrator
				// The orchestrator no longer validates flowId existence

				const task = await this.taskManager.createTask(description, {
					priority,
					...metadata,
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
				logger.error('[API] Error creating task:', error);
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
				logger.error('[API] Error listing tasks:', error);
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
				logger.error('[API] Error getting task:', error);
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
				logger.error('[API] Error updating task status:', error);
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
				logger.error('[API] Error adding comment:', error);
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
				logger.error('[API] Error deleting task:', error);
				res.status(500).json({ error: (error as Error).message });
			}
		});

		// Clear all tasks
		this.app.delete('/tasks', async (req: Request, res: Response) => {
			try {
				const count = await this.taskManager.clearAllTasks();
				res.json({ message: `Cleared ${count} tasks` });
			} catch (error) {
				logger.error('[API] Error clearing tasks:', error);
				res.status(500).json({ error: (error as Error).message });
			}
		});

		// List workers
		this.app.get('/workers', (req: Request, res: Response) => {
			try {
				const workers = this.wsServer.getWorkers();
				res.json(workers);
			} catch (error) {
				logger.error('[API] Error listing workers:', error);
				res.status(500).json({ error: (error as Error).message });
			}
		});

		// List available flows from all registered workers
		this.app.get('/flows', (req: Request, res: Response) => {
			try {
				const flowDiscoveryRegistry = this.wsServer.getConnectionManager().getFlowDiscoveryRegistry();
				const allProjects = flowDiscoveryRegistry.getAllProjects();

				const flowsByProject: Record<string, any> = {};
				for (const projectId of allProjects) {
					const projectFlows = flowDiscoveryRegistry.getProjectFlows(projectId);
					if (projectFlows) {
						flowsByProject[projectId] = Object.fromEntries(projectFlows);
					}
				}

				res.json(flowsByProject);
			} catch (error) {
				logger.error('[API] Error listing flows:', error);
				res.status(500).json({ error: (error as Error).message });
			}
		});

		// Get flows for a specific project
		this.app.get('/flows/:projectId', (req: Request, res: Response) => {
			try {
				const flowDiscoveryRegistry = this.wsServer.getConnectionManager().getFlowDiscoveryRegistry();
				const projectFlows = flowDiscoveryRegistry.getProjectFlows(req.params.projectId);

				if (!projectFlows) {
					res.status(404).json({ error: 'Project not found' });
					return;
				}

				res.json(Object.fromEntries(projectFlows));
			} catch (error) {
				logger.error('[API] Error getting project flows:', error);
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
					error: task.flowResult.error,
				});
			} catch (error) {
				logger.error('[API] Error getting task trace:', error);
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
				logger.error('[API] Error listing workspaces:', error);
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
				logger.error('[API] Error getting workspace:', error);
				res.status(500).json({ error: (error as Error).message });
			}
		});
	}

	/**
	 * Setup WebSocket server for UI clients
	 * Creates a WebSocketServer instance that handles UI client connections
	 * and broadcasts state updates via UIClientHook
	 */
	private setupUIWebSocket(uiClientHook: UIClientHook): void {
		// Create UIWebSocketServer handler
		this.uiWSHandler = new UIWebSocketServer(uiClientHook);
		this.uiWSHandler.start();

		// Create WebSocketServer instance (noServer mode - we'll handle upgrade manually)
		this.uiWebSocketServer = new WebSocketServer({ noServer: true });

		logger.info('RestAPI', 'UI WebSocket server configured');
	}

	/**
	 * Setup HTTP upgrade handler to support WebSocket connections
	 * This must be called after the HTTP server is created in start()
	 */
	private setupWebSocketUpgrade(): void {
		if (!this.server || !this.uiWebSocketServer || !this.uiWSHandler) {
			return;
		}

		// Handle HTTP upgrade requests for WebSocket connections
		this.server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
			const pathname = request.url;

			// Route to UI WebSocket endpoint
			if (pathname === '/ws/ui') {
				this.uiWebSocketServer!.handleUpgrade(request, socket, head, (ws: WebSocket) => {
					this.uiWebSocketServer!.emit('connection', ws, request);
					// Pass the connection to our UIWebSocketServer handler
					this.uiWSHandler!.handleConnection(ws);
				});
			} else {
				// Reject unknown WebSocket paths
				socket.destroy();
			}
		});

		logger.info('RestAPI', 'HTTP upgrade handler configured for /ws/ui');
	}

	start(): Promise<void> {
		return new Promise(resolve => {
			this.server = this.app.listen(this.port, () => {
				// Setup WebSocket upgrade handler after HTTP server is created
				this.setupWebSocketUpgrade();

				logger.info(`[API] REST API listening on port ${this.port}`);
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		// Stop UI WebSocket handler first
		if (this.uiWSHandler) {
			this.uiWSHandler.stop();
		}

		// Close UI WebSocket server
		if (this.uiWebSocketServer) {
			this.uiWebSocketServer.close();
		}

		return new Promise(resolve => {
			if (this.server) {
				this.server.close(() => {
					logger.info('[API] REST API stopped');
					resolve();
				});
			} else {
				resolve();
			}
		});
	}
}
