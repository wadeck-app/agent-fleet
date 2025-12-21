import { Logger } from 'shared-common/Logger.js';
import { MetricsData, StateManager } from 'shared-common/StateManager.js';
import { Task, TaskStatus } from 'shared-common/types.js';

import { TaskManager } from '../core/TaskManager.js';
import { WorkerWebSocketServer } from '../websocket/WorkerWebSocketServer.js';

/**
 * Metrics Collector Service
 *
 * Purpose:
 * - Periodically collect orchestrator metrics
 * - Emit metrics to StateManager for UI consumption
 * - Calculate task throughput, worker utilization, etc.
 *
 * Usage:
 * - Start collection on orchestrator startup
 * - Stop collection on orchestrator shutdown
 * - Metrics are emitted via StateManager.METRICS_UPDATED event
 */
export class MetricsCollector {
	private taskManager: TaskManager;
	private wsServer: WorkerWebSocketServer;
	private stateManager: StateManager;
	private interval: NodeJS.Timeout | null = null;
	private collectIntervalMs: number;
	private isRunning: boolean = false;

	constructor(
		taskManager: TaskManager,
		wsServer: WorkerWebSocketServer,
		stateManager: StateManager,
		collectIntervalMs: number = 5000 // 5 seconds default
	) {
		this.taskManager = taskManager;
		this.wsServer = wsServer;
		this.stateManager = stateManager;
		this.collectIntervalMs = collectIntervalMs;
	}

	/**
	 * Start collecting metrics periodically
	 */
	start(): void {
		if (this.isRunning) {
			Logger.logStructured('warn', 'MetricsCollector', 'Already running, ignoring start()');
			return;
		}

		this.isRunning = true;

		// Collect immediately on start
		this.collectAndEmit();

		// Then collect periodically
		this.interval = setInterval(() => {
			this.collectAndEmit();
		}, this.collectIntervalMs);

		Logger.logStructured(
			'info',
			'MetricsCollector',
			`Started collecting metrics every ${this.collectIntervalMs}ms`
		);
	}

	/**
	 * Stop collecting metrics
	 */
	stop(): void {
		if (!this.isRunning) {
			return;
		}

		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}

		this.isRunning = false;

		Logger.logStructured('info', 'MetricsCollector', 'Stopped collecting metrics');
	}

	/**
	 * Collect metrics once and emit to StateManager
	 */
	collectAndEmit(): void {
		try {
			const metrics = this.collectMetrics();
			this.stateManager.emitMetricsUpdated(metrics);

			Logger.logStructured(
				'debug',
				'MetricsCollector',
				`Metrics collected: ${metrics.taskThroughput.total} tasks, ${metrics.workerUtilization.total} workers`,
				{
					tasks: metrics.taskThroughput.total,
					workers: metrics.workerUtilization.total,
				}
			);
		} catch (error) {
			Logger.logStructured(
				'error',
				'MetricsCollector',
				`Failed to collect metrics: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/**
	 * Collect current metrics snapshot
	 */
	private collectMetrics(): MetricsData {
		const tasks = this.taskManager.getAllTasks();
		const workers = this.wsServer.getWorkers();

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
		const avgDuration = this.calculateAverageTaskDuration(tasks);

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
			averageTaskDuration: avgDuration,
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Calculate average duration for completed tasks
	 */
	private calculateAverageTaskDuration(tasks: Task[]): number {
		let totalDuration = 0;
		let count = 0;

		for (const task of tasks) {
			if (task.status === TaskStatus.MERGED || task.status === TaskStatus.APPROVED) {
				const created = new Date(task.createdAt).getTime();
				const updated = new Date(task.updatedAt).getTime();
				totalDuration += updated - created;
				count++;
			}
		}

		return count > 0 ? totalDuration / count : 0;
	}

	/**
	 * Change collection interval (will apply on next cycle)
	 */
	setCollectInterval(intervalMs: number): void {
		this.collectIntervalMs = intervalMs;

		if (this.isRunning) {
			// Restart with new interval
			this.stop();
			this.start();
		}

		Logger.logStructured('info', 'MetricsCollector', `Collection interval changed to ${intervalMs}ms`);
	}

	/**
	 * Check if collector is running
	 */
	isCollecting(): boolean {
		return this.isRunning;
	}
}
