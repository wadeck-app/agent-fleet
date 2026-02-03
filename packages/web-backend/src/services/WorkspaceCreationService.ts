import { mkdir, rm } from 'fs/promises';
import { createLogger } from 'shared-common/logger';

import type { CreateWorkspaceDto, Workspace } from '@app/shared/api/workspaces.contract';

import { WorkspaceGitService } from './WorkspaceGitService';
import { WorkspaceMapper } from './WorkspaceMapper';
import { WorkspaceMetadataFile } from './WorkspaceMetadataFile';
import { WorkspacePathValidator } from './WorkspacePathValidator';

const log = createLogger('WorkspaceCreationService');

/**
 * ===========================================================================================
 * WORKSPACE CREATION SERVICE
 * ===========================================================================================
 *
 * Orchestrates the workspace creation process:
 * 1. Validates workspace path (security checks)
 * 2. Creates directory structure
 * 3. Executes git operations (clone/worktree/none)
 * 4. Initializes workspace metadata
 * 5. Returns workspace DTO
 *
 * Responsibilities:
 * - Coordinate between path validation, git operations, and metadata management
 * - Handle cleanup on failure (remove partially created directories)
 * - Provide clear error messages for user-facing errors
 *
 * ===========================================================================================
 */
export class WorkspaceCreationService {
	private readonly pathValidator: WorkspacePathValidator;
	private readonly gitService: WorkspaceGitService;
	private readonly metadataFile: WorkspaceMetadataFile;

	constructor() {
		this.pathValidator = new WorkspacePathValidator();
		this.gitService = new WorkspaceGitService();
		this.metadataFile = new WorkspaceMetadataFile();
	}

	/**
	 * Create a new workspace with optional git initialization
	 *
	 * @param data - Workspace creation data
	 * @returns Created workspace
	 * @throws Error if creation fails (with user-friendly message)
	 */
	async createWorkspace(data: CreateWorkspaceDto): Promise<Workspace> {
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

				// Directory exists and is valid - we'll just add metadata to it
				log.info('Using existing directory for workspace', { path: data.path });
			} else {
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
							true // shallow clone by default
						);

						gitBranch = gitState.branch;
						break;
					}

					case 'worktree': {
						if (!data.gitOptions.sourceWorkspaceId) {
							throw new Error('Source workspace ID is required for worktree strategy');
						}

						// TODO: Look up source workspace path from ID
						// For now, we'll throw an error indicating this needs to be implemented
						throw new Error(
							'Worktree strategy requires source workspace path lookup (not yet implemented)'
						);

						// Future implementation:
						// const sourceWorkspacePath = await this.lookupWorkspacePath(data.gitOptions.sourceWorkspaceId);
						// const gitState = await this.gitService.createWorktree(
						//   sourceWorkspacePath,
						//   data.path,
						//   data.gitOptions.branch || 'feature-branch'
						// );
						// gitBranch = gitState.branch;
						// break;
					}

					case 'none':
					default:
						// No git initialization needed
						break;
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

			// Step 5: Initialize workspace metadata
			const metadata = await this.metadataFile.write(data.path, {
				name: data.name,
				description: data.description,
				color: data.color,
				mode: data.mode || 'development',
			});

			// Step 6: Map to workspace DTO
			const workspace = WorkspaceMapper.mapPathToWorkspace(data.path, metadata, gitBranch);

			log.info('Successfully created workspace', { id: workspace.id, path: data.path });

			return workspace;
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

			// Re-throw with user-friendly message
			throw this.normalizeError(error);
		}
	}

	/**
	 * Convert internal errors to user-friendly messages
	 */
	private normalizeError(error: unknown): Error {
		if (error instanceof Error) {
			// Already a proper error with message
			return error;
		}

		// Unknown error type
		return new Error('Failed to create workspace: Unknown error');
	}
}
