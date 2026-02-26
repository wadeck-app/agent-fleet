import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BadRequestException } from '@app/shared/exceptions/http-exceptions';

import { WorkspaceFileService } from './WorkspaceFileService';
import type { WorkspacesService } from './WorkspacesService';

/**
 * ===========================================================================================
 * WORKSPACE FILE SERVICE TESTS
 * ===========================================================================================
 *
 * Tests for workspace file operations with focus on security and business logic.
 *
 * Test Coverage:
 * - listDirectory: sorting, filtering, metadata
 * - readFile: reading, size limits, non-file rejection
 * - writeFile: writing, metadata updates
 * - Security: path traversal, null bytes, symlink validation
 *
 * Note: Uses real temp directories for filesystem operations to ensure realistic behavior.
 *
 * ===========================================================================================
 */

describe('WorkspaceFileService', () => {
	let service: WorkspaceFileService;
	let mockWorkspacesService: WorkspacesService;
	let testWorkspacePath: string;
	let tempDirs: string[] = [];

	beforeEach(async () => {
		// Create a real temporary directory for testing
		testWorkspacePath = await mkdtemp(path.join(tmpdir(), 'workspace-test-'));
		tempDirs.push(testWorkspacePath);

		// Mock WorkspacesService
		mockWorkspacesService = {
			resolveWorkspacePath: vi.fn().mockResolvedValue(testWorkspacePath),
		} as any;

		// Create service instance
		service = new WorkspaceFileService(mockWorkspacesService);
	});

	afterEach(async () => {
		// Clean up all temp directories
		for (const dir of tempDirs) {
			try {
				await rm(dir, { recursive: true, force: true });
			} catch (error) {
				// Ignore cleanup errors
			}
		}
		tempDirs = [];
		vi.clearAllMocks();
	});

	describe('listDirectory', () => {
		it('should list directory contents with correct metadata', async () => {
			// Setup: Create test files and directories
			await mkdir(path.join(testWorkspacePath, 'src'));
			await writeFile(path.join(testWorkspacePath, 'README.md'), 'Test content');
			await writeFile(path.join(testWorkspacePath, 'package.json'), '{}');

			// Execute
			const result = await service.listDirectory(testWorkspacePath, '.');

			// Verify
			expect(result.path).toBe('.');
			expect(result.entries).toHaveLength(3);

			// Check structure
			const readmeEntry = result.entries.find(e => e.name === 'README.md');
			expect(readmeEntry).toBeDefined();
			expect(readmeEntry?.type).toBe('file');
			expect(readmeEntry?.size).toBeDefined();
			expect(readmeEntry?.lastModified).toBeDefined();
			expect(readmeEntry?.path).toBe('README.md');

			const srcEntry = result.entries.find(e => e.name === 'src');
			expect(srcEntry).toBeDefined();
			expect(srcEntry?.type).toBe('directory');
			expect(srcEntry?.size).toBeUndefined();
			expect(srcEntry?.path).toBe('src');
		});

		it('should sort directories first, then alphabetically', async () => {
			// Setup: Create mixed files and directories
			await writeFile(path.join(testWorkspacePath, 'zebra.txt'), 'content');
			await writeFile(path.join(testWorkspacePath, 'apple.txt'), 'content');
			await mkdir(path.join(testWorkspacePath, 'zoo-dir'));
			await mkdir(path.join(testWorkspacePath, 'alpha-dir'));

			// Execute
			const result = await service.listDirectory(testWorkspacePath, '.');

			// Verify: Directories first, then files, all alphabetical
			expect(result.entries).toHaveLength(4);
			expect(result.entries[0].name).toBe('alpha-dir');
			expect(result.entries[0].type).toBe('directory');
			expect(result.entries[1].name).toBe('zoo-dir');
			expect(result.entries[1].type).toBe('directory');
			expect(result.entries[2].name).toBe('apple.txt');
			expect(result.entries[2].type).toBe('file');
			expect(result.entries[3].name).toBe('zebra.txt');
			expect(result.entries[3].type).toBe('file');
		});

		it('should exclude .git directory', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, '.git'));
			await mkdir(path.join(testWorkspacePath, 'src'));

			// Execute
			const result = await service.listDirectory(testWorkspacePath, '.');

			// Verify: .git should not be in the list
			expect(result.entries).toHaveLength(1);
			expect(result.entries[0].name).toBe('src');
		});

		it('should exclude node_modules directory', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'node_modules'));
			await mkdir(path.join(testWorkspacePath, 'src'));

			// Execute
			const result = await service.listDirectory(testWorkspacePath, '.');

			// Verify: node_modules should not be in the list
			expect(result.entries).toHaveLength(1);
			expect(result.entries[0].name).toBe('src');
		});

		it('should list subdirectory contents', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'src'));
			await writeFile(path.join(testWorkspacePath, 'src', 'index.ts'), 'export {}');

			// Execute
			const result = await service.listDirectory(testWorkspacePath, 'src');

			// Verify
			expect(result.path).toBe('src');
			expect(result.entries).toHaveLength(1);
			expect(result.entries[0].name).toBe('index.ts');
			expect(result.entries[0].path).toBe('src/index.ts');
		});

		it('should normalize path separators to forward slashes', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'src'));
			await mkdir(path.join(testWorkspacePath, 'src', 'utils'));
			await writeFile(path.join(testWorkspacePath, 'src', 'utils', 'helper.ts'), 'export {}');

			// Execute with platform-specific separator
			const result = await service.listDirectory(testWorkspacePath, path.join('src', 'utils'));

			// Verify: paths use forward slashes regardless of platform
			expect(result.path).toBe('src/utils');
			expect(result.entries[0].path).toBe('src/utils/helper.ts');
		});

		it('should throw error for non-existent directory', async () => {
			// Execute & Verify
			await expect(service.listDirectory(testWorkspacePath, 'nonexistent')).rejects.toThrow(BadRequestException);
		});

		it('should throw error for path traversal attempt', async () => {
			// Execute & Verify
			await expect(service.listDirectory(testWorkspacePath, '../outside')).rejects.toThrow(BadRequestException);
			await expect(service.listDirectory(testWorkspacePath, 'src/../../outside')).rejects.toThrow(
				BadRequestException
			);
		});
	});

	describe('readFile', () => {
		it('should read file successfully', async () => {
			// Setup
			const content = 'Test file content\nLine 2';
			await writeFile(path.join(testWorkspacePath, 'test.txt'), content);

			// Execute
			const result = await service.readFile(testWorkspacePath, 'test.txt');

			// Verify
			expect(result.path).toBe('test.txt');
			expect(result.content).toBe(content);
			expect(result.size).toBe(Buffer.byteLength(content, 'utf-8'));
			expect(result.lastModified).toBeDefined();
			expect(new Date(result.lastModified)).toBeInstanceOf(Date);
		});

		it('should read file from subdirectory', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'docs'));
			const content = 'Documentation content';
			await writeFile(path.join(testWorkspacePath, 'docs', 'README.md'), content);

			// Execute
			const result = await service.readFile(testWorkspacePath, 'docs/README.md');

			// Verify
			expect(result.path).toBe('docs/README.md');
			expect(result.content).toBe(content);
		});

		it('should reject file larger than 1MB', async () => {
			// Setup: Create a file larger than MAX_FILE_SIZE (1MB)
			const largeContent = 'x'.repeat(1024 * 1024 + 1);
			await writeFile(path.join(testWorkspacePath, 'large.txt'), largeContent);

			// Execute & Verify
			await expect(service.readFile(testWorkspacePath, 'large.txt')).rejects.toThrow(BadRequestException);
			await expect(service.readFile(testWorkspacePath, 'large.txt')).rejects.toThrow(
				'File size exceeds maximum allowed size'
			);
		});

		it('should reject reading a directory', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'src'));

			// Execute & Verify
			await expect(service.readFile(testWorkspacePath, 'src')).rejects.toThrow(BadRequestException);
			await expect(service.readFile(testWorkspacePath, 'src')).rejects.toThrow('Path is not a file');
		});

		it('should reject reading non-existent file', async () => {
			// Execute & Verify
			await expect(service.readFile(testWorkspacePath, 'nonexistent.txt')).rejects.toThrow(BadRequestException);
		});

		it('should throw error for path traversal attempt', async () => {
			// Execute & Verify
			await expect(service.readFile(testWorkspacePath, '../outside.txt')).rejects.toThrow(BadRequestException);
		});

		it('should normalize path separators in response', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'src'));
			await writeFile(path.join(testWorkspacePath, 'src', 'index.ts'), 'export {}');

			// Execute
			const result = await service.readFile(testWorkspacePath, path.join('src', 'index.ts'));

			// Verify: forward slashes in path
			expect(result.path).toBe('src/index.ts');
		});
	});

	describe('writeFile', () => {
		it('should write file successfully', async () => {
			// Setup
			const content = 'New file content';

			// Execute
			const result = await service.writeFile(testWorkspacePath, 'new.txt', content);

			// Verify
			expect(result.path).toBe('new.txt');
			expect(result.content).toBe(content);
			expect(result.size).toBe(Buffer.byteLength(content, 'utf-8'));
			expect(result.lastModified).toBeDefined();

			// Verify file was actually written
			const writtenContent = await readFile(path.join(testWorkspacePath, 'new.txt'), 'utf-8');
			expect(writtenContent).toBe(content);
		});

		it('should overwrite existing file', async () => {
			// Setup
			const originalContent = 'Original content';
			const newContent = 'Updated content';
			await writeFile(path.join(testWorkspacePath, 'existing.txt'), originalContent);

			// Execute
			const result = await service.writeFile(testWorkspacePath, 'existing.txt', newContent);

			// Verify
			expect(result.content).toBe(newContent);
			expect(result.size).toBe(Buffer.byteLength(newContent, 'utf-8'));

			const writtenContent = await readFile(path.join(testWorkspacePath, 'existing.txt'), 'utf-8');
			expect(writtenContent).toBe(newContent);
		});

		it('should create file in subdirectory', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'src'));
			const content = 'Subdirectory file';

			// Execute
			const result = await service.writeFile(testWorkspacePath, 'src/test.ts', content);

			// Verify
			expect(result.path).toBe('src/test.ts');
			expect(result.content).toBe(content);

			const writtenContent = await readFile(path.join(testWorkspacePath, 'src', 'test.ts'), 'utf-8');
			expect(writtenContent).toBe(content);
		});

		it('should return updated metadata after write', async () => {
			// Setup
			const content = 'Content for metadata check';

			// Execute
			const result = await service.writeFile(testWorkspacePath, 'meta.txt', content);

			// Verify metadata is fresh
			expect(result.size).toBe(Buffer.byteLength(content, 'utf-8'));
			const lastModified = new Date(result.lastModified);
			expect(lastModified.getTime()).toBeGreaterThan(Date.now() - 5000); // Within last 5 seconds
		});

		it('should throw error for path traversal attempt', async () => {
			// Execute & Verify
			await expect(service.writeFile(testWorkspacePath, '../outside.txt', 'content')).rejects.toThrow(
				BadRequestException
			);
		});

		it('should normalize path separators in response', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'src'));

			// Execute
			const result = await service.writeFile(testWorkspacePath, path.join('src', 'new.ts'), 'export {}');

			// Verify: forward slashes in path
			expect(result.path).toBe('src/new.ts');
		});
	});

	describe('Security - resolveAndValidatePath', () => {
		it('should reject path with null byte', async () => {
			// Execute & Verify
			await expect(service.listDirectory(testWorkspacePath, 'file\0name.txt')).rejects.toThrow(
				BadRequestException
			);
			await expect(service.listDirectory(testWorkspacePath, 'file\0name.txt')).rejects.toThrow(
				'Path contains invalid characters (null byte)'
			);
		});

		it('should reject path with explicit .. traversal', async () => {
			// Execute & Verify
			await expect(service.listDirectory(testWorkspacePath, '..')).rejects.toThrow(BadRequestException);
			await expect(service.listDirectory(testWorkspacePath, '..')).rejects.toThrow(
				'Path traversal is not allowed (.. detected)'
			);

			await expect(service.listDirectory(testWorkspacePath, '../sibling')).rejects.toThrow(BadRequestException);
			await expect(service.listDirectory(testWorkspacePath, 'src/../..')).rejects.toThrow(BadRequestException);
		});

		it('should reject path outside workspace', async () => {
			// Create a separate temp directory outside the workspace
			const outsideDir = await mkdtemp(path.join(tmpdir(), 'outside-test-'));
			tempDirs.push(outsideDir);

			// Try to access the outside directory
			// Note: This is a containment check, not just a .. check
			// We can't easily test this with real paths, so we test the validation logic
			// by using a path that resolves outside the workspace
			const relativePath = path.relative(testWorkspacePath, outsideDir);

			// Execute & Verify
			await expect(service.listDirectory(testWorkspacePath, relativePath)).rejects.toThrow(BadRequestException);
		});

		it('should accept normal paths', async () => {
			// Setup
			await mkdir(path.join(testWorkspacePath, 'src'));
			await writeFile(path.join(testWorkspacePath, 'src', 'index.ts'), 'export {}');

			// Execute: These should all succeed
			await expect(service.listDirectory(testWorkspacePath, '.')).resolves.toBeDefined();
			await expect(service.listDirectory(testWorkspacePath, 'src')).resolves.toBeDefined();
			await expect(service.readFile(testWorkspacePath, 'src/index.ts')).resolves.toBeDefined();
		});

		it('should accept paths with dots in filenames', async () => {
			// Setup
			await writeFile(path.join(testWorkspacePath, 'file.test.ts'), 'export {}');
			await mkdir(path.join(testWorkspacePath, '.config'));

			// Execute: These should succeed
			await expect(service.readFile(testWorkspacePath, 'file.test.ts')).resolves.toBeDefined();
			await expect(service.listDirectory(testWorkspacePath, '.config')).resolves.toBeDefined();
		});

		it('should accept root directory path', async () => {
			// Execute
			await expect(service.listDirectory(testWorkspacePath, '.')).resolves.toBeDefined();
		});
	});

	describe('Security - validateSymlink', () => {
		it('should reject symlink pointing outside workspace', async () => {
			// Create a separate temp directory outside the workspace
			const outsideDir = await mkdtemp(path.join(tmpdir(), 'outside-test-'));
			tempDirs.push(outsideDir);
			await writeFile(path.join(outsideDir, 'secret.txt'), 'secret content');

			// Create a symlink inside the workspace pointing to outside file
			const symlinkPath = path.join(testWorkspacePath, 'link-to-outside');
			try {
				await symlink(path.join(outsideDir, 'secret.txt'), symlinkPath);
			} catch (error) {
				// On Windows, symlink creation might fail without admin privileges
				// Skip this test if we can't create symlinks
				if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') {
					console.log('Skipping symlink test - requires elevated privileges on Windows');
					return;
				}
				throw error;
			}

			// Execute & Verify
			await expect(service.readFile(testWorkspacePath, 'link-to-outside')).rejects.toThrow(BadRequestException);
			await expect(service.readFile(testWorkspacePath, 'link-to-outside')).rejects.toThrow(
				'Symlink target is outside workspace boundaries'
			);
		});

		it('should accept symlink pointing inside workspace', async () => {
			// Setup: Create a file and a symlink to it within the workspace
			await writeFile(path.join(testWorkspacePath, 'original.txt'), 'original content');
			const symlinkPath = path.join(testWorkspacePath, 'link-to-original');

			try {
				await symlink(path.join(testWorkspacePath, 'original.txt'), symlinkPath);
			} catch (error) {
				// On Windows, symlink creation might fail without admin privileges
				if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') {
					console.log('Skipping symlink test - requires elevated privileges on Windows');
					return;
				}
				throw error;
			}

			// Execute: Should succeed
			const result = await service.readFile(testWorkspacePath, 'link-to-original');

			// Verify
			expect(result.content).toBe('original content');
		});

		it('should allow operation on non-existent path for writeFile', async () => {
			// Execute: Writing to non-existent file should work (symlink validation skips ENOENT)
			await expect(service.writeFile(testWorkspacePath, 'new-file.txt', 'content')).resolves.toBeDefined();
		});

		it('should validate symlink in directory listing', async () => {
			// Setup: Create a directory symlink pointing outside
			const outsideDir = await mkdtemp(path.join(tmpdir(), 'outside-test-'));
			tempDirs.push(outsideDir);
			await mkdir(path.join(outsideDir, 'secret-dir'));

			const symlinkPath = path.join(testWorkspacePath, 'link-to-outside-dir');
			try {
				await symlink(path.join(outsideDir, 'secret-dir'), symlinkPath, 'dir');
			} catch (error) {
				// On Windows, symlink creation might fail without admin privileges
				if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') {
					console.log('Skipping symlink test - requires elevated privileges on Windows');
					return;
				}
				throw error;
			}

			// Execute & Verify: Should reject listing the symlinked directory
			await expect(service.listDirectory(testWorkspacePath, 'link-to-outside-dir')).rejects.toThrow(
				BadRequestException
			);
		});
	});

	describe('resolveWorkspacePath', () => {
		it('should delegate to WorkspacesService', async () => {
			// Setup
			const workspaceId = 'test-workspace-id';

			// Execute
			const result = await service.resolveWorkspacePath(workspaceId);

			// Verify
			expect(result).toBe(testWorkspacePath);
			expect(mockWorkspacesService.resolveWorkspacePath).toHaveBeenCalledWith(workspaceId);
		});
	});
});
