import type { LogResult, SimpleGit, StatusResult } from 'simple-git';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceGitService } from './WorkspaceGitService';

// Mock simple-git
vi.mock('simple-git', () => ({
	default: vi.fn(),
}));

describe('WorkspaceGitService', () => {
	let service: WorkspaceGitService;
	let mockGit: Partial<SimpleGit>;

	beforeEach(async () => {
		service = new WorkspaceGitService();

		// Create mock git instance
		mockGit = {
			clone: vi.fn(),
			raw: vi.fn(),
			checkIsRepo: vi.fn(),
			branch: vi.fn(),
			checkoutBranch: vi.fn(),
			status: vi.fn(),
			log: vi.fn(),
		};

		// Mock simpleGit to return our mock
		const simpleGit = await import('simple-git');
		vi.mocked(simpleGit.default).mockReturnValue(mockGit as SimpleGit);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('cloneRepository', () => {
		it('should clone repository with default options', async () => {
			// Setup mocks
			vi.mocked(mockGit.clone!).mockResolvedValue(undefined as any);
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
			vi.mocked(mockGit.status!).mockResolvedValue({
				current: 'main',
				isClean: () => true,
				ahead: 0,
				behind: 0,
				modified: [],
				deleted: [],
				renamed: [],
				not_added: [],
				conflicted: [],
				created: [],
				staged: [],
				files: [],
				tracking: null,
			} as unknown as StatusResult);
			vi.mocked(mockGit.log!).mockResolvedValue({
				latest: { hash: 'abc123' },
			} as LogResult);

			// Execute
			const result = await service.cloneRepository('https://github.com/user/repo.git', 'C:\\temp\\test-repo');

			// Verify
			expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/user/repo.git', 'C:\\temp\\test-repo', [
				'--depth',
				'1',
			]);

			expect(result).toEqual({
				branch: 'main',
				isClean: true,
				lastCommit: 'abc123',
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			});
		});

		it('should clone repository with specific branch', async () => {
			// Setup mocks
			vi.mocked(mockGit.clone!).mockResolvedValue(undefined as any);
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
			vi.mocked(mockGit.status!).mockResolvedValue({
				current: 'develop',
				isClean: () => true,
				ahead: 0,
				behind: 0,
				modified: [],
				deleted: [],
				renamed: [],
				not_added: [],
				conflicted: [],
				created: [],
				staged: [],
				files: [],
				tracking: null,
			} as unknown as StatusResult);
			vi.mocked(mockGit.log!).mockResolvedValue({
				latest: { hash: 'def456' },
			} as LogResult);

			// Execute
			const result = await service.cloneRepository(
				'https://github.com/user/repo.git',
				'C:\\temp\\test-repo',
				'develop',
				true
			);

			// Verify
			expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/user/repo.git', 'C:\\temp\\test-repo', [
				'--depth',
				'1',
				'--branch',
				'develop',
			]);

			expect(result.branch).toBe('develop');
		});

		it('should clone repository without shallow when specified', async () => {
			// Setup mocks
			vi.mocked(mockGit.clone!).mockResolvedValue(undefined as any);
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
			vi.mocked(mockGit.status!).mockResolvedValue({
				current: 'main',
				isClean: () => true,
				ahead: 0,
				behind: 0,
				modified: [],
				deleted: [],
				renamed: [],
				not_added: [],
				conflicted: [],
				created: [],
				staged: [],
				files: [],
				tracking: null,
			} as unknown as StatusResult);
			vi.mocked(mockGit.log!).mockResolvedValue({
				latest: { hash: 'abc123' },
			} as LogResult);

			// Execute
			await service.cloneRepository(
				'https://github.com/user/repo.git',
				'C:\\temp\\test-repo',
				undefined,
				false // Not shallow
			);

			// Verify
			expect(mockGit.clone).toHaveBeenCalledWith('https://github.com/user/repo.git', 'C:\\temp\\test-repo', []);
		});

		it('should reject invalid repository URL protocol', async () => {
			// Execute & Verify
			await expect(service.cloneRepository('ftp://invalid.com/repo.git', 'C:\\temp\\test-repo')).rejects.toThrow(
				'Invalid repository URL protocol'
			);
		});

		it('should reject malformed repository URL', async () => {
			// Execute & Verify
			await expect(service.cloneRepository('not-a-url', 'C:\\temp\\test-repo')).rejects.toThrow(
				'Invalid repository URL format'
			);
		});

		it('should handle git clone failure', async () => {
			// Setup mock to fail
			vi.mocked(mockGit.clone!).mockRejectedValue(new Error('Permission denied'));

			// Execute & Verify
			await expect(
				service.cloneRepository('https://github.com/user/repo.git', 'C:\\temp\\test-repo')
			).rejects.toThrow('Failed to clone repository: Permission denied');
		});
	});

	describe('createWorktree', () => {
		it('should create worktree for existing branch', async () => {
			// Setup mocks
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
			vi.mocked(mockGit.branch!).mockResolvedValue({
				all: ['main', 'develop', 'feature-branch'],
			} as any);
			vi.mocked(mockGit.raw!).mockResolvedValue('');
			vi.mocked(mockGit.status!).mockResolvedValue({
				current: 'feature-branch',
				isClean: () => true,
				ahead: 0,
				behind: 0,
				modified: [],
				deleted: [],
				renamed: [],
				not_added: [],
				conflicted: [],
				created: [],
				staged: [],
				files: [],
				tracking: null,
			} as unknown as StatusResult);
			vi.mocked(mockGit.log!).mockResolvedValue({
				latest: { hash: 'xyz789' },
			} as LogResult);

			// Execute
			const result = await service.createWorktree(
				'C:\\source\\workspace',
				'C:\\worktree\\workspace',
				'feature-branch'
			);

			// Verify
			expect(mockGit.checkIsRepo).toHaveBeenCalled();
			expect(mockGit.branch).toHaveBeenCalled();
			expect(mockGit.raw).toHaveBeenCalledWith(['worktree', 'add', 'C:\\worktree\\workspace', 'feature-branch']);

			expect(result).toEqual({
				branch: 'feature-branch',
				isClean: true,
				lastCommit: 'xyz789',
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			});
		});

		it('should create new branch via worktree add -b if branch does not exist', async () => {
			// Setup mocks
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
			vi.mocked(mockGit.branch!).mockResolvedValue({
				all: ['main', 'develop'],
			} as any);
			vi.mocked(mockGit.raw!).mockResolvedValue('');
			vi.mocked(mockGit.status!).mockResolvedValue({
				current: 'new-feature',
				isClean: () => true,
				ahead: 0,
				behind: 0,
				modified: [],
				deleted: [],
				renamed: [],
				not_added: [],
				conflicted: [],
				created: [],
				staged: [],
				files: [],
				tracking: null,
			} as unknown as StatusResult);
			vi.mocked(mockGit.log!).mockResolvedValue({
				latest: { hash: 'new123' },
			} as LogResult);

			// Execute
			await service.createWorktree('C:\\source\\workspace', 'C:\\worktree\\workspace', 'new-feature');

			// Verify: branch creation + worktree in one step (no checkoutBranch)
			expect(mockGit.checkoutBranch).not.toHaveBeenCalled();
			expect(mockGit.raw).toHaveBeenCalledWith([
				'worktree',
				'add',
				'-b',
				'new-feature',
				'C:\\worktree\\workspace',
			]);
		});

		it('should reject if source is not a git repository', async () => {
			// Setup mock to indicate not a repo
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(false);

			// Execute & Verify
			await expect(
				service.createWorktree('C:\\source\\workspace', 'C:\\worktree\\workspace', 'feature-branch')
			).rejects.toThrow('Source workspace is not a git repository');
		});

		it('should reject invalid branch names', async () => {
			// Execute & Verify
			await expect(
				service.createWorktree('C:\\source\\workspace', 'C:\\worktree\\workspace', 'branch with spaces')
			).rejects.toThrow('Invalid branch name');

			await expect(
				service.createWorktree('C:\\source\\workspace', 'C:\\worktree\\workspace', '.invalid')
			).rejects.toThrow('Invalid branch name');

			await expect(
				service.createWorktree('C:\\source\\workspace', 'C:\\worktree\\workspace', 'branch..name')
			).rejects.toThrow('Invalid branch name');

			await expect(
				service.createWorktree('C:\\source\\workspace', 'C:\\worktree\\workspace', 'branch@{name')
			).rejects.toThrow('Invalid branch name');
		});

		it('should accept valid branch names', async () => {
			// Setup mocks for successful worktree creation
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
			vi.mocked(mockGit.branch!).mockResolvedValue({ all: ['valid-branch'] } as any);
			vi.mocked(mockGit.raw!).mockResolvedValue('');
			vi.mocked(mockGit.status!).mockResolvedValue({
				current: 'valid-branch',
				isClean: () => true,
				ahead: 0,
				behind: 0,
				modified: [],
				deleted: [],
				renamed: [],
				not_added: [],
				conflicted: [],
				created: [],
				staged: [],
				files: [],
				tracking: null,
			} as unknown as StatusResult);
			vi.mocked(mockGit.log!).mockResolvedValue({ latest: { hash: 'abc' } } as LogResult);

			// Test valid branch names
			const validBranches = ['feature/test', 'bugfix_123', 'release-1.0', 'hotfix.patch'];

			for (const branch of validBranches) {
				vi.clearAllMocks();
				vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
				vi.mocked(mockGit.branch!).mockResolvedValue({ all: [branch] } as any);
				vi.mocked(mockGit.raw!).mockResolvedValue('');
				vi.mocked(mockGit.status!).mockResolvedValue({
					current: branch,
					isClean: () => true,
					ahead: 0,
					behind: 0,
					modified: [],
					deleted: [],
					renamed: [],
					not_added: [],
					conflicted: [],
					created: [],
					staged: [],
					files: [],
					tracking: null,
				} as unknown as StatusResult);
				vi.mocked(mockGit.log!).mockResolvedValue({ latest: { hash: 'abc' } } as LogResult);

				await expect(
					service.createWorktree('C:\\source\\workspace', 'C:\\worktree\\workspace', branch)
				).resolves.toBeDefined();
			}
		});
	});

	describe('getGitState', () => {
		it('should return git state for a repository', async () => {
			// Setup mocks
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(true);
			vi.mocked(mockGit.status!).mockResolvedValue({
				current: 'main',
				isClean: () => false,
				ahead: 2,
				behind: 1,
				modified: ['file1.ts', 'file2.ts'],
				deleted: ['file3.ts'],
				renamed: [],
				not_added: ['file4.ts'],
				conflicted: [],
				created: [],
				staged: [],
				files: [],
				tracking: null,
			} as unknown as StatusResult);
			vi.mocked(mockGit.log!).mockResolvedValue({
				latest: { hash: 'commit-hash' },
			} as LogResult);

			// Execute
			const result = await service.getGitState('C:\\workspace');

			// Verify
			expect(result).toEqual({
				branch: 'main',
				isClean: false,
				lastCommit: 'commit-hash',
				ahead: 2,
				behind: 1,
				modified: 3, // modified + deleted + renamed
				untracked: 1,
			});
		});

		it('should return undefined for non-git directory', async () => {
			// Setup mock to indicate not a repo
			vi.mocked(mockGit.checkIsRepo!).mockResolvedValue(false);

			// Execute
			const result = await service.getGitState('C:\\workspace');

			// Verify
			expect(result).toBeUndefined();
		});

		it('should handle errors gracefully', async () => {
			// Setup mock to throw error
			vi.mocked(mockGit.checkIsRepo!).mockRejectedValue(new Error('Permission denied'));

			// Execute
			const result = await service.getGitState('C:\\workspace');

			// Verify
			expect(result).toBeUndefined();
		});
	});
});
