/**
 * Workspace Manager (Phase 1 - Basic)
 *
 * Manages workspace lifecycle: creation, allocation, tracking, and cleanup.
 * Phase 1 implementation focuses on isolated workspaces only.
 * Advanced features (shared workspaces, git integration, pooling) will be added in Phase 4.
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type {
  Workspace,
  WorkspaceMode,
  WorkspaceConfig,
  ReusePolicy,
} from './types.js';

/**
 * Workspace allocation error
 */
export class WorkspaceAllocationError extends Error {
  constructor(message: string) {
    super(`Workspace allocation error: ${message}`);
    this.name = 'WorkspaceAllocationError';
  }
}

/**
 * Options for allocating a workspace
 */
export interface WorkspaceAllocationOptions {
  /** Task ID requesting the workspace */
  taskId: string;

  /** Workspace configuration from flow */
  config: WorkspaceConfig;

  /** Optional base path for workspace (defaults to .agent-fleet/workspaces) */
  basePath?: string;
}

/**
 * Workspace Manager handles workspace lifecycle
 */
export class WorkspaceManager {
  private workspaces: Map<string, Workspace> = new Map();
  private workspacesByTask: Map<string, string> = new Map(); // taskId -> workspaceId
  private basePath: string;

  /**
   * Create a new workspace manager
   * @param projectRoot - Root directory of the project
   */
  constructor(projectRoot: string) {
    this.basePath = path.join(projectRoot, '.agent-fleet', 'workspaces');
    this.ensureBaseDirectory();
  }

  /**
   * Ensure the base workspace directory exists
   */
  private ensureBaseDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * Allocate a workspace for a task
   * Phase 1: Only supports isolated workspaces with 'never' reuse policy
   *
   * @param options - Allocation options
   * @returns Allocated workspace
   * @throws WorkspaceAllocationError if allocation fails
   */
  public async allocate(options: WorkspaceAllocationOptions): Promise<Workspace> {
    const { taskId, config } = options;

    // Phase 1: Only support isolated workspaces
    if (config.mode === 'shared') {
      throw new WorkspaceAllocationError(
        'Shared workspaces not yet implemented (coming in Phase 4)'
      );
    }

    // Phase 1: Only support 'never' reuse policy
    if (config.reusePolicy !== 'never') {
      throw new WorkspaceAllocationError(
        `Reuse policy '${config.reusePolicy}' not yet implemented (coming in Phase 4)`
      );
    }

    // Check if task already has a workspace
    if (this.workspacesByTask.has(taskId)) {
      const existingWorkspaceId = this.workspacesByTask.get(taskId)!;
      const existingWorkspace = this.workspaces.get(existingWorkspaceId);
      if (existingWorkspace) {
        return existingWorkspace;
      }
    }

    // Create new isolated workspace
    return this.createIsolatedWorkspace(taskId, config);
  }

  /**
   * Create a new isolated workspace
   */
  private createIsolatedWorkspace(
    taskId: string,
    config: WorkspaceConfig
  ): Workspace {
    const workspaceId = uuidv4();
    const workspacePath = path.join(this.basePath, workspaceId);

    // Create workspace directory
    try {
      fs.mkdirSync(workspacePath, { recursive: true });
    } catch (error) {
      throw new WorkspaceAllocationError(
        `Failed to create workspace directory: ${error}`
      );
    }

    const workspace: Workspace = {
      id: workspaceId,
      path: workspacePath,
      mode: 'isolated',
      concurrency: {
        key: config.concurrencyKey || workspaceId,
        activeTasks: new Set([taskId]),
        locked: true, // Isolated workspaces are always locked
      },
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      usageCount: 1,
    };

    // Register workspace
    this.workspaces.set(workspaceId, workspace);
    this.workspacesByTask.set(taskId, workspaceId);

    console.log(`Created isolated workspace ${workspaceId} for task ${taskId}`);
    return workspace;
  }

  /**
   * Release a workspace (remove task from active users)
   *
   * @param workspaceId - Workspace identifier
   * @param taskId - Task identifier releasing the workspace
   */
  public async release(workspaceId: string, taskId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      console.warn(`Attempted to release non-existent workspace: ${workspaceId}`);
      return;
    }

    // Remove task from active tasks
    workspace.concurrency.activeTasks.delete(taskId);
    this.workspacesByTask.delete(taskId);

    console.log(
      `Released workspace ${workspaceId} from task ${taskId}. ` +
        `Active tasks: ${workspace.concurrency.activeTasks.size}`
    );

    // For isolated workspaces, cleanup when no active tasks
    if (workspace.mode === 'isolated' && workspace.concurrency.activeTasks.size === 0) {
      await this.cleanup(workspaceId);
    }
  }

  /**
   * Cleanup a workspace (delete from disk and registry)
   *
   * @param workspaceId - Workspace identifier
   */
  public async cleanup(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return;
    }

    console.log(`Cleaning up workspace ${workspaceId}`);

    // Remove directory
    try {
      if (fs.existsSync(workspace.path)) {
        fs.rmSync(workspace.path, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Failed to remove workspace directory: ${error}`);
    }

    // Remove from registry
    this.workspaces.delete(workspaceId);

    // Remove task associations
    for (const [taskId, wId] of this.workspacesByTask.entries()) {
      if (wId === workspaceId) {
        this.workspacesByTask.delete(taskId);
      }
    }
  }

  /**
   * Get a workspace by ID
   *
   * @param workspaceId - Workspace identifier
   * @returns Workspace or undefined if not found
   */
  public getWorkspace(workspaceId: string): Workspace | undefined {
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get workspace for a task
   *
   * @param taskId - Task identifier
   * @returns Workspace or undefined if task has no workspace
   */
  public getWorkspaceForTask(taskId: string): Workspace | undefined {
    const workspaceId = this.workspacesByTask.get(taskId);
    if (!workspaceId) {
      return undefined;
    }
    return this.workspaces.get(workspaceId);
  }

  /**
   * Get all active workspaces
   *
   * @returns Array of all workspaces
   */
  public getAllWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  /**
   * Get workspace statistics
   *
   * @returns Statistics object
   */
  public getStats() {
    const workspaces = this.getAllWorkspaces();
    const isolated = workspaces.filter((w) => w.mode === 'isolated').length;
    const shared = workspaces.filter((w) => w.mode === 'shared').length;
    const totalActiveTasks = workspaces.reduce(
      (sum, w) => sum + w.concurrency.activeTasks.size,
      0
    );

    return {
      total: workspaces.length,
      isolated,
      shared,
      totalActiveTasks,
    };
  }

  /**
   * Cleanup all workspaces (useful for shutdown)
   */
  public async cleanupAll(): Promise<void> {
    console.log(`Cleaning up all ${this.workspaces.size} workspaces`);

    const workspaceIds = Array.from(this.workspaces.keys());
    for (const workspaceId of workspaceIds) {
      await this.cleanup(workspaceId);
    }
  }

  /**
   * Update workspace last used time
   *
   * @param workspaceId - Workspace identifier
   */
  public touch(workspaceId: string): void {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      workspace.lastUsedAt = new Date().toISOString();
      workspace.usageCount++;
    }
  }

  /**
   * Check if a workspace is active (has active tasks)
   *
   * @param workspaceId - Workspace identifier
   * @returns True if workspace has active tasks
   */
  public isActive(workspaceId: string): boolean {
    const workspace = this.workspaces.get(workspaceId);
    return workspace ? workspace.concurrency.activeTasks.size > 0 : false;
  }

  /**
   * Get the base path for workspaces
   */
  public getBasePath(): string {
    return this.basePath;
  }
}
