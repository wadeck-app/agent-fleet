import type { MetricsData } from 'shared-orch-worker/StateManager';
import type { Task } from 'shared-orch-worker/domain-types';
import { TaskStatus } from 'shared-orch-worker/domain-types';

import type { TaskManager } from '../core/TaskManager';
import type { OrchestratorSnapshot } from '../ui-client/types';
import type { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer';

/**
 * Service to capture and provide snapshots of the orchestrator state
 *
 * Purpose:
 * - Provide full state to new UI connections
 * - Allow on-demand state queries from UI
 * - Calculate aggregated statistics and metrics
 *
 * Usage:
 * - Called when a new UI connects (get initial state)
 * - Called on UI_REQUEST_SNAPSHOT command
 */
export class StateSnapshotService {
	private taskManager: TaskManager;
	private wsServer: WorkerWebSocketServer;
	private startTime: Date;
	private version: string;

	constructor(taskManager: TaskManager, wsServer: WorkerWebSocketServer) {
		this.taskManager = taskManager;
		this.wsServer = wsServer;
		this.startTime = new Date();
		this.version = process.env.npm_package_version || '0.0.0';
	}

	/**
	 * Get a complete snapshot of the current orchestrator state
	 */
	getSnapshot(): OrchestratorSnapshot {
		const tasks = this.taskManager.getAllTasks();
		const workers = this.wsServer.getWorkers();
		const stats = this.taskManager.getStats();

		return {
			timestamp: new Date().toISOString(),
			orchestrator: {
				status: 'ready',
				uptime: Date.now() - this.startTime.getTime(),
				version: this.version,
			},
			tasks: {
				all: tasks,
				byStatus: stats.byStatus,
				total: stats.total,
			},
			workers: {
				all: workers,
				connected: workers.length,
				idle: workers.filter(w => !w.taskId).length,
				busy: workers.filter(w => w.taskId).length,
			},
			metrics: this.calculateMetrics(tasks, workers),
		};
	}

	/**
	 * Calculate metrics from current tasks and workers
	 */
	private calculateMetrics(tasks: Task[], workers: any[]): MetricsData {
		// Task throughput
		const completed = tasks.filter(t => t.status === TaskStatus.MERGED || t.status === TaskStatus.APPROVED).length;

		const failed = tasks.filter(t => t.status === TaskStatus.BLOCKED || t.status === TaskStatus.CANCELLED).length;

		const inProgress = tasks.filter(
			t =>
				t.status === TaskStatus.IN_PROGRESS ||
				t.status === TaskStatus.TESTING ||
				t.status === TaskStatus.REVIEWING
		).length;

		// Worker utilization
		const idle = workers.filter(w => !w.taskId).length;
		const busy = workers.filter(w => w.taskId).length;

		// Average task duration (only for completed tasks)
		let totalDuration = 0;
		let durationCount = 0;

		for (const task of tasks) {
			if (task.status === TaskStatus.MERGED || task.status === TaskStatus.APPROVED) {
				const created = new Date(task.createdAt).getTime();
				const updated = new Date(task.updatedAt).getTime();
				totalDuration += updated - created;
				durationCount++;
			}
		}

		return {
			taskThroughput: {
				total: tasks.length,
				completed,
				failed,
				inProgress,
			},
			workerUtilization: {
				idle,
				busy,
				total: workers.length,
			},
			averageTaskDuration: durationCount > 0 ? totalDuration / durationCount : 0,
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Update start time (useful if orchestrator restarts)
	 */
	updateStartTime(startTime: Date): void {
		this.startTime = startTime;
	}

	/**
	 * Get uptime in milliseconds
	 */
	getUptime(): number {
		return Date.now() - this.startTime.getTime();
	}
}
