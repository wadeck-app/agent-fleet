import { readFile } from 'fs/promises';
import { join } from 'path';
import { createLogger } from 'shared-common/logger';

const log = createLogger('WorkspaceMetadataFile');

/**
 * Legacy workspace metadata stored in .agent-fleet/workspace-metadata.json
 * @deprecated Used only for one-time migration to centralized data/workspaces.json
 */
export interface WorkspaceFileMetadata {
	id: string;
	name?: string;
	description?: string;
	color?: string;
	mode?: 'development' | 'production' | 'staging';
	createdAt: string;
	updatedAt: string;
}

/**
 * @deprecated Kept for reading legacy .agent-fleet/workspace-metadata.json during migration.
 * New workspace metadata is stored centrally via WorkspaceMetadataRepository.
 */
export class WorkspaceMetadataFile {
	private readonly metadataDir = '.agent-fleet';
	private readonly metadataFilename = 'workspace-metadata.json';

	/**
	 * Read workspace metadata from legacy file
	 * Returns null if file doesn't exist or is corrupted
	 */
	async read(workspacePath: string): Promise<WorkspaceFileMetadata | null> {
		const metadataPath = join(workspacePath, this.metadataDir, this.metadataFilename);

		try {
			const content = await readFile(metadataPath, 'utf-8');
			const metadata = JSON.parse(content);

			// Validate required fields
			if (!metadata.id || !metadata.createdAt || !metadata.updatedAt) {
				log.warn(`Invalid metadata file at ${metadataPath}, missing required fields`);
				return null;
			}

			return metadata;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return null;
			}
			log.error(`Error reading metadata from ${metadataPath}:`, error);
			return null;
		}
	}
}
