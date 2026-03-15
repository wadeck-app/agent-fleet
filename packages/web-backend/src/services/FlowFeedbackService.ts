import { randomUUID } from 'crypto';
import { createLogger } from 'shared-common/logger';

import type {
	CreateFlowFeedback,
	CreateFlowRetrospective,
	FlowFeedback,
	FlowRetrospective,
} from '@app/shared/api/flow-feedback.contract';
import { ERROR_CODES, NotFoundException } from '@app/shared/exceptions/http-exceptions';
import { B2F_TICKET_FEEDBACK_SUBMITTED } from '@app/shared/transport';

import type { FlowFeedbackRepository } from '../repositories/FlowFeedbackRepository';
import type { TicketsRepository } from '../repositories/TicketsRepository';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

const log = createLogger('FlowFeedbackService');

/**
 * ===========================================================================================
 * FLOW FEEDBACK SERVICE
 * ===========================================================================================
 *
 * Business logic for flow feedback and retrospectives.
 *
 * Responsibilities:
 * - Validate ticket existence before writing feedback
 * - Generate IDs and timestamps
 * - Append history entries to the ticket audit trail
 * - Update flowFeedbackId / flowRetrospectiveId on the ticket
 *
 * ===========================================================================================
 */
export class FlowFeedbackService {
	constructor(
		private readonly repository: FlowFeedbackRepository,
		private readonly ticketsRepository: TicketsRepository,
		private readonly eventBroadcaster: EventBroadcaster
	) {}

	/**
	 * Submit human feedback for a completed flow run.
	 *
	 * - Verifies the ticket exists (throws NotFoundException if not)
	 * - Persists the feedback record
	 * - Appends a 'flow.feedback_submitted' history entry on the ticket
	 * - Stores the feedback ID on the ticket for quick access
	 */
	async submitFeedback(ticketId: string, data: CreateFlowFeedback): Promise<FlowFeedback> {
		const ticket = await this.ticketsRepository.findById(ticketId);
		if (!ticket) {
			throw new NotFoundException(`Ticket ${ticketId} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
		}

		const feedback: FlowFeedback = {
			...data,
			id: randomUUID(),
			submittedAt: new Date().toISOString(),
		};

		const created = await this.repository.create(feedback);

		// Append audit history entry with full feedback content for the audit log (item AB fix)
		await this.ticketsRepository.addHistoryEntry(
			ticketId,
			'flow.feedback_submitted',
			{
				feedbackId: created.id,
				flowId: created.flowId,
				rating: created.rating,
				// Surface feedback content so Activity/Audit tabs can display meaningful detail
				wentWell: created.wentWell,
				wentWrong: created.wentWrong,
				suggestions: created.suggestions ?? [],
			},
			// Pass author so the Activity tab can show who submitted (item AA fix)
			created.author
		);

		// Link feedback ID to ticket record
		await this.ticketsRepository.update(ticketId, {
			flowFeedbackId: created.id,
		});

		// Notify subscribers that feedback was submitted for this ticket
		this.eventBroadcaster.broadcast(B2F_TICKET_FEEDBACK_SUBMITTED, {
			ticketId,
			feedbackId: created.id,
			rating: created.rating,
		});

		log.info(`Flow feedback ${created.id} submitted for ticket ${ticketId}`);
		return created;
	}

	/**
	 * Submit an AI-generated retrospective for a completed flow run.
	 *
	 * - Verifies the ticket exists (throws NotFoundException if not)
	 * - Persists the retrospective record
	 * - Appends a 'flow.retrospective_generated' history entry on the ticket
	 * - Stores the retrospective ID on the ticket for quick access
	 */
	async submitRetrospective(ticketId: string, data: CreateFlowRetrospective): Promise<FlowRetrospective> {
		const ticket = await this.ticketsRepository.findById(ticketId);
		if (!ticket) {
			throw new NotFoundException(`Ticket ${ticketId} not found`, ERROR_CODES.RESOURCE_NOT_FOUND);
		}

		const retro: FlowRetrospective = {
			...data,
			id: randomUUID(),
			generatedAt: new Date().toISOString(),
		};

		const created = await this.repository.createRetrospective(retro);

		// Append audit history entry
		await this.ticketsRepository.addHistoryEntry(ticketId, 'flow.retrospective_generated', {
			retroId: created.id,
			flowId: created.flowId,
		});

		// Link retrospective ID to ticket record
		await this.ticketsRepository.update(ticketId, {
			flowRetrospectiveId: created.id,
		});

		log.info(`Flow retrospective ${created.id} generated for ticket ${ticketId}`);
		return created;
	}

	/**
	 * Retrieve all feedback items for a given flow run.
	 */
	async getFeedbackForFlow(flowId: string): Promise<{ items: FlowFeedback[] }> {
		const items = await this.repository.findByFlowId(flowId);
		return { items };
	}

	/**
	 * Retrieve the retrospective for a ticket.
	 * Throws NotFoundException if none exists yet.
	 */
	async getRetrospective(ticketId: string): Promise<FlowRetrospective> {
		const retro = await this.repository.findRetrospectiveByTicketId(ticketId);
		if (!retro) {
			throw new NotFoundException(
				`No retrospective found for ticket ${ticketId}`,
				ERROR_CODES.RESOURCE_NOT_FOUND
			);
		}
		return retro;
	}
}
