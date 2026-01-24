/**
 * ===========================================================================================
 * DEBUG SCRIPT - Projects and Workspaces
 * ===========================================================================================
 *
 * This script helps debug the "0 workspaces" issue by:
 * 1. Reading projects.json and displaying current data
 * 2. Checking if workspaceIds are empty
 * 3. Verifying migration has run
 * 4. Checking if there are connected workspaces (if orchestrator is running)
 *
 * Usage:
 *   pnpm tsx src/scripts/debug-projects.ts
 *
 * ===========================================================================================
 */
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createLogger } from 'shared-common/logger';

const log = createLogger('DebugProjects');

async function debugProjects() {
	try {
		// Read projects.json
		const projectsPath = join(process.cwd(), 'data', 'projects.json');
		const projectsContent = await readFile(projectsPath, 'utf-8');
		const projectsData = JSON.parse(projectsContent);

		log.info('=== PROJECTS DATA ===');
		log.info(`Total projects: ${projectsData.projects.length}`);
		log.info('');

		// Display each project
		projectsData.projects.forEach((project: any, index: number) => {
			log.info(`[${index + 1}] ${project.name} (${project.id})`);
			log.info(`  - workspaceIds: ${JSON.stringify(project.workspaceIds)}`);
			log.info(`  - workspaceIds length: ${project.workspaceIds?.length ?? 'undefined'}`);
			log.info(`  - taskCount: ${project.taskCount}`);
			log.info(`  - archived: ${project.archived}`);
			log.info(`  - pinned: ${project.pinned}`);
			log.info(`  - version: ${project.version}`);
			log.info('');
		});

		// Check migration status
		try {
			const migrationsPath = join(process.cwd(), 'data', 'migrations.json');
			const migrationsContent = await readFile(migrationsPath, 'utf-8');
			const migrationsData = JSON.parse(migrationsContent);

			log.info('=== MIGRATIONS STATUS ===');
			log.info(`Migrations executed: ${migrationsData.migrations.length}`);
			migrationsData.migrations.forEach((migration: any) => {
				log.info(`  - Migrated: ${migration.migrated}`);
				log.info(`  - At: ${migration.migratedAt}`);
			});
			log.info('');
		} catch (error) {
			log.warn('No migrations file found');
			log.info('');
		}

		// Summary
		const emptyWorkspaceProjects = projectsData.projects.filter(
			(p: any) => !p.workspaceIds || p.workspaceIds.length === 0
		);
		const projectsWithWorkspaces = projectsData.projects.filter(
			(p: any) => p.workspaceIds && p.workspaceIds.length > 0
		);

		log.info('=== SUMMARY ===');
		log.info(`Projects with empty workspaceIds: ${emptyWorkspaceProjects.length}`);
		log.info(`Projects with workspaces: ${projectsWithWorkspaces.length}`);
		log.info('');

		if (emptyWorkspaceProjects.length > 0) {
			log.warn('⚠️  ISSUE FOUND: Projects have empty workspaceIds arrays');
			log.info('');
			log.info('POSSIBLE CAUSES:');
			log.info('1. No workspaces are connected (no workers running)');
			log.info('2. Workspaces were never associated with projects via the UI');
			log.info('3. Bidirectional sync failed when associating workspaces');
			log.info('');
			log.info('TO FIX:');
			log.info('1. Start a worker to connect workspaces');
			log.info('2. Open the "Manage Workspaces" dialog for a project');
			log.info('3. Associate workspaces using the arrow buttons in the dialog');
			log.info('4. Check backend logs for any errors during association');
		} else {
			log.info('✅ All projects have workspaces associated');
		}

		// Check for undefined fields (pre-migration data)
		const projectsWithUndefined = projectsData.projects.filter(
			(p: any) =>
				p.workspaceIds === undefined ||
				p.taskCount === undefined ||
				p.archived === undefined ||
				p.pinned === undefined ||
				p.order === undefined
		);

		if (projectsWithUndefined.length > 0) {
			log.warn('');
			log.warn(
				`⚠️  WARNING: ${projectsWithUndefined.length} projects have undefined fields (pre-migration data)`
			);
			projectsWithUndefined.forEach((p: any) => {
				log.warn(`  - ${p.name} (${p.id})`);
				if (p.workspaceIds === undefined) log.warn('    - workspaceIds is undefined');
				if (p.taskCount === undefined) log.warn('    - taskCount is undefined');
				if (p.archived === undefined) log.warn('    - archived is undefined');
				if (p.pinned === undefined) log.warn('    - pinned is undefined');
				if (p.order === undefined) log.warn('    - order is undefined');
			});
			log.info('');
			log.info('ACTION REQUIRED: Run the migration script:');
			log.info('  pnpm tsx src/scripts/migrate-projects.ts');
		}
	} catch (error) {
		log.error('Failed to debug projects:', error);
		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
			log.error('');
			log.error('Projects file not found. This could mean:');
			log.error('1. The backend has never been started');
			log.error('2. The STORAGE_MODE is set to "memory" instead of "file"');
			log.error('3. The data directory path is incorrect');
		}
	}
}

// Run the debug script
debugProjects();
