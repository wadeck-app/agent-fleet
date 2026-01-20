import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from 'shared-common/logger';
import { type Intervention, type InterventionStatus, type Task } from 'shared-orch-worker/domain-types';
import { fileURLToPath } from 'url';

const log = createLogger('Storage');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = process.env.AGENT_FLEET_DATA_DIR || path.join(PROJECT_ROOT, 'data');
const TASKS_DIR = path.join(DATA_DIR, 'tasks');
const INTERVENTIONS_DIR = path.join(DATA_DIR, 'interventions');
const KNOWLEDGE_DIR = path.join(DATA_DIR, 'knowledge');

export interface KnowledgeEntry {
	timestamp: string;
	category: string;
	[key: string]: any;
}

/**
 * Storage abstraction layer for task and knowledge persistence.
 *
 * This implementation uses async file operations to avoid blocking the event loop.
 * All methods return Promises and should be awaited by callers.
 *
 * WARNING: This implementation does not use file locking.
 * For production use with multiple orchestrator instances,
 * consider using a proper database (SQLite, PostgreSQL, etc.)
 * or implement file locking to prevent data corruption from concurrent access.
 *
 * Initial implementation: flat JSON files
 * Can evolve to SQLite/PostgreSQL later
 */
export class Storage {
	/**
	 * Ensure a directory exists, creating it if necessary
	 */
	private static async ensureDirectoryExists(dirPath: string): Promise<void> {
		try {
			await fs.promises.access(dirPath);
		} catch (error) {
			await fs.promises.mkdir(dirPath, { recursive: true });
		}
	}

	/**
	 * Initialize storage directories
	 * Should be called once at application startup
	 */
	static async initialize(): Promise<void> {
		try {
			await this.ensureDirectoryExists(DATA_DIR);
			await this.ensureDirectoryExists(TASKS_DIR);
			await this.ensureDirectoryExists(INTERVENTIONS_DIR);
			await this.ensureDirectoryExists(KNOWLEDGE_DIR);
		} catch (error) {
			log.error('Failed to initialize directories:', error);
			throw new Error(`Failed to initialize storage: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	/**
	 * Save a task to storage
	 * @throws Error if the task cannot be saved
	 */
	static async saveTask(task: Task): Promise<void> {
		try {
			await this.ensureDirectoryExists(TASKS_DIR);
			const filePath = path.join(TASKS_DIR, `${task.id}.json`);
			await fs.promises.writeFile(filePath, JSON.stringify(task, null, 2), 'utf8');
		} catch (error) {
			log.error(`Failed to save task ${task.id}:`, error);
			throw new Error(
				`Failed to save task ${task.id}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Load a task by ID
	 * @returns The task if found, null otherwise
	 * @throws Error if the task file exists but cannot be read or parsed
	 */
	static async loadTask(taskId: string): Promise<Task | null> {
		try {
			const filePath = path.join(TASKS_DIR, `${taskId}.json`);
			const data = await fs.promises.readFile(filePath, 'utf8');
			return JSON.parse(data) as Task;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return null;
			}
			log.error(`Failed to load task ${taskId}:`, error);
			throw new Error(`Failed to load task ${taskId}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * List all tasks
	 * @returns Array of all tasks in storage
	 * @throws Error if tasks cannot be read
	 */
	static async listTasks(): Promise<Task[]> {
		try {
			await this.ensureDirectoryExists(TASKS_DIR);
			const files = await fs.promises.readdir(TASKS_DIR);
			const jsonFiles = files.filter(f => f.endsWith('.json'));

			const tasks = await Promise.all(
				jsonFiles.map(async file => {
					const data = await fs.promises.readFile(path.join(TASKS_DIR, file), 'utf8');
					return JSON.parse(data) as Task;
				})
			);

			return tasks;
		} catch (error) {
			log.error('Failed to list tasks:', error);
			throw new Error(`Failed to list tasks: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Delete a task from storage
	 * @throws Error if the task cannot be deleted (except ENOENT which is ignored)
	 */
	static async deleteTask(taskId: string): Promise<void> {
		try {
			const filePath = path.join(TASKS_DIR, `${taskId}.json`);
			await fs.promises.unlink(filePath);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				// File doesn't exist, which is fine for delete
				return;
			}
			log.error(`Failed to delete task ${taskId}:`, error);
			throw new Error(
				`Failed to delete task ${taskId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Add an entry to the knowledge base
	 * @throws Error if the knowledge entry cannot be saved
	 */
	static async addKnowledge(category: string, entry: Omit<KnowledgeEntry, 'timestamp' | 'category'>): Promise<void> {
		try {
			await this.ensureDirectoryExists(KNOWLEDGE_DIR);
			const filePath = path.join(KNOWLEDGE_DIR, `${category}.jsonl`);
			const line =
				JSON.stringify({
					timestamp: new Date().toISOString(),
					category,
					...entry,
				}) + '\n';
			await fs.promises.appendFile(filePath, line, 'utf8');
		} catch (error) {
			log.error(`Failed to add knowledge to ${category}:`, error);
			throw new Error(
				`Failed to add knowledge to ${category}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Read the knowledge base for a category
	 * @returns Array of knowledge entries for the category
	 * @throws Error if the knowledge file exists but cannot be read or parsed
	 */
	static async readKnowledge(category: string): Promise<KnowledgeEntry[]> {
		try {
			const filePath = path.join(KNOWLEDGE_DIR, `${category}.jsonl`);
			const content = await fs.promises.readFile(filePath, 'utf8');
			return content
				.split('\n')
				.filter(line => line.trim())
				.map(line => JSON.parse(line) as KnowledgeEntry);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return [];
			}
			log.error(`Failed to read knowledge from ${category}:`, error);
			throw new Error(
				`Failed to read knowledge from ${category}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Get the context directory path for a task
	 * Ensures the directory exists before returning the path
	 * @returns The absolute path to the task's context directory
	 * @throws Error if the directory cannot be created
	 */
	static async getTaskContextDir(taskId: string): Promise<string> {
		try {
			const dir = path.join(DATA_DIR, 'contexts', taskId);
			await this.ensureDirectoryExists(dir);
			return dir;
		} catch (error) {
			log.error(`Failed to get context directory for task ${taskId}:`, error);
			throw new Error(
				`Failed to get context directory for task ${taskId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Get the data directory path
	 */
	static getDataDir(): string {
		return DATA_DIR;
	}

	/**
	 * Check if a task exists in storage
	 * @returns true if the task file exists, false otherwise
	 */
	static async taskExists(taskId: string): Promise<boolean> {
		try {
			const filePath = path.join(TASKS_DIR, `${taskId}.json`);
			await fs.promises.access(filePath);
			return true;
		} catch (error) {
			return false;
		}
	}

	/**
	 * Clear all tasks from storage
	 * @returns The number of tasks deleted
	 * @throws Error if tasks cannot be cleared
	 */
	static async clearAllTasks(): Promise<number> {
		try {
			const files = await fs.promises.readdir(TASKS_DIR);
			const jsonFiles = files.filter(f => f.endsWith('.json'));

			await Promise.all(jsonFiles.map(file => fs.promises.unlink(path.join(TASKS_DIR, file))));

			return jsonFiles.length;
		} catch (error) {
			log.error('Failed to clear all tasks:', error);
			throw new Error(`Failed to clear all tasks: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// ===========================================================================================
	// INTERVENTION STORAGE METHODS
	// ===========================================================================================

	/**
	 * Save an intervention to storage
	 * @throws Error if the intervention cannot be saved
	 */
	static async saveIntervention(intervention: Intervention): Promise<void> {
		try {
			await this.ensureDirectoryExists(INTERVENTIONS_DIR);
			const filePath = path.join(INTERVENTIONS_DIR, `${intervention.id}.json`);
			await fs.promises.writeFile(filePath, JSON.stringify(intervention, null, 2), 'utf8');
		} catch (error) {
			log.error(`Failed to save intervention ${intervention.id}:`, error);
			throw new Error(
				`Failed to save intervention ${intervention.id}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Load an intervention by ID
	 * @returns The intervention if found, null otherwise
	 * @throws Error if the intervention file exists but cannot be read or parsed
	 */
	static async loadIntervention(interventionId: string): Promise<Intervention | null> {
		try {
			const filePath = path.join(INTERVENTIONS_DIR, `${interventionId}.json`);
			const data = await fs.promises.readFile(filePath, 'utf8');
			return JSON.parse(data) as Intervention;
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				return null;
			}
			log.error(`Failed to load intervention ${interventionId}:`, error);
			throw new Error(
				`Failed to load intervention ${interventionId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * List all interventions
	 * @returns Array of all interventions in storage
	 * @throws Error if interventions cannot be read
	 */
	static async listInterventions(): Promise<Intervention[]> {
		try {
			await this.ensureDirectoryExists(INTERVENTIONS_DIR);
			const files = await fs.promises.readdir(INTERVENTIONS_DIR);
			const jsonFiles = files.filter(f => f.endsWith('.json'));

			const interventions = await Promise.all(
				jsonFiles.map(async file => {
					const data = await fs.promises.readFile(path.join(INTERVENTIONS_DIR, file), 'utf8');
					return JSON.parse(data) as Intervention;
				})
			);

			return interventions;
		} catch (error) {
			log.error('Failed to list interventions:', error);
			throw new Error(`Failed to list interventions: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Delete an intervention from storage
	 * @throws Error if the intervention cannot be deleted (except ENOENT which is ignored)
	 */
	static async deleteIntervention(interventionId: string): Promise<void> {
		try {
			const filePath = path.join(INTERVENTIONS_DIR, `${interventionId}.json`);
			await fs.promises.unlink(filePath);
		} catch (error: any) {
			if (error.code === 'ENOENT') {
				// File doesn't exist, which is fine for delete
				return;
			}
			log.error(`Failed to delete intervention ${interventionId}:`, error);
			throw new Error(
				`Failed to delete intervention ${interventionId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Find interventions by task ID
	 * @returns Array of interventions for the specified task
	 */
	static async findInterventionsByTaskId(taskId: string): Promise<Intervention[]> {
		const allInterventions = await this.listInterventions();
		return allInterventions.filter(intervention => intervention.taskId === taskId);
	}

	/**
	 * Find interventions by status
	 * @returns Array of interventions with the specified status
	 */
	static async findInterventionsByStatus(status: InterventionStatus): Promise<Intervention[]> {
		const allInterventions = await this.listInterventions();
		return allInterventions.filter(intervention => intervention.status === status);
	}

	/**
	 * Check if an intervention exists in storage
	 * @returns true if the intervention file exists, false otherwise
	 */
	static async interventionExists(interventionId: string): Promise<boolean> {
		try {
			const filePath = path.join(INTERVENTIONS_DIR, `${interventionId}.json`);
			await fs.promises.access(filePath);
			return true;
		} catch (error) {
			return false;
		}
	}
}
