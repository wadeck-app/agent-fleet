/**
 * Flow Worker
 *
 * Executes flows defined in the Flow Engine via FlowExecutor.
 * Integrates WorkspaceManager, FlowRegistry, and FlowExecutor with the orchestrator.
 */

import { BaseWorker } from './base-worker.js';
import { Task, WorkerType, TaskStatus } from '../shared/types.js';
import { FlowRegistry } from '../flow/flow-registry.js';
import { FlowExecutor, FlowExecutionOptions } from '../flow/flow-executor.js';
import { WorkspaceManager } from '../flow/workspace-manager.js';
import type { Workspace } from '../flow/types.js';
import { fileURLToPath } from 'url';
import path from 'path';

export class FlowWorker extends BaseWorker {
  private flowRegistry: FlowRegistry;
  private flowExecutor: FlowExecutor;
  private workspaceManager: WorkspaceManager;

  constructor(wsUrl?: string, projectRoot: string = process.cwd()) {
    super(WorkerType.DEV, wsUrl);

    console.log(`[FlowWorker] Initializing with project root: ${projectRoot}`);

    // Initialize Flow Engine components
    this.flowRegistry = new FlowRegistry(projectRoot);
    this.flowExecutor = new FlowExecutor();
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

    console.log(`${this.logPrefix()} Executing flow: ${flow.name} (${flow.id})`);
    this.sendTaskStarted(TaskStatus.IN_PROGRESS);

    let workspace: Workspace | null = null;

    try {
      // Allocate workspace based on flow configuration
      this.sendTaskProgress('Allocating workspace...');
      workspace = await this.workspaceManager.allocate({
        taskId: task.id,
        config: flow.workspace,
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
          TaskStatus.REVIEW
        );
      } else {
        console.error(`${this.logPrefix()} Flow failed: ${result.error}`);
        throw new Error(result.error || 'Flow execution failed');
      }

    } catch (error) {
      console.error(`${this.logPrefix()} Task execution error:`, error);

      // Store error in task
      task.flowResult = {
        status: 'failed',
        error: (error as Error).message,
      };

      throw error;
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
   * Cleanup on shutdown
   */
  shutdown(): void {
    console.log(`${this.logPrefix()} Shutting down...`);

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

  const projectRoot = process.cwd();
  const worker = new FlowWorker(undefined, projectRoot);

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
