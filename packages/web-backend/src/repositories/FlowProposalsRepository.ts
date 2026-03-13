import type { FlowProposal } from '@app/shared/api/flow-proposals.contract';
import type { BaseEntity } from '@app/shared/common/base-entity';

import type { BaseRepository } from './BaseRepository';

/**
 * Internal stored type that satisfies BaseEntity constraint.
 * FlowProposal does not extend BaseEntity, so we intersect here.
 */
type StoredFlowProposal = FlowProposal & BaseEntity;

/**
 * ===========================================================================================
 * FLOW PROPOSALS REPOSITORY
 * ===========================================================================================
 *
 * Domain-specific data access for flow proposals.
 * Wraps a BaseRepository<StoredFlowProposal> and exposes domain-oriented methods.
 *
 * ===========================================================================================
 */
export class FlowProposalsRepository {
	constructor(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		private readonly base: BaseRepository<any>
	) {}

	/**
	 * Persist a new FlowProposal.
	 * The caller provides all fields including id and proposedAt.
	 */
	async create(proposal: FlowProposal): Promise<FlowProposal> {
		// BaseEntity.version (optimistic lock) collides with FlowProposal.version (proposal revision).
		// We store the proposal revision separately and restore it after creation.
		const proposalVersion = proposal.version;
		const stored = await this.base.create(proposal as Omit<StoredFlowProposal, keyof BaseEntity>);
		if (proposalVersion !== 1) {
			// Restore the proposal revision (InMemoryStorage always sets version = 1 for new entities)
			const fixed = await this.base.update(stored.id, { version: proposalVersion });
			return fixed as FlowProposal;
		}
		return stored as FlowProposal;
	}

	/**
	 * Find a proposal by ID. Returns null if not found.
	 */
	async findById(id: string): Promise<FlowProposal | null> {
		const found = await this.base.findById(id);
		return found as FlowProposal | null;
	}

	/**
	 * Find all proposals for a given ticket, unsorted.
	 */
	async findByTicketId(ticketId: string): Promise<FlowProposal[]> {
		const results = await this.base.findBy('ticketId', ticketId);
		return results as FlowProposal[];
	}

	/**
	 * Update a proposal by ID.
	 */
	async update(id: string, data: Partial<FlowProposal>): Promise<FlowProposal> {
		const updated = await this.base.update(id, data);
		return updated as FlowProposal;
	}

	/**
	 * Find the most recent non-superseded proposal for a ticket.
	 * "Most recent" is determined by highest version number.
	 * Returns null if no qualifying proposal exists.
	 */
	async findCurrentForTicket(ticketId: string): Promise<FlowProposal | null> {
		const all = await this.findByTicketId(ticketId);
		const active = all.filter(p => p.status !== 'superseded');
		if (active.length === 0) {
			return null;
		}
		// Sort descending by version, return highest
		return active.sort((a, b) => b.version - a.version)[0] ?? null;
	}
}
