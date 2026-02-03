import { access, constants, lstat } from 'fs/promises';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspacePathValidator } from './WorkspacePathValidator';

// Mock fs/promises
vi.mock('fs/promises');

describe('WorkspacePathValidator', () => {
	let validator: WorkspacePathValidator;

	beforeEach(() => {
		validator = new WorkspacePathValidator();
		vi.clearAllMocks();
	});

	describe('validatePath', () => {
		it('should accept valid absolute paths', async () => {
			// Setup mocks
			vi.mocked(lstat).mockResolvedValue({ isSymbolicLink: () => false } as any);
			vi.mocked(access).mockResolvedValue(undefined);

			// Test Windows path
			await expect(validator.validatePath('C:\\Users\\test\\workspace')).resolves.toBeUndefined();

			// Test Unix path
			await expect(validator.validatePath('/home/user/workspace')).resolves.toBeUndefined();
		});

		it('should reject relative paths', async () => {
			// Execute & Verify
			await expect(validator.validatePath('./workspace')).rejects.toThrow('Path must be absolute');
			await expect(validator.validatePath('../workspace')).rejects.toThrow('Path must be absolute');
			await expect(validator.validatePath('workspace')).rejects.toThrow('Path must be absolute');
		});

		it('should reject paths with traversal attempts', async () => {
			// Path with .. segments should be rejected
			await expect(validator.validatePath('C:\\Users\\..\\..\\Windows')).rejects.toThrow(
				'Path contains unsafe characters or traversal attempts'
			);
		});

		it('should reject paths with null bytes', async () => {
			// Path with null byte should be rejected
			await expect(validator.validatePath('C:\\Users\\test\0\\workspace')).rejects.toThrow(
				'Path contains unsafe characters or traversal attempts'
			);
		});

		it('should reject Windows system directories', async () => {
			// Execute & Verify
			await expect(validator.validatePath('C:\\Windows\\System32')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);

			await expect(validator.validatePath('C:\\Program Files\\App')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);

			await expect(validator.validatePath('C:\\Program Files (x86)\\App')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);

			await expect(validator.validatePath('C:\\ProgramData\\App')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);
		});

		it('should reject Unix system directories', async () => {
			// Execute & Verify
			await expect(validator.validatePath('/etc/config')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);

			await expect(validator.validatePath('/bin/script')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);

			await expect(validator.validatePath('/usr/bin/app')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);

			await expect(validator.validatePath('/sys/device')).rejects.toThrow(
				'Cannot create workspace in system directories'
			);
		});

		it('should reject paths without write permissions', async () => {
			// Setup mock to indicate permission denied
			vi.mocked(lstat).mockRejectedValue({ code: 'ENOENT' }); // Path doesn't exist
			vi.mocked(access).mockRejectedValue({ code: 'EACCES' }); // Permission denied

			// Execute & Verify
			await expect(validator.validatePath('C:\\ReadOnly\\workspace')).rejects.toThrow(
				'Permission denied - cannot write to path'
			);
		});

		it('should accept paths where parent directory is writable', async () => {
			// Setup mocks
			// Path doesn't exist but parent does and is writable
			vi.mocked(lstat)
				.mockRejectedValueOnce({ code: 'ENOENT' }) // Path doesn't exist
				.mockResolvedValueOnce({ isDirectory: () => true } as any); // Parent exists

			vi.mocked(access)
				.mockRejectedValueOnce({ code: 'ENOENT' }) // Path doesn't exist
				.mockResolvedValueOnce(undefined); // Parent is writable

			// Execute & Verify
			await expect(validator.validatePath('C:\\Users\\test\\new-workspace')).resolves.toBeUndefined();
		});
	});

	describe('isPathAbsolute', () => {
		it('should return true for absolute paths', () => {
			expect(validator.isPathAbsolute('C:\\Users\\test\\workspace')).toBe(true);
			expect(validator.isPathAbsolute('/home/user/workspace')).toBe(true);
		});

		it('should return false for relative paths', () => {
			expect(validator.isPathAbsolute('./workspace')).toBe(false);
			expect(validator.isPathAbsolute('../workspace')).toBe(false);
			expect(validator.isPathAbsolute('workspace')).toBe(false);
		});
	});

	describe('isPathSafe', () => {
		it('should return true for safe paths', () => {
			expect(validator.isPathSafe('C:\\Users\\test\\workspace')).toBe(true);
			expect(validator.isPathSafe('/home/user/workspace')).toBe(true);
		});

		it('should return false for paths with null bytes', () => {
			expect(validator.isPathSafe('C:\\Users\\test\0\\workspace')).toBe(false);
		});
	});

	describe('isPathWritable', () => {
		it('should return true if path exists and is writable', async () => {
			// Setup mocks
			vi.mocked(lstat).mockResolvedValue({ isDirectory: () => true } as any);
			vi.mocked(access).mockResolvedValue(undefined);

			// Execute & Verify
			const result = await validator.isPathWritable('C:\\Users\\test\\workspace');
			expect(result).toBe(true);
		});

		it('should return false if path exists but is not writable', async () => {
			// Setup mocks
			vi.mocked(lstat).mockResolvedValue({ isDirectory: () => true } as any);
			vi.mocked(access).mockRejectedValue({ code: 'EACCES' });

			// Execute & Verify
			const result = await validator.isPathWritable('C:\\ReadOnly\\workspace');
			expect(result).toBe(false);
		});

		it('should check parent directory if path does not exist', async () => {
			// Setup mocks
			vi.mocked(lstat)
				.mockRejectedValueOnce({ code: 'ENOENT' }) // Path doesn't exist
				.mockResolvedValueOnce({ isDirectory: () => true } as any); // Parent exists

			vi.mocked(access)
				.mockRejectedValueOnce({ code: 'ENOENT' }) // Path doesn't exist
				.mockResolvedValueOnce(undefined); // Parent is writable

			// Execute & Verify
			const result = await validator.isPathWritable('C:\\Users\\test\\new-workspace');
			expect(result).toBe(true);
		});
	});

	describe('pathExists', () => {
		it('should return true if path exists', async () => {
			// Setup mock
			vi.mocked(lstat).mockResolvedValue({ isDirectory: () => true } as any);

			// Execute & Verify
			const result = await validator.pathExists('C:\\Users\\test\\workspace');
			expect(result).toBe(true);
		});

		it('should return false if path does not exist', async () => {
			// Setup mock
			vi.mocked(lstat).mockRejectedValue({ code: 'ENOENT' });

			// Execute & Verify
			const result = await validator.pathExists('C:\\Users\\test\\nonexistent');
			expect(result).toBe(false);
		});
	});

	describe('isDirectory', () => {
		it('should return true if path is a directory', async () => {
			// Setup mock
			vi.mocked(lstat).mockResolvedValue({ isDirectory: () => true } as any);

			// Execute & Verify
			const result = await validator.isDirectory('C:\\Users\\test\\workspace');
			expect(result).toBe(true);
		});

		it('should return false if path is a file', async () => {
			// Setup mock
			vi.mocked(lstat).mockResolvedValue({ isDirectory: () => false } as any);

			// Execute & Verify
			const result = await validator.isDirectory('C:\\Users\\test\\file.txt');
			expect(result).toBe(false);
		});

		it('should return false if path does not exist', async () => {
			// Setup mock
			vi.mocked(lstat).mockRejectedValue({ code: 'ENOENT' });

			// Execute & Verify
			const result = await validator.isDirectory('C:\\Users\\test\\nonexistent');
			expect(result).toBe(false);
		});
	});

	describe('isDirectoryEmpty', () => {
		it('should return true if directory is empty', async () => {
			// Setup mock - need to mock dynamic import
			const mockReaddir = vi.fn().mockResolvedValue([]);
			vi.doMock('fs/promises', () => ({
				readdir: mockReaddir,
			}));

			// Execute & Verify
			const result = await validator.isDirectoryEmpty('C:\\Users\\test\\empty');
			expect(result).toBe(true);
		});

		it('should return false if directory has files', async () => {
			// Setup mock
			const mockReaddir = vi.fn().mockResolvedValue(['file1.txt', 'file2.txt']);
			vi.doMock('fs/promises', () => ({
				readdir: mockReaddir,
			}));

			// Execute & Verify
			const result = await validator.isDirectoryEmpty('C:\\Users\\test\\full');
			expect(result).toBe(false);
		});

		it('should return false if readdir fails', async () => {
			// Setup mock
			const mockReaddir = vi.fn().mockRejectedValue(new Error('Permission denied'));
			vi.doMock('fs/promises', () => ({
				readdir: mockReaddir,
			}));

			// Execute & Verify
			const result = await validator.isDirectoryEmpty('C:\\Users\\test\\error');
			expect(result).toBe(false);
		});
	});
});
