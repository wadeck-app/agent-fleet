/**
 * Flow Worker
 *
 * Executes flows defined in the Flow Engine via FlowExecutor.
 * Integrates WorkspaceManager, FlowRegistry, and FlowExecutor with the orchestrator.
 */

import { BaseWorker } from '../base/BaseWorker.js';
import { Task, WorkerType, TaskStatus } from '../../shared/types.js';
import { FlowRegistry } from '../../flow/registry/FlowRegistry.js';
import { FlowExecutor, FlowExecutionOptions } from '../../flow/executor/FlowExecutor.js';
import { WorkspaceManager } from '../../flow/workspace/WorkspaceManager.js';
import type { Workspace } from '../../flow/types.js';
import { fileURLToPath } from 'url';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { ChildProcess, execSync } from 'child_process';

export class FlowWorker extends BaseWorker {
  private flowRegistry: FlowRegistry;
  private flowExecutor: FlowExecutor;
  private workspaceManager: WorkspaceManager;
  private interactive: boolean;
  private claudeWss: WebSocketServer | null = null;
  private claudeWsPort: number = 0;
  private claudeSocket: WebSocket | null = null;
  private claudeProcess: ChildProcess | null = null;

  constructor(wsUrl?: string, projectRoot: string = process.cwd(), interactive: boolean = false, preferredWorkerId?: string) {
    super(WorkerType.DEV, wsUrl, preferredWorkerId);

    this.interactive = interactive;
    console.log(`[FlowWorker] Initializing with project root: ${projectRoot}`);
    if (interactive) console.log(`[FlowWorker] Interactive mode enabled`);
    if (preferredWorkerId) console.log(`[FlowWorker] Preferred worker ID: ${preferredWorkerId}`);

    // Setup WebSocket server for Claude to communicate with this worker
    this.setupClaudeWebSocketServer();

    // Initialize Flow Engine components
    this.flowRegistry = new FlowRegistry(projectRoot);
    this.flowExecutor = new FlowExecutor(interactive);
    this.workspaceManager = new WorkspaceManager(projectRoot);

    // Load project flows
    this.loadFlows();
  }

  /**
   * Load flows from project configuration
   */
  private async loadFlows(): Promise<void> {
    try {
      await this.flowRegistry.loadProjectFlows();
      const flowIds = this.flowRegistry.getFlowIds();
      console.log(`${this.logPrefix()} Loaded ${flowIds.length} flows: ${flowIds.join(', ')}`);

      // Start watching flows file for changes
      this.flowRegistry.startWatching();
    } catch (error) {
      console.error(`${this.logPrefix()} Failed to load flows:`, error);
    }
  }

  /**
   * Execute a task - either a flow-based task or error if no flowId
   */
  protected async executeTask(task: Task): Promise<void> {
    console.log(`${this.logPrefix()} Starting task execution...`);

    // Check if task has a flowId
    if (!task.flowId) {
      const error = 'FlowWorker requires task.flowId to be set';
      console.error(`${this.logPrefix()} ${error}`);
      throw new Error(error);
    }

    // Get the flow definition
    const flow = this.flowRegistry.getFlow(task.flowId);
    if (!flow) {
      const error = `Flow '${task.flowId}' not found in registry`;
      console.error(`${this.logPrefix()} ${error}`);
      throw new Error(error);
    }

    // Determine status transitions based on flow configuration
    const defaultOnSuccess = TaskStatus.REVIEW;
    const defaultOnFailure = TaskStatus.CHANGES_REQUESTED;
    const successStatus = flow.statusTransitions?.onSuccess ?? defaultOnSuccess;
    const failureStatus = flow.statusTransitions?.onFailure ?? defaultOnFailure;

    console.log(`${this.logPrefix()} Executing flow: ${flow.name} (${flow.id})`);
    this.sendTaskStarted(TaskStatus.IN_PROGRESS);

    let workspace: Workspace | null = null;

    try {
      // Allocate workspace based on flow configuration
      this.sendTaskProgress('Allocating workspace...');

      // Determine workspace path
      let existingPath: string | undefined = task.workspacePath;

      // If manual mode but no path specified, use current working directory
      if (flow.workspace.mode === 'manual' && !existingPath) {
        existingPath = process.cwd();
        console.log(`${this.logPrefix()} Using current working directory as manual workspace: ${existingPath}`);
      }

      workspace = await this.workspaceManager.allocate({
        taskId: task.id,
        config: flow.workspace,
        existingPath,
        taskMetadata: {
          description: task.description,
          priority: task.priority,
          ...task.metadata,
        },
      });

      console.log(`${this.logPrefix()} Workspace allocated: ${workspace.id} (${workspace.path})`);
      this.sendTaskProgress(`Workspace ready: ${workspace.path}`);

      // Prepare execution options
      const executionOptions: FlowExecutionOptions = {
        taskId: task.id,
        flow,
        workspace,
        inputs: task.flowInputs || {},
        taskMetadata: {
          priority: task.priority,
          createdAt: task.createdAt,
          description: task.description,
          ...task.metadata,
        },
        // Pass Claude environment variables for hooks
        claudeEnv: {
          CLAUDE_WORKER_ID: this.workerId,
          CLAUDE_WORKER_SOCKET: `ws://localhost:${this.claudeWsPort}`,
          CLAUDE_TASK_ID: task.id,
          CLAUDE_CONTEXT_DIR: workspace.path,
          CLAUDE_CODE_STOPPABLE: this.interactive ? 'true' : 'false'
        },
        // Callback to store Claude process reference
        onClaudeProcessStarted: (process) => {
          this.claudeProcess = process;
        }
      };

      // Execute the flow
      this.sendTaskProgress('Executing flow steps...');
      const result = await this.flowExecutor.execute(executionOptions);

      // Store result in task
      task.flowResult = {
        status: result.success ? 'completed' : 'failed',
        outputs: result.outputs,
        error: result.error,
        trace: result.trace,
      };

      if (result.success) {
        console.log(`${this.logPrefix()} Flow completed successfully`);
        this.sendTaskCompleted(
          {
            message: 'Flow execution completed',
            outputs: result.outputs,
            trace: result.trace,
          },
          successStatus
        );
      } else {
        console.error(`${this.logPrefix()} Flow failed: ${result.error}`);
        this.sendTaskFailed(result.error || 'Flow execution failed', failureStatus);
      }

    } catch (error) {
      console.error(`${this.logPrefix()} Task execution error:`, error);

      // Store error in task
      task.flowResult = {
        status: 'failed',
        error: (error as Error).message,
      };

      // Send failure with configured status
      this.sendTaskFailed((error as Error).message, failureStatus);
    } finally {
      // Release workspace
      if (workspace) {
        try {
          console.log(`${this.logPrefix()} Releasing workspace ${workspace.id}...`);
          await this.workspaceManager.release(workspace.id, task.id);
          console.log(`${this.logPrefix()} Workspace released`);
        } catch (error) {
          console.error(`${this.logPrefix()} Failed to release workspace:`, error);
        }
      }
    }
  }

  protected logPrefix(): string {
    return `[FlowWorker ${this.workerId}]`;
  }

  /**
   * Setup WebSocket server for Claude processes to communicate with this worker
   */
  private setupClaudeWebSocketServer(): void {
    // Create WebSocket server on a random available port
    this.claudeWss = new WebSocketServer({ port: 0 });

    this.claudeWss.on('listening', () => {
      const address = this.claudeWss!.address();
      if (typeof address === 'object' && address !== null) {
        this.claudeWsPort = address.port;
        console.log(`${this.logPrefix()} Claude WebSocket server listening on port ${this.claudeWsPort}`);
      }
    });

    this.claudeWss.on('connection', (socket: WebSocket) => {
      console.log(`${this.logPrefix()} Claude process connected to worker socket`);
      this.claudeSocket = socket;

      socket.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleClaudeMessage(message);
        } catch (error) {
          console.error(`${this.logPrefix()} Error parsing Claude message:`, error);
        }
      });

      socket.on('close', () => {
        console.log(`${this.logPrefix()} Claude socket disconnected`);
        this.claudeSocket = null;
      });

      socket.on('error', (error) => {
        console.error(`${this.logPrefix()} Claude socket error:`, error);
      });
    });

    this.claudeWss.on('error', (error) => {
      console.error(`${this.logPrefix()} Claude WebSocket server error:`, error);
    });
  }

  /**
   * Handle messages from Claude processes (via hooks)
   */
  private handleClaudeMessage(message: any): void {
    switch (message.type) {
      case 'STOP_REQUESTED':
        console.log(`${this.logPrefix()} Stop requested by Claude, killing process...`);
        this.killClaude();
        break;

      case 'HOOK_EVENT':
        console.log(`${this.logPrefix()} Hook event: ${message.hookName}`);
        break;

      default:
        console.log(`${this.logPrefix()} Unknown message type: ${message.type}`);
    }
  }

  /**
   * Kill Claude process if running
   */
  killClaude(): void {
    if (this.claudeProcess) {
      const pid = this.claudeProcess.pid;
      console.log(`${this.logPrefix()} Killing Claude process (PID: ${pid})...`);

      try {
        if (pid && process.platform === 'win32') {
          try {
            execSync(`taskkill /PID ${pid} /T /F`, {
              stdio: 'inherit',
              windowsHide: false
            });
            console.log(`${this.logPrefix()} Process killed successfully`);
          } catch (killError: any) {
            if (!killError.message?.includes('not found')) {
              console.error(`${this.logPrefix()} Kill error:`, killError.message);
            }
          }
        } else if (this.claudeProcess) {
          this.claudeProcess.kill('SIGKILL');
        }

        this.claudeProcess = null;
      } catch (error) {
        console.error(`${this.logPrefix()} Error killing process:`, error);
        this.claudeProcess = null;
      }
    }
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    console.log(`${this.logPrefix()} Shutting down...`);

    // Stop watching flows file
    this.flowRegistry.stopWatching();

    // Kill Claude if running
    this.killClaude();

    // Close Claude WebSocket server
    if (this.claudeWss) {
      console.log(`${this.logPrefix()} Closing Claude WebSocket server...`);
      this.claudeWss.close(() => {
        console.log(`${this.logPrefix()} Claude WebSocket server closed`);
      });
      this.claudeWss = null;
    }

    // Cleanup all workspaces
    this.workspaceManager.cleanupAll();

    super.shutdown();
  }
}

// Entry point if run directly
const currentFilePath = fileURLToPath(import.meta.url);
const mainFilePath = process.argv[1];
const isMainModule = currentFilePath === mainFilePath;

if (isMainModule) {
  console.log('[FlowWorker] Starting Flow Worker...');

  // Check for interactive mode from CLI args or environment variable
  const interactiveArg = process.argv.includes('--interactive') || process.argv.includes('-i');
  const interactiveEnv = process.env.WORKER_INTERACTIVE === 'true';
  const interactive = interactiveArg || interactiveEnv;

  // Parse worker ID from CLI args or environment variable
  const workerIdArg = process.argv.find(arg => arg.startsWith('--worker-id='));
  const preferredWorkerId = workerIdArg
    ? workerIdArg.split('=')[1]
    : process.env.WORKER_ID;

  const projectRoot = process.cwd();
  const worker = new FlowWorker(undefined, projectRoot, interactive, preferredWorkerId);

  worker.connect().then(() => {
    console.log('[FlowWorker] Worker started and connected');
  }).catch((error) => {
    console.error('[FlowWorker] Failed to connect:', error.message);
    console.error('[FlowWorker] Make sure the orchestrator is running on ws://localhost:3738');
    process.exit(1);
  });

  // Handle shutdown signals
  process.on('SIGINT', () => {
    console.log('\n[FlowWorker] Received SIGINT, shutting down...');
    worker.shutdown();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n[FlowWorker] Received SIGTERM, shutting down...');
    worker.shutdown();
    process.exit(0);
  });
}
