import type { FlowFeedback, FlowRetrospective } from '@app/shared/api/flow-feedback.contract';

import type { BaseRepository } from './BaseRepository';

/**
 * ===========================================================================================
 * FLOW FEEDBACK REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for flow feedback and retrospectives.
 * Uses two BaseRepository instances:
 * - feedbackBase: stores FlowFeedback entities (collection: 'flow-feedback')
 * - retroBase: stores FlowRetrospective entities (collection: 'flow-retrospectives')
 *
 * Both constructor parameters use BaseRepository<any> (same pattern as FlowProposalsRepository)
 * because FlowFeedback / FlowRetrospective do not extend BaseEntity, making the intersection
 * type unnecessary at the constructor level.
 *
 * ===========================================================================================
 */
export class FlowFeedbackRepository {
	constructor(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private readonly feedbackBase: BaseRepository<any>,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private readonly retroBase: BaseRepository<any>
	) {}

	/**
	 * Persist a new FlowFeedback entry.
	 * The caller is responsible for providing a unique id and submittedAt timestamp.
	 * The storage layer automatically adds version, createdAt, updatedAt.
	 */
	async create(feedback: FlowFeedback): Promise<FlowFeedback> {
		return this.feedbackBase.create(feedback);
	}

	/**
	 * Find all feedback entries for a given ticket.
	 */
	async findByTicketId(ticketId: string): Promise<FlowFeedback[]> {
		return this.feedbackBase.findBy('ticketId', ticketId);
	}

	/**
	 * Find a single feedback entry by ID.
	 * Returns null if not found.
	 */
	async findById(id: string): Promise<FlowFeedback | null> {
		return this.feedbackBase.findById(id);
	}

	/**
	 * Find all feedback entries for a given flow.
	 */
	async findByFlowId(flowId: string): Promise<FlowFeedback[]> {
		return this.feedbackBase.findBy('flowId', flowId);
	}

	/**
	 * Update an existing feedback entry by ID.
	 */
	async update(id: string, data: Partial<FlowFeedback>): Promise<FlowFeedback> {
		return this.feedbackBase.update(id, data);
	}

	/**
	 * Delete a feedback entry by ID.
	 */
	async delete(id: string): Promise<void> {
		await this.feedbackBase.delete(id);
	}

	/**
	 * Persist a new FlowRetrospective entry.
	 * The caller is responsible for providing a unique id and generatedAt timestamp.
	 * The storage layer automatically adds version, createdAt, updatedAt.
	 */
	async createRetrospective(retro: FlowRetrospective): Promise<FlowRetrospective> {
		return this.retroBase.create(retro);
	}

	/**
	 * Find the retrospective for a given ticket (at most one per ticket).
	 * Returns null if not found.
	 */
	async findRetrospectiveByTicketId(ticketId: string): Promise<FlowRetrospective | null> {
		const results = await this.retroBase.findBy('ticketId', ticketId);
		return results[0] ?? null;
	}
}
