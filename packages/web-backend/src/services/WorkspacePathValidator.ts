import { access, constants, lstat } from 'fs/promises';
import { isAbsolute, normalize, resolve, sep } from 'path';
import { createLogger } from 'shared-common/logger';

const log = createLogger('WorkspacePathValidator');

/**
 * Service responsible for validating and securing workspace paths
 */
export class WorkspacePathValidator {
	// System directories that should never be used as workspace paths
	private readonly FORBIDDEN_PATHS_WINDOWS = [
		'C:\\Windows',
		'C:\\Program Files',
		'C:\\Program Files (x86)',
		'C:\\ProgramData',
		'C:\\System',
	];

	private readonly FORBIDDEN_PATHS_UNIX = [
		'/etc',
		'/bin',
		'/sbin',
		'/usr/bin',
		'/usr/sbin',
		'/sys',
		'/proc',
		'/boot',
	];

	/**
	 * Validate a path for workspace creation
	 *
	 * @param path - Path to validate
	 * @throws Error if path is invalid or unsafe
	 */
	async validatePath(path: string): Promise<void> {
		// Check if path is absolute
		if (!this.isPathAbsolute(path)) {
			throw new Error('Path must be absolute');
		}

		// Check for path traversal
		if (!this.isPathSafe(path)) {
			throw new Error('Path contains unsafe characters or traversal attempts');
		}

		// Check if path is in a forbidden system directory
		if (this.isSystemDirectory(path)) {
			throw new Error('Cannot create workspace in system directories');
		}

		// Check write permissions (if parent exists)
		const canWrite = await this.isPathWritable(path);
		if (!canWrite) {
			throw new Error('Permission denied - cannot write to path');
		}
	}

	/**
	 * Check if path is absolute
	 */
	isPathAbsolute(path: string): boolean {
		return isAbsolute(path);
	}

	/**
	 * Check if path is safe (no traversal attempts, no symlink exploits)
	 */
	isPathSafe(path: string): boolean {
		try {
			// Normalize the path to resolve . and ..
			const normalizedPath = normalize(path);
			const resolvedPath = resolve(path);

			// Check if normalized path differs significantly (indicates traversal attempt)
			// After normalization, the path should be the same as the resolved path
			if (normalizedPath !== resolvedPath) {
				log.warn('Path traversal detected', { path, normalizedPath, resolvedPath });
				return false;
			}

			// Check for .. segments in the normalized path
			// After normalization, there should be no .. segments
			if (normalizedPath.includes(`..${sep}`) || normalizedPath.includes(`${sep}..`)) {
				log.warn('Path contains .. segments after normalization', { path, normalizedPath });
				return false;
			}

			// Check for null bytes (path injection attempt)
			if (path.includes('\0')) {
				log.warn('Path contains null bytes', { path });
				return false;
			}

			return true;
		} catch (error) {
			log.error('Error validating path safety', { path, error });
			return false;
		}
	}

	/**
	 * Check if path is in a system directory
	 */
	private isSystemDirectory(path: string): boolean {
		const normalizedPath = normalize(path).toLowerCase();

		// Check Windows system paths
		for (const forbiddenPath of this.FORBIDDEN_PATHS_WINDOWS) {
			if (normalizedPath.startsWith(forbiddenPath.toLowerCase())) {
				return true;
			}
		}

		// Check Unix system paths
		for (const forbiddenPath of this.FORBIDDEN_PATHS_UNIX) {
			if (normalizedPath.startsWith(forbiddenPath.toLowerCase())) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Check if path or its parent directory is writable
	 */
	async isPathWritable(path: string): Promise<boolean> {
		try {
			// Check if path exists
			const exists = await this.pathExists(path);

			if (exists) {
				// Path exists, check if it's writable
				try {
					await access(path, constants.W_OK);
					return true;
				} catch {
					return false;
				}
			} else {
				// Path doesn't exist, check if parent directory is writable
				const parentPath = resolve(path, '..');

				// Check if parent exists
				const parentExists = await this.pathExists(parentPath);
				if (!parentExists) {
					// Parent doesn't exist either, we'll need to create it
					// Check grandparent directory instead
					const grandparentPath = resolve(parentPath, '..');
					const grandparentExists = await this.pathExists(grandparentPath);

					if (!grandparentExists) {
						// Can't determine writability if grandparent doesn't exist
						log.warn('Cannot determine writability - grandparent directory does not exist', {
							path,
							grandparentPath,
						});
						return false;
					}

					try {
						await access(grandparentPath, constants.W_OK);
						return true;
					} catch {
						return false;
					}
				}

				// Parent exists, check if it's writable
				try {
					await access(parentPath, constants.W_OK);
					return true;
				} catch {
					return false;
				}
			}
		} catch (error) {
			log.error('Error checking path writability', { path, error });
			return false;
		}
	}

	/**
	 * Check if path exists
	 */
	async pathExists(path: string): Promise<boolean> {
		try {
			await lstat(path);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Check if path is a directory
	 */
	async isDirectory(path: string): Promise<boolean> {
		try {
			const stats = await lstat(path);
			return stats.isDirectory();
		} catch {
			return false;
		}
	}

	/**
	 * Check if directory is empty
	 */
	async isDirectoryEmpty(path: string): Promise<boolean> {
		try {
			const { readdir } = await import('fs/promises');
			const files = await readdir(path);
			return files.length === 0;
		} catch {
			return false;
		}
	}
}
