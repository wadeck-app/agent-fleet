import type { FlowFeedback, FlowRetrospective } from '@app/shared/api/flow-feedback.contract';
import type { BaseEntity } from '@app/shared/common/base-entity';

import type { BaseRepository } from './BaseRepository';

/**
 * Internal stored types that satisfy BaseEntity constraint (adds version, createdAt, updatedAt).
 * The storage layer auto-generates these fields on create.
 */
type StoredFlowFeedback = FlowFeedback & BaseEntity;
type StoredFlowRetrospective = FlowRetrospective & BaseEntity;

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
 * The StoredFlowFeedback / StoredFlowRetrospective internal types satisfy the
 * BaseEntity constraint required by BaseRepository while keeping the public API
 * in terms of the shared contract types (FlowFeedback / FlowRetrospective).
 *
 * ===========================================================================================
 */
export class FlowFeedbackRepository {
	constructor(
		private readonly feedbackBase: BaseRepository<StoredFlowFeedback>,
		private readonly retroBase: BaseRepository<StoredFlowRetrospective>
	) {}

	/**
	 * Persist a new FlowFeedback entry.
	 * The caller is responsible for providing a unique id and submittedAt timestamp.
	 * The storage layer automatically adds version, createdAt, updatedAt.
	 */
	async create(feedback: FlowFeedback): Promise<FlowFeedback> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const stored = await this.feedbackBase.create(feedback as any);
		return stored;
	}

	/**
	 * Find all feedback entries for a given ticket.
	 */
	async findByTicketId(ticketId: string): Promise<FlowFeedback[]> {
		return this.feedbackBase.findBy('ticketId', ticketId);
	}

	/**
	 * Find all feedback entries for a given flow.
	 */
	async findByFlowId(flowId: string): Promise<FlowFeedback[]> {
		return this.feedbackBase.findBy('flowId', flowId);
	}

	/**
	 * Persist a new FlowRetrospective entry.
	 * The caller is responsible for providing a unique id and generatedAt timestamp.
	 * The storage layer automatically adds version, createdAt, updatedAt.
	 */
	async createRetrospective(retro: FlowRetrospective): Promise<FlowRetrospective> {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const stored = await this.retroBase.create(retro as any);
		return stored;
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
