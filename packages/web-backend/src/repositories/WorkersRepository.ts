import type { BaseEntity } from '@app/shared/common/base-entity';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * WORKERS REPOSITORY
 * ===========================================================================================
 *
 * Data access layer for worker metadata (names, preferences, etc.)
 * Worker runtime data (connected, state, taskId) comes from OrchestratorWrapper
 * This repository stores only persistent user-defined metadata
 *
 * Storage: /data/workers.json (will migrate to MariaDB later)
 *
 * ===========================================================================================
 */

/**
 * Worker metadata entity (stored in /data/workers.json)
 */
export interface WorkerMetadata extends BaseEntity {
	workerId: string; // Primary key (not BaseEntity.id)
	name?: string; // User-defined name
	// Future fields: tags, notes, custom properties
}

export class WorkersRepository {
	constructor(private readonly base: BaseRepository<WorkerMetadata>) {}

	/**
	 * Get worker metadata by workerId
	 * Returns null if worker has no metadata yet (new worker)
	 */
	async findByWorkerId(workerId: string): Promise<WorkerMetadata | null> {
		const results = await this.base.query().where('workerId', '=', workerId).execute();
		return results[0] || null;
	}

	/**
	 * Get all worker metadata (for bulk operations)
	 */
	async findAll(): Promise<WorkerMetadata[]> {
		return this.base.findAll();
	}

	/**
	 * Update worker name with optimistic locking
	 * Creates metadata entry if doesn't exist (auto-create pattern)
	 * @param workerId Worker ID
	 * @param name New name
	 * @param version Current version (for optimistic locking)
	 */
	async updateName(workerId: string, name: string, version: number): Promise<WorkerMetadata> {
		const existing = await this.findByWorkerId(workerId);

		if (existing) {
			// Update existing metadata with version check
			return this.base.update(existing.id, { name, version });
		} else {
			// Create new metadata entry (version will be 1)
			return this.base.create({ workerId, name });
		}
	}

	/**
	 * Delete worker metadata
	 * @param workerId Worker ID
	 */
	async deleteByWorkerId(workerId: string): Promise<void> {
		const metadata = await this.findByWorkerId(workerId);
		if (metadata) {
			await this.base.delete(metadata.id);
		}
	}
}
