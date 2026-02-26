import { mkdir, rm } from 'fs/promises';
import { createLogger } from 'shared-common/logger';

import type { CreateWorkspaceDto } from '@app/shared/api/workspaces.contract';

import { WorkspaceGitService } from './WorkspaceGitService';
import { WorkspacePathValidator } from './WorkspacePathValidator';

const log = createLogger('WorkspaceCreationService');

/**
 * Result of workspace creation (filesystem + git only)
 * Metadata persistence is handled by WorkspacesService
 */
export interface WorkspaceCreationResult {
	path: string;
	gitBranch?: string;
}

/**
 * ===========================================================================================
 * WORKSPACE CREATION SERVICE
 * ===========================================================================================
 *
 * Orchestrates the workspace creation process (filesystem + git only):
 * 1. Validates workspace path (security checks)
 * 2. Creates directory structure
 * 3. Executes git operations (clone/worktree/none)
 * 4. Returns { path, gitBranch }
 *
 * Metadata persistence is NOT handled here — that responsibility
 * belongs to WorkspacesService which uses the centralized repository.
 *
 * ===========================================================================================
 */
export class WorkspaceCreationService {
	private readonly pathValidator: WorkspacePathValidator;
	private readonly gitService: WorkspaceGitService;

	constructor() {
		this.pathValidator = new WorkspacePathValidator();
		this.gitService = new WorkspaceGitService();
	}

	/**
	 * Create a new workspace directory with optional git initialization
	 *
	 * @returns { path, gitBranch } — filesystem result only
	 * @throws Error if creation fails (with user-friendly message)
	 */
	async createWorkspace(
		data: CreateWorkspaceDto,
		resolvedPaths?: { sourceWorkspacePath?: string }
	): Promise<WorkspaceCreationResult> {
		log.info('Creating workspace', { path: data.path, gitStrategy: data.gitOptions?.strategy });

		let workspaceCreated = false;

		try {
			// Step 1: Validate path
			await this.pathValidator.validatePath(data.path);

			// Step 2: Check if path exists
			const exists = await this.pathValidator.pathExists(data.path);

			if (exists) {
				// Path exists - check if it's a directory
				const isDir = await this.pathValidator.isDirectory(data.path);
				if (!isDir) {
					throw new Error('Path exists but is not a directory');
				}

				// For git clone, directory must be empty
				if (data.gitOptions?.strategy === 'clone') {
					const isEmpty = await this.pathValidator.isDirectoryEmpty(data.path);
					if (!isEmpty) {
						throw new Error('Cannot clone repository into non-empty directory');
					}
				}

				log.info('Using existing directory for workspace', { path: data.path });
			} else {
				// For 'existing' strategy, the folder MUST already exist
				if (data.gitOptions?.strategy === 'existing') {
					throw new Error(
						'Directory does not exist. The "existing" strategy requires a pre-existing folder.'
					);
				}

				// Step 3: Create directory if it doesn't exist
				await mkdir(data.path, { recursive: true });
				workspaceCreated = true;
			}

			// Step 4: Execute git operations based on strategy
			let gitBranch: string | undefined;

			if (data.gitOptions) {
				switch (data.gitOptions.strategy) {
					case 'clone': {
						if (!data.gitOptions.repositoryUrl) {
							throw new Error('Repository URL is required for clone strategy');
						}

						const gitState = await this.gitService.cloneRepository(
							data.gitOptions.repositoryUrl,
							data.path,
							data.gitOptions.branch,
							true
						);

						gitBranch = gitState.branch;
						break;
					}

					case 'worktree': {
						if (!data.gitOptions.sourceWorkspaceId) {
							throw new Error('Source workspace ID is required for worktree strategy');
						}
						if (!resolvedPaths?.sourceWorkspacePath) {
							throw new Error('Source workspace path must be resolved before worktree creation');
						}

						const branch = data.gitOptions.branch || 'feature-branch';
						const gitState = await this.gitService.createWorktree(
							resolvedPaths.sourceWorkspacePath,
							data.path,
							branch
						);
						gitBranch = gitState.branch;
						break;
					}

					case 'existing':
						break;

					case 'none':
						break;

					default:
						throw new Error(`Unknown git strategy: ${data.gitOptions.strategy satisfies never}`);
				}
			}

			// Step 4.5: If no git branch from git operations, check if directory is already a git repository
			if (!gitBranch && exists) {
				const existingGitState = await this.gitService.getGitState(data.path);
				if (existingGitState) {
					gitBranch = existingGitState.branch;
					log.info('Detected existing git repository', { path: data.path, branch: gitBranch });
				}
			}

			log.info('Successfully created workspace directory', { path: data.path, gitBranch });

			return { path: data.path, gitBranch };
		} catch (error) {
			log.error('Failed to create workspace', { path: data.path, error });

			// Cleanup: Remove directory if we created it
			if (workspaceCreated) {
				try {
					await rm(data.path, { recursive: true, force: true });
					log.info('Cleaned up partially created workspace', { path: data.path });
				} catch (cleanupError) {
					log.error('Failed to cleanup workspace directory', { path: data.path, error: cleanupError });
				}
			}

			throw this.normalizeError(error);
		}
	}

	/**
	 * Convert internal errors to user-friendly messages
	 */
	private normalizeError(error: unknown): Error {
		if (error instanceof Error) {
			return error;
		}
		return new Error('Failed to create workspace: Unknown error');
	}
}
