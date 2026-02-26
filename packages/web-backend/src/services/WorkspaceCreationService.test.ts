import { mkdir, rm } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateWorkspaceDto } from '@app/shared/api/workspaces.contract';

import { WorkspaceCreationService } from './WorkspaceCreationService';
import type { WorkspaceGitService } from './WorkspaceGitService';
import type { WorkspacePathValidator } from './WorkspacePathValidator';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('./WorkspaceGitService');
vi.mock('./WorkspacePathValidator');

describe('WorkspaceCreationService', () => {
	let service: WorkspaceCreationService;
	let mockPathValidator: WorkspacePathValidator;
	let mockGitService: WorkspaceGitService;

	beforeEach(() => {
		service = new WorkspaceCreationService();

		// Get references to mocked instances
		mockPathValidator = (service as any).pathValidator;
		mockGitService = (service as any).gitService;

		// Setup default successful mocks
		vi.mocked(mockPathValidator.validatePath).mockResolvedValue(undefined);
		vi.mocked(mockPathValidator.pathExists).mockResolvedValue(false);
		vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(true);
		vi.mocked(mockPathValidator.isDirectoryEmpty).mockResolvedValue(true);
		vi.mocked(mockGitService.getGitState).mockResolvedValue(undefined);
		vi.mocked(mkdir).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('createWorkspace - returns { path, gitBranch }', () => {
		it('should return path and no gitBranch for empty workspace', async () => {
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\test',
			};

			const result = await service.createWorkspace(data);

			expect(result).toEqual({
				path: 'C:\\workspaces\\test',
				gitBranch: undefined,
			});

			// Verify path validation and directory creation
			expect(mockPathValidator.validatePath).toHaveBeenCalledWith('C:\\workspaces\\test');
			expect(mkdir).toHaveBeenCalledWith('C:\\workspaces\\test', { recursive: true });
		});

		it('should return path and gitBranch for clone', async () => {
			vi.mocked(mockGitService.cloneRepository).mockResolvedValue({
				branch: 'main',
				isClean: true,
				lastCommit: 'abc123',
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			});

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\cloned',
				name: 'Cloned Workspace',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
					branch: 'main',
				},
			};

			const result = await service.createWorkspace(data);

			expect(result).toEqual({
				path: 'C:\\workspaces\\cloned',
				gitBranch: 'main',
			});

			expect(mockGitService.cloneRepository).toHaveBeenCalledWith(
				'https://github.com/user/repo.git',
				'C:\\workspaces\\cloned',
				'main',
				true
			);
		});
	});

	describe('createWorkspace - git worktree', () => {
		it('should create workspace with worktree strategy', async () => {
			vi.mocked(mockGitService.createWorktree).mockResolvedValue({
				branch: 'feature-branch',
				isClean: true,
				lastCommit: 'def456',
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			});

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\worktree',
				name: 'Worktree Workspace',
				gitOptions: {
					strategy: 'worktree',
					sourceWorkspaceId: 'source-workspace-123',
					branch: 'feature-branch',
				},
			};

			const result = await service.createWorkspace(data, {
				sourceWorkspacePath: 'C:\\workspaces\\source',
			});

			expect(result).toEqual({
				path: 'C:\\workspaces\\worktree',
				gitBranch: 'feature-branch',
			});

			expect(mockGitService.createWorktree).toHaveBeenCalledWith(
				'C:\\workspaces\\source',
				'C:\\workspaces\\worktree',
				'feature-branch'
			);
		});

		it('should default branch to feature-branch when not specified', async () => {
			vi.mocked(mockGitService.createWorktree).mockResolvedValue({
				branch: 'feature-branch',
				isClean: true,
				lastCommit: 'def456',
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			});

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\worktree2',
				gitOptions: {
					strategy: 'worktree',
					sourceWorkspaceId: 'source-workspace-123',
				},
			};

			await service.createWorkspace(data, {
				sourceWorkspacePath: 'C:\\workspaces\\source',
			});

			expect(mockGitService.createWorktree).toHaveBeenCalledWith(
				'C:\\workspaces\\source',
				'C:\\workspaces\\worktree2',
				'feature-branch'
			);
		});

		it('should throw error if source workspace ID is missing for worktree strategy', async () => {
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\worktree',
				gitOptions: {
					strategy: 'worktree',
					branch: 'feature-branch',
				},
			};

			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Source workspace ID is required for worktree strategy'
			);
		});

		it('should throw error if resolvedPaths.sourceWorkspacePath is not provided', async () => {
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\worktree',
				gitOptions: {
					strategy: 'worktree',
					sourceWorkspaceId: 'source-workspace-123',
					branch: 'feature-branch',
				},
			};

			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Source workspace path must be resolved before worktree creation'
			);
		});

		it('should cleanup on worktree creation failure', async () => {
			vi.mocked(mockGitService.createWorktree).mockRejectedValue(new Error('Worktree creation failed'));

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\worktree-fail',
				gitOptions: {
					strategy: 'worktree',
					sourceWorkspaceId: 'source-workspace-123',
					branch: 'feature-branch',
				},
			};

			await expect(
				service.createWorkspace(data, { sourceWorkspacePath: 'C:\\workspaces\\source' })
			).rejects.toThrow('Worktree creation failed');

			expect(rm).toHaveBeenCalledWith('C:\\workspaces\\worktree-fail', { recursive: true, force: true });
		});
	});

	describe('createWorkspace - existing directory', () => {
		it('should allow creating workspace in existing directory', async () => {
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(true);

			const data: CreateWorkspaceDto = {
				path: 'C:\\existing\\workspace',
			};

			const result = await service.createWorkspace(data);

			expect(mkdir).not.toHaveBeenCalled();
			expect(result.path).toBe('C:\\existing\\workspace');
		});

		it('should detect git branch in existing git repository', async () => {
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(true);
			vi.mocked(mockGitService.getGitState).mockResolvedValue({
				branch: 'main',
				isClean: true,
				lastCommit: 'abc123',
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			});

			const data: CreateWorkspaceDto = {
				path: 'C:\\existing\\git-repo',
			};

			const result = await service.createWorkspace(data);

			expect(mockGitService.getGitState).toHaveBeenCalledWith('C:\\existing\\git-repo');
			expect(result.gitBranch).toBe('main');
		});

		it('should reject if path exists but is not a directory', async () => {
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(false);

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\file.txt',
			};

			await expect(service.createWorkspace(data)).rejects.toThrow('Path exists but is not a directory');
		});

		it('should reject clone into non-empty directory', async () => {
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectoryEmpty).mockResolvedValue(false);

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\non-empty',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
				},
			};

			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Cannot clone repository into non-empty directory'
			);
		});
	});

	describe('createWorkspace - existing folder strategy', () => {
		it('should use existing folder with git and auto-detect branch', async () => {
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(true);
			vi.mocked(mockGitService.getGitState).mockResolvedValue({
				branch: 'develop',
				isClean: false,
				lastCommit: 'def456',
				ahead: 2,
				behind: 0,
				modified: 3,
				untracked: 1,
			});

			const data: CreateWorkspaceDto = {
				path: 'C:\\projects\\my-app',
				name: 'Existing Git Project',
				gitOptions: {
					strategy: 'existing',
				},
			};

			const result = await service.createWorkspace(data);

			expect(mkdir).not.toHaveBeenCalled();
			expect(mockGitService.cloneRepository).not.toHaveBeenCalled();
			expect(result.gitBranch).toBe('develop');
			expect(result.path).toBe('C:\\projects\\my-app');
		});

		it('should throw error if folder does not exist with existing strategy', async () => {
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(false);

			const data: CreateWorkspaceDto = {
				path: 'C:\\projects\\nonexistent',
				gitOptions: {
					strategy: 'existing',
				},
			};

			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Directory does not exist. The "existing" strategy requires a pre-existing folder.'
			);

			expect(mkdir).not.toHaveBeenCalled();
		});
	});

	describe('createWorkspace - error handling', () => {
		it('should reject if path validation fails', async () => {
			vi.mocked(mockPathValidator.validatePath).mockRejectedValue(new Error('Path must be absolute'));

			const data: CreateWorkspaceDto = {
				path: './relative/path',
			};

			await expect(service.createWorkspace(data)).rejects.toThrow('Path must be absolute');
			expect(mkdir).not.toHaveBeenCalled();
		});

		it('should cleanup on git clone failure', async () => {
			vi.mocked(mockGitService.cloneRepository).mockRejectedValue(new Error('Git clone failed'));

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\failed',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
				},
			};

			await expect(service.createWorkspace(data)).rejects.toThrow('Git clone failed');
			expect(rm).toHaveBeenCalledWith('C:\\workspaces\\failed', { recursive: true, force: true });
		});

		it('should log but not throw if cleanup fails', async () => {
			vi.mocked(mockGitService.cloneRepository).mockRejectedValue(new Error('Git clone failed'));
			vi.mocked(rm).mockRejectedValue(new Error('Cleanup failed'));

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\failed-cleanup',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
				},
			};

			await expect(service.createWorkspace(data)).rejects.toThrow('Git clone failed');
		});
	});

	describe('createWorkspace - validation', () => {
		it('should validate path before creating directory', async () => {
			const validatePathSpy = vi.mocked(mockPathValidator.validatePath);
			const mkdirSpy = vi.mocked(mkdir);

			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\validated',
			};

			await service.createWorkspace(data);

			expect(validatePathSpy).toHaveBeenCalled();
			expect(mkdirSpy).toHaveBeenCalled();

			const validateCallOrder = validatePathSpy.mock.invocationCallOrder[0];
			const mkdirCallOrder = mkdirSpy.mock.invocationCallOrder[0];
			expect(validateCallOrder).toBeLessThan(mkdirCallOrder);
		});
	});
});
