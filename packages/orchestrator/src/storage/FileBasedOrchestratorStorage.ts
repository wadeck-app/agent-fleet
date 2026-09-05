import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from 'shared-common/logger';
import type { Intervention, InterventionStatus, Task } from 'shared-orch-worker/domain-types';
import { fileURLToPath } from 'node:url';

import type { IOrchestratorStorage } from './IOrchestratorStorage';

const log = createLogger('FileBasedOrchestratorStorage');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.AGENT_FLEET_DATA_DIR || path.join(PROJECT_ROOT, 'data');
const TASKS_DIR = path.join(DATA_DIR, 'tasks');
const INTERVENTIONS_DIR = path.join(DATA_DIR, 'interventions');

export class FileBasedOrchestratorStorage implements IOrchestratorStorage {
	private async ensureDirectoryExists(dirPath: string): Promise<void> {
		try {
			await fs.promises.access(dirPath);
		} catch {
			await fs.promises.mkdir(dirPath, { recursive: true });
		}
	}

	async saveTask(task: Task): Promise<void> {
		try {
			await this.ensureDirectoryExists(TASKS_DIR);
			const filePath = path.join(TASKS_DIR, `${task.id}.json`);
			await fs.promises.writeFile(filePath, JSON.stringify(task, null, 2), 'utf8');
		} catch (error) {
			log.error(`Failed to save task ${task.id}:`, error);
			throw new Error(
				`Failed to save task ${task.id}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	async loadTask(taskId: string): Promise<Task | null> {
		try {
			const filePath = path.join(TASKS_DIR, `${taskId}.json`);
			const data = await fs.promises.readFile(filePath, 'utf8');
			return JSON.parse(data) as Task;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return null;
			}
			log.error(`Failed to load task ${taskId}:`, error);
			throw new Error(`Failed to load task ${taskId}: ${error instanceof Error ? String(error) : String(error)}`);
		}
	}

	async listTasks(): Promise<Task[]> {
		try {
			await this.ensureDirectoryExists(TASKS_DIR);
			const files = await fs.promises.readdir(TASKS_DIR);
			const jsonFiles = files.filter(f => f.endsWith('.json'));

			return Promise.all(
				jsonFiles.map(async file => {
					const data = await fs.promises.readFile(path.join(TASKS_DIR, file), 'utf8');
					return JSON.parse(data) as Task;
				})
			);
		} catch (error) {
			log.error('Failed to list tasks:', error);
			throw new Error(`Failed to list tasks: ${error instanceof Error ? String(error) : String(error)}`);
		}
	}

	async deleteTask(taskId: string): Promise<void> {
		try {
			const filePath = path.join(TASKS_DIR, `${taskId}.json`);
			await fs.promises.unlink(filePath);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return;
			}
			log.error(`Failed to delete task ${taskId}:`, error);
			throw new Error(
				`Failed to delete task ${taskId}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	async taskExists(taskId: string): Promise<boolean> {
		try {
			const filePath = path.join(TASKS_DIR, `${taskId}.json`);
			await fs.promises.access(filePath);
			return true;
		} catch {
			return false;
		}
	}

	async clearAllTasks(): Promise<number> {
		try {
			const files = await fs.promises.readdir(TASKS_DIR);
			const jsonFiles = files.filter(f => f.endsWith('.json'));
			await Promise.all(jsonFiles.map(file => fs.promises.unlink(path.join(TASKS_DIR, file))));
			return jsonFiles.length;
		} catch (error) {
			log.error('Failed to clear all tasks:', error);
			throw new Error(`Failed to clear all tasks: ${error instanceof Error ? String(error) : String(error)}`);
		}
	}

	async saveIntervention(intervention: Intervention): Promise<void> {
		try {
			await this.ensureDirectoryExists(INTERVENTIONS_DIR);
			const filePath = path.join(INTERVENTIONS_DIR, `${intervention.id}.json`);
			await fs.promises.writeFile(filePath, JSON.stringify(intervention, null, 2), 'utf8');
		} catch (error) {
			log.error(`Failed to save intervention ${intervention.id}:`, error);
			throw new Error(
				`Failed to save intervention ${intervention.id}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	async loadIntervention(id: string): Promise<Intervention | null> {
		try {
			const filePath = path.join(INTERVENTIONS_DIR, `${id}.json`);
			const data = await fs.promises.readFile(filePath, 'utf8');
			return JSON.parse(data) as Intervention;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return null;
			}
			log.error(`Failed to load intervention ${id}:`, error);
			throw new Error(
				`Failed to load intervention ${id}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	async listInterventions(): Promise<Intervention[]> {
		try {
			await this.ensureDirectoryExists(INTERVENTIONS_DIR);
			const files = await fs.promises.readdir(INTERVENTIONS_DIR);
			const jsonFiles = files.filter(f => f.endsWith('.json'));

			return Promise.all(
				jsonFiles.map(async file => {
					const data = await fs.promises.readFile(path.join(INTERVENTIONS_DIR, file), 'utf8');
					return JSON.parse(data) as Intervention;
				})
			);
		} catch (error) {
			log.error('Failed to list interventions:', error);
			throw new Error(`Failed to list interventions: ${error instanceof Error ? String(error) : String(error)}`);
		}
	}

	async deleteIntervention(id: string): Promise<void> {
		try {
			const filePath = path.join(INTERVENTIONS_DIR, `${id}.json`);
			await fs.promises.unlink(filePath);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return;
			}
			log.error(`Failed to delete intervention ${id}:`, error);
			throw new Error(
				`Failed to delete intervention ${id}: ${error instanceof Error ? String(error) : String(error)}`
			);
		}
	}

	async interventionExists(id: string): Promise<boolean> {
		try {
			const filePath = path.join(INTERVENTIONS_DIR, `${id}.json`);
			await fs.promises.access(filePath);
			return true;
		} catch {
			return false;
		}
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
