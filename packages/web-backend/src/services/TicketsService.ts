import { createLogger } from 'shared-common/logger';
import type { TicketStatus } from 'shared-orch-worker/domain-types';

import type {
	AnalyzeTicket,
	CreateFromPlan,
	CreateFromPlanResponse,
	CreateTicket,
	CreateTicketComment,
	LabelsResponse,
	ReorderTicket,
	Ticket,
	TicketAnalysisPlan,
	TicketComment,
	TicketCommentsResponse,
	TicketHistoryResponse,
	TicketsListResponse,
	TicketsQuery,
	UpdateTicket,
} from '@app/shared/api/tickets.contract';
import { ConflictException, ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';
import {
	B2F_TICKETS_UPDATED,
	B2F_TICKET_COMMENT_ADDED,
	B2F_TICKET_CREATED,
	B2F_TICKET_DELETED,
	B2F_TICKET_STATUS_CHANGED,
	B2F_TICKET_UPDATED,
} from '@app/shared/transport';

import type { EventBus } from '../events/EventBus';
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
		private readonly agentExecutor: AgentExecutor,
		private readonly eventBus?: EventBus
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

			// Record creation in history
			await this.ticketsRepository.addHistoryEntry(ticket.id, 'ticket.created', {
				title: ticket.title,
				description: ticket.description,
				status: ticket.status,
				labels: ticket.labels,
			});

			// Emit specific event AFTER successful creation
			this.eventBroadcaster.broadcast(B2F_TICKET_CREATED, ticket);

			// Emit aggregate event for dashboard updates
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			this.eventBroadcaster.broadcast(B2F_TICKETS_UPDATED, {} as any);

			// Emit internal event for worker flow triggers
			this.eventBus?.emit('ticket.created', {
				ticketId: ticket.id,
				projectId: ticket.projectId,
				title: ticket.title,
				description: ticket.description,
			});

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

			// Determine which fields changed
			const changedFields: string[] = [];
			for (const key of Object.keys(data) as Array<keyof typeof data>) {
				if (key === 'version') continue;
				if (JSON.stringify(data[key]) !== JSON.stringify(currentTicket[key as keyof typeof currentTicket])) {
					changedFields.push(key);
				}
			}

			// Record field changes in history and emit events
			if (changedFields.length > 0) {
				// Build before/after snapshot for changed fields only (excluding version, taskIds)
				const changes: Record<string, { from: unknown; to: unknown }> = {};
				for (const field of changedFields) {
					if (field === 'taskIds') continue;
					changes[field] = {
						from: currentTicket[field as keyof typeof currentTicket],
						to: updatedTicket[field as keyof typeof updatedTicket],
					};
				}
				await this.ticketsRepository.addHistoryEntry(id, 'ticket.updated', { changes });

				this.eventBus?.emit('ticket.updated', {
					ticketId: id,
					projectId: updatedTicket.projectId,
					title: updatedTicket.title,
					changedFields,
				});
			}

			// If status changed, emit status change events
			if (data.status && data.status !== currentTicket.status) {
				this.eventBroadcaster.broadcast(B2F_TICKET_STATUS_CHANGED, {
					ticketId: id,
					oldStatus: currentTicket.status,
					newStatus: data.status,
				} as any);

				// Emit internal event for backend-to-backend routing (legacy)
				this.eventBus?.emit('ticket.status.changed', {
					ticketId: id,
					projectId: updatedTicket.projectId,
					oldStatus: currentTicket.status,
					newStatus: data.status,
				});

				// Emit semantic transition event for flow triggers
				this.eventBus?.emit('ticket.transitioned', {
					ticketId: id,
					projectId: updatedTicket.projectId,
					title: updatedTicket.title,
					oldStatus: currentTicket.status,
					newStatus: data.status,
				});

				// Record status transition as a dedicated history entry
				await this.ticketsRepository.addHistoryEntry(id, 'ticket.transitioned', {
					from: currentTicket.status,
					to: data.status,
				});
			}

			// Emit granular label events when labels changed
			if (changedFields.includes('labels') && data.labels) {
				const oldLabels: string[] = currentTicket.labels ?? [];
				const newLabels: string[] = data.labels;
				const addedLabels = newLabels.filter(l => !oldLabels.includes(l));
				const removedLabels = oldLabels.filter(l => !newLabels.includes(l));
				for (const label of addedLabels) {
					this.eventBus?.emit('ticket.label.added', {
						ticketId: id,
						projectId: updatedTicket.projectId,
						label,
					});
				}
				for (const label of removedLabels) {
					this.eventBus?.emit('ticket.label.removed', {
						ticketId: id,
						projectId: updatedTicket.projectId,
						label,
					});
				}
			}

			// Emit granular field events when custom fields changed
			if (changedFields.includes('fields') && data.fields) {
				const oldFields: Record<string, string> = currentTicket.fields ?? {};
				const newFields: Record<string, string> = data.fields;
				const allKeys = new Set([...Object.keys(oldFields), ...Object.keys(newFields)]);
				for (const key of allKeys) {
					const existed = key in oldFields;
					const exists = key in newFields;
					if (!existed && exists) {
						this.eventBus?.emit('ticket.field.created', {
							ticketId: id,
							projectId: updatedTicket.projectId,
							key,
							value: newFields[key],
						});
					} else if (existed && !exists) {
						this.eventBus?.emit('ticket.field.deleted', {
							ticketId: id,
							projectId: updatedTicket.projectId,
							key,
							oldValue: oldFields[key],
						});
					} else if (existed && exists && oldFields[key] !== newFields[key]) {
						this.eventBus?.emit('ticket.field.updated', {
							ticketId: id,
							projectId: updatedTicket.projectId,
							key,
							oldValue: oldFields[key],
							newValue: newFields[key],
						});
					}
				}
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
		const { plan, projectId, originalDescription } = data;

		// Create parent ticket — use original description if provided, fall back to AI analysis
		const parentTicket = await this.createTicket({
			projectId,
			title: plan.title,
			description: originalDescription || plan.analysis,
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

	/**
	 * Update ticket status by ID
	 * Used by OrchestratorEventHandler to update ticket status after task completion
	 */
	async updateTicketStatusById(ticketId: string, newStatus: TicketStatus): Promise<void> {
		const ticket = await this.ticketsRepository.findById(ticketId);
		if (!ticket) {
			log.warn(`updateTicketStatusById: ticket ${ticketId} not found`);
			return;
		}
		await this.updateTicket(ticketId, { status: newStatus, version: ticket.version });
	}

	/**
	 * Add a comment to a ticket
	 */
	async addComment(ticketId: string, data: CreateTicketComment): Promise<TicketComment> {
		// Verify ticket exists
		const ticket = await this.getTicketById(ticketId);
		const comment = await this.ticketsRepository.addComment(ticketId, data);
		this.eventBroadcaster.broadcast(B2F_TICKET_COMMENT_ADDED, comment);

		// Record comment in history
		await this.ticketsRepository.addHistoryEntry(
			ticketId,
			'ticket.comment_created',
			{
				commentId: comment.id,
				content: comment.content,
				author: comment.author,
			},
			comment.author
		);

		// Emit internal event for flow triggers — all comments including worker-ai
		// (loop prevention is the flow/worker's responsibility, not the event bus)
		this.eventBus?.emit('ticket.comment_created', {
			ticketId,
			projectId: ticket.projectId,
			commentId: comment.id,
			content: comment.content,
			author: comment.author,
		});

		return comment;
	}

	/**
	 * Get all comments for a ticket
	 */
	async getComments(ticketId: string): Promise<TicketCommentsResponse> {
		// Verify ticket exists
		await this.getTicketById(ticketId);
		const comments = await this.ticketsRepository.getComments(ticketId);
		return { comments };
	}

	/**
	 * Get the full audit/event history for a ticket
	 */
	async getHistory(ticketId: string): Promise<TicketHistoryResponse> {
		// Verify ticket exists
		await this.getTicketById(ticketId);
		const entries = await this.ticketsRepository.getHistory(ticketId);
		return { entries };
	}
}
