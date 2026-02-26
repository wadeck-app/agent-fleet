import { createLogger } from 'shared-common/logger';

import type { WorkspaceMetadataEntity } from '@app/shared/api/workspaces.contract';

import type { BaseRepository } from './BaseRepository';

const log = createLogger('WorkspaceMetadataRepository');

/**
 * ===========================================================================================
 * WORKSPACE METADATA REPOSITORY
 * ===========================================================================================
 *
 * Centralized repository for workspace metadata (name, description, color, mode).
 * Uses BaseRepository + FileBasedStorage pattern (data/workspaces.json).
 *
 * Replaces the previous FS-watcher-based approach with centralized persistence.
 *
 * ===========================================================================================
 */
export class WorkspaceMetadataRepository {
	constructor(private readonly base: BaseRepository<WorkspaceMetadataEntity>) {}

	async findAll(): Promise<WorkspaceMetadataEntity[]> {
		return this.base.findAll();
	}

	async findById(id: string): Promise<WorkspaceMetadataEntity | null> {
		return this.base.findById(id);
	}

	/**
	 * Find a workspace entity by its filesystem path
	 */
	async findByPath(path: string): Promise<WorkspaceMetadataEntity | null> {
		const results = await this.base.query().where('path', '=', path).execute();
		return results[0] ?? null;
	}

	/**
	 * Find workspace entities for multiple paths
	 * @returns Map<path, entity>
	 */
	async findByPaths(paths: string[]): Promise<Map<string, WorkspaceMetadataEntity>> {
		const all = await this.findAll();
		const pathSet = new Set(paths);
		const map = new Map<string, WorkspaceMetadataEntity>();
		for (const entity of all) {
			if (pathSet.has(entity.path)) {
				map.set(entity.path, entity);
			}
		}
		return map;
	}

	/**
	 * Create a new workspace metadata entity
	 * @throws Error if path already exists
	 */
	async create(
		data: Omit<WorkspaceMetadataEntity, 'id' | 'version' | 'createdAt' | 'updatedAt'>
	): Promise<WorkspaceMetadataEntity> {
		// Enforce path uniqueness
		const existing = await this.findByPath(data.path);
		if (existing) {
			throw new Error(`Workspace metadata already exists for path: ${data.path}`);
		}
		return this.base.create(data);
	}

	/**
	 * Update workspace metadata fields
	 */
	async update(
		id: string,
		data: Partial<Pick<WorkspaceMetadataEntity, 'name' | 'description' | 'color' | 'mode' | 'gitBranch'>>
	): Promise<WorkspaceMetadataEntity> {
		return this.base.update(id, data);
	}

	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}

	/**
	 * Upsert by path: update if exists, create if not
	 */
	async upsertByPath(
		path: string,
		data: Partial<Pick<WorkspaceMetadataEntity, 'name' | 'description' | 'color' | 'mode' | 'gitBranch'>>
	): Promise<WorkspaceMetadataEntity> {
		const existing = await this.findByPath(path);
		if (existing) {
			return this.update(existing.id, data);
		}
		return this.base.create({
			path,
			name: data.name,
			description: data.description,
			color: data.color,
			mode: data.mode ?? 'development',
			gitBranch: data.gitBranch,
		});
	}

	/**
	 * Ensure a workspace entity exists for the given path.
	 * Returns existing entity or creates one with defaults.
	 */
	async ensureByPath(path: string): Promise<WorkspaceMetadataEntity> {
		const existing = await this.findByPath(path);
		if (existing) {
			return existing;
		}

		// Extract name from path
		const name = path.split(/[/\\]/).filter(Boolean).pop() || 'Workspace';
		log.info(`Creating default workspace entity for path: ${path}`);
		return this.base.create({
			path,
			name,
			mode: 'development',
		});
	}
}
