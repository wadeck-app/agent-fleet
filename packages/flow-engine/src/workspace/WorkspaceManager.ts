/**
 * Workspace Manager (Phase 3 - Complete)
 *
 * Manages workspace lifecycle: creation, allocation, tracking, and cleanup.
 * Includes full support for:
 * - Isolated and shared workspaces
 * - Git operations (clone, checkout, branch creation)
 * - Reuse policies (never, if-available, always)
 * - Concurrency management with locks
 * - Workspace pooling by concurrency key
 */
import * as fs from 'fs';
import * as path from 'path';
import { type SimpleGit, simpleGit } from 'simple-git';
import { v4 as uuidv4 } from 'uuid';

import type { GitStrategy, ReusePolicy, Workspace, WorkspaceConfig, WorkspaceGitState, WorkspaceMode } from '../types';

/**
 * Workspace allocation error
 */
export class WorkspaceAllocationError extends Error {
	constructor(message: string) {
		super(`Workspace allocation error: ${message}`);
		this.name = 'WorkspaceAllocationError';
	}
}

/**
 * Options for allocating a workspace
 */
export interface WorkspaceAllocationOptions {
	/** Task ID requesting the workspace */
	taskId: string;

	/** Workspace configuration from flow */
	config: WorkspaceConfig;

	/** Optional base path for workspace (defaults to .agent-fleet/workspaces) */
	basePath?: string;

	/** Optional target branch (defaults to 'main') */
	gitBranch?: string;

	/** Optional: Use existing workspace path (for manual mode) */
	existingPath?: string;

	/** Optional: Task metadata (used for branch naming, etc.) */
	taskMetadata?: Record<string, any>;

	/** Optional: Auto-create workspace (default: true) */
	autoCreate?: boolean;
}

/**
 * Helper function to generate a branch name with task ID and description
 */
function generateBranchName(taskId: string, description?: string): string {
	const shortId = taskId.substring(0, 4);
	const slug = description
		? description
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '') // Remove leading/trailing dashes
				.substring(0, 30)
		: 'task';
	return `fleet/task-${shortId}-${slug}`;
}

/**
 * Workspace Manager handles workspace lifecycle
 */
export class WorkspaceManager {
	private workspaces: Map<string, Workspace> = new Map();
	private workspacesByTask: Map<string, string> = new Map(); // taskId -> workspaceId
	private basePath: string;
	private projectRoot: string;

	/**
	 * Create a new workspace manager
	 * @param projectRoot - Root directory of the project (git repo root)
	 */
	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
		this.basePath = path.join(projectRoot, '.agent-fleet', 'workspaces');
		this.ensureBaseDirectory();
	}

	/**
	 * Ensure the base workspace directory exists
	 */
	private ensureBaseDirectory(): void {
		if (!fs.existsSync(this.basePath)) {
			fs.mkdirSync(this.basePath, { recursive: true });
		}
	}

	/**
	 * Get git instance for a path
	 */
	private getGit(workingDir: string): SimpleGit {
		return simpleGit(workingDir);
	}

	/**
	 * Get current git state for a workspace
	 */
	private async getGitState(workspacePath: string): Promise<WorkspaceGitState | undefined> {
		try {
			const git = this.getGit(workspacePath);
			const status = await git.status();
			const branch = status.current || 'unknown';
			const isClean = status.isClean();
			const log = await git.log({ maxCount: 1 });
			const lastCommit = log.latest?.hash || 'unknown';

			return {
				branch,
				isClean,
				lastCommit,
			};
		} catch (error) {
			console.warn(`Failed to get git state for ${workspacePath}:`, error);
			return undefined;
		}
	}

	/**
	 * Validate and check manual workspace
	 */
	private async validateManualWorkspace(workspacePath: string): Promise<void> {
		// Check if path exists
		if (!fs.existsSync(workspacePath)) {
			throw new WorkspaceAllocationError(`Manual workspace path does not exist: ${workspacePath}`);
		}

		// Get git state and warn if dirty
		const gitState = await this.getGitState(workspacePath);
		if (gitState) {
			if (!gitState.isClean) {
				console.warn(`⚠️  Manual workspace has uncommitted changes: ${workspacePath}`);
				console.warn(`   Branch: ${gitState.branch}`);
			}
		} else {
			console.warn(`⚠️  Manual workspace is not a git repository: ${workspacePath}`);
		}
	}

	/**
	 * Allocate a workspace for a task
	 * Supports all workspace modes: isolated, shared, manual
	 * Supports all git strategies: main-only, feature-branch, any, worktree
	 * Supports all reuse policies: never, if-available, always
	 *
	 * @param options - Allocation options
	 * @returns Allocated workspace
	 * @throws WorkspaceAllocationError if allocation fails
	 */
	public async allocate(options: WorkspaceAllocationOptions): Promise<Workspace> {
		const { taskId, config, gitBranch = 'main', existingPath, taskMetadata = {}, autoCreate = true } = options;

		// Check if task already has a workspace
		if (this.workspacesByTask.has(taskId)) {
			const existingWorkspaceId = this.workspacesByTask.get(taskId)!;
			const existingWorkspace = this.workspaces.get(existingWorkspaceId);
			if (existingWorkspace) {
				return existingWorkspace;
			}
		}

		// Handle manual mode
		if (config.mode === 'manual') {
			if (!existingPath) {
				throw new WorkspaceAllocationError('Manual mode requires existingPath to be provided');
			}
			return this.allocateManualWorkspace(taskId, existingPath, config);
		}

		// Handle shared mode with reuse policies
		if (config.mode === 'shared') {
			// Try to find compatible workspace for reuse
			if (config.reusePolicy === 'always' || config.reusePolicy === 'if-available') {
				const reusableWorkspace = await this.findReusableWorkspace(taskId, config, gitBranch);
				if (reusableWorkspace) {
					console.log(`Reusing shared workspace ${reusableWorkspace.id} for task ${taskId}`);
					return reusableWorkspace;
				}

				// If policy is 'always' but no workspace found, create one
				if (config.reusePolicy === 'always' || autoCreate) {
					return this.createSharedWorkspace(taskId, config, gitBranch, taskMetadata);
				}
			}

			// If reuse policy is 'never', create new shared workspace
			if (config.reusePolicy === 'never') {
				return this.createSharedWorkspace(taskId, config, gitBranch, taskMetadata);
			}
		}

		// Handle isolated mode
		if (config.mode === 'isolated') {
			// Isolated workspaces are never reused
			return this.createIsolatedWorkspace(taskId, config, gitBranch, taskMetadata);
		}

		throw new WorkspaceAllocationError(`Unsupported workspace mode: ${config.mode}`);
	}

	/**
	 * Find a reusable workspace matching the criteria
	 */
	private async findReusableWorkspace(
		taskId: string,
		config: WorkspaceConfig,
		gitBranch: string
	): Promise<Workspace | undefined> {
		const concurrencyKey = config.concurrencyKey || 'default';

		for (const workspace of this.workspaces.values()) {
			// Must be shared mode
			if (workspace.mode !== 'shared') continue;

			// Must match concurrency key
			if (workspace.concurrency.key !== concurrencyKey) continue;

			// Must not be locked
			if (workspace.concurrency.locked) continue;

			// If git strategy requires specific branch, check it
			if (config.gitStrategy === 'main-only' || config.gitStrategy === 'any') {
				if (workspace.git && workspace.git.branch !== gitBranch) continue;
			}

			// Found compatible workspace - add task to active users
			workspace.concurrency.activeTasks.add(taskId);
			workspace.lastUsedAt = new Date().toISOString();
			workspace.usageCount++;
			this.workspacesByTask.set(taskId, workspace.id);

			return workspace;
		}

		return undefined;
	}

	/**
	 * Allocate a manual workspace (existing path provided by user)
	 */
	private async allocateManualWorkspace(
		taskId: string,
		workspacePath: string,
		config: WorkspaceConfig
	): Promise<Workspace> {
		// Validate the manual workspace
		await this.validateManualWorkspace(workspacePath);

		const workspaceId = uuidv4();
		const gitState = await this.getGitState(workspacePath);

		const workspace: Workspace = {
			id: workspaceId,
			path: workspacePath,
			mode: 'manual',
			git: gitState,
			concurrency: {
				key: config.concurrencyKey || workspaceId,
				activeTasks: new Set([taskId]),
				locked: true, // Manual workspaces are typically exclusive
			},
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};

		// Register workspace
		this.workspaces.set(workspaceId, workspace);
		this.workspacesByTask.set(taskId, workspaceId);

		console.log(`Allocated manual workspace ${workspaceId} for task ${taskId}`);
		console.log(`  Path: ${workspacePath}`);
		if (gitState) {
			console.log(`  Branch: ${gitState.branch}`);
		}

		return workspace;
	}

	/**
	 * Create a new shared workspace
	 */
	private async createSharedWorkspace(
		taskId: string,
		config: WorkspaceConfig,
		gitBranch: string,
		taskMetadata: Record<string, any>
	): Promise<Workspace> {
		const workspaceId = uuidv4();
		const workspacePath = path.join(this.basePath, `shared-${workspaceId}`);

		// Create workspace directory
		try {
			fs.mkdirSync(workspacePath, { recursive: true });
		} catch (error) {
			throw new WorkspaceAllocationError(`Failed to create workspace directory: ${error}`);
		}

		// Setup git based on strategy (optional)
		const gitState = await this.setupGit(workspacePath, config, gitBranch, taskMetadata, taskId);

		const workspace: Workspace = {
			id: workspaceId,
			path: workspacePath,
			mode: 'shared',
			git: gitState,
			concurrency: {
				key: config.concurrencyKey || 'default',
				activeTasks: new Set([taskId]),
				locked: false, // Shared workspaces allow concurrent access
			},
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};

		// Register workspace
		this.workspaces.set(workspaceId, workspace);
		this.workspacesByTask.set(taskId, workspaceId);

		console.log(`Created shared workspace ${workspaceId} for task ${taskId}`);
		return workspace;
	}

	/**
	 * Create a new isolated workspace
	 */
	private async createIsolatedWorkspace(
		taskId: string,
		config: WorkspaceConfig,
		gitBranch: string,
		taskMetadata: Record<string, any>
	): Promise<Workspace> {
		const workspaceId = uuidv4();
		const workspacePath = path.join(this.basePath, `isolated-${workspaceId}`);

		// Create workspace directory
		try {
			fs.mkdirSync(workspacePath, { recursive: true });
		} catch (error) {
			throw new WorkspaceAllocationError(`Failed to create workspace directory: ${error}`);
		}

		// Setup git based on strategy (optional)
		const gitState = await this.setupGit(workspacePath, config, gitBranch, taskMetadata, taskId);

		const workspace: Workspace = {
			id: workspaceId,
			path: workspacePath,
			mode: 'isolated',
			git: gitState,
			concurrency: {
				key: config.concurrencyKey || workspaceId,
				activeTasks: new Set([taskId]),
				locked: true, // Isolated workspaces are always locked
			},
			createdAt: new Date().toISOString(),
			lastUsedAt: new Date().toISOString(),
			usageCount: 1,
		};

		// Register workspace
		this.workspaces.set(workspaceId, workspace);
		this.workspacesByTask.set(taskId, workspaceId);

		console.log(`Created isolated workspace ${workspaceId} for task ${taskId}`);
		return workspace;
	}

	/**
	 * Setup git for a workspace based on strategy
	 * Returns undefined if git setup is skipped or fails gracefully
	 */
	private async setupGit(
		workspacePath: string,
		config: WorkspaceConfig,
		gitBranch: string,
		taskMetadata: Record<string, any>,
		taskId: string
	): Promise<WorkspaceGitState | undefined> {
		const { gitStrategy } = config;

		// If no git strategy, skip git setup (for testing or non-git workspaces)
		if (!gitStrategy) {
			return undefined;
		}

		try {
			if (gitStrategy === 'worktree') {
				// Handle worktree strategy
				return await this.setupGitWorktree(workspacePath, gitBranch, taskMetadata, taskId);
			}

			// For other strategies, clone the repository
			return await this.setupGitClone(workspacePath, gitStrategy, gitBranch, taskMetadata, taskId);
		} catch (error) {
			console.warn(`Git setup failed, continuing without git:`, error);
			return undefined;
		}
	}

	/**
	 * Setup git using worktree
	 */
	private async setupGitWorktree(
		workspacePath: string,
		gitBranch: string,
		taskMetadata: Record<string, any>,
		taskId: string
	): Promise<WorkspaceGitState> {
		try {
			const git = this.getGit(this.projectRoot);

			// Generate branch name for feature branches
			const branchName = generateBranchName(taskId, taskMetadata.description);

			// Check if branch already exists
			const branches = await git.branch();
			const branchExists = branches.all.includes(branchName);

			if (!branchExists) {
				// Create new branch from current branch
				await git.checkoutBranch(branchName, 'HEAD');
			}

			// Add worktree
			await git.raw(['worktree', 'add', workspacePath, branchName]);

			console.log(`Created worktree at ${workspacePath} for branch ${branchName}`);

			// Get git state
			return (await this.getGitState(workspacePath))!;
		} catch (error) {
			throw new WorkspaceAllocationError(`Failed to create git worktree: ${error}`);
		}
	}

	/**
	 * Setup git using clone
	 */
	private async setupGitClone(
		workspacePath: string,
		gitStrategy: GitStrategy,
		gitBranch: string,
		taskMetadata: Record<string, any>,
		taskId: string
	): Promise<WorkspaceGitState> {
		try {
			const git = simpleGit();

			// Determine clone options based on strategy
			const cloneOptions: string[] = [];

			// Shallow clone for main-only (read-only scenarios)
			if (gitStrategy === 'main-only') {
				cloneOptions.push('--depth', '1');
			}

			// Clone the repository
			await git.clone(this.projectRoot, workspacePath, cloneOptions);

			const workspaceGit = this.getGit(workspacePath);

			// Handle different git strategies
			switch (gitStrategy) {
				case 'main-only':
					// Checkout main/master
					await workspaceGit.checkout(gitBranch);
					console.log(`Checked out ${gitBranch} in ${workspacePath}`);
					break;

				case 'feature-branch':
					// Create and checkout a new feature branch
					const branchName = generateBranchName(taskId, taskMetadata.description);
					await workspaceGit.checkoutBranch(branchName, gitBranch);
					console.log(`Created feature branch ${branchName} in ${workspacePath}`);
					break;

				case 'any':
					// Checkout the specified branch
					await workspaceGit.checkout(gitBranch);
					console.log(`Checked out ${gitBranch} in ${workspacePath}`);
					break;
			}

			// Get git state
			return (await this.getGitState(workspacePath))!;
		} catch (error) {
			throw new WorkspaceAllocationError(`Failed to setup git: ${error}`);
		}
	}

	/**
	 * Release a workspace (remove task from active users)
	 *
	 * @param workspaceId - Workspace identifier
	 * @param taskId - Task identifier releasing the workspace
	 */
	public async release(workspaceId: string, taskId: string): Promise<void> {
		const workspace = this.workspaces.get(workspaceId);
		if (!workspace) {
			console.warn(`Attempted to release non-existent workspace: ${workspaceId}`);
			return;
		}

		// Remove task from active tasks
		workspace.concurrency.activeTasks.delete(taskId);
		this.workspacesByTask.delete(taskId);

		console.log(
			`Released workspace ${workspaceId} from task ${taskId}. ` +
				`Active tasks: ${workspace.concurrency.activeTasks.size}`
		);

		// For isolated workspaces, cleanup when no active tasks
		if (workspace.mode === 'isolated' && workspace.concurrency.activeTasks.size === 0) {
			await this.cleanup(workspaceId);
		}

		// For shared workspaces, keep them around (they can be reused)
		// Manual workspaces are never auto-cleaned up
	}

	/**
	 * Cleanup a workspace (delete from disk and registry)
	 * For worktrees, also removes the worktree from git
	 *
	 * @param workspaceId - Workspace identifier
	 */
	public async cleanup(workspaceId: string): Promise<void> {
		const workspace = this.workspaces.get(workspaceId);
		if (!workspace) {
			return;
		}

		console.log(`Cleaning up workspace ${workspaceId} (mode: ${workspace.mode})`);

		// Don't cleanup manual workspaces (user manages them)
		if (workspace.mode === 'manual') {
			console.log(`Skipping cleanup of manual workspace ${workspaceId}`);
			// Remove from registry but keep the directory
			this.workspaces.delete(workspaceId);
			for (const [taskId, wId] of this.workspacesByTask.entries()) {
				if (wId === workspaceId) {
					this.workspacesByTask.delete(taskId);
				}
			}
			return;
		}

		// Check if this is a worktree
		const isWorktree = await this.isWorktree(workspace.path);

		if (isWorktree) {
			// Remove worktree using git
			try {
				const git = this.getGit(this.projectRoot);
				await git.raw(['worktree', 'remove', workspace.path, '--force']);
				console.log(`Removed worktree at ${workspace.path}`);
			} catch (error) {
				console.error(`Failed to remove worktree: ${error}`);
				// Fallback to manual removal with retry
				try {
					if (fs.existsSync(workspace.path)) {
						fs.rmSync(workspace.path, {
							recursive: true,
							force: true,
							maxRetries: 3,
							retryDelay: 100,
						});
					}
				} catch (cleanupError) {
					console.error(`Failed to manually remove worktree directory: ${cleanupError}`);
				}
			}
		} else {
			// Regular directory removal with retry for Windows file locking
			try {
				if (fs.existsSync(workspace.path)) {
					fs.rmSync(workspace.path, {
						recursive: true,
						force: true,
						maxRetries: 3,
						retryDelay: 100,
					});
				}
			} catch (error) {
				console.error(`Failed to remove workspace directory: ${error}`);
			}
		}

		// Remove from registry
		this.workspaces.delete(workspaceId);

		// Remove task associations
		for (const [taskId, wId] of this.workspacesByTask.entries()) {
			if (wId === workspaceId) {
				this.workspacesByTask.delete(taskId);
			}
		}
	}

	/**
	 * Check if a path is a git worktree
	 */
	private async isWorktree(workspacePath: string): Promise<boolean> {
		try {
			const git = this.getGit(this.projectRoot);
			const result = await git.raw(['worktree', 'list', '--porcelain']);
			return result.includes(workspacePath);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Get a workspace by ID
	 *
	 * @param workspaceId - Workspace identifier
	 * @returns Workspace or undefined if not found
	 */
	public getWorkspace(workspaceId: string): Workspace | undefined {
		return this.workspaces.get(workspaceId);
	}

	/**
	 * Get workspace for a task
	 *
	 * @param taskId - Task identifier
	 * @returns Workspace or undefined if task has no workspace
	 */
	public getWorkspaceForTask(taskId: string): Workspace | undefined {
		const workspaceId = this.workspacesByTask.get(taskId);
		if (!workspaceId) {
			return undefined;
		}
		return this.workspaces.get(workspaceId);
	}

	/**
	 * Get all active workspaces
	 *
	 * @returns Array of all workspaces
	 */
	public getAllWorkspaces(): Workspace[] {
		return Array.from(this.workspaces.values());
	}

	/**
	 * Get workspace statistics
	 *
	 * @returns Statistics object
	 */
	public getStats() {
		const workspaces = this.getAllWorkspaces();
		const isolated = workspaces.filter(w => w.mode === 'isolated').length;
		const shared = workspaces.filter(w => w.mode === 'shared').length;
		const totalActiveTasks = workspaces.reduce((sum, w) => sum + w.concurrency.activeTasks.size, 0);

		return {
			total: workspaces.length,
			isolated,
			shared,
			totalActiveTasks,
		};
	}

	/**
	 * Cleanup all workspaces (useful for shutdown)
	 */
	public async cleanupAll(): Promise<void> {
		console.log(`Cleaning up all ${this.workspaces.size} workspaces`);

		const workspaceIds = Array.from(this.workspaces.keys());
		for (const workspaceId of workspaceIds) {
			await this.cleanup(workspaceId);
			// Small delay to let Windows release file handles between cleanups
			await new Promise(resolve => setTimeout(resolve, 50));
		}
	}

	/**
	 * Update workspace last used time
	 *
	 * @param workspaceId - Workspace identifier
	 */
	public touch(workspaceId: string): void {
		const workspace = this.workspaces.get(workspaceId);
		if (workspace) {
			workspace.lastUsedAt = new Date().toISOString();
			workspace.usageCount++;
		}
	}

	/**
	 * Check if a workspace is active (has active tasks)
	 *
	 * @param workspaceId - Workspace identifier
	 * @returns True if workspace has active tasks
	 */
	public isActive(workspaceId: string): boolean {
		const workspace = this.workspaces.get(workspaceId);
		return workspace ? workspace.concurrency.activeTasks.size > 0 : false;
	}

	/**
	 * Get the base path for workspaces
	 */
	public getBasePath(): string {
		return this.basePath;
	}
}
