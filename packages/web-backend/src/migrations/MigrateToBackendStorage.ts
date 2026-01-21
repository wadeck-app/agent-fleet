import { copyFile, mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { createLogger } from 'shared-common/logger';
import { fileURLToPath } from 'url';

import type { Task as BackendTask } from '@app/shared/api/tasks.contract';

const log = createLogger('MigrateToBackendStorage');

/**
 * ===========================================================================================
 * MIGRATION SCRIPT: ORCHESTRATOR TO BACKEND STORAGE
 * ===========================================================================================
 *
 * Migrates existing tasks from orchestrator's file-based storage to backend storage.
 *
 * From: ./packages/orchestrator/data/tasks/{taskId}.json (orchestrator format)
 * To: ./packages/web-backend/data/tasks.json (backend format)
 *
 * Usage:
 *   npm run migrate -- --dry-run  # Show what would be migrated
 *   npm run migrate               # Actually migrate
 *
 * Transformations:
 * - assignedTo → assignedWorker (field rename)
 * - metadata.projectId → projectId (extract to top level)
 * - metadata.workspaceId → workspaceId (extract to top level)
 * - version: 1 (add version field for optimistic locking)
 * - Remove orchestrator-specific fields (comments, history, metadata, etc.)
 *
 * Safety:
 * - Creates backup before migration (./packages/orchestrator/data/tasks.backup/)
 * - Validates all tasks before writing
 * - Dry-run mode to preview changes
 * - Error handling: logs errors but continues processing other tasks
 *
 * ===========================================================================================
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths
const PROJECT_ROOT = join(__dirname, '..', '..', '..', '..');
const ORCHESTRATOR_TASKS_DIR = join(PROJECT_ROOT, 'packages', 'orchestrator', 'data', 'tasks');
const ORCHESTRATOR_BACKUP_DIR = join(PROJECT_ROOT, 'packages', 'orchestrator', 'data', 'tasks.backup');
const BACKEND_DATA_DIR = join(PROJECT_ROOT, 'packages', 'web-backend', 'data');
const BACKEND_TASKS_FILE = join(BACKEND_DATA_DIR, 'tasks.json');

/**
 * Orchestrator task format (from shared-orch-worker/domain-types.ts)
 */
interface OrchestratorTask {
	id: string;
	description: string;
	status: string;
	priority: 'low' | 'medium' | 'high' | 'urgent';
	createdAt: string;
	updatedAt: string;
	assignedTo: {
		workerId: string;
	} | null;
	comments?: Array<{
		timestamp: string;
		author: string;
		content: string;
	}>;
	metadata?: Record<string, unknown>;
	history?: Array<{
		timestamp: string;
		event: string;
		[key: string]: unknown;
	}>;
	startedAt?: string;
	completedAt?: string;
	flowId?: string;
	flowInputs?: Record<string, unknown>;
	flowResult?: {
		status: 'completed' | 'failed';
		outputs?: Record<string, unknown>;
		error?: string;
		trace?: unknown;
	};
	workspacePath?: string;
	activeInterventionId?: string;
	interventionHistory?: string[];
}

/**
 * Migration statistics
 */
interface MigrationStats {
	total: number;
	migrated: number;
	failed: number;
	skipped: number;
	errors: Array<{
		taskId: string;
		error: string;
	}>;
}

/**
 * Transform orchestrator task to backend task format
 */
function transformTask(orchestratorTask: OrchestratorTask): BackendTask {
	// Extract projectId and workspaceId from metadata
	const projectId = orchestratorTask.metadata?.projectId as string | undefined;
	const workspaceId = orchestratorTask.metadata?.workspaceId as string | undefined;

	// Transform to backend format
	const backendTask: BackendTask = {
		id: orchestratorTask.id,
		description: orchestratorTask.description,
		status: orchestratorTask.status as BackendTask['status'],
		priority: orchestratorTask.priority,
		version: 1, // Add version for optimistic locking
		createdAt: orchestratorTask.createdAt,
		updatedAt: orchestratorTask.updatedAt,
		// Rename assignedTo → assignedWorker
		assignedWorker: orchestratorTask.assignedTo,
		// Extract from metadata to top level
		projectId,
		workspaceId,
		// Flow-related fields
		flowId: orchestratorTask.flowId,
		flowResult: orchestratorTask.flowResult,
	};

	return backendTask;
}

/**
 * Validate that a task has all required fields
 */
function validateTask(task: BackendTask): boolean {
	if (!task.id || typeof task.id !== 'string') {
		throw new Error('Missing or invalid task.id');
	}
	if (!task.description || typeof task.description !== 'string') {
		throw new Error('Missing or invalid task.description');
	}
	if (!task.status || typeof task.status !== 'string') {
		throw new Error('Missing or invalid task.status');
	}
	if (!task.priority || typeof task.priority !== 'string') {
		throw new Error('Missing or invalid task.priority');
	}
	if (!task.version || typeof task.version !== 'number') {
		throw new Error('Missing or invalid task.version');
	}
	if (!task.createdAt || typeof task.createdAt !== 'string') {
		throw new Error('Missing or invalid task.createdAt');
	}
	if (!task.updatedAt || typeof task.updatedAt !== 'string') {
		throw new Error('Missing or invalid task.updatedAt');
	}
	return true;
}

/**
 * Read all orchestrator tasks
 */
async function readOrchestratorTasks(): Promise<OrchestratorTask[]> {
	try {
		const files = await readdir(ORCHESTRATOR_TASKS_DIR);
		const jsonFiles = files.filter(f => f.endsWith('.json'));

		const tasks: OrchestratorTask[] = [];

		for (const file of jsonFiles) {
			try {
				const filePath = join(ORCHESTRATOR_TASKS_DIR, file);
				const content = await readFile(filePath, 'utf-8');
				const task = JSON.parse(content) as OrchestratorTask;
				tasks.push(task);
			} catch (error) {
				log.error(`[Migration] Failed to read task file ${file}:`, error);
				throw error;
			}
		}

		return tasks;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			log.info('[Migration] Orchestrator tasks directory not found. Nothing to migrate.');
			return [];
		}
		throw error;
	}
}

/**
 * Create backup of orchestrator data
 */
async function createBackup(): Promise<void> {
	log.info('[Migration] Creating backup of orchestrator data...');

	try {
		// Create backup directory
		await mkdir(ORCHESTRATOR_BACKUP_DIR, { recursive: true });

		// Copy all task files
		const files = await readdir(ORCHESTRATOR_TASKS_DIR);
		const jsonFiles = files.filter(f => f.endsWith('.json'));

		for (const file of jsonFiles) {
			const sourcePath = join(ORCHESTRATOR_TASKS_DIR, file);
			const destPath = join(ORCHESTRATOR_BACKUP_DIR, file);
			await copyFile(sourcePath, destPath);
		}

		log.info(`[Migration] Backed up ${jsonFiles.length} task files to ${ORCHESTRATOR_BACKUP_DIR}`);
	} catch (error) {
		log.error('[Migration] Failed to create backup:', error);
		throw new Error(`Backup failed: ${(error as Error).message}`);
	}
}

/**
 * Write tasks to backend storage
 */
async function writeBackendTasks(tasks: BackendTask[]): Promise<void> {
	// Ensure backend data directory exists
	await mkdir(BACKEND_DATA_DIR, { recursive: true });

	// Write tasks in FileBasedStorage format: { "tasks": [...] }
	const data = { tasks };
	await writeFile(BACKEND_TASKS_FILE, JSON.stringify(data, null, '\t'), 'utf-8');

	log.info(`[Migration] Wrote ${tasks.length} tasks to ${BACKEND_TASKS_FILE}`);
}

/**
 * Main migration function
 */
async function migrate(dryRun: boolean): Promise<MigrationStats> {
	const stats: MigrationStats = {
		total: 0,
		migrated: 0,
		failed: 0,
		skipped: 0,
		errors: [],
	};

	log.info('[Migration] Starting migration...');
	log.info(`[Migration] Dry-run mode: ${dryRun}`);
	log.info('');

	// Read orchestrator tasks
	log.info('[Migration] Reading orchestrator tasks...');
	const orchestratorTasks = await readOrchestratorTasks();
	stats.total = orchestratorTasks.length;

	if (stats.total === 0) {
		log.info('[Migration] No tasks to migrate.');
		return stats;
	}

	log.info(`[Migration] Found ${stats.total} tasks`);
	log.info('');

	// Transform tasks
	const backendTasks: BackendTask[] = [];

	for (const orchestratorTask of orchestratorTasks) {
		try {
			// Transform
			const backendTask = transformTask(orchestratorTask);

			// Validate
			validateTask(backendTask);

			backendTasks.push(backendTask);
			stats.migrated++;

			if (dryRun) {
				log.info(`[Migration] Would migrate task: ${backendTask.id}`);
				log.info(`  Description: ${backendTask.description}`);
				log.info(`  Status: ${backendTask.status}`);
				log.info(`  Priority: ${backendTask.priority}`);
				log.info(`  Project ID: ${backendTask.projectId || '(none)'}`);
				log.info(`  Workspace ID: ${backendTask.workspaceId || '(none)'}`);
				log.info(`  Assigned Worker: ${backendTask.assignedWorker?.workerId || '(none)'}`);
				log.info('');
			}
		} catch (error) {
			stats.failed++;
			stats.errors.push({
				taskId: orchestratorTask.id,
				error: (error as Error).message,
			});
			log.error(`[Migration] Failed to transform task ${orchestratorTask.id}:`, error);
		}
	}

	// Write to backend storage (only if not dry-run)
	if (!dryRun) {
		log.info('[Migration] Creating backup...');
		await createBackup();
		log.info('');

		log.info('[Migration] Writing tasks to backend storage...');
		await writeBackendTasks(backendTasks);
		log.info('');
	}

	return stats;
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run');

	log.info('');
	log.info('===========================================================================================');
	log.info('ORCHESTRATOR TO BACKEND STORAGE MIGRATION');
	log.info('===========================================================================================');
	log.info('');

	try {
		const stats = await migrate(dryRun);

		log.info('===========================================================================================');
		log.info('MIGRATION SUMMARY');
		log.info('===========================================================================================');
		log.info(`Total tasks: ${stats.total}`);
		log.info(`Successfully migrated: ${stats.migrated}`);
		log.info(`Failed: ${stats.failed}`);
		log.info(`Skipped: ${stats.skipped}`);
		log.info('');

		if (stats.errors.length > 0) {
			log.info('ERRORS:');
			for (const error of stats.errors) {
				log.info(`  - Task ${error.taskId}: ${error.error}`);
			}
			log.info('');
		}

		if (dryRun) {
			log.info('DRY-RUN MODE: No changes were made.');
			log.info('Run without --dry-run to perform the migration.');
		} else {
			log.info('Migration complete!');
			log.info(`Backup created at: ${ORCHESTRATOR_BACKUP_DIR}`);
			log.info(`Tasks written to: ${BACKEND_TASKS_FILE}`);
		}

		log.info('===========================================================================================');
		log.info('');

		// Exit with error code if any tasks failed
		if (stats.failed > 0) {
			process.exit(1);
		}
	} catch (error) {
		log.error('');
		log.error('===========================================================================================');
		log.error('MIGRATION FAILED');
		log.error('===========================================================================================');
		log.error((error as Error).message);
		log.error('');
		log.error('Stack trace:');
		log.error((error as Error).stack || 'No stack trace available');
		log.error('===========================================================================================');
		log.error('');
		process.exit(1);
	}
}

// Run if called directly
// Check if the script is being run directly (not imported)
// Note: process.argv[1] contains the executed file path
const isMainModule =
	process.argv[1]?.replace(/\\/g, '/').endsWith('MigrateToBackendStorage.ts') ||
	process.argv[1]?.replace(/\\/g, '/').endsWith('MigrateToBackendStorage.js');

if (isMainModule) {
	main().catch(error => {
		log.error('Unhandled error:', error);
		process.exit(1);
	});
}

export { migrate, transformTask, validateTask };
