import { mkdir, rm } from 'fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateWorkspaceDto } from '@app/shared/api/workspaces.contract';

import { WorkspaceCreationService } from './WorkspaceCreationService';
import type { WorkspaceGitService } from './WorkspaceGitService';
import type { WorkspaceMetadataFile } from './WorkspaceMetadataFile';
import type { WorkspacePathValidator } from './WorkspacePathValidator';

// Mock dependencies
vi.mock('fs/promises');
vi.mock('./WorkspaceGitService');
vi.mock('./WorkspaceMetadataFile');
vi.mock('./WorkspacePathValidator');

describe('WorkspaceCreationService', () => {
	let service: WorkspaceCreationService;
	let mockPathValidator: WorkspacePathValidator;
	let mockGitService: WorkspaceGitService;
	let mockMetadataFile: WorkspaceMetadataFile;

	beforeEach(() => {
		// Create service (will use mocked dependencies)
		service = new WorkspaceCreationService();

		// Get references to mocked instances
		mockPathValidator = (service as any).pathValidator;
		mockGitService = (service as any).gitService;
		mockMetadataFile = (service as any).metadataFile;

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

	describe('createWorkspace - empty workspace', () => {
		it('should create empty workspace with minimal data', async () => {
			// Setup mocks
			vi.mocked(mockMetadataFile.write).mockResolvedValue({
				id: 'workspace-123',
				createdAt: '2025-01-25T00:00:00Z',
				updatedAt: '2025-01-25T00:00:00Z',
				mode: 'development',
			});

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\test',
			};

			// Execute
			const result = await service.createWorkspace(data);

			// Verify path validation was called
			expect(mockPathValidator.validatePath).toHaveBeenCalledWith('C:\\workspaces\\test');

			// Verify directory was created
			expect(mkdir).toHaveBeenCalledWith('C:\\workspaces\\test', { recursive: true });

			// Verify metadata was written
			expect(mockMetadataFile.write).toHaveBeenCalledWith('C:\\workspaces\\test', {
				name: undefined,
				description: undefined,
				color: undefined,
				mode: 'development',
			});

			// Verify result
			expect(result).toMatchObject({
				id: 'workspace-123',
				path: 'C:\\workspaces\\test',
				mode: 'development',
			});
		});

		it('should create empty workspace with full metadata', async () => {
			// Setup mocks
			vi.mocked(mockMetadataFile.write).mockResolvedValue({
				id: 'workspace-456',
				name: 'My Workspace',
				description: 'Test description',
				color: '#FF5733',
				mode: 'production',
				createdAt: '2025-01-25T00:00:00Z',
				updatedAt: '2025-01-25T00:00:00Z',
			});

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\test',
				name: 'My Workspace',
				description: 'Test description',
				color: '#FF5733',
				mode: 'production',
			};

			// Execute
			const result = await service.createWorkspace(data);

			// Verify metadata was written with all fields
			expect(mockMetadataFile.write).toHaveBeenCalledWith('C:\\workspaces\\test', {
				name: 'My Workspace',
				description: 'Test description',
				color: '#FF5733',
				mode: 'production',
			});

			// Verify result
			expect(result).toMatchObject({
				id: 'workspace-456',
				name: 'My Workspace',
				description: 'Test description',
				color: '#FF5733',
				mode: 'production',
			});
		});
	});

	describe('createWorkspace - git clone', () => {
		it('should create workspace with git clone', async () => {
			// Setup mocks
			vi.mocked(mockGitService.cloneRepository).mockResolvedValue({
				branch: 'main',
				isClean: true,
				lastCommit: 'abc123',
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			});

			vi.mocked(mockMetadataFile.write).mockResolvedValue({
				id: 'workspace-789',
				name: 'Cloned Workspace',
				createdAt: '2025-01-25T00:00:00Z',
				updatedAt: '2025-01-25T00:00:00Z',
				mode: 'development',
			});

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\cloned',
				name: 'Cloned Workspace',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
					branch: 'main',
				},
			};

			// Execute
			const result = await service.createWorkspace(data);

			// Verify git clone was called
			expect(mockGitService.cloneRepository).toHaveBeenCalledWith(
				'https://github.com/user/repo.git',
				'C:\\workspaces\\cloned',
				'main',
				true
			);

			// Verify result includes git branch
			expect(result.gitBranch).toBe('main');
		});

		it('should throw error if repository URL is missing for clone strategy', async () => {
			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\cloned',
				gitOptions: {
					strategy: 'clone',
					// Missing repositoryUrl
				},
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Repository URL is required for clone strategy'
			);
		});
	});

	describe('createWorkspace - git worktree', () => {
		it('should throw error for worktree strategy (not yet implemented)', async () => {
			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\worktree',
				gitOptions: {
					strategy: 'worktree',
					sourceWorkspaceId: 'source-workspace-123',
					branch: 'feature-branch',
				},
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Worktree strategy requires source workspace path lookup (not yet implemented)'
			);
		});

		it('should throw error if source workspace ID is missing for worktree strategy', async () => {
			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\worktree',
				gitOptions: {
					strategy: 'worktree',
					// Missing sourceWorkspaceId
					branch: 'feature-branch',
				},
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Source workspace ID is required for worktree strategy'
			);
		});
	});

	describe('createWorkspace - existing directory', () => {
		it('should allow creating workspace in existing empty directory', async () => {
			// Setup mocks
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectoryEmpty).mockResolvedValue(true);
			vi.mocked(mockMetadataFile.write).mockResolvedValue({
				id: 'workspace-existing',
				createdAt: '2025-01-25T00:00:00Z',
				updatedAt: '2025-01-25T00:00:00Z',
				mode: 'development',
			});

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\existing\\workspace',
			};

			// Execute
			const result = await service.createWorkspace(data);

			// Verify directory was NOT created (it already exists)
			expect(mkdir).not.toHaveBeenCalled();

			// Verify metadata was written
			expect(mockMetadataFile.write).toHaveBeenCalled();

			// Verify result
			expect(result.path).toBe('C:\\existing\\workspace');
		});

		it('should detect git branch in existing git repository', async () => {
			// Setup mocks
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
			vi.mocked(mockMetadataFile.write).mockResolvedValue({
				id: 'workspace-git',
				createdAt: '2025-01-25T00:00:00Z',
				updatedAt: '2025-01-25T00:00:00Z',
				mode: 'development',
			});

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\existing\\git-repo',
			};

			// Execute
			const result = await service.createWorkspace(data);

			// Verify git state was checked
			expect(mockGitService.getGitState).toHaveBeenCalledWith('C:\\existing\\git-repo');

			// Verify git branch was detected
			expect(result.gitBranch).toBe('main');
		});

		it('should reject if path exists but is not a directory', async () => {
			// Setup mocks
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(false);

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\file.txt',
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow('Path exists but is not a directory');
		});

		it('should reject clone into non-empty directory', async () => {
			// Setup mocks
			vi.mocked(mockPathValidator.pathExists).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectory).mockResolvedValue(true);
			vi.mocked(mockPathValidator.isDirectoryEmpty).mockResolvedValue(false);

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\non-empty',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
				},
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow(
				'Cannot clone repository into non-empty directory'
			);
		});
	});

	describe('createWorkspace - error handling', () => {
		it('should reject if path validation fails', async () => {
			// Setup mock to fail validation
			vi.mocked(mockPathValidator.validatePath).mockRejectedValue(new Error('Path must be absolute'));

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: './relative/path',
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow('Path must be absolute');

			// Verify directory was NOT created
			expect(mkdir).not.toHaveBeenCalled();
		});

		it('should cleanup on git clone failure', async () => {
			// Setup mocks
			vi.mocked(mockGitService.cloneRepository).mockRejectedValue(new Error('Git clone failed'));

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\failed',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
				},
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow('Git clone failed');

			// Verify cleanup was attempted
			expect(rm).toHaveBeenCalledWith('C:\\workspaces\\failed', { recursive: true, force: true });
		});

		it('should cleanup on metadata write failure', async () => {
			// Setup mocks
			vi.mocked(mockMetadataFile.write).mockRejectedValue(new Error('Metadata write failed'));

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\failed-metadata',
			};

			// Execute & Verify
			await expect(service.createWorkspace(data)).rejects.toThrow('Metadata write failed');

			// Verify cleanup was attempted
			expect(rm).toHaveBeenCalledWith('C:\\workspaces\\failed-metadata', { recursive: true, force: true });
		});

		it('should log but not throw if cleanup fails', async () => {
			// Setup mocks
			vi.mocked(mockGitService.cloneRepository).mockRejectedValue(new Error('Git clone failed'));
			vi.mocked(rm).mockRejectedValue(new Error('Cleanup failed'));

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\failed-cleanup',
				gitOptions: {
					strategy: 'clone',
					repositoryUrl: 'https://github.com/user/repo.git',
				},
			};

			// Execute & Verify - should still throw original error
			await expect(service.createWorkspace(data)).rejects.toThrow('Git clone failed');
		});
	});

	describe('createWorkspace - validation', () => {
		it('should validate path before creating directory', async () => {
			// Setup mocks
			const validatePathSpy = vi.mocked(mockPathValidator.validatePath);
			const mkdirSpy = vi.mocked(mkdir);

			vi.mocked(mockMetadataFile.write).mockResolvedValue({
				id: 'workspace-123',
				createdAt: '2025-01-25T00:00:00Z',
				updatedAt: '2025-01-25T00:00:00Z',
				mode: 'development',
			});

			// Prepare test data
			const data: CreateWorkspaceDto = {
				path: 'C:\\workspaces\\validated',
			};

			// Execute
			await service.createWorkspace(data);

			// Verify both were called
			expect(validatePathSpy).toHaveBeenCalled();
			expect(mkdirSpy).toHaveBeenCalled();

			// Verify validatePath was called first (by checking call order via mock.invocationCallOrder)
			const validateCallOrder = validatePathSpy.mock.invocationCallOrder[0];
			const mkdirCallOrder = mkdirSpy.mock.invocationCallOrder[0];
			expect(validateCallOrder).toBeLessThan(mkdirCallOrder);
		});
	});
});
