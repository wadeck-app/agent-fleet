import * as fs from 'fs';

import type { WorkspaceFileMetadata, WorkspaceMetadataFile } from '../services/WorkspaceMetadataFile';

/**
 * Workspace metadata (user-editable fields)
 * Compatible with WorkspaceFileMetadata
 */
export interface WorkspaceMetadata {
	id: string;
	name?: string;
	description?: string;
	color?: string;
	projectId?: string;
	mode?: 'development' | 'production' | 'staging';
	createdAt: string;
	updatedAt: string;
}

/**
 * ===========================================================================================
 * WORKSPACE METADATA REPOSITORY
 * ===========================================================================================
 *
 * Repository for workspace metadata (name, description, mode).
 * Uses file-based storage (.agent-fleet/workspace-metadata.json) instead of in-memory storage.
 *
 * Watches metadata files for changes and notifies via callback.
 *
 * ===========================================================================================
 */
export class WorkspaceMetadataRepository {
	private watchers: Map<string, fs.FSWatcher> = new Map();
	private changeCallback?: (workspacePath: string) => void;

	constructor(private readonly metadataFile: WorkspaceMetadataFile) {}

	/**
	 * Get metadata for a workspace by path
	 */
	async getMetadataByPath(workspacePath: string): Promise<WorkspaceMetadata | null> {
		const fileMetadata = await this.metadataFile.read(workspacePath);
		if (!fileMetadata) {
			return null;
		}
		return this.mapToMetadata(fileMetadata);
	}

	/**
	 * Get metadata for multiple workspaces by path
	 */
	async getMetadataForWorkspaces(workspacePaths: string[]): Promise<Map<string, WorkspaceMetadata>> {
		const map = new Map<string, WorkspaceMetadata>();

		// Read metadata for each workspace path
		await Promise.all(
			workspacePaths.map(async path => {
				const metadata = await this.getMetadataByPath(path);
				if (metadata) {
					map.set(path, metadata);
				}
			})
		);

		return map;
	}

	/**
	 * Update or create metadata for a workspace
	 */
	async upsertMetadata(
		workspacePath: string,
		data: {
			name?: string;
			description?: string;
			color?: string;
			projectId?: string | null;
			mode?: 'development' | 'production' | 'staging';
		}
	): Promise<WorkspaceMetadata> {
		const fileMetadata = await this.metadataFile.write(workspacePath, data);
		return this.mapToMetadata(fileMetadata);
	}

	/**
	 * Ensure metadata file exists for a workspace
	 */
	async ensureMetadata(workspacePath: string): Promise<WorkspaceMetadata> {
		const fileMetadata = await this.metadataFile.ensureFile(workspacePath);
		return this.mapToMetadata(fileMetadata);
	}

	/**
	 * Set callback to be called when metadata file changes
	 */
	setChangeCallback(callback: (workspacePath: string) => void): void {
		this.changeCallback = callback;
	}

	/**
	 * Start watching a workspace metadata file for changes
	 */
	startWatching(workspacePath: string): void {
		// Don't watch if already watching
		if (this.watchers.has(workspacePath)) {
			return;
		}

		try {
			const metadataPath = this.metadataFile.getMetadataFilePath(workspacePath);

			// Only watch if file exists
			if (!fs.existsSync(metadataPath)) {
				console.log(`[WorkspaceMetadataRepository] Metadata file doesn't exist yet: ${metadataPath}`);
				return;
			}

			const watcher = fs.watch(metadataPath, (eventType, filename) => {
				if (eventType === 'change') {
					console.log(`[WorkspaceMetadataRepository] Metadata file changed for workspace: ${workspacePath}`);
					// Notify via callback
					if (this.changeCallback) {
						this.changeCallback(workspacePath);
					}
				}
			});

			this.watchers.set(workspacePath, watcher);
			console.log(`[WorkspaceMetadataRepository] Started watching: ${workspacePath}`);
		} catch (error) {
			console.error(`[WorkspaceMetadataRepository] Failed to watch ${workspacePath}:`, error);
		}
	}

	/**
	 * Stop watching a workspace metadata file
	 */
	stopWatching(workspacePath: string): void {
		const watcher = this.watchers.get(workspacePath);
		if (watcher) {
			watcher.close();
			this.watchers.delete(workspacePath);
			console.log(`[WorkspaceMetadataRepository] Stopped watching: ${workspacePath}`);
		}
	}

	/**
	 * Stop watching all workspace metadata files
	 */
	stopAllWatching(): void {
		for (const [workspacePath, watcher] of this.watchers) {
			watcher.close();
			console.log(`[WorkspaceMetadataRepository] Stopped watching: ${workspacePath}`);
		}
		this.watchers.clear();
	}

	/**
	 * Map WorkspaceFileMetadata to WorkspaceMetadata
	 */
	private mapToMetadata(fileMetadata: WorkspaceFileMetadata): WorkspaceMetadata {
		return {
			id: fileMetadata.id,
			name: fileMetadata.name,
			description: fileMetadata.description,
			color: fileMetadata.color,
			projectId: fileMetadata.projectId,
			mode: fileMetadata.mode,
			createdAt: fileMetadata.createdAt,
			updatedAt: fileMetadata.updatedAt,
		};
	}
}
