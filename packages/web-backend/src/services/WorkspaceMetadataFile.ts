import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

/**
 * Workspace metadata stored in .agent-fleet/workspace-metadata.json
 */
export interface WorkspaceFileMetadata {
	id: string;
	name?: string;
	description?: string;
	mode?: 'development' | 'production' | 'staging';
	createdAt: string;
	updatedAt: string;
}

/**
 * ===========================================================================================
 * WORKSPACE METADATA FILE SERVICE
 * ===========================================================================================
 *
 * Manages workspace metadata persistence in local files.
 *
 * Responsibilities:
 * - Read metadata from <workspace>/.agent-fleet/workspace-metadata.json
 * - Write metadata to workspace directory
 * - Create metadata file with defaults if missing
 * - Handle file system errors gracefully
 *
 * File Location: <workspacePath>/.agent-fleet/workspace-metadata.json
 *
 * ===========================================================================================
 */
export class WorkspaceMetadataFile {
	private readonly metadataDir = '.agent-fleet';
	private readonly metadataFilename = 'workspace-metadata.json';

	/**
	 * Read workspace metadata from file
	 * Returns null if file doesn't exist or is corrupted
	 */
	async read(workspacePath: string): Promise<WorkspaceFileMetadata | null> {
		const metadataPath = this.getMetadataPath(workspacePath);

		try {
			const content = await readFile(metadataPath, 'utf-8');
			const metadata = JSON.parse(content);

			// Validate required fields
			if (!metadata.id || !metadata.createdAt || !metadata.updatedAt) {
				console.warn(
					`[WorkspaceMetadataFile] Invalid metadata file at ${metadataPath}, missing required fields`
				);
				return null;
			}

			return metadata;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				// File doesn't exist - this is normal for new workspaces
				return null;
			}
			// Log other errors but don't throw
			console.error(`[WorkspaceMetadataFile] Error reading metadata from ${metadataPath}:`, error);
			return null;
		}
	}

	/**
	 * Write workspace metadata to file
	 * Creates directory if it doesn't exist
	 */
	async write(workspacePath: string, metadata: Partial<WorkspaceFileMetadata>): Promise<WorkspaceFileMetadata> {
		const metadataPath = this.getMetadataPath(workspacePath);

		// Read existing metadata or create default
		const existing = await this.read(workspacePath);
		const now = new Date().toISOString();

		const updated: WorkspaceFileMetadata = {
			id: existing?.id || metadata.id || randomUUID(),
			name: metadata.name !== undefined ? metadata.name : existing?.name,
			description: metadata.description !== undefined ? metadata.description : existing?.description,
			mode: metadata.mode || existing?.mode || 'development',
			createdAt: existing?.createdAt || metadata.createdAt || now,
			updatedAt: now,
		};

		try {
			// Ensure directory exists
			const metadataDir = dirname(metadataPath);
			await mkdir(metadataDir, { recursive: true });

			// Write metadata
			await writeFile(metadataPath, JSON.stringify(updated, null, 2), 'utf-8');

			return updated;
		} catch (error) {
			console.error(`[WorkspaceMetadataFile] Error writing metadata to ${metadataPath}:`, error);
			throw new Error(`Failed to write workspace metadata: ${(error as Error).message}`);
		}
	}

	/**
	 * Ensure metadata file exists with default values
	 * Creates file if missing, returns existing if present
	 */
	async ensureFile(workspacePath: string): Promise<WorkspaceFileMetadata> {
		const existing = await this.read(workspacePath);

		if (existing) {
			return existing;
		}

		// Create default metadata
		const defaultMetadata: Partial<WorkspaceFileMetadata> = {
			name: this.extractWorkspaceName(workspacePath),
			mode: 'development',
		};

		return this.write(workspacePath, defaultMetadata);
	}

	/**
	 * Get full path to metadata file
	 */
	public getMetadataPath(workspacePath: string): string {
		return join(workspacePath, this.metadataDir, this.metadataFilename);
	}

	/**
	 * Alias for getMetadataPath (for consistency with other APIs)
	 */
	public getMetadataFilePath(workspacePath: string): string {
		return this.getMetadataPath(workspacePath);
	}

	/**
	 * Extract workspace name from path
	 * Example: /home/user/projects/my-app → my-app
	 */
	private extractWorkspaceName(workspacePath: string): string {
		return workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Workspace';
	}
}
