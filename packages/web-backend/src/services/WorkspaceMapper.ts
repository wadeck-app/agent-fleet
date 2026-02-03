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
	static mapWorkerWorkspaceToApi(
		workerWorkspace: WorkerWorkspace,
		metadata?: WorkspaceMetadata,
		activeWorkerId?: string,
		projectId?: string
	): ApiWorkspace {
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
			// Enriched fields
			activeWorkerId,
			projectId,
		} as ApiWorkspace;
		// @formatter:on
	}

	/**
	 * Map multiple worker workspaces with metadata
	 */
	static mapWorkerWorkspacesToApi(
		workerWorkspaces: WorkerWorkspace[],
		metadataMap: Map<string, WorkspaceMetadata>,
		enrichmentData?: {
			activeWorkerMap: Map<string, string>; // workspaceId -> workerId
			projectMap: Map<string, string>; // workspaceId -> projectId
		}
	): ApiWorkspace[] {
		return workerWorkspaces.map(workspace => {
			const metadata = metadataMap.get(workspace.workspacePath);
			// Use metadata ID if available, otherwise use generated ID
			const workspaceId = metadata?.id || this.generateIdFromPath(workspace.workspacePath);
			const activeWorkerId = enrichmentData?.activeWorkerMap.get(workspaceId);
			const projectId = enrichmentData?.projectMap.get(workspaceId);

			return this.mapWorkerWorkspaceToApi(workspace, metadata, activeWorkerId, projectId);
		});
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
	 * Map a workspace path and metadata to API format (for newly created workspaces)
	 */
	static mapPathToWorkspace(
		workspacePath: string,
		metadata: WorkspaceMetadata,
		gitBranch?: string,
		activeWorkerId?: string,
		projectId?: string
	): ApiWorkspace {
		// @formatter:off
		const id = metadata.id || this.generateIdFromPath(workspacePath);
		const name = metadata.name || this.extractWorkspaceName(workspacePath);

		return {
			id,
			path: workspacePath,
			mode: metadata.mode || 'development',
			tasksCount: 0,
			gitBranch,
			status: 'active' as const,
			createdAt: metadata.createdAt,
			lastUsed: metadata.updatedAt,
			gitStatus: undefined,
			activeTasks: [],
			name,
			description: metadata.description,
			color: metadata.color,
			// Enriched fields
			activeWorkerId,
			projectId,
		} as ApiWorkspace;
		// @formatter:on
	}

	/**
	 * Extract workspace name from path
	 * Example: /home/user/projects/my-app → my-app
	 */
	private static extractWorkspaceName(workspacePath: string): string {
		return workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Workspace';
	}
}
