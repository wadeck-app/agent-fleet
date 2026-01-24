import { createLogger } from 'shared-common/logger';

import type { Project } from '@app/shared/api/projects.contract';
import type { BaseEntity } from '@app/shared/common/base-entity';

import type { DataStorage } from '../storage/DataStorage';

const log = createLogger('NormalizeProjectsMigration');

/**
 * Migration record stored in the migrations table
 */
interface MigrationRecord extends BaseEntity {
	migrated: boolean;
	migratedAt: string;
}

/**
 * ===========================================================================================
 * NORMALIZE PROJECTS MIGRATION
 * ===========================================================================================
 *
 * Migrates existing projects to ensure all required fields have proper default values.
 *
 * Problem:
 * - When `.default()` was removed from ProjectSchema to fix PATCH bug, existing projects
 *   were left with undefined values for workspaceIds, archived, pinned, order, taskCount
 *
 * Solution:
 * - Scan all projects
 * - Replace undefined values with proper defaults
 * - Update storage without incrementing version (silent migration)
 *
 * When to run:
 * - Once at startup (idempotent - safe to run multiple times)
 * - Can be triggered manually via API if needed
 *
 * ===========================================================================================
 */

export class NormalizeProjectsMigration {
	private static readonly MIGRATION_NAME = 'normalize-projects:v1';
	private readonly TABLE_NAME = 'projects';

	constructor(private readonly storage: DataStorage) {}

	/**
	 * Check if migration has already been executed
	 */
	async hasRun(): Promise<boolean> {
		try {
			// Query for migration record by name (since we can't use custom IDs)
			const results = await this.storage
				.query<MigrationRecord>('migrations')
				.where('migrated', '=', true)
				.execute();

			// For now, we assume any migrated record means the migration has run
			// In the future, we could add a 'name' field to track multiple migrations
			return results.length > 0;
		} catch (_error) {
			// Migration tracking table might not exist yet
			return false;
		}
	}

	/**
	 * Mark migration as completed
	 */
	private async markAsRun(): Promise<void> {
		try {
			// Create migration record
			await this.storage.create<MigrationRecord>('migrations', {
				migrated: true,
				migratedAt: new Date().toISOString(),
			});
		} catch (error) {
			log.warn('Failed to mark migration as run:', error);
		}
	}

	/**
	 * Execute the migration
	 * Returns number of projects updated
	 */
	async run(): Promise<number> {
		// Check if already run
		if (await this.hasRun()) {
			log.info(`Migration ${NormalizeProjectsMigration.MIGRATION_NAME} already executed, skipping`);
			return 0;
		}

		log.info(`Starting migration: ${NormalizeProjectsMigration.MIGRATION_NAME}`);

		try {
			// Get all projects
			const projects = await this.storage.query<Project>(this.TABLE_NAME).execute();

			let updatedCount = 0;

			// Process each project
			for (const project of projects) {
				let needsUpdate = false;
				const updates: Partial<Project> = {};

				// Check workspaceIds
				if (project.workspaceIds === undefined || project.workspaceIds === null) {
					updates.workspaceIds = [];
					needsUpdate = true;
					log.info(`Project ${project.id} (${project.name}): Setting workspaceIds to []`);
				}

				// Check taskCount
				if (project.taskCount === undefined || project.taskCount === null) {
					updates.taskCount = 0;
					needsUpdate = true;
					log.info(`Project ${project.id} (${project.name}): Setting taskCount to 0`);
				}

				// Check archived
				if (project.archived === undefined || project.archived === null) {
					updates.archived = false;
					needsUpdate = true;
					log.info(`Project ${project.id} (${project.name}): Setting archived to false`);
				}

				// Check pinned
				if (project.pinned === undefined || project.pinned === null) {
					updates.pinned = false;
					needsUpdate = true;
					log.info(`Project ${project.id} (${project.name}): Setting pinned to false`);
				}

				// Check order
				if (project.order === undefined || project.order === null) {
					updates.order = 0;
					needsUpdate = true;
					log.info(`Project ${project.id} (${project.name}): Setting order to 0`);
				}

				// Update if needed (without incrementing version - silent migration)
				if (needsUpdate) {
					await this.storage.update(this.TABLE_NAME, project.id, updates);
					updatedCount++;
				}
			}

			// Mark as run
			await this.markAsRun();

			log.info(
				`Migration ${NormalizeProjectsMigration.MIGRATION_NAME} completed. Updated ${updatedCount} of ${projects.length} projects`
			);
			return updatedCount;
		} catch (error) {
			log.error(`Migration ${NormalizeProjectsMigration.MIGRATION_NAME} failed:`, error);
			throw error;
		}
	}

	/**
	 * Force re-run the migration (useful for testing or data recovery)
	 */
	async forceRun(): Promise<number> {
		log.info(`Force running migration: ${NormalizeProjectsMigration.MIGRATION_NAME} (ignoring previous execution)`);

		// Get all projects
		const projects = await this.storage.query<Project>(this.TABLE_NAME).execute();

		let updatedCount = 0;

		// Process each project
		for (const project of projects) {
			const updates: Partial<Project> = {
				workspaceIds: project.workspaceIds ?? [],
				taskCount: project.taskCount ?? 0,
				archived: project.archived ?? false,
				pinned: project.pinned ?? false,
				order: project.order ?? 0,
			};

			// Always update (idempotent)
			await this.storage.update(this.TABLE_NAME, project.id, updates);
			updatedCount++;
		}

		log.info(
			`Migration ${NormalizeProjectsMigration.MIGRATION_NAME} force completed. Updated ${updatedCount} of ${projects.length} projects`
		);
		return updatedCount;
	}
}
