import type { OrchestratorWrapper } from 'orchestrator/core/OrchestratorWrapper';
import { createLogger } from 'shared-common/logger';

import type {
	AddWorkspacesToProject,
	CreateProject,
	Project,
	ProjectBoardData,
	ProjectStatusConfig,
	ProjectsData,
	ProjectsListQuery,
	ProjectsListResponse,
	UpdateProject,
} from '@app/shared/api/projects.contract';
import type { Task } from '@app/shared/api/tasks.contract';
import type { BulkDeleteResponse } from '@app/shared/common/api-helpers';
import {
	ConflictException,
	ERROR_CODES,
	HttpException,
	NotFoundException,
} from '@app/shared/exceptions/http-exceptions';

import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';
import type { ProjectsRepository } from '../repositories/ProjectsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

const log = createLogger('ProjectsService');

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
		private readonly orchestratorWrapper: OrchestratorWrapper
	) {}

	/**
	 * Normalize project data - ensure all required fields have proper defaults
	 *
	 * This handles legacy projects that may have undefined fields from before schema changes.
	 * IMPORTANT: This is applied ONLY on read operations, never on write operations.
	 *
	 * @param project Raw project data (may have undefined fields)
	 * @returns Normalized project with all required fields
	 */
	private normalizeProject(project: Project): Project {
		return {
			...project,
			workspaceIds: project.workspaceIds ?? [],
			taskCount: project.taskCount ?? 0,
			archived: project.archived ?? false,
			pinned: project.pinned ?? false,
			order: project.order ?? 0,
		};
	}

	/**
	 * Normalize array of projects
	 */
	private normalizeProjects(projects: Project[]): Project[] {
		return projects.map(p => this.normalizeProject(p));
	}

	/**
	 * Get projects data with summary statistics
	 */
	async getProjectsData(): Promise<ProjectsData> {
		try {
			const rawProjects = await this.repository.findAll();
			const projects = this.normalizeProjects(rawProjects);

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
			log.error(' Failed to fetch projects data:', error);
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
			const rawProjects = await this.repository.findAll(query);
			let projects = this.normalizeProjects(rawProjects);

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
			log.error(' Failed to fetch projects list:', error);
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
		return this.normalizeProject(project);
	}

	/**
	 * Create a new project
	 * Emits 'b2f:project:created' event after successful creation
	 *
	 * IMPORTANT: Default values are applied here at creation time, not in Zod schemas.
	 * This prevents PATCH operations from overwriting fields with defaults when not included in payload.
	 */
	async create(data: CreateProject): Promise<Project> {
		try {
			// Business validation: Check if name is unique (optional - depends on requirements)
			// For now, we allow duplicate names

			// Create via repository with default values
			const project = await this.repository.create({
				...data,
				// Apply default values for required fields not provided by user
				workspaceIds: data.workspaceIds ?? [],
				taskCount: 0,
				archived: data.archived ?? false,
				pinned: false,
				order: 0,
			});

			// Normalize before returning
			const normalizedProject = this.normalizeProject(project);

			// Emit event AFTER successful creation
			this.eventBroadcaster.broadcast('b2f:project:created', normalizedProject);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);

			return normalizedProject;
		} catch (error) {
			log.error(' Failed to create project:', error);
			throw error;
		}
	}

	/**
	 * Update an existing project (with optimistic locking)
	 * Emits 'b2f:project:updated' event after successful update
	 */
	async update(id: string, data: UpdateProject): Promise<Project> {
		try {
			// Get current entity (already normalized by getById)
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

			// Normalize before returning
			const normalizedProject = this.normalizeProject(updated);

			// Emit event AFTER successful update
			this.eventBroadcaster.broadcast('b2f:project:updated', normalizedProject);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);

			return normalizedProject;
		} catch (error) {
			log.error(' Failed to update project:', error);
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
			log.error(' Failed to delete project:', error);
			throw error;
		}
	}

	/**
	 * Clear project association when project is deleted
	 * Note: No longer needs to update workspace metadata since projectId is removed.
	 * The single source of truth is project.workspaceIds[], which is deleted with the project.
	 */
	private async clearProjectFromWorkspaces(projectId: string, workspaceIds: string[]): Promise<void> {
		// Nothing to do - workspaceIds are deleted with the project
		// No bidirectional sync needed anymore
		log.info(` Project ${projectId} deletion will remove ${workspaceIds.length} workspace associations`);
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
			// Check if project exists (already normalized)
			await this.getById(id);

			// Add workspaces via repository
			const updated = await this.repository.addWorkspaces(id, data.workspaceIds);

			// Normalize before returning
			const normalizedProject = this.normalizeProject(updated);

			// Emit event AFTER successful update
			this.eventBroadcaster.broadcast('b2f:project:updated', normalizedProject);

			// Emit aggregate event
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast('b2f:projects:updated', {} as any);

			return normalizedProject;
		} catch (error) {
			log.error(' Failed to add workspaces to project:', error);
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
			log.error(' Failed to get project board:', error);
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
			version: task.version,
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
			log.error(' Failed to increment task count:', error);
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
			log.error(' Failed to decrement task count:', error);
			throw error;
		}
	}

	/**
	 * Get the status configuration for a project.
	 * Returns DEFAULT_STATUS_CONFIG if none has been saved yet.
	 * Throws NotFoundException if the project does not exist.
	 *
	 * @param projectId Project ID
	 */
	async getStatusConfig(projectId: string): Promise<ProjectStatusConfig> {
		// Verifies project existence (throws NotFoundException if not found)
		await this.getById(projectId);
		return this.repository.getStatusConfig(projectId);
	}

	/**
	 * Save the status configuration for a project.
	 *
	 * Validation (fail-fast):
	 * - Every transition's from/to values must reference a status id defined in statuses[]
	 *
	 * @param projectId Project ID
	 * @param config New ProjectStatusConfig to persist
	 */
	async saveStatusConfig(projectId: string, config: ProjectStatusConfig): Promise<ProjectStatusConfig> {
		// Verify project exists first
		await this.getById(projectId);

		// Fail-fast: validate that all transition references point to known status IDs
		const knownIds = new Set(config.statuses.map(s => s.id));
		for (const transition of config.transitions) {
			if (!knownIds.has(transition.from)) {
				throw new Error(
					`Invalid transition: "from" value "${transition.from}" does not reference a known status id`
				);
			}
			if (!knownIds.has(transition.to)) {
				throw new Error(
					`Invalid transition: "to" value "${transition.to}" does not reference a known status id`
				);
			}
		}

		await this.repository.saveStatusConfig(projectId, config);
		return config;
	}
}
