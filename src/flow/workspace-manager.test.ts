/**
 * Tests for WorkspaceManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceManager, WorkspaceAllocationError } from './workspace-manager.js';
import type { WorkspaceConfig } from './types.js';

describe('WorkspaceManager', () => {
  const testRoot = path.join(process.cwd(), '.test-workspaces');
  let manager: WorkspaceManager;

  beforeEach(() => {
    // Create test root directory
    if (!fs.existsSync(testRoot)) {
      fs.mkdirSync(testRoot, { recursive: true });
    }

    manager = new WorkspaceManager(testRoot);
  });

  afterEach(async () => {
    // Cleanup all workspaces
    await manager.cleanupAll();

    // Wait a bit for Windows to release file handles
    await new Promise(resolve => setTimeout(resolve, 100));

    // Remove test directory with retry for Windows file locking
    await removeTestDirectory(testRoot);
  });

  // Helper function to remove directory with retry (Windows file locking workaround)
  async function removeTestDirectory(dir: string, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        if (fs.existsSync(dir)) {
          fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        }
        return;
      } catch (error: any) {
        if (i === retries - 1) {
          // Last attempt failed, but don't fail the test
          console.warn(`Warning: Could not remove test directory: ${error.message}`);
          return;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
  }

  describe('Isolated Workspaces', () => {
    it('should create an isolated workspace', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      expect(workspace).toBeDefined();
      expect(workspace.mode).toBe('isolated');
      expect(workspace.concurrency.locked).toBe(true);
      expect(workspace.concurrency.activeTasks.has('task-1')).toBe(true);
      expect(fs.existsSync(workspace.path)).toBe(true);
    });

    it('should create separate isolated workspaces for different tasks', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace1 = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const workspace2 = await manager.allocate({
        taskId: 'task-2',
        config,
      });

      expect(workspace1.id).not.toBe(workspace2.id);
      expect(workspace1.path).not.toBe(workspace2.path);
    });

    it('should reuse workspace for same task', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace1 = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const workspace2 = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      expect(workspace1.id).toBe(workspace2.id);
    });

    it('should cleanup isolated workspace after release', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const workspacePath = workspace.path;
      expect(fs.existsSync(workspacePath)).toBe(true);

      await manager.release(workspace.id, 'task-1');

      // Workspace should be cleaned up
      expect(manager.getWorkspace(workspace.id)).toBeUndefined();
      expect(fs.existsSync(workspacePath)).toBe(false);
    });
  });

  describe('Shared Workspaces', () => {
    it('should create a shared workspace', async () => {
      const config: WorkspaceConfig = {
        mode: 'shared',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'always',
        concurrencyKey: 'test-shared',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      expect(workspace).toBeDefined();
      expect(workspace.mode).toBe('shared');
      expect(workspace.concurrency.locked).toBe(false);
      expect(workspace.concurrency.key).toBe('test-shared');
    });

    it('should reuse shared workspace with always policy', async () => {
      const config: WorkspaceConfig = {
        mode: 'shared',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'always',
        concurrencyKey: 'test-shared',
      };

      const workspace1 = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const workspace2 = await manager.allocate({
        taskId: 'task-2',
        config,
      });

      // Should reuse the same workspace
      expect(workspace1.id).toBe(workspace2.id);
      expect(workspace1.concurrency.activeTasks.size).toBe(2);
      expect(workspace1.concurrency.activeTasks.has('task-1')).toBe(true);
      expect(workspace1.concurrency.activeTasks.has('task-2')).toBe(true);
    });

    it('should create separate shared workspaces for different concurrency keys', async () => {
      const config1: WorkspaceConfig = {
        mode: 'shared',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'always',
        concurrencyKey: 'key-1',
      };

      const config2: WorkspaceConfig = {
        mode: 'shared',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'always',
        concurrencyKey: 'key-2',
      };

      const workspace1 = await manager.allocate({
        taskId: 'task-1',
        config: config1,
      });

      const workspace2 = await manager.allocate({
        taskId: 'task-2',
        config: config2,
      });

      expect(workspace1.id).not.toBe(workspace2.id);
    });

    it('should not cleanup shared workspace after release', async () => {
      const config: WorkspaceConfig = {
        mode: 'shared',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'always',
        concurrencyKey: 'test-shared',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const workspacePath = workspace.path;

      await manager.release(workspace.id, 'task-1');

      // Shared workspace should still exist
      expect(manager.getWorkspace(workspace.id)).toBeDefined();
      expect(fs.existsSync(workspacePath)).toBe(true);
    });

    it('should create new shared workspace with never reuse policy', async () => {
      const config: WorkspaceConfig = {
        mode: 'shared',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
        concurrencyKey: 'test-shared',
      };

      const workspace1 = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const workspace2 = await manager.allocate({
        taskId: 'task-2',
        config,
      });

      // Should create separate workspaces
      expect(workspace1.id).not.toBe(workspace2.id);
    });
  });

  describe('Manual Workspaces', () => {
    it('should allocate manual workspace with existing path', async () => {
      // Create a manual workspace directory
      const manualPath = path.join(testRoot, 'manual-workspace');
      fs.mkdirSync(manualPath, { recursive: true });

      const config: WorkspaceConfig = {
        mode: 'manual',
        gitStrategy: 'any',
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
        existingPath: manualPath,
      });

      expect(workspace).toBeDefined();
      expect(workspace.mode).toBe('manual');
      expect(workspace.path).toBe(manualPath);
      expect(workspace.concurrency.locked).toBe(true);
    });

    it('should throw error for manual mode without existing path', async () => {
      const config: WorkspaceConfig = {
        mode: 'manual',
        gitStrategy: 'any',
        reusePolicy: 'never',
      };

      await expect(
        manager.allocate({
          taskId: 'task-1',
          config,
        })
      ).rejects.toThrow(WorkspaceAllocationError);
    });

    it('should throw error for non-existent manual workspace path', async () => {
      const config: WorkspaceConfig = {
        mode: 'manual',
        gitStrategy: 'any',
        reusePolicy: 'never',
      };

      await expect(
        manager.allocate({
          taskId: 'task-1',
          config,
          existingPath: '/non/existent/path',
        })
      ).rejects.toThrow(WorkspaceAllocationError);
    });

    it('should not cleanup manual workspace after release', async () => {
      const manualPath = path.join(testRoot, 'manual-workspace');
      fs.mkdirSync(manualPath, { recursive: true });

      const config: WorkspaceConfig = {
        mode: 'manual',
        gitStrategy: 'any',
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
        existingPath: manualPath,
      });

      await manager.release(workspace.id, 'task-1');

      // Manual workspace directory should still exist
      expect(fs.existsSync(manualPath)).toBe(true);
    });
  });

  describe('Workspace Stats and Queries', () => {
    it('should return correct workspace stats', async () => {
      const isolatedConfig: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const sharedConfig: WorkspaceConfig = {
        mode: 'shared',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'always',
        concurrencyKey: 'test',
      };

      await manager.allocate({ taskId: 'task-1', config: isolatedConfig });
      await manager.allocate({ taskId: 'task-2', config: isolatedConfig });
      await manager.allocate({ taskId: 'task-3', config: sharedConfig });
      await manager.allocate({ taskId: 'task-4', config: sharedConfig });

      const stats = manager.getStats();

      expect(stats.total).toBe(3); // 2 isolated + 1 shared (reused)
      expect(stats.isolated).toBe(2);
      expect(stats.shared).toBe(1);
      expect(stats.totalActiveTasks).toBe(4);
    });

    it('should get workspace by ID', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const retrieved = manager.getWorkspace(workspace.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(workspace.id);
    });

    it('should get workspace for task', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const retrieved = manager.getWorkspaceForTask('task-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(workspace.id);
    });

    it('should check if workspace is active', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      expect(manager.isActive(workspace.id)).toBe(true);

      await manager.release(workspace.id, 'task-1');

      // After release and cleanup, workspace no longer exists
      expect(manager.isActive(workspace.id)).toBe(false);
    });

    it('should update workspace last used time with touch', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      const workspace = await manager.allocate({
        taskId: 'task-1',
        config,
      });

      const originalLastUsed = workspace.lastUsedAt;
      const originalUsageCount = workspace.usageCount;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      manager.touch(workspace.id);

      const updated = manager.getWorkspace(workspace.id);
      expect(updated?.lastUsedAt).not.toBe(originalLastUsed);
      expect(updated?.usageCount).toBe(originalUsageCount + 1);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup all workspaces', async () => {
      const config: WorkspaceConfig = {
        mode: 'isolated',
        gitStrategy: undefined as any, // Skip git for tests
        reusePolicy: 'never',
      };

      await manager.allocate({ taskId: 'task-1', config });
      await manager.allocate({ taskId: 'task-2', config });

      expect(manager.getStats().total).toBe(2);

      await manager.cleanupAll();

      expect(manager.getStats().total).toBe(0);
    });
  });
});
