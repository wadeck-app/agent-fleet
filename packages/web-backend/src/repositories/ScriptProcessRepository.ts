import type { ScriptProcess, ScriptProcessStatus } from '@app/shared/api/workspaceScripts.contract';

import type { DataStorage } from '../storage/DataStorage';

/**
 * ===========================================================================================
 * SCRIPT PROCESS REPOSITORY
 * ===========================================================================================
 *
 * Data access for script process runtime state.
 * Tracks running processes, PIDs, status, and execution history.
 *
 * Storage:
 * - File-based JSON storage in /data/script-processes.json
 * - Uses DataStorage directly (NOT BaseRepository)
 *
 * Note: This repository does NOT use BaseEntity (no version, createdAt, updatedAt)
 * because ScriptProcess is runtime state, not a persistent entity with version control.
 *
 * Custom Methods:
 * - findByScriptId(): Get process for a script
 * - findRunning(): Get all running processes
 * - findByStatus(): Get processes by status
 * - updateStatus(): Update process status
 * - updatePid(): Update process PID
 * - incrementRestartCount(): Increment restart counter
 * - updateHeartbeat(): Update last heartbeat timestamp
 *
 * ===========================================================================================
 */
export class ScriptProcessRepository {
	private readonly tableName = 'script-processes';

	constructor(private readonly storage: DataStorage) {}

	/**
	 * Find process by script ID
	 */
	async findByScriptId(workspaceScriptId: string): Promise<ScriptProcess | null> {
		const results = await this.storage
			.query<any>(this.tableName)
			.where('workspaceScriptId', '=', workspaceScriptId)
			.execute();

		return (results[0] as ScriptProcess) || null;
	}

	/**
	 * Find all running processes
	 */
	async findRunning(): Promise<ScriptProcess[]> {
		return this.storage.query<any>(this.tableName).where('status', '=', 'running').execute() as Promise<
			ScriptProcess[]
		>;
	}

	/**
	 * Find processes by status
	 */
	async findByStatus(status: ScriptProcessStatus): Promise<ScriptProcess[]> {
		return this.storage.query<any>(this.tableName).where('status', '=', status).execute() as Promise<
			ScriptProcess[]
		>;
	}

	/**
	 * Find process by ID
	 */
	async findById(id: string): Promise<ScriptProcess | null> {
		return this.storage.getById<any>(this.tableName, id) as Promise<ScriptProcess | null>;
	}

	/**
	 * Create a new process record
	 */
	async create(data: Omit<ScriptProcess, 'id'> & { id?: string }): Promise<ScriptProcess> {
		// ScriptProcess doesn't extend BaseEntity, so we provide id manually if not present
		const processData: ScriptProcess = {
			id: data.id || this.generateId(),
			workspaceScriptId: data.workspaceScriptId,
			pid: data.pid,
			status: data.status,
			startedAt: data.startedAt,
			stoppedAt: data.stoppedAt,
			exitCode: data.exitCode,
			error: data.error,
			restartCount: data.restartCount || 0,
			lastHeartbeat: data.lastHeartbeat,
		};

		// Use storage.create with type assertion since ScriptProcess doesn't extend BaseEntity
		return this.storage.create<any>(this.tableName, processData as any) as Promise<ScriptProcess>;
	}

	/**
	 * Update an existing process
	 */
	async update(id: string, data: Partial<Omit<ScriptProcess, 'id'>>): Promise<ScriptProcess> {
		return this.storage.update<any>(this.tableName, id, data) as Promise<ScriptProcess>;
	}

	/**
	 * Delete a process
	 */
	async delete(id: string): Promise<void> {
		return this.storage.delete(this.tableName, id);
	}

	/**
	 * Delete process by script ID
	 */
	async deleteByScriptId(workspaceScriptId: string): Promise<void> {
		const process = await this.findByScriptId(workspaceScriptId);
		if (process) {
			await this.delete(process.id);
		}
	}

	/**
	 * Update process status
	 */
	async updateStatus(id: string, status: ScriptProcessStatus, error?: string): Promise<ScriptProcess> {
		const updateData: Partial<ScriptProcess> = {
			status,
			error,
		};

		if (status === 'running' && !error) {
			updateData.startedAt = new Date().toISOString();
			updateData.stoppedAt = undefined;
			updateData.exitCode = undefined;
			updateData.error = undefined;
		} else if (status === 'stopped' || status === 'crashed' || status === 'error') {
			updateData.stoppedAt = new Date().toISOString();
		}

		return this.update(id, updateData);
	}

	/**
	 * Update process PID
	 */
	async updatePid(id: string, pid: number): Promise<ScriptProcess> {
		return this.update(id, { pid });
	}

	/**
	 * Increment restart count
	 */
	async incrementRestartCount(id: string): Promise<ScriptProcess> {
		const process = await this.findById(id);
		if (!process) {
			throw new Error(`ScriptProcess with id ${id} not found`);
		}

		return this.update(id, {
			restartCount: process.restartCount + 1,
		});
	}

	/**
	 * Update last heartbeat timestamp
	 */
	async updateHeartbeat(id: string): Promise<ScriptProcess> {
		return this.update(id, {
			lastHeartbeat: new Date().toISOString(),
		});
	}

	/**
	 * Mark process as stopped with exit code
	 */
	async markStopped(id: string, exitCode: number): Promise<ScriptProcess> {
		return this.update(id, {
			status: exitCode === 0 ? 'stopped' : 'crashed',
			stoppedAt: new Date().toISOString(),
			exitCode,
		});
	}

	/**
	 * Mark process as crashed with error
	 */
	async markCrashed(id: string, error: string, exitCode?: number): Promise<ScriptProcess> {
		return this.update(id, {
			status: 'crashed',
			stoppedAt: new Date().toISOString(),
			error,
			exitCode,
		});
	}

	/**
	 * Generate a unique ID for a new process
	 */
	private generateId(): string {
		return `proc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}
}
