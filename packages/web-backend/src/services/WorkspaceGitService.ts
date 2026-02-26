import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createLogger } from 'shared-common/logger';
import simpleGit from 'simple-git';

const log = createLogger('WorkspaceGitService');

/**
 * Git state information for a workspace
 */
export interface WorkspaceGitState {
	branch: string;
	isClean: boolean;
	lastCommit: string;
	ahead: number;
	behind: number;
	modified: number;
	untracked: number;
}

/**
 * Service responsible for git operations related to workspace creation
 */
export class WorkspaceGitService {
	/**
	 * Clone a git repository to the target path
	 *
	 * @param repoUrl - Repository URL (https://, git://, or file://)
	 * @param targetPath - Absolute path where repository will be cloned
	 * @param branch - Optional branch to checkout after clone
	 * @param shallow - Whether to perform shallow clone (--depth 1)
	 * @returns Git state of the cloned repository
	 */
	async cloneRepository(
		repoUrl: string,
		targetPath: string,
		branch?: string,
		shallow: boolean = true
	): Promise<WorkspaceGitState> {
		log.info('Cloning repository', { repoUrl, targetPath, branch, shallow });

		try {
			// Validate repository URL
			this.validateRepositoryUrl(repoUrl);

			// Ensure parent directory exists
			await mkdir(dirname(targetPath), { recursive: true });

			const git = simpleGit();

			// Build clone options
			const cloneOptions: string[] = [];
			if (shallow) {
				cloneOptions.push('--depth', '1');
			}
			if (branch) {
				cloneOptions.push('--branch', branch);
			}

			// Clone repository
			await git.clone(repoUrl, targetPath, cloneOptions);

			log.info('Successfully cloned repository', { targetPath });

			// Get git state
			const gitState = await this.getGitState(targetPath);
			if (!gitState) {
				throw new Error('Failed to read git state after clone');
			}

			return gitState;
		} catch (error) {
			log.error('Failed to clone repository', { repoUrl, targetPath, error });
			throw new Error(`Failed to clone repository: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Create a git worktree from an existing workspace
	 *
	 * @param sourceWorkspacePath - Path to existing workspace (must be a git repository)
	 * @param targetPath - Path where worktree will be created
	 * @param branch - Branch name to checkout/create in worktree
	 * @returns Git state of the created worktree
	 */
	async createWorktree(sourceWorkspacePath: string, targetPath: string, branch: string): Promise<WorkspaceGitState> {
		log.info('Creating git worktree', { sourceWorkspacePath, targetPath, branch });

		try {
			// Validate branch name
			this.validateBranchName(branch);

			// Get git instance for source workspace
			const git = simpleGit(sourceWorkspacePath);

			// Check if source is a git repository
			const isRepo = await git.checkIsRepo();
			if (!isRepo) {
				throw new Error('Source workspace is not a git repository');
			}

			// Check if branch already exists
			const branches = await git.branch();
			const branchExists = branches.all.includes(branch);

			// Ensure parent directory exists
			await mkdir(dirname(targetPath), { recursive: true });

			if (branchExists) {
				// Branch exists — use it directly
				await git.raw(['worktree', 'add', targetPath, branch]);
			} else {
				// Create new branch and worktree in one step (avoids checking out in source repo)
				await git.raw(['worktree', 'add', '-b', branch, targetPath]);
				log.info('Created new branch via worktree', { branch });
			}

			log.info('Successfully created worktree', { targetPath, branch });

			// Get git state
			const gitState = await this.getGitState(targetPath);
			if (!gitState) {
				throw new Error('Failed to read git state after worktree creation');
			}

			return gitState;
		} catch (error) {
			log.error('Failed to create worktree', { sourceWorkspacePath, targetPath, branch, error });
			throw new Error(`Failed to create git worktree: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * Get current git state for a workspace
	 *
	 * @param workspacePath - Path to workspace (must be a git repository)
	 * @returns Git state information or undefined if not a git repository
	 */
	async getGitState(workspacePath: string): Promise<WorkspaceGitState | undefined> {
		try {
			const git = simpleGit(workspacePath);

			// Check if it's a git repository
			const isRepo = await git.checkIsRepo();
			if (!isRepo) {
				return undefined;
			}

			// Get status and log
			const status = await git.status();
			const logResult = await git.log({ maxCount: 1 });

			return {
				branch: status.current || 'unknown',
				isClean: status.isClean(),
				lastCommit: logResult.latest?.hash || 'unknown',
				ahead: status.ahead,
				behind: status.behind,
				modified: status.modified.length + status.deleted.length + status.renamed.length,
				untracked: status.not_added.length,
			};
		} catch (error) {
			log.warn('Failed to get git state', { workspacePath, error });
			return undefined;
		}
	}

	/**
	 * Validate repository URL format
	 * Allows: https://, git://, file://
	 */
	private validateRepositoryUrl(url: string): void {
		const validProtocols = ['https:', 'git:', 'file:'];
		let parsedUrl: URL;

		try {
			parsedUrl = new URL(url);
		} catch {
			throw new Error('Invalid repository URL format');
		}

		if (!validProtocols.includes(parsedUrl.protocol)) {
			throw new Error(
				`Invalid repository URL protocol: ${parsedUrl.protocol}. Allowed: ${validProtocols.join(', ')}`
			);
		}
	}

	/**
	 * Validate branch name
	 * Allows: alphanumeric characters, hyphens, underscores, slashes, and periods
	 */
	private validateBranchName(branch: string): void {
		if (!branch || branch.trim().length === 0) {
			throw new Error('Branch name cannot be empty');
		}

		// Git branch name rules (simplified):
		// - No spaces
		// - No control characters
		// - Cannot start with . or end with .lock
		// - Cannot contain .. or @{
		const invalidPatterns = [/\s/, /\.\./, /@\{/, /^\./, /\.lock$/];

		for (const pattern of invalidPatterns) {
			if (pattern.test(branch)) {
				throw new Error(`Invalid branch name: ${branch}`);
			}
		}

		// Only allow safe characters
		const safePattern = /^[a-zA-Z0-9/_.-]+$/;
		if (!safePattern.test(branch)) {
			throw new Error(`Branch name contains invalid characters: ${branch}`);
		}
	}
}
