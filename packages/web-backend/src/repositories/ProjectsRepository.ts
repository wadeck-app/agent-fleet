import { createLogger } from 'shared-common/logger';

import type { Project, ProjectsListQuery } from '@app/shared/api/projects.contract';

import type { BaseRepository } from './BaseRepository';

const log = createLogger('ProjectsRepository');

/**
 * ===========================================================================================
 * PROJECTS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for projects.
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * Storage:
 * - File-based JSON storage in /data/projects.json
 * - Uses BaseRepository with 'projects' table name
 *
 * Custom Methods:
 * - findNonArchived(): Get all non-archived projects
 * - addWorkspaces(): Add workspace IDs to project
 * - removeWorkspace(): Remove workspace from project
 * - updateTaskCount(): Increment/decrement task count
 *
 * ===========================================================================================
 */

export class ProjectsRepository {
	constructor(private readonly base: BaseRepository<Project>) {}

	/**
	 * Find all projects with optional filters and sorting
	 */
	async findAll(query?: ProjectsListQuery): Promise<Project[]> {
		const qb = this.base.query();

		// Apply archived filter
		if (query?.archived !== undefined) {
			qb.where('archived', '=', query.archived);
		}

		// Apply workspace filter
		if (query?.workspaceId) {
			// Filter projects that contain this workspaceId in their workspaceIds array
			const allProjects = await qb.execute();
			const filtered = allProjects.filter(p => p.workspaceIds?.includes(query.workspaceId!) ?? false);
			return filtered;
		}

		// Apply sorting
		if (query?.sortBy && query?.sortOrder) {
			const order = query.sortOrder.toUpperCase() as 'ASC' | 'DESC';
			qb.orderBy(query.sortBy as keyof Project, order);
		}

		return qb.execute();
	}

	/**
	 * Find all non-archived projects
	 */
	async findNonArchived(): Promise<Project[]> {
		return this.base.query().where('archived', '=', false).execute();
	}

	/**
	 * Find project by ID
	 */
	async findById(id: string): Promise<Project | null> {
		return this.base.findById(id);
	}

	/**
	 * Find projects by name (partial match)
	 */
	async findByName(name: string): Promise<Project[]> {
		return this.base.query().where('name', 'contains', name).execute();
	}

	/**
	 * Create a new project
	 */
	async create(data: Omit<Project, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Project> {
		return this.base.create(data);
	}

	/**
	 * Update an existing project
	 */
	async update(id: string, data: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
		return this.base.update(id, data);
	}

	/**
	 * Delete a project
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}

	/**
	 * Add workspace IDs to a project
	 * @param id Project ID
	 * @param workspaceIds Array of workspace IDs to add
	 */
	async addWorkspaces(id: string, workspaceIds: string[]): Promise<Project> {
		const project = await this.findById(id);
		if (!project) {
			throw new Error(`Project with id ${id} not found`);
		}

		// Merge workspace IDs (avoid duplicates)
		// Handle undefined workspaceIds (legacy data)
		const currentWorkspaceIds = project.workspaceIds ?? [];
		const uniqueWorkspaceIds = Array.from(new Set([...currentWorkspaceIds, ...workspaceIds]));

		const updatedProject = await this.update(id, {
			workspaceIds: uniqueWorkspaceIds,
			version: project.version + 1,
		});

		log.info(`Added workspaces to project ${id}:`, workspaceIds);
		return updatedProject;
	}

	/**
	 * Remove workspace from a project
	 * @param id Project ID
	 * @param workspaceId Workspace ID to remove
	 */
	async removeWorkspace(id: string, workspaceId: string): Promise<Project> {
		const project = await this.findById(id);
		if (!project) {
			throw new Error(`Project with id ${id} not found`);
		}

		// Handle undefined workspaceIds (legacy data)
		const currentWorkspaceIds = project.workspaceIds ?? [];
		const updatedWorkspaceIds = currentWorkspaceIds.filter(wsId => wsId !== workspaceId);

		return this.update(id, {
			workspaceIds: updatedWorkspaceIds,
			version: project.version + 1,
		});
	}

	/**
	 * Update task count for a project
	 * @param id Project ID
	 * @param delta Number to add (positive) or subtract (negative)
	 */
	async updateTaskCount(id: string, delta: number): Promise<Project> {
		const project = await this.findById(id);
		if (!project) {
			throw new Error(`Project with id ${id} not found`);
		}

		const newTaskCount = Math.max(0, project.taskCount + delta);

		return this.update(id, {
			taskCount: newTaskCount,
			version: project.version + 1,
		});
	}

	/**
	 * Get project that contains this workspace
	 * Single source of truth: project.workspaceIds[]
	 * @param workspaceId Workspace ID to search for
	 * @returns Project containing the workspace, or null if not found
	 */
	async getProjectForWorkspace(workspaceId: string): Promise<Project | null> {
		const projects = await this.findAll({});
		return projects.find(p => p.workspaceIds?.includes(workspaceId)) ?? null;
	}
}
