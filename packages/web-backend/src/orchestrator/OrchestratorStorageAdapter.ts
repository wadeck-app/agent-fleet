import type { IOrchestratorStorage } from 'orchestrator/storage/IOrchestratorStorage';
import { createLogger } from 'shared-common/logger';
import type { Intervention, InterventionStatus, Task } from 'shared-orch-worker/domain-types';

import type { DataStorage } from '../storage/DataStorage';

const log = createLogger('OrchestratorStorageAdapter');

const TASKS_TABLE = 'orch_tasks';
const INTERVENTIONS_TABLE = 'orch_interventions';

/**
 * ===========================================================================================
 * ORCHESTRATOR STORAGE ADAPTER
 * ===========================================================================================
 *
 * Implements IOrchestratorStorage by delegating to the backend's DataStorage.
 * Stores orchestrator-native Task and Intervention types in dedicated tables
 * (orch_tasks, orch_interventions) using the backend's storage infrastructure.
 *
 * This centralises all persistent data in the backend's storage layer, eliminating
 * the separate orchestrator-side filesystem files.
 *
 * ===========================================================================================
 */
export class OrchestratorStorageAdapter implements IOrchestratorStorage {
	constructor(private readonly storage: DataStorage) {}

	// =====================================================================================
	// Tasks
	// =====================================================================================

	async saveTask(task: Task): Promise<void> {
		try {
			const existing = await this.loadTask(task.id);
			if (existing) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await this.storage.update<any>(TASKS_TABLE, task.id, task);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await this.storage.create<any>(TASKS_TABLE, task as any);
			}
		} catch (error) {
			log.error(`Failed to save task ${task.id}:`, error);
			throw new Error(
				`Failed to save task ${task.id}: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`
			);
		}
	}

	async loadTask(taskId: string): Promise<Task | null> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const entity = await this.storage.getById<any>(TASKS_TABLE, taskId);
			if (!entity) {
				return null;
			}
			// Strip backend-specific fields added by storage (version, updatedAt from create)
			const { version: _v, ...task } = entity;
			return task as Task;
		} catch (error) {
			log.error(`Failed to load task ${taskId}:`, error);
			throw new Error(`Failed to load task ${taskId}: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`);
		}
	}

	async listTasks(): Promise<Task[]> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const entities = await this.storage.query<any>(TASKS_TABLE).execute();
			return entities.map(({ version: _v, ...task }) => task as Task);
		} catch (error) {
			log.error('Failed to list tasks:', error);
			throw new Error(`Failed to list tasks: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`);
		}
	}

	async deleteTask(taskId: string): Promise<void> {
		try {
			await this.storage.delete(TASKS_TABLE, taskId);
		} catch (error: any) {
			// Ignore "not found" errors
			if ((error instanceof Error ? error.message : String(error))?.includes('not found')) {
				return;
			}
			log.error(`Failed to delete task ${taskId}:`, error);
			throw new Error(
				`Failed to delete task ${taskId}: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`
			);
		}
	}

	async taskExists(taskId: string): Promise<boolean> {
		const task = await this.loadTask(taskId);
		return task !== null;
	}

	async clearAllTasks(): Promise<number> {
		const tasks = await this.listTasks();
		const count = tasks.length;
		await Promise.all(tasks.map(t => this.deleteTask(t.id)));
		return count;
	}

	// =====================================================================================
	// Interventions
	// =====================================================================================

	async saveIntervention(intervention: Intervention): Promise<void> {
		try {
			const existing = await this.loadIntervention(intervention.id);
			if (existing) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await this.storage.update<any>(INTERVENTIONS_TABLE, intervention.id, intervention);
			} else {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				await this.storage.create<any>(INTERVENTIONS_TABLE, intervention as any);
			}
		} catch (error) {
			log.error(`Failed to save intervention ${intervention.id}:`, error);
			throw new Error(
				`Failed to save intervention ${intervention.id}: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`
			);
		}
	}

	async loadIntervention(id: string): Promise<Intervention | null> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const entity = await this.storage.getById<any>(INTERVENTIONS_TABLE, id);
			if (!entity) {
				return null;
			}
			const { version: _v, ...intervention } = entity;
			return intervention as Intervention;
		} catch (error) {
			log.error(`Failed to load intervention ${id}:`, error);
			throw new Error(
				`Failed to load intervention ${id}: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`
			);
		}
	}

	async listInterventions(): Promise<Intervention[]> {
		try {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const entities = await this.storage.query<any>(INTERVENTIONS_TABLE).execute();
			return entities.map(({ version: _v, ...intervention }) => intervention as Intervention);
		} catch (error) {
			log.error('Failed to list interventions:', error);
			throw new Error(`Failed to list interventions: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`);
		}
	}

	async deleteIntervention(id: string): Promise<void> {
		try {
			await this.storage.delete(INTERVENTIONS_TABLE, id);
		} catch (error: any) {
			// Ignore "not found" errors
			if ((error instanceof Error ? error.message : String(error))?.includes('not found')) {
				return;
			}
			log.error(`Failed to delete intervention ${id}:`, error);
			throw new Error(
				`Failed to delete intervention ${id}: ${error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error)}`
			);
		}
	}

	async interventionExists(id: string): Promise<boolean> {
		const intervention = await this.loadIntervention(id);
		return intervention !== null;
	}

	async findInterventionsByTaskId(taskId: string): Promise<Intervention[]> {
		const all = await this.listInterventions();
		return all.filter(i => i.taskId === taskId);
	}

	async findInterventionsByStatus(status: InterventionStatus): Promise<Intervention[]> {
		const all = await this.listInterventions();
		return all.filter(i => i.status === status);
	}
}
