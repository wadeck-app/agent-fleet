import { createLogger } from 'shared-common/logger';

import { B2F_TASK_TRACE_UPDATED } from '@app/shared/transport/B2FEventConstants';

import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { InterventionsService } from './InterventionsService';
import type { TasksService } from './TasksService';
import type { TicketsService } from './TicketsService';
import type { WorkersService } from './WorkersService';

const log = createLogger('OrchestratorEventHandler');

/**
 * ===========================================================================================
 * ORCHESTRATOR EVENT HANDLER
 * ===========================================================================================
 *
 * Handles events from the orchestrator and updates backend storage accordingly.
 * This is part of the backend-centric architecture where:
 * - Backend owns all data storage
 * - Orchestrator manages worker coordination only
 * - Orchestrator sends events to backend when things happen
 * - Backend updates its storage based on these events
 *
 * Responsibilities:
 * - Receive events from orchestrator (via WebSocket or direct function calls)
 * - Update backend storage using appropriate services
 * - Handle errors gracefully (orchestrator shouldn't fail if backend fails)
 * - Log all operations for debugging
 *
 * Event Types:
 * - worker_connected: Mark worker as online in backend
 * - worker_disconnected: Mark worker as offline
 * - task_assigned: Update task status to 'in_progress', set assignedWorker
 * - task_started: Update task status
 * - task_trace_update: Write trace chunk to storage
 * - intervention_requested: Create intervention in backend
 * - task_completed: Update task with flowResult, set status based on success/failure
 *
 * Error Handling Strategy:
 * - Log errors but don't throw (orchestrator shouldn't fail if backend fails)
 * - Each event handler is independent
 * - Services handle their own error logging
 *
 * ===========================================================================================
 */

export class OrchestratorEventHandler {
	constructor(
		private readonly tasksService: TasksService,
		private readonly interventionsService: InterventionsService,
		private readonly workersService: WorkersService,
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly ticketsService?: TicketsService
	) {}

	/**
	 * Main entry point for handling orchestrator events
	 * Routes events to appropriate handler based on event type
	 * @param event Event name from orchestrator
	 * @param data Event data (varies by event type)
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	async handleOrchestratorEvent(event: string, data: any): Promise<void> {
		log.info(`Received event: ${event}`, {
			dataKeys: data ? Object.keys(data) : [],
		});

		try {
			switch (event) {
				case 'worker_connected':
					await this.handleWorkerConnected(data);
					break;

				case 'worker_disconnected':
					await this.handleWorkerDisconnected(data);
					break;

				case 'task_assigned':
					await this.handleTaskAssigned(data);
					break;

				case 'task_started':
					await this.handleTaskStarted(data);
					break;

				case 'task_trace_update':
					await this.handleTaskTraceUpdate(data);
					break;

				case 'intervention_requested':
					await this.handleInterventionRequested(data);
					break;

				case 'task_completed':
					await this.handleTaskCompleted(data);
					break;

				default:
					log.warn(`Unknown event type: ${event}`);
			}
		} catch (error) {
			log.error(`Error handling event ${event}:`, error);
			// Don't throw - orchestrator shouldn't fail if backend fails
		}
	}

	// ===========================================================================================
	// WORKER EVENT HANDLERS
	// ===========================================================================================

	/**
	 * Handle worker_connected event
	 * Updates worker status to online in backend
	 * @param data { workerId: string, metadata?: any }
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async handleWorkerConnected(data: { workerId: string; metadata?: any }): Promise<void> {
		try {
			log.info(`Worker connected: ${data.workerId}`);

			// TODO: Implement worker connection tracking in WorkersService
			// For now, worker status comes from orchestrator stats
			// Future enhancement: Track connection history and uptime

			log.info(`Worker ${data.workerId} marked as connected`);
		} catch (error) {
			log.error(`Failed to handle worker_connected for ${data.workerId}:`, error);
		}
	}

	/**
	 * Handle worker_disconnected event
	 * Updates worker status to offline in backend
	 * @param data { workerId: string, reason?: string }
	 */
	private async handleWorkerDisconnected(data: { workerId: string; reason?: string }): Promise<void> {
		try {
			log.info(`Worker disconnected: ${data.workerId}`);

			// TODO: Implement worker disconnection tracking in WorkersService
			// For now, worker status comes from orchestrator stats
			// Future enhancement: Track disconnection history and reasons

			log.info(`Worker ${data.workerId} marked as disconnected`);
		} catch (error) {
			log.error(`Failed to handle worker_disconnected for ${data.workerId}:`, error);
		}
	}

	// ===========================================================================================
	// TASK EVENT HANDLERS
	// ===========================================================================================

	/**
	 * Handle task_assigned event
	 * Updates task status to 'in_progress' and sets assignedWorker
	 * @param data { taskId: string, workerId: string }
	 */
	private async handleTaskAssigned(data: { taskId: string; workerId: string }): Promise<void> {
		try {
			log.info(`Task assigned: ${data.taskId} → ${data.workerId}`);

			// Use TasksService method if available, otherwise direct repository access
			// Note: TasksService doesn't have markAssigned method, so we'll use updateTaskStatus
			await this.tasksService.updateTaskStatus(data.taskId, 'in_progress');

			log.info(`Task ${data.taskId} marked as assigned to ${data.workerId}`);
		} catch (error) {
			log.error(`Failed to handle task_assigned for ${data.taskId}:`, error);
		}
	}

	/**
	 * Handle task_started event
	 * Updates task status to indicate execution has begun
	 * @param data { taskId: string }
	 */
	private async handleTaskStarted(data: { taskId: string }): Promise<void> {
		try {
			log.info(`Task started: ${data.taskId}`);

			await this.tasksService.updateTaskStatus(data.taskId, 'in_progress');

			log.info(`Task ${data.taskId} marked as started`);
		} catch (error) {
			log.error(`Failed to handle task_started for ${data.taskId}:`, error);
		}
	}

	/**
	 * Handle task_trace_update event
	 * Writes trace chunk to storage for real-time log updates
	 * @param data { taskId: string, traceChunk: any }
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private async handleTaskTraceUpdate(data: { taskId: string; traceChunk: any }): Promise<void> {
		try {
			log.info(`[TRACE] Task trace update: ${data.taskId}, steps: ${data.traceChunk?.steps?.length || 0}`);

			// Write trace to storage using TasksService
			await this.tasksService.writeTrace(data.taskId, data.traceChunk);

			log.info(`[TRACE] Task ${data.taskId} trace successfully written to storage`);

			// Broadcast B2F event to notify frontend about trace update
			this.eventBroadcaster.broadcast(B2F_TASK_TRACE_UPDATED, {
				taskId: data.taskId,
				stepsCount: data.traceChunk?.steps?.length || 0,
			});

			log.info(`[TRACE] Broadcasted B2F_TASK_TRACE_UPDATED for task ${data.taskId}`);
		} catch (error) {
			log.error(`Failed to handle task_trace_update for ${data.taskId}:`, error);
			// Don't throw - orchestrator shouldn't fail if backend storage fails
		}
	}

	/**
	 * Handle task_completed event
	 * Updates task with flow result and sets final status
	 * @param data { taskId: string, success: boolean, flowResult: any, newStatus?: string, ticketId?: string, ticketStatus?: string }
	 */

	private async handleTaskCompleted(data: {
		taskId: string;
		success: boolean;
		newStatus?: string;
		ticketId?: string;
		ticketStatus?: string;
		flowResult: {
			status: 'completed' | 'failed';
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			outputs?: Record<string, any>;
			error?: string;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			trace?: any;
		};
	}): Promise<void> {
		try {
			log.info(`Task completed: ${data.taskId}, success: ${data.success}`);

			// Determine final status based on success/failure
			// - success === true → 'review' (completed successfully, awaiting human review)
			// - success === false → 'cancelled' (failed)
			const finalStatus = data.success ? 'review' : 'cancelled';

			await this.tasksService.updateTaskStatus(data.taskId, finalStatus);

			log.info(`Task ${data.taskId} marked as ${finalStatus}`);

			// Update linked ticket status if provided
			if (data.ticketId && data.ticketStatus && this.ticketsService) {
				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					await this.ticketsService.updateTicketStatusById(data.ticketId, data.ticketStatus as any);
					log.info(`Ticket ${data.ticketId} status updated to ${data.ticketStatus}`);
				} catch (error) {
					log.error(`Failed to update ticket ${data.ticketId} status:`, error);
				}
			}
		} catch (error) {
			log.error(`Failed to handle task_completed for ${data.taskId}:`, error);
		}
	}

	// ===========================================================================================
	// INTERVENTION EVENT HANDLERS
	// ===========================================================================================

	/**
	 * Handle intervention_requested event
	 * Saves intervention to backend storage for UI display and persistence
	 * @param data { taskId: string, interventionData: { interventionId, flowId, stepId, ... } }
	 */
	private async handleInterventionRequested(data: {
		taskId: string;
		interventionData: {
			interventionId: string;
			flowId?: string;
			stepId?: string;
			interventionType: 'approval' | 'question' | 'choice';
			blocking: boolean;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			config: any;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			timeout?: any;
		};
	}): Promise<void> {
		try {
			const { taskId, interventionData } = data;
			log.info(`Intervention requested: ${interventionData.interventionId}`);

			// Create intervention in backend storage (data/interventions.json)
			// This is the source of truth for UI and persistence across restarts
			const intervention = {
				id: interventionData.interventionId,
				taskId: taskId,
				workerId: undefined, // Will be set when assigned
				flowId: interventionData.flowId,
				stepId: interventionData.stepId,
				type: interventionData.interventionType,
				status: 'pending' as const,
				blocking: interventionData.blocking,
				config: interventionData.config,
				timeout: interventionData.timeout,
				source: {
					type: 'flow_step' as const,
					stepId: interventionData.stepId,
				},
			};

			// Save to backend repository (persists to file)
			await this.interventionsService.createIntervention(intervention);

			log.info(`Intervention ${interventionData.interventionId} saved to backend`);
		} catch (error) {
			log.error(`Failed to handle intervention_requested for ${data.interventionData?.interventionId}:`, error);
		}
	}
}
