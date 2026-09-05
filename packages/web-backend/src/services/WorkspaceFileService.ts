import { lstat, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createLogger } from 'shared-common/logger';

import type { DirectoryListing, FileContent } from '@app/shared/api/workspaceFiles.contract';
import { BadRequestException, ERROR_CODES } from '@app/shared/exceptions/http-exceptions';

import type { WorkspacesService } from './WorkspacesService';

const log = createLogger('WorkspaceFileService');

/**
 * Maximum file size allowed for reading (1MB)
 */
const MAX_FILE_SIZE = 1024 * 1024;

/**
 * Directories and files to exclude from listings
 */
const EXCLUDED_DIRECTORIES = new Set(['.git', 'node_modules']);

/**
 * ===========================================================================================
 * WORKSPACE FILE SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workspace file operations.
 * Responsibilities:
 * - List directory contents with sorting and filtering
 * - Read file contents with size limits
 * - Write file contents
 * - Security validation (path traversal prevention)
 *
 * Security measures:
 * - Path containment validation (prevent traversal outside workspace)
 * - Null byte injection prevention
 * - Symlink validation (prevent symlinks pointing outside workspace)
 * - File size limits for reading
 *
 * ===========================================================================================
 */

export class WorkspaceFileService {
	constructor(private readonly workspacesService: WorkspacesService) {}

	/**
	 * Resolve a workspace ID to its filesystem path
	 */
	async resolveWorkspacePath(workspaceId: string): Promise<string> {
		return this.workspacesService.resolveWorkspacePath(workspaceId);
	}

	/**
	 * List directory contents with sorting and filtering
	 *
	 * @param workspacePath - Absolute path to the workspace root
	 * @param relativePath - Relative path within the workspace (e.g., 'src' or 'src/utils')
	 * @returns Directory listing with entries sorted (directories first, then alphabetical)
	 * @throws BadRequestException if path is invalid or attempts traversal
	 */
	async listDirectory(workspacePath: string, relativePath: string): Promise<DirectoryListing> {
		const absolutePath = this.resolveAndValidatePath(workspacePath, relativePath);
		await this.validateSymlink(absolutePath, workspacePath);

		log.debug('Listing directory', { workspacePath, relativePath, absolutePath });

		try {
			// Read directory with file types
			const dirEntries = await readdir(absolutePath, { withFileTypes: true });

			// Filter out excluded directories
			const filteredEntries = dirEntries.filter(entry => !EXCLUDED_DIRECTORIES.has(entry.name));

			// Map to FileEntry format with metadata
			const entries = await Promise.all(
				filteredEntries.map(async entry => {
					const entryPath = path.join(absolutePath, entry.name);
					const entryRelativePath = path.join(relativePath, entry.name);

					// Get file metadata
					const stats = await stat(entryPath);

					return {
						name: entry.name,
						// Normalize path separators for cross-platform consistency
						path: entryRelativePath.split(path.sep).join('/'),
						type: entry.isDirectory() ? ('directory' as const) : ('file' as const),
						size: entry.isFile() ? stats.size : undefined,
						lastModified: stats.mtime.toISOString(),
					};
				})
			);

			// Sort: directories first, then alphabetical by name
			entries.sort((a, b) => {
				if (a.type !== b.type) {
					return a.type === 'directory' ? -1 : 1;
				}
				return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
			});

			return {
				entries,
				// Normalize path separators for cross-platform consistency
				path: relativePath.split(path.sep).join('/'),
			};
		} catch (error) {
			log.error('Failed to list directory', { workspacePath, relativePath, error });
			throw new BadRequestException(
				`Failed to list directory: ${error instanceof Error ? String(error) : 'Unknown error'}`,
				ERROR_CODES.BAD_REQUEST
			);
		}
	}

	/**
	 * Read file contents with size limit
	 *
	 * @param workspacePath - Absolute path to the workspace root
	 * @param relativePath - Relative path to the file within workspace
	 * @returns File content with metadata
	 * @throws BadRequestException if file is too large, doesn't exist, or path is invalid
	 */
	async readFile(workspacePath: string, relativePath: string): Promise<FileContent> {
		const absolutePath = this.resolveAndValidatePath(workspacePath, relativePath);
		await this.validateSymlink(absolutePath, workspacePath);

		log.debug('Reading file', { workspacePath, relativePath, absolutePath });

		try {
			// Get file stats first to check size
			const stats = await stat(absolutePath);

			// Check if it's actually a file
			if (!stats.isFile()) {
				throw new BadRequestException(`Path is not a file: ${relativePath}`, ERROR_CODES.BAD_REQUEST);
			}

			// Check size limit
			if (stats.size > MAX_FILE_SIZE) {
				throw new BadRequestException(
					`File size exceeds maximum allowed size of ${MAX_FILE_SIZE} bytes`,
					ERROR_CODES.BAD_REQUEST,
					{ size: stats.size, maxSize: MAX_FILE_SIZE }
				);
			}

			// Read file content
			const content = await readFile(absolutePath, 'utf-8');

			return {
				// Normalize path separators for cross-platform consistency
				path: relativePath.split(path.sep).join('/'),
				content,
				size: stats.size,
				lastModified: stats.mtime.toISOString(),
			};
		} catch (error) {
			log.error('Failed to read file', { workspacePath, relativePath, error });

			// If it's already a BadRequestException, rethrow it
			if (error instanceof BadRequestException) {
				throw error;
			}

			throw new BadRequestException(
				`Failed to read file: ${error instanceof Error ? String(error) : 'Unknown error'}`,
				ERROR_CODES.BAD_REQUEST
			);
		}
	}

	/**
	 * Write file contents
	 *
	 * @param workspacePath - Absolute path to the workspace root
	 * @param relativePath - Relative path to the file within workspace
	 * @param content - File content to write
	 * @returns Updated file metadata
	 * @throws BadRequestException if path is invalid or write fails
	 */
	async writeFile(workspacePath: string, relativePath: string, content: string): Promise<FileContent> {
		const absolutePath = this.resolveAndValidatePath(workspacePath, relativePath);
		await this.validateSymlink(absolutePath, workspacePath);

		log.debug('Writing file', { workspacePath, relativePath, absolutePath });

		try {
			// Write file content
			await writeFile(absolutePath, content, 'utf-8');

			// Get updated file stats
			const stats = await stat(absolutePath);

			return {
				// Normalize path separators for cross-platform consistency
				path: relativePath.split(path.sep).join('/'),
				content,
				size: stats.size,
				lastModified: stats.mtime.toISOString(),
			};
		} catch (error) {
			log.error('Failed to write file', { workspacePath, relativePath, error });
			throw new BadRequestException(
				`Failed to write file: ${error instanceof Error ? String(error) : 'Unknown error'}`,
				ERROR_CODES.BAD_REQUEST
			);
		}
	}

	/**
	 * Resolve and validate a path within the workspace
	 *
	 * Security checks:
	 * 1. Reject paths with null bytes (injection attack)
	 * 2. Resolve to absolute path
	 * 3. Normalize both paths for comparison
	 * 4. Verify resolved path is within workspace (containment check)
	 *
	 * Note: Symlink validation is performed separately in validateSymlink()
	 *
	 * @param workspacePath - Absolute path to the workspace root
	 * @param relativePath - Relative path within the workspace
	 * @returns Validated absolute path
	 * @throws BadRequestException if path is invalid or attempts traversal
	 */
	private resolveAndValidatePath(workspacePath: string, relativePath: string): string {
		// Check for null bytes (path injection attack)
		if (workspacePath.includes('\0') || relativePath.includes('\0')) {
			throw new BadRequestException('Path contains invalid characters (null byte)', ERROR_CODES.INVALID_INPUT);
		}

		// Reject explicit '..' in the relative path
		if (relativePath.includes('..')) {
			throw new BadRequestException('Path traversal is not allowed (.. detected)', ERROR_CODES.INVALID_INPUT);
		}

		// Resolve to absolute path
		const resolvedPath = path.resolve(workspacePath, relativePath);

		// Normalize both paths for comparison (handles different separators and redundant separators)
		const normalizedWorkspace = path.normalize(workspacePath);
		const normalizedResolved = path.normalize(resolvedPath);

		// Containment check: ensure resolved path starts with workspace path
		// Add path separator to prevent partial directory name matches
		// e.g., /workspace vs /workspace-evil
		const workspaceWithSep = normalizedWorkspace.endsWith(path.sep)
			? normalizedWorkspace
			: normalizedWorkspace + path.sep;

		if (!normalizedResolved.startsWith(workspaceWithSep) && normalizedResolved !== normalizedWorkspace) {
			throw new BadRequestException('Path is outside workspace boundaries', ERROR_CODES.INVALID_INPUT, {
				workspacePath: normalizedWorkspace,
				resolvedPath: normalizedResolved,
			});
		}

		return resolvedPath;
	}

	/**
	 * Validate that if the path is a symlink, its target is within the workspace
	 *
	 * @param absolutePath - The absolute path to validate
	 * @param workspacePath - The workspace root path
	 * @throws BadRequestException if path is a symlink pointing outside workspace
	 */
	private async validateSymlink(absolutePath: string, workspacePath: string): Promise<void> {
		try {
			// Use lstat to get info about the path itself (not following symlinks)
			const stats = await lstat(absolutePath);

			// If it's a symlink, verify its target is within workspace
			if (stats.isSymbolicLink()) {
				// Resolve the symlink target to an absolute path
				const symlinkTarget = await realpath(absolutePath);
				const normalizedRealPath = path.normalize(symlinkTarget);
				const normalizedWorkspace = path.normalize(workspacePath);

				// Containment check for symlink target
				const workspaceWithSep = normalizedWorkspace.endsWith(path.sep)
					? normalizedWorkspace
					: normalizedWorkspace + path.sep;

				if (!normalizedRealPath.startsWith(workspaceWithSep) && normalizedRealPath !== normalizedWorkspace) {
					throw new BadRequestException(
						'Symlink target is outside workspace boundaries',
						ERROR_CODES.INVALID_INPUT,
						{ workspacePath: normalizedWorkspace, symlinkTarget: normalizedRealPath }
					);
				}
			}
		} catch (error) {
			// If the path doesn't exist yet (e.g., for writeFile), that's OK
			// We only validate symlinks that already exist
			if (error instanceof BadRequestException) {
				throw error;
			}
			// For ENOENT (file not found), we allow it - the file doesn't exist yet
			// Other errors should be logged but not block the operation
			if (error && typeof error === 'object' && 'code' in error && error.code !== 'ENOENT') {
				log.warn('Error validating symlink', { absolutePath, error });
			}
		}
	}
}
