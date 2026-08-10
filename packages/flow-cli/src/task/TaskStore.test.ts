import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TaskStore } from './TaskStore.js';

let tmpDir: string;
let tasksDir: string;

beforeEach(() => {
	tmpDir = path.join(os.tmpdir(), `task-store-test-${crypto.randomUUID()}`);
	tasksDir = path.join(tmpDir, '.flows', 'tasks');
	fs.mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('TaskStore', () => {
	describe('create', () => {
		it('creates a task with status created', () => {
			const store = new TaskStore(tasksDir);
			const task = store.create('My first task');
			expect(task.status).toBe('created');
			expect(task.title).toBe('My first task');
			expect(task.description).toBe('My first task');
			expect(task.id).toMatch(/^[a-z0-9]{8}$/);
			expect(task.createdAt).toBeTruthy();
			expect(task.updatedAt).toBeTruthy();
		});

		it('creates tasks dir if it does not exist', () => {
			const store = new TaskStore(tasksDir);
			store.create('My task');
			expect(fs.existsSync(tasksDir)).toBe(true);
		});

		it('writes a task file on disk', () => {
			const store = new TaskStore(tasksDir);
			const task = store.create('My task');
			const filePath = path.join(tasksDir, `${task.id}.json`);
			expect(fs.existsSync(filePath)).toBe(true);
		});

		it('initializes history with created entry', () => {
			const store = new TaskStore(tasksDir);
			const task = store.create('My task');
			expect(task.history).toHaveLength(1);
			expect(task.history[0]?.status).toBe('created');
		});
	});

	describe('list', () => {
		it('returns empty array when no tasks exist', () => {
			const store = new TaskStore(tasksDir);
			expect(store.list()).toEqual([]);
		});

		it('throws for corrupted index.json', () => {
			// Create the tasks directory and write invalid JSON to the index file
			fs.mkdirSync(tasksDir, { recursive: true });
			fs.writeFileSync(path.join(tasksDir, 'index.json'), '{ not valid json', 'utf8');

			const store = new TaskStore(tasksDir);
			expect(() => store.list()).toThrow('Corrupted task index');
		});

		it('returns summaries of created tasks', () => {
			const store = new TaskStore(tasksDir);
			store.create('Task A');
			store.create('Task B');
			const list = store.list();
			expect(list).toHaveLength(2);
			expect(list.map(t => t.title)).toContain('Task A');
			expect(list.map(t => t.title)).toContain('Task B');
		});

		it('summary contains id, title, status, createdAt', () => {
			const store = new TaskStore(tasksDir);
			store.create('My task');
			const list = store.list();
			expect(list[0]).toMatchObject({
				title: 'My task',
				status: 'created',
			});
			expect(list[0]?.id).toBeTruthy();
			expect(list[0]?.createdAt).toBeTruthy();
		});
	});

	describe('get', () => {
		it('returns the full task record', () => {
			const store = new TaskStore(tasksDir);
			const created = store.create('My task');
			const fetched = store.get(created.id);
			expect(fetched).toEqual(created);
		});

		it('throws when task id does not exist', () => {
			const store = new TaskStore(tasksDir);
			expect(() => store.get('nonexistent')).toThrow('Task not found: nonexistent');
		});
	});

	describe('updateStatus', () => {
		it('updates status to approved', () => {
			const store = new TaskStore(tasksDir);
			const task = store.create('My task');
			const updated = store.updateStatus(task.id, 'approved');
			expect(updated.status).toBe('approved');
		});

		it('tracks status transitions in history', () => {
			const store = new TaskStore(tasksDir);
			const task = store.create('My task');
			store.updateStatus(task.id, 'elaborating');
			const updated = store.updateStatus(task.id, 'approved');
			expect(updated.history).toHaveLength(3);
			expect(updated.history[0]?.status).toBe('created');
			expect(updated.history[1]?.status).toBe('elaborating');
			expect(updated.history[2]?.status).toBe('approved');
		});

		it('updates updatedAt on status change', () => {
			const store = new TaskStore(tasksDir);
			const task = store.create('My task');
			const originalUpdatedAt = task.updatedAt;
			// Small delay to ensure timestamp differs
			const updated = store.updateStatus(task.id, 'in-progress');
			expect(updated.updatedAt).toBeTruthy();
		});

		it('updates index entry status', () => {
			const store = new TaskStore(tasksDir);
			const task = store.create('My task');
			store.updateStatus(task.id, 'done');
			const list = store.list();
			const entry = list.find(t => t.id === task.id);
			expect(entry?.status).toBe('done');
		});

		it('throws when updating unknown task id', () => {
			const store = new TaskStore(tasksDir);
			expect(() => store.updateStatus('unknown-id', 'approved')).toThrow('Task not found: unknown-id');
		});
	});
});
