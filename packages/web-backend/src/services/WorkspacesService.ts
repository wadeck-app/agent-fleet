import type { WorkspacesData, Workspace, WorkspaceStatus } from '@app/shared';

/**
 * ===========================================================================================
 * WORKSPACES SERVICE
 * ===========================================================================================
 *
 * Business logic layer for workspace management.
 * Responsibilities:
 * - Generate mock workspace data (MVP - orchestrator doesn't have workspaces API yet)
 * - Calculate summary statistics
 * - Transform workspace data into frontend DTO
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (would be in repository when real API exists)
 *
 * ===========================================================================================
 */

export class WorkspacesService {
	/**
	 * Get workspaces data
	 * MVP: Returns mock data since orchestrator doesn't have workspaces API yet
	 */
	async getWorkspacesData(): Promise<WorkspacesData> {
		console.log('[WorkspacesService] Generating mock workspaces data...');

		// Generate synthetic workspaces for MVP
		const workspaces = this.generateMockWorkspaces();

		// Calculate summary statistics
		const summary = this.calculateSummary(workspaces);

		const workspacesData: WorkspacesData = {
			timestamp: new Date().toISOString(),
			summary,
			workspaces,
		};

		return workspacesData;
	}

	/**
	 * Generate mock workspace data for MVP
	 * TODO: Replace with real orchestrator API calls when available
	 */
	private generateMockWorkspaces(): Workspace[] {
		const now = new Date();
		const workspaces: Workspace[] = [];

		// Workspace 1: Active development workspace with git changes
		workspaces.push({
			id: 'ws-dev-001',
			path: 'C:\\Workspace_Tooling\\agent-fleet\\workspaces\\dev-001',
			mode: 'development',
			tasksCount: 3,
			gitBranch: 'feature/user-authentication',
			status: 'active',
			createdAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
			lastUsed: new Date(now.getTime() - 30 * 60 * 1000).toISOString(), // 30 min ago
			gitStatus: {
				ahead: 5,
				behind: 0,
				modified: 8,
				untracked: 2,
			},
			activeTasks: ['task-001', 'task-002', 'task-003'],
		});

		// Workspace 2: Production workspace - locked
		workspaces.push({
			id: 'ws-prod-001',
			path: 'C:\\Workspace_Tooling\\agent-fleet\\workspaces\\prod-001',
			mode: 'production',
			tasksCount: 0,
			gitBranch: 'main',
			status: 'locked',
			createdAt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
			lastUsed: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
			gitStatus: {
				ahead: 0,
				behind: 0,
				modified: 0,
				untracked: 0,
			},
			activeTasks: [],
		});

		// Workspace 3: Staging workspace - active
		workspaces.push({
			id: 'ws-stage-001',
			path: 'C:\\Workspace_Tooling\\agent-fleet\\workspaces\\stage-001',
			mode: 'staging',
			tasksCount: 2,
			gitBranch: 'release/v1.2.0',
			status: 'active',
			createdAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days ago
			lastUsed: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
			gitStatus: {
				ahead: 2,
				behind: 1,
				modified: 3,
				untracked: 0,
			},
			activeTasks: ['task-004', 'task-005'],
		});

		// Workspace 4: Development workspace - cleaning
		workspaces.push({
			id: 'ws-dev-002',
			path: 'C:\\Workspace_Tooling\\agent-fleet\\workspaces\\dev-002',
			mode: 'development',
			tasksCount: 0,
			gitBranch: 'feature/cleanup',
			status: 'cleaning',
			createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
			lastUsed: new Date(now.getTime() - 10 * 60 * 1000).toISOString(), // 10 min ago
			gitStatus: {
				ahead: 0,
				behind: 3,
				modified: 0,
				untracked: 0,
			},
		});

		// Workspace 5: Development workspace - error state
		workspaces.push({
			id: 'ws-dev-003',
			path: 'C:\\Workspace_Tooling\\agent-fleet\\workspaces\\dev-003',
			mode: 'development',
			tasksCount: 1,
			gitBranch: 'feature/broken-build',
			status: 'error',
			createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
			lastUsed: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
			gitStatus: {
				ahead: 1,
				behind: 0,
				modified: 15,
				untracked: 7,
			},
			activeTasks: ['task-006'],
		});

		// Workspace 6: Active development workspace without git branch
		workspaces.push({
			id: 'ws-dev-004',
			path: 'C:\\Workspace_Tooling\\agent-fleet\\workspaces\\dev-004',
			mode: 'development',
			tasksCount: 4,
			status: 'active',
			createdAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
			lastUsed: new Date(now.getTime() - 5 * 60 * 1000).toISOString(), // 5 min ago
			activeTasks: ['task-007', 'task-008', 'task-009', 'task-010'],
		});

		return workspaces;
	}

	/**
	 * Calculate summary statistics from workspace list
	 * @param workspaces - Array of workspaces
	 */
	private calculateSummary(workspaces: Workspace[]): {
		total: number;
		active: number;
		locked: number;
		cleaning: number;
		errorCount: number;
	} {
		const summary = {
			total: workspaces.length,
			active: 0,
			locked: 0,
			cleaning: 0,
			errorCount: 0,
		};

		// Count workspaces by status
		workspaces.forEach((workspace) => {
			switch (workspace.status) {
				case 'active':
					summary.active++;
					break;
				case 'locked':
					summary.locked++;
					break;
				case 'cleaning':
					summary.cleaning++;
					break;
				case 'error':
					summary.errorCount++;
					break;
			}
		});

		return summary;
	}
}
