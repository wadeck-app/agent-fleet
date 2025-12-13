/**
 * Flow Worker (Refactored)
 *
 * Executes flows defined in the Flow Engine via FlowExecutor.
 * Integrates WorkspaceManager, FlowRegistry, and FlowExecutor with the orchestrator.
 *
 * This class handles:
 * - WebSocket communication with orchestrator
 * - Task assignment and execution coordination
 * - Flow execution orchestration
 */

import WebSocket from 'ws';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AssignTaskMessage,
  KillClaudeMessage,
  Message,
  MessageType,
  Task,
  TaskStatus,
  WorkerType,
  WorkerWelcomeMessage
} from '../../shared/types.js';
import { createMessage, parseMessage, serializeMessage } from '../../shared/protocol.js';
import { FlowRegistry } from '../../flow/registry/FlowRegistry.js';
import { FlowExecutor, FlowExecutionOptions } from '../../flow/executor/FlowExecutor.js';
import { WorkspaceManager } from '../../flow/workspace/WorkspaceManager.js';
import type { Workspace, FlowMetadata } from '../../flow/types.js';
import { Shutdownable } from "../../shared/Shutdownable.js";
import { ClaudeProcessManager } from './ClaudeProcessManager.js';
import { FlowExecutionMonitor } from './FlowExecutionMonitor.js';
import { WorkerUIManager } from './WorkerUIManager.js';

/**
 * Flow Worker class (Refactored)
 */
export class FlowWorker implements Shutdownable {
  // Worker identity
  protected workerId: string;
  protected workerType: WorkerType;
  protected preferredWorkerId?: string;

  // WebSocket connection to orchestrator
  protected ws: WebSocket | null = null;
  protected wsUrl: string;
  protected reconnectDelay = 1000; // Start at 1 second
  protected maxReconnectDelay = 30000; // Max 30 seconds
  protected reconnectionAttempts = 0;
  protected maxReconnectAttempts = 10; // Stop after 10 attempts
  protected heartbeatInterval = 30000;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Task management
  protected currentTask: Task | null = null;

  // Flow engine components
  private flowRegistry: FlowRegistry;
  private flowExecutor: FlowExecutor;
  private workspaceManager: WorkspaceManager;
  private interactive: boolean;
  private projectRoot: string;

  // Specialized managers (extracted from god class)
  private claudeProcessManager: ClaudeProcessManager;
  private flowExecutionMonitor: FlowExecutionMonitor;
  private workerUIManager: WorkerUIManager;

  constructor(
    wsUrl?: string,
    projectRoot: string = process.cwd(),
    interactive: boolean = false,
    preferredWorkerId?: string,
    enableUI: boolean = true
  ) {
    // Worker identity
    this.workerId = '?'; // Will be assigned by orchestrator during Welcome
    this.workerType = WorkerType.DEV;
    this.wsUrl = wsUrl || 'ws://localhost:3738';
    this.preferredWorkerId = preferredWorkerId;

    this.interactive = interactive;
    this.projectRoot = projectRoot;
    console.log(`[FlowWorker] Initializing with project root: ${projectRoot}`);
    if (interactive) console.log(`[FlowWorker] Interactive mode enabled`);
    if (preferredWorkerId) console.log(`[FlowWorker] Preferred worker ID: ${preferredWorkerId}`);
    if (enableUI) console.log(`[FlowWorker] UI enabled`);

    // Initialize specialized managers
    this.claudeProcessManager = new ClaudeProcessManager(this.logPrefix());
    this.flowExecutionMonitor = new FlowExecutionMonitor();
    this.workerUIManager = new WorkerUIManager(enableUI);

    // Setup Claude message handler
    this.claudeProcessManager.setMessageHandler((message) => {
      this.handleClaudeMessage(message);
    });

    // Initialize Flow Engine components
    this.flowRegistry = new FlowRegistry(projectRoot);
    this.flowExecutor = new FlowExecutor(interactive, this.flowRegistry);
    this.workspaceManager = new WorkspaceManager(projectRoot);

    // Initialize UI if enabled
    if (enableUI) {
      this.workerUIManager.initialize(this.workerId, this.wsUrl, this);
    }

    // Load project flows
    this.loadFlows();
  }

  /**
   * Connect to the orchestrator
   */
  async connect(): Promise<void> {
    process.title = 'Worker X';

    return new Promise((resolve, reject) => {
      console.log(`${this.logPrefix()} Connecting to ${this.wsUrl}...`);

      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        console.log(`${this.logPrefix()} Connected`);

        // Reset reconnection attempts on successful connection
        this.reconnectionAttempts = 0;

        this.sendWorkerReady();
        this.startHeartbeat();

        // Start UI after connection
        this.workerUIManager.start();

        resolve();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const message = parseMessage(data.toString());
          this.handleMessage(message);
        } catch (error) {
          console.error(`${this.logPrefix()} Error parsing message:`, (error as Error).message);
        }
      });

      this.ws.on('close', () => {
        console.log(`${this.logPrefix()} Disconnected`);
        this.stopHeartbeat();
        this.workerUIManager.setConnected(false);
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.error(`${this.logPrefix()} WebSocket error:`, error);
        reject(error);
      });
    });
  }

  /**
   * Detect project ID from package.json or git remote origin
   * @throws Error if neither package.json nor git remote can be detected
   */
  private detectProjectId(): string {
    // Try to read package.json name
    try {
      const packageJsonPath = join(this.projectRoot, 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      if (packageJson.name) {
        console.log(`${this.logPrefix()} Detected project ID from package.json: ${packageJson.name}`);
        return packageJson.name;
      }
    } catch (error) {
      // package.json not found or doesn't have name, try git
    }

    // Try to get git remote origin
    try {
      const gitRemote = this.detectGitRemoteSync();
      if (gitRemote) {
        console.log(`${this.logPrefix()} Detected project ID from git remote: ${gitRemote}`);
        return gitRemote;
      }
    } catch (error) {
      // git command failed
    }

    throw new Error(
      'Cannot detect project ID: neither package.json name nor git remote origin found. ' +
      'Please ensure your project has a package.json with a "name" field or is a git repository with a remote.'
    );
  }

  /**
   * Synchronously detect git remote origin
   * Returns the remote name (e.g., "owner/repo" from "https://github.com/owner/repo.git")
   */
  private detectGitRemoteSync(): string | null {
    try {
      const { execSync } = require('child_process');
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: this.projectRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'], // Suppress stderr
      }).trim();

      // Extract repository name from URL
      // Handles both HTTPS and SSH formats
      const match = remoteUrl.match(/[/:]([^/:]+\/[^/.]+)(\.git)?$/);
      if (match) {
        return match[1]; // Returns "owner/repo"
      }

      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Send WORKER_READY message with project info and available flows
   */
  private sendWorkerReady(): void {
    const projectId = this.detectProjectId();
    const workspacePath = this.projectRoot;
    const availableFlows = this.buildFlowMetadata();

    this.sendMessage(createMessage(MessageType.WORKER_READY, {
      workerType: this.workerType,
      preferredId: this.preferredWorkerId,
      projectId,
      workspacePath,
      availableFlows
    }));
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.sendMessage(createMessage(MessageType.WORKER_HEARTBEAT, {
        workerId: this.workerId
      }));
    }, this.heartbeatInterval);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectionAttempts >= this.maxReconnectAttempts) {
      console.error(`${this.logPrefix()} Maximum reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      process.exit(1);
    }

    this.reconnectionAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectionAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`${this.logPrefix()} Reconnecting in ${delay}ms... (attempt ${this.reconnectionAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error(`${this.logPrefix()} Reconnection failed:`, error);
      });
    }, delay);
  }

  /**
   * Handle incoming message from orchestrator
   */
  private handleMessage(message: Message): void {
    switch (message.type) {
      case MessageType.ACK:
        // Acknowledgment received
        break;

      case MessageType.WORKER_WELCOME:
        this.handleWelcome(message as WorkerWelcomeMessage);
        break;

      case MessageType.ASSIGN_TASK:
        this.handleAssignTask(message as AssignTaskMessage);
        break;

      case MessageType.KILL_CLAUDE:
        this.handleKillClaude(message as KillClaudeMessage);
        break;

      case MessageType.PAUSE:
        console.log(`${this.logPrefix()} Received PAUSE`);
        // TODO: Implement pause logic
        break;

      case MessageType.RESUME:
        console.log(`${this.logPrefix()} Received RESUME`);
        // TODO: Implement resume logic
        break;

      case MessageType.SHUTDOWN:
        console.log(`${this.logPrefix()} Received SHUTDOWN`);
        this.shutdown();
        break;

      default:
        console.warn(`${this.logPrefix()} Unknown message type: ${message.type}`);
    }
  }

  /**
   * Handle WORKER_WELCOME message
   */
  private async handleWelcome(message: WorkerWelcomeMessage): Promise<void> {
    this.workerId = message.workerId;
    process.title = `Worker ${this.workerId}`;

    console.log(`${this.logPrefix()} Welcome received with assigned id=${message.workerId}`);

    // Update UI with actual worker ID
    this.workerUIManager.updateWorkerId(message.workerId);

    // Request a task now that we're connected
    this.sendRequestTask();
  }

  /**
   * Handle ASSIGN_TASK message
   */
  private async handleAssignTask(message: AssignTaskMessage): Promise<void> {
    this.currentTask = message.task;
    console.log(`${this.logPrefix()} Assigned task ${this.currentTask.id}: ${this.currentTask.description}`);

    try {
      await this.executeTask(this.currentTask);
    } catch (error) {
      console.error(`${this.logPrefix()} Task execution error:`, error);
      this.sendTaskFailed((error as Error).message);
    }
  }

  /**
   * Handle KILL_CLAUDE message
   */
  private handleKillClaude(message: KillClaudeMessage): void {
    console.log(`${this.logPrefix()} Kill Claude requested: ${message.reason}`);
    this.claudeProcessManager.kill();
  }

  /**
   * Handle messages from Claude processes (via hooks)
   */
  private handleClaudeMessage(message: any): void {
    switch (message.type) {
      case 'STOP_REQUESTED':
        console.log(`${this.logPrefix()} Stop requested by Claude, killing process...`);
        this.claudeProcessManager.kill();
        break;

      case 'HOOK_EVENT':
        console.log(`${this.logPrefix()} Hook event: ${message.hookName}`);
        break;

      default:
        console.log(`${this.logPrefix()} Unknown message type: ${message.type}`);
    }
  }

  /**
   * Load flows from project configuration
   */
  private async loadFlows(): Promise<void> {
    try {
      await this.flowRegistry.loadProjectFlows();
      const flowIds = this.flowRegistry.getFlowIds();
      console.log(`${this.logPrefix()} Loaded ${flowIds.length} flows: ${flowIds.join(', ')}`);

      // Start watching flows file for changes with hot-reload callback
      this.flowRegistry.startWatching();

      // Set up hot-reload callback (if FlowRegistry supports it)
      // For now, we'll implement a polling mechanism to detect changes
      this.setupFlowHotReload();
    } catch (error) {
      console.error(`${this.logPrefix()} Failed to load flows:`, error);
    }
  }

  /**
   * Setup hot-reload mechanism to detect flow changes
   * This polls the flow registry to detect changes and sends FLOWS_UPDATED
   */
  private setupFlowHotReload(): void {
    // Store initial flow state
    let lastFlowIds = new Set(this.flowRegistry.getFlowIds());

    // Poll every 2 seconds to detect changes
    setInterval(() => {
      const currentFlowIds = new Set(this.flowRegistry.getFlowIds());

      // Check if flows have changed
      const added = [...currentFlowIds].filter(id => !lastFlowIds.has(id));
      const removed = [...lastFlowIds].filter(id => !currentFlowIds.has(id));

      if (added.length > 0 || removed.length > 0) {
        console.log(`${this.logPrefix()} Flows changed - added: ${added.length}, removed: ${removed.length}`);

        // Build updated flow metadata
        const updatedFlows = this.buildFlowMetadata();

        // Detect which flows were updated (same ID but different hash)
        const updated: string[] = [];
        // For now, we'll skip detailed update detection and just mark as updated
        // This could be improved by storing previous hashes

        // Send FLOWS_UPDATED message
        this.sendFlowsUpdated(updatedFlows, {
          added,
          removed,
          updated
        });

        // Update our snapshot
        lastFlowIds = currentFlowIds;
      }
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Send FLOWS_UPDATED message
   */
  private sendFlowsUpdated(flows: any[], changes?: { added: string[]; removed: string[]; updated: string[] }): void {
    const projectId = this.detectProjectId();

    this.sendMessage(createMessage(MessageType.FLOWS_UPDATED, {
      workerId: this.workerId,
      projectId,
      flows,
      changes
    }));
  }

  /**
   * Build flow metadata for all loaded flows
   * Metadata includes version and computed hash for each flow
   * @returns Array of flow metadata objects
   */
  public buildFlowMetadata(): FlowMetadata[] {
    const flows = this.flowRegistry.getAllFlows();

    return flows.map(flow => {
      const hash = this.flowRegistry.computeFlowHash(flow);

      return {
        id: flow.id,
        version: flow.version,
        hash,
        name: flow.name,
        description: flow.description,
        inputs: flow.inputs,
        workspace: flow.workspace,
        statusTransitions: flow.statusTransitions,
      };
    });
  }

  /**
   * Start monitoring execution trace and update UI
   */
  private startTraceMonitoring(taskId: string): NodeJS.Timeout {
    const stateManager = this.workerUIManager.getStateManager();
    if (!stateManager) {
      // No UI, return dummy interval
      return setInterval(() => {}, 1000);
    }

    // Set state manager for monitor
    this.flowExecutionMonitor.setStateManager(stateManager);

    return setInterval(() => {
      const currentTask = this.currentTask;
      if (currentTask) {
        this.flowExecutionMonitor.monitorTaskTrace(currentTask);
      }
    }, 200); // Poll every 200ms
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

    // Initialize UI state if enabled
    this.workerUIManager.startTask(task.id, flow.id, flow.name, flow.steps);

    let workspace: Workspace | null = null;

    try {
      // Allocate workspace based on flow configuration
      this.sendTaskProgress('Allocating workspace...');

      // Determine workspace path
      let workspacePath: string | undefined;

      // If task specifies a workspace path, use it (OVERRIDE)
      if (task.workspacePath) {
        workspacePath = task.workspacePath;
        console.log(`${this.logPrefix()} Using task-specified workspace override: ${workspacePath}`);
      }
      // Otherwise, if manual mode but no path specified, use current working directory
      else if (flow.workspace.mode === 'manual') {
        workspacePath = process.cwd();
        console.log(`${this.logPrefix()} Using current working directory as manual workspace: ${workspacePath}`);
      }

      workspace = await this.workspaceManager.allocate({
        taskId: task.id,
        config: flow.workspace,
        existingPath: workspacePath,
        taskMetadata: {
          description: task.description,
          priority: task.priority,
          workspaceId: task.metadata?.workspaceId,  // Track workspace ID
          ...task.metadata,
        },
      });

      console.log(`${this.logPrefix()} Workspace allocated: ${workspace.id} (${workspace.path})`);
      this.sendTaskProgress(`Workspace ready: ${workspace.path}`);

      // Update UI with workspace info
      this.workerUIManager.setWorkspace(workspace.path);

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
          CLAUDE_WORKER_SOCKET: `ws://localhost:${this.claudeProcessManager.getWebSocketPort()}`,
          CLAUDE_TASK_ID: task.id,
          CLAUDE_CONTEXT_DIR: workspace.path,
          CLAUDE_CODE_STOPPABLE: this.interactive ? 'true' : 'false'
        },
        // Callback to store Claude process reference
        onClaudeProcessStarted: (process) => {
          this.claudeProcessManager.trackProcess(process);
        }
      };

      // Execute the flow
      this.sendTaskProgress('Executing flow steps...');

      // Start monitoring execution trace if UI is enabled
      let monitorInterval: NodeJS.Timeout | null = null;
      if (this.workerUIManager.isEnabled()) {
        monitorInterval = this.startTraceMonitoring(task.id);
      }

      const result = await this.flowExecutor.execute(executionOptions);

      // Stop monitoring
      if (monitorInterval) {
        clearInterval(monitorInterval);
      }

      // Store result in task
      task.flowResult = {
        status: result.success ? 'completed' : 'failed',
        outputs: result.outputs,
        error: result.error,
        trace: result.trace,
      };

      if (result.success) {
        console.log(`${this.logPrefix()} Flow completed successfully`);

        // Update UI
        this.workerUIManager.taskCompleted();

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

        // Update UI
        this.workerUIManager.taskFailed(result.error || 'Flow execution failed');

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

  /**
   * Send task started notification
   */
  protected sendTaskStarted(newStatus?: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_STARTED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      newStatus
    }));
  }

  /**
   * Send task progress update
   */
  protected sendTaskProgress(progress: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_PROGRESS, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      progress
    }));
  }

  /**
   * Send task completed notification
   */
  protected sendTaskCompleted(result?: any, newStatus?: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_COMPLETED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      result,
      newStatus
    }));

    this.currentTask = null;

    // Request another task after completion
    this.sendRequestTask();
  }

  /**
   * Send task failed notification
   */
  protected sendTaskFailed(error: string, newStatus?: TaskStatus): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_FAILED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      error,
      newStatus
    }));

    this.currentTask = null;

    // Request another task after failure
    this.sendRequestTask();
  }

  /**
   * Send task question
   */
  protected sendTaskQuestion(question: string): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.TASK_QUESTION, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      question
    }));
  }

  /**
   * Send stop requested (from Claude hook)
   */
  protected sendStopRequested(claudePid: number): void {
    if (!this.currentTask) return;

    this.sendMessage(createMessage(MessageType.STOP_REQUESTED, {
      workerId: this.workerId,
      taskId: this.currentTask.id,
      claudePid
    }));
  }

  /**
   * Send hook event
   */
  protected sendHookEvent(hookName: string, data: any): void {
    this.sendMessage(createMessage(MessageType.HOOK_EVENT, {
      workerId: this.workerId,
      hookName,
      data
    }));
  }

  /**
   * Send REQUEST_TASK message to request a new task
   */
  protected sendRequestTask(): void {
    this.sendMessage(createMessage(MessageType.REQUEST_TASK, {
      workerId: this.workerId
    }));
  }

  /**
   * Send a message to orchestrator
   */
  protected sendMessage(message: Message): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(message));
    } else {
      console.error(`${this.logPrefix()} Cannot send message, not connected`);
    }
  }

  protected logPrefix(): string {
    return `[FlowWorker ${this.workerId}]`;
  }

  /**
   * Kill Claude process if running
   */
  killClaude(): void {
    this.claudeProcessManager.kill();
  }

  /**
   * Cleanup on shutdown
   */
  shutdown(): void {
    console.log(`${this.logPrefix()} Shutting down...`);

    // Stop UI
    this.workerUIManager.stop();

    // Stop watching flows file
    this.flowRegistry.stopWatching();

    // Cleanup Claude process manager
    this.claudeProcessManager.shutdown();

    // Cleanup all workspaces
    this.workspaceManager.cleanupAll();

    // Close WebSocket connection
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
    }
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

  const noUiArg = process.argv.includes('--no-ui');

  // @formatter:off
  // UI mode is always enabled (terminal-kit)
  const enableUI = !noUiArg;
  // @formatter:on

  // Parse worker ID from CLI args or environment variable
  const workerIdArg = process.argv.find(arg => arg.startsWith('--worker-id='));
  const preferredWorkerId = workerIdArg
    ? workerIdArg.split('=')[1]
    : process.env.WORKER_ID;

  const projectRoot = process.cwd();
  const worker = new FlowWorker(undefined, projectRoot, interactive, preferredWorkerId, enableUI);

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
