import type { Intervention, InterventionsQuery } from '@app/shared/api/interventions.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * INTERVENTIONS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for interventions (user interactions with tasks).
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * Storage:
 * - File-based JSON storage in /data/interventions.json
 * - Uses BaseRepository with 'interventions' table name
 *
 * Custom Methods:
 * - findByTask(): Get interventions for a task
 * - findPending(): Get all pending interventions
 * - findByStatus(): Get interventions by status
 * - respond(): Submit user response to intervention
 * - cancel(): Cancel an intervention
 * - timeout(): Mark intervention as timed out
 *
 * ===========================================================================================
 */

export class InterventionsRepository {
	constructor(private readonly base: BaseRepository<Intervention>) {}

	/**
	 * Find all interventions with optional filters
	 */
	async findAll(query?: InterventionsQuery): Promise<Intervention[]> {
		const qb = this.base.query();

		// Apply status filter
		if (query?.status) {
			qb.where('status', '=', query.status);
		}

		// Apply type filter
		if (query?.type) {
			qb.where('type', '=', query.type);
		}

		// Apply taskId filter
		if (query?.taskId) {
			qb.where('taskId', '=', query.taskId);
		}

		// Apply blocking filter
		if (query?.blocking !== undefined) {
			qb.where('blocking', '=', query.blocking);
		}

		// Default ordering by createdAt descending (newest first)
		qb.orderBy('createdAt', 'DESC');

		return qb.execute();
	}

	/**
	 * Find interventions for a specific task
	 */
	async findByTask(taskId: string): Promise<Intervention[]> {
		return this.base.query().where('taskId', '=', taskId).orderBy('createdAt', 'DESC').execute();
	}

	/**
	 * Find all pending interventions
	 */
	async findPending(): Promise<Intervention[]> {
		return this.base.query().where('status', '=', 'pending').orderBy('createdAt', 'DESC').execute();
	}

	/**
	 * Find interventions by status
	 */
	async findByStatus(status: string): Promise<Intervention[]> {
		return this.base
			.query()
			.where('status', '=', status as Intervention['status'])
			.orderBy('createdAt', 'DESC')
			.execute();
	}

	/**
	 * Find intervention by ID
	 */
	async findById(id: string): Promise<Intervention | null> {
		return this.base.findById(id);
	}

	/**
	 * Create a new intervention
	 */
	async create(data: Omit<Intervention, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Intervention> {
		return this.base.create(data);
	}

	/**
	 * Create a new intervention with a specific ID
	 * Used when syncing interventions from orchestrator that already have IDs
	 *
	 * Note: This is a workaround since DataStorage interface doesn't have createWithId().
	 * We directly manipulate the underlying FileBasedStorage to add the entity with orchestrator's ID.
	 */
	async createWithId(
		id: string,
		data: Omit<Intervention, 'id' | 'version' | 'createdAt' | 'updatedAt'>
	): Promise<Intervention> {
		// Check if ID already exists
		const existing = await this.findById(id);
		if (existing) {
			throw new Error(`Intervention with id ${id} already exists`);
		}

		// Manually construct the intervention with the orchestrator's ID
		const now = new Date().toISOString();
		const intervention: Intervention = {
			...data,
			id,
			version: 1,
			createdAt: now,
			updatedAt: now,
		} as Intervention;

		// Access the underlying storage to add the intervention
		// This is a temporary workaround until we add createWithId() to DataStorage interface
		// @formatter:off
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const storage = (this.base as any).storage;
		// @formatter:on
		const tableName = this.base.getTableName();

		// Get the in-memory table, add our intervention, and save to file
		const tableData = await storage.getTable(tableName);
		tableData.push(intervention);
		await storage.saveTable(tableName);

		return intervention;
	}

	/**
	 * Update an existing intervention
	 */
	async update(id: string, data: Partial<Omit<Intervention, 'id' | 'createdAt'>>): Promise<Intervention> {
		return this.base.update(id, data);
	}

	/**
	 * Delete an intervention
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}

	/**
	 * Submit user response to an intervention
	 */
	async respond(
		id: string,
		response: {
			value: unknown;
			answeredBy: string;
			comment?: string;
		}
	): Promise<Intervention> {
		const intervention = await this.findById(id);
		if (!intervention) {
			throw new Error(`Intervention with id ${id} not found`);
		}

		if (intervention.status !== 'pending') {
			throw new Error(`Intervention ${id} is not pending (status: ${intervention.status})`);
		}

		return this.update(id, {
			status: 'answered',
			response,
			answeredAt: new Date().toISOString(),
			version: intervention.version + 1,
		});
	}

	/**
	 * Cancel an intervention
	 */
	async cancel(id: string): Promise<Intervention> {
		const intervention = await this.findById(id);
		if (!intervention) {
			throw new Error(`Intervention with id ${id} not found`);
		}

		if (intervention.status !== 'pending') {
			throw new Error(`Intervention ${id} is not pending (status: ${intervention.status})`);
		}

		return this.update(id, {
			status: 'cancelled',
			version: intervention.version + 1,
		});
	}

	/**
	 * Mark intervention as timed out
	 */
	async timeout(id: string): Promise<Intervention> {
		const intervention = await this.findById(id);
		if (!intervention) {
			throw new Error(`Intervention with id ${id} not found`);
		}

		if (intervention.status !== 'pending') {
			throw new Error(`Intervention ${id} is not pending (status: ${intervention.status})`);
		}

		return this.update(id, {
			status: 'timeout',
			version: intervention.version + 1,
		});
	}

	/**
	 * Bulk cancel multiple interventions
	 */
	async bulkCancel(ids: string[]): Promise<{ cancelled: string[]; failed: Array<{ id: string; error: string }> }> {
		const cancelled: string[] = [];
		const failed: Array<{ id: string; error: string }> = [];

		for (const id of ids) {
			try {
				await this.cancel(id);
				cancelled.push(id);
			} catch (error) {
				failed.push({
					id,
					error: error instanceof Error ? error.message : 'Unknown error',
				});
			}
		}

		return { cancelled, failed };
	}
}
