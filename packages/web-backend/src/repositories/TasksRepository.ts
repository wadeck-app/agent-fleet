import type { Task, TasksQuery } from '@app/shared/api/tasks.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * TASKS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for tasks.
 * Uses BaseRepository's query builder to compose domain queries.
 *
 * Storage:
 * - File-based JSON storage in /data/tasks.json
 * - Uses BaseRepository with 'tasks' table name
 *
 * Custom Methods:
 * - findByStatus(): Get tasks by status
 * - findByWorker(): Get tasks assigned to a worker
 * - findByProject(): Get tasks for a project
 * - markAssigned(): Update task assignment
 * - markStarted(): Mark task as in progress
 * - markCompleted(): Mark task as completed
 * - updateFlowResult(): Update flow execution result
 *
 * ===========================================================================================
 */

export class TasksRepository {
	constructor(private readonly base: BaseRepository<Task>) {}

	/**
	 * Find all tasks with optional filters
	 */
	async findAll(query?: TasksQuery): Promise<Task[]> {
		const qb = this.base.query();

		// Apply status filter
		if (query?.status) {
			qb.where('status', '=', query.status);
		}

		// Apply worker filter (exact match on workerId)
		if (query?.workerId) {
			const allTasks = await qb.execute();
			return allTasks.filter(t => t.assignedWorker?.workerId === query.workerId);
		}

		// Apply priority filter
		if (query?.priority) {
			qb.where('priority', '=', query.priority);
		}

		// Apply flowId filter
		if (query?.flowId) {
			qb.where('flowId', '=', query.flowId);
		}

		// Apply projectId filter
		if (query?.projectId) {
			qb.where('projectId', '=', query.projectId);
		}

		// Apply workspaceId filter
		if (query?.workspaceId) {
			qb.where('workspaceId', '=', query.workspaceId);
		}

		// Default ordering by createdAt descending
		qb.orderBy('createdAt', 'DESC');

		return qb.execute();
	}

	/**
	 * Find tasks by status
	 */
	async findByStatus(status: string): Promise<Task[]> {
		return this.base
			.query()
			.where('status', '=', status as any)
			.orderBy('createdAt', 'DESC')
			.execute();
	}

	/**
	 * Find tasks assigned to a specific worker
	 */
	async findByWorker(workerId: string): Promise<Task[]> {
		const allTasks = await this.base.findAll();
		return allTasks.filter(t => t.assignedWorker?.workerId === workerId);
	}

	/**
	 * Find tasks for a specific project
	 */
	async findByProject(projectId: string): Promise<Task[]> {
		return this.base.query().where('projectId', '=', projectId).orderBy('createdAt', 'DESC').execute();
	}

	/**
	 * Find task by ID
	 */
	async findById(id: string): Promise<Task | null> {
		return this.base.findById(id);
	}

	/**
	 * Create a new task
	 */
	async create(data: Omit<Task, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<Task> {
		return this.base.create(data);
	}

	/**
	 * Update an existing task
	 */
	async update(id: string, data: Partial<Omit<Task, 'id' | 'createdAt'>>): Promise<Task> {
		return this.base.update(id, data);
	}

	/**
	 * Delete a task
	 */
	async delete(id: string): Promise<void> {
		return this.base.delete(id);
	}

	/**
	 * Mark task as assigned to a worker
	 */
	async markAssigned(id: string, workerId: string): Promise<Task> {
		const task = await this.findById(id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}

		return this.update(id, {
			status: 'in_progress',
			assignedWorker: { workerId },
			version: task.version + 1,
		});
	}

	/**
	 * Mark task as started (update status to in_progress)
	 */
	async markStarted(id: string): Promise<Task> {
		const task = await this.findById(id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}

		return this.update(id, {
			status: 'in_progress',
			version: task.version + 1,
		});
	}

	/**
	 * Mark task as completed with flow result
	 */
	async markCompleted(
		id: string,
		flowResult: {
			status: 'completed' | 'failed';
			outputs?: Record<string, any>;
			error?: string;
			trace?: any;
		}
	): Promise<Task> {
		const task = await this.findById(id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}

		const status = flowResult.status === 'completed' ? 'review' : 'cancelled';

		return this.update(id, {
			status,
			flowResult,
			version: task.version + 1,
		});
	}

	/**
	 * Update flow result for a task
	 */
	async updateFlowResult(
		id: string,
		flowResult: {
			status: 'completed' | 'failed';
			outputs?: Record<string, any>;
			error?: string;
			trace?: any;
		}
	): Promise<Task> {
		const task = await this.findById(id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}

		return this.update(id, {
			flowResult,
			version: task.version + 1,
		});
	}

	/**
	 * Update task status
	 */
	async updateStatus(id: string, status: string): Promise<Task> {
		const task = await this.findById(id);
		if (!task) {
			throw new Error(`Task with id ${id} not found`);
		}

		return this.update(id, {
			status: status as any,
			version: task.version + 1,
		});
	}
}
