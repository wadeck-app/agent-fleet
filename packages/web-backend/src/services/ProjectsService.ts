import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';

import type {
	AddWorkspacesToProject,
	CreateProject,
	Project,
	ProjectBoardData,
	ProjectsData,
	ProjectsListQuery,
	ProjectsListResponse,
	UpdateProject,
} from '@app/shared/api/projects.contract';
import type { Task } from '@app/shared/api/tasks.contract';
import type { Workspace } from '@app/shared/api/workspaces.contract';
import type { BulkDeleteResponse } from '@app/shared/common/api-helpers';
import {
	ConflictException,
	ERROR_CODES,
	HttpException,
	NotFoundException,
} from '@app/shared/exceptions/http-exceptions';
import { B2F_WORKSPACE_UPDATED } from '@app/shared/transport';

import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { ProjectsRepository } from '../repositories/ProjectsRepository';
import type { WorkspaceMetadataRepository } from '../repositories/WorkspaceMetadataRepository';
import { WorkspaceMapper } from '../services/WorkspaceMapper';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

/**
 * ===========================================================================================
 * PROJECTS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for projects.
 * Responsibilities:
 * - CRUD operations for projects
 * - Pagination and search
 * - Business validation (name uniqueness, task count integrity)
 * - Workspace management (add/remove workspaces)
 * - Board data generation (tasks grouped by status)
 * - Emit real-time events for project state changes
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 *
 * Events:
 * - 'b2f:project:created' - Project created
 * - 'b2f:project:updated' - Project updated
 * - 'b2f:project:deleted' - Project deleted
 * - 'b2f:projects:updated' - Projects list updated (aggregate)
 *
 * ===========================================================================================
 */

export class ProjectsService {
	constructor(
		private readonly repository: ProjectsRepository,
		private readonly orchestratorRepository: OrchestratorRepository,
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly workspaceMetadataRepository: WorkspaceMetadataRepository,
		private readonly orchestratorWrapper: OrchestratorWrapper
	) {}

	/**
	 * Get projects data with summary statistics
	 */
	async getProjectsData(): Promise<ProjectsData> {
		try {
			const projects = await this.repository.findAll();

			const summary = {
				total: projects.length,
				active: projects.filter(p => !p.archived).length,
				archived: projects.filter(p => p.archived).length,
			};

			return {
				timestamp: new Date().toISOString(),
				summary,
				projects,
			};
		} catch (error) {
			console.error('[ProjectsService] Failed to fetch projects data:', error);
			return {
				timestamp: new Date().toISOString(),
				summary: {
					total: 0,
					active: 0,
					archived: 0,
				},
				projects: [],
			};
		}
	}

	/**
	 * Get projects list with pagination, sorting, and search support
	 */
	async getProjectsList(query: ProjectsListQuery): Promise<ProjectsListResponse> {
		try {
			let projects = await this.repository.findAll(query);

			// Apply search if provided
			if (query.search) {
				projects = this.applySearch(projects, query.search);
			}

			// Apply sorting (already handled in repository for basic fields)
			// Additional sorting can be done here if needed

			// Apply pagination
			const page = query.page || 1;
			const pageSize = query.pageSize || 10;
			const total = projects.length;
			const totalPages = Math.ceil(total / pageSize);
			const start = (page - 1) * pageSize;
			const paginatedProjects = projects.slice(start, start + pageSize);

			return {
				items: paginatedProjects,
				pagination: {
					total,
					page,
					pageSize,
					totalPages,
				},
			};
		} catch (error) {
			console.error('[ProjectsService] Failed to fetch projects list:', error);
			return {
				items: [],
				pagination: {
					total: 0,
					page: query.page || 1,
					pageSize: query.pageSize || 10,
					totalPages: 0,
				},
			};
		}
	}

	/**
	 * Apply search filter across project fields
	 */
	private applySearch(projects: Project[], searchQuery: string): Project[] {
		const lowerQuery = searchQuery.toLowerCase().trim();
		if (!lowerQuery) return projects;

		return projects.filter(
			p =>
				p.id.toLowerCase().includes(lowerQuery) ||
				p.name.toLowerCase().includes(lowerQuery) ||
				p.description?.toLowerCase().includes(lowerQuery)
		);
	}

	/**
	 * Get project by ID
	 */
	async getById(id: string): Promise<Project> {
		const project = await this.repository.findById(id);
		if (!project) {
			throw new NotFoundException(`Project with id ${id} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
		}
		return project;
	}

	/**
	 * Create a new project
	 * Emits 'b2f:project:created' event after successful creation
	 */
	async create(data: CreateProject): Promise<Project> {
		try {
			// Business validation: Check if name is unique (optional - depends on requirements)
			// For now, we allow duplicate names

			// Create via repository
			const project = await this.repository.create({
				...data,
				taskCount: 0,
				pinned: false,
				order: 0,
			});

			// Emit event AFTER successful creation
			this.eventBroadcaster.broadcast('b2f:project:created', project);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);

			return project;
		} catch (error) {
			console.error('[ProjectsService] Failed to create project:', error);
			throw error;
		}
	}

	/**
	 * Update an existing project (with optimistic locking)
	 * Emits 'b2f:project:updated' event after successful update
	 */
	async update(id: string, data: UpdateProject): Promise<Project> {
		try {
			// Get current entity
			const current = await this.getById(id);

			// Optimistic locking check
			if (current.version !== data.version) {
				throw new ConflictException(
					`Project has been modified by another user. Expected version ${data.version}, but current version is ${current.version}.`,
					ERROR_CODES.VERSION_MISMATCH,
					{ expectedVersion: data.version, currentVersion: current.version }
				);
			}

			// Update via repository (increment version)
			const updated = await this.repository.update(id, {
				...data,
				version: current.version + 1,
			});

			// Emit event AFTER successful update
			this.eventBroadcaster.broadcast('b2f:project:updated', updated);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);

			return updated;
		} catch (error) {
			console.error('[ProjectsService] Failed to update project:', error);
			throw error;
		}
	}

	/**
	 * Delete a project
	 * Verification: Ensure no tasks are assigned to this project
	 * Emits 'b2f:project:deleted' event after successful deletion
	 * Clears projectId from all associated workspaces
	 */
	async delete(id: string): Promise<void> {
		try {
			// Check if exists
			const project = await this.getById(id);

			// Verify no tasks in this project
			if (project.taskCount > 0) {
				throw new ConflictException(
					`Cannot delete project ${project.name} because it has ${project.taskCount} task(s). Please reassign or delete the tasks first.`,
					ERROR_CODES.RESOURCE_IN_USE,
					{ projectId: id, taskCount: project.taskCount }
				);
			}

			// Clear projectId from associated workspaces
			await this.clearProjectFromWorkspaces(id, project.workspaceIds);

			// Delete via repository
			await this.repository.delete(id);

			// Emit event AFTER successful deletion
			this.eventBroadcaster.broadcast('b2f:project:deleted', { id } as any);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);
		} catch (error) {
			console.error('[ProjectsService] Failed to delete project:', error);
			throw error;
		}
	}

	/**
	 * Clear projectId from workspaces when project is deleted
	 * Best-effort approach: only updates connected workspaces
	 */
	private async clearProjectFromWorkspaces(projectId: string, workspaceIds: string[]): Promise<void> {
		if (workspaceIds.length === 0) {
			return;
		}

		try {
			// Get connected workspaces
			const workerWorkspaces = await this.orchestratorWrapper.getConnectedWorkersWorkspaces();
			const workspacePaths = workerWorkspaces.map(w => w.workspacePath);
			const metadataMap = await this.workspaceMetadataRepository.getMetadataForWorkspaces(workspacePaths);

			// Find workspaces that belong to this project
			const affectedWorkspaces: Array<{ path: string; id: string }> = [];
			for (const [path, metadata] of metadataMap.entries()) {
				if (metadata.projectId === projectId || workspaceIds.includes(metadata.id)) {
					affectedWorkspaces.push({ path, id: metadata.id });
				}
			}

			// Clear projectId from each workspace
			for (const workspace of affectedWorkspaces) {
				try {
					const metadata = await this.workspaceMetadataRepository.upsertMetadata(workspace.path, {
						projectId: undefined,
					});

					// Find the worker workspace info to emit full workspace object
					const workerWorkspace = workerWorkspaces.find(w => w.workspacePath === workspace.path);
					if (workerWorkspace) {
						const workspaceData = WorkspaceMapper.mapWorkerWorkspaceToApi(workerWorkspace, metadata);
						this.eventBroadcaster.broadcast(B2F_WORKSPACE_UPDATED, workspaceData);
						console.log(
							`[ProjectsService] Cleared projectId from workspace ${workspace.id} (project ${projectId} deleted)`
						);
					}
				} catch (error) {
					console.warn(`[ProjectsService] Failed to clear projectId from workspace ${workspace.id}:`, error);
				}
			}

			if (affectedWorkspaces.length < workspaceIds.length) {
				console.warn(
					`[ProjectsService] Only cleared ${affectedWorkspaces.length} of ${workspaceIds.length} workspaces (some not connected)`
				);
			}
		} catch (error) {
			console.error('[ProjectsService] Failed to clear projectId from workspaces:', error);
			// Don't throw - deletion should succeed even if workspace cleanup fails
		}
	}

	/**
	 * Bulk delete projects
	 * Best-effort approach: continues on failure, returns results
	 */
	async bulkDelete(ids: string[]): Promise<BulkDeleteResponse> {
		const deleted: string[] = [];
		const failed: Array<{ id: string; reason: string; code: string }> = [];

		for (const id of ids) {
			try {
				await this.delete(id);
				deleted.push(id);
			} catch (error) {
				const errorCode = error instanceof HttpException ? error.code : ERROR_CODES.INTERNAL_SERVER_ERROR;
				failed.push({
					id,
					reason: error instanceof Error ? error.message : 'Unknown error',
					code: errorCode,
				});
			}
		}

		return {
			success: true,
			totalRequested: ids.length,
			totalDeleted: deleted.length,
			totalFailed: failed.length,
			deleted,
			failed,
		};
	}

	/**
	 * Add workspaces to a project
	 * Emits 'b2f:project:updated' event after successful update
	 */
	async addWorkspaces(id: string, data: AddWorkspacesToProject): Promise<Project> {
		try {
			// Check if project exists
			await this.getById(id);

			// Add workspaces via repository
			const updated = await this.repository.addWorkspaces(id, data.workspaceIds);

			// Emit event AFTER successful update
			this.eventBroadcaster.broadcast('b2f:project:updated', updated);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);

			return updated;
		} catch (error) {
			console.error('[ProjectsService] Failed to add workspaces to project:', error);
			throw error;
		}
	}

	/**
	 * Get project board data - tasks grouped by status
	 */
	async getProjectBoard(id: string): Promise<ProjectBoardData> {
		try {
			// Get project
			const project = await this.getById(id);

			// Get all tasks from orchestrator
			const rawTasks = await this.orchestratorRepository.getTasks();

			// Transform and filter tasks by projectId
			const tasks: Task[] = this.transformTasks(rawTasks as any[]);
			const projectTasks = tasks.filter((task: any) => task.projectId === id);

			// Group tasks by status
			const tasksByStatus: Record<string, any[]> = {};

			// Initialize all statuses with empty arrays
			const allStatuses = [
				'backlog',
				'refining',
				'refined',
				'prioritizing',
				'todo',
				'in_progress',
				'awaiting_user',
				'testing',
				'review',
				'reviewing',
				'changes_requested',
				'approved',
				'merged',
				'blocked',
				'cancelled',
			];

			allStatuses.forEach(status => {
				tasksByStatus[status] = [];
			});

			// Group tasks
			projectTasks.forEach(task => {
				if (!tasksByStatus[task.status]) {
					tasksByStatus[task.status] = [];
				}
				tasksByStatus[task.status].push(task);
			});

			return {
				projectId: id,
				projectName: project.name,
				tasksByStatus,
				timestamp: new Date().toISOString(),
			};
		} catch (error) {
			console.error('[ProjectsService] Failed to get project board:', error);
			throw error;
		}
	}

	/**
	 * Transform raw orchestrator tasks to frontend Task schema
	 */
	private transformTasks(rawTasks: any[]): Task[] {
		if (!Array.isArray(rawTasks)) {
			return [];
		}

		return rawTasks.map(task => ({
			id: task.id,
			description: task.description,
			status: task.status,
			priority: task.priority,
			createdAt: task.createdAt,
			updatedAt: task.updatedAt,
			assignedWorker: task.assignedTo
				? {
						workerId: task.assignedTo.workerId,
					}
				: null,
			flowId: task.flowId,
			flowResult: task.flowResult
				? {
						status: task.flowResult.status,
						error: task.flowResult.error,
					}
				: undefined,
		}));
	}

	/**
	 * Increment task count for a project
	 * Called when a task is assigned to a project
	 */
	async incrementTaskCount(projectId: string): Promise<void> {
		try {
			await this.repository.updateTaskCount(projectId, 1);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);
		} catch (error) {
			console.error('[ProjectsService] Failed to increment task count:', error);
			throw error;
		}
	}

	/**
	 * Decrement task count for a project
	 * Called when a task is removed from a project
	 */
	async decrementTaskCount(projectId: string): Promise<void> {
		try {
			await this.repository.updateTaskCount(projectId, -1);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);
		} catch (error) {
			console.error('[ProjectsService] Failed to decrement task count:', error);
			throw error;
		}
	}
}
