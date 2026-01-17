import crypto from 'crypto';

import type { Workspace as ApiWorkspace } from '@app/shared/api/workspaces.contract';

import type { WorkspaceMetadata } from '../repositories/WorkspaceMetadataRepository';

/**
 * Worker workspace info from orchestrator
 */
export interface WorkerWorkspace {
	workerId: string;
	workspacePath: string;
	projectId: string;
	connectedAt: string;
	gitBranch?: string;
}

/**
 * Maps worker workspace info to API Contract Workspace
 */
export class WorkspaceMapper {
	/**
	 * Map a single worker workspace to API format
	 */
	static mapWorkerWorkspaceToApi(workerWorkspace: WorkerWorkspace, metadata?: WorkspaceMetadata): ApiWorkspace {
		// @formatter:off
		// Generate stable ID from workspace path (or use metadata ID if available)
		const id = metadata?.id || this.generateIdFromPath(workerWorkspace.workspacePath);

		// Extract workspace name from path or use metadata name
		const name = metadata?.name || this.extractWorkspaceName(workerWorkspace.workspacePath);

		// Workspace status - active since worker is connected
		const status = 'active' as const;

		// Mode from metadata or default to development
		const mode = metadata?.mode || 'development';

		return {
			id,
			path: workerWorkspace.workspacePath,
			mode,
			tasksCount: 0, // TODO: Get from task manager if needed
			gitBranch: workerWorkspace.gitBranch,
			status,
			createdAt: metadata?.createdAt || workerWorkspace.connectedAt,
			lastUsed: workerWorkspace.connectedAt,
			gitStatus: undefined,
			activeTasks: [],
			// Metadata fields
			name,
			description: metadata?.description,
			color: metadata?.color,
			projectId: metadata?.projectId,
		} as ApiWorkspace;
		// @formatter:on
	}

	/**
	 * Map multiple worker workspaces with metadata
	 */
	static mapWorkerWorkspacesToApi(
		workerWorkspaces: WorkerWorkspace[],
		metadataMap: Map<string, WorkspaceMetadata>
	): ApiWorkspace[] {
		return workerWorkspaces.map(workspace =>
			this.mapWorkerWorkspaceToApi(workspace, metadataMap.get(workspace.workspacePath))
		);
	}

	/**
	 * Generate stable ID from workspace path using hash
	 */
	static generateIdFromPath(workspacePath: string): string {
		const hash = crypto.createHash('sha256').update(workspacePath).digest('hex');
		// Return first 16 chars of hash for readability
		return hash.substring(0, 16);
	}

	/**
	 * Extract workspace name from path
	 * Example: /home/user/projects/my-app → my-app
	 */
	private static extractWorkspaceName(workspacePath: string): string {
		return workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Workspace';
	}
}
