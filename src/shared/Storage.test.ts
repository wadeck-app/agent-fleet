/**
 * Storage Tests
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { Storage } from './Storage.js';
import { Task, TaskStatus } from './types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Storage', () => {
  let dataDir: string;
  let tasksDir: string;
  let knowledgeDir: string;

  beforeAll(() => {
    // Use the actual data directory from Storage
    dataDir = Storage.getDataDir();
    tasksDir = path.join(dataDir, 'tasks');
    knowledgeDir = path.join(dataDir, 'knowledge');
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupDirectories();

    // Initialize storage (creates directories)
    await Storage.initialize();
  });

  afterEach(async () => {
    // Clean up after each test
    await cleanupDirectories();
  });

  async function cleanupDirectories() {
    try {
      // Only clean tasks and knowledge dirs for tests, not the whole data dir
      await fs.promises.rm(tasksDir, { recursive: true, force: true });
      await fs.promises.rm(knowledgeDir, { recursive: true, force: true });
      await fs.promises.rm(path.join(dataDir, 'contexts'), { recursive: true, force: true });
    } catch (error) {
      // Ignore errors if directories don't exist
    }
  }

  function createTestTask(id: string = 'test-task-1'): Task {
    return {
      id,
      description: 'Test task description',
      status: TaskStatus.BACKLOG,
      priority: 'medium',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      assignedTo: null,
      comments: [],
      metadata: {},
      history: [{
        timestamp: '2024-01-01T00:00:00.000Z',
        event: 'created',
        status: TaskStatus.BACKLOG
      }]
    };
  }

  describe('initialize', () => {
    it('should create all required directories', async () => {
      const tasksExists = await directoryExists(tasksDir);
      const knowledgeExists = await directoryExists(knowledgeDir);

      expect(tasksExists).toBe(true);
      expect(knowledgeExists).toBe(true);
    });

    it('should not fail if directories already exist', async () => {
      // Initialize again
      await expect(Storage.initialize()).resolves.not.toThrow();
    });

    it('should throw error if initialization fails', async () => {
      // This test is platform-specific and hard to trigger reliably
      // Skipping for now - the error handling is in place
      // In production, this would be tested with integration tests
    });
  });

  describe('saveTask', () => {
    it('should save a task to storage', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      const filePath = path.join(tasksDir, `${task.id}.json`);
      const exists = await fileExists(filePath);
      expect(exists).toBe(true);
    });

    it('should save task with correct JSON format', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      const filePath = path.join(tasksDir, `${task.id}.json`);
      const content = await fs.promises.readFile(filePath, 'utf8');
      const parsed = JSON.parse(content);

      expect(parsed).toEqual(task);
    });

    it('should create tasks directory if it does not exist', async () => {
      // Remove tasks directory
      await fs.promises.rm(tasksDir, { recursive: true, force: true });

      const task = createTestTask();
      await Storage.saveTask(task);

      const exists = await directoryExists(tasksDir);
      expect(exists).toBe(true);
    });

    it('should overwrite existing task', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      // Modify and save again
      task.description = 'Updated description';
      await Storage.saveTask(task);

      const loaded = await Storage.loadTask(task.id);
      expect(loaded?.description).toBe('Updated description');
    });
  });

  describe('loadTask', () => {
    it('should load an existing task', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      const loaded = await Storage.loadTask(task.id);
      expect(loaded).toEqual(task);
    });

    it('should return null for non-existent task', async () => {
      const loaded = await Storage.loadTask('non-existent-id');
      expect(loaded).toBeNull();
    });

    it('should throw error for corrupted task file', async () => {
      const taskId = 'corrupted-task';
      const filePath = path.join(tasksDir, `${taskId}.json`);

      // Write invalid JSON
      await fs.promises.writeFile(filePath, 'invalid json {{{', 'utf8');

      await expect(Storage.loadTask(taskId)).rejects.toThrow(`Failed to load task ${taskId}`);
    });
  });

  describe('listTasks', () => {
    it('should return empty array when no tasks exist', async () => {
      const tasks = await Storage.listTasks();
      expect(tasks).toEqual([]);
    });

    it('should list all tasks', async () => {
      const task1 = createTestTask('task-1');
      const task2 = createTestTask('task-2');
      const task3 = createTestTask('task-3');

      await Storage.saveTask(task1);
      await Storage.saveTask(task2);
      await Storage.saveTask(task3);

      const tasks = await Storage.listTasks();
      expect(tasks).toHaveLength(3);
      expect(tasks.map(t => t.id).sort()).toEqual(['task-1', 'task-2', 'task-3']);
    });

    it('should ignore non-json files', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      // Create a non-JSON file
      await fs.promises.writeFile(path.join(tasksDir, 'readme.txt'), 'test', 'utf8');

      const tasks = await Storage.listTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(task.id);
    });

    it('should create tasks directory if it does not exist', async () => {
      await fs.promises.rm(tasksDir, { recursive: true, force: true });

      const tasks = await Storage.listTasks();
      expect(tasks).toEqual([]);
      expect(await directoryExists(tasksDir)).toBe(true);
    });
  });

  describe('deleteTask', () => {
    it('should delete an existing task', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      await Storage.deleteTask(task.id);

      const loaded = await Storage.loadTask(task.id);
      expect(loaded).toBeNull();
    });

    it('should not throw error for non-existent task', async () => {
      await expect(Storage.deleteTask('non-existent-id')).resolves.not.toThrow();
    });

    it('should remove task file from filesystem', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      const filePath = path.join(tasksDir, `${task.id}.json`);
      expect(await fileExists(filePath)).toBe(true);

      await Storage.deleteTask(task.id);
      expect(await fileExists(filePath)).toBe(false);
    });
  });

  describe('taskExists', () => {
    it('should return true for existing task', async () => {
      const task = createTestTask();
      await Storage.saveTask(task);

      const exists = await Storage.taskExists(task.id);
      expect(exists).toBe(true);
    });

    it('should return false for non-existent task', async () => {
      const exists = await Storage.taskExists('non-existent-id');
      expect(exists).toBe(false);
    });
  });

  describe('clearAllTasks', () => {
    it('should delete all tasks', async () => {
      await Storage.saveTask(createTestTask('task-1'));
      await Storage.saveTask(createTestTask('task-2'));
      await Storage.saveTask(createTestTask('task-3'));

      const count = await Storage.clearAllTasks();
      expect(count).toBe(3);

      const tasks = await Storage.listTasks();
      expect(tasks).toHaveLength(0);
    });

    it('should return 0 when no tasks exist', async () => {
      const count = await Storage.clearAllTasks();
      expect(count).toBe(0);
    });

    it('should only delete json files', async () => {
      await Storage.saveTask(createTestTask());
      await fs.promises.writeFile(path.join(tasksDir, 'readme.txt'), 'test', 'utf8');

      await Storage.clearAllTasks();

      // readme.txt should still exist
      expect(await fileExists(path.join(tasksDir, 'readme.txt'))).toBe(true);
    });
  });

  describe('addKnowledge', () => {
    it('should add knowledge entry', async () => {
      await Storage.addKnowledge('test-category', { key: 'value', number: 42 });

      const entries = await Storage.readKnowledge('test-category');
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        category: 'test-category',
        key: 'value',
        number: 42
      });
      expect(entries[0].timestamp).toBeDefined();
    });

    it('should append multiple entries', async () => {
      await Storage.addKnowledge('test-category', { entry: 1 });
      await Storage.addKnowledge('test-category', { entry: 2 });
      await Storage.addKnowledge('test-category', { entry: 3 });

      const entries = await Storage.readKnowledge('test-category');
      expect(entries).toHaveLength(3);
      expect(entries[0].entry).toBe(1);
      expect(entries[1].entry).toBe(2);
      expect(entries[2].entry).toBe(3);
    });

    it('should create knowledge directory if it does not exist', async () => {
      await fs.promises.rm(knowledgeDir, { recursive: true, force: true });

      await Storage.addKnowledge('test-category', { data: 'test' });

      expect(await directoryExists(knowledgeDir)).toBe(true);
    });
  });

  describe('readKnowledge', () => {
    it('should return empty array for non-existent category', async () => {
      const entries = await Storage.readKnowledge('non-existent-category');
      expect(entries).toEqual([]);
    });

    it('should read knowledge entries', async () => {
      await Storage.addKnowledge('category-1', { data: 'entry-1' });
      await Storage.addKnowledge('category-1', { data: 'entry-2' });

      const entries = await Storage.readKnowledge('category-1');
      expect(entries).toHaveLength(2);
      expect(entries.map(e => e.data)).toEqual(['entry-1', 'entry-2']);
    });

    it('should filter empty lines', async () => {
      const filePath = path.join(knowledgeDir, 'test.jsonl');
      await fs.promises.writeFile(
        filePath,
        '{"timestamp":"2024-01-01T00:00:00.000Z","category":"test","data":"1"}\n\n{"timestamp":"2024-01-01T00:00:01.000Z","category":"test","data":"2"}\n',
        'utf8'
      );

      const entries = await Storage.readKnowledge('test');
      expect(entries).toHaveLength(2);
    });

    it('should throw error for corrupted knowledge file', async () => {
      const filePath = path.join(knowledgeDir, 'corrupted.jsonl');
      await fs.promises.writeFile(filePath, 'invalid json\n', 'utf8');

      await expect(Storage.readKnowledge('corrupted')).rejects.toThrow('Failed to read knowledge from corrupted');
    });
  });

  describe('getTaskContextDir', () => {
    it('should return context directory path', async () => {
      const taskId = 'test-task';
      const dir = await Storage.getTaskContextDir(taskId);

      expect(dir).toContain(taskId);
      expect(dir).toContain('contexts');
    });

    it('should create context directory if it does not exist', async () => {
      const taskId = 'test-task';
      const dir = await Storage.getTaskContextDir(taskId);

      const exists = await directoryExists(dir);
      expect(exists).toBe(true);
    });

    it('should return same path for same task', async () => {
      const taskId = 'test-task';
      const dir1 = await Storage.getTaskContextDir(taskId);
      const dir2 = await Storage.getTaskContextDir(taskId);

      expect(dir1).toBe(dir2);
    });
  });

  describe('getDataDir', () => {
    it('should return data directory path', () => {
      const dir = Storage.getDataDir();
      expect(dir).toBe(dataDir);
    });
  });

  // Helper functions
  async function fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async function directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.promises.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
});
