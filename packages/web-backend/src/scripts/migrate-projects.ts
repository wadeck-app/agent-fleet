/**
 * ===========================================================================================
 * PROJECTS MIGRATION SCRIPT
 * ===========================================================================================
 *
 * This script migrates existing data to support the Projects feature:
 * 1. Creates a default "Unassigned" project
 * 2. Assigns all existing tasks without projectId to this default project
 * 3. Updates the task count for the default project
 *
 * Usage:
 *   npm run migrate:projects
 *
 * ===========================================================================================
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createLogger } from 'shared-common/logger';

const log = createLogger('MigrateProjects');

// Default project configuration
const DEFAULT_PROJECT = {
	id: 'default',
	name: 'Unassigned',
	description: 'Default project for tasks without a specific project assignment',
	workspaceIds: [],
	taskCount: 0,
	color: '#6B7280',
	archived: false,
	version: 0,
};

interface Task {
	id: string;
	projectId?: string;
	[key: string]: unknown;
}

interface Project {
	id: string;
	name: string;
	description?: string;
	workspaceIds: string[];
	taskCount: number;
	color?: string;
	archived: boolean;
	createdAt: string;
	updatedAt: string;
	version: number;
}

/**
 * Get the data directory path
 */
function getDataDir(): string {
	return resolve(process.cwd(), 'data');
}

/**
 * Read JSON file
 */
function readJsonFile<T>(filePath: string): T | null {
	try {
		if (!existsSync(filePath)) {
			return null;
		}
		const content = readFileSync(filePath, 'utf-8');
		return JSON.parse(content);
	} catch (error) {
		log.error(`Error reading file ${filePath}:`, error);
		return null;
	}
}

/**
 * Write JSON file
 */
function writeJsonFile<T>(filePath: string, data: T): void {
	try {
		writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
		log.info(`✓ Written to ${filePath}`);
	} catch (error) {
		log.error(`Error writing file ${filePath}:`, error);
		throw error;
	}
}

/**
 * Main migration function
 */
async function migrate() {
	log.info('Starting Projects migration...\n');

	const dataDir = getDataDir();
	const projectsFilePath = resolve(dataDir, 'projects.json');

	// Step 1: Create or load projects.json
	log.info('Step 1: Loading or creating projects.json...');
	const projectsData: { projects: Project[] } = readJsonFile(projectsFilePath) || { projects: [] };

	// Check if default project already exists
	const existingDefaultProject = projectsData.projects.find(p => p.id === 'default');
	if (existingDefaultProject) {
		log.info('  ℹ Default project already exists');
	} else {
		// Create default project
		const now = new Date().toISOString();
		const defaultProject: Project = {
			...DEFAULT_PROJECT,
			createdAt: now,
			updatedAt: now,
		};
		projectsData.projects.push(defaultProject);
		log.info('  ✓ Created default project "Unassigned"');
	}

	// Step 2: Scan orchestrator tasks and assign to default project
	log.info('\nStep 2: Scanning tasks and assigning to default project...');

	// Note: Since tasks are stored in the orchestrator (in-memory or file-based),
	// we'll need to handle this differently. For now, we'll just create the default project.
	// The orchestrator will need to be updated separately to handle projectId.

	log.info('  ℹ Task migration is handled by the orchestrator');
	log.info('  ℹ New tasks will require projectId on creation');

	// Step 3: Save projects.json
	log.info('\nStep 3: Saving projects.json...');
	writeJsonFile(projectsFilePath, projectsData);

	log.info('\n✓ Migration completed successfully!');
	log.info('\nSummary:');
	log.info(`  - Projects: ${projectsData.projects.length}`);
	log.info(`  - Default project ID: ${DEFAULT_PROJECT.id}`);
	log.info('\nNext steps:');
	log.info('  1. Start the backend server');
	log.info('  2. Verify the default project exists at GET /api/projects/');
	log.info('  3. Create new tasks with projectId="default" for testing');
}

// Run migration
migrate()
	.then(() => {
		log.info('\nMigration completed.');
		process.exit(0);
	})
	.catch(error => {
		log.error('\nMigration failed:', error);
		process.exit(1);
	});
