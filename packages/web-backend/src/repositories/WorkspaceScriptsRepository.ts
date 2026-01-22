import type { WorkspaceScript } from '@app/shared/api/workspaceScripts.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * WORKSPACE SCRIPTS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for workspace script configurations.
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * Storage:
 * - File-based JSON storage in /data/workspace-scripts.json
 * - Uses BaseRepository with 'workspace-scripts' table name
 *
 * Custom Methods:
 * - findByWorkspace(): Get all scripts for a workspace
 * - findEnabledByWorkspace(): Get enabled scripts for a workspace
 * - findByScriptName(): Find script by workspace ID and script name
 * - updateOrder(): Update script display order
 * - countByWorkspace(): Count scripts for a workspace
 *
 * ===========================================================================================
 */
export class WorkspaceScriptsRepository {
	constructor(private readonly base: BaseRepository<WorkspaceScript>) {}

	/**
	 * Find all scripts for a workspace
	 */
	async findByWorkspace(workspaceId: string): Promise<WorkspaceScript[]> {
		return this.base.query().where('workspaceId', '=', workspaceId).orderBy('order', 'ASC').execute();
	}

	/**
	 * Find enabled scripts for a workspace
	 */
	async findEnabledByWorkspace(workspaceId: string): Promise<WorkspaceScript[]> {
		return this.base
			.query()
			.where('workspaceId', '=', workspaceId)
			.where('enabled', '=', true)
			.orderBy('order', 'ASC')
			.execute();
	}

	/**
	 * Find scripts configured with autoStart for a workspace
	 */
	async findAutoStartByWorkspace(workspaceId: string): Promise<WorkspaceScript[]> {
		return this.base
			.query()
			.where('workspaceId', '=', workspaceId)
			.where('enabled', '=', true)
			.where('autoStart', '=', true)
			.orderBy('order', 'ASC')
			.execute();
	}

	/**
	 * Find script by workspace ID and script name
	 */
	async findByScriptName(workspaceId: string, scriptName: string): Promise<WorkspaceScript | null> {
		const results = await this.base
			.query()
			.where('workspaceId', '=', workspaceId)
			.where('scriptName', '=', scriptName)
			.execute();

		return results[0] || null;
	}

	/**
	 * Find script by ID
	 */
	async findById(id: string): Promise<WorkspaceScript | null> {
		return this.base.findById(id);
	}

	/**
	 * Create a new workspace script
	 */
	async create(data: Omit<WorkspaceScript, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<WorkspaceScript> {
		return this.base.create(data);
	}

	/**
	 * Update an existing workspace script
	 */
	async update(id: string, data: Partial<Omit<WorkspaceScript, 'id' | 'createdAt'>>): Promise<WorkspaceScript> {
		return this.base.update(id, data);
	}

	/**
	 * Delete a workspace script
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}

	/**
	 * Count scripts for a workspace
	 */
	async countByWorkspace(workspaceId: string): Promise<number> {
		const scripts = await this.findByWorkspace(workspaceId);
		return scripts.length;
	}

	/**
	 * Update script order
	 */
	async updateOrder(id: string, order: number): Promise<WorkspaceScript> {
		const script = await this.findById(id);
		if (!script) {
			throw new Error(`WorkspaceScript with id ${id} not found`);
		}

		return this.update(id, {
			order,
			version: script.version + 1,
		});
	}

	/**
	 * Reorder all scripts for a workspace based on script IDs array
	 */
	async reorderScripts(workspaceId: string, scriptIds: string[]): Promise<WorkspaceScript[]> {
		const scripts = await this.findByWorkspace(workspaceId);
		const updates: Promise<WorkspaceScript>[] = [];

		for (let i = 0; i < scriptIds.length; i++) {
			const scriptId = scriptIds[i];
			const script = scripts.find(s => s.id === scriptId);

			if (script && script.order !== i) {
				updates.push(this.updateOrder(scriptId, i));
			}
		}

		return Promise.all(updates);
	}

	/**
	 * Toggle script enabled state
	 */
	async toggleEnabled(id: string): Promise<WorkspaceScript> {
		const script = await this.findById(id);
		if (!script) {
			throw new Error(`WorkspaceScript with id ${id} not found`);
		}

		return this.update(id, {
			enabled: !script.enabled,
			version: script.version + 1,
		});
	}

	/**
	 * Delete all scripts for a workspace
	 */
	async deleteByWorkspace(workspaceId: string): Promise<void> {
		const scripts = await this.findByWorkspace(workspaceId);
		await Promise.all(scripts.map(script => this.delete(script.id)));
	}
}
