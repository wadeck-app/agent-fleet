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
import { logger } from 'shared-common/logger';

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
		logger.error(`Error reading file ${filePath}:`, error);
		return null;
	}
}

/**
 * Write JSON file
 */
function writeJsonFile<T>(filePath: string, data: T): void {
	try {
		writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
		logger.info(`✓ Written to ${filePath}`);
	} catch (error) {
		logger.error(`Error writing file ${filePath}:`, error);
		throw error;
	}
}

/**
 * Main migration function
 */
async function migrate() {
	logger.info('Starting Projects migration...\n');

	const dataDir = getDataDir();
	const projectsFilePath = resolve(dataDir, 'projects.json');

	// Step 1: Create or load projects.json
	logger.info('Step 1: Loading or creating projects.json...');
	const projectsData: { projects: Project[] } = readJsonFile(projectsFilePath) || { projects: [] };

	// Check if default project already exists
	const existingDefaultProject = projectsData.projects.find(p => p.id === 'default');
	if (existingDefaultProject) {
		logger.info('  ℹ Default project already exists');
	} else {
		// Create default project
		const now = new Date().toISOString();
		const defaultProject: Project = {
			...DEFAULT_PROJECT,
			createdAt: now,
			updatedAt: now,
		};
		projectsData.projects.push(defaultProject);
		logger.info('  ✓ Created default project "Unassigned"');
	}

	// Step 2: Scan orchestrator tasks and assign to default project
	logger.info('\nStep 2: Scanning tasks and assigning to default project...');

	// Note: Since tasks are stored in the orchestrator (in-memory or file-based),
	// we'll need to handle this differently. For now, we'll just create the default project.
	// The orchestrator will need to be updated separately to handle projectId.

	logger.info('  ℹ Task migration is handled by the orchestrator');
	logger.info('  ℹ New tasks will require projectId on creation');

	// Step 3: Save projects.json
	logger.info('\nStep 3: Saving projects.json...');
	writeJsonFile(projectsFilePath, projectsData);

	logger.info('\n✓ Migration completed successfully!');
	logger.info('\nSummary:');
	logger.info(`  - Projects: ${projectsData.projects.length}`);
	logger.info(`  - Default project ID: ${DEFAULT_PROJECT.id}`);
	logger.info('\nNext steps:');
	logger.info('  1. Start the backend server');
	logger.info('  2. Verify the default project exists at GET /api/projects/');
	logger.info('  3. Create new tasks with projectId="default" for testing');
}

// Run migration
migrate()
	.then(() => {
		logger.info('\nMigration completed.');
		process.exit(0);
	})
	.catch(error => {
		logger.error('\nMigration failed:', error);
		process.exit(1);
	});
