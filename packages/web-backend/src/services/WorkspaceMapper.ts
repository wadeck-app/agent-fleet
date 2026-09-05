import crypto from 'node:crypto';

import type { Workspace as ApiWorkspace, WorkspaceMetadataEntity } from '@app/shared/api/workspaces.contract';

/**
 * Worker info from orchestrator (connected workers enrichment data)
 */
export interface WorkerInfo {
	workerId: string;
	connectedAt: string;
	gitBranch?: string;
}

/**
 * Maps workspace metadata entities to API Contract Workspace DTOs
 */
export class WorkspaceMapper {
	/**
	 * Map a centralized WorkspaceMetadataEntity to API format
	 * Status is 'active' if a worker is connected, 'idle' otherwise
	 */
	static mapEntityToApi(entity: WorkspaceMetadataEntity, workerInfo?: WorkerInfo, projectId?: string): ApiWorkspace {
		// @formatter:off
		const status = workerInfo ? ('active' as const) : ('idle' as const);
		const name = entity.name || this.extractWorkspaceName(entity.path);

		return {
			id: entity.id,
			path: entity.path,
			mode: entity.mode || 'development',
			tasksCount: 0,
			gitBranch: workerInfo?.gitBranch ?? entity.gitBranch,
			status,
			createdAt: entity.createdAt,
			lastUsed: entity.updatedAt,
			gitStatus: undefined,
			activeTasks: [],
			name,
			description: entity.description,
			color: entity.color,
			activeWorkerId: workerInfo?.workerId,
			projectId,
		} as ApiWorkspace;
		// @formatter:on
	}

	/**
	 * Generate stable ID from workspace path using hash
	 * Kept for backward compatibility during migration lookups
	 */
	static generateIdFromPath(workspacePath: string): string {
		const hash = crypto.createHash('sha256').update(workspacePath).digest('hex');
		return hash.substring(0, 16);
	}

	/**
	 * Extract workspace name from path
	 * Example: /home/user/projects/my-app → my-app
	 */
	static extractWorkspaceName(workspacePath: string): string {
		return workspacePath.split(/[/\\]/).filter(Boolean).pop() || 'Workspace';
	}
}
