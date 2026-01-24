import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { createLogger } from 'shared-common/logger';

import type { ProjectsRepository } from '../repositories/ProjectsRepository';

const log = createLogger('RemoveWorkspaceProjectIdMigration');

interface WorkspaceMetadataLegacy {
	id: string;
	name?: string;
	description?: string;
	color?: string;
	projectId?: string; // This field will be removed
	mode?: 'development' | 'production' | 'staging';
	createdAt: string;
	updatedAt: string;
}

/**
 * ===========================================================================================
 * MIGRATION: REMOVE WORKSPACE PROJECT ID
 * ===========================================================================================
 *
 * This migration removes projectId from workspace metadata files to establish
 * a single source of truth: project.workspaceIds[]
 *
 * Strategy:
 * 1. Read all workspace metadata files that have projectId
 * 2. For each workspace with projectId:
 *    - Verify the project exists
 *    - Verify the project.workspaceIds[] contains this workspace
 *    - If not, add workspace to project.workspaceIds[] (repair inconsistency)
 * 3. Remove projectId from the workspace metadata file
 * 4. Save the cleaned metadata
 *
 * Migration Name: remove-workspace-projectId-v1
 * Run Once: true
 * ===========================================================================================
 */
export class RemoveWorkspaceProjectIdMigration {
	static readonly MIGRATION_NAME = 'remove-workspace-projectId-v1';

	constructor(private readonly projectsRepository: ProjectsRepository) {}

	/**
	 * Run the migration on a single workspace
	 * @param workspacePath Absolute path to workspace directory
	 * @returns true if changes were made, false otherwise
	 */
	async migrateWorkspace(workspacePath: string): Promise<boolean> {
		const metadataPath = join(workspacePath, '.agent-fleet', 'workspace-metadata.json');

		// Check if metadata file exists
		if (!existsSync(metadataPath)) {
			log.info(`No metadata file at ${metadataPath}, skipping`);
			return false;
		}

		try {
			// Read metadata
			const content = await readFile(metadataPath, 'utf-8');
			const metadata: WorkspaceMetadataLegacy = JSON.parse(content);

			// Check if projectId exists
			if (!metadata.projectId) {
				log.info(`Workspace ${metadata.id} has no projectId, skipping`);
				return false;
			}

			log.info(`Migrating workspace ${metadata.id} with projectId: ${metadata.projectId}`);

			// Verify project exists and contains this workspace
			try {
				const project = await this.projectsRepository.findById(metadata.projectId);

				if (project) {
					const hasWorkspace = project.workspaceIds?.includes(metadata.id) ?? false;

					if (!hasWorkspace) {
						// Repair inconsistency: add workspace to project
						log.warn(
							`Inconsistency detected: Project ${metadata.projectId} does not contain workspace ${metadata.id}. Adding it.`
						);
						await this.projectsRepository.addWorkspaces(metadata.projectId, [metadata.id]);
					} else {
						log.info(`Project ${metadata.projectId} correctly contains workspace ${metadata.id}`);
					}
				} else {
					log.warn(
						`Project ${metadata.projectId} not found. Orphaned workspace ${metadata.id}. Removing projectId anyway.`
					);
				}
			} catch (error) {
				log.error(
					`Error checking/repairing project ${metadata.projectId} for workspace ${metadata.id}:`,
					error
				);
				// Continue with migration anyway
			}

			// Remove projectId from metadata
			const { projectId: _removed, ...cleanedMetadata } = metadata;

			// Update the updatedAt timestamp
			cleanedMetadata.updatedAt = new Date().toISOString();

			// Save cleaned metadata
			await writeFile(metadataPath, JSON.stringify(cleanedMetadata, null, 2), 'utf-8');

			log.info(`Successfully migrated workspace ${metadata.id}, removed projectId`);
			return true;
		} catch (error) {
			log.error(`Error migrating workspace at ${workspacePath}:`, error);
			return false;
		}
	}

	/**
	 * Run the migration on multiple workspaces
	 * @param workspacePaths Array of workspace paths to migrate
	 * @returns Summary of migration results
	 */
	async migrateAll(workspacePaths: string[]): Promise<{ migrated: number; skipped: number; errors: number }> {
		log.info(`Starting migration for ${workspacePaths.length} workspaces`);

		let migrated = 0;
		let skipped = 0;
		let errors = 0;

		for (const workspacePath of workspacePaths) {
			try {
				const changed = await this.migrateWorkspace(workspacePath);
				if (changed) {
					migrated++;
				} else {
					skipped++;
				}
			} catch (error) {
				log.error(`Error migrating ${workspacePath}:`, error);
				errors++;
			}
		}

		log.info(`Migration complete: ${migrated} migrated, ${skipped} skipped, ${errors} errors`);

		return { migrated, skipped, errors };
	}
}
