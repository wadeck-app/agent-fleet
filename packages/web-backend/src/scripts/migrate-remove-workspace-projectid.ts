#!/usr/bin/env tsx
import { resolve } from 'path';
import { createLogger } from 'shared-common/logger';

import type { Project } from '@app/shared/api/projects.contract';

import { RemoveWorkspaceProjectIdMigration } from '../migrations/RemoveWorkspaceProjectIdMigration';
import { BaseRepository } from '../repositories/BaseRepository';
import { ProjectsRepository } from '../repositories/ProjectsRepository';
import { FileBasedStorage } from '../storage/FileBasedStorage';

const log = createLogger('MigrateRemoveWorkspaceProjectId');

/**
 * ===========================================================================================
 * MIGRATION SCRIPT: REMOVE WORKSPACE PROJECT ID
 * ===========================================================================================
 *
 * Executes the RemoveWorkspaceProjectIdMigration on all workspace metadata files.
 *
 * This migration removes projectId from workspace metadata to establish
 * a single source of truth: project.workspaceIds[]
 *
 * Usage:
 *   npm run migrate:remove-workspace-projectid -- --workspace-paths "/path/to/workspace1" "/path/to/workspace2"
 *   npm run migrate:remove-workspace-projectid -- --dry-run
 *
 * Options:
 *   --workspace-paths: Comma-separated list of workspace paths to migrate
 *   --dry-run: Show what would be migrated without making changes
 *
 * ===========================================================================================
 */

interface MigrationOptions {
	workspacePaths?: string[];
	dryRun: boolean;
}

async function parseArgs(): Promise<MigrationOptions> {
	const args = process.argv.slice(2);
	const options: MigrationOptions = {
		dryRun: args.includes('--dry-run'),
	};

	const workspacePathsIndex = args.indexOf('--workspace-paths');
	if (workspacePathsIndex !== -1 && args[workspacePathsIndex + 1]) {
		options.workspacePaths = args[workspacePathsIndex + 1].split(',').map(p => p.trim());
	}

	return options;
}

async function main() {
	log.info('='.repeat(80));
	log.info('MIGRATION: REMOVE WORKSPACE PROJECT ID');
	log.info('='.repeat(80));

	const options = await parseArgs();

	if (options.dryRun) {
		log.info('DRY RUN MODE - No changes will be made');
	}

	// Setup repositories
	const dataDir = resolve(process.cwd(), 'packages', 'web-backend', 'data');
	const storage = new FileBasedStorage(dataDir);
	const baseRepository = new BaseRepository<Project>('projects', storage);
	const projectsRepository = new ProjectsRepository(baseRepository);

	// Create migration
	const migration = new RemoveWorkspaceProjectIdMigration(projectsRepository);

	// Get workspace paths
	let workspacePaths: string[] = [];

	if (options.workspacePaths && options.workspacePaths.length > 0) {
		workspacePaths = options.workspacePaths;
		log.info(`Migrating ${workspacePaths.length} specified workspace(s)`);
	} else {
		log.warn('No workspace paths provided. Use --workspace-paths to specify workspaces.');
		log.info(
			'Example: npm run migrate:remove-workspace-projectid -- --workspace-paths "/path/to/ws1,/path/to/ws2"'
		);
		process.exit(1);
	}

	// Display workspace paths
	log.info('Workspace paths to migrate:');
	workspacePaths.forEach((path, index) => {
		log.info(`  ${index + 1}. ${path}`);
	});

	if (options.dryRun) {
		log.info('');
		log.info('DRY RUN - Checking workspaces without making changes...');
		log.info('');
	}

	// Run migration
	const startTime = Date.now();

	if (options.dryRun) {
		log.info('Dry run mode - skipping actual migration');
		// Could add dry-run preview logic here
		log.info('To run the migration, remove the --dry-run flag');
	} else {
		const result = await migration.migrateAll(workspacePaths);

		const duration = Date.now() - startTime;

		log.info('='.repeat(80));
		log.info('MIGRATION SUMMARY');
		log.info('='.repeat(80));
		log.info(`Total workspaces: ${workspacePaths.length}`);
		log.info(`Migrated: ${result.migrated}`);
		log.info(`Skipped: ${result.skipped}`);
		log.info(`Errors: ${result.errors}`);
		log.info(`Duration: ${duration}ms`);

		if (result.errors > 0) {
			log.error('');
			log.error('Migration completed with errors. Please review the logs above.');
			process.exit(1);
		} else {
			log.info('');
			log.info('Migration completed successfully!');
		}
	}
}

main().catch(error => {
	log.error('Migration failed:', error);
	process.exit(1);
});
