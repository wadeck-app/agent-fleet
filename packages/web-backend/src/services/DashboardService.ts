import type { DashboardData, ActivityEntry } from '@app/shared';
import { InternalServerErrorException, ERROR_CODES } from '@app/shared';
import type { OrchestratorRepository } from '../repositories/OrchestratorRepository';

/**
 * ===========================================================================================
 * DASHBOARD SERVICE
 * ===========================================================================================
 *
 * Business logic layer for dashboard data.
 * Responsibilities:
 * - Transform orchestrator stats into dashboard DTO
 * - Aggregate task statuses into meaningful categories
 * - Calculate worker states (idle vs busy)
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (in repository)
 *
 * ===========================================================================================
 */

export class DashboardService {
	constructor(private readonly orchestratorRepository: OrchestratorRepository) {}

	/**
	 * Get dashboard data (transformed from orchestrator stats)
	 */
	async getDashboardData(): Promise<DashboardData> {
		try {
			console.log('[DashboardService] Fetching stats from orchestrator...');
			const stats = await this.orchestratorRepository.getStats();
			console.log('[DashboardService] Stats received:', { workers: stats.workers, uptime: stats.uptime });

			// Calculate worker states
			const idle = stats.workersList.filter(w => !w.taskId).length;
			const busy = stats.workersList.filter(w => w.taskId).length;

			// Aggregate task statuses
			const active = this.sumStatuses(stats.tasks.byStatus, ['IN_PROGRESS', 'TESTING']);
			const review = this.sumStatuses(stats.tasks.byStatus, ['REVIEW']);
			const done = this.sumStatuses(stats.tasks.byStatus, ['APPROVED', 'MERGED']);
			const blocked = this.sumStatuses(stats.tasks.byStatus, ['BLOCKED']);
			const failed = this.sumStatuses(stats.tasks.byStatus, ['CANCELLED']);

			// Calculate throughput metrics (MVP: simple estimations)
			const throughput = this.calculateThroughput(stats, done, failed);

			// Generate recent activity from current state
			const recentActivity = this.generateRecentActivity(stats);

			// Build dashboard DTO
			const dashboardData: DashboardData = {
				timestamp: new Date().toISOString(),
				orchestrator: {
					status: 'ready', // Hardcoded for MVP
					uptime: stats.uptime, // From orchestrator
					version: '1.0.0', // Hardcoded for MVP
				},
				workers: {
					connected: stats.workers,
					idle,
					busy,
				},
				tasks: {
					total: stats.tasks.total,
					active,
					review,
					done,
					blocked,
					failed,
				},
				throughput,
				recentActivity,
			};

			return dashboardData;
		} catch (error) {
			// Orchestrator is offline - return dashboard with offline status
			console.error('[DashboardService] Failed to fetch orchestrator stats:', error);
			return {
				timestamp: new Date().toISOString(),
				orchestrator: {
					status: 'offline',
					uptime: 0,
					version: 'N/A',
				},
				workers: {
					connected: 0,
					idle: 0,
					busy: 0,
				},
				tasks: {
					total: 0,
					active: 0,
					review: 0,
					done: 0,
					blocked: 0,
					failed: 0,
				},
				throughput: {
					tasksPerHour: 0,
					successRate: 0,
					avgTaskDuration: 0,
				},
				recentActivity: [],
			};
		}
	}

	/**
	 * Calculate throughput metrics
	 * MVP: Simple estimations based on current uptime
	 * TODO: Replace with actual historical tracking
	 */
	private calculateThroughput(
		stats: any,
		done: number,
		failed: number
	): { tasksPerHour: number; successRate: number; avgTaskDuration: number } {
		const uptimeHours = stats.uptime / (1000 * 60 * 60);
		const completed = done + failed;

		// Tasks per hour (based on total uptime)
		const tasksPerHour = uptimeHours > 0 ? Math.round((completed / uptimeHours) * 10) / 10 : 0;

		// Success rate
		const successRate = completed > 0 ? Math.round((done / completed) * 100) : 100;

		// Average task duration (MVP: estimate based on typical flow times)
		// TODO: Track actual task start/end times
		const avgTaskDuration = 3 * 60 * 1000 + 42 * 1000; // 3m 42s in milliseconds

		return {
			tasksPerHour,
			successRate,
			avgTaskDuration,
		};
	}

	/**
	 * Generate recent activity from current orchestrator state
	 * MVP: Generates synthetic activity based on worker states
	 * TODO: Replace with actual event tracking/history
	 */
	private generateRecentActivity(stats: any): ActivityEntry[] {
		const activities: ActivityEntry[] = [];
		const now = new Date();

		// Generate activity for busy workers (tasks in progress)
		stats.workersList
			.filter((w: any) => w.taskId)
			.slice(0, 3)
			.forEach((worker: any, index: number) => {
				const timestamp = new Date(now.getTime() - (index + 1) * 60 * 1000); // Stagger by minutes
				activities.push({
					timestamp: timestamp.toISOString(),
					type: 'task_started',
					message: `Started task (${worker.type})`,
					taskId: worker.taskId,
					workerId: worker.id,
				});
			});

		// Add a sample completed task
		if (activities.length < 5) {
			const timestamp = new Date(now.getTime() - 5 * 60 * 1000);
			activities.push({
				timestamp: timestamp.toISOString(),
				type: 'task_completed',
				message: 'Completed flow execution',
				taskId: 'task-sample',
				workerId: stats.workersList[0]?.id,
			});
		}

		// Add worker connection events
		stats.workersList
			.slice(0, 2)
			.forEach((worker: any, index: number) => {
				const timestamp = new Date(now.getTime() - (10 + index) * 60 * 1000);
				activities.push({
					timestamp: timestamp.toISOString(),
					type: 'worker_connected',
					message: `Worker connected (${worker.type})`,
					workerId: worker.id,
				});
			});

		// Sort by timestamp descending and limit to 10
		return activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 10);
	}

	/**
	 * Helper: Sum counts for multiple statuses
	 * @param byStatus - Record of status counts
	 * @param statuses - Array of status keys to sum
	 */
	private sumStatuses(byStatus: Record<string, number>, statuses: string[]): number {
		return statuses.reduce((sum, status) => sum + (byStatus[status] || 0), 0);
	}
}
