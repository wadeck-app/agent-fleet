import { copyFile, mkdir, readFile, readdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import type { Task as BackendTask } from '@app/shared/api/tasks.contract';

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
	metadata?: Record<string, any>;
	history?: Array<{
		timestamp: string;
		event: string;
		[key: string]: any;
	}>;
	startedAt?: string;
	completedAt?: string;
	flowId?: string;
	flowInputs?: Record<string, any>;
	flowResult?: {
		status: 'completed' | 'failed';
		outputs?: Record<string, any>;
		error?: string;
		trace?: any;
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
		status: orchestratorTask.status as any,
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
				console.error(`[Migration] Failed to read task file ${file}:`, error);
				throw error;
			}
		}

		return tasks;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			console.log('[Migration] Orchestrator tasks directory not found. Nothing to migrate.');
			return [];
		}
		throw error;
	}
}

/**
 * Create backup of orchestrator data
 */
async function createBackup(): Promise<void> {
	console.log('[Migration] Creating backup of orchestrator data...');

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

		console.log(`[Migration] Backed up ${jsonFiles.length} task files to ${ORCHESTRATOR_BACKUP_DIR}`);
	} catch (error) {
		console.error('[Migration] Failed to create backup:', error);
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

	console.log(`[Migration] Wrote ${tasks.length} tasks to ${BACKEND_TASKS_FILE}`);
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

	console.log('[Migration] Starting migration...');
	console.log(`[Migration] Dry-run mode: ${dryRun}`);
	console.log('');

	// Read orchestrator tasks
	console.log('[Migration] Reading orchestrator tasks...');
	const orchestratorTasks = await readOrchestratorTasks();
	stats.total = orchestratorTasks.length;

	if (stats.total === 0) {
		console.log('[Migration] No tasks to migrate.');
		return stats;
	}

	console.log(`[Migration] Found ${stats.total} tasks`);
	console.log('');

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
				console.log(`[Migration] Would migrate task: ${backendTask.id}`);
				console.log(`  Description: ${backendTask.description}`);
				console.log(`  Status: ${backendTask.status}`);
				console.log(`  Priority: ${backendTask.priority}`);
				console.log(`  Project ID: ${backendTask.projectId || '(none)'}`);
				console.log(`  Workspace ID: ${backendTask.workspaceId || '(none)'}`);
				console.log(`  Assigned Worker: ${backendTask.assignedWorker?.workerId || '(none)'}`);
				console.log('');
			}
		} catch (error) {
			stats.failed++;
			stats.errors.push({
				taskId: orchestratorTask.id,
				error: (error as Error).message,
			});
			console.error(`[Migration] Failed to transform task ${orchestratorTask.id}:`, error);
		}
	}

	// Write to backend storage (only if not dry-run)
	if (!dryRun) {
		console.log('[Migration] Creating backup...');
		await createBackup();
		console.log('');

		console.log('[Migration] Writing tasks to backend storage...');
		await writeBackendTasks(backendTasks);
		console.log('');
	}

	return stats;
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
	const dryRun = process.argv.includes('--dry-run');

	console.log('');
	console.log('===========================================================================================');
	console.log('ORCHESTRATOR TO BACKEND STORAGE MIGRATION');
	console.log('===========================================================================================');
	console.log('');

	try {
		const stats = await migrate(dryRun);

		console.log('===========================================================================================');
		console.log('MIGRATION SUMMARY');
		console.log('===========================================================================================');
		console.log(`Total tasks: ${stats.total}`);
		console.log(`Successfully migrated: ${stats.migrated}`);
		console.log(`Failed: ${stats.failed}`);
		console.log(`Skipped: ${stats.skipped}`);
		console.log('');

		if (stats.errors.length > 0) {
			console.log('ERRORS:');
			for (const error of stats.errors) {
				console.log(`  - Task ${error.taskId}: ${error.error}`);
			}
			console.log('');
		}

		if (dryRun) {
			console.log('DRY-RUN MODE: No changes were made.');
			console.log('Run without --dry-run to perform the migration.');
		} else {
			console.log('Migration complete!');
			console.log(`Backup created at: ${ORCHESTRATOR_BACKUP_DIR}`);
			console.log(`Tasks written to: ${BACKEND_TASKS_FILE}`);
		}

		console.log('===========================================================================================');
		console.log('');

		// Exit with error code if any tasks failed
		if (stats.failed > 0) {
			process.exit(1);
		}
	} catch (error) {
		console.error('');
		console.error('===========================================================================================');
		console.error('MIGRATION FAILED');
		console.error('===========================================================================================');
		console.error((error as Error).message);
		console.error('');
		console.error('Stack trace:');
		console.error((error as Error).stack);
		console.error('===========================================================================================');
		console.error('');
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
		console.error('Unhandled error:', error);
		process.exit(1);
	});
}

export { migrate, transformTask, validateTask };
