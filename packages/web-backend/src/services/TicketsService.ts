import { createLogger } from 'shared-common/logger';

import type {
	AnalyzeTicket,
	CreateFromPlan,
	CreateFromPlanResponse,
	CreateTicket,
	LabelsResponse,
	ReorderTicket,
	Ticket,
	TicketAnalysisPlan,
	TicketsListResponse,
	TicketsQuery,
	UpdateTicket,
} from '@app/shared/api/tickets.contract';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';
import {
	B2F_TICKETS_UPDATED,
	B2F_TICKET_CREATED,
	B2F_TICKET_DELETED,
	B2F_TICKET_STATUS_CHANGED,
	B2F_TICKET_UPDATED,
} from '@app/shared/transport';

import type { AgentExecutor } from '../providers/AgentExecutor';
import type { TasksRepository } from '../repositories/TasksRepository';
import type { TicketsRepository } from '../repositories/TicketsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

const log = createLogger('TicketsService');

/**
 * ===========================================================================================
 * TICKETS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for tickets data.
 * Responsibilities:
 * - Fetch tickets from backend storage (TicketsRepository)
 * - Support filtering by status, project, parent, label
 * - Calculate order values for new tickets
 * - Auto-create tasks when ticket status changes to 'todo' (if flowId present)
 * - Emit real-time events for ticket state changes
 *
 * Does NOT contain:
 * - HTTP concerns (in controller)
 * - Data fetching/caching (in repository)
 *
 * Event Emission Strategy:
 * - Events are emitted AFTER successful operations
 * - Broadcast failures are logged but don't fail the operation
 * - Type-safe event emission using EventBroadcaster
 *
 * CRUD Operations:
 * - createTicket() → emit 'ticket:created'
 * - updateTicket() → emit 'ticket:updated'
 * - deleteTicket() → emit 'ticket:deleted'
 * - reorderTicket() → emit 'ticket:updated'
 *
 * ===========================================================================================
 */

export class TicketsService {
	constructor(
		private readonly ticketsRepository: TicketsRepository,
		private readonly eventBroadcaster: EventBroadcaster,
		private readonly tasksRepository: TasksRepository,
		private readonly agentExecutor: AgentExecutor
	) {}

	/**
	 * Get tickets list with optional filtering
	 */
	async listTickets(query: TicketsQuery): Promise<TicketsListResponse> {
		try {
			log.info('Fetching tickets list...');
			const items = await this.ticketsRepository.findAll(query);
			log.info(`Received ${items.length} tickets`);

			return {
				items,
			};
		} catch (error) {
			log.error('Failed to fetch tickets list:', error);
			return {
				items: [],
			};
		}
	}

	/**
	 * Get a single ticket by ID
	 */
	async getTicketById(id: string): Promise<Ticket> {
		const ticket = await this.ticketsRepository.findById(id);
		if (!ticket) {
			throw new NotFoundException(`Ticket ${id} not found`, ERROR_CODES.RESOURCE_NOT_FOUND, { ticketId: id });
		}
		return ticket;
	}

	/**
	 * Create a new ticket
	 */
	async createTicket(data: CreateTicket): Promise<Ticket> {
		try {
			// Validate required fields
			if (!data.projectId?.trim()) {
				throw new Error('Project ID is required');
			}
			if (!data.title?.trim()) {
				throw new Error('Title is required');
			}

			// Compute order if not provided
			let order = data.order;
			if (order === undefined) {
				// Get all siblings (same parentId, same projectId)
				const siblings = await this.ticketsRepository.findAll({
					projectId: data.projectId,
					parentId: data.parentId,
				});
				// Calculate max order
				const maxOrder = siblings.reduce((max, ticket) => Math.max(max, ticket.order), 0);
				// Set order = (maxOrder + 1) * 1000
				order = (maxOrder + 1) * 1000;
			}

			// Create ticket
			const ticket = await this.ticketsRepository.create({
				projectId: data.projectId,
				title: data.title,
				description: data.description,
				status: data.status,
				labels: data.labels,
				fields: data.fields,
				parentId: data.parentId,
				flowId: data.flowId,
				taskIds: [],
				order,
			});

			// Emit specific event AFTER successful creation
			this.eventBroadcaster.broadcast(B2F_TICKET_CREATED, ticket);

			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKETS_UPDATED, {} as any);

			return ticket;
		} catch (error) {
			log.error('Failed to create ticket:', error);
			throw error;
		}
	}

	/**
	 * Update an existing ticket
	 * Auto-creates a task if status changes to 'todo' AND ticket has a flowId
	 */
	async updateTicket(id: string, data: UpdateTicket): Promise<Ticket> {
		try {
			// Get current ticket
			const currentTicket = await this.getTicketById(id);

			// Verify version matches (optimistic locking)
			if (data.version !== currentTicket.version) {
				throw new ConflictException(
					'Version conflict: ticket was modified by another user',
					ERROR_CODES.VERSION_MISMATCH,
					{ expectedVersion: data.version, actualVersion: currentTicket.version }
				);
			}

			// Check if status is changing to 'todo' and ticket has a flowId
			const isStatusChangingToTodo = data.status === 'todo' && currentTicket.status !== 'todo';
			const hasFlowId = currentTicket.flowId || data.flowId;

			let updatedTaskIds = currentTicket.taskIds;

			if (isStatusChangingToTodo && hasFlowId) {
				// Auto-create a Task
				const flowId = data.flowId || currentTicket.flowId!;
				log.info(`Auto-creating task for ticket ${id} with flowId ${flowId}`);
				const newTask = await this.tasksRepository.create({
					description: currentTicket.title,
					status: 'todo',
					priority: 'medium',
					assignedWorker: null,
					flowId,
					flowInputs: {},
					projectId: currentTicket.projectId,
					ticketId: id,
				});
				log.info(`Created task ${newTask.id} for ticket ${id}`);

				// Add task ID to ticket's taskIds
				updatedTaskIds = [...currentTicket.taskIds, newTask.id];
			}

			// Update ticket with incremented version
			// Convert null to undefined for optional fields (null means "unset")
			const updatePayload = {
				...data,
				parentId: data.parentId === null ? undefined : data.parentId,
				flowId: data.flowId === null ? undefined : data.flowId,
				taskIds: updatedTaskIds,
				version: currentTicket.version + 1,
			};
			const updatedTicket = await this.ticketsRepository.update(id, updatePayload);

			// Emit specific event AFTER successful update
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKET_UPDATED, { ticketId: id } as any);

			// If status changed, emit status change event
			if (data.status && data.status !== currentTicket.status) {
				this.eventBroadcaster.broadcast(B2F_TICKET_STATUS_CHANGED, {
					ticketId: id,
					oldStatus: currentTicket.status,
					newStatus: data.status,
				} as any);
			}

			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKETS_UPDATED, {} as any);

			return updatedTicket;
		} catch (error) {
			log.error('Failed to update ticket:', error);
			throw error;
		}
	}

	/**
	 * Delete a ticket
	 */
	async deleteTicket(id: string): Promise<{ success: boolean; id: string }> {
		try {
			await this.ticketsRepository.delete(id);

			// Emit specific event AFTER successful deletion
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKET_DELETED, { id } as any);

			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKETS_UPDATED, {} as any);

			return { success: true, id };
		} catch (error) {
			log.error('Failed to delete ticket:', error);
			throw error;
		}
	}

	/**
	 * Reorder a ticket (update order field)
	 */
	async reorderTicket(id: string, data: ReorderTicket): Promise<Ticket> {
		try {
			// Get current ticket
			const currentTicket = await this.getTicketById(id);

			// Verify version matches (optimistic locking)
			if (data.version !== currentTicket.version) {
				throw new ConflictException(
					'Version conflict: ticket was modified by another user',
					ERROR_CODES.VERSION_MISMATCH,
					{ expectedVersion: data.version, actualVersion: currentTicket.version }
				);
			}

			// Update order with incremented version
			const updatedTicket = await this.ticketsRepository.update(id, {
				order: data.order,
				version: currentTicket.version + 1,
			});

			// Emit specific event AFTER successful update
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKET_UPDATED, { ticketId: id } as any);

			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKETS_UPDATED, {} as any);

			return updatedTicket;
		} catch (error) {
			log.error('Failed to reorder ticket:', error);
			throw error;
		}
	}

	/**
	 * Search labels within a project
	 */
	async searchLabels(projectId: string, query?: string): Promise<LabelsResponse> {
		try {
			const labels = await this.ticketsRepository.searchLabels(projectId, query);
			return { labels };
		} catch (error) {
			log.error('Failed to search labels:', error);
			return { labels: [] };
		}
	}

	/**
	 * Analyze ticket description using AI
	 */
	async analyzeTicket(data: AnalyzeTicket): Promise<TicketAnalysisPlan> {
		return this.agentExecutor.analyzeTicketDescription({
			description: data.description,
			projectId: data.projectId,
			clarificationAnswers: data.clarificationAnswers,
			context: {
				existingLabels: (await this.searchLabels(data.projectId)).labels,
			},
		});
	}

	/**
	 * Create tickets from an AI-generated plan
	 */
	async createFromPlan(data: CreateFromPlan): Promise<CreateFromPlanResponse> {
		const { plan, projectId } = data;

		// Create parent ticket
		const parentTicket = await this.createTicket({
			projectId,
			title: plan.title,
			description: plan.analysis,
			labels: plan.labels,
			fields: plan.fields,
			status: 'backlog',
		});

		const subTickets: Ticket[] = [];
		const createdFlowIds: string[] = [];
		const flowValidationWarnings: Array<{ subTicketTitle: string; errors: string[] }> = [];

		for (const subTicketPlan of plan.subTickets) {
			const subTicket = await this.createTicket({
				projectId,
				title: subTicketPlan.title,
				description: subTicketPlan.description,
				status: 'backlog',
				parentId: parentTicket.id,
				labels: plan.labels,
				fields: {},
			});
			subTickets.push(subTicket);
			// Note: flowYaml validation and appending to flows-custom.yml is deferred (Step 4)
			flowValidationWarnings.push({
				subTicketTitle: subTicketPlan.title,
				errors: ['Flow YAML validation deferred'],
			});
		}

		return { parentTicket, subTickets, createdFlowIds, flowValidationWarnings };
	}
}
