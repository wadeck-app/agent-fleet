import type { Intervention, Task } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';
import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryOrchestratorStorage } from './InMemoryOrchestratorStorage';

function makeTask(overrides: Partial<Task> = {}): Task {
	return {
		id: 'task-1',
		description: 'Test task',
		status: TaskStatus.BACKLOG,
		priority: 'medium',
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		assignedTo: null,
		comments: [],
		metadata: {},
		history: [],
		...overrides,
	};
}

function makeIntervention(overrides: Partial<Intervention> = {}): Intervention {
	return {
		id: 'intervention-1',
		taskId: 'task-1',
		type: 'approval',
		status: 'pending',
		createdAt: new Date().toISOString(),
		source: { type: 'flow_step' },
		config: { title: 'Test' },
		blocking: true,
		...overrides,
	};
}

describe('InMemoryOrchestratorStorage', () => {
	let storage: InMemoryOrchestratorStorage;

	beforeEach(() => {
		storage = new InMemoryOrchestratorStorage();
	});

	describe('Task operations', () => {
		it('should save and load a task', async () => {
			const task = makeTask();
			await storage.saveTask(task);
			const loaded = await storage.loadTask('task-1');
			expect(loaded).toEqual(task);
		});

		it('should return null for non-existent task', async () => {
			const loaded = await storage.loadTask('non-existent');
			expect(loaded).toBeNull();
		});

		it('should list all tasks', async () => {
			await storage.saveTask(makeTask({ id: 'task-1' }));
			await storage.saveTask(makeTask({ id: 'task-2' }));
			const tasks = await storage.listTasks();
			expect(tasks).toHaveLength(2);
		});

		it('should return empty array when no tasks', async () => {
			const tasks = await storage.listTasks();
			expect(tasks).toEqual([]);
		});

		it('should delete a task', async () => {
			await storage.saveTask(makeTask());
			await storage.deleteTask('task-1');
			expect(await storage.loadTask('task-1')).toBeNull();
		});

		it('should delete non-existent task without error', async () => {
			await expect(storage.deleteTask('non-existent')).resolves.toBeUndefined();
		});

		it('should check if task exists', async () => {
			await storage.saveTask(makeTask());
			expect(await storage.taskExists('task-1')).toBe(true);
			expect(await storage.taskExists('non-existent')).toBe(false);
		});

		it('should clear all tasks and return count', async () => {
			await storage.saveTask(makeTask({ id: 'task-1' }));
			await storage.saveTask(makeTask({ id: 'task-2' }));
			await storage.saveTask(makeTask({ id: 'task-3' }));
			const count = await storage.clearAllTasks();
			expect(count).toBe(3);
			expect(await storage.listTasks()).toEqual([]);
		});

		it('should return 0 when clearing empty storage', async () => {
			const count = await storage.clearAllTasks();
			expect(count).toBe(0);
		});

		it('should overwrite existing task on save', async () => {
			const task = makeTask();
			await storage.saveTask(task);
			const updated = { ...task, description: 'Updated description' };
			await storage.saveTask(updated);
			const loaded = await storage.loadTask('task-1');
			expect(loaded?.description).toBe('Updated description');
		});

		it('should return a copy of the task to prevent mutation', async () => {
			const task = makeTask();
			await storage.saveTask(task);
			const loaded = await storage.loadTask('task-1');
			loaded!.description = 'mutated';
			const reloaded = await storage.loadTask('task-1');
			expect(reloaded?.description).toBe('Test task');
		});
	});

	describe('Intervention operations', () => {
		it('should save and load an intervention', async () => {
			const intervention = makeIntervention();
			await storage.saveIntervention(intervention);
			const loaded = await storage.loadIntervention('intervention-1');
			expect(loaded).toEqual(intervention);
		});

		it('should return null for non-existent intervention', async () => {
			const loaded = await storage.loadIntervention('non-existent');
			expect(loaded).toBeNull();
		});

		it('should list all interventions', async () => {
			await storage.saveIntervention(makeIntervention({ id: 'i-1' }));
			await storage.saveIntervention(makeIntervention({ id: 'i-2' }));
			const interventions = await storage.listInterventions();
			expect(interventions).toHaveLength(2);
		});

		it('should delete an intervention', async () => {
			await storage.saveIntervention(makeIntervention());
			await storage.deleteIntervention('intervention-1');
			expect(await storage.loadIntervention('intervention-1')).toBeNull();
		});

		it('should delete non-existent intervention without error', async () => {
			await expect(storage.deleteIntervention('non-existent')).resolves.toBeUndefined();
		});

		it('should check if intervention exists', async () => {
			await storage.saveIntervention(makeIntervention());
			expect(await storage.interventionExists('intervention-1')).toBe(true);
			expect(await storage.interventionExists('non-existent')).toBe(false);
		});

		it('should find interventions by task ID', async () => {
			await storage.saveIntervention(makeIntervention({ id: 'i-1', taskId: 'task-1' }));
			await storage.saveIntervention(makeIntervention({ id: 'i-2', taskId: 'task-2' }));
			await storage.saveIntervention(makeIntervention({ id: 'i-3', taskId: 'task-1' }));
			const found = await storage.findInterventionsByTaskId('task-1');
			expect(found).toHaveLength(2);
			expect(found.map(i => i.id)).toEqual(expect.arrayContaining(['i-1', 'i-3']));
		});

		it('should return empty array when no interventions match task ID', async () => {
			const found = await storage.findInterventionsByTaskId('non-existent');
			expect(found).toEqual([]);
		});

		it('should find interventions by status', async () => {
			await storage.saveIntervention(makeIntervention({ id: 'i-1', status: 'pending' }));
			await storage.saveIntervention(makeIntervention({ id: 'i-2', status: 'answered' }));
			await storage.saveIntervention(makeIntervention({ id: 'i-3', status: 'pending' }));
			const pending = await storage.findInterventionsByStatus('pending');
			expect(pending).toHaveLength(2);
			const answered = await storage.findInterventionsByStatus('answered');
			expect(answered).toHaveLength(1);
		});

		it('should overwrite existing intervention on save', async () => {
			const intervention = makeIntervention();
			await storage.saveIntervention(intervention);
			const updated = { ...intervention, status: 'answered' as const };
			await storage.saveIntervention(updated);
			const loaded = await storage.loadIntervention('intervention-1');
			expect(loaded?.status).toBe('answered');
		});
	});

	describe('clear()', () => {
		it('should clear all tasks and interventions', async () => {
			await storage.saveTask(makeTask());
			await storage.saveIntervention(makeIntervention());
			storage.clear();
			expect(await storage.listTasks()).toEqual([]);
			expect(await storage.listInterventions()).toEqual([]);
		});
	});
});
